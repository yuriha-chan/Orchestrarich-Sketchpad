export interface NumericSlotInitialization {
  readonly time: number;
  readonly value: number;
}

export interface NumericSlot {
  readonly id: string;
  readonly trackId: string | null;
  readonly name?: string;
  readonly initializations: readonly NumericSlotInitialization[];
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

export function validateNumericSlotReads(
  slots: readonly NumericSlot[],
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
    if (
      slot.initializations.some(
        (initialization) => initialization.time <= read.time,
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
  slots: readonly NumericSlot[],
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
