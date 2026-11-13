import { create } from "zustand";

export type StageLayer = "screen" | "card";

export interface StageItem {
  readonly id: string;
  readonly kind: string;
  readonly layer: StageLayer;
  readonly payload: unknown;
}

export interface StageActions {
  readonly add: (item: StageItem) => void;
  readonly remove: (id: string) => void;
  readonly update: (id: string, payload: unknown) => void;
}

interface StageState extends StageActions {
  readonly items: readonly StageItem[];
}

export function createStageStore() {
  return create<StageState>((set) => ({
    items: [],
    add: (item) => set((state) => ({ items: [...state.items, item] })),
    remove: (id) => set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
    update: (id, payload) => set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, payload } : item,
      ),
    })),
  }));
}
