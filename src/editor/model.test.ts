import { describe, expect, it } from "vitest";
import type {
  DialoguePlacement,
  MediaPlacement,
  RectanglePlacement,
  TimedPlacement,
} from "./model";
import {
  beatsToSeconds,
  blockDurationSeconds,
  canPlace,
  clampFadesToLength,
  convertDuration,
  convertPlacementKind,
  DEFAULT_TRACKS,
  intervalsOverlap,
  mediaPhases,
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
    expect(canPlace(DEFAULT_TRACKS, [], dialogue())).toBe(true);
  });

  it("rejects an overlapping placement on the same track", () => {
    expect(
      canPlace(DEFAULT_TRACKS, [dialogue()], dialogue({ id: "placement-2" })),
    ).toBe(false);
  });

  it("accepts the same interval on another track", () => {
    expect(
      canPlace(
        DEFAULT_TRACKS,
        [dialogue()],
        dialogue({ id: "placement-2", trackId: DEFAULT_TRACKS[1].id }),
      ),
    ).toBe(true);
  });

  it("rejects a negative start or an empty length", () => {
    expect(canPlace(DEFAULT_TRACKS, [], dialogue({ start: -1 }))).toBe(false);
    expect(canPlace(DEFAULT_TRACKS, [], dialogue({ length: 0 }))).toBe(false);
  });

  it("accepts a placement beyond the initially rendered columns", () => {
    expect(
      canPlace(DEFAULT_TRACKS, [], dialogue({ start: 1000, length: 2 })),
    ).toBe(true);
  });

  it("allows a block to keep its own interval when it is ignored", () => {
    const existing = dialogue({ id: "placement-1", start: 2, length: 2 });
    expect(
      canPlace(
        DEFAULT_TRACKS,
        [existing],
        dialogue({ start: 3, length: 2 }),
        existing.id,
      ),
    ).toBe(true);
  });

  it("rejects a track that is not in the timeline", () => {
    expect(
      canPlace(DEFAULT_TRACKS, [], dialogue({ trackId: "missing" })),
    ).toBe(false);
  });

  it("accepts a track supplied by the timeline", () => {
    const tracks = [...DEFAULT_TRACKS, { id: "extra", label: "Extra" }];
    expect(canPlace(tracks, [], dialogue({ trackId: "extra" }))).toBe(true);
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
