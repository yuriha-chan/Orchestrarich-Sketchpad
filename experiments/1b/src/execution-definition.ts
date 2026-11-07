import type { BlockDefinition } from "../../../src/core/execution/timeline-runner.ts";
import { isMediaPlacement, mediaPhases, phaseBlockId, type Placement } from "./model";

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

export function compilePlacement(placement: Placement): ExecutionDefinition {
  return {
    placement,
    structure: isMediaPlacement(placement)
      ? {
          type: "multi-phase",
          phases: mediaPhases(placement.fadeIn, placement.fadeOut, placement.length),
        }
      : { type: "single" },
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
