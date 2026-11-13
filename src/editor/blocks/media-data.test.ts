import { describe, expect, it } from "vitest";

import {
  clampFadesToLength,
  fadeBoundaries,
  mediaPhases,
  onMediaLengthChange,
  type MediaData,
} from "./media-data";

describe("clampFadesToLength", () => {
  it("keeps fades that fit inside the block", () => {
    expect(clampFadesToLength(1, 2, 4)).toEqual({ fadeIn: 1, fadeOut: 2 });
  });

  it("shrinks both fades proportionally when they exceed the block", () => {
    expect(clampFadesToLength(3, 3, 4)).toEqual({ fadeIn: 2, fadeOut: 2 });
  });

  it("drops negative and fractional cell counts", () => {
    expect(clampFadesToLength(-2, 1.8, 5)).toEqual({ fadeIn: 0, fadeOut: 1 });
  });

  it("clamps the sum to the block length", () => {
    expect(clampFadesToLength(0, 9, 3)).toEqual({ fadeIn: 0, fadeOut: 3 });
  });
});

describe("mediaPhases", () => {
  it("splits a block into fade-in, body, and fade-out phases", () => {
    expect(mediaPhases(1, 1, 4)).toEqual([
      { index: 0, offset: 0, length: 1 },
      { index: 1, offset: 1, length: 2 },
      { index: 2, offset: 3, length: 1 },
    ]);
  });

  it("omits the body when the fades meet", () => {
    expect(mediaPhases(2, 2, 4)).toEqual([
      { index: 0, offset: 0, length: 2 },
      { index: 1, offset: 2, length: 2 },
    ]);
  });

  it("returns one phase when the block has no fades", () => {
    expect(mediaPhases(0, 0, 3)).toEqual([
      { index: 0, offset: 0, length: 3 },
    ]);
  });

  it("omits a zero-length fade", () => {
    expect(mediaPhases(0, 1, 3)).toEqual([
      { index: 0, offset: 0, length: 2 },
      { index: 1, offset: 2, length: 1 },
    ]);
  });
});

describe("fadeBoundaries", () => {
  it("reports separate fade-in and fade-out boundaries", () => {
    expect(fadeBoundaries(1, 1, 4)).toEqual([
      { boundary: "fadeIn", offset: 1 },
      { boundary: "fadeOut", offset: 3 },
    ]);
  });

  it("reports one shared boundary when the fades meet", () => {
    expect(fadeBoundaries(2, 2, 4)).toEqual([
      { boundary: "shared", offset: 2 },
    ]);
  });

  it("reports no boundary for a full-block fade", () => {
    expect(fadeBoundaries(3, 0, 3)).toEqual([]);
    expect(fadeBoundaries(0, 3, 3)).toEqual([]);
  });
});

describe("onMediaLengthChange", () => {
  it("follows the span when the duration is synced", () => {
    const data: MediaData = {
      duration: 6,
      durationUnit: "beats",
      syncBeatsToCellSpan: true,
      fadeIn: 0,
      fadeOut: 0,
    };
    expect(onMediaLengthChange(data, 4)).toEqual({
      duration: 4,
      durationUnit: "beats",
      syncBeatsToCellSpan: true,
      fadeIn: 0,
      fadeOut: 0,
    });
  });

  it("clamps fades to the new length", () => {
    const data: MediaData = {
      duration: 4,
      durationUnit: "seconds",
      syncBeatsToCellSpan: false,
      fadeIn: 3,
      fadeOut: 3,
    };
    expect(onMediaLengthChange(data, 4)).toEqual({
      duration: 4,
      durationUnit: "seconds",
      syncBeatsToCellSpan: false,
      fadeIn: 2,
      fadeOut: 2,
    });
  });
});
