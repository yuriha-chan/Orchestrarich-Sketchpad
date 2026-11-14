import type { Placement } from "../core/blocks/placement.ts";
import type { LoopRegion } from "../core/blocks/contracts.ts";

export type { Placement, PlacementBase } from "../core/blocks/placement.ts";

export type {
  BoundSlotProperty,
  LoopRegion,
  SlotDirection,
  SlotProperty,
} from "../core/blocks/contracts.ts";

export type { DurationUnit } from "../core/blocks/duration.ts";
export {
  blockDurationSeconds,
  beatsToSeconds,
  secondsToBeats,
  convertDuration,
} from "../core/blocks/duration.ts";

export type {
  RectUnit,
  RectGeometry,
  Vec3,
} from "../core/blocks/geometry.ts";

export interface Track {
  readonly id: string;
  readonly label: string;
  readonly color: TrackColor;
}

export const TRACK_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#db2777",
  "#0891b2",
] as const;

export type TrackColor = (typeof TRACK_COLORS)[number];

export const DEFAULT_BPM = 120;
export const MIN_BPM = 20;
export const MAX_BPM = 400;

export const DEFAULT_GRID_COLUMNS = 16;
export const DEFAULT_GRID_ROWS = 9;
export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 64;

export interface PlacementShape {
  readonly trackId: string;
  readonly start: number;
  readonly length: number;
}

export const DEFAULT_TRACKS: readonly Track[] = [
  { id: "dialogue", label: "Dialogue", color: "#2563eb" },
  { id: "camera", label: "Camera", color: "#7c3aed" },
  { id: "sound", label: "Sound", color: "#059669" },
];

export function partiallyOverlapsLoop(
  start: number,
  length: number,
  loop: LoopRegion | null,
): boolean {
  if (loop === null) {
    return false;
  }
  const end = start + length;
  if (!(start < loop.end && loop.start < end)) {
    return false;
  }
  const containsLoop = start <= loop.start && loop.end <= end;
  const insideLoop = loop.start <= start && end <= loop.end;
  return !containsLoop && !insideLoop;
}

export function intervalsOverlap(
  aStart: number,
  aLength: number,
  bStart: number,
  bLength: number,
): boolean {
  return aStart < bStart + bLength && bStart < aStart + aLength;
}

export function canPlace(
  tracks: readonly Track[],
  placements: readonly Placement[],
  shape: PlacementShape,
  loopRegions: readonly LoopRegion[],
  ignoreId?: string,
): boolean {
  if (shape.start < 0 || shape.length < 1) {
    return false;
  }
  if (!tracks.some((track) => track.id === shape.trackId)) {
    return false;
  }
  if (
    loopRegions.some((loop) =>
      partiallyOverlapsLoop(shape.start, shape.length, loop),
    )
  ) {
    return false;
  }
  return placements.every(
    (placement) =>
      placement.id === ignoreId ||
      placement.trackId !== shape.trackId ||
      !intervalsOverlap(shape.start, shape.length, placement.start, placement.length),
  );
}

export function nextFreeStart(
  placements: readonly Placement[],
  trackId: string,
  after: number,
  length: number,
  loopRegions: readonly LoopRegion[],
): number {
  const occupied = placements
    .filter((placement) => placement.trackId === trackId)
    .map((placement) => ({
      start: placement.start,
      end: placement.start + placement.length,
    }))
    .sort((a, b) => a.start - b.start);
  let start = Math.max(after, 0);
  while (true) {
    const loop = loopRegions.find((region) =>
      partiallyOverlapsLoop(start, length, region),
    );
    if (loop !== undefined) {
      start = loop.start > start ? loop.start : loop.end;
      continue;
    }
    const blocker = occupied.find(
      (span) => start < span.end && span.start < start + length,
    );
    if (blocker === undefined) {
      return start;
    }
    start = blocker.end;
  }
}
