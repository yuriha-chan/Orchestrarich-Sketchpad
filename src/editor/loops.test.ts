import { describe, expect, it } from "vitest";
import {
  allLoops,
  blockLoopEdges,
  blocksRespectLoops,
  boundaryGapPaths,
  insertLoop,
  loopsAreWellFormed,
  maxLoopDepth,
  removeLoopNode,
  setLoopSpan,
  wrappableSpan,
  type LoopNode,
} from "./loops";
import type { LoopRegion, Placement } from "./model";

function loop(
  id: string,
  start: number,
  end: number,
  children: LoopNode[] = [],
): LoopNode {
  return { id, start, end, children };
}

function block(start: number, length: number): Placement {
  return {
    id: `block-${start}-${length}`,
    trackId: "track-1",
    start,
    length,
    cooperativeSkip: false,
    kind: "dialogue",
    data: {},
  };
}

describe("insertLoop", () => {
  it("adds the first loop", () => {
    expect(insertLoop([], "a", 2, 5)).toEqual([loop("a", 2, 5)]);
  });

  it("nests a loop inside an enclosing loop", () => {
    const existing = [loop("outer", 0, 10)];
    const result = insertLoop(existing, "inner", 3, 6);
    expect(result).toEqual([loop("outer", 0, 10, [loop("inner", 3, 6)])]);
  });

  it("absorbs a loop contained by the new loop", () => {
    const existing = [loop("inner", 2, 4)];
    const result = insertLoop(existing, "outer", 0, 10);
    expect(result).toEqual([loop("outer", 0, 10, [loop("inner", 2, 4)])]);
  });

  it("absorbs a contained loop when inserted inside a parent", () => {
    const existing = [loop("outer", 0, 20, [loop("small", 2, 4)])];
    const result = insertLoop(existing, "middle", 1, 10);
    expect(result).toEqual([
      loop("outer", 0, 20, [loop("middle", 1, 10, [loop("small", 2, 4)])]),
    ]);
  });

  it("nests an equal-span loop as a child", () => {
    const result = insertLoop([loop("outer", 2, 5)], "inner", 2, 5);
    expect(result).toEqual([loop("outer", 2, 5, [loop("inner", 2, 5)])]);
  });

  it("keeps disjoint siblings ordered by start", () => {
    const existing = [loop("late", 6, 8)];
    const result = insertLoop(existing, "early", 0, 2);
    expect(result).toEqual([loop("early", 0, 2), loop("late", 6, 8)]);
  });

  it("accepts touching siblings", () => {
    const existing = [loop("left", 0, 2)];
    expect(insertLoop(existing, "right", 2, 4)).toEqual([
      loop("left", 0, 2),
      loop("right", 2, 4),
    ]);
  });

  it("rejects a loop that crosses another loop", () => {
    expect(insertLoop([loop("existing", 2, 6)], "crossing", 4, 8)).toBeNull();
  });

  it("rejects a loop that crosses an enclosing loop", () => {
    const existing = [loop("outer", 0, 10, [loop("inner", 2, 4)])];
    expect(insertLoop(existing, "crossing", 3, 12)).toBeNull();
  });

  it("rejects an empty, inverted, or non-integer span", () => {
    expect(insertLoop([], "a", 3, 3)).toBeNull();
    expect(insertLoop([], "a", 4, 2)).toBeNull();
    expect(insertLoop([], "a", 1.5, 4)).toBeNull();
  });

  it("does not mutate the input tree", () => {
    const existing = [loop("outer", 0, 10)];
    const before = JSON.parse(JSON.stringify(existing));
    insertLoop(existing, "inner", 2, 4);
    expect(existing).toEqual(before);
  });
});

