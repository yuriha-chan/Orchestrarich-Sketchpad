export type SlotType = "number" | "string";

export interface NumericSlotInitialization {
  readonly boundary: number;
  readonly path: readonly string[];
  readonly value: number;
}

export interface StringSlotInitialization {
  readonly boundary: number;
  readonly path: readonly string[];
  readonly value: string;
}

interface SlotBase {
  readonly id: string;
  readonly trackId: string | null;
  readonly name?: string;
}

export interface NumericSlot extends SlotBase {
  readonly type: "number";
  readonly initializations: readonly NumericSlotInitialization[];
}

export interface StringSlot extends SlotBase {
  readonly type: "string";
  readonly initializations: readonly StringSlotInitialization[];
}

export type Slot = NumericSlot | StringSlot;

export type SlotInitialization = NumericSlotInitialization | StringSlotInitialization;

export function initializationPathKey(path: readonly string[]): string {
  return path.join("/");
}

export interface NumericSlotRead {
  readonly slotId: string;
  readonly trackId: string;
  readonly time: number;
}

export interface NumericSlotWrite {
  readonly slotId: string;
  readonly trackId: string;
  readonly time: number;
}

export interface SlotTypeBinding {
  readonly slotId: string;
  readonly type: SlotType;
}

export function validateSlotTypes(
  slots: readonly Slot[],
  bindings: readonly SlotTypeBinding[],
): readonly SlotTypeBinding[] {
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  return bindings.filter((binding) => {
    const slot = slotsById.get(binding.slotId);
    return slot !== undefined && slot.type !== binding.type;
  });
}

export function validateNumericSlotReads(
  slots: readonly Slot[],
  reads: readonly NumericSlotRead[],
  writes: readonly NumericSlotWrite[] = [],
): readonly NumericSlotRead[] {
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));

  return reads.filter((read) => {
    const slot = slotsById.get(read.slotId);

    if (slot === undefined) {
      return true;
    }
    if (slot.trackId !== null && slot.trackId !== read.trackId) {
      return true;
    }
    const initializations: readonly SlotInitialization[] = slot.initializations;
    if (
      initializations.some(
        (initialization) => initialization.boundary <= read.time,
      )
    ) {
      return false;
    }
    return !writes.some(
      (write) => write.slotId === read.slotId && write.time <= read.time,
    );
  });
}

export function validateNumericSlotWrites(
  slots: readonly Slot[],
  writes: readonly NumericSlotWrite[],
): readonly NumericSlotWrite[] {
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  return writes.filter((write) => {
    const slot = slotsById.get(write.slotId);
    return (
      slot === undefined ||
      (slot.trackId !== null && slot.trackId !== write.trackId)
    );
  });
}
