import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CircleDashed } from "lucide-react";
import type { StagePrimitive } from "./stage-state";
import {
  AnimationStage,
  DialogueStage,
  RectangleStage,
} from "./stage-primitives";
import { computeStageLayout } from "./stage-geometry";

function StagePrimitiveView({ primitive }: { readonly primitive: StagePrimitive }) {
  switch (primitive.type) {
    case "dialogue":
      return <DialogueStage card={primitive} />;
    case "animation":
      return <AnimationStage card={primitive} />;
    case "rectangle":
      return <RectangleStage rectangle={primitive} />;
  }
}

export function Stage({
  items,
  columns,
  rows,
  onSpanChange,
}: {
  readonly items: readonly StagePrimitive[];
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
            "--stage-span": `${layout.span}px`,
          } as CSSProperties}
        >
          {items.filter((item) => item.layer === "screen").map((item) => (
            <StagePrimitiveView key={item.id} primitive={item} />
          ))}
        </div>
      </div>
      {items.filter((item) => item.layer === "card").map((item) => (
        <StagePrimitiveView key={item.id} primitive={item} />
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
