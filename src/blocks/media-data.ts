import type { CarryOver, FadeData } from "./block-definition";
import {
  durationCarry,
  durationFromCarry,
  onDurationLengthChange,
  type DurationData,
} from "./duration-data";

export type FadeBoundary = "fadeIn" | "fadeOut" | "shared";

export interface MediaData extends DurationData, FadeData {}

export interface MediaPhase {
  readonly index: number;
  readonly offset: number;
  readonly length: number;
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

export function fadeBoundaries(
  fadeIn: number,
  fadeOut: number,
  length: number,
): readonly { boundary: FadeBoundary; offset: number }[] {
  if (fadeIn + fadeOut === length && fadeIn > 0 && fadeOut > 0) {
    return [{ boundary: "shared", offset: fadeIn }];
  }
  return [
    ...(fadeIn > 0 && fadeIn < length
      ? [{ boundary: "fadeIn" as const, offset: fadeIn }]
      : []),
    ...(fadeOut > 0 && fadeOut < length
      ? [{ boundary: "fadeOut" as const, offset: length - fadeOut }]
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

export function mediaCarry(data: MediaData): CarryOver {
  return {
    ...durationCarry(data),
    fades: { fadeIn: data.fadeIn, fadeOut: data.fadeOut },
  };
}

export function mediaFromCarry(carry: CarryOver, length: number): MediaData {
  return {
    ...durationFromCarry(carry, length),
    ...(carry.fades ?? { fadeIn: 0, fadeOut: 0 }),
  };
}

export function onMediaLengthChange(
  data: MediaData,
  length: number,
): MediaData {
  const withDuration = onDurationLengthChange(data, length);
  const clamped = clampFadesToLength(withDuration.fadeIn, withDuration.fadeOut, length);
  return { ...withDuration, ...clamped };
}
