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
): SlotValueRail {
  const ordered = [...initializations].sort((a, b) => a.time - b.time);
  const spans: SlotValueSpan[] = [];
  const dots: number[] = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const start = ordered[index].time;
    if (start >= columnCount) {
      break;
    }
    const next = ordered[index + 1];
    const end = next ? Math.min(next.time, columnCount) : columnCount;
    spans.push({ start, end });

    for (let time = start + 1; time < end; time += 1) {
      dots.push(time);
    }
  }

  return { spans, dots };
}
