import type { MediaPlacement } from "./model";

export type FadeBoundary = "fadeIn" | "fadeOut" | "shared";

export function fadeBoundaries(block: MediaPlacement): readonly {
  boundary: FadeBoundary;
  offset: number;
}[] {
  if (block.fadeIn + block.fadeOut === block.length && block.fadeIn > 0 && block.fadeOut > 0) {
    return [{ boundary: "shared", offset: block.fadeIn }];
  }
  return [
    ...(block.fadeIn > 0 && block.fadeIn < block.length
      ? [{ boundary: "fadeIn" as const, offset: block.fadeIn }]
      : []),
    ...(block.fadeOut > 0 && block.fadeOut < block.length
      ? [{ boundary: "fadeOut" as const, offset: block.length - block.fadeOut }]
      : []),
  ];
}

export function dragFadeBoundary(
  boundary: FadeBoundary,
  offset: number,
  length: number,
  fadeIn: number,
  fadeOut: number,
): { fadeIn: number; fadeOut: number } {
  switch (boundary) {
    case "fadeIn":
      return { fadeIn: Math.max(0, Math.min(offset, length - fadeOut)), fadeOut };
    case "fadeOut":
      return { fadeIn, fadeOut: length - Math.max(fadeIn, Math.min(offset, length)) };
    case "shared": {
      const split = Math.max(0, Math.min(offset, length));
      return { fadeIn: split, fadeOut: length - split };
    }
  }
}
