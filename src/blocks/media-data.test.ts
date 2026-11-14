import { describe, expect, it } from "vitest";

import type {
  FadeData,
  FadesPanelField,
  TimelineGestureContext,
} from "./block-definition";
import { toInteger, type Integer, type Placement } from "../core/blocks/placement.ts";
import {
  clampFadesToLength,
  fadeBoundaries,
  mediaPhases,
  onMediaLengthChange,
  type MediaData,
} from "./media-data";
import { editFades, fadesField, mediaGesture } from "./media-fades";

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

type MediaGestureTarget =
  | { kind: "edge"; edge: "start" | "end" }
  | { kind: "boundary"; index: number };

function mediaBlock(overrides: {
  start?: number;
  length?: number;
  fadeIn?: number;
  fadeOut?: number;
} = {}): Placement<MediaData> {
  const length = overrides.length ?? 6;
  return {
    id: "media-1",
    trackId: "track-1",
    start: toInteger(overrides.start ?? 2),
    length: toInteger(length),
    cooperativeSkip: false,
    kind: "sound",
    data: {
      duration: length,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
      fadeIn: overrides.fadeIn ?? 1,
      fadeOut: overrides.fadeOut ?? 2,
    },
  };
}

function applyMediaGesture(
  block: Placement<MediaData>,
  target: MediaGestureTarget,
  columnCount: number,
  delta: number,
  current: { start: Integer; length: Integer } = {
    start: block.start,
    length: block.length,
  },
  context?: TimelineGestureContext,
): { start: Integer; length: Integer; data: MediaData } {
  const edit = mediaGesture(block, target, columnCount, context)(delta, current);
  const adjusted = onMediaLengthChange(block.data, edit.length);
  return {
    start: edit.start,
    length: edit.length,
    data: edit.update(adjusted),
  };
}

describe("mediaGesture", () => {
  it("sets the fade in absolutely for an inward start edge", () => {
    const block = mediaBlock({ fadeIn: 1, fadeOut: 2 });

    const edit = applyMediaGesture(
      block,
      { kind: "edge", edge: "start" },
      12,
      3,
    );

    expect(edit.start).toBe(2);
    expect(edit.length).toBe(6);
    expect(edit.data).toMatchObject({ fadeIn: 3, fadeOut: 2 });
  });

  it("sets the fade out absolutely for an inward end edge", () => {
    const block = mediaBlock({ fadeIn: 1, fadeOut: 2 });

    const edit = applyMediaGesture(
      block,
      { kind: "edge", edge: "end" },
      12,
      -3,
    );

    expect(edit.start).toBe(2);
    expect(edit.length).toBe(6);
    expect(edit.data).toMatchObject({ fadeIn: 1, fadeOut: 3 });
  });

  it("expands the start outward and grows the fade in", () => {
    const block = mediaBlock({ start: 4, length: 6, fadeIn: 1, fadeOut: 2 });

    const edit = applyMediaGesture(
      block,
      { kind: "edge", edge: "start" },
      12,
      -2,
    );

    expect(edit.start).toBe(2);
    expect(edit.length).toBe(8);
    expect(edit.data).toMatchObject({ fadeIn: 3, fadeOut: 2 });
  });

  it("expands the end outward and grows the fade out", () => {
    const block = mediaBlock({ start: 2, length: 6, fadeIn: 1, fadeOut: 2 });

    const edit = applyMediaGesture(
      block,
      { kind: "edge", edge: "end" },
      12,
      2,
    );

    expect(edit.start).toBe(2);
    expect(edit.length).toBe(8);
    expect(edit.data).toMatchObject({ fadeIn: 1, fadeOut: 4 });
  });

  it("stops outward start expansion at column zero", () => {
    const block = mediaBlock({ start: 2, length: 6, fadeIn: 1, fadeOut: 2 });

    const edit = applyMediaGesture(
      block,
      { kind: "edge", edge: "start" },
      12,
      -20,
    );

    expect(edit.start).toBe(0);
    expect(edit.length).toBe(8);
    expect(edit.data).toMatchObject({ fadeIn: 3, fadeOut: 2 });
  });

  it("stops outward end expansion at the rendered column count", () => {
    const block = mediaBlock({ start: 2, length: 6, fadeIn: 1, fadeOut: 2 });

    const edit = applyMediaGesture(
      block,
      { kind: "edge", edge: "end" },
      10,
      20,
    );

    expect(edit.start).toBe(2);
    expect(edit.length).toBe(8);
    expect(edit.data).toMatchObject({ fadeIn: 1, fadeOut: 4 });
  });

  it("keeps the expanded span when the start edge reverses inward", () => {
    const block = mediaBlock({ start: 4, length: 6, fadeIn: 1, fadeOut: 2 });
    const target: MediaGestureTarget = { kind: "edge", edge: "start" };

    const expanded = applyMediaGesture(block, target, 12, -2);
    expect(expanded.start).toBe(2);
    expect(expanded.length).toBe(8);

    const reversed = applyMediaGesture(block, target, 12, 2, {
      start: expanded.start,
      length: expanded.length,
    });

    expect(reversed.start).toBe(expanded.start);
    expect(reversed.length).toBe(expanded.length);
  });

  it("keeps the expanded span when the end edge reverses inward", () => {
    const block = mediaBlock({ start: 2, length: 6, fadeIn: 1, fadeOut: 2 });
    const target: MediaGestureTarget = { kind: "edge", edge: "end" };

    const expanded = applyMediaGesture(block, target, 12, 2);
    expect(expanded.start).toBe(2);
    expect(expanded.length).toBe(8);

    const reversed = applyMediaGesture(block, target, 12, -2, {
      start: expanded.start,
      length: expanded.length,
    });

    expect(reversed.start).toBe(expanded.start);
    expect(reversed.length).toBe(expanded.length);
  });

  it("redistributes a shared boundary from the initial fades", () => {
    const block = mediaBlock({ length: 6, fadeIn: 3, fadeOut: 3 });
    const target: MediaGestureTarget = { kind: "boundary", index: 0 };

    const right = applyMediaGesture(block, target, 12, 2);
    expect(right.start).toBe(2);
    expect(right.length).toBe(6);
    expect(right.data).toMatchObject({ fadeIn: 5, fadeOut: 1 });

    const left = applyMediaGesture(block, target, 12, -2);
    expect(left.start).toBe(2);
    expect(left.length).toBe(6);
    expect(left.data).toMatchObject({ fadeIn: 1, fadeOut: 5 });
  });
});

