import { useEffect, useRef } from "react";
import { Check, Clapperboard, MessageSquare } from "lucide-react";
import type {
  StageAnimationCard,
  StageDialogueCard,
  StageRectangle,
} from "./stage-state";

export function DialogueStage({ card }: { readonly card: StageDialogueCard }) {
  return (
    <div className="stage-dialogue">
      <span className="stage-tag">
        <MessageSquare size={12} aria-hidden="true" />
        {card.label}
      </span>
      <p className="stage-dialogue-text">{card.text}</p>
      <button type="button" className="stage-ok" onClick={card.confirm}>
        <Check size={14} aria-hidden="true" />
        OK
      </button>
    </div>
  );
}

export function AnimationStage({ card }: { readonly card: StageAnimationCard }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const animationsRef = useRef<Animation[]>([]);

  useEffect(() => {
    const element = ref.current!;
    const keyframes: Keyframe[] = [];
    if (card.fadeInFraction > 0) {
      keyframes.push(
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: card.fadeInFraction },
      );
    }
    if (card.fadeOutFraction > 0) {
      keyframes.push(
        { opacity: 1, offset: 1 - card.fadeOutFraction },
        { opacity: 0, offset: 1 },
      );
    }
    const options: KeyframeAnimationOptions = { duration: card.durationMs, fill: "both" };
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
  }, [card.durationMs, card.fadeInFraction, card.fadeOutFraction]);

  useEffect(() => {
    for (const animation of animationsRef.current) {
      animation.currentTime = card.playback.positionMs;
      if (card.playback.playing) animation.play();
      else animation.pause();
    }
  }, [card.playback]);

  return (
    <div className="stage-animation">
      <span className="stage-tag">
        <Clapperboard size={12} aria-hidden="true" />
        {card.label}
      </span>
      <div ref={ref} className="stage-animation-preview" role="img" aria-label="Animation fade preview" />
      <div className="stage-progress" role="progressbar" aria-label={card.label}>
        <div ref={progressRef} className="stage-progress-fill" />
      </div>
    </div>
  );
}

export function RectangleStage({ rectangle }: { readonly rectangle: StageRectangle }) {
  const size = (value: number): string =>
    rectangle.unit === "span"
      ? `calc(var(--stage-span) * ${value})`
      : `${value}px`;
  return (
    <div
      className="stage-rect"
      style={{
        left: size(rectangle.x),
        top: size(rectangle.y),
        width: size(rectangle.w),
        height: size(rectangle.h),
        background: `rgb(${rectangle.color[0]}, ${rectangle.color[1]}, ${rectangle.color[2]})`,
      }}
    />
  );
}
