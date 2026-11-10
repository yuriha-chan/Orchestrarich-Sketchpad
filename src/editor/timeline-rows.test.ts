import { describe, expect, it } from "vitest";

import type { NumericSlot } from "../core/slots/numeric-slots";
import type { Track } from "./model";
import {
  nearestTrackRow,
  rowTop,
  timelineRows,
  trackAtY,
  trackRowIndex,
  type TimelineRow,
} from "./timeline-rows";

const tracks: readonly Track[] = [
  { id: "dialogue", label: "Dialogue" },
  { id: "camera", label: "Camera" },
  { id: "sound", label: "Sound" },
];

function slot(
  id: string,
  trackId: string | null,
  initializations: { time: number; value: number }[] = [
    { time: 0, value: 0 },
  ],
): NumericSlot {
  return { id, trackId, initializations };
}

describe("timelineRows", () => {
  it("keeps track order and positions when there are no slots", () => {
    expect(timelineRows(tracks, [])).toEqual([
      { kind: "track", trackId: "dialogue" },
      { kind: "track", trackId: "camera" },
      { kind: "track", trackId: "sound" },
    ]);
  });

  it("places multiple local slots after their track in slot order", () => {
    const slots = [
      slot("camera-a", "camera"),
      slot("dialogue-a", "dialogue"),
      slot("dialogue-b", "dialogue"),
      slot("camera-b", "camera"),
    ];

    expect(timelineRows(tracks, slots)).toEqual([
      { kind: "track", trackId: "dialogue" },
      { kind: "slot", slotId: "dialogue-a" },
      { kind: "slot", slotId: "dialogue-b" },
      { kind: "track", trackId: "camera" },
      { kind: "slot", slotId: "camera-a" },
      { kind: "slot", slotId: "camera-b" },
      { kind: "track", trackId: "sound" },
    ]);
  });

  it("appends shared slots after all track groups in slot order", () => {
    const slots = [
      slot("shared-a", null),
      slot("dialogue-a", "dialogue"),
      slot("shared-b", null),
      slot("camera-a", "camera"),
    ];

    expect(timelineRows(tracks, slots)).toEqual([
      { kind: "track", trackId: "dialogue" },
      { kind: "slot", slotId: "dialogue-a" },
      { kind: "track", trackId: "camera" },
      { kind: "slot", slotId: "camera-a" },
      { kind: "track", trackId: "sound" },
      { kind: "slot", slotId: "shared-a" },
      { kind: "slot", slotId: "shared-b" },
    ]);
  });

  it("includes empty slots as rows", () => {
    const slots = [slot("empty", "sound", [])];

    expect(timelineRows(tracks, slots)).toEqual([
      { kind: "track", trackId: "dialogue" },
      { kind: "track", trackId: "camera" },
      { kind: "track", trackId: "sound" },
      { kind: "slot", slotId: "empty" },
    ]);
  });
});

const rows: readonly TimelineRow[] = [
  { kind: "track", trackId: "dialogue" },
  { kind: "slot", slotId: "dialogue-a" },
  { kind: "slot", slotId: "dialogue-b" },
  { kind: "track", trackId: "camera" },
  { kind: "slot", slotId: "camera-a" },
  { kind: "track", trackId: "sound" },
];

describe("trackRowIndex", () => {
  it("returns the index of a known track row", () => {
    expect(trackRowIndex(rows, "dialogue")).toBe(0);
    expect(trackRowIndex(rows, "camera")).toBe(3);
    expect(trackRowIndex(rows, "sound")).toBe(5);
  });
});

