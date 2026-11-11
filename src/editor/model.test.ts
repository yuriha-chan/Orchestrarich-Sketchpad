import { describe, expect, it } from "vitest";
import type {
  AdditionPlacement,
  DialoguePlacement,
  LoopRegion,
  MediaPlacement,
  RectanglePlacement,
  TimedPlacement,
  Track,
} from "./model";
import {
  beatsToSeconds,
  blockDurationSeconds,
  canPlace,
  clampFadesToLength,
  convertDuration,
  convertPlacementKind,
  DEFAULT_RECT_COLOR,
  DEFAULT_TRACKS,
  intervalsOverlap,
  mediaPhases,
  nextFreeStart,
  partiallyOverlapsLoop,
  phaseBlockId,
  secondsToBeats,
} from "./model";

function dialogue(overrides: Partial<DialoguePlacement> = {}): DialoguePlacement {
  return {
    id: "placement-1",
    trackId: DEFAULT_TRACKS[0].id,
    kind: "dialogue",
    start: 0,
    length: 1,
    cooperativeSkip: false,
    ...overrides,
  };
}

function timed(overrides: Partial<TimedPlacement> = {}): TimedPlacement {
  return {
    id: "placement-1",
    trackId: DEFAULT_TRACKS[0].id,
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

function media(overrides: Partial<MediaPlacement> = {}): MediaPlacement {
  return {
    id: "placement-1",
    trackId: DEFAULT_TRACKS[2].id,
    kind: "sound",
    start: 0,
    length: 1,
    cooperativeSkip: false,
    duration: 1,
    durationUnit: "beats",
    syncBeatsToCellSpan: false,
    fadeIn: 0,
    fadeOut: 0,
    ...overrides,
  };
}

function addition(
  overrides: Partial<AdditionPlacement> = {},
): AdditionPlacement {
  return {
    id: "addition-1",
    kind: "addition",
    trackId: "dialogue",
    start: 0,
    length: 1,
    cooperativeSkip: false,
    inputA: 0,
    inputB: 0,
    ...overrides,
  };
}

function rectangle(overrides: Partial<RectanglePlacement> = {}): RectanglePlacement {
  return {
    id: "placement-1",
    trackId: DEFAULT_TRACKS[0].id,
    kind: "rectangle",
    start: 0,
    length: 1,
    cooperativeSkip: false,
    duration: 1,
    durationUnit: "beats",
    syncBeatsToCellSpan: false,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rectUnit: "span",
    color: DEFAULT_RECT_COLOR,
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
    expect(canPlace(DEFAULT_TRACKS, [], dialogue(), [])).toBe(true);
  });

  it("rejects an overlapping placement on the same track", () => {
    expect(
      canPlace(DEFAULT_TRACKS, [dialogue()], dialogue({ id: "placement-2" }), []),
    ).toBe(false);
  });

  it("accepts the same interval on another track", () => {
    expect(
      canPlace(
        DEFAULT_TRACKS,
        [dialogue()],
        dialogue({ id: "placement-2", trackId: DEFAULT_TRACKS[1].id }),
        [],
      ),
    ).toBe(true);
  });

  it("rejects a negative start or an empty length", () => {
    expect(canPlace(DEFAULT_TRACKS, [], dialogue({ start: -1 }), [])).toBe(false);
    expect(canPlace(DEFAULT_TRACKS, [], dialogue({ length: 0 }), [])).toBe(false);
  });

  it("accepts a placement beyond the initially rendered columns", () => {
    expect(
      canPlace(DEFAULT_TRACKS, [], dialogue({ start: 1000, length: 2 }), []),
    ).toBe(true);
  });

  it("allows a block to keep its own interval when it is ignored", () => {
    const existing = dialogue({ id: "placement-1", start: 2, length: 2 });
    expect(
      canPlace(
        DEFAULT_TRACKS,
        [existing],
        dialogue({ start: 3, length: 2 }),
        [],
        existing.id,
      ),
    ).toBe(true);
  });

  it("rejects a track that is not in the timeline", () => {
    expect(
      canPlace(DEFAULT_TRACKS, [], dialogue({ trackId: "missing" }), []),
    ).toBe(false);
  });

  it("accepts a track supplied by the timeline", () => {
    const tracks: readonly Track[] = [
      ...DEFAULT_TRACKS,
      { id: "extra", label: "Extra", color: "#d97706" },
    ];
    expect(canPlace(tracks, [], dialogue({ trackId: "extra" }), [])).toBe(true);
  });
});

