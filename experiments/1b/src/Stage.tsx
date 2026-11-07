import { useEffect, useRef } from "react";
import type { AnimationView, StageItem } from "./stage-state";

export function Stage({ items }: { readonly items: readonly StageItem[] }) {
  return (
    <div className="stage-content">
      {items.map((item) => item.kind === "dialogue" ? (
        <div key={item.id} className="stage-dialogue">
          <span className="stage-tag">{item.label}</span>
          <p className="stage-dialogue-text">{item.text}</p>
          <button type="button" className="stage-ok" onClick={item.confirm}>OK</button>
        </div>
      ) : (
        <StageAnimation key={item.id} view={item} />
      ))}
      {items.length === 0 ? <p className="stage-empty">Nothing playing</p> : null}
    </div>
  );
}

function StageAnimation({ view }: { readonly view: AnimationView }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const animationsRef = useRef<Animation[]>([]);

  useEffect(() => {
    const element = ref.current!;
    const keyframes: Keyframe[] = [];
    if (view.fadeInFraction > 0) {
      keyframes.push(
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: view.fadeInFraction },
      );
    }
    if (view.fadeOutFraction > 0) {
      keyframes.push(
        { opacity: 1, offset: 1 - view.fadeOutFraction },
        { opacity: 0, offset: 1 },
      );
    }
    const options: KeyframeAnimationOptions = { duration: view.durationMs, fill: "both" };
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
  }, [view.durationMs, view.fadeInFraction, view.fadeOutFraction]);

  useEffect(() => {
    for (const animation of animationsRef.current) {
      animation.currentTime = view.playback.positionMs;
      if (view.playback.playing) animation.play();
      else animation.pause();
    }
  }, [view.playback]);

  return (
    <div className="stage-animation">
      <span className="stage-tag">{view.label}</span>
      <div ref={ref} className="stage-animation-preview" role="img" aria-label="Animation fade preview" />
      <div className="stage-progress" role="progressbar" aria-label={view.label}>
        <div ref={progressRef} className="stage-progress-fill" />
      </div>
    </div>
  );
}
