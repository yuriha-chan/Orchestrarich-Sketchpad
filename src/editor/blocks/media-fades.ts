import type {
  FadeData,
  FadeEdit,
  FadesPanelField,
  TimelineGestureContext,
} from "../block-definition";
import type { LoopRegion, Placement } from "../model";
import {
  clampFadesToLength,
  dragFadeBoundary,
  fadeBoundaries,
  type MediaData,
} from "./media-data";

function snapFades(
  fades: FadeData,
  start: number,
  length: number,
  loops: readonly LoopRegion[] | undefined,
): FadeData {
  if (loops === undefined) {
    return fades;
  }
  const end = start + length;
  const contained = loops.filter(
    (loop) => start <= loop.start && loop.end <= end,
  );
  let fadeIn = fades.fadeIn;
  let fadeOut = fades.fadeOut;

  const inBoundary = start + fadeIn;
  const inLoops = contained.filter(
    (loop) => loop.start < inBoundary && inBoundary < loop.end,
  );
  if (inLoops.length > 0) {
    fadeIn = Math.min(...inLoops.map((loop) => loop.start)) - start;
  }

  const outBoundary = end - fadeOut;
  const outLoops = contained.filter(
    (loop) => loop.start < outBoundary && outBoundary < loop.end,
  );
  if (outLoops.length > 0) {
    fadeOut = end - Math.max(...outLoops.map((loop) => loop.end));
  }

  return {
    fadeIn: Math.max(0, fadeIn),
    fadeOut: Math.max(0, fadeOut),
  };
}

export function fadesField<T extends FadeData>(): FadesPanelField<T> {
  return {
    kind: "fades",
    section: "block",
    key: "fades",
    label: "Fades",
    read(data) {
      return { fadeIn: data.fadeIn, fadeOut: data.fadeOut };
    },
    commit(data, edit, context) {
      return editFades(data, edit, context);
    },
  };
}

export function editFades<T extends FadeData>(
  data: T,
  edit: FadeEdit,
  context: { length: number },
): T {
  const next: FadeData =
    edit.kind === "pair"
      ? edit.value
      : edit.kind === "fadeIn"
        ? { fadeIn: edit.value, fadeOut: data.fadeOut }
        : { fadeIn: data.fadeIn, fadeOut: edit.value };
  return {
    ...data,
    ...clampFadesToLength(next.fadeIn, next.fadeOut, context.length),
  };
}

function editSnappedFades<T extends FadeData>(
  data: T,
  edit: FadeEdit,
  start: number,
  length: number,
  loops: readonly LoopRegion[] | undefined,
): T {
  const changed = editFades(data, edit, { length });
  return { ...changed, ...snapFades(changed, start, length, loops) };
}

export function mediaGesture(
  block: Placement<MediaData>,
  target:
    | { kind: "edge"; edge: "start" | "end" }
    | { kind: "boundary"; index: number },
  columnCount: number,
  context?: TimelineGestureContext,
): (delta: number, current: { start: number; length: number }) => {
  start: number;
  length: number;
  update: (data: MediaData) => MediaData;
} {
  const originStart = block.start;
  const originLength = block.length;
  const fadeIn = block.data.fadeIn;
  const fadeOut = block.data.fadeOut;

  return (delta, current) => {
    if (target.kind === "boundary") {
      const boundary = fadeBoundaries(fadeIn, fadeOut, originLength)[target.index];
      if (boundary === undefined) {
        throw new Error(`Unknown media boundary index ${target.index}`);
      }
      const fades = dragFadeBoundary(
        boundary.boundary,
        boundary.offset + delta,
        originLength,
        fadeIn,
        fadeOut,
      );
      return {
        start: originStart,
        length: originLength,
        update: (data) =>
          editSnappedFades(data, { kind: "pair", value: fades }, originStart, originLength, context?.loops),
      };
    }
    if (target.edge === "start") {
      if (delta >= 0) {
        return {
          start: current.start,
          length: current.length,
          update: (data) =>
            editSnappedFades(data, { kind: "fadeIn", value: delta }, current.start, current.length, context?.loops),
        };
      }
      const start = Math.max(0, originStart + delta);
      const extra = originStart - start;
      const length = originLength + extra;
      return {
        start,
        length,
        update: (data) =>
          editSnappedFades(data, { kind: "fadeIn", value: fadeIn + extra }, start, length, context?.loops),
      };
    }
    if (delta <= 0) {
      return {
        start: current.start,
        length: current.length,
        update: (data) =>
          editSnappedFades(data, { kind: "fadeOut", value: -delta }, current.start, current.length, context?.loops),
      };
    }
    const length = Math.min(
      originLength + delta,
      Math.max(originLength, columnCount - originStart),
    );
    const extra = length - originLength;
    return {
      start: originStart,
      length,
      update: (data) =>
        editSnappedFades(data, { kind: "fadeOut", value: fadeOut + extra }, originStart, length, context?.loops),
    };
  };
}

export const MEDIA_TIMELINE_CLASS = "is-media";

export function mediaFadeTitle(block: Placement<MediaData>): string {
  return `Fade in ${block.data.fadeIn}, fade out ${block.data.fadeOut} (cells)`;
}
