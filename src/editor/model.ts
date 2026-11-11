export type BlockKind = "dialogue" | "camera" | "sound" | "animation" | "wait" | "rectangle" | "addition";

export type TimedBlockKind = Exclude<BlockKind, "dialogue">;

export type MediaBlockKind = "sound" | "animation";

export function isMediaKind(kind: BlockKind): kind is MediaBlockKind {
  return kind === "sound" || kind === "animation";
}

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

interface PlacementBase {
  id: string;
  trackId: string;
  start: number;
  length: number;
  cooperativeSkip: boolean;
  slotBindings?: Partial<Record<string, string>>;
}

export interface DialoguePlacement extends PlacementBase {
  kind: "dialogue";
}

export interface DurationPlacementBase extends PlacementBase {
  duration: number;
  durationUnit: DurationUnit;
  syncBeatsToCellSpan: boolean;
}

export interface TimedPlacement extends DurationPlacementBase {
  kind: "camera" | "wait";
}

export interface MediaPlacement extends DurationPlacementBase {
  kind: MediaBlockKind;
  fadeIn: number;
  fadeOut: number;
}

export type RectUnit = "span" | "pixels";

export type Vec3 = [number, number, number];

export const DEFAULT_RECT_COLOR: Vec3 = [219, 39, 119];

export interface RectGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  rectUnit: RectUnit;
}

export const DEFAULT_RECT_GEOMETRY: RectGeometry = {
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  rectUnit: "span",
};

export interface RectanglePlacement extends DurationPlacementBase, RectGeometry {
  kind: "rectangle";
  color: Vec3;
}

export interface AdditionPlacement extends PlacementBase {
  kind: "addition";
  inputA: number;
  inputB: number;
}

export type DurationPlacement =
  | TimedPlacement
  | MediaPlacement
  | RectanglePlacement;

export type Placement =
  | DialoguePlacement
  | DurationPlacement
  | AdditionPlacement;

export function isMediaPlacement(
  placement: Placement,
): placement is MediaPlacement {
  return isMediaKind(placement.kind);
}

export function isRectanglePlacement(
  placement: Placement,
): placement is RectanglePlacement {
  return placement.kind === "rectangle";
}

export function isDurationPlacement(
  placement: Placement,
): placement is DurationPlacement {
  return (
    placement.kind !== "dialogue" &&
    placement.kind !== "addition"
  );
}


export interface BoundSlotProperty {
  readonly key: string;
  readonly slotId: string;
}

export function boundSlotProperties(
  placement: Placement,
  direction: SlotDirection,
): readonly BoundSlotProperty[] {
  const bindings = placement.slotBindings;
  if (bindings === undefined) {
    return [];
  }
  const bound: BoundSlotProperty[] = [];
  for (const property of SLOT_CAPABLE_PROPERTIES[placement.kind]) {
    if (property.direction !== direction) {
      continue;
    }
    const slotId = bindings[property.key];
    if (slotId !== undefined) {
      bound.push({ key: property.key, slotId });
    }
  }
  return bound;
}

export const SLOT_CAPABLE_PROPERTIES: Record<BlockKind, readonly SlotProperty[]> = {
  dialogue: [],
  camera: [],
  sound: [],
  animation: [],
  wait: [],
  rectangle: [
    { key: "x", label: "X", direction: "input" },
    { key: "y", label: "Y", direction: "input" },
    { key: "w", label: "Width", direction: "input" },
    { key: "h", label: "Height", direction: "input" },
  ],
  addition: [
    { key: "a", label: "A", direction: "input" },
    { key: "b", label: "B", direction: "input" },
    { key: "out", label: "Output", direction: "output" },
  ],
};

export const DEFAULT_BPM = 120;
export const MIN_BPM = 20;
export const MAX_BPM = 400;

export const DEFAULT_GRID_COLUMNS = 16;
export const DEFAULT_GRID_ROWS = 9;
export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 64;