describe("removeLoopNode", () => {
  it("promotes the children of a removed loop", () => {
    const existing = [
      loop("outer", 0, 10, [loop("middle", 2, 6, [loop("inner", 3, 4)])]),
      loop("last", 12, 14),
    ];
    expect(removeLoopNode(existing, "middle")).toEqual([
      loop("outer", 0, 10, [loop("inner", 3, 4)]),
      loop("last", 12, 14),
    ]);
  });

  it("removes a top-level loop with its children promoted", () => {
    const existing = [loop("outer", 0, 10, [loop("inner", 2, 4)])];
    expect(removeLoopNode(existing, "outer")).toEqual([loop("inner", 2, 4)]);
  });

  it("leaves the tree unchanged for an unknown id", () => {
    const existing = [loop("outer", 0, 10)];
    expect(removeLoopNode(existing, "missing")).toEqual(existing);
  });
});

describe("setLoopSpan", () => {
  it("moves a boundary", () => {
    expect(setLoopSpan([loop("a", 2, 5)], "a", 3, 7)).toEqual([
      loop("a", 3, 7),
    ]);
  });

  it("rejects an inverted or non-integer span", () => {
    expect(setLoopSpan([loop("a", 2, 5)], "a", 5, 5)).toBeNull();
    expect(setLoopSpan([loop("a", 2, 5)], "a", 1.5, 5)).toBeNull();
  });

  it("rejects a change that leaves a child outside", () => {
    const existing = [loop("outer", 0, 10, [loop("inner", 4, 6)])];
    expect(setLoopSpan(existing, "outer", 5, 10)).toBeNull();
    expect(setLoopSpan(existing, "outer", 0, 5)).toBeNull();
  });

  it("rejects a change that overlaps a sibling", () => {
    const existing = [loop("left", 0, 2), loop("right", 4, 6)];
    expect(setLoopSpan(existing, "left", 0, 5)).toBeNull();
  });

  it("absorbs a sibling it expands over", () => {
    const existing = [loop("left", 0, 2), loop("right", 4, 6)];
    expect(setLoopSpan(existing, "left", 0, 6)).toEqual([
      loop("left", 0, 6, [loop("right", 4, 6)]),
    ]);
  });

  it("absorbs several siblings in time order", () => {
    const existing = [
      loop("left", 0, 2),
      loop("middle", 4, 6),
      loop("right", 8, 10),
    ];
    expect(setLoopSpan(existing, "left", 0, 10)).toEqual([
      loop("left", 0, 10, [loop("middle", 4, 6), loop("right", 8, 10)]),
    ]);
  });

  it("absorbs a sibling together with its subtree", () => {
    const existing = [
      loop("left", 0, 2),
      loop("right", 4, 8, [loop("inner", 5, 6)]),
    ];
    expect(setLoopSpan(existing, "left", 0, 8)).toEqual([
      loop("left", 0, 8, [loop("right", 4, 8, [loop("inner", 5, 6)])]),
    ]);
  });

  it("releases a child when the loop shrinks past it", () => {
    const existing = [loop("outer", 0, 10, [loop("inner", 4, 6)])];
    expect(setLoopSpan(existing, "outer", 0, 4)).toEqual([
      loop("outer", 0, 4),
      loop("inner", 4, 6),
    ]);
  });

  it("keeps a child that stays inside when the loop shrinks", () => {
    const existing = [loop("outer", 0, 10, [loop("inner", 4, 6)])];
    expect(setLoopSpan(existing, "outer", 0, 7)).toEqual([
      loop("outer", 0, 7, [loop("inner", 4, 6)]),
    ]);
  });

  it("releases a child with its subtree on the start edge", () => {
    const existing = [
      loop("outer", 0, 10, [
        loop("released", 2, 4, [loop("deep", 2, 3)]),
        loop("kept", 6, 8),
      ]),
    ];
    expect(setLoopSpan(existing, "outer", 4, 10)).toEqual([
      loop("released", 2, 4, [loop("deep", 2, 3)]),
      loop("outer", 4, 10, [loop("kept", 6, 8)]),
    ]);
  });

  it("returns to the original forest when an absorbed sibling is released", () => {
    const existing = [loop("left", 0, 2), loop("right", 4, 6)];
    const expanded = setLoopSpan(existing, "left", 0, 6);
    expect(expanded).toEqual([loop("left", 0, 6, [loop("right", 4, 6)])]);
    expect(setLoopSpan(expanded as LoopNode[], "left", 0, 2)).toEqual(existing);
  });

  it("rejects escaping the parent loop when expanding", () => {
    const existing = [loop("outer", 0, 10, [loop("inner", 2, 4)])];
    expect(setLoopSpan(existing, "inner", 2, 12)).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(setLoopSpan([loop("a", 2, 5)], "missing", 0, 1)).toBeNull();
  });
});

