import type { BlockDefinition } from "./block-definition";
import { packBlockDefinition } from "./block-definition";
import type {
  BoundSlotProperty,
  SlotDirection,
} from "../core/blocks/contracts.ts";
import type { Placement } from "../core/blocks/placement.ts";
import dialogue from "./dialogue";
import camera from "./camera";
import sound from "./sound";
import animation from "./animation";
import wait from "./wait";
import rectangle from "./rectangle";
import addition from "./addition";

export const BLOCK_DEFINITIONS: readonly BlockDefinition[] = [
  packBlockDefinition(dialogue),
  packBlockDefinition(camera),
  packBlockDefinition(sound),
  packBlockDefinition(animation),
  packBlockDefinition(wait),
  packBlockDefinition(rectangle),
  packBlockDefinition(addition),
];

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
