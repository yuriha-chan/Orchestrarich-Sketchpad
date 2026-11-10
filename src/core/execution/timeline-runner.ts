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

export interface BarrierSpan {
  readonly start: number;
  readonly end: number;
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
  readonly onTimeStart?: (time: number) => void;
  readonly onBlockStart?: (
    block: BlockSnapshot,
  ) => BlockStartResult | undefined;
  readonly onBlockTerminate?: (block: BlockSnapshot) => void;
}

interface BlockExecution {
  readonly id: string;
  readonly trackId: string;
  readonly start: number;
  readonly end: number;
  readonly cooperativeSkip: boolean;
  state: BlockState;
  autoSkipFired: boolean;
  skipHandler?: SkipHandler;
}

function flattenAndValidate(definition: TimelineDefinition): BlockExecution[] {
  const trackIds = new Set<string>();
  const blockIds = new Set<string>();
  const placements: BlockExecution[] = [];

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
        cooperativeSkip: block.cooperativeSkip ?? false,
        state: "pending",
        autoSkipFired: false,
      });
    }
  }

  return placements;
}

export class TimelineRunner {
  private readonly placements: readonly BlockExecution[];
  private readonly options: TimelineRunnerOptions;
  private readonly listeners = new Set<(snapshot: TimelineSnapshot) => void>();
  private readonly horizon: number;
  private readonly barrierCheckTimes: readonly number[];

  private currentTime = 0;
  private currentPhase: TimelinePhase = "idle";
  private pumping = false;
  private lastTimeStart: number | undefined;

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
    this.barrierCheckTimes = [
      ...new Set(this.placements.map((placement) => placement.end)),
    ].sort((a, b) => a - b);
  }

  get time(): number {
    return this.currentTime;
  }

  get phase(): TimelinePhase {
    return this.currentPhase;
  }

  barrierSpan(time: number = this.currentTime): BarrierSpan {
    let start = 0;
    let end = 0;

    for (const checkTime of this.barrierCheckTimes) {
      if (checkTime <= time) {
        start = checkTime;
      } else {
        end = checkTime;
        break;
      }
    }

    return { start, end: end > start ? end : start };
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

  private runningPlacements(): readonly BlockExecution[] {
    if (this.currentPhase !== "running") {
      return [];
    }

    return this.placements.filter(
      (placement) => placement.state === "running",
    );
  }

  private blockingPlacements(): readonly BlockExecution[] {
    if (this.currentPhase !== "running") {
      return [];
    }

    return this.placements.filter(
      (placement) =>
        placement.end === this.currentTime + 1 &&
        placement.state === "running",
    );
  }

  private invokeBlockStart(placement: BlockExecution): void {
    let result: BlockStartResult | undefined;
    try {
      result = this.options.onBlockStart?.(this.toBlockSnapshot(placement));
    } catch {
      this.failBlock(placement);
      return;
    }
    if (result === undefined) {
      return;
    }
    placement.skipHandler = result.skip;
    result.execution.then(
      () => this.completeBlock(placement),
      () => this.failBlock(placement),
    );
  }

  private deliverSkip(placement: BlockExecution, reason: SkipReason): void {
    const handler = placement.skipHandler;
    if (handler === undefined) {
      return;
    }
    let result: void | Promise<void>;
    try {
      result = handler(reason);
    } catch {
      this.failBlock(placement);
      return;
    }
    if (result !== undefined) {
      Promise.resolve(result).catch(() => this.failBlock(placement));
    }
  }

  private completeBlock(placement: BlockExecution): void {
    if (this.currentPhase !== "running") {
      return;
    }
    if (placement.state !== "running") {
      return;
    }
    placement.state = "completed";
    placement.skipHandler = undefined;
    this.pump();
  }

  private failBlock(placement: BlockExecution): void {
    if (this.currentPhase !== "running") {
      return;
    }
    if (placement.state !== "running") {
      return;
    }
    placement.state = "failed";
    this.currentPhase = "failed";
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
        if (placement.state !== "running") {
          continue;
        }
        if (!placement.cooperativeSkip) {
          continue;
        }
        if (placement.autoSkipFired) {
          continue;
        }
        if (!this.onlyCooperativeBlocksRemainUntil(placement.end)) {
          continue;
        }

        placement.autoSkipFired = true;
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
        placement.state === "completed" ||
        placement.cooperativeSkip,
    );
  }

  private terminateEndingAt(end: number): void {
    for (const placement of this.placements) {
      if (placement.end !== end) {
        continue;
      }
      this.options.onBlockTerminate?.(this.toBlockSnapshot(placement));
    }
  }

  private terminateRunning(): void {
    for (const placement of this.placements) {
      if (placement.state !== "running" && placement.state !== "failed") {
        continue;
      }
      placement.skipHandler = undefined;
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
        if (
          this.currentTime < this.horizon &&
          this.lastTimeStart !== this.currentTime
        ) {
          this.lastTimeStart = this.currentTime;
          this.options.onTimeStart?.(this.currentTime);
        }

        const due = this.placements.filter(
          (placement) =>
            placement.start === this.currentTime &&
            placement.state === "pending",
        );

        for (const placement of due) {
          placement.state = "running";
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
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private toBlockSnapshot(placement: BlockExecution): BlockSnapshot {
    return {
      id: placement.id,
      trackId: placement.trackId,
      start: placement.start,
      end: placement.end,
      state: placement.state,
      cooperativeSkip: placement.cooperativeSkip,
    };
  }
}
