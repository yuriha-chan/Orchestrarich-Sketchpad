import { describe, expect, it } from "vitest";
import {
  validateNumericSlotReads,
  type NumericSlot,
  type NumericSlotRead,
} from "../core/slots/numeric-slots";
import type { LoopNode } from "./loops";
import { liveNumericSlots, slotGapExists } from "./slot-gaps";

const loops: LoopNode[] = [
  {
    id: "outer",
    start: 0,
    end: 8,
    children: [{ id: "inner", start: 2, end: 4, children: [] }],
  },
];

describe("slotGapExists", () => {
  it("accepts the outside context of a loop boundary", () => {
    expect(slotGapExists(loops, 0, [])).toBe(true);
  });

  it("accepts a context inside a loop", () => {
    expect(slotGapExists(loops, 0, ["outer"])).toBe(true);
    expect(slotGapExists(loops, 2, ["outer", "inner"])).toBe(true);
  });

  it("rejects a context that the boundary does not contain", () => {
    expect(slotGapExists(loops, 0, ["inner"])).toBe(false);
    expect(slotGapExists(loops, 0, ["missing"])).toBe(false);
  });
});

describe("liveNumericSlots", () => {
  it("drops initializations whose gap disappeared", () => {
    const slots: NumericSlot[] = [
      {
        id: "speed",
        trackId: null,
        type: "number",
        initializations: [
          { boundary: 0, path: ["gone"], value: 1 },
          { boundary: 0, path: [], value: 2 },
        ],
      },
    ];

    expect(liveNumericSlots(slots, loops)[0].initializations).toEqual([
      { boundary: 0, path: [], value: 2 },
    ]);
  });

  it("keeps initializations whose gaps still exist", () => {
    const slots: NumericSlot[] = [
      {
        id: "speed",
        trackId: null,
        type: "number",
        initializations: [{ boundary: 2, path: ["outer", "inner"], value: 3 }],
      },
    ];

    expect(liveNumericSlots(slots, loops)[0].initializations).toEqual([
      { boundary: 2, path: ["outer", "inner"], value: 3 },
    ]);
  });

  it("does not mutate the input slots while pruning", () => {
    const slots: NumericSlot[] = [
      {
        id: "speed",
        trackId: null,
        type: "number",
        initializations: [
          { boundary: 0, path: ["gone"], value: 1 },
          { boundary: 0, path: [], value: 2 },
        ],
      },
    ];
    const before = structuredClone(slots);

    const live = liveNumericSlots(slots, loops);

    expect(slots).toEqual(before);
    expect(live).not.toBe(slots);
    expect(live[0]).not.toBe(slots[0]);
    expect(live[0].initializations).toEqual([
      { boundary: 0, path: [], value: 2 },
    ]);
  });

  it("does not let a pruned orphan initialization satisfy a validation read", () => {
    const slots: NumericSlot[] = [
      {
        id: "speed",
        trackId: null,
        type: "number",
        initializations: [{ boundary: 0, path: ["gone"], value: 1 }],
      },
    ];
    const read: NumericSlotRead = {
      slotId: "speed",
      trackId: "dialogue",
      time: 0,
    };

    expect(validateNumericSlotReads(slots, [read])).toEqual([]);
    const live = liveNumericSlots(slots, loops);
    expect(validateNumericSlotReads(live, [read])).toEqual([read]);
  });
});
