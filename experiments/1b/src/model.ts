export type BlockKind = "dialogue" | "camera" | "sound" | "animation";

export interface Track {
  readonly id: string;
  readonly label: string;
}

export interface Placement {
  id: string;
  trackId: string;
  kind: BlockKind;
  start: number;
  length: number;
  cooperativeSkip: boolean;
}

export interface PlacementShape {
  readonly trackId: string;
  readonly start: number;
  readonly length: number;
}

export const COLUMNS = 16;

export const TRACKS: readonly Track[] = [
  { id: "dialogue", label: "Dialogue" },
  { id: "camera", label: "Camera" },
  { id: "sound", label: "Sound" },
];

export const BLOCK_KINDS: readonly BlockKind[] = [
  "dialogue",
  "camera",
  "sound",
  "animation",
];

export const BLOCK_LABELS: Record<BlockKind, string> = {
  dialogue: "Dialogue",
  camera: "Camera",
  sound: "Sound",
  animation: "Animation",
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
  placements: readonly Placement[],
  shape: PlacementShape,
  ignoreId?: string,
): boolean {
  if (shape.start < 0 || shape.length < 1 || shape.start + shape.length > COLUMNS) {
    return false;
  }
  if (!TRACKS.some((track) => track.id === shape.trackId)) {
    return false;
  }
  return placements.every(
    (placement) =>
      placement.id === ignoreId ||
      placement.trackId !== shape.trackId ||
      !intervalsOverlap(shape.start, shape.length, placement.start, placement.length),
  );
}
