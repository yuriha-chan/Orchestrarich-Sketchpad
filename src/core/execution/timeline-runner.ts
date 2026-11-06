export type BlockState = "pending" | "running" | "completed" | "failed";

export type TimelinePhase = "idle" | "running" | "failed" | "finished";

export type SkipReason = "user" | "cooperative";

export interface BlockDefinition {
  readonly id: string;
  readonly start: number;
  readonly length: number;
  readonly cooperativeSkip?: boolean;
}

export interface TrackDefinition {
  readonly id: string;
  readonly blocks: readonly BlockDefinition[];
}

export interface TimelineDefinition {
  readonly tracks: readonly TrackDefinition[];
}

export interface BlockSnapshot {
  readonly id: string;
  readonly trackId: string;
  readonly start: number;
  readonly end: number;
  readonly state: BlockState;
  readonly cooperativeSkip: boolean;
}

export interface TimelineSnapshot {
  readonly time: number;
  readonly phase: TimelinePhase;
  readonly blocks: readonly BlockSnapshot[];
  readonly blockingBlockIds: readonly string[];
}

export type SkipHandler = (
  reason: SkipReason,
) => void | Promise<void>;

export interface BlockStartResult {
  readonly execution: Promise<void>;
  readonly skip?: SkipHandler;
}

export interface TimelineRunnerOptions {
  readonly onBlockStart?: (
    block: BlockSnapshot,
  ) => BlockStartResult | undefined;
  readonly onBlockTerminate?: (block: BlockSnapshot) => void;
}

interface Placement {
  readonly id: string;
  readonly trackId: string;
  readonly start: number;
  readonly end: number;
  readonly cooperativeSkip: boolean;
}

function flattenAndValidate(definition: TimelineDefinition): Placement[] {
  const trackIds = new Set<string>();
  const blockIds = new Set<string>();
  const placements: Placement[] = [];

  for (const track of definition.tracks) {
    if (trackIds.has(track.id)) {
      throw new Error(`Duplicate track id: ${track.id}`);
    }
    trackIds.add(track.id);

    const blocks = [...track.blocks].sort((a, b) => a.start - b.start);
    let previousEnd: number | undefined;

    for (const block of blocks) {
      const length = block.length;

      if (!Number.isInteger(block.start) || block.start < 0) {
        throw new Error(`Block ${block.id} has an invalid start: ${block.start}`);
      }
      if (!Number.isInteger(length) || length < 1) {
        throw new Error(`Block ${block.id} has an invalid length: ${length}`);
      }
      if (blockIds.has(block.id)) {
        throw new Error(`Duplicate block id: ${block.id}`);
      }

      const end = block.start + length;
      if (previousEnd !== undefined && block.start < previousEnd) {
        throw new Error(`Blocks overlap in track ${track.id} at cell ${block.start}`);
      }

      blockIds.add(block.id);
      previousEnd = end;
      placements.push({
        id: block.id,
        trackId: track.id,
        start: block.start,
        end,
        cooperativeSkip: block.cooperativeSkip === true,
      });
    }
  }

  return placements;
}

export class TimelineRunner {
  private readonly placements: readonly Placement[];
  private readonly states = new Map<string, BlockState>();
  private readonly options: TimelineRunnerOptions;
  private readonly listeners = new Set<(snapshot: TimelineSnapshot) => void>();
  private readonly skipHandlers = new Map<string, SkipHandler>();
  private readonly autoSkipFired = new Set<string>();
  private readonly terminated = new Set<string>();
  private readonly horizon: number;

  private currentTime = 0;
  private currentPhase: TimelinePhase = "idle";
  private pumping = false;

  constructor(
    definition: TimelineDefinition,
    options: TimelineRunnerOptions = {},
  ) {
    this.options = options;
    this.placements = flattenAndValidate(definition);
    this.horizon = this.placements.reduce(
      (max, placement) => Math.max(max, placement.end),
      0,
    );

    for (const placement of this.placements) {
      this.states.set(placement.id, "pending");
    }
  }

  get time(): number {
    return this.currentTime;
  }

  get phase(): TimelinePhase {
    return this.currentPhase;
  }

  start(): void {
    if (this.currentPhase !== "idle") {
      throw new Error(`Timeline cannot start in phase "${this.currentPhase}"`);
    }

    this.currentPhase = "running";
    this.pump();
  }

  requestSkip(): void {
    for (const placement of this.runningPlacements()) {
      if (this.currentPhase !== "running") {
        break;
      }
      if (this.states.get(placement.id) !== "running") {
        continue;
      }
      this.deliverSkip(placement, "user");
    }
  }

  blockingBlocks(): readonly BlockSnapshot[] {
    return this.blockingPlacements().map((placement) =>
      this.toBlockSnapshot(placement),
    );
  }

  snapshot(): TimelineSnapshot {
    return {
      time: this.currentTime,
      phase: this.currentPhase,
      blocks: this.placements.map((placement) =>
        this.toBlockSnapshot(placement),
      ),
      blockingBlockIds: this.blockingPlacements().map(
        (placement) => placement.id,
      ),
    };
  }

