export interface NumericSlot {
  readonly id: string;
  readonly trackId: string | null;
  readonly name?: string;
  readonly initialization: { readonly time: number; readonly value: number } | null;
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

    return (
      slot === undefined ||
      slot.initialization === null ||
      (slot.trackId !== null && slot.trackId !== read.trackId) ||
      read.time < slot.initialization.time
    );
  });
}
