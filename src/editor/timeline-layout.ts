export const CELL_WIDTH = 96;
export const BASE_GAP_WIDTH = 32;

export interface BoundarySpec {
  readonly before?: readonly number[];
  readonly baseWidth?: number;
  readonly after?: readonly number[];
}

export interface TimelineGap {
  readonly kind: "gap";
  readonly time: number;
  readonly role: "base" | "loop";
  readonly width: number;
  readonly left: number;
  readonly center: number;
}

export interface TimelineCell {
  readonly kind: "cell";
  readonly time: number;
  readonly width: number;
  readonly left: number;
  readonly right: number;
}

export type TimelineSegment = TimelineGap | TimelineCell;

export interface Boundary {
  readonly time: number;
  readonly left: number;
  readonly right: number;
  readonly gaps: readonly TimelineGap[];
  readonly base: TimelineGap;
}

export interface TimelineLayout {
  readonly segments: readonly TimelineSegment[];
  readonly boundaries: readonly Boundary[];
  readonly cellLefts: readonly number[];
  readonly cellWidth: number;
  readonly width: number;
}

export function buildTimelineLayout(
  cellCount: number,
  specAt: (time: number) => BoundarySpec,
  cellWidth: number = CELL_WIDTH,
): TimelineLayout {
  const segments: TimelineSegment[] = [];
  const boundaries: Boundary[] = [];
  const cellLefts: number[] = [];
  let x = 0;

  for (let time = 0; time <= cellCount; time += 1) {
    const spec = specAt(time);
    const gaps: TimelineGap[] = [];
    const pushGap = (role: TimelineGap["role"], width: number) => {
      const gap: TimelineGap = {
        kind: "gap",
        time,
        role,
        width,
        left: x,
        center: x + width / 2,
      };
      gaps.push(gap);
      segments.push(gap);
      x += width;
      return gap;
    };

    const left = x;
    for (const width of spec.before ?? []) {
      pushGap("loop", width);
    }
    const base = pushGap("base", spec.baseWidth ?? BASE_GAP_WIDTH);
    for (const width of spec.after ?? []) {
      pushGap("loop", width);
    }

    boundaries.push({
      time,
      left,
      right: x,
      gaps,
      base,
    });

    if (time < cellCount) {
      cellLefts.push(x);
      segments.push({
        kind: "cell",
        time,
        width: cellWidth,
        left: x,
        right: x + cellWidth,
      });
      x += cellWidth;
    }
  }

  return { segments, boundaries, cellLefts, cellWidth, width: x };
}

export function cellLeft(layout: TimelineLayout, time: number): number {
  return layout.cellLefts[time];
}

export function cellRight(layout: TimelineLayout, time: number): number {
  return layout.cellLefts[time] + layout.cellWidth;
}

export function boundary(layout: TimelineLayout, time: number): Boundary {
  return layout.boundaries[time];
}

export function baseGapCenter(layout: TimelineLayout, time: number): number {
  return layout.boundaries[time].base.center;
}

export function cellAtX(layout: TimelineLayout, x: number): number {
  const last = layout.cellLefts.length - 1;

  if (x < 0) {
    return 0;
  }

  for (const segment of layout.segments) {
    if (x < segment.left || x >= segment.left + segment.width) {
      continue;
    }
    return segment.kind === "cell"
      ? segment.time
      : Math.min(segment.time, last);
  }

  return last;
}

export function cellDelta(
  layout: TimelineLayout,
  fromX: number,
  toX: number,
): number {
  return cellAtX(layout, toX) - cellAtX(layout, fromX);
}

export function blockSpan(
  layout: TimelineLayout,
  start: number,
  length: number,
  inset: number,
): { readonly left: number; readonly width: number } {
  const left = cellLeft(layout, start) + inset;
  const right = cellRight(layout, start + length - 1) - inset;
  return { left, width: right - left };
}

export function barrierRect(
  layout: TimelineLayout,
  start: number,
  end: number,
): { readonly left: number; readonly width: number } {
  const left = cellLeft(layout, start);
  return { left, width: cellRight(layout, end - 1) - left };
}
