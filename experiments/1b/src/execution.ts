import {
  TimelineRunner,
  type BarrierSpan,
  type BlockSnapshot,
  type BlockStartResult,
  type SkipReason,
  type TimelineDefinition,
  type TimelinePhase,
  type TimelineSnapshot,
} from "../../../src/core/execution/timeline-runner.ts";
import type { DurationPlacement, Placement, Track } from "./model";
import {
  blockDurationSeconds,
  isMediaPlacement,
  mediaPhases,
  phaseBlockId,
} from "./model";

export const SKIP_FADE_MS = 150;

type TimelineBlock = TimelineDefinition["tracks"][number]["blocks"][number];

export interface TimelineSessionOptions {
  readonly onSnapshot?: (snapshot: TimelineSnapshot) => void;
  readonly onActivity?: (message: string) => void;
  readonly onFinalize?: (placementId: string) => void;
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
        .flatMap((placement) => placementBlocks(placement)),
    })),
  };
}

function placementBlocks(placement: Placement): TimelineBlock[] {
  if (!isMediaPlacement(placement)) {
    return [
      {
        id: placement.id,
        start: placement.start,
        length: placement.length,
        cooperativeSkip: placement.cooperativeSkip,
      },
    ];
  }
  return mediaPhases(
    placement.fadeIn,
    placement.fadeOut,
    placement.length,
  ).map((phase) => ({
    id: phaseBlockId(placement.id, phase.index),
    start: placement.start + phase.offset,
    length: phase.length,
    cooperativeSkip: placement.cooperativeSkip,
  }));
}

export class TimelineSession {
  private readonly runner: TimelineRunner;
  private readonly unsubscribe: () => void;
  private readonly placementByBlockId: Readonly<Record<string, Placement>>;
  private readonly cleanups = new Map<string, () => void>();
  private readonly dialogueResolvers = new Map<string, () => void>();
  private readonly options: TimelineSessionOptions;
  private readonly bpm: number;
  private lastPhase: TimelinePhase = "idle";

  constructor(
    tracks: readonly Track[],
    placements: readonly Placement[],
    bpm: number,
    options: TimelineSessionOptions = {},
  ) {
    this.options = options;
    this.bpm = bpm;
    const byBlock: Record<string, Placement> = {};
    for (const placement of placements) {
      if (isMediaPlacement(placement)) {
        for (const phase of mediaPhases(
          placement.fadeIn,
          placement.fadeOut,
          placement.length,
        )) {
          byBlock[phaseBlockId(placement.id, phase.index)] = placement;
        }
      } else {
        byBlock[placement.id] = placement;
      }
    }
    this.placementByBlockId = byBlock;
    this.runner = new TimelineRunner(
      toTimelineDefinition(tracks, placements),
      {
        onBlockStart: (block) => this.startBlock(block),
        onBlockTerminate: (block) => this.terminateBlock(block),
      },
    );
    this.unsubscribe = this.runner.subscribe((snapshot) => {
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

  advanceDialogue(blockId: string): void {
    const resolve = this.dialogueResolvers.get(blockId);
    if (resolve === undefined) {
      return;
    }
    this.dialogueResolvers.delete(blockId);
    this.cleanups.delete(blockId);
    this.report(`Dialogue advanced: ${blockId} at t=${this.runner.time}`);
    resolve();
  }

  dispose(): void {
    this.unsubscribe();
    for (const cleanup of this.cleanups.values()) {
      cleanup();
    }
    this.cleanups.clear();
    this.dialogueResolvers.clear();
  }

  private startBlock(block: BlockSnapshot): BlockStartResult {
    const placement = this.placementByBlockId[block.id];
    if (placement.kind === "dialogue") {
      return this.startDialogue(block);
    }
    return this.startDuration(block, placement);
  }

  private startDialogue(block: BlockSnapshot): BlockStartResult {
    let resolveExecution!: () => void;
    const execution = new Promise<void>((resolve) => {
      resolveExecution = resolve;
    });
    this.dialogueResolvers.set(block.id, resolveExecution);
    this.cleanups.set(block.id, () => {
      this.dialogueResolvers.delete(block.id);
    });
    return { execution };
  }

  private startDuration(
    block: BlockSnapshot,
    placement: DurationPlacement,
  ): BlockStartResult {
    const phaseLength = block.end - block.start;
    const share = phaseLength / placement.length;
    const duration = blockDurationSeconds(placement, this.bpm) * 1000 * share;
    let timer: ReturnType<typeof setTimeout>;
    let skipping = false;
    let resolveExecution!: () => void;
    const execution = new Promise<void>((resolve) => {
      resolveExecution = resolve;
    });

    const settle = () => {
      clearTimeout(timer);
      this.cleanups.delete(block.id);
      resolveExecution();
    };

    timer = setTimeout(settle, duration);
    this.cleanups.set(block.id, () => {
      clearTimeout(timer);
    });

    const skip = (reason: SkipReason) => {
      if (skipping) {
        return;
      }
      skipping = true;
      clearTimeout(timer);
      timer = setTimeout(settle, SKIP_FADE_MS);
      this.report(`Skip (${reason}): ${placement.id} at t=${this.runner.time}`);
    };

    return { execution, skip };
  }

  private terminateBlock(block: BlockSnapshot): void {
    const cleanup = this.cleanups.get(block.id);
    if (cleanup !== undefined) {
      cleanup();
    }
    this.cleanups.delete(block.id);
    this.dialogueResolvers.delete(block.id);
    const placement = this.placementByBlockId[block.id];
    if (block.end === placement.start + placement.length) {
      this.options.onFinalize?.(placement.id);
    }
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
