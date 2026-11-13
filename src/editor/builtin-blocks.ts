import type { BlockDefinition, BlockDefinitionSpec } from "./block-definition";
import { deriveSlotProperties } from "./block-definition";
import type {
  BoundSlotProperty,
  Placement,
  SlotDirection,
} from "./model";
import dialogue from "./blocks/dialogue";
import camera from "./blocks/camera";
import sound from "./blocks/sound";
import animation from "./blocks/animation";
import wait from "./blocks/wait";
import rectangle from "./blocks/rectangle";
import addition from "./blocks/addition";

const BLOCK_SPECS: readonly BlockDefinitionSpec[] = [
  dialogue,
  camera,
  sound,
  animation,
  wait,
  rectangle,
  addition,
];

export const BLOCK_DEFINITIONS: readonly BlockDefinition[] = BLOCK_SPECS.map(
  (spec) => ({ ...spec, slotProperties: deriveSlotProperties(spec.fields) }),
);

export function blockDefinition(kind: string): BlockDefinition {
  const definition = BLOCK_DEFINITIONS.find((entry) => entry.kind === kind);
  if (definition === undefined) {
    throw new Error(`Unknown block kind "${kind}"`);
  }
  return definition;
}

export function boundSlotProperties(
  placement: Placement,
  direction: SlotDirection,
): readonly BoundSlotProperty[] {
  const bindings = placement.slotBindings;
  if (bindings === undefined) {
    return [];
  }
  const bound: BoundSlotProperty[] = [];
  for (const property of blockDefinition(placement.kind).slotProperties) {
    if (property.direction !== direction) {
      continue;
    }
    const slotId = bindings[property.key];
    if (slotId !== undefined) {
      bound.push({ key: property.key, slotId });
    }
  }
  return bound;
}
