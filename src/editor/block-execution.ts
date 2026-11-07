import type { BlockSnapshot, BlockStartResult, SkipReason } from "../core/execution/timeline-runner.ts";
import type { ExecutionDefinition } from "./execution-definition";
import { blockDurationSeconds, type DialoguePlacement, type DurationPlacement, type MediaPlacement } from "./model";
import type { AnimationPlayback, StageActions } from "./stage-state";

export const SKIP_FADE_MS = 150;

let nextExecutionId = 0;

export abstract class ExecutionInstance {
  readonly id = `execution-${nextExecutionId++}`;

  constructor(readonly definition: ExecutionDefinition) {}

  abstract startPhase(block: BlockSnapshot): BlockStartResult;
  abstract terminatePhase(block: BlockSnapshot): void;
  abstract terminate(): void;
}

interface ExecutionContext {
  readonly bpm: number;
  readonly stage: StageActions;
  readonly report: (message: string) => void;
  readonly time: () => number;
}

class DialogueExecution extends ExecutionInstance {
  constructor(
    definition: ExecutionDefinition,
    private readonly placement: DialoguePlacement,
    private readonly context: ExecutionContext,
  ) {
    super(definition);
  }

  startPhase(block: BlockSnapshot): BlockStartResult {
    const execution = new Promise<void>((resolve) => {
      this.context.stage.add({
        kind: "dialogue",
        id: this.id,
        label: `Dialogue @${block.start}`,
        text: "lazy dog jumps ...",
        confirm: () => {
          this.context.stage.remove(this.id);
          this.context.report(`Dialogue advanced: ${this.placement.id} at t=${this.context.time()}`);
          resolve();
        },
      });
    });
    return { execution };
  }

  terminatePhase(_block: BlockSnapshot): void {}

  terminate(): void {
    this.context.stage.remove(this.id);
  }
}

export class TimedExecution extends ExecutionInstance {
  protected readonly durationMs: number;
  private readonly cleanups = new Map<string, () => void>();

  constructor(
    definition: ExecutionDefinition,
    protected readonly placement: DurationPlacement,
    protected readonly context: ExecutionContext,
  ) {
    super(definition);
    this.durationMs = blockDurationSeconds(placement, context.bpm) * 1000;
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

interface MediaPresentation {
  initialize(id: string, durationMs: number): void;
  setPlayback(id: string, playback: AnimationPlayback): void;
  terminate(id: string): void;
}

class AnimationPresentation implements MediaPresentation {
  constructor(private readonly placement: MediaPlacement, private readonly stage: StageActions) {}

  initialize(id: string, durationMs: number): void {
    this.stage.add({
      kind: "animation",
      id,
      label: `Animation @${this.placement.start}–${this.placement.start + this.placement.length}`,
      durationMs,
      fadeInFraction: this.placement.fadeIn / this.placement.length,
      fadeOutFraction: this.placement.fadeOut / this.placement.length,
      playback: { positionMs: 0, playing: true },
    });
  }

  setPlayback(id: string, playback: AnimationPlayback): void {
    this.stage.setAnimationPlayback(id, playback);
  }

  terminate(id: string): void {
    this.stage.remove(id);
  }
}

export class MediaExecution extends TimedExecution {
  constructor(
    definition: ExecutionDefinition,
    placement: MediaPlacement,
    context: ExecutionContext,
    private readonly presentation?: MediaPresentation,
  ) {
    super(definition, placement, context);
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

export function createExecution(definition: ExecutionDefinition, context: ExecutionContext): ExecutionInstance {
  const placement = definition.placement;
  switch (placement.kind) {
    case "dialogue": return new DialogueExecution(definition, placement, context);
    case "animation": return new MediaExecution(definition, placement, context, new AnimationPresentation(placement, context.stage));
    case "sound": return new MediaExecution(definition, placement, context);
    case "camera":
    case "wait": return new TimedExecution(definition, placement, context);
  }
}
