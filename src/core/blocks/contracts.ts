import type { SlotType } from "../slots/numeric-slots.ts";

export type SlotDirection = "input" | "output";

export interface SlotProperty {
  readonly key: string;
  readonly label: string;
  readonly direction: SlotDirection;
  readonly type: SlotType;
}

export interface BoundSlotProperty {
  readonly key: string;
  readonly slotId: string;
  readonly type: SlotType;
}

export interface LoopRegion {
  readonly start: number;
  readonly end: number;
}