  subscribe(listener: (snapshot: TimelineSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private runningPlacements(): readonly Placement[] {
    if (this.currentPhase !== "running") {
      return [];
    }

    return this.placements.filter(
      (placement) => this.states.get(placement.id) === "running",
    );
  }

  private blockingPlacements(): readonly Placement[] {
    if (this.currentPhase !== "running") {
      return [];
    }

    return this.placements.filter(
      (placement) =>
        placement.end === this.currentTime + 1 &&
        this.states.get(placement.id) === "running",
    );
  }

  private invokeBlockStart(placement: Placement): void {
    let result: BlockStartResult | undefined;
    try {
      result = this.options.onBlockStart?.(this.toBlockSnapshot(placement));
    } catch {
      this.failBlock(placement.id);
      return;
    }
    if (result === undefined) {
      return;
    }
    if (result.skip !== undefined) {
      this.skipHandlers.set(placement.id, result.skip);
    }
    result.execution.then(
      () => this.completeBlock(placement.id),
      () => this.failBlock(placement.id),
    );
  }

  private deliverSkip(placement: Placement, reason: SkipReason): void {
    const handler = this.skipHandlers.get(placement.id);
    if (handler === undefined) {
      return;
    }
    let result: void | Promise<void>;
    try {
      result = handler(reason);
    } catch {
      this.failBlock(placement.id);
      return;
    }
    if (result !== undefined) {
      Promise.resolve(result).catch(() => this.failBlock(placement.id));
    }
  }

  private completeBlock(blockId: string): void {
    if (this.currentPhase !== "running") {
      return;
    }
    if (this.states.get(blockId) !== "running") {
      return;
    }
    this.states.set(blockId, "completed");
    this.skipHandlers.delete(blockId);
    this.pump();
  }

  private failBlock(blockId: string): void {
    if (this.currentPhase !== "running") {
      return;
    }
    if (this.states.get(blockId) !== "running") {
      return;
    }
    this.states.set(blockId, "failed");
    this.currentPhase = "failed";
    this.skipHandlers.clear();
    this.terminateRunning();

    if (!this.pumping) {
      this.notify();
    }
  }

  private autoSkipIfCooperative(): void {
    let firedAny = true;

    while (firedAny && this.currentPhase === "running") {
      firedAny = false;

      for (const placement of this.placements) {
        if (this.currentPhase !== "running") {
          break;
        }
        if (this.states.get(placement.id) !== "running") {
          continue;
        }
        if (!placement.cooperativeSkip) {
          continue;
        }
        if (this.autoSkipFired.has(placement.id)) {
          continue;
        }
        if (!this.onlyCooperativeBlocksRemainUntil(placement.end)) {
          continue;
        }

        this.autoSkipFired.add(placement.id);
        this.deliverSkip(placement, "cooperative");
        firedAny = true;
        break;
      }
    }
  }

  private onlyCooperativeBlocksRemainUntil(end: number): boolean {
    return this.placements.every(
      (placement) =>
        placement.end > end ||
        this.states.get(placement.id) === "completed" ||
        placement.cooperativeSkip,
    );
  }

  private terminateEndingAt(end: number): void {
    for (const placement of this.placements) {
      if (placement.end !== end || this.terminated.has(placement.id)) {
        continue;
      }
      this.terminated.add(placement.id);
      this.options.onBlockTerminate?.(this.toBlockSnapshot(placement));
    }
  }

  private terminateRunning(): void {
    for (const placement of this.placements) {
      const state = this.states.get(placement.id);
      if (
        (state !== "running" && state !== "failed") ||
        this.terminated.has(placement.id)
      ) {
        continue;
      }
      this.terminated.add(placement.id);
      this.skipHandlers.delete(placement.id);
      this.options.onBlockTerminate?.(this.toBlockSnapshot(placement));
    }
  }

  private pump(): void {
    if (this.pumping) {
      return;
    }

    this.pumping = true;
    try {
      while (this.currentPhase === "running") {
        const due = this.placements.filter(
          (placement) =>
            placement.start === this.currentTime &&
            this.states.get(placement.id) === "pending",
        );

        for (const placement of due) {
          this.states.set(placement.id, "running");
        }
        for (const placement of due) {
          if (this.currentPhase !== "running") {
            break;
          }
          this.invokeBlockStart(placement);
        }

        if (this.currentPhase !== "running") {
          break;
        }

        this.autoSkipIfCooperative();

        if (this.currentPhase !== "running") {
          break;
        }
        if (this.currentTime >= this.horizon) {
          this.currentPhase = "finished";
          break;
        }
        if (this.blockingPlacements().length > 0) {
          break;
        }

        this.terminateEndingAt(this.currentTime + 1);

        if (this.currentPhase !== "running") {
          break;
        }
        this.currentTime += 1;
      }
    } finally {
      this.pumping = false;
      this.notify();
    }
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const listener of [...this.listeners]) {
      listener(snapshot);
    }
  }

  private toBlockSnapshot(placement: Placement): BlockSnapshot {
    return {
      id: placement.id,
      trackId: placement.trackId,
      start: placement.start,
      end: placement.end,
      state: this.states.get(placement.id) ?? "pending",
      cooperativeSkip: placement.cooperativeSkip,
    };
  }
}
