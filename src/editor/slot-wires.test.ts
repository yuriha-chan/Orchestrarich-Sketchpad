import { describe, expect, it } from "vitest";

import type { NumericSlot } from "../core/slots/numeric-slots";
import {
  DEFAULT_RECT_COLOR,
  DEFAULT_RECT_GEOMETRY,
  type AdditionPlacement,
  type Placement,
  type RectanglePlacement,
  type TimedPlacement,
  type Track,
} from "./model";
import { outputWires, slotWires, type SlotWireLayout } from "./slot-wires";
import { buildTimelineLayout } from "./timeline-layout";
import { timelineRows } from "./timeline-rows";

const tracks: readonly Track[] = [
  { id: "first", label: "First", color: "#2563eb" },
  { id: "second", label: "Second", color: "#7c3aed" },
];

const slots: readonly NumericSlot[] = [
  { id: "first-slot", trackId: "first", initializations: [{ time: 0, value: 1 }] },
  { id: "second-slot", trackId: "second", initializations: [{ time: 0, value: 2 }] },
  { id: "shared-slot", trackId: null, initializations: [{ time: 0, value: 3 }] },
];

const rows = timelineRows(tracks, slots);

const layout: SlotWireLayout = {
  layout: buildTimelineLayout(
    16,
    () => ({ before: [], baseWidth: 20, after: [] }),
    110,
  ),
  blockInset: 10,
  trackHeight: 48,
  slotHeight: 24,
};

function rectangle(
  overrides: Partial<RectanglePlacement> & {
    id: string;
    trackId: string;
    start: number;
  },
): RectanglePlacement {
  return {
    kind: "rectangle",
    length: 1,
    cooperativeSkip: false,
    duration: 1,
    durationUnit: "beats",
    syncBeatsToCellSpan: false,
    ...DEFAULT_RECT_GEOMETRY,
    color: DEFAULT_RECT_COLOR,
    ...overrides,
  };
}

function camera(
  overrides: Partial<TimedPlacement> & { id: string; trackId: string },
): TimedPlacement {
  return {
    kind: "camera",
    start: 0,
    length: 1,
    cooperativeSkip: false,
    duration: 1,
    durationUnit: "beats",
    syncBeatsToCellSpan: false,
    ...overrides,
  };
}

function addition(
  overrides: Partial<AdditionPlacement> & { id: string; trackId: string },
): AdditionPlacement {
  return {
    kind: "addition",
    start: 0,
    length: 1,
    cooperativeSkip: false,
    inputA: 0,
    inputB: 0,
    ...overrides,
  };
}

