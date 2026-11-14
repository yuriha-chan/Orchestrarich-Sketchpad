import { describe, expect, it } from "vitest";
import type { LoopRegion, Placement, Track } from "./model";
import {
  beatsToSeconds,
  blockDurationSeconds,
  canPlace,
  convertDuration,
  DEFAULT_TRACKS,
  intervalsOverlap,
  nextFreeStart,
  partiallyOverlapsLoop,
  secondsToBeats,
  toInteger,
} from "./model";

type BlockOverrides = Omit<Partial<Placement>, "start" | "length"> & {
  start?: number;
  length?: number;
};

function block(overrides: BlockOverrides = {}): Placement {
  const { start = 0, length = 1, ...rest } = overrides;
  return {
    id: "placement-1",
    trackId: DEFAULT_TRACKS[0].id,
    kind: "dialogue",
    start: toInteger(start),
    length: toInteger(length),
    cooperativeSkip: false,
    data: {},
    ...rest,
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
    expect(canPlace(DEFAULT_TRACKS, [], block(), [])).toBe(true);
  });

  it("rejects an overlapping placement on the same track", () => {
    expect(
      canPlace(DEFAULT_TRACKS, [block()], block({ id: "placement-2" }), []),
    ).toBe(false);
  });

  it("accepts the same interval on another track", () => {
    expect(
      canPlace(
        DEFAULT_TRACKS,
        [block()],
        block({ id: "placement-2", trackId: DEFAULT_TRACKS[1].id }),
        [],
      ),
    ).toBe(true);
  });

  it("rejects a negative start or an empty length", () => {
    expect(canPlace(DEFAULT_TRACKS, [], block({ start: -1 }), [])).toBe(false);
    expect(canPlace(DEFAULT_TRACKS, [], block({ length: 0 }), [])).toBe(false);
  });

  it("accepts a placement beyond the initially rendered columns", () => {
    expect(
      canPlace(DEFAULT_TRACKS, [], block({ start: 1000, length: 2 }), []),
    ).toBe(true);
  });

  it("allows a block to keep its own interval when it is ignored", () => {
    const existing = block({ id: "placement-1", start: 2, length: 2 });
    expect(
      canPlace(
        DEFAULT_TRACKS,
        [existing],
        block({ start: 3, length: 2 }),
        [],
        existing.id,
      ),
    ).toBe(true);
  });

  it("rejects a track that is not in the timeline", () => {
    expect(
      canPlace(DEFAULT_TRACKS, [], block({ trackId: "missing" }), []),
    ).toBe(false);
  });

  it("accepts a track supplied by the timeline", () => {
    const tracks: readonly Track[] = [
      ...DEFAULT_TRACKS,
      { id: "extra", label: "Extra", color: "#d97706" },
    ];
    expect(canPlace(tracks, [], block({ trackId: "extra" }), [])).toBe(true);
  });
});

describe("loop regions", () => {
  const loop: LoopRegion = { start: 2, end: 5 };

  it("does not constrain placements when there is no loop", () => {
    expect(partiallyOverlapsLoop(3, 3, null)).toBe(false);
    expect(
      canPlace(DEFAULT_TRACKS, [], block({ start: 3, length: 3 }), []),
    ).toBe(true);
  });

  it("accepts a block entirely before the loop", () => {
    expect(partiallyOverlapsLoop(0, 2, loop)).toBe(false);
  });

  it("accepts a block ending exactly at the loop start", () => {
    expect(partiallyOverlapsLoop(0, 2, loop)).toBe(false);
  });

  it("accepts a block entirely inside the loop", () => {
    expect(partiallyOverlapsLoop(2, 3, loop)).toBe(false);
    expect(partiallyOverlapsLoop(3, 1, loop)).toBe(false);
  });

  it("accepts a block starting exactly at the loop end", () => {
    expect(partiallyOverlapsLoop(5, 2, loop)).toBe(false);
  });

  it("accepts a block that contains the entire loop", () => {
    expect(partiallyOverlapsLoop(0, 5, loop)).toBe(false);
    expect(partiallyOverlapsLoop(1, 6, loop)).toBe(false);
  });

  it("rejects a block that starts inside the loop and ends after it", () => {
    expect(partiallyOverlapsLoop(4, 2, loop)).toBe(true);
  });

  it("rejects a block that starts before the loop and ends inside it", () => {
    expect(partiallyOverlapsLoop(1, 2, loop)).toBe(true);
  });

  it("rejects a block that crosses only the loop start", () => {
    expect(partiallyOverlapsLoop(1, 3, loop)).toBe(true);
  });

  it("rejects a block that crosses only the loop end", () => {
    expect(partiallyOverlapsLoop(3, 4, loop)).toBe(true);
  });

  it("applies the loop rule to every track", () => {
    expect(
      canPlace(
        DEFAULT_TRACKS,
        [],
        block({ trackId: DEFAULT_TRACKS[2].id, start: 3, length: 3 }),
        [loop],
      ),
    ).toBe(false);
    expect(
      canPlace(
        DEFAULT_TRACKS,
        [],
        block({ trackId: DEFAULT_TRACKS[2].id, start: 2, length: 2 }),
        [loop],
      ),
    ).toBe(true);
  });
});