export function blockDurationSeconds(placement: DurationPlacement, bpm: number): number {
  if (placement.syncBeatsToCellSpan) {
    return beatsToSeconds(placement.length, bpm);
  }
  return placement.durationUnit === "beats"
    ? beatsToSeconds(placement.duration, bpm)
    : placement.duration;
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

export function clampFadesToLength(
  fadeIn: number,
  fadeOut: number,
  length: number,
): { fadeIn: number; fadeOut: number } {
  const inValue = Math.max(0, Math.floor(fadeIn));
  const outValue = Math.max(0, Math.floor(fadeOut));
  const total = inValue + outValue;
  if (total <= length) {
    return { fadeIn: inValue, fadeOut: outValue };
  }
  const inFit = Math.floor((inValue * length) / total);
  return { fadeIn: inFit, fadeOut: Math.max(0, length - inFit) };
}

export interface MediaPhase {
  readonly index: number;
  readonly offset: number;
  readonly length: number;
}

export function mediaPhases(
  fadeIn: number,
  fadeOut: number,
  length: number,
): MediaPhase[] {
  const inLength = fadeIn;
  const outLength = fadeOut;
  const bodyLength = length - inLength - outLength;
  const phases: MediaPhase[] = [];
  let offset = 0;
  if (inLength > 0) {
    phases.push({ index: phases.length, offset, length: inLength });
    offset += inLength;
  }
  if (bodyLength > 0) {
    phases.push({ index: phases.length, offset, length: bodyLength });
    offset += bodyLength;
  }
  if (outLength > 0) {
    phases.push({ index: phases.length, offset, length: outLength });
  }
  return phases;
}

export function phaseBlockId(placementId: string, index: number): string {
  return `${placementId}~${index}`;
}

export function convertPlacementKind(
  placement: Placement,
  kind: BlockKind,
): Placement {
  if (placement.kind === kind) {
    return placement;
  }
  const retainedBindings: Partial<Record<string, string>> = {};
  for (const { key } of SLOT_CAPABLE_PROPERTIES[kind]) {
    const slotId = placement.slotBindings?.[key];
    if (slotId !== undefined) {
      retainedBindings[key] = slotId;
    }
  }
  const base = {
    id: placement.id,
    trackId: placement.trackId,
    start: placement.start,
    length: placement.length,
    cooperativeSkip: placement.cooperativeSkip,
    ...(Object.keys(retainedBindings).length === 0
      ? {}
      : { slotBindings: retainedBindings }),
  };
  if (kind === "dialogue") {
    return { ...base, kind };
  }
  if (kind === "addition") {
    const inputs =
      placement.kind === "addition"
        ? { inputA: placement.inputA, inputB: placement.inputB }
        : { inputA: 0, inputB: 0 };
    return { ...base, kind, ...inputs };
  }
  const durationFields =
    placement.kind === "dialogue" || placement.kind === "addition"
      ? {
          duration: placement.length,
          durationUnit: "beats" as const,
          syncBeatsToCellSpan: false,
        }
      : {
          duration: placement.duration,
          durationUnit: placement.durationUnit,
          syncBeatsToCellSpan: placement.syncBeatsToCellSpan,
        };
  if (kind === "rectangle") {
    const geometry = isRectanglePlacement(placement)
      ? {
          x: placement.x,
          y: placement.y,
          w: placement.w,
          h: placement.h,
          rectUnit: placement.rectUnit,
          color: placement.color,
        }
      : { ...DEFAULT_RECT_GEOMETRY, color: DEFAULT_RECT_COLOR };
    return { ...base, kind, ...durationFields, ...geometry };
  }
  const fades = isMediaPlacement(placement)
    ? { fadeIn: placement.fadeIn, fadeOut: placement.fadeOut }
    : { fadeIn: 0, fadeOut: 0 };
  return isMediaKind(kind)
    ? { ...base, kind, ...durationFields, ...fades }
    : { ...base, kind, ...durationFields };
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

export const BLOCK_KINDS: readonly BlockKind[] = [
  "dialogue",
  "camera",
  "sound",
  "animation",
  "wait",
  "rectangle",
  "addition",
];

export const BLOCK_LABELS: Record<BlockKind, string> = {
  dialogue: "Dialogue",
  camera: "Camera",
  sound: "Sound",
  animation: "Animation",
  wait: "Wait",
  rectangle: "Rectangle",
  addition: "Addition",
};

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
