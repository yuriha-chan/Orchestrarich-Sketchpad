export type RectUnit = "span" | "pixels";

export type Vec3 = [number, number, number];

export interface RectGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  rectUnit: RectUnit;
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
