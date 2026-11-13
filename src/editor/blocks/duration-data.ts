import type {
  CarryOver,
  DurationData,
  DurationEdit,
  DurationPanelField,
} from "../block-definition";
import {
  blockDurationSeconds,
  beatsToSeconds,
  convertDuration,
} from "../model";

export type { DurationData, DurationEdit } from "../block-definition";

export function durationField<T extends DurationData>(): DurationPanelField<T> {
  return {
    kind: "duration",
    section: "block",
    key: "duration",
    label: "Duration",
    read(data, context) {
      const synced = data.syncBeatsToCellSpan;
      const unit = data.durationUnit;
      return {
        value: synced ? context.length : data.duration,
        unit,
        synced,
        limits:
          unit === "beats"
            ? { min: 0.25, max: 256, step: 0.25 }
            : { min: 0.05, max: 120, step: 0.05 },
      };
    },
    commit(data, edit, context) {
      return editDuration(data, edit, context);
    },
    resolve(data, context) {
      return durationSeconds(data, context.length, context.bpm);
    },
  };
}

export function editDuration<T extends DurationData>(
  data: T,
  edit: DurationEdit,
  context: { length: number; bpm: number },
): T {
  switch (edit.kind) {
    case "value":
      if (data.syncBeatsToCellSpan) {
        return data;
      }
      if (!Number.isFinite(edit.value) || edit.value <= 0) {
        return data;
      }
      return { ...data, duration: edit.value };
    case "unit":
      if (data.syncBeatsToCellSpan || data.durationUnit === edit.unit) {
        return data;
      }
      return {
        ...data,
        duration: convertDuration(
          data.duration,
          data.durationUnit,
          edit.unit,
          context.bpm,
        ),
        durationUnit: edit.unit,
      };
    case "sync":
      return edit.enabled
        ? {
            ...data,
            syncBeatsToCellSpan: true,
            durationUnit: "beats",
            duration: context.length,
          }
        : { ...data, syncBeatsToCellSpan: false };
  }
}

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
