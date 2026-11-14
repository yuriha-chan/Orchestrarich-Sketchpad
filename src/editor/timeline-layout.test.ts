import { describe, expect, it } from "vitest";

import {
  BASE_GAP_WIDTH,
  CELL_WIDTH,
  anchorGapCenter,
  barrierRect,
  blockSpan,
  boundary,
  boundaryAtX,
  buildTimelineLayout,
  cellAtX,
  cellDelta,
  cellLeft,
  cellRight,
  loopEdgeX,
  phaseBoundaryX,
  phasePositions,
  type TimelineLayout,
} from "./timeline-layout";
import { allLoops, boundaryGapPaths, type LoopNode } from "./loops";
import { compilePlacement, phaseOffsets } from "./execution-definition";
import type { Placement } from "./model";

const uniformGaps = () => [[]];

function layoutFor(
  cellCount: number,
  paths: readonly (readonly (readonly string[])[])[],
  cellWidth = CELL_WIDTH,
  gapWidth = BASE_GAP_WIDTH,
): TimelineLayout {
  return buildTimelineLayout(
    cellCount,
    (time) => paths[time] ?? [[]],
    cellWidth,
    gapWidth,
  );
}

describe("buildTimelineLayout", () => {
  it("separates every cell with its boundary gap and ends with a trailing gap", () => {
    const layout = buildTimelineLayout(3, uniformGaps);

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
    const layout = buildTimelineLayout(3, uniformGaps);

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

  it("emits one contiguous gap per derived context", () => {
    const layout = layoutFor(4, [
      [[], ["a"]],
      [["a"], ["a", "b"]],
      [["a", "b"]],
      [["a", "b"], ["a"]],
      [["a"], []],
    ]);

    expect(
      layout.boundaries.map((entry) => entry.gaps.map((gap) => gap.path)),
    ).toEqual([
      [[], ["a"]],
      [["a"], ["a", "b"]],
      [["a", "b"]],
      [["a", "b"], ["a"]],
      [["a"], []],
    ]);
    expect(layout.segments.map((segment) => segment.kind)).toEqual([
      "gap",
      "gap",
      "cell",
      "gap",
      "gap",
      "cell",
      "gap",
      "cell",
      "gap",
      "gap",
      "cell",
      "gap",
      "gap",
    ]);
    expect(cellLeft(layout, 0)).toBe(2 * BASE_GAP_WIDTH);
    expect(cellLeft(layout, 1)).toBe(2 * BASE_GAP_WIDTH + CELL_WIDTH + 2 * BASE_GAP_WIDTH);
    expect(cellLeft(layout, 2)).toBe(2 * BASE_GAP_WIDTH + 2 * CELL_WIDTH + 3 * BASE_GAP_WIDTH);
    expect(cellLeft(layout, 3)).toBe(2 * BASE_GAP_WIDTH + 3 * CELL_WIDTH + 5 * BASE_GAP_WIDTH);
  });

  it("keeps four contiguous gaps when nested loops start together", () => {
    const layout = layoutFor(2, [
      [[], ["a"], ["a", "b"], ["a", "b", "c"]],
      [["a", "b", "c"]],
      [["a", "b", "c"]],
    ]);

    expect(layout.boundaries[0].gaps.map((gap) => gap.path)).toEqual([
      [],
      ["a"],
      ["a", "b"],
      ["a", "b", "c"],
    ]);
    expect(layout.boundaries[0].gaps.map((gap) => gap.width)).toEqual([
      BASE_GAP_WIDTH,
      BASE_GAP_WIDTH,
      BASE_GAP_WIDTH,
      BASE_GAP_WIDTH,
    ]);
    expect(cellLeft(layout, 0)).toBe(4 * BASE_GAP_WIDTH);
  });

  it("anchors time-keyed values in the first gap of the run", () => {
    const layout = layoutFor(2, [
      [[], ["a"]],
      [["a"]],
      [["a"], []],
    ]);

    expect(anchorGapCenter(layout, 0)).toBe(boundary(layout, 0).gaps[0].center);
    expect(anchorGapCenter(layout, 2)).toBe(boundary(layout, 2).gaps[0].center);
  });
});

describe("cellAtX", () => {
  const layout = layoutFor(4, [
    [[], ["a"]],
    [["a"], ["a", "b"]],
    [["a", "b"]],
    [["a", "b"], ["a"]],
    [["a"], []],
  ]);

  it("maps a boundary gap run to the cell that follows it", () => {
    expect(cellAtX(layout, boundary(layout, 1).left)).toBe(1);
    expect(cellAtX(layout, boundary(layout, 1).right - 1)).toBe(1);
    expect(cellAtX(layout, cellLeft(layout, 1))).toBe(1);
  });

  it("maps each cell tile to its own time", () => {
    expect(cellAtX(layout, cellRight(layout, 0) - 1)).toBe(0);
    expect(cellAtX(layout, cellLeft(layout, 2))).toBe(2);
  });

  it("clamps before the first boundary and after the trailing gap", () => {
    expect(cellAtX(layout, -20)).toBe(0);
    expect(cellAtX(layout, layout.width + 20)).toBe(3);
  });

  it("computes drag deltas from the containing cells", () => {
    expect(cellDelta(layout, cellLeft(layout, 0), cellLeft(layout, 2))).toBe(2);
    expect(cellDelta(layout, cellLeft(layout, 2), cellLeft(layout, 1))).toBe(-1);
  });
});

describe("boundaryAtX", () => {
  const layout = layoutFor(4, [
    [[], ["a"]],
    [["a"], ["a", "b"]],
    [["a", "b"]],
    [["a", "b"], ["a"]],
    [["a"], []],
  ]);

  it("maps leading and interior gap runs to their boundary time", () => {
    expect(boundaryAtX(layout, boundary(layout, 0).left)).toBe(0);
    expect(boundaryAtX(layout, boundary(layout, 0).right - 1)).toBe(0);
    expect(boundaryAtX(layout, boundary(layout, 2).left)).toBe(2);
    expect(boundaryAtX(layout, boundary(layout, 2).right - 1)).toBe(2);
  });

  it("maps every gap in a contiguous run to the same boundary time", () => {
    for (const time of [0, 1, 3, 4]) {
      for (const gap of boundary(layout, time).gaps) {
        expect(boundaryAtX(layout, gap.left)).toBe(time);
        expect(boundaryAtX(layout, gap.right - 1)).toBe(time);
      }
    }
  });

  it("maps each cell tile to its start time", () => {
    expect(boundaryAtX(layout, cellLeft(layout, 0))).toBe(0);
    expect(boundaryAtX(layout, cellRight(layout, 0) - 1)).toBe(0);
    expect(boundaryAtX(layout, cellLeft(layout, 2))).toBe(2);
    expect(boundaryAtX(layout, cellRight(layout, 2) - 1)).toBe(2);
  });

  it("returns the cell count at the trailing boundary instead of the last cell", () => {
    expect(boundaryAtX(layout, boundary(layout, 4).left)).toBe(4);
    expect(boundaryAtX(layout, boundary(layout, 4).right - 1)).toBe(4);
    expect(boundaryAtX(layout, layout.width - 1)).toBe(4);
    expect(boundaryAtX(layout, layout.width)).toBe(4);
    expect(cellAtX(layout, boundary(layout, 4).left)).toBe(3);
  });

  it("clamps coordinates outside the layout", () => {
    expect(boundaryAtX(layout, -20)).toBe(0);
    expect(boundaryAtX(layout, layout.width + 20)).toBe(4);
  });
});

describe("boundaryAtX on an empty layout", () => {
  const layout = buildTimelineLayout(0, uniformGaps);

  it("returns zero", () => {
    expect(boundaryAtX(layout, 0)).toBe(0);
    expect(boundaryAtX(layout, -20)).toBe(0);
    expect(boundaryAtX(layout, 20)).toBe(0);
  });
});

describe("loopEdgeX", () => {
  const layout = layoutFor(4, [
    [[], ["a"]],
    [["a"], ["a", "b"]],
    [["a", "b"]],
    [["a", "b"], ["a"]],
    [["a"], []],
  ]);

  it("places a start marker between the outside and inside gaps", () => {
    expect(loopEdgeX(layout, 0, "a", "start")).toBe(
      boundary(layout, 0).gaps[0].right,
    );
    expect(loopEdgeX(layout, 1, "b", "start")).toBe(
      boundary(layout, 1).gaps[0].right,
    );
  });

  it("places an end marker between the inside and outside gaps", () => {
    expect(loopEdgeX(layout, 3, "b", "end")).toBe(
      boundary(layout, 3).gaps[0].right,
    );
    expect(loopEdgeX(layout, 4, "a", "end")).toBe(
      boundary(layout, 4).gaps[0].right,
    );
  });

  it("separates a closing and an opening edge at the same boundary", () => {
    const split = layoutFor(3, [
      [[], ["a"]],
      [["a", "b"]],
      [["a", "b"], ["a"], ["a", "c"]],
      [["a", "c"], ["a"], []],
    ]);

    expect(loopEdgeX(split, 2, "b", "end")).toBe(
      boundary(split, 2).gaps[0].right,
    );
    expect(loopEdgeX(split, 2, "c", "start")).toBe(
      boundary(split, 2).gaps[1].right,
    );
  });
});

describe("phaseBoundaryX", () => {
  it("returns the center of the gap with the exact path", () => {
    const layout = layoutFor(3, [[[]], [[]], [["a"]], [[]]]);

    expect(phaseBoundaryX(layout, 2, ["a"])).toBe(
      boundary(layout, 2).gaps[0].center,
    );
  });

  it("selects among multiple contiguous gaps by exact path", () => {
    const layout = layoutFor(3, [
      [[], ["a"], ["a", "b"]],
      [[]],
      [[]],
      [[]],
    ]);

    expect(phaseBoundaryX(layout, 0, ["a"])).toBe(
      boundary(layout, 0).gaps[1].center,
    );
    expect(phaseBoundaryX(layout, 0, ["a", "b"])).toBe(
      boundary(layout, 0).gaps[2].center,
    );
  });

  it("selects the block-level path rather than a contained inner loop path", () => {
    const layout = layoutFor(3, [
      [[], ["a"]],
      [["a", "b"]],
      [["a", "b"], ["a"], ["a", "c"]],
      [["a", "c"], ["a"], []],
    ]);

    expect(phaseBoundaryX(layout, 2, ["a"])).toBe(
      boundary(layout, 2).gaps[1].center,
    );
  });

  it("throws the established error when no gap has the exact path", () => {
    const layout = layoutFor(2, [[[]], [["a"]], [["a"]]]);

    expect(() => phaseBoundaryX(layout, 1, ["a", "b"])).toThrow(
      "No gap at time 1 for path a/b",
    );
  });
});

describe("phasePositions", () => {
  function loopNode(
    id: string,
    start: number,
    end: number,
    children: LoopNode[] = [],
  ): LoopNode {
    return { id, start, end, children };
  }

  function mediaBlock(
    start: number,
    length: number,
    fadeIn: number,
    fadeOut: number,
  ): Placement {
    return {
      id: "media",
      trackId: "track",
      kind: "sound",
      start,
      length,
      cooperativeSkip: false,
      data: {
        duration: length,
        durationUnit: "beats",
        syncBeatsToCellSpan: false,
        fadeIn,
        fadeOut,
      },
    };
  }

  function layoutForLoops(
    loops: readonly LoopNode[],
    cellCount: number,
  ): TimelineLayout {
    return buildTimelineLayout(cellCount, (time) =>
      boundaryGapPaths(loops, time),
    );
  }

  function positionsFor(
    layout: TimelineLayout,
    loops: readonly LoopNode[],
    block: Placement,
  ): readonly number[] {
    const span = blockSpan(layout, block.start, block.length, 0);
    return phasePositions(
      layout,
      loops,
      block,
      phaseOffsets(compilePlacement(block).structure),
      span.left,
    );
  }

  it("returns an ordinary boundary relative to the drawn block left", () => {
    const block = mediaBlock(1, 6, 2, 0);
    const layout = layoutForLoops([], 8);
    const span = blockSpan(layout, block.start, block.length, 0);

    const positions = positionsFor(layout, [], block);

    expect(positions).toEqual([
      boundary(layout, 3).gaps[0].center - span.left,
    ]);
    expect(positions[0]).toBeLessThan(boundary(layout, 3).gaps[0].center);
  });

  it("selects the block-level gap at a loop edge enclosed by the block", () => {
    const loops = [loopNode("inner", 2, 4)];
    const block = mediaBlock(0, 6, 2, 0);
    const layout = layoutForLoops(loops, 8);
    const span = blockSpan(layout, block.start, block.length, 0);

    const positions = positionsFor(layout, allLoops(loops), block);

    expect(boundary(layout, 2).gaps.map((gap) => gap.path)).toEqual([
      [],
      ["inner"],
    ]);
    expect(positions).toEqual([
      boundary(layout, 2).gaps[0].center - span.left,
    ]);
    expect(positions[0]).not.toBe(
      boundary(layout, 2).gaps[1].center - span.left,
    );
  });

  it("stays at the outer loop level for a contained inner loop boundary", () => {
    const loops = [loopNode("outer", 0, 10, [loopNode("inner", 2, 4)])];
    const block = mediaBlock(0, 6, 2, 0);
    const layout = layoutForLoops(loops, 12);
    const span = blockSpan(layout, block.start, block.length, 0);

    const positions = positionsFor(layout, allLoops(loops), block);

    expect(boundary(layout, 2).gaps.map((gap) => gap.path)).toEqual([
      ["outer"],
      ["outer", "inner"],
    ]);
    expect(positions).toEqual([
      boundary(layout, 2).gaps[0].center - span.left,
    ]);
  });
});

describe("blockSpan", () => {
  it("covers the cells of the span and hides the gaps inside it", () => {
    const layout = layoutFor(4, [
      [[], ["a"]],
      [["a"], ["a", "b"]],
      [["a", "b"]],
      [["a", "b"], ["a"]],
      [["a"], []],
    ]);

    expect(blockSpan(layout, 1, 2, 3)).toEqual({
      left: cellLeft(layout, 1) + 3,
      width: cellRight(layout, 2) - cellLeft(layout, 1) - 6,
    });
  });

  it("spans across extra loop gaps inside the block", () => {
    const layout = layoutFor(4, [
      [[]],
      [[]],
      [["a"], ["a", "b"]],
      [[]],
      [[]],
    ]);

    const span = blockSpan(layout, 1, 3, 3);
    expect(span.left).toBe(cellLeft(layout, 1) + 3);
    expect(span.left + span.width).toBe(cellRight(layout, 3) - 3);
  });

  it("keeps the gaps outside the block visible", () => {
    const layout = layoutFor(3, [
      [[]],
      [["a"], ["a", "b"]],
      [[]],
      [[]],
    ]);

    const span = blockSpan(layout, 1, 1, 0);
    expect(span.left).toBe(cellLeft(layout, 1));
    expect(span.left + span.width).toBe(cellRight(layout, 1));
  });
});

describe("blockSpan with loop edges", () => {
  const layout = layoutFor(4, [
    [[], ["a"], ["a", "b"]],
    [[]],
    [[]],
    [[]],
    [["a", "b"], ["a"], []],
  ]);

  it("extends the left edge to the anchor gap", () => {
    const span = blockSpan(layout, 0, 4, 3, { left: ["a"], right: null });
    expect(span.left).toBe(boundary(layout, 0).gaps[1].left + 3);
    expect(span.left + span.width).toBe(cellRight(layout, 3) - 3);
  });

  it("extends the right edge past the anchor gap", () => {
    const span = blockSpan(layout, 0, 4, 3, { left: null, right: ["a"] });
    expect(span.left).toBe(cellLeft(layout, 0) + 3);
    expect(span.left + span.width).toBe(
      boundary(layout, 4).gaps[1].right - 3,
    );
  });

  it("extends both edges", () => {
    const span = blockSpan(layout, 0, 4, 3, { left: [], right: [] });
    expect(span.left).toBe(boundary(layout, 0).left + 3);
    expect(span.left + span.width).toBe(boundary(layout, 4).right - 3);
  });
});

describe("barrierRect", () => {
  it("covers the cell tiles of the barrier span, not the gaps", () => {
    const layout = layoutFor(4, [
      [[]],
      [["a"]],
      [[]],
      [["a"], ["b"], []],
      [[]],
    ]);

    expect(barrierRect(layout, 1, 3)).toEqual({
      left: cellLeft(layout, 1),
      width: cellRight(layout, 2) - cellLeft(layout, 1),
    });
  });
});
