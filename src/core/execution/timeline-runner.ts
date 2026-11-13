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

export interface LoopDefinition {
  readonly start: number;
  readonly end: number;
  readonly iterations: number;
  readonly loops?: readonly LoopDefinition[];
}

export interface TimelineDefinition {
  readonly tracks: readonly TrackDefinition[];
  readonly loops?: readonly LoopDefinition[];
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

export type BlockOutputs = Readonly<Record<string, number>>;

export interface BlockStartResult {
  readonly execution: Promise<void | BlockOutputs>;
  readonly skip?: SkipHandler;
}

export interface TimelineRunnerOptions {
  readonly onTimeStart?: (time: number) => void;
  readonly onLoopRepeat?: (
    loop: LoopDefinition,
    endTime: number,
    startTime: number,
  ) => void;
  readonly onBlockStart?: (
    block: BlockSnapshot,
  ) => BlockStartResult | undefined;
  readonly onBlockTerminate?: (
    block: BlockSnapshot,
    outputs: BlockOutputs,
  ) => void;
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
  outputs: BlockOutputs;
  generation: number;
}

interface LoopFrame {
  readonly loop: LoopDefinition;
  iteration: number;
}

function flattenLoops(
  loops: readonly LoopDefinition[],
  parent: LoopDefinition | null,
  flattened: LoopDefinition[],
): void {
  const ordered = [...loops].sort((a, b) => a.start - b.start || b.end - a.end);
  let previousEnd: number | undefined;

  for (const loop of ordered) {
    if (!Number.isInteger(loop.start) || loop.start < 0) {
      throw new Error(`Loop has an invalid start: ${loop.start}`);
    }
    if (!Number.isInteger(loop.end) || loop.end <= loop.start) {
      throw new Error(`Loop has an invalid end: ${loop.end}`);
    }
    if (!Number.isInteger(loop.iterations) || loop.iterations < 1) {
      throw new Error(`Loop has invalid iterations: ${loop.iterations}`);
    }
    if (parent !== null && (loop.start < parent.start || loop.end > parent.end)) {
      throw new Error(`Loop ${loop.start}-${loop.end} is outside its parent`);
    }
    if (previousEnd !== undefined && loop.start < previousEnd) {
      throw new Error(`Loops cross or overlap at cell ${loop.start}`);
    }

    previousEnd = loop.end;
    flattened.push(loop);
    flattenLoops(loop.loops ?? [], loop, flattened);
  }
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
        outputs: {},
        generation: 0,
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
  private readonly loops: readonly LoopDefinition[];
  private readonly loopStack: LoopFrame[] = [];

  private currentTime = 0;
  private currentPhase: TimelinePhase = "idle";
  private pumping = false;
  private disposed = false;
  private lastTimeStart: number | undefined;

  constructor(
    definition: TimelineDefinition,
    options: TimelineRunnerOptions = {},
  ) {
    this.options = options;
    this.placements = flattenAndValidate(definition);
    const loops: LoopDefinition[] = [];
    flattenLoops(definition.loops ?? [], null, loops);
    this.loops = loops;
    this.validateBlocksAgainstLoops();
    this.horizon = Math.max(
      ...this.placements.map((placement) => placement.end),
      ...this.loops.map((loop) => loop.end),
      0,
    );
    this.barrierCheckTimes = [
      ...new Set([
        ...this.placements.map((placement) => placement.end),
        ...this.loops.map((loop) => loop.start),
        ...this.loops.map((loop) => loop.end),
      ]),
    ].sort((a, b) => a - b);
  }

  get time(): number {
    return this.currentTime;
  }

  get phase(): TimelinePhase {
    return this.currentPhase;
  }

  get isDisposed(): boolean {
    return this.disposed;
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
    if (this.disposed) {
      throw new Error("Disposed timeline cannot start");
    }
    if (this.currentPhase !== "idle") {
      throw new Error(`Timeline cannot start in phase "${this.currentPhase}"`);
    }

    this.currentPhase = "running";
    this.pump();
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    for (const placement of this.placements) {
      placement.skipHandler = undefined;
    }
  }

  requestSkip(): void {
    if (this.disposed) return;
    for (const placement of this.runningPlacements()) {
      if (this.disposed || this.currentPhase !== "running") {
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

  private validateBlocksAgainstLoops(): void {
    for (const placement of this.placements) {
      for (const loop of this.loops) {
        const intersects =
          placement.start < loop.end && placement.end > loop.start;
        if (!intersects) {
          continue;
        }
        if (placement.start >= loop.start && placement.end <= loop.end) {
          continue;
        }
        if (placement.start <= loop.start && placement.end >= loop.end) {
          throw new Error(
            `Block ${placement.id} contains loop ${loop.start}-${loop.end}`,
          );
        }
        throw new Error(
          `Block ${placement.id} overlaps loop ${loop.start}-${loop.end}`,
        );
      }
    }
  }

  private enterLoopsAtCurrentTime(): void {
    for (const loop of this.loops) {
      if (loop.start !== this.currentTime) {
        continue;
      }
      if (this.loopStack.some((frame) => frame.loop === loop)) {
        continue;
      }
      this.loopStack.push({ loop, iteration: 0 });
    }
  }

  private resetBlocksInside(loop: LoopDefinition): void {
    for (const placement of this.placements) {
      if (
        placement.start < loop.start ||
        placement.end > loop.end
      ) {
        continue;
      }
      placement.state = "pending";
      placement.autoSkipFired = false;
      placement.skipHandler = undefined;
      placement.outputs = {};
      placement.generation += 1;
    }
  }

  private advanceFrom(endTime: number): void {
    while (this.loopStack.length > 0) {
      const frame = this.loopStack[this.loopStack.length - 1]!;
      if (frame.loop.end !== endTime) {
        break;
      }
      if (frame.iteration + 1 < frame.loop.iterations) {
        frame.iteration += 1;
        this.resetBlocksInside(frame.loop);
        this.options.onLoopRepeat?.(frame.loop, frame.loop.end, frame.loop.start);
        if (this.disposed) return;
        this.currentTime = frame.loop.start;
        this.lastTimeStart = undefined;
        return;
      }
      this.loopStack.pop();
    }
    this.currentTime = endTime;
  }

  private invokeBlockStart(placement: BlockExecution): void {
    const generation = placement.generation;
    let result: BlockStartResult | undefined;
    try {
      result = this.options.onBlockStart?.(this.toBlockSnapshot(placement));
    } catch {
      this.failBlock(placement, generation);
      return;
    }
    if (result === undefined) {
      return;
    }
    placement.skipHandler = result.skip;
    result.execution.then(
      (outputs) => this.completeBlock(placement, generation, outputs ?? {}),
      () => this.failBlock(placement, generation),
    );
  }

  private deliverSkip(placement: BlockExecution, reason: SkipReason): void {
    const generation = placement.generation;
    const handler = placement.skipHandler;
    if (handler === undefined) {
      return;
    }
    let result: void | Promise<void>;
    try {
      result = handler(reason);
    } catch {
      this.failBlock(placement, generation);
      return;
    }
    if (result !== undefined) {
      Promise.resolve(result).catch(() =>
        this.failBlock(placement, generation),
      );
    }
  }

  private completeBlock(
    placement: BlockExecution,
    generation: number,
    outputs: BlockOutputs,
  ): void {
    if (this.disposed || this.currentPhase !== "running") {
      return;
    }
    if (placement.generation !== generation) {
      return;
    }
    if (placement.state !== "running") {
      return;
    }
    placement.state = "completed";
    placement.outputs = outputs;
    placement.skipHandler = undefined;
    this.pump();
  }

  private failBlock(placement: BlockExecution, generation: number): void {
    if (this.disposed || this.currentPhase !== "running") {
      return;
    }
    if (placement.generation !== generation) {
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

    while (firedAny && !this.disposed && this.currentPhase === "running") {
      firedAny = false;

      for (const placement of this.placements) {
        if (this.disposed || this.currentPhase !== "running") {
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
      if (this.disposed) break;
      if (placement.end !== end) {
        continue;
      }
      this.options.onBlockTerminate?.(
        this.toBlockSnapshot(placement),
        placement.outputs,
      );
    }
  }

  private terminateRunning(): void {
    for (const placement of this.placements) {
      if (this.disposed) break;
      if (placement.state !== "running" && placement.state !== "failed") {
        continue;
      }
      placement.skipHandler = undefined;
      this.options.onBlockTerminate?.(
        this.toBlockSnapshot(placement),
        placement.outputs,
      );
    }
  }

  private pump(): void {
    if (this.pumping) {
      return;
    }

    this.pumping = true;
    try {
      while (!this.disposed && this.currentPhase === "running") {
        this.enterLoopsAtCurrentTime();

        if (
          this.currentTime < this.horizon &&
          this.lastTimeStart !== this.currentTime
        ) {
          this.lastTimeStart = this.currentTime;
          this.options.onTimeStart?.(this.currentTime);
        }

        if (this.disposed) break;

        const due = this.placements.filter(
          (placement) =>
            placement.start === this.currentTime &&
            placement.state === "pending",
        );

        for (const placement of due) {
          if (this.disposed || this.currentPhase !== "running") {
            break;
          }
          placement.state = "running";
          this.invokeBlockStart(placement);
        }

        if (this.disposed || this.currentPhase !== "running") {
          break;
        }

        this.autoSkipIfCooperative();

        if (this.disposed || this.currentPhase !== "running") {
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

        if (this.disposed || this.currentPhase !== "running") {
          break;
        }
        this.advanceFrom(this.currentTime + 1);
      }
    } finally {
      this.pumping = false;
      this.notify();
    }
  }

  private notify(): void {
    if (this.disposed) return;
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
