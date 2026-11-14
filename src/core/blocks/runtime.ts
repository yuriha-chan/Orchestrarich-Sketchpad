import type {
  BlockSnapshot,
  BlockStartResult,
  SkipReason,
} from "../execution/timeline-runner.ts";
import type { Placement } from "./placement.ts";
import type { StageActions } from "./presentation.ts";

export const SKIP_FADE_MS = 150;

let nextExecutionId = 0;

export abstract class ExecutionInstance {
  readonly id = `execution-${nextExecutionId++}`;

  constructor(readonly placement: Placement) {}

  abstract startPhase(block: BlockSnapshot): BlockStartResult;
  abstract terminatePhase(block: BlockSnapshot): void;
  abstract terminate(): void;
}

export interface ExecutionContext {
  readonly bpm: number;
  readonly stage: StageActions;
  readonly report: (message: string) => void;
  readonly time: () => number;
  readonly readSlot: (slotId: string) => number;
}

export class TimedExecution extends ExecutionInstance {
  protected readonly durationMs: number;
  private readonly cleanups = new Map<string, () => void>();

  constructor(
    placement: Placement,
    protected readonly context: ExecutionContext,
    durationMs: number,
  ) {
    super(placement);
    this.durationMs = durationMs;
  }

  startPhase(block: BlockSnapshot): BlockStartResult {
    return this.runPhase(block, () => {});
  }

  protected runPhase(block: BlockSnapshot, onComplete: () => void): BlockStartResult {
    const duration = this.durationMs * (block.end - block.start) / this.placement.length;
    let timer: ReturnType<typeof setTimeout>;
    let skipping = false;
    let resolveExecution!: () => void;
    const execution = new Promise<void>((resolve) => {
      resolveExecution = resolve;
    });
    const settle = () => {
      clearTimeout(timer);
      this.cleanups.delete(block.id);
      onComplete();
      resolveExecution();
    };
    timer = setTimeout(settle, duration);
    this.cleanups.set(block.id, () => clearTimeout(timer));
    const skip = (reason: SkipReason) => {
      if (skipping) return;
      skipping = true;
      clearTimeout(timer);
      timer = setTimeout(settle, SKIP_FADE_MS);
      this.context.report(`Skip (${reason}): ${this.placement.id} at t=${this.context.time()}`);
    };
    return { execution, skip };
  }

  terminatePhase(block: BlockSnapshot): void {
    this.cleanups.get(block.id)?.();
    this.cleanups.delete(block.id);
  }

  terminate(): void {
    for (const cleanup of this.cleanups.values()) cleanup();
    this.cleanups.clear();
  }
}

export interface MediaPlayback {
  readonly positionMs: number;
  readonly playing: boolean;
}

export interface MediaPresentation {
  initialize(id: string, durationMs: number): void;
  setPlayback(id: string, playback: MediaPlayback): void;
  terminate(id: string): void;
}

export class MediaExecution extends TimedExecution {
  constructor(
    placement: Placement,
    context: ExecutionContext,
    durationMs: number,
    private readonly presentation?: MediaPresentation,
  ) {
    super(placement, context, durationMs);
    this.presentation?.initialize(this.id, this.durationMs);
  }

  override startPhase(block: BlockSnapshot): BlockStartResult {
    this.setPlayback(block.start, true);
    return this.runPhase(block, () => this.setPlayback(block.end, false));
  }

  override terminate(): void {
    super.terminate();
    this.presentation?.terminate(this.id);
  }

  private setPlayback(time: number, playing: boolean): void {
    this.presentation?.setPlayback(this.id, {
      positionMs: this.durationMs * (time - this.placement.start) / this.placement.length,
      playing,
    });
  }
}
