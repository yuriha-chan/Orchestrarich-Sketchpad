import { describe, expect, it } from "vitest";

import {
  validateNumericSlotReads,
  type NumericSlot,
  type NumericSlotRead,
} from "./numeric-slots.ts";

function slot(
  id: string,
  trackId: string | null,
  initializations: { time: number; value: number }[] = [],
): NumericSlot {
  return { id, trackId, initializations };
}

function read(slotId: string, trackId: string, time: number): NumericSlotRead {
  return { slotId, trackId, time };
}

describe("validateNumericSlotReads", () => {
  it("returns no invalid reads for an empty read list", () => {
    expect(validateNumericSlotReads([], [])).toEqual([]);
  });

  it("accepts a read at the exact initialization time", () => {
    const slots = [slot("speed", "alice", [{ time: 3, value: 10 }])];

    expect(
      validateNumericSlotReads(slots, [read("speed", "alice", 3)]),
    ).toEqual([]);
  });

  it("accepts multiple reads at and after the initialization boundary", () => {
    const slots = [slot("speed", "alice", [{ time: 3, value: 10 }])];
    const reads = [
      read("speed", "alice", 3),
      read("speed", "alice", 4),
      read("speed", "alice", 9),
    ];

    expect(validateNumericSlotReads(slots, reads)).toEqual([]);
  });

  it("rejects a read earlier than the first initialization", () => {
    const slots = [
      slot("speed", "alice", [
        { time: 3, value: 10 },
        { time: 7, value: 20 },
      ]),
    ];
    const earlier = read("speed", "alice", 2);

    expect(validateNumericSlotReads(slots, [earlier])).toEqual([earlier]);
  });

  it("accepts a read between two initializations", () => {
    const slots = [
      slot("speed", "alice", [
        { time: 3, value: 10 },
        { time: 7, value: 20 },
      ]),
    ];

    expect(
      validateNumericSlotReads(slots, [read("speed", "alice", 5)]),
    ).toEqual([]);
  });

  it("accepts a read at a later initialization boundary", () => {
    const slots = [
      slot("speed", "alice", [
        { time: 3, value: 10 },
        { time: 7, value: 20 },
      ]),
    ];

    expect(
      validateNumericSlotReads(slots, [read("speed", "alice", 7)]),
    ).toEqual([]);
  });

  it("rejects a read of a slot without an initialization", () => {
    const slots = [slot("speed", "alice")];
    const missing = read("speed", "alice", 10);

    expect(validateNumericSlotReads(slots, [missing])).toEqual([missing]);
  });

  it("rejects a read of a nonexistent slot", () => {
    const missing = read("missing", "alice", 0);

    expect(validateNumericSlotReads([], [missing])).toEqual([missing]);
  });

  it("rejects a read of a track slot from another track", () => {
    const slots = [slot("speed", "bob", [{ time: 0, value: 5 }])];
    const inaccessible = read("speed", "alice", 5);

    expect(validateNumericSlotReads(slots, [inaccessible])).toEqual([
      inaccessible,
    ]);
  });

  it("accepts reads of track slots from the same track", () => {
    const slots = [
      slot("speed", "alice", [{ time: 0, value: 5 }]),
      slot("health", "alice", [{ time: 0, value: 6 }]),
    ];

    expect(
      validateNumericSlotReads(slots, [
        read("speed", "alice", 0),
        read("health", "alice", 1),
      ]),
    ).toEqual([]);
  });

  it("accepts shared slot reads from any track", () => {
    const slots = [slot("shared", null, [{ time: 1, value: 3 }])];

    expect(
      validateNumericSlotReads(slots, [
        read("shared", "alice", 1),
        read("shared", "bob", 2),
        read("shared", "carol", 5),
      ]),
    ).toEqual([]);
  });

  it("returns only invalid reads in input order", () => {
    const slots = [
      slot("valid", "alice", [{ time: 0, value: 1 }]),
      slot("late", "alice", [{ time: 5, value: 2 }]),
      slot("other", "bob", [{ time: 0, value: 3 }]),
    ];
    const reads = [
      read("valid", "alice", 1),
      read("late", "alice", 4),
      read("missing", "alice", 0),
      read("valid", "alice", 0),
      read("other", "alice", 0),
    ];

    expect(validateNumericSlotReads(slots, reads)).toEqual([
      reads[1],
      reads[2],
      reads[4],
    ]);
  });
});
