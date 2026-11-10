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

export function validateNumericSlotReads(
  slots: readonly NumericSlot[],
  reads: readonly NumericSlotRead[],
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
    return !slot.initializations.some(
      (initialization) => initialization.time <= read.time,
    );
  });
}
