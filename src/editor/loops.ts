import type { LoopRegion, Placement } from "./model";
import { partiallyOverlapsLoop } from "./model";

export interface LoopNode extends LoopRegion {
  readonly id: string;
  readonly children: LoopNode[];
}

function containsRegion(outer: LoopRegion, inner: LoopRegion): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

function intersects(a: LoopRegion, b: LoopRegion): boolean {
  return a.start < b.end && b.start < a.end;
}

function sortLoops(loops: readonly LoopNode[]): LoopNode[] {
  return [...loops].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function allLoops(loops: readonly LoopNode[]): LoopNode[] {
  return loops.flatMap((node) => [node, ...allLoops(node.children)]);
}

export function boundaryGapPaths(
  loops: readonly LoopNode[],
  time: number,
): string[][] {
  const nodes = allLoops(loops);
  const leftPath = nodes
    .filter((node) => node.start < time && node.end >= time)
    .map((node) => node.id);
  const rightPath = nodes
    .filter((node) => node.start <= time && node.end > time)
    .map((node) => node.id);

  let common = 0;
  while (
    common < leftPath.length &&
    common < rightPath.length &&
    leftPath[common] === rightPath[common]
  ) {
    common += 1;
  }

  const contexts: string[][] = [leftPath];
  let current = leftPath;
  while (current.length > common) {
    current = current.slice(0, -1);
    contexts.push(current);
  }
  for (const id of rightPath.slice(common)) {
    current = [...current, id];
    contexts.push(current);
  }
  return contexts;
}

export function maxLoopDepth(loops: readonly LoopNode[]): number {
  return loops.reduce(
    (maximum, node) => Math.max(maximum, 1 + maxLoopDepth(node.children)),
    0,
  );
}

function levelIsWellFormed(
  loops: readonly LoopNode[],
  parent: LoopRegion | null,
): boolean {
  let previousEnd = -Infinity;
  for (const node of sortLoops(loops)) {
    if (
      !Number.isInteger(node.start) ||
      !Number.isInteger(node.end) ||
      node.start < 0 ||
      node.start >= node.end
    ) {
      return false;
    }
    if (
      parent !== null &&
      (node.start < parent.start || node.end > parent.end)
    ) {
      return false;
    }
    if (node.start < previousEnd) {
      return false;
    }
    if (!levelIsWellFormed(node.children, node)) {
      return false;
    }
    previousEnd = node.end;
  }
  return true;
}

export function loopsAreWellFormed(loops: readonly LoopNode[]): boolean {
  return levelIsWellFormed(loops, null);
}

function absorbContained(
  node: LoopNode,
  siblings: readonly LoopNode[],
): { node: LoopNode; siblings: LoopNode[] } | null {
  const absorbed = siblings.filter(
    (sibling) => intersects(node, sibling) && containsRegion(node, sibling),
  );
  const rest = siblings.filter((sibling) => !absorbed.includes(sibling));
  if (rest.some((sibling) => intersects(node, sibling))) {
    return null;
  }
  return {
    node: { ...node, children: sortLoops([...node.children, ...absorbed]) },
    siblings: rest,
  };
}

function insertInto(
  loops: readonly LoopNode[],
  node: LoopNode,
): LoopNode[] | null {
  const parent = loops.find((existing) => containsRegion(existing, node));
  if (parent !== undefined) {
    const children = insertInto(parent.children, node);
    if (children === null) {
      return null;
    }
    return sortLoops(
      loops.map((existing) =>
        existing.id === parent.id ? { ...existing, children } : existing,
      ),
    );
  }
  const result = absorbContained(node, loops);
  if (result === null) {
    return null;
  }
  return sortLoops([...result.siblings, result.node]);
}

export function insertLoop(
  loops: readonly LoopNode[],
  id: string,
  start: number,
  end: number,
): LoopNode[] | null {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= end
  ) {
    return null;
  }
  return insertInto(loops, { id, start, end, children: [] });
}

function removeFrom(
  loops: readonly LoopNode[],
  id: string,
): { loops: LoopNode[]; removed: boolean } {
  let removed = false;
  const next: LoopNode[] = [];
  for (const node of loops) {
    if (node.id === id) {
      removed = true;
      next.push(...node.children);
      continue;
    }
    const child = removeFrom(node.children, id);
    if (child.removed) {
      removed = true;
      next.push({ ...node, children: child.loops });
    } else {
      next.push(node);
    }
  }
  return { loops: sortLoops(next), removed };
}

export function removeLoopNode(
  loops: readonly LoopNode[],
  id: string,
): LoopNode[] {
  return removeFrom(loops, id).loops;
}

type SpanUpdate =
  | { readonly status: "updated"; readonly loops: LoopNode[] }
  | { readonly status: "missing" | "invalid" };

function setSpanIn(
  loops: readonly LoopNode[],
  parent: LoopRegion | null,
  id: string,
  start: number,
  end: number,
): SpanUpdate {
  const index = loops.findIndex((node) => node.id === id);
  if (index >= 0) {
    const target = loops[index];
    const span: LoopRegion = { start, end };
    if (
      start >= end ||
      (parent !== null && !containsRegion(parent, span))
    ) {
      return { status: "invalid" };
    }
    const released = target.children.filter(
      (child) => !containsRegion(span, child),
    );
    if (released.some((child) => intersects(span, child))) {
      return { status: "invalid" };
    }
    const resized: LoopNode = {
      ...target,
      start,
      end,
      children: target.children.filter((child) =>
        containsRegion(span, child),
      ),
    };
    const absorbed = absorbContained(resized, [
      ...loops.filter((_, position) => position !== index),
      ...released,
    ]);
    if (absorbed === null) {
      return { status: "invalid" };
    }
    return {
      loops: sortLoops([...absorbed.siblings, absorbed.node]),
      status: "updated",
    };
  }
  for (let position = 0; position < loops.length; position += 1) {
    const child = setSpanIn(
      loops[position].children,
      loops[position],
      id,
      start,
      end,
    );
    if (child.status !== "updated") {
      if (child.status === "invalid") {
        return { status: "invalid" };
      }
      continue;
    }
    const updated = child.loops;
    return {
      loops: sortLoops(
        loops.map((node, other) =>
          other === position ? { ...node, children: updated } : node,
        ),
      ),
      status: "updated",
    };
  }
  return { status: "missing" };
}

export function setLoopSpan(
  loops: readonly LoopNode[],
  id: string,
  start: number,
  end: number,
): LoopNode[] | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0) {
    return null;
  }
  const result = setSpanIn(loops, null, id, start, end);
  return result.status === "updated" ? result.loops : null;
}

export function wrappableSpan(
  placements: readonly Placement[],
  start: number,
  length: number,
): LoopRegion {
  let region: LoopRegion = { start, end: start + length };
  let changed = true;
  while (changed) {
    changed = false;
    for (const placement of placements) {
      if (partiallyOverlapsLoop(placement.start, placement.length, region)) {
        region = {
          start: Math.min(region.start, placement.start),
          end: Math.max(region.end, placement.start + placement.length),
        };
        changed = true;
      }
    }
  }
  return region;
}

export function blocksRespectLoops(
  placements: readonly Placement[],
  regions: readonly LoopRegion[],
): boolean {
  return placements.every((placement) =>
    regions.every(
      (region) =>
        !partiallyOverlapsLoop(placement.start, placement.length, region),
    ),
  );
}
