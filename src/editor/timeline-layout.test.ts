import { describe, expect, it } from "vitest";

import {
  BASE_GAP_WIDTH,
  CELL_WIDTH,
  barrierRect,
  baseGapCenter,
  blockSpan,
  boundary,
  buildTimelineLayout,
  cellAtX,
  cellDelta,
  cellLeft,
  cellRight,
  type BoundarySpec,
  type TimelineLayout,
} from "./timeline-layout";

const uniform: (time: number) => BoundarySpec = () => ({
  before: [],
  baseWidth: BASE_GAP_WIDTH,
  after: [],
});

function layoutFor(
  cellCount: number,
  specs: readonly BoundarySpec[],
  cellWidth = CELL_WIDTH,
): TimelineLayout {
  return buildTimelineLayout(
    cellCount,
    (time) => specs[time] ?? { before: [], baseWidth: BASE_GAP_WIDTH, after: [] },
    cellWidth,
  );
}

describe("buildTimelineLayout", () => {
  it("alternates one base gap with each cell and ends with a trailing gap", () => {
    const layout = buildTimelineLayout(3, uniform);

    expect(layout.segments.map((segment) => segment.kind)).toEqual([
      "gap",
      "cell",
      "gap",
      "cell",
      "gap",
      "cell",
      "gap",
    ]);
    expect(layout.segments.map((segment) => segment.time)).toEqual([
      0, 0, 1, 1, 2, 2, 3,
    ]);
    expect(layout.width).toBe(3 * (CELL_WIDTH + BASE_GAP_WIDTH) + BASE_GAP_WIDTH);
  });

  it("places each cell after its boundary gap", () => {
    const layout = buildTimelineLayout(3, uniform);

    expect(layout.cellLefts).toEqual([
      BASE_GAP_WIDTH,
      BASE_GAP_WIDTH + CELL_WIDTH + BASE_GAP_WIDTH,
      BASE_GAP_WIDTH + 2 * (CELL_WIDTH + BASE_GAP_WIDTH),
    ]);
    expect(cellLeft(layout, 0)).toBe(32);
    expect(cellLeft(layout, 1)).toBe(160);
    expect(cellLeft(layout, 2)).toBe(288);
    expect(cellRight(layout, 1)).toBe(256);
  });

  it("keeps contiguous loop gaps in the given order around the base gap", () => {
    const layout = layoutFor(3, [
      { before: [], baseWidth: 32, after: [] },
      { before: [12], baseWidth: 32, after: [] },
      { before: [12, 8], baseWidth: 32, after: [6] },
      { before: [], baseWidth: 32, after: [] },
    ]);

    expect(layout.segments.map((segment) => segment.kind)).toEqual([
      "gap",
      "cell",
      "gap",
      "gap",
      "cell",
      "gap",
      "gap",
      "gap",
      "gap",
      "cell",
      "gap",
    ]);
    expect(layout.boundaries[2].gaps.map((gap) => gap.width)).toEqual([
      12, 8, 32, 6,
    ]);
    expect(layout.boundaries[2].gaps.map((gap) => gap.role)).toEqual([
      "loop",
      "loop",
      "base",
      "loop",
    ]);
  });

  it("lays out the contiguous gap sequence from the design example", () => {
    const layout = layoutFor(6, [
      { before: [], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
      { before: [16], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
      { before: [16, 16], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
      { before: [16], baseWidth: 32, after: [] },
    ]);

    expect(layout.segments.map((segment) => segment.kind)).toEqual([
      "gap",
      "cell",
      "gap",
      "cell",
      "gap",
      "gap",
      "cell",
      "gap",
      "cell",
      "gap",
      "gap",
      "gap",
      "cell",
      "gap",
      "cell",
      "gap",
      "gap",
    ]);
  });

  it("reports the base gap center regardless of where the loop gaps sit", () => {
    const layout = layoutFor(2, [
      { before: [], baseWidth: 32, after: [] },
      { before: [16, 16], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
    ]);

    expect(boundary(layout, 1).left).toBe(128);
    expect(baseGapCenter(layout, 1)).toBe(128 + 32 + 16);
    expect(baseGapCenter(layout, 2)).toBe(layout.width - 16);
  });
});

describe("cellAtX", () => {
  const layout = layoutFor(3, [
    { before: [], baseWidth: 32, after: [] },
    { before: [16, 16], baseWidth: 32, after: [] },
    { before: [], baseWidth: 32, after: [] },
    { before: [], baseWidth: 32, after: [] },
  ]);

  it("maps a boundary gap run to the cell that follows it", () => {
    expect(cellAtX(layout, boundary(layout, 1).left)).toBe(1);
    expect(cellAtX(layout, baseGapCenter(layout, 1) - 1)).toBe(1);
    expect(cellAtX(layout, cellLeft(layout, 1))).toBe(1);
  });

  it("maps each cell tile to its own time", () => {
    expect(cellAtX(layout, cellRight(layout, 0) - 1)).toBe(0);
    expect(cellAtX(layout, cellLeft(layout, 2))).toBe(2);
  });

  it("clamps before the first boundary and after the trailing gap", () => {
    expect(cellAtX(layout, -20)).toBe(0);
    expect(cellAtX(layout, layout.width + 20)).toBe(2);
  });

  it("computes drag deltas from the containing cells", () => {
    expect(cellDelta(layout, cellLeft(layout, 0), cellLeft(layout, 2))).toBe(2);
    expect(cellDelta(layout, cellLeft(layout, 2), cellLeft(layout, 1))).toBe(-1);
  });
});

describe("blockSpan", () => {
  it("covers the cells of the span and hides the gaps inside it", () => {
    const layout = layoutFor(4, [
      { before: [], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
    ]);

    expect(blockSpan(layout, 1, 2, 3)).toEqual({
      left: cellLeft(layout, 1) + 3,
      width: cellRight(layout, 2) - cellLeft(layout, 1) - 6,
    });
  });

  it("spans across extra loop gaps inside the block", () => {
    const layout = layoutFor(4, [
      { before: [], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
      { before: [16, 16], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
    ]);

    const span = blockSpan(layout, 1, 3, 3);
    expect(span.left).toBe(cellLeft(layout, 1) + 3);
    expect(span.left + span.width).toBe(cellRight(layout, 3) - 3);
  });

  it("keeps the gap outside the block visible", () => {
    const layout = layoutFor(3, [
      { before: [], baseWidth: 32, after: [] },
      { before: [16], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
    ]);

    const span = blockSpan(layout, 1, 1, 0);
    expect(span.left).toBe(cellLeft(layout, 1));
    expect(span.left + span.width).toBe(cellRight(layout, 1));
  });
});

describe("barrierRect", () => {
  it("covers the cell tiles of the barrier span, not the gaps", () => {
    const layout = layoutFor(4, [
      { before: [], baseWidth: 32, after: [] },
      { before: [16], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
      { before: [16, 8], baseWidth: 32, after: [] },
      { before: [], baseWidth: 32, after: [] },
    ]);

    expect(barrierRect(layout, 1, 3)).toEqual({
      left: cellLeft(layout, 1),
      width: cellRight(layout, 2) - cellLeft(layout, 1),
    });
  });
});