describe("loopsAreWellFormed", () => {
  it("accepts nested and touching loops", () => {
    expect(
      loopsAreWellFormed([
        loop("a", 0, 2),
        loop("b", 2, 10, [loop("c", 3, 4), loop("d", 4, 6)]),
      ]),
    ).toBe(true);
  });

  it("rejects a child outside its parent", () => {
    expect(loopsAreWellFormed([loop("a", 0, 4, [loop("b", 3, 5)])])).toBe(
      false,
    );
  });

  it("rejects overlapping siblings", () => {
    expect(loopsAreWellFormed([loop("a", 0, 4), loop("b", 3, 6)])).toBe(false);
  });

  it("rejects invalid spans", () => {
    expect(loopsAreWellFormed([loop("a", 4, 4)])).toBe(false);
    expect(loopsAreWellFormed([loop("a", 0.5, 2)])).toBe(false);
  });
});

describe("allLoops and maxLoopDepth", () => {
  const tree = [
    loop("a", 0, 10, [loop("b", 2, 4, [loop("c", 2, 3)]), loop("d", 6, 8)]),
    loop("e", 12, 14),
  ];

  it("lists loops in pre-order", () => {
    expect(allLoops(tree).map((node) => node.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("reports the deepest nesting", () => {
    expect(maxLoopDepth([])).toBe(0);
    expect(maxLoopDepth([loop("a", 0, 2)])).toBe(1);
    expect(maxLoopDepth(tree)).toBe(3);
  });
});

describe("boundaryGapPaths", () => {
  it("returns one context on a boundary without a loop edge", () => {
    expect(boundaryGapPaths([], 2)).toEqual([[]]);
    expect(boundaryGapPaths([loop("outer", 0, 4)], 2)).toEqual([["outer"]]);
  });

  it("splits a loop start boundary into outside and inside contexts", () => {
    expect(boundaryGapPaths([loop("outer", 0, 4)], 0)).toEqual([
      [],
      ["outer"],
    ]);
  });

  it("closes inner loops before outer loops at an end boundary", () => {
    const outer = loop("outer", 0, 4, [loop("inner", 1, 3)]);

    expect(boundaryGapPaths([outer], 3)).toEqual([
      ["outer", "inner"],
      ["outer"],
    ]);
    expect(boundaryGapPaths([outer], 4)).toEqual([["outer"], []]);
  });

  it("closes one loop and opens another inside a remaining context", () => {
    const outer = loop("outer", 0, 6, [
      loop("before", 1, 3),
      loop("after", 3, 5),
    ]);

    expect(boundaryGapPaths([outer], 3)).toEqual([
      ["outer", "before"],
      ["outer"],
      ["outer", "after"],
    ]);
  });

  it("counts every nested edge that ends at the same boundary", () => {
    const nested = [
      loop("a", 0, 4, [loop("b", 1, 4, [loop("c", 2, 4)])]),
    ];

    expect(boundaryGapPaths(nested, 4)).toEqual([
      ["a", "b", "c"],
      ["a", "b"],
      ["a"],
      [],
    ]);
  });

  it("counts every nested edge that starts at the same boundary", () => {
    const nested = [
      loop("a", 0, 4, [loop("b", 0, 3, [loop("c", 0, 2)])]),
    ];

    expect(boundaryGapPaths(nested, 0)).toEqual([
      [],
      ["a"],
      ["a", "b"],
      ["a", "b", "c"],
    ]);
  });

  it("keeps touching siblings in separate contexts", () => {
    const loops = [loop("first", 0, 3), loop("second", 3, 6)];

    expect(boundaryGapPaths(loops, 3)).toEqual([
      ["first"],
      [],
      ["second"],
    ]);
  });
});

describe("wrappableSpan", () => {
  it("returns the requested span when nothing crosses it", () => {
    expect(wrappableSpan([], 3, 2)).toEqual({ start: 3, end: 5 });
    expect(wrappableSpan([block(20, 2)], 3, 2)).toEqual({ start: 3, end: 5 });
  });

  it("expands to include a block crossing a boundary", () => {
    expect(wrappableSpan([block(3, 2), block(4, 2)], 3, 2)).toEqual({
      start: 3,
      end: 6,
    });
  });

  it("expands repeatedly for a chain of crossing blocks", () => {
    expect(
      wrappableSpan([block(3, 2), block(4, 2), block(5, 2)], 3, 2),
    ).toEqual({ start: 3, end: 7 });
  });

  it("does not expand for a block that contains the target", () => {
    expect(wrappableSpan([block(0, 10)], 3, 2)).toEqual({ start: 3, end: 5 });
  });
});

describe("blockLoopEdges", () => {
  const regions = allLoops([
    loop("outer", 2, 8, [loop("inner", 4, 6)]),
    loop("later", 10, 12),
  ]);

  it("anchors both edges in the gap outside the loop", () => {
    expect(blockLoopEdges(regions, 2, 6)).toEqual({ left: [], right: [] });
    expect(blockLoopEdges(regions, 10, 2)).toEqual({ left: [], right: [] });
  });

  it("anchors only the left edge when the block starts at the loop start", () => {
    expect(blockLoopEdges(regions, 2, 9)).toEqual({ left: [], right: null });
  });

  it("anchors only the right edge when the block ends at the loop end", () => {
    expect(blockLoopEdges(regions, 0, 8)).toEqual({ left: null, right: [] });
  });

  it("anchors no edge when the block contains a loop with margin", () => {
    expect(blockLoopEdges(regions, 0, 14)).toEqual({
      left: null,
      right: null,
    });
  });

  it("anchors no edge for a block inside or merely touching a loop", () => {
    expect(blockLoopEdges(regions, 2, 1)).toEqual({
      left: null,
      right: null,
    });
    expect(blockLoopEdges(regions, 0, 2)).toEqual({
      left: null,
      right: null,
    });
  });

  it("anchors a block inside a loop in the enclosing context", () => {
    const nested = allLoops([loop("outer", 0, 10, [loop("inner", 0, 4)])]);

    expect(blockLoopEdges(nested, 0, 4)).toEqual({
      left: ["outer"],
      right: ["outer"],
    });
    expect(blockLoopEdges(nested, 4, 4)).toEqual({ left: null, right: null });
    expect(blockLoopEdges(nested, 0, 10)).toEqual({ left: [], right: [] });
  });
});

describe("blocksRespectLoops", () => {
  const regions: LoopRegion[] = [{ start: 2, end: 5 }];

  it("accepts blocks inside, outside, or containing a loop", () => {
    expect(blocksRespectLoops([block(3, 1)], regions)).toBe(true);
    expect(blocksRespectLoops([block(5, 2)], regions)).toBe(true);
    expect(blocksRespectLoops([block(0, 8)], regions)).toBe(true);
  });

  it("rejects a block crossing a loop boundary", () => {
    expect(blocksRespectLoops([block(1, 2)], regions)).toBe(false);
    expect(blocksRespectLoops([block(4, 3)], regions)).toBe(false);
  });
});
