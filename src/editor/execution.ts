import {
  TimelineRunner,
  validateBlockLoopSpan,
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
import { allLoops, type LoopNode } from "./loops";
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

type ExecutionAllocation =
  | { readonly state: "allocating"; readonly instance?: never }
  | { readonly state: "active"; readonly instance: ExecutionInstance };

interface CompiledBlock {
  readonly definition: ExecutionDefinition;
  readonly first: boolean;
  readonly last: boolean;
}

function compileTimeline(
  tracks: readonly Track[],
  placements: readonly Placement[],
  loops: readonly LoopNode[],
): {
  readonly timeline: TimelineDefinition;
  readonly definitionByBlockId: Readonly<Record<string, CompiledBlock>>;
  readonly loopIds: ReadonlyMap<LoopDefinition, string>;
} {
  const regions = allLoops(loops);
  for (const placement of placements) {
    validateBlockLoopSpan({
      id: placement.id,
      start: placement.start,
      end: placement.start + placement.length,
    }, regions);
  }
  const loopIds = new Map<LoopDefinition, string>();
  const toLoop = (node: LoopNode): LoopDefinition => {
    const definition: LoopDefinition = {
      start: node.start,
      end: node.end,
      iterations: LOOP_ITERATIONS,
      loops: node.children.map(toLoop),
    };
    loopIds.set(definition, node.id);
    return definition;
  };
  const definitions = placements.map(compilePlacement);
  const byBlock: Record<string, CompiledBlock> = {};
  const timeline: TimelineDefinition = {
    tracks: tracks.map((track) => ({
      id: track.id,
      blocks: definitions
        .filter(({ placement }) => placement.trackId === track.id)
        .flatMap((definition) => definitionBlocks(definition).map((block, index, blocks) => {
          byBlock[block.id] = { definition, first: index === 0, last: index === blocks.length - 1 };
          return block;
        })),
    })),
    loops: loops.map(toLoop),
  };
  return { timeline, definitionByBlockId: byBlock, loopIds };
}

export function toTimelineDefinition(
  tracks: readonly Track[],
  placements: readonly Placement[],
  loops: readonly LoopNode[],
): TimelineDefinition {
  return compileTimeline(tracks, placements, loops).timeline;
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
  private readonly definitionByBlockId: Readonly<Record<string, CompiledBlock>>;
  private readonly activeExecutions = new Map<ExecutionDefinition, ExecutionAllocation>();
  private readonly options: TimelineSessionOptions;
  private readonly bpm: number;
  private readonly placements: readonly Placement[];
  private readonly slots: readonly NumericSlot[];
  private readonly loopIds: ReadonlyMap<LoopDefinition, string>;
  private readonly runtimeSlots = new Map<string, number>();
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
    this.slots = liveNumericSlots(options.slots ?? [], loops);
    const compiled = compileTimeline(tracks, placements, loops);
    this.loopIds = compiled.loopIds;
    this.definitionByBlockId = compiled.definitionByBlockId;
    this.runner = new TimelineRunner(
      compiled.timeline,
      {
        onGapVisit: (time, path) =>
          this.applyContext(time, path.map((loop) => this.loopIds.get(loop)!)),
        onBlockStart: (block) => this.startBlock(block),
        onBlockTerminate: (block, outputs) =>
          this.terminateBlock(block, outputs),
      },
    );
    this.unsubscribe = this.runner.subscribe((snapshot) => {
      if (snapshot.phase === "failed") {
        for (const allocation of this.activeExecutions.values()) {
          if (allocation.state === "active") {
            this.finalizeInstance(allocation.instance);
          }
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
    this.runner.dispose();
    this.unsubscribe();
    for (const allocation of this.activeExecutions.values()) {
      if (allocation.state === "active") {
        this.finalizeInstance(allocation.instance);
      }
    }
    this.activeExecutions.clear();
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

  private startBlock(block: BlockSnapshot): BlockStartResult | undefined {
    const { definition, first } = this.definitionByBlockId[block.id];
    const placement = definition.placement;
    if (first) {
      this.activeExecutions.set(definition, { state: "allocating" });
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
      this.activeExecutions.set(definition, { state: "active", instance });
      this.options.onExecutionStart?.(instance);
      if (this.runner.isDisposed) return;
      return instance.startPhase(block);
    }
    const allocation = this.activeExecutions.get(definition)!;
    return allocation.instance!.startPhase(block);
  }

  private terminateBlock(block: BlockSnapshot, outputs: BlockOutputs): void {
    const { definition, last } = this.definitionByBlockId[block.id];
    const placement = definition.placement;
    const allocation = this.activeExecutions.get(definition)!;
    if (allocation.state === "allocating") {
      this.activeExecutions.delete(definition);
      return;
    }
    const instance = allocation.instance;
    instance.terminatePhase(block);
    if (last) {
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
