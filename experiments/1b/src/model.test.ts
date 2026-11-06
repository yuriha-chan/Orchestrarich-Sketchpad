import { describe, expect, it } from "vitest";
import type { Placement } from "./model";
import { canPlace, COLUMNS, intervalsOverlap, TRACKS } from "./model";

function placement(overrides: Partial<Placement> = {}): Placement {
  return {
    id: "placement-1",
    trackId: TRACKS[0].id,
    kind: "dialogue",
    start: 0,
    length: 1,
    cooperativeSkip: false,
    ...overrides,
  };
}

describe("intervalsOverlap", () => {
  it("treats touching intervals as separate", () => {
    expect(intervalsOverlap(0, 1, 1, 1)).toBe(false);
  });

  it("detects partial overlap", () => {
    expect(intervalsOverlap(0, 2, 1, 1)).toBe(true);
  });

  it("detects containment", () => {
    expect(intervalsOverlap(0, 4, 1, 1)).toBe(true);
  });
});

describe("canPlace", () => {
  it("accepts a free cell", () => {
    expect(canPlace([], placement())).toBe(true);
  });

  it("rejects an overlapping placement on the same track", () => {
    expect(canPlace([placement()], placement({ id: "placement-2" }))).toBe(false);
  });

  it("accepts the same interval on another track", () => {
    expect(
      canPlace([placement()], placement({ id: "placement-2", trackId: TRACKS[1].id })),
    ).toBe(true);
  });

  it("rejects placements outside the time range", () => {
    expect(canPlace([], placement({ start: -1 }))).toBe(false);
    expect(canPlace([], placement({ start: COLUMNS }))).toBe(false);
    expect(canPlace([], placement({ start: COLUMNS - 1, length: 2 }))).toBe(false);
  });

  it("allows a block to keep its own interval when it is ignored", () => {
    const existing = placement({ id: "placement-1", start: 2, length: 2 });
    expect(canPlace([existing], placement({ start: 3, length: 2 }), existing.id)).toBe(true);
  });

  it("rejects an unknown track", () => {
    expect(canPlace([], placement({ trackId: "missing" }))).toBe(false);
  });
});
