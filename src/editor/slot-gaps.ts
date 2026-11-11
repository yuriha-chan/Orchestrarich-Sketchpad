import { initializationPathKey, type NumericSlot } from "../core/slots/numeric-slots";
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

export function liveNumericSlots(
  slots: readonly NumericSlot[],
  loops: readonly LoopNode[],
): readonly NumericSlot[] {
  return slots.map((slot) => ({
    ...slot,
    initializations: slot.initializations.filter((initialization) =>
      slotGapExists(loops, initialization.boundary, initialization.path),
    ),
  }));
}