describe("loop regions", () => {
  const loop: LoopRegion = { start: 2, end: 5 };

  it("does not constrain placements when there is no loop", () => {
    expect(partiallyOverlapsLoop(3, 3, null)).toBe(false);
    expect(
      canPlace(DEFAULT_TRACKS, [], dialogue({ start: 3, length: 3 }), []),
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
        dialogue({ trackId: DEFAULT_TRACKS[2].id, start: 3, length: 3 }),
        [loop],
      ),
    ).toBe(false);
    expect(
      canPlace(
        DEFAULT_TRACKS,
        [],
        dialogue({ trackId: DEFAULT_TRACKS[2].id, start: 2, length: 2 }),
        [loop],
      ),
    ).toBe(true);
  });
});

describe("duration", () => {
  it("lets a beats duration follow the BPM", () => {
    const block = timed({ duration: 2, durationUnit: "beats" });
    expect(blockDurationSeconds(block, 120)).toBe(1);
    expect(blockDurationSeconds(block, 60)).toBe(2);
  });

  it("keeps a seconds duration independent of the BPM", () => {
    const block = timed({ duration: 2, durationUnit: "seconds" });
    expect(blockDurationSeconds(block, 120)).toBe(2);
    expect(blockDurationSeconds(block, 60)).toBe(2);
  });

  it("derives a synced duration from the cell span in beats", () => {
    const block = timed({
      length: 2,
      duration: 3,
      durationUnit: "beats",
      syncBeatsToCellSpan: true,
    });
    expect(blockDurationSeconds(block, 120)).toBe(1);
    expect(blockDurationSeconds(block, 60)).toBe(2);
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

describe("convertPlacementKind", () => {
  it("gives a timed kind a duration when a dialogue becomes timed", () => {
    const converted = convertPlacementKind(
      dialogue({ start: 1, length: 2 }),
      "wait",
    );
    expect(converted).toMatchObject({
      kind: "wait",
      start: 1,
      length: 2,
      duration: 2,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
    });
  });

  it("drops the duration properties when a timed block becomes a dialogue", () => {
    const converted = convertPlacementKind(
      timed({ length: 2, duration: 3, durationUnit: "seconds" }),
      "dialogue",
    );
    expect(converted.kind).toBe("dialogue");
    expect("duration" in converted).toBe(false);
    expect("durationUnit" in converted).toBe(false);
    expect("syncBeatsToCellSpan" in converted).toBe(false);
  });

  it("keeps the duration when only the timed kind changes", () => {
    const converted = convertPlacementKind(
      media({ duration: 3, durationUnit: "seconds" }),
      "camera",
    );
    expect(converted).toMatchObject({
      kind: "camera",
      duration: 3,
      durationUnit: "seconds",
    });
    expect("fadeIn" in converted).toBe(false);
    expect("fadeOut" in converted).toBe(false);
  });

  it("adds empty fades when a timed block becomes media", () => {
    const converted = convertPlacementKind(
      timed({ duration: 2, durationUnit: "beats" }),
      "animation",
    );
    expect(converted).toMatchObject({
      kind: "animation",
      duration: 2,
      fadeIn: 0,
      fadeOut: 0,
    });
  });

  it("keeps fades when the media kind changes", () => {
    const converted = convertPlacementKind(
      media({ length: 3, fadeIn: 1, fadeOut: 2 }),
      "animation",
    );
    expect(converted).toMatchObject({
      kind: "animation",
      fadeIn: 1,
      fadeOut: 2,
    });
  });

  it("gives a rectangle geometry and a duration when a dialogue becomes a rectangle", () => {
    const converted = convertPlacementKind(
      dialogue({ start: 1, length: 2 }),
      "rectangle",
    );
    expect(converted).toMatchObject({
      kind: "rectangle",
      duration: 2,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rectUnit: "span",
      color: DEFAULT_RECT_COLOR,
    });
  });

  it("keeps the duration and drops fades when a media block becomes a rectangle", () => {
    const converted = convertPlacementKind(
      media({ duration: 3, durationUnit: "seconds", fadeIn: 1, fadeOut: 2 }),
      "rectangle",
    );
    expect(converted).toMatchObject({
      kind: "rectangle",
      duration: 3,
      durationUnit: "seconds",
      rectUnit: "span",
    });
    expect("fadeIn" in converted).toBe(false);
  });

  it("drops geometry when a rectangle becomes a timed kind", () => {
    const converted = convertPlacementKind(
      rectangle({ x: 3, y: 2, w: 2, h: 1, rectUnit: "pixels" }),
      "camera",
    );
    expect(converted.kind).toBe("camera");
    expect("x" in converted).toBe(false);
    expect("rectUnit" in converted).toBe(false);
    expect("color" in converted).toBe(false);
  });
  it("drops slot bindings the new kind does not expose", () => {
    const converted = convertPlacementKind(
      rectangle({ slotBindings: { x: "x-slot", h: "h-slot" } }),
      "camera",
    );
    expect("slotBindings" in converted).toBe(false);
  });
});

describe("fades", () => {
  it("keeps fades within the block length", () => {
    expect(clampFadesToLength(1, 2, 4)).toEqual({ fadeIn: 1, fadeOut: 2 });
    expect(clampFadesToLength(0, 0, 4)).toEqual({ fadeIn: 0, fadeOut: 0 });
    expect(clampFadesToLength(3, 3, 4)).toEqual({ fadeIn: 2, fadeOut: 2 });
  });

  it("splits a media block into fade and body phases", () => {
    expect(mediaPhases(1, 1, 4)).toEqual([
      { index: 0, offset: 0, length: 1 },
      { index: 1, offset: 1, length: 2 },
      { index: 2, offset: 3, length: 1 },
    ]);
  });

  it("omits a zero-length body when the fades cover the block", () => {
    expect(mediaPhases(1, 2, 3)).toEqual([
      { index: 0, offset: 0, length: 1 },
      { index: 1, offset: 1, length: 2 },
    ]);
  });

  it("leaves a block without fades as one phase", () => {
    expect(mediaPhases(0, 0, 3)).toEqual([
      { index: 0, offset: 0, length: 3 },
    ]);
  });

  it("names phase blocks from the placement id", () => {
    expect(phaseBlockId("clip", 0)).toBe("clip~0");
    expect(phaseBlockId("clip", 2)).toBe("clip~2");
  });
});

describe("addition kind conversion", () => {
  it("gives an addition zero inputs when another kind becomes an addition", () => {
    const converted = convertPlacementKind(
      timed({ duration: 2, durationUnit: "seconds" }),
      "addition",
    );

    expect(converted).toMatchObject({
      kind: "addition",
      inputA: 0,
      inputB: 0,
    });
    expect("duration" in converted).toBe(false);
    expect("durationUnit" in converted).toBe(false);
  });

  it("gives an addition a span duration when it becomes a timed block", () => {
    const converted = convertPlacementKind(
      addition({ length: 3, inputA: 2, inputB: 3 }),
      "camera",
    );

    expect(converted).toMatchObject({
      kind: "camera",
      duration: 3,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
    });
    expect("inputA" in converted).toBe(false);
  });

  it("keeps the addition inputs and bindings when the kind stays an addition", () => {
    const source = addition({
      inputA: 2,
      inputB: 3,
      slotBindings: { a: "left", out: "sum" },
    });

    expect(convertPlacementKind(source, "addition")).toBe(source);
  });

  it("drops the addition inputs and output binding when it becomes a camera", () => {
    const converted = convertPlacementKind(
      addition({
        inputA: 2,
        inputB: 3,
        slotBindings: { a: "left", out: "sum" },
      }),
      "camera",
    );

    expect(converted.kind).toBe("camera");
    expect("inputA" in converted).toBe(false);
    expect("inputB" in converted).toBe(false);
    expect("slotBindings" in converted).toBe(false);
  });

  it("drops rectangle bindings when a rectangle becomes an addition", () => {
    const converted = convertPlacementKind(
      rectangle({ slotBindings: { x: "left" } }),
      "addition",
    );

    expect(converted.kind).toBe("addition");
    expect("slotBindings" in converted).toBe(false);
  });
});

describe("nextFreeStart", () => {
  const trackId = DEFAULT_TRACKS[0].id;
  const otherTrack = DEFAULT_TRACKS[1].id;

  it("uses the requested start when the space is free", () => {
    expect(nextFreeStart([], trackId, 3, 2, [])).toBe(3);
  });

  it("places a duplicate directly after an adjacent block", () => {
    const block = timed({ id: "placement-1", trackId, start: 0, length: 2 });

    expect(nextFreeStart([block], trackId, 2, 2, [])).toBe(2);
  });

  it("skips a following block and uses the space behind it", () => {
    const source = timed({ id: "placement-1", trackId, start: 0, length: 2 });
    const occupant = timed({ id: "placement-2", trackId, start: 2, length: 3 });

    expect(nextFreeStart([source, occupant], trackId, 2, 2, [])).toBe(5);
  });

  it("takes an earlier gap that fits when it is the first one", () => {
    const source = timed({ id: "placement-1", trackId, start: 0, length: 2 });
    const occupant = timed({ id: "placement-2", trackId, start: 4, length: 1 });

    expect(nextFreeStart([source, occupant], trackId, 2, 2, [])).toBe(2);
  });

  it("ignores blocks on other tracks", () => {
    const source = timed({ id: "placement-1", trackId, start: 0, length: 2 });
    const occupant = timed({
      id: "placement-2",
      trackId: otherTrack,
      start: 2,
      length: 3,
    });

    expect(nextFreeStart([source, occupant], trackId, 2, 2, [])).toBe(2);
  });

  it("pushes past a block that overlaps the requested start", () => {
    const source = timed({ id: "placement-1", trackId, start: 0, length: 1 });
    const occupant = timed({ id: "placement-2", trackId, start: 3, length: 2 });
    const later = timed({ id: "placement-3", trackId, start: 3, length: 4 });

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