describe("duration", () => {
  it("lets a beats duration follow the BPM", () => {
    expect(blockDurationSeconds(2, "beats", 120)).toBe(1);
    expect(blockDurationSeconds(2, "beats", 60)).toBe(2);
  });

  it("keeps a seconds duration independent of the BPM", () => {
    expect(blockDurationSeconds(2, "seconds", 120)).toBe(2);
    expect(blockDurationSeconds(2, "seconds", 60)).toBe(2);
  });

  it("converts between beats and seconds with the timeline BPM", () => {
    expect(beatsToSeconds(2, 120)).toBe(1);
    expect(beatsToSeconds(3, 90)).toBe(2);
    expect(secondsToBeats(1, 120)).toBe(2);
    expect(convertDuration(2, "beats", "seconds", 120)).toBe(1);
    expect(convertDuration(1, "seconds", "beats", 120)).toBe(2);
    expect(convertDuration(5, "seconds", "seconds", 120)).toBe(5);
  });
});

describe("nextFreeStart", () => {
  const trackId = DEFAULT_TRACKS[0].id;
  const otherTrack = DEFAULT_TRACKS[1].id;

  it("uses the requested start when the space is free", () => {
    expect(nextFreeStart([], trackId, 3, 2, [])).toBe(3);
  });

  it("places a duplicate directly after an adjacent block", () => {
    const source = block({ id: "placement-1", trackId, start: 0, length: 2 });

    expect(nextFreeStart([source], trackId, 2, 2, [])).toBe(2);
  });

  it("skips a following block and uses the space behind it", () => {
    const source = block({ id: "placement-1", trackId, start: 0, length: 2 });
    const occupant = block({ id: "placement-2", trackId, start: 2, length: 3 });

    expect(nextFreeStart([source, occupant], trackId, 2, 2, [])).toBe(5);
  });

  it("takes an earlier gap that fits when it is the first one", () => {
    const source = block({ id: "placement-1", trackId, start: 0, length: 2 });
    const occupant = block({ id: "placement-2", trackId, start: 4, length: 1 });

    expect(nextFreeStart([source, occupant], trackId, 2, 2, [])).toBe(2);
  });

  it("ignores blocks on other tracks", () => {
    const source = block({ id: "placement-1", trackId, start: 0, length: 2 });
    const occupant = block({
      id: "placement-2",
      trackId: otherTrack,
      start: 2,
      length: 3,
    });

    expect(nextFreeStart([source, occupant], trackId, 2, 2, [])).toBe(2);
  });

  it("pushes past a block that overlaps the requested start", () => {
    const source = block({ id: "placement-1", trackId, start: 0, length: 1 });
    const occupant = block({ id: "placement-2", trackId, start: 3, length: 2 });
    const later = block({ id: "placement-3", trackId, start: 3, length: 4 });

    expect(nextFreeStart([source, occupant], trackId, 3, 3, [])).toBe(5);
    expect(nextFreeStart([source, later], trackId, 3, 3, [])).toBe(7);
  });

  it("skips a span that would cut a loop start", () => {
    expect(nextFreeStart([], trackId, 1, 2, [{ start: 2, end: 4 }])).toBe(2);
  });

  it("moves past a loop it would start inside and leave", () => {
    expect(nextFreeStart([], trackId, 2, 4, [{ start: 0, end: 4 }])).toBe(4);
  });

  it("allows a span inside or containing a loop", () => {
    expect(nextFreeStart([], trackId, 5, 2, [{ start: 4, end: 8 }])).toBe(5);
    expect(nextFreeStart([], trackId, 0, 10, [{ start: 4, end: 6 }])).toBe(0);
  });
});
