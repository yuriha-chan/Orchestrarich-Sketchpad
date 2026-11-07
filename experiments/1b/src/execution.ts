import {
  TimelineRunner,
  type BarrierSpan,
  type BlockSnapshot,
  type BlockStartResult,
  type TimelineDefinition,
  type TimelinePhase,
  type TimelineSnapshot,
} from "../../../src/core/execution/timeline-runner.ts";
import type { Placement, Track } from "./model";
import { compilePlacement, definitionBlocks, type ExecutionDefinition } from "./execution-definition";
import type { StageActions } from "./stage-state";

import { createExecution, type ExecutionInstance } from "./block-execution";
export { SKIP_FADE_MS, type ExecutionInstance } from "./block-execution";

export interface TimelineSessionOptions {
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

export class TimelineSession {
  private readonly runner: TimelineRunner;
  private readonly unsubscribe: () => void;
  private readonly definitionByBlockId: Readonly<Record<string, ExecutionDefinition>>;
  private readonly activeExecutions = new Map<ExecutionDefinition, ExecutionInstance>();
  private readonly options: TimelineSessionOptions;
  private readonly bpm: number;
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
        onBlockStart: (block) => this.startBlock(block),
        onBlockTerminate: (block) => this.terminateBlock(block),
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

  private startBlock(block: BlockSnapshot): BlockStartResult {
    const definition = this.definitionByBlockId[block.id];
    const placement = definition.placement;
    if (block.start === placement.start) {
      const instance = createExecution(
        definition,
        { bpm: this.bpm, stage: this.stage, report: (message) => this.report(message), time: () => this.runner.time },
      );
      this.activeExecutions.set(definition, instance);
      this.options.onExecutionStart?.(instance);
    }
    return this.activeExecutions.get(definition)!.startPhase(block);
  }

  private terminateBlock(block: BlockSnapshot): void {
    const definition = this.definitionByBlockId[block.id];
    const placement = definition.placement;
    const instance = this.activeExecutions.get(definition)!;
    instance.terminatePhase(block);
    if (block.end === placement.start + placement.length) {
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
