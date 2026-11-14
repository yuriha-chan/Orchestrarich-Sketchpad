import type { Slot } from "../core/slots/numeric-slots";
import type { Track } from "./model";

export type TimelineRow =
  | { kind: "track"; trackId: string }
  | { kind: "slot"; slotId: string };

export function timelineRows(
  tracks: readonly Track[],
  slots: readonly Slot[],
): readonly TimelineRow[] {
  const rows: TimelineRow[] = [];

  for (const track of tracks) {
    rows.push({ kind: "track", trackId: track.id });
    for (const slot of slots) {
      if (slot.trackId === track.id) {
        rows.push({ kind: "slot", slotId: slot.id });
      }
    }
  }

  for (const slot of slots) {
    if (slot.trackId === null) {
      rows.push({ kind: "slot", slotId: slot.id });
    }
  }

  return rows;
}

export function trackRowIndex(
  rows: readonly TimelineRow[],
  trackId: string,
): number {
  return rows.findIndex(
    (row) => row.kind === "track" && row.trackId === trackId,
  );
}

export function nearestTrackRow(
  rows: readonly TimelineRow[],
  rowIndex: number,
): string {
  const trackRows = rows.flatMap((row, index) =>
    row.kind === "track" ? [{ trackId: row.trackId, index }] : [],
  );
  let nearest = trackRows[0];

  for (const trackRow of trackRows) {
    if (
      Math.abs(trackRow.index - rowIndex) <
      Math.abs(nearest.index - rowIndex)
    ) {
      nearest = trackRow;
    }
  }

  return nearest.trackId;
}

export function rowTop(
  rows: readonly TimelineRow[],
  index: number,
  trackHeight: number,
  slotHeight: number,
): number {
  let top = 0;

  for (let rowIndex = 0; rowIndex < index; rowIndex += 1) {
    top += rows[rowIndex].kind === "track" ? trackHeight : slotHeight;
  }

  return top;
}

export function trackAtY(
  rows: readonly TimelineRow[],
  y: number,
  trackHeight: number,
  slotHeight: number,
): string {
  let top = 0;
  let nearestTrackId: string | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    const height = row.kind === "track" ? trackHeight : slotHeight;

    if (row.kind === "track") {
      const distance = Math.abs(top + height / 2 - y);
      if (distance < nearestDistance) {
        nearestTrackId = row.trackId;
        nearestDistance = distance;
      }
    }

    top += height;
  }

  return nearestTrackId!;
}
