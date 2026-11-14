import { useEffect, useRef } from "react";
import { Clapperboard } from "lucide-react";
import type { BlockDefinitionSpec, StageViewProps } from "../block-definition";
import {
  MediaExecution,
  type MediaPresentation,
} from "../block-runtime";
import type { Placement } from "../model";
import type { StageActions } from "../stage-state";
import { durationField } from "./duration-data";
import {
  mediaCarry,
  mediaFromCarry,
  mediaPhases,
  onMediaLengthChange,
  type MediaData,
} from "./media-data";
import { mediaRenderBlock } from "./media-block";
import {
  fadesField,
  mediaFadeTitle,
  mediaGesture,
  MEDIA_TIMELINE_CLASS,
} from "./media-fades";

export interface AnimationPlayback {
  readonly positionMs: number;
  readonly playing: boolean;
}

export interface AnimationPayload {
  readonly label: string;
  readonly durationMs: number;
  readonly fadeInFraction: number;
  readonly fadeOutFraction: number;
  readonly playback: AnimationPlayback;
}

class AnimationPresentation implements MediaPresentation {
  private payload: AnimationPayload | null = null;

  constructor(
    private readonly block: Placement<MediaData>,
    private readonly stage: StageActions,
  ) {}

  initialize(id: string, durationMs: number): void {
    this.payload = {
      label: `Animation @${this.block.start}–${this.block.start + this.block.length}`,
      durationMs,
      fadeInFraction: this.block.data.fadeIn / this.block.length,
      fadeOutFraction: this.block.data.fadeOut / this.block.length,
      playback: { positionMs: 0, playing: true },
    };
    this.stage.add({
      id,
      kind: "animation",
      layer: "card",
      payload: this.payload,
    });
  }

  setPlayback(id: string, playback: AnimationPlayback): void {
    if (this.payload === null) {
      return;
    }
    this.payload = { ...this.payload, playback };
    this.stage.update(id, this.payload);
  }

  terminate(id: string): void {
    this.stage.remove(id);
  }
}

function AnimationStage({ view }: StageViewProps<AnimationPayload>) {
  const { payload } = view;
  const ref = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const animationsRef = useRef<Animation[]>([]);

  useEffect(() => {
    const element = ref.current!;
    const keyframes: Keyframe[] = [];
    if (payload.fadeInFraction > 0) {
      keyframes.push(
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: payload.fadeInFraction },
      );
    }
    if (payload.fadeOutFraction > 0) {
      keyframes.push(
        { opacity: 1, offset: 1 - payload.fadeOutFraction },
        { opacity: 0, offset: 1 },
      );
    }
    const options: KeyframeAnimationOptions = { duration: payload.durationMs, fill: "both" };
    const animations = [progressRef.current!.animate([
      { transform: "scaleX(0)" },
      { transform: "scaleX(1)" },
    ], options)];
    if (keyframes.length > 0) {
      animations.push(element.animate(keyframes, options));
    }
    for (const animation of animations) animation.pause();
    animationsRef.current = animations;
    return () => {
      for (const animation of animations) animation.cancel();
    };
  }, [payload.durationMs, payload.fadeInFraction, payload.fadeOutFraction]);

  useEffect(() => {
    for (const animation of animationsRef.current) {
      animation.currentTime = payload.playback.positionMs;
      if (payload.playback.playing) animation.play();
      else animation.pause();
    }
  }, [payload.playback]);

  return (
    <div className="stage-animation">
      <span className="stage-tag">
        <Clapperboard size={12} aria-hidden="true" />
        {payload.label}
      </span>
      <div ref={ref} className="stage-animation-preview" role="img" aria-label="Animation fade preview" />
      <div className="stage-progress" role="progressbar" aria-label={payload.label}>
        <div ref={progressRef} className="stage-progress-fill" />
      </div>
    </div>
  );
}

const duration = durationField<MediaData>();

const animation: BlockDefinitionSpec<MediaData, AnimationPayload> = {
  kind: "animation",
  label: "Animation",
  color: "#ea580c",
  icon: Clapperboard,
  fields: [
    duration,
    fadesField<MediaData>(),
  ],
  createData: (length) => ({
    duration: length,
    durationUnit: "beats",
    syncBeatsToCellSpan: false,
    fadeIn: 0,
    fadeOut: 0,
  }),
  carryOver: mediaCarry,
  convertFrom: mediaFromCarry,
  renderStage: AnimationStage,
  renderBlock: mediaRenderBlock,
  timelineClassName: MEDIA_TIMELINE_CLASS,
  timelineTitle: mediaFadeTitle,
  phases: (data, length) => mediaPhases(data.fadeIn, data.fadeOut, length),
  timelineGesture: mediaGesture,
  onLengthChange: onMediaLengthChange,
  createExecution: (context, block) =>
    new MediaExecution(
      block,
      context,
      duration.resolve(block.data, { length: block.length, bpm: context.bpm }) * 1000,
      new AnimationPresentation(block, context.stage),
    ),
};

export default animation;
