import {
  TimelineRunner,
  type BlockSnapshot,
  type BlockStartResult,
  type SkipReason,
  type TimelineDefinition,
  type TimelinePhase,
  type TimelineSnapshot,
} from "../../../src/core/execution/timeline-runner.ts";
import type { BlockKind, Placement } from "./model";
import { TRACKS } from "./model";

export const SKIP_FADE_MS = 150;

export const KIND_DURATION_MS: Record<Exclude<BlockKind, "dialogue">, number> = {
  camera: 500,
  sound: 350,
  animation: 700,
};

export interface TimelineSessionOptions {
  readonly onSnapshot?: (snapshot: TimelineSnapshot) => void;
  readonly onActivity?: (message: string) => void;
}

export function toTimelineDefinition(
  placements: readonly Placement[],
): TimelineDefinition {
  return {
    tracks: TRACKS.map((track) => ({
      id: track.id,
      blocks: placements
        .filter((placement) => placement.trackId === track.id)
        .map((placement) => ({
          id: placement.id,
          start: placement.start,
          length: placement.length,
          cooperativeSkip: placement.cooperativeSkip,
        })),
    })),
  };
}

export class TimelineSession {
  private readonly runner: TimelineRunner;
  private readonly unsubscribe: () => void;
  private readonly placementsById: ReadonlyMap<string, Placement>;
  private readonly cleanups = new Map<string, () => void>();
  private readonly dialogueResolvers = new Map<string, () => void>();
  private readonly options: TimelineSessionOptions;
  private lastPhase: TimelinePhase = "idle";

  constructor(
    placements: readonly Placement[],
    options: TimelineSessionOptions = {},
  ) {
    this.options = options;
    this.placementsById = new Map(
      placements.map((placement) => [placement.id, placement]),
    );
    this.runner = new TimelineRunner(toTimelineDefinition(placements), {
      onBlockStart: (block) => this.startBlock(block),
      onBlockTerminate: (block) => this.terminateBlock(block),
    });
    this.unsubscribe = this.runner.subscribe((snapshot) => {
      this.trackPhase(snapshot);
      this.options.onSnapshot?.(snapshot);
    });
  }

  get snapshot(): TimelineSnapshot {
    return this.runner.snapshot();
  }

  start(): void {
    this.runner.start();
  }

  requestSkip(): void {
    this.runner.requestSkip();
  }

  advanceDialogue(blockId: string): void {
    const placement = this.placementsById.get(blockId);
    const resolve = this.dialogueResolvers.get(blockId);
    if (placement?.kind !== "dialogue" || resolve === undefined) {
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

  private startBlock(block: BlockSnapshot): BlockStartResult | undefined {
    const placement = this.placementsById.get(block.id);
    if (placement === undefined) {
      return undefined;
    }
    if (placement.kind === "dialogue") {
      return this.startDialogue(block);
    }
    return this.startTimed(block, placement.kind, placement);
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

  private startTimed(
    block: BlockSnapshot,
    kind: Exclude<BlockKind, "dialogue">,
    placement: Placement,
  ): BlockStartResult {
    const duration = KIND_DURATION_MS[kind] * placement.length;
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    let skipping = false;
    let resolveExecution!: () => void;
    const execution = new Promise<void>((resolve) => {
      resolveExecution = resolve;
    });

    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      this.cleanups.delete(block.id);
      resolveExecution();
    };

    timer = setTimeout(settle, duration);
    this.cleanups.set(block.id, () => {
      clearTimeout(timer);
    });

    const skip = (reason: SkipReason) => {
      if (settled || skipping) {
        return;
      }
      skipping = true;
      clearTimeout(timer);
      timer = setTimeout(settle, SKIP_FADE_MS);
      this.report(`Skip (${reason}): ${block.id} at t=${this.runner.time}`);
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
