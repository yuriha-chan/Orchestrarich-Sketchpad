export interface SlotValueAnchor {
  readonly left: number;
  readonly center: number;
}

export interface SlotValueSpan {
  readonly x1: number;
  readonly x2: number;
}

export interface SlotValueRail {
  readonly spans: readonly SlotValueSpan[];
  readonly dots: readonly number[];
}

export function slotValueRail(
  anchors: readonly SlotValueAnchor[],
  gapCenters: readonly number[],
  width: number,
): SlotValueRail {
  const sorted = [...anchors].sort((left, right) => left.center - right.center);
  const spans: SlotValueSpan[] = [];
  const dots: number[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const anchor = sorted[index];
    if (anchor.center >= width) {
      break;
    }
    const next = sorted[index + 1];
    const x2 = next !== undefined && next.left < width ? next.left : width;
    if (x2 <= anchor.center) {
      continue;
    }
    spans.push({ x1: anchor.center, x2 });
    for (const gap of gapCenters) {
      if (gap > anchor.center && gap < x2) {
        dots.push(gap);
      }
    }
  }

  return { spans, dots };
}
