import type { NumericSlotInitialization } from "../core/slots/numeric-slots";

export interface SlotValueSpan {
  readonly start: number;
  readonly end: number;
}

export interface SlotValueRail {
  readonly spans: readonly SlotValueSpan[];
  readonly dots: readonly number[];
}

export function slotValueRail(
  initializations: readonly NumericSlotInitialization[],
  columnCount: number,
  assignmentTimes: readonly number[] = [],
): SlotValueRail {
  const times = [
    ...new Set([
      ...initializations.map((initialization) => initialization.time),
      ...assignmentTimes,
    ]),
  ].sort((a, b) => a - b);
  const spans: SlotValueSpan[] = [];
  const dots: number[] = [];

  for (let index = 0; index < times.length; index += 1) {
    const start = times[index];
    if (start >= columnCount) {
      break;
    }
    const next = times[index + 1];
    const end = next !== undefined ? Math.min(next, columnCount) : columnCount;
    spans.push({ start, end });

    for (let time = start + 1; time < end; time += 1) {
      dots.push(time);
    }
  }

  return { spans, dots };
}