describe("mediaGesture snapping around contained loops", () => {
  it("snaps a separate fade-in boundary to the start of a contained loop", () => {
    const block = mediaBlock({
      start: 0,
      length: 10,
      fadeIn: 4,
      fadeOut: 2,
    });

    const edit = applyMediaGesture(
      block,
      { kind: "boundary", index: 0 },
      16,
      0,
      { start: block.start, length: block.length },
      { loops: [{ start: 2, end: 6 }] },
    );

    expect(edit.start).toBe(0);
    expect(edit.length).toBe(10);
    expect(edit.data).toMatchObject({ fadeIn: 2, fadeOut: 2 });
  });

  it("snaps a separate fade-out boundary to the end of a contained loop", () => {
    const block = mediaBlock({
      start: 0,
      length: 10,
      fadeIn: 2,
      fadeOut: 4,
    });

    const edit = applyMediaGesture(
      block,
      { kind: "boundary", index: 1 },
      16,
      0,
      { start: block.start, length: block.length },
      { loops: [{ start: 4, end: 8 }] },
    );

    expect(edit.start).toBe(0);
    expect(edit.length).toBe(10);
    expect(edit.data).toMatchObject({ fadeIn: 2, fadeOut: 2 });
  });

  it("separates a shared boundary at a contained loop into fade-in and fade-out edges", () => {
    const block = mediaBlock({
      start: 0,
      length: 10,
      fadeIn: 5,
      fadeOut: 5,
    });

    const edit = applyMediaGesture(
      block,
      { kind: "boundary", index: 0 },
      16,
      0,
      { start: block.start, length: block.length },
      { loops: [{ start: 2, end: 8 }] },
    );

    expect(edit.start).toBe(0);
    expect(edit.length).toBe(10);
    expect(edit.data).toMatchObject({ fadeIn: 2, fadeOut: 2 });
  });

  it("leaves fade boundaries already at contained loop edges unchanged", () => {
    const block = mediaBlock({
      start: 0,
      length: 10,
      fadeIn: 2,
      fadeOut: 2,
    });
    const context: TimelineGestureContext = {
      loops: [{ start: 2, end: 8 }],
    };

    const fadeIn = applyMediaGesture(
      block,
      { kind: "boundary", index: 0 },
      16,
      0,
      { start: block.start, length: block.length },
      context,
    );
    expect(fadeIn.data).toMatchObject({ fadeIn: 2, fadeOut: 2 });

    const fadeOut = applyMediaGesture(
      block,
      { kind: "boundary", index: 1 },
      16,
      0,
      { start: block.start, length: block.length },
      context,
    );
    expect(fadeOut.data).toMatchObject({ fadeIn: 2, fadeOut: 2 });
  });

  it("snaps a fade-in boundary outside nested contained loops", () => {
    const block = mediaBlock({
      start: 0,
      length: 12,
      fadeIn: 6,
      fadeOut: 2,
    });

    const edit = applyMediaGesture(
      block,
      { kind: "boundary", index: 0 },
      16,
      0,
      { start: block.start, length: block.length },
      {
        loops: [
          { start: 2, end: 10 },
          { start: 4, end: 8 },
        ],
      },
    );

    expect(edit.start).toBe(0);
    expect(edit.length).toBe(12);
    expect(edit.data).toMatchObject({ fadeIn: 2, fadeOut: 2 });
  });

  it("snaps a fade-out boundary outside nested contained loops", () => {
    const block = mediaBlock({
      start: 0,
      length: 12,
      fadeIn: 2,
      fadeOut: 6,
    });

    const edit = applyMediaGesture(
      block,
      { kind: "boundary", index: 1 },
      16,
      0,
      { start: block.start, length: block.length },
      {
        loops: [
          { start: 2, end: 10 },
          { start: 4, end: 8 },
        ],
      },
    );

    expect(edit.start).toBe(0);
    expect(edit.length).toBe(12);
    expect(edit.data).toMatchObject({ fadeIn: 2, fadeOut: 2 });
  });
});

