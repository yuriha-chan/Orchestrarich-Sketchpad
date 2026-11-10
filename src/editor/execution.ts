import {
  TimelineRunner,
  type BarrierSpan,
  type BlockOutputs,
  type BlockSnapshot,
  type BlockStartResult,
  type TimelineDefinition,
  type TimelinePhase,
  type TimelineSnapshot,
} from "../core/execution/timeline-runner.ts";
import {
  validateNumericSlotReads,
  validateNumericSlotWrites,
  type NumericSlot,
  type NumericSlotRead,
  type NumericSlotWrite,
} from "../core/slots/numeric-slots.ts";
import {
  boundSlotProperties,
  type Placement,
  type Track,
} from "./model";
import { compilePlacement, definitionBlocks, type ExecutionDefinition } from "./execution-definition";
import type { StageActions } from "./stage-state";

import { createExecution, type ExecutionInstance } from "./block-execution";
export { SKIP_FADE_MS, type ExecutionInstance } from "./block-execution";

export interface TimelineSessionOptions {
  readonly slots?: readonly NumericSlot[];
  readonly onSnapshot?: (snapshot: TimelineSnapshot) => void;
  readonly onActivity?: (message: string) => void;
  readonly onExecutionStart?: (instance: ExecutionInstance) => void;
  readonly onFinalize?: (instance: ExecutionInstance) => void;
}

export function toTimelineDefinition(
  tracks: readonly Track[],
  placements: readonly Placement[],
): TimelineDefinition {
  return {
    tracks: tracks.map((track) => ({
      id: track.id,
      blocks: placements
        .filter((placement) => placement.trackId === track.id)
        .flatMap((placement) => definitionBlocks(compilePlacement(placement))),
    })),
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
  private readonly runtimeSlots = new Map<string, number>();
  private lastPhase: TimelinePhase = "idle";

  constructor(
    tracks: readonly Track[],
    placements: readonly Placement[],
    bpm: number,
    private readonly stage: StageActions,
    options: TimelineSessionOptions = {},
  ) {
    this.options = options;
    this.bpm = bpm;
    this.placements = placements;
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
      },
      {
        onTimeStart: (time) => this.applyTimeStart(time),
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
    const slots = this.options.slots ?? [];
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
    for (const slot of this.options.slots ?? []) {
      const initialization = slot.initializations.find(
        (candidate) => candidate.time === time,
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
      const instance = createExecution(
        definition,
        {
          bpm: this.bpm,
          stage: this.stage,
          report: (message) => this.report(message),
          time: () => this.runner.time,
          readNumericSlot: (slotId) => this.readRuntimeSlot(slotId),
        },
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
