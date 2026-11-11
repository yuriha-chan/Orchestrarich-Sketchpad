export const CELL_WIDTH = 96;
export const BASE_GAP_WIDTH = 32;

export interface TimelineGap {
  readonly kind: "gap";
  readonly time: number;
  readonly path: readonly string[];
  readonly width: number;
  readonly left: number;
  readonly center: number;
  readonly right: number;
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
}

export interface TimelineLayout {
  readonly segments: readonly TimelineSegment[];
  readonly boundaries: readonly Boundary[];
  readonly cellLefts: readonly number[];
  readonly cellWidth: number;
  readonly width: number;
}

export type GapPathsAt = (time: number) => readonly (readonly string[])[];

export function buildTimelineLayout(
  cellCount: number,
  gapPathsAt: GapPathsAt,
  cellWidth: number = CELL_WIDTH,
  gapWidth: number = BASE_GAP_WIDTH,
): TimelineLayout {
  const segments: TimelineSegment[] = [];
  const boundaries: Boundary[] = [];
  const cellLefts: number[] = [];
  let x = 0;

  for (let time = 0; time <= cellCount; time += 1) {
    const runLeft = x;
    const gaps = gapPathsAt(time).map((path): TimelineGap => {
      const gap: TimelineGap = {
        kind: "gap",
        time,
        path,
        width: gapWidth,
        left: x,
        center: x + gapWidth / 2,
        right: x + gapWidth,
      };
      segments.push(gap);
      x += gapWidth;
      return gap;
    });
    boundaries.push({ time, left: runLeft, right: x, gaps });

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

export function anchorGapCenter(layout: TimelineLayout, time: number): number {
  return layout.boundaries[time].gaps[0].center;
}

export type LoopEdge = "start" | "end";

export function loopEdgeX(
  layout: TimelineLayout,
  time: number,
  loopId: string,
  edge: LoopEdge,
): number {
  const gaps = layout.boundaries[time].gaps;
  for (let index = 0; index + 1 < gaps.length; index += 1) {
    const before = gaps[index].path.includes(loopId);
    const after = gaps[index + 1].path.includes(loopId);
    if (edge === "start" ? !before && after : before && !after) {
      return gaps[index].right;
    }
  }
  throw new Error(`No ${edge} edge of loop ${loopId} at time ${time}`);
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

export interface BlockEdgeAnchors {
  readonly left: readonly string[] | null;
  readonly right: readonly string[] | null;
}

function gapAtPath(
  layout: TimelineLayout,
  time: number,
  path: readonly string[],
): TimelineGap {
  const gap = layout.boundaries[time].gaps.find(
    (candidate) =>
      candidate.path.length === path.length &&
      candidate.path.every((id, index) => id === path[index]),
  );
  if (gap === undefined) {
    throw new Error(`No gap at time ${time} for path ${path.join("/")}`);
  }
  return gap;
}

export function blockSpan(
  layout: TimelineLayout,
  start: number,
  length: number,
  inset: number,
  anchors: BlockEdgeAnchors = { left: null, right: null },
): { readonly left: number; readonly width: number } {
  const left = anchors.left
    ? gapAtPath(layout, start, anchors.left).left + inset
    : cellLeft(layout, start) + inset;
  const right = anchors.right
    ? gapAtPath(layout, start + length, anchors.right).right - inset
    : cellRight(layout, start + length - 1) - inset;
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
