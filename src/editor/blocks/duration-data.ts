import type { CarryOver, DurationData } from "../block-definition";
import { blockDurationSeconds, beatsToSeconds } from "../model";

export type { DurationData } from "../block-definition";

export function durationSeconds(
  data: DurationData,
  length: number,
  bpm: number,
): number {
  return data.syncBeatsToCellSpan
    ? beatsToSeconds(length, bpm)
    : blockDurationSeconds(data.duration, data.durationUnit, bpm);
}

export function durationCarry(data: DurationData): { duration: DurationData } {
  return {
    duration: {
      duration: data.duration,
      durationUnit: data.durationUnit,
      syncBeatsToCellSpan: data.syncBeatsToCellSpan,
    },
  };
}

export function durationFromCarry(
  carry: CarryOver,
  length: number,
): DurationData {
  if (carry.duration !== undefined) {
    return {
      duration: carry.duration.duration,
      durationUnit: carry.duration.durationUnit,
      syncBeatsToCellSpan: carry.duration.syncBeatsToCellSpan,
    };
  }
  return {
    duration: length,
    durationUnit: "beats",
    syncBeatsToCellSpan: false,
  };
}

export function onDurationLengthChange<T extends DurationData>(
  data: T,
  length: number,
): T {
  return data.syncBeatsToCellSpan ? { ...data, duration: length } : data;
}
