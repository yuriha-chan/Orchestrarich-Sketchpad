import type { BlockDefinition } from "../core/execution/timeline-runner.ts";
import type { Placement } from "./model";
import { blockDefinition } from "./builtin-blocks";

export function phaseBlockId(placementId: string, index: number): string {
  return `${placementId}~${index}`;
}

export interface PhaseDefinition {
  readonly index: number;
  readonly offset: number;
  readonly length: number;
}

export type ExecutionStructure =
  | { readonly type: "single" }
  | { readonly type: "multi-phase"; readonly phases: readonly PhaseDefinition[] };

export interface ExecutionDefinition {
  readonly placement: Placement;
  readonly structure: ExecutionStructure;
}

export function isMultiPhase(
  structure: ExecutionStructure,
): structure is Extract<ExecutionStructure, { type: "multi-phase" }> {
  return structure.type === "multi-phase";
}

export function phaseOffsets(structure: ExecutionStructure): readonly number[] {
  return isMultiPhase(structure)
    ? structure.phases.slice(0, -1).map((phase) => phase.offset + phase.length)
    : [];
}

export function compilePlacement(placement: Placement): ExecutionDefinition {
  const phases = blockDefinition(placement.kind).phases?.(
    placement.data,
    placement.length,
  );
  return {
    placement,
    structure:
      phases === undefined
        ? { type: "single" }
        : { type: "multi-phase", phases },
  };
}

export function definitionBlocks(definition: ExecutionDefinition): BlockDefinition[] {
  const { placement, structure } = definition;
  if (!isMultiPhase(structure)) {
    return [{
      id: placement.id,
      start: placement.start,
      length: placement.length,
      cooperativeSkip: placement.cooperativeSkip,
    }];
  }
  return structure.phases.map((phase) => ({
    id: phaseBlockId(placement.id, phase.index),
    start: placement.start + phase.offset,
    length: phase.length,
    cooperativeSkip: placement.cooperativeSkip,
  }));
}
