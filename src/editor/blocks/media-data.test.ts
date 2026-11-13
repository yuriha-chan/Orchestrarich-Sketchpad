import { describe, expect, it } from "vitest";

import type { FadeData, FadesPanelField } from "../block-definition";
import {
  clampFadesToLength,
  fadeBoundaries,
  mediaPhases,
  onMediaLengthChange,
  type MediaData,
} from "./media-data";
import { editFades, fadesField } from "./media-fades";

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

interface FreshFadeData extends FadeData {
  caption: string;
  lane: number;
}

function freshFadeData(): FreshFadeData {
  return { fadeIn: 1, fadeOut: 2, caption: "intro", lane: 7 };
}

const FADE_CONTEXT = { length: 4, bpm: 90, stageSpan: 16 };

describe("editFades", () => {
  it("edits the fade in and preserves the other fade and unrelated data", () => {
    const data = freshFadeData();
    expect(
      editFades(data, { kind: "fadeIn", value: 3 }, { length: 6 }),
    ).toEqual({ fadeIn: 3, fadeOut: 2, caption: "intro", lane: 7 });
    expect(data).toEqual(freshFadeData());
  });

  it("edits the fade out and preserves the other fade and unrelated data", () => {
    expect(
      editFades(freshFadeData(), { kind: "fadeOut", value: 4 }, { length: 6 }),
    ).toEqual({ fadeIn: 1, fadeOut: 4, caption: "intro", lane: 7 });
  });

  it("commits a 2/2 pair as 3/1 against the block length", () => {
    const data = { ...freshFadeData(), fadeIn: 2, fadeOut: 2 };
    expect(
      editFades(data, { kind: "pair", value: { fadeIn: 3, fadeOut: 1 } }, FADE_CONTEXT),
    ).toEqual({ fadeIn: 3, fadeOut: 1, caption: "intro", lane: 7 });
  });

  it("clamps an oversized one-fade edit to the block length", () => {
    expect(
      editFades(freshFadeData(), { kind: "fadeOut", value: 9 }, FADE_CONTEXT),
    ).toEqual({ fadeIn: 0, fadeOut: 4, caption: "intro", lane: 7 });
  });
});

describe("fades field", () => {
  it("reads the fade pair and commits edits through the operation", () => {
    const field = fadesField<FreshFadeData>();
    expect(field.kind).toBe("fades");
    expect(field.section).toBe("block");
    expect(field.key).toBe("fades");
    expect(field.label).toBe("Fades");
    expect(field.read(freshFadeData())).toEqual({ fadeIn: 1, fadeOut: 2 });
    expect(
      field.commit(
        freshFadeData(),
        { kind: "pair", value: { fadeIn: 2, fadeOut: 2 } },
        FADE_CONTEXT,
      ),
    ).toEqual({ fadeIn: 2, fadeOut: 2, caption: "intro", lane: 7 });
  });
});

function typeNegativeFadeField(): void {
  // @ts-expect-error a fades tag alone lacks read and commit operations
  const tagOnly: FadesPanelField<FreshFadeData> = {
    kind: "fades",
    section: "block",
    key: "fades",
    label: "Fades",
  };
  // @ts-expect-error fade data must carry the fade pair shape
  fadesField<{ text: string }>();
  void tagOnly;
}

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
