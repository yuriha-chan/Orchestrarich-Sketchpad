import { useMemo } from "react";
import type { BlockDefinition, FadeData } from "../blocks/block-definition";
import { generateDotGradientSVG } from "./dot-gradient";
import type { Placement } from "./model";

const BLOCK_HEIGHT = 42;

export function readTimelineFades(
  definition: BlockDefinition,
  block: Placement,
): FadeData {
  for (const field of definition.fields) {
    if (field.kind === "fades") {
      return field.read(block.data);
    }
  }
  throw new Error(
    `Block "${definition.kind}" enables timeline fades without a fades field`,
  );
}

export function TimelineFadeSurface({
  fades,
  length,
  width,
  phasePositions,
}: {
  readonly fades: FadeData;
  readonly length: number;
  readonly width: number;
  readonly phasePositions: readonly number[];
}) {
  const { fadeIn, fadeOut } = fades;
  const bodyLength = length - fadeIn - fadeOut;
  const lastPosition = phasePositions[phasePositions.length - 1];

  const fadeInWidth =
    fadeIn <= 0 ? 0 : fadeIn >= length ? width : phasePositions[0];
  const fadeOutLeft =
    fadeOut <= 0 ? width : fadeOut >= length ? 0 : lastPosition;
  const bodyLeft = bodyLength > 0 ? (fadeIn > 0 ? phasePositions[0] : 0) : 0;
  const bodyRight =
    bodyLength > 0 ? (fadeOut > 0 ? lastPosition : width) : bodyLeft;

  return (
    <>
      {fadeIn > 0 ? (
        <FadeSurface
          className="block-fade block-fade-in"
          width={fadeInWidth}
          inward
        />
      ) : null}
      {fadeOut > 0 ? (
        <FadeSurface
          className="block-fade block-fade-out"
          width={width - fadeOutLeft}
          inward={false}
        />
      ) : null}
      <span
        className="block-body-surface"
        style={{
          left: `${bodyLeft}px`,
          width: `${bodyRight - bodyLeft}px`,
        }}
        aria-hidden="true"
      />
      {phasePositions.map((position, index) => (
        <span
          key={index}
          className="block-phase-boundary is-editable"
          data-boundary={index}
          style={{ left: `${position}px` }}
          title="Drag to move phase boundary"
          aria-hidden="true"
        />
      ))}
    </>
  );
}

function FadeSurface({ className, width, inward }: {
  className: string;
  width: number;
  inward: boolean;
}) {
  const maskImage = useMemo(() => {
    const svg = generateDotGradientSVG(
      Math.ceil(width / 6) * 6,
      BLOCK_HEIGHT,
      6,
      inward ? 0.25 : 4.5, inward ? 4.5 : 0.25);
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [width, inward]);
  return <span className={className} style={{ width: `${width}px`, maskImage }} aria-hidden="true" />;
}