describe("slotWires", () => {
  it("returns nothing when no block references a slot", () => {
    expect(slotWires(rows, [], layout)).toEqual([]);
    expect(
      slotWires(
        rows,
        [rectangle({ id: "r", trackId: "first", start: 0 })],
        layout,
      ),
    ).toEqual([]);
  });

  it("runs from the block's bottom edge to the slot row", () => {
    const block = rectangle({
      id: "r",
      trackId: "first",
      start: 2,
      slotBindings: { x: "first-slot" },
    });

    expect(slotWires(rows, [block], layout)).toEqual([
      { key: "r:x", x: 308, blockBottomY: 38, slotY: 60 },
    ]);
  });

  it("ignores bindings on a kind without slot-capable properties", () => {
    const block = camera({
      id: "camera",
      trackId: "first",
      slotBindings: { x: "first-slot" },
    });

    expect(slotWires(rows, [block], layout)).toEqual([]);
  });

  it("gives every parameter its own lane even when they share a slot", () => {
    const block = rectangle({
      id: "r",
      trackId: "first",
      start: 1,
      slotBindings: { x: "first-slot", y: "first-slot", w: "first-slot" },
    });

    expect(slotWires(rows, [block], layout)).toEqual([
      { key: "r:x", x: 178, blockBottomY: 38, slotY: 60 },
      { key: "r:y", x: 196, blockBottomY: 38, slotY: 60 },
      { key: "r:w", x: 214, blockBottomY: 38, slotY: 60 },
    ]);
  });

  it("spreads wires to different slots into separate lanes", () => {
    const block = rectangle({
      id: "r",
      trackId: "second",
      start: 0,
      slotBindings: { x: "second-slot", h: "shared-slot" },
    });

    expect(slotWires(rows, [block], layout)).toEqual([
      { key: "r:x", x: 48, blockBottomY: 110, slotY: 132 },
      { key: "r:h", x: 102, blockBottomY: 110, slotY: 156 },
    ]);
  });

  it("spreads three wires into three lanes in the same column", () => {
    const block = rectangle({
      id: "r",
      trackId: "first",
      start: 0,
      slotBindings: {
        x: "first-slot",
        y: "second-slot",
        h: "shared-slot",
      },
    });

    expect(slotWires(rows, [block], layout)).toEqual([
      { key: "r:x", x: 48, blockBottomY: 38, slotY: 60 },
      { key: "r:y", x: 66, blockBottomY: 38, slotY: 132 },
      { key: "r:h", x: 102, blockBottomY: 38, slotY: 156 },
    ]);
  });

  it("gives blocks in the same column separate lanes", () => {
    const blocks: readonly Placement[] = [
      rectangle({
        id: "a",
        trackId: "first",
        start: 0,
        slotBindings: { x: "shared-slot" },
      }),
      rectangle({
        id: "b",
        trackId: "second",
        start: 0,
        slotBindings: { y: "shared-slot" },
      }),
    ];

    expect(slotWires(rows, blocks, layout)).toEqual([
      { key: "a:x", x: 40, blockBottomY: 38, slotY: 156 },
      { key: "b:y", x: 90, blockBottomY: 110, slotY: 156 },
    ]);
  });

  it("gives blocks in different columns independent lanes", () => {
    const blocks: readonly Placement[] = [
      rectangle({
        id: "a",
        trackId: "first",
        start: 0,
        slotBindings: { x: "shared-slot" },
      }),
      rectangle({
        id: "b",
        trackId: "second",
        start: 4,
        slotBindings: { y: "shared-slot" },
      }),
    ];

    expect(slotWires(rows, blocks, layout)).toEqual([
      { key: "a:x", x: 48, blockBottomY: 38, slotY: 156 },
      { key: "b:y", x: 586, blockBottomY: 110, slotY: 156 },
    ]);
  });

  it("skips a binding whose slot row no longer exists", () => {
    const block = rectangle({
      id: "r",
      trackId: "first",
      start: 0,
      slotBindings: { x: "removed" },
    });

    expect(slotWires(rows, [block], layout)).toEqual([]);
  });

  it("spreads only input properties into lanes for a block with an output", () => {
    const block = addition({
      id: "sum",
      trackId: "first",
      start: 0,
      slotBindings: {
        a: "first-slot",
        b: "second-slot",
        out: "shared-slot",
      },
    });

    expect(slotWires(rows, [block], layout)).toEqual([
      { key: "sum:a", x: 60, blockBottomY: 38, slotY: 60 },
      { key: "sum:b", x: 90, blockBottomY: 38, slotY: 132 },
    ]);
  });
});

describe("outputWires", () => {
  it("runs from the block's right edge to the assignment gap", () => {
    const block = addition({
      id: "sum",
      trackId: "first",
      start: 2,
      length: 3,
      slotBindings: { out: "shared-slot" },
    });

    expect(outputWires(rows, [block], layout)).toEqual([
      {
        key: "sum:out",
        blockRightX: 640,
        blockCenterY: 24,
        gapX: 660,
        slotY: 156,
      },
    ]);
  });

  it("uses the end time gap for a block starting in another column", () => {
    const block = addition({
      id: "sum",
      trackId: "second",
      start: 0,
      length: 1,
      slotBindings: { out: "second-slot" },
    });

    expect(outputWires(rows, [block], layout)).toEqual([
      {
        key: "sum:out",
        blockRightX: 120,
        blockCenterY: 96,
        gapX: 140,
        slotY: 132,
      },
    ]);
  });

  it("does not draw input bindings as output wires", () => {
    const block = addition({
      id: "sum",
      trackId: "first",
      start: 0,
      slotBindings: { a: "first-slot", b: "shared-slot" },
    });

    expect(outputWires(rows, [block], layout)).toEqual([]);
  });

  it("ignores an output binding on a kind without output properties", () => {
    const block = rectangle({
      id: "r",
      trackId: "first",
      start: 0,
      slotBindings: { out: "first-slot" },
    });

    expect(outputWires(rows, [block], layout)).toEqual([]);
  });

  it("skips an output binding whose slot row no longer exists", () => {
    const block = addition({
      id: "sum",
      trackId: "first",
      start: 0,
      slotBindings: { out: "removed" },
    });

    expect(outputWires(rows, [block], layout)).toEqual([]);
  });
});
