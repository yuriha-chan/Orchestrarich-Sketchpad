export type BlockKind = "dialogue" | "camera" | "sound" | "animation" | "wait";

export type TimedBlockKind = Exclude<BlockKind, "dialogue">;

export type MediaBlockKind = "sound" | "animation";

export function isMediaKind(kind: BlockKind): kind is MediaBlockKind {
  return kind === "sound" || kind === "animation";
}

export type DurationUnit = "beats" | "seconds";

export interface Track {
  readonly id: string;
  readonly label: string;
}

interface PlacementBase {
  id: string;
  trackId: string;
  start: number;
  length: number;
  cooperativeSkip: boolean;
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

export type DurationPlacement = TimedPlacement | MediaPlacement;

export type Placement = DialoguePlacement | DurationPlacement;

export function isMediaPlacement(
  placement: Placement,
): placement is MediaPlacement {
  return isMediaKind(placement.kind);
}

export const DEFAULT_BPM = 120;
export const MIN_BPM = 20;
export const MAX_BPM = 400;

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
  const base = {
    id: placement.id,
    trackId: placement.trackId,
    start: placement.start,
    length: placement.length,
    cooperativeSkip: placement.cooperativeSkip,
  };
  if (kind === "dialogue") {
    return { ...base, kind };
  }
  if (placement.kind === "dialogue") {
    const durationFields = {
      duration: placement.length,
      durationUnit: "beats" as const,
      syncBeatsToCellSpan: false,
    };
    return isMediaKind(kind)
      ? { ...base, kind, ...durationFields, fadeIn: 0, fadeOut: 0 }
      : { ...base, kind, ...durationFields };
  }
  const durationFields = {
    duration: placement.duration,
    durationUnit: placement.durationUnit,
    syncBeatsToCellSpan: placement.syncBeatsToCellSpan,
  };
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
  { id: "dialogue", label: "Dialogue" },
  { id: "camera", label: "Camera" },
  { id: "sound", label: "Sound" },
];

export const BLOCK_KINDS: readonly BlockKind[] = [
  "dialogue",
  "camera",
  "sound",
  "animation",
  "wait",
];

export const BLOCK_LABELS: Record<BlockKind, string> = {
  dialogue: "Dialogue",
  camera: "Camera",
  sound: "Sound",
  animation: "Animation",
  wait: "Wait",
};

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
  ignoreId?: string,
): boolean {
  if (shape.start < 0 || shape.length < 1) {
    return false;
  }
  if (!tracks.some((track) => track.id === shape.trackId)) {
    return false;
  }
  return placements.every(
    (placement) =>
      placement.id === ignoreId ||
      placement.trackId !== shape.trackId ||
      !intervalsOverlap(shape.start, shape.length, placement.start, placement.length),
  );
}
