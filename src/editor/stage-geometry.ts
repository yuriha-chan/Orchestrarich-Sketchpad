import type { RectGeometry } from "../core/blocks/geometry.ts";

export { convertRectUnit } from "../core/blocks/geometry.ts";

export interface StageLayout {
  readonly span: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface RectPixels {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function computeStageLayout(
  canvasWidth: number,
  canvasHeight: number,
  columns: number,
  rows: number,
): StageLayout {
  const span = Math.min(canvasWidth / columns, canvasHeight / rows);
  const width = columns * span;
  const height = rows * span;
  return {
    span,
    left: (canvasWidth - width) / 2,
    top: (canvasHeight - height) / 2,
    width,
    height,
  };
}

export function rectPixels(geometry: RectGeometry, span: number): RectPixels {
  const scale = geometry.rectUnit === "span" ? span : 1;
  return {
    left: geometry.x * scale,
    top: geometry.y * scale,
    width: geometry.w * scale,
    height: geometry.h * scale,
  };
}
