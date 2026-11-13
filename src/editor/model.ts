export type DurationUnit = "beats" | "seconds";

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

export type SlotDirection = "input" | "output";

export interface SlotProperty {
  readonly key: string;
  readonly label: string;
  readonly direction: SlotDirection;
}

export interface PlacementBase {
  id: string;
  trackId: string;
  start: number;
  length: number;
  cooperativeSkip: boolean;
  slotBindings?: Partial<Record<string, string>>;
}

export type Placement<T = unknown> = PlacementBase & {
  kind: string;
  data: T;
};

export type RectUnit = "span" | "pixels";

export type Vec3 = [number, number, number];

export interface RectGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  rectUnit: RectUnit;
}

export interface BoundSlotProperty {
  readonly key: string;
  readonly slotId: string;
}

export const DEFAULT_BPM = 120;
export const MIN_BPM = 20;
export const MAX_BPM = 400;

export const DEFAULT_GRID_COLUMNS = 16;
export const DEFAULT_GRID_ROWS = 9;
export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 64;

export function blockDurationSeconds(
  duration: number,
  unit: DurationUnit,
  bpm: number,
): number {
  return unit === "beats" ? beatsToSeconds(duration, bpm) : duration;
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}

export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}

export function convertDuration(
  value: number,
  from: DurationUnit,
  to: DurationUnit,
  bpm: number,
): number {
  if (from === to) {
    return value;
  }
  return from === "beats"
    ? beatsToSeconds(value, bpm)
    : secondsToBeats(value, bpm);
}

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

export interface LoopRegion {
  readonly start: number;
  readonly end: number;
}

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
