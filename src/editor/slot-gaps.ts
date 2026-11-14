import { initializationPathKey, type Slot } from "../core/slots/numeric-slots";
import { boundaryGapPaths, type LoopNode } from "./loops";

export function slotGapExists(
  loops: readonly LoopNode[],
  boundary: number,
  path: readonly string[],
): boolean {
  const key = initializationPathKey(path);
  return boundaryGapPaths(loops, boundary).some(
    (context) => initializationPathKey(context) === key,
  );
}

function liveInitializations<T extends { boundary: number; path: readonly string[] }>(
  initializations: readonly T[],
  loops: readonly LoopNode[],
): T[] {
  return initializations.filter((initialization) =>
    slotGapExists(loops, initialization.boundary, initialization.path),
  );
}

export function liveNumericSlots(
  slots: readonly Slot[],
  loops: readonly LoopNode[],
): readonly Slot[] {
  return slots.map((slot) => {
    if (slot.type === "string") {
      return {
        ...slot,
        initializations: liveInitializations(slot.initializations, loops),
      };
    }
    return {
      ...slot,
      initializations: liveInitializations(slot.initializations, loops),
    };
  });
}
