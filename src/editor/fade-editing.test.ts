import { describe, expect, it } from "vitest";
import { generateDotGradientSVG } from "./dot-gradient";
import { dragFadeBoundary, fadeBoundaries } from "./fade-editing";
import type { MediaPlacement } from "./model";

const clip: MediaPlacement = {
  id: "clip", trackId: "sound", kind: "sound", start: 0, length: 6,
  cooperativeSkip: false, duration: 6, durationUnit: "beats",
  syncBeatsToCellSpan: false, fadeIn: 1, fadeOut: 2,
};

describe("phase boundary editing", () => {
  it("exposes both internal fade boundaries", () => {
    expect(fadeBoundaries(clip)).toEqual([
      { boundary: "fadeIn", offset: 1 },
      { boundary: "fadeOut", offset: 4 },
    ]);
  });

  it("moves fade-in without changing fade-out or crossing it", () => {
    expect(dragFadeBoundary("fadeIn", 3, 6, 1, 2)).toEqual({ fadeIn: 3, fadeOut: 2 });
    expect(dragFadeBoundary("fadeIn", 9, 6, 1, 2)).toEqual({ fadeIn: 4, fadeOut: 2 });
    expect(dragFadeBoundary("fadeIn", -2, 6, 1, 2)).toEqual({ fadeIn: 0, fadeOut: 2 });
  });

  it("moves fade-out without changing fade-in or crossing it", () => {
    expect(dragFadeBoundary("fadeOut", 3, 6, 1, 2)).toEqual({ fadeIn: 1, fadeOut: 3 });
    expect(dragFadeBoundary("fadeOut", -2, 6, 1, 2)).toEqual({ fadeIn: 1, fadeOut: 5 });
    expect(dragFadeBoundary("fadeOut", 9, 6, 1, 2)).toEqual({ fadeIn: 1, fadeOut: 0 });
  });

  it("moves a shared boundary between adjacent fades", () => {
    expect(fadeBoundaries({ ...clip, fadeIn: 4 })).toEqual([
      { boundary: "shared", offset: 4 },
    ]);
    expect(dragFadeBoundary("shared", 2, 6, 4, 2)).toEqual({ fadeIn: 2, fadeOut: 4 });
  });

  it("has no internal boundary for a single phase", () => {
    expect(fadeBoundaries({ ...clip, fadeIn: 0, fadeOut: 0 })).toEqual([]);
    expect(fadeBoundaries({ ...clip, fadeIn: 6, fadeOut: 0 })).toEqual([]);
  });
});

describe("dot fade mask", () => {
  it("uses the supplied pattern with linear radii", () => {
    const svg = generateDotGradientSVG(24, 6, 6, 3, 0.25);
    expect(svg).toContain('cx="3" cy="3" r="3.000"');
    expect(svg).toContain('cx="9" cy="3" r="2.083"');
    expect(svg).toContain('cx="15" cy="3" r="1.167"');
    expect(svg).toContain('cx="21" cy="3" r="0.250"');
  });
});
