import type { RectGeometry, RectUnit } from "./model";

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

export function convertRectUnit(
  geometry: RectGeometry,
  unit: RectUnit,
  span: number,
): RectGeometry {
  if (geometry.rectUnit === unit) {
    return geometry;
  }
  const scale = unit === "pixels" ? span : 1 / span;
  return {
    x: geometry.x * scale,
    y: geometry.y * scale,
    w: geometry.w * scale,
    h: geometry.h * scale,
    rectUnit: unit,
  };
}
