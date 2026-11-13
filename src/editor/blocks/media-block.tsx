import { useMemo } from "react";
import { generateDotGradientSVG } from "../dot-gradient";
import type { Placement } from "../model";
import { fadeBoundaries, type MediaData } from "./media-data";

const BLOCK_HEIGHT = 42;

export function mediaRenderBlock(block: Placement<MediaData>, width: number) {
  const { fadeIn, fadeOut } = block.data;
  return (
    <>
      {fadeIn > 0 ? (
        <FadeSurface
          className="block-fade block-fade-in"
          cells={fadeIn}
          length={block.length}
          blockWidth={width}
          inward
        />
      ) : null}
      {fadeOut > 0 ? (
        <FadeSurface
          className="block-fade block-fade-out"
          cells={fadeOut}
          length={block.length}
          blockWidth={width}
          inward={false}
        />
      ) : null}
      <span
        className="block-body-surface"
        style={{
          left: `${fadeIn / block.length * 100}%`,
          width: `${(block.length - fadeIn - fadeOut) / block.length * 100}%`,
        }}
        aria-hidden="true"
      />
      {fadeBoundaries(fadeIn, fadeOut, block.length).map((phase, index) => (
        <span
          key={phase.boundary}
          className="block-phase-boundary is-editable"
          data-boundary={index}
          style={{ left: `${(phase.offset / block.length) * 100}%` }}
          title="Drag to move phase boundary"
          aria-hidden="true"
        />
      ))}
    </>
  );
}

function FadeSurface({ className, cells, length, blockWidth, inward }: {
  className: string;
  cells: number;
  length: number;
  blockWidth: number;
  inward: boolean;
}) {
  const maskImage = useMemo(() => {
    const width = blockWidth * cells / length;
    const svg = generateDotGradientSVG(
      Math.ceil(width / 6) * 6,
      BLOCK_HEIGHT,
      6,
      inward ? 0.25 : 4.5, inward ? 4.5 : 0.25);
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [cells, length, blockWidth, inward]);
  return <span className={className} style={{ width: `${cells / length * 100}%`, maskImage }} aria-hidden="true" />;
}