describe("mediaGesture clamping before snapping around contained loops", () => {
  it("clamps an excessive inward start edge fade before snapping it out of a contained loop", () => {
    const block = mediaBlock({
      start: 0,
      length: 10,
      fadeIn: 1,
      fadeOut: 9,
    });

    const edit = applyMediaGesture(
      block,
      { kind: "edge", edge: "start" },
      16,
      20,
      { start: block.start, length: block.length },
      { loops: [{ start: 2, end: 8 }] },
    );

    expect(edit.start).toBe(0);
    expect(edit.length).toBe(10);
    expect(edit.data).toMatchObject({ fadeIn: 2, fadeOut: 2 });
  });

  it("clamps an excessive inward end edge fade before snapping it out of a contained loop", () => {
    const block = mediaBlock({
      start: 0,
      length: 10,
      fadeIn: 9,
      fadeOut: 1,
    });

    const edit = applyMediaGesture(
      block,
      { kind: "edge", edge: "end" },
      16,
      -20,
      { start: block.start, length: block.length },
      { loops: [{ start: 2, end: 8 }] },
    );

    expect(edit.start).toBe(0);
    expect(edit.length).toBe(10);
    expect(edit.data).toMatchObject({ fadeIn: 2, fadeOut: 2 });
  });
});

describe("mediaGesture current opposite fade after an outward reversal", () => {
  it("preserves a changed fade out on a subsequent inward start edge edit", () => {
    const block = mediaBlock({ start: 4, length: 6, fadeIn: 1, fadeOut: 2 });
    const target: MediaGestureTarget = { kind: "edge", edge: "start" };
    const gesture = mediaGesture(block, target, 12);

    const outward = gesture(-2, {
      start: block.start,
      length: block.length,
    });
    expect(outward.start).toBe(2);
    expect(outward.length).toBe(8);
    const afterOutward = outward.update(
      onMediaLengthChange(block.data, outward.length),
    );
    expect(afterOutward).toMatchObject({ fadeIn: 3, fadeOut: 2 });

    const reversal = gesture(20, {
      start: outward.start,
      length: outward.length,
    });
    const afterReversal = reversal.update(
      onMediaLengthChange(afterOutward, reversal.length),
    );
    expect(afterReversal).toMatchObject({ fadeIn: 7, fadeOut: 1 });

    const inward = gesture(5, {
      start: reversal.start,
      length: reversal.length,
    });
    const afterInward = inward.update(
      onMediaLengthChange(afterReversal, inward.length),
    );

    expect(afterInward).toMatchObject({ fadeIn: 5, fadeOut: 1 });
  });

  it("preserves a changed fade in on a subsequent inward end edge edit", () => {
    const block = mediaBlock({ start: 2, length: 6, fadeIn: 2, fadeOut: 1 });
    const target: MediaGestureTarget = { kind: "edge", edge: "end" };
    const gesture = mediaGesture(block, target, 12);

    const outward = gesture(2, {
      start: block.start,
      length: block.length,
    });
    expect(outward.start).toBe(2);
    expect(outward.length).toBe(8);
    const afterOutward = outward.update(
      onMediaLengthChange(block.data, outward.length),
    );
    expect(afterOutward).toMatchObject({ fadeIn: 2, fadeOut: 3 });

    const reversal = gesture(-20, {
      start: outward.start,
      length: outward.length,
    });
    const afterReversal = reversal.update(
      onMediaLengthChange(afterOutward, reversal.length),
    );
    expect(afterReversal).toMatchObject({ fadeIn: 0, fadeOut: 8 });

    const inward = gesture(-5, {
      start: reversal.start,
      length: reversal.length,
    });
    const afterInward = inward.update(
      onMediaLengthChange(afterReversal, inward.length),
    );

    expect(afterInward).toMatchObject({ fadeIn: 0, fadeOut: 5 });
  });
});
