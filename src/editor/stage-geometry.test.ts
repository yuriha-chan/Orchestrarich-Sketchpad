import { describe, expect, it } from "vitest";
import type { RectGeometry } from "./model";
import { computeStageLayout, convertRectUnit, rectPixels } from "./stage-geometry";

const spanRect: RectGeometry = { x: 3, y: 2, w: 1, h: 1, rectUnit: "span" };

describe("computeStageLayout", () => {
  it("fills an exact 16:9 canvas without letterboxing", () => {
    expect(computeStageLayout(1600, 900, 16, 9)).toEqual({
      span: 100,
      left: 0,
      top: 0,
      width: 1600,
      height: 900,
    });
  });

  it("letterboxes horizontally on a wider canvas", () => {
    const layout = computeStageLayout(1600, 800, 16, 9);
    expect(layout.span).toBe(800 / 9);
    expect(layout.width).toBe((800 / 9) * 16);
    expect(layout.height).toBe(800);
    expect(layout.left).toBe((1600 - layout.width) / 2);
    expect(layout.top).toBe(0);
  });

  it("letterboxes vertically on a taller canvas", () => {
    const layout = computeStageLayout(800, 900, 16, 9);
    expect(layout.span).toBe(50);
    expect(layout.width).toBe(800);
    expect(layout.height).toBe(450);
    expect(layout.left).toBe(0);
    expect(layout.top).toBe(225);
  });

  it("follows the configured grid size", () => {
    const layout = computeStageLayout(800, 800, 8, 8);
    expect(layout.span).toBe(100);
    expect(layout).toMatchObject({ left: 0, top: 0, width: 800, height: 800 });
  });
});

describe("rectPixels", () => {
  it("scales span units by the current span", () => {
    expect(rectPixels(spanRect, 50)).toEqual({
      left: 150,
      top: 100,
      width: 50,
      height: 50,
    });
  });

  it("keeps pixel units absolute", () => {
    expect(rectPixels({ ...spanRect, rectUnit: "pixels" }, 50)).toEqual({
      left: 3,
      top: 2,
      width: 1,
      height: 1,
    });
  });
});

describe("convertRectUnit", () => {
  it("converts span units to the current span in pixels", () => {
    expect(convertRectUnit(spanRect, "pixels", 50)).toEqual({
      x: 150,
      y: 100,
      w: 50,
      h: 50,
      rectUnit: "pixels",
    });
  });

  it("converts pixels back to spans", () => {
    const pixels: RectGeometry = { x: 150, y: 100, w: 50, h: 50, rectUnit: "pixels" };
    expect(convertRectUnit(pixels, "span", 50)).toEqual(spanRect);
  });
});
