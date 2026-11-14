export interface GapLoop {
  readonly start: number;
  readonly end: number;
}

export function boundaryGapContexts<T extends GapLoop>(
  loops: readonly T[],
  time: number,
): T[][] {
  const left = loops.filter((loop) => loop.start < time && loop.end >= time);
  const right = loops.filter((loop) => loop.start <= time && loop.end > time);
  let common = 0;
  while (common < left.length && common < right.length && left[common] === right[common]) {
    common += 1;
  }
  const contexts: T[][] = [left];
  let current = left;
  while (current.length > common) {
    current = current.slice(0, -1);
    contexts.push(current);
  }
  for (const loop of right.slice(common)) {
    current = [...current, loop];
    contexts.push(current);
  }
  return contexts;
}
