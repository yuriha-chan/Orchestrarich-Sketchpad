import {
  TimelineRunner,
  type BarrierSpan,
  type BlockOutputs,
  type BlockSnapshot,
  type BlockStartResult,
  type LoopDefinition,
  type TimelineDefinition,
  type TimelinePhase,
  type TimelineSnapshot,
} from "../core/execution/timeline-runner.ts";
import {
  initializationPathKey,
  validateNumericSlotReads,
  validateNumericSlotWrites,
  type NumericSlot,
  type NumericSlotRead,
  type NumericSlotWrite,
} from "../core/slots/numeric-slots.ts";
import { type Placement, type Track } from "./model";
import { blockDefinition, boundSlotProperties } from "./builtin-blocks";
import { boundaryGapPaths, type LoopNode } from "./loops";
import { liveNumericSlots } from "./slot-gaps";
import { compilePlacement, definitionBlocks, type ExecutionDefinition } from "./execution-definition";
import type { StageActions } from "./stage-state";

import { type ExecutionInstance } from "./block-runtime";
export { SKIP_FADE_MS, type ExecutionInstance } from "./block-runtime";

export interface TimelineSessionOptions {
  readonly slots?: readonly NumericSlot[];
  readonly onSnapshot?: (snapshot: TimelineSnapshot) => void;
  readonly onActivity?: (message: string) => void;
  readonly onExecutionStart?: (instance: ExecutionInstance) => void;
  readonly onFinalize?: (instance: ExecutionInstance) => void;
}

export const LOOP_ITERATIONS = 3;

function toLoopDefinition(loop: LoopNode): LoopDefinition {
  return {
    start: loop.start,
    end: loop.end,
    iterations: LOOP_ITERATIONS,
    loops: loop.children.map(toLoopDefinition),
  };
}

export function toTimelineDefinition(
  tracks: readonly Track[],
  placements: readonly Placement[],
  loops: readonly LoopNode[],
): TimelineDefinition {
  return {
    tracks: tracks.map((track) => ({
      id: track.id,
      blocks: placements
        .filter((placement) => placement.trackId === track.id)
        .flatMap((placement) => definitionBlocks(compilePlacement(placement))),
    })),
    loops: loops.map(toLoopDefinition),
  };
}

export function slotReads(placements: readonly Placement[]): NumericSlotRead[] {
  return placements.flatMap((placement) =>
    boundSlotProperties(placement, "input").map(({ slotId }) => ({
      slotId,
      trackId: placement.trackId,
      time: placement.start,
    })),
  );
}

export function slotWrites(
  placements: readonly Placement[],
): NumericSlotWrite[] {
  return placements.flatMap((placement) =>
    boundSlotProperties(placement, "output").map(({ slotId }) => ({
      slotId,
      trackId: placement.trackId,
      time: placement.start + placement.length,
    })),
  );
}

export class TimelineSession {
  private readonly runner: TimelineRunner;
  private readonly unsubscribe: () => void;
  private readonly definitionByBlockId: Readonly<Record<string, ExecutionDefinition>>;
  private readonly activeExecutions = new Map<ExecutionDefinition, ExecutionInstance>();
  private readonly options: TimelineSessionOptions;
  private readonly bpm: number;
  private readonly placements: readonly Placement[];
  private readonly loops: readonly LoopNode[];
  private readonly slots: readonly NumericSlot[];
  private readonly loopPaths: ReadonlyMap<LoopDefinition, readonly string[]>;
  private readonly runtimeSlots = new Map<string, number>();
  private skipInitializationTime: number | undefined;
  private lastPhase: TimelinePhase = "idle";

  constructor(
    tracks: readonly Track[],
    placements: readonly Placement[],
    loops: readonly LoopNode[],
    bpm: number,
    private readonly stage: StageActions,
    options: TimelineSessionOptions = {},
  ) {
    this.options = options;
    this.bpm = bpm;
    this.placements = placements;
    this.loops = loops;
    this.slots = liveNumericSlots(options.slots ?? [], loops);
    const loopPaths = new Map<LoopDefinition, readonly string[]>();
    const toLoop = (
      node: LoopNode,
      ancestors: readonly string[],
    ): LoopDefinition => {
      const path = [...ancestors, node.id];
      const definition: LoopDefinition = {
        start: node.start,
        end: node.end,
        iterations: LOOP_ITERATIONS,
        loops: node.children.map((child) => toLoop(child, path)),
      };
      loopPaths.set(definition, path);
      return definition;
    };
    const coreLoops = loops.map((node) => toLoop(node, []));
    this.loopPaths = loopPaths;
    const definitions = placements.map(compilePlacement);
    const byBlock: Record<string, ExecutionDefinition> = {};
    for (const definition of definitions) {
      for (const block of definitionBlocks(definition)) {
        byBlock[block.id] = definition;
      }
    }
    this.definitionByBlockId = byBlock;
    this.runner = new TimelineRunner(
      {
        tracks: tracks.map((track) => ({
          id: track.id,
          blocks: definitions
            .filter(({ placement }) => placement.trackId === track.id)
            .flatMap(definitionBlocks),
        })),
        loops: coreLoops,
      },
      {
        onTimeStart: (time) => this.applyTimeStart(time),
        onLoopRepeat: (loop, endTime, startTime) =>
          this.applyLoopRepeat(loop, endTime, startTime),
        onBlockStart: (block) => this.startBlock(block),
        onBlockTerminate: (block, outputs) =>
          this.terminateBlock(block, outputs),
      },
    );
    this.unsubscribe = this.runner.subscribe((snapshot) => {
      if (snapshot.phase === "failed") {
        for (const instance of this.activeExecutions.values()) {
          this.finalizeInstance(instance);
        }
        this.activeExecutions.clear();
      }
      this.trackPhase(snapshot);
      this.options.onSnapshot?.(snapshot);
    });
  }

