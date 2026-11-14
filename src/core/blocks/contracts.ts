export type SlotDirection = "input" | "output";

export interface SlotProperty {
  readonly key: string;
  readonly label: string;
  readonly direction: SlotDirection;
}

export interface BoundSlotProperty {
  readonly key: string;
  readonly slotId: string;
}

export interface LoopRegion {
  readonly start: number;
  readonly end: number;
}
