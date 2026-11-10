import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, CircleDashed, Clapperboard, MessageSquare } from "lucide-react";
import type { RectGeometry } from "./model";
import type { AnimationView, DialogueView, RectangleView, StageItem } from "./stage-state";
import { computeStageLayout, rectPixels } from "./stage-geometry";

export function Stage({
  items,
  columns,
  rows,
  onSpanChange,
}: {
  readonly items: readonly StageItem[];
  readonly columns: number;
  readonly rows: number;
  readonly onSpanChange: (span: number) => void;
}) {
  const screenRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = screenRef.current!;
    const update = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = computeStageLayout(size.width, size.height, columns, rows);

  useEffect(() => {
    onSpanChange(layout.span);
  }, [layout.span, onSpanChange]);

  const rectangles = items.filter(
    (item): item is RectangleView => item.kind === "rectangle",
  );
  const cards = items.filter(
    (item): item is DialogueView | AnimationView => item.kind !== "rectangle",
  );

  return (
    <div className="stage-content">
      <div ref={screenRef} className="stage-screen" aria-label="Stage screen">
        <div
          className="stage-grid"
          style={{
            left: layout.left,
            top: layout.top,
            width: layout.width,
            height: layout.height,
            backgroundSize: `${layout.span}px ${layout.span}px`,
          }}
        >
          {rectangles.map((view) => {
            const geometry: RectGeometry = {
              x: view.x,
              y: view.y,
              w: view.w,
              h: view.h,
              rectUnit: view.unit,
            };
            const pixels = rectPixels(geometry, layout.span);
            return (
              <div
                key={view.id}
                className="stage-rect"
                style={{
                  left: pixels.left,
                  top: pixels.top,
                  width: pixels.width,
                  height: pixels.height,
                }}
              />
            );
          })}
        </div>
      </div>
      {cards.map((item) => item.kind === "dialogue" ? (
        <div key={item.id} className="stage-dialogue">
          <span className="stage-tag">
            <MessageSquare size={12} aria-hidden="true" />
            {item.label}
          </span>
          <p className="stage-dialogue-text">{item.text}</p>
          <button type="button" className="stage-ok" onClick={item.confirm}>
            <Check size={14} aria-hidden="true" />
            OK
          </button>
        </div>
      ) : (
        <StageAnimation key={item.id} view={item} />
      ))}
      {items.length === 0 ? (
        <p className="stage-empty">
          <CircleDashed size={14} aria-hidden="true" />
          Nothing playing
        </p>
      ) : null}
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
      <span className="stage-tag">
        <Clapperboard size={12} aria-hidden="true" />
        {view.label}
      </span>
      <div ref={ref} className="stage-animation-preview" role="img" aria-label="Animation fade preview" />
      <div className="stage-progress" role="progressbar" aria-label={view.label}>
        <div ref={progressRef} className="stage-progress-fill" />
      </div>
    </div>
  );
}