  get snapshot(): TimelineSnapshot {
    return this.runner.snapshot();
  }

  barrierSpan(time: number): BarrierSpan {
    return this.runner.barrierSpan(time);
  }

  start(): void {
    const slots = this.slots;
    const writes = slotWrites(this.placements);
    const invalidWrites = validateNumericSlotWrites(slots, writes);
    if (invalidWrites.length > 0) {
      const details = invalidWrites
        .map((write) => `${write.slotId}@${write.time}`)
        .join(", ");
      throw new Error(`Invalid numeric slot writes: ${details}`);
    }
    const invalidReads = validateNumericSlotReads(
      slots,
      slotReads(this.placements),
      writes,
    );
    if (invalidReads.length > 0) {
      const details = invalidReads
        .map((read) => `${read.slotId}@${read.time}`)
        .join(", ");
      throw new Error(`Invalid numeric slot reads: ${details}`);
    }
    this.runner.start();
  }

  requestSkip(): void {
    this.runner.requestSkip();
  }

  dispose(): void {
    this.unsubscribe();
    for (const instance of this.activeExecutions.values()) {
      this.finalizeInstance(instance);
    }
    this.activeExecutions.clear();
  }

  private applyTimeStart(time: number): void {
    if (this.skipInitializationTime === time) {
      this.skipInitializationTime = undefined;
      return;
    }
    for (const context of boundaryGapPaths(this.loops, time)) {
      this.applyContext(time, context);
    }
  }

  private applyLoopRepeat(
    loop: LoopDefinition,
    endTime: number,
    startTime: number,
  ): void {
    const path = this.loopPaths.get(loop)!;
    const parentKey = initializationPathKey(path.slice(0, -1));
    const endContexts = boundaryGapPaths(this.loops, endTime);
    const endIndex = endContexts.findIndex(
      (context) => initializationPathKey(context) === parentKey,
    );
    if (endIndex < 0) {
      throw new Error("Loop parent context is missing at the loop end");
    }
    for (const context of endContexts.slice(0, endIndex)) {
      this.applyContext(endTime, context);
    }
    const startContexts = boundaryGapPaths(this.loops, startTime);
    const startIndex = startContexts.findIndex(
      (context) => initializationPathKey(context) === parentKey,
    );
    if (startIndex < 0) {
      throw new Error("Loop parent context is missing at the loop start");
    }
    for (const context of startContexts.slice(startIndex + 1)) {
      this.applyContext(startTime, context);
    }
    this.skipInitializationTime = startTime;
  }

  private applyContext(boundary: number, path: readonly string[]): void {
    const key = initializationPathKey(path);
    for (const slot of this.slots) {
      const initialization = slot.initializations.find(
        (candidate) =>
          candidate.boundary === boundary &&
          initializationPathKey(candidate.path) === key,
      );
      if (initialization !== undefined) {
        this.runtimeSlots.set(slot.id, initialization.value);
      }
    }
  }

  private readRuntimeSlot(slotId: string): number {
    const value = this.runtimeSlots.get(slotId);
    if (value === undefined) {
      throw new Error(`Numeric slot "${slotId}" has no runtime value`);
    }
    return value;
  }

  private startBlock(block: BlockSnapshot): BlockStartResult {
    const definition = this.definitionByBlockId[block.id];
    const placement = definition.placement;
    if (block.start === placement.start) {
      const instance = blockDefinition(placement.kind).createExecution(
        {
          bpm: this.bpm,
          stage: this.stage,
          report: (message) => this.report(message),
          time: () => this.runner.time,
          readSlot: (slotId) => this.readRuntimeSlot(slotId),
        },
        placement,
      );
      this.activeExecutions.set(definition, instance);
      this.options.onExecutionStart?.(instance);
    }
    return this.activeExecutions.get(definition)!.startPhase(block);
  }

  private terminateBlock(block: BlockSnapshot, outputs: BlockOutputs): void {
    const definition = this.definitionByBlockId[block.id];
    const placement = definition.placement;
    const instance = this.activeExecutions.get(definition)!;
    instance.terminatePhase(block);
    if (block.end === placement.start + placement.length) {
      if (block.state === "completed") {
        for (const { key, slotId } of boundSlotProperties(placement, "output")) {
          this.runtimeSlots.set(slotId, outputs[key]);
        }
      }
      this.activeExecutions.delete(definition);
      this.finalizeInstance(instance);
    }
  }

  private finalizeInstance(instance: ExecutionInstance): void {
    instance.terminate();
    this.options.onFinalize?.(instance);
  }

  private trackPhase(snapshot: TimelineSnapshot): void {
    if (snapshot.phase === this.lastPhase) {
      return;
    }
    this.lastPhase = snapshot.phase;
    if (snapshot.phase === "finished") {
      this.report(`Timeline finished at t=${snapshot.time}`);
    } else if (snapshot.phase === "failed") {
      this.report(`Timeline failed at t=${snapshot.time}`);
    }
  }

  private report(message: string): void {
    this.options.onActivity?.(message);
  }
}