describe("nearestTrackRow", () => {
  it("returns the track row at the given index", () => {
    expect(nearestTrackRow(rows, 0)).toBe("dialogue");
    expect(nearestTrackRow(rows, 3)).toBe("camera");
    expect(nearestTrackRow(rows, 5)).toBe("sound");
  });

  it("resolves slot rows to the nearest track", () => {
    expect(nearestTrackRow(rows, 1)).toBe("dialogue");
    expect(nearestTrackRow(rows, 2)).toBe("camera");
    expect(nearestTrackRow(rows, 4)).toBe("camera");
  });

  it("chooses the earlier track when equidistant", () => {
    const tied: readonly TimelineRow[] = [
      { kind: "track", trackId: "first" },
      { kind: "slot", slotId: "between" },
      { kind: "track", trackId: "second" },
    ];

    expect(nearestTrackRow(tied, 1)).toBe("first");
  });

  it("resolves indices above the layout to the first track", () => {
    expect(nearestTrackRow(rows, -3)).toBe("dialogue");
  });

  it("resolves indices below the layout to the last track", () => {
    expect(nearestTrackRow(rows, 50)).toBe("sound");
  });

  it("crosses tracks while moving through slot rows", () => {
    const layout = timelineRows(
      [
        { id: "first", label: "First" },
        { id: "second", label: "Second" },
      ],
      [
        slot("first-a", "first"),
        slot("first-b", "first"),
        slot("first-c", "first"),
      ],
    );

    expect(nearestTrackRow(layout, 1)).toBe("first");
    expect(nearestTrackRow(layout, 2)).toBe("first");
    expect(nearestTrackRow(layout, 3)).toBe("second");
  });
});

const TRACK_HEIGHT = 48;
const SLOT_HEIGHT = 24;

describe("rowTop", () => {
  it("accumulates track and slot heights to each row", () => {
    expect(rowTop(rows, 0, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(0);
    expect(rowTop(rows, 1, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(48);
    expect(rowTop(rows, 2, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(72);
    expect(rowTop(rows, 3, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(96);
    expect(rowTop(rows, 4, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(144);
    expect(rowTop(rows, 5, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(168);
  });

  it("includes shared slot rows in the cumulative offsets", () => {
    const layout = timelineRows(
      [
        { id: "first", label: "First" },
        { id: "second", label: "Second" },
      ],
      [
        slot("first-a", "first"),
        slot("shared-a", null),
        slot("second-a", "second"),
        slot("shared-b", null),
      ],
    );

    expect(rowTop(layout, 0, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(0);
    expect(rowTop(layout, 1, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(48);
    expect(rowTop(layout, 2, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(72);
    expect(rowTop(layout, 3, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(120);
    expect(rowTop(layout, 4, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(144);
    expect(rowTop(layout, 5, TRACK_HEIGHT, SLOT_HEIGHT)).toBe(168);
  });
});

describe("trackAtY", () => {
  it("returns the track whose center is nearest to y", () => {
    expect(trackAtY(rows, 24, TRACK_HEIGHT, SLOT_HEIGHT)).toBe("dialogue");
    expect(trackAtY(rows, 120, TRACK_HEIGHT, SLOT_HEIGHT)).toBe("camera");
    expect(trackAtY(rows, 192, TRACK_HEIGHT, SLOT_HEIGHT)).toBe("sound");
    expect(trackAtY(rows, 50, TRACK_HEIGHT, SLOT_HEIGHT)).toBe("dialogue");
    expect(trackAtY(rows, 100, TRACK_HEIGHT, SLOT_HEIGHT)).toBe("camera");
    expect(trackAtY(rows, 160, TRACK_HEIGHT, SLOT_HEIGHT)).toBe("sound");
  });

  it("chooses the earlier track when equidistant", () => {
    expect(trackAtY(rows, 72, TRACK_HEIGHT, SLOT_HEIGHT)).toBe("dialogue");
    expect(trackAtY(rows, 156, TRACK_HEIGHT, SLOT_HEIGHT)).toBe("camera");
  });

  it("clamps beyond the first and last track", () => {
    expect(trackAtY(rows, -10, TRACK_HEIGHT, SLOT_HEIGHT)).toBe("dialogue");
    expect(trackAtY(rows, 400, TRACK_HEIGHT, SLOT_HEIGHT)).toBe("sound");
  });
});
