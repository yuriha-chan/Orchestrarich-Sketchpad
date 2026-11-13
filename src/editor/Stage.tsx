import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CircleDashed } from "lucide-react";
import type { StageItem } from "./stage-state";
import { blockDefinition } from "./builtin-blocks";
import { computeStageLayout } from "./stage-geometry";

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
          {items.filter((item) => item.layer === "screen").map((item) => {
            const Render = blockDefinition(item.kind).renderStage;
            return Render === undefined ? null : (
              <Render key={item.id} view={{ id: item.id, payload: item.payload }} />
            );
          })}
        </div>
      </div>
      {items.filter((item) => item.layer === "card").map((item) => {
        const Render = blockDefinition(item.kind).renderStage;
        return Render === undefined ? null : (
          <Render key={item.id} view={{ id: item.id, payload: item.payload }} />
        );
      })}
      {items.length === 0 ? (
        <p className="stage-empty">
          <CircleDashed size={14} aria-hidden="true" />
          Nothing playing
        </p>
      ) : null}
    </div>
  );
}
