import { create } from "zustand";
import type { RectUnit } from "./model";

export interface DialogueView {
  readonly kind: "dialogue";
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly confirm: () => void;
}

export interface AnimationView {
  readonly kind: "animation";
  readonly id: string;
  readonly label: string;
  readonly durationMs: number;
  readonly fadeInFraction: number;
  readonly fadeOutFraction: number;
  readonly playback: AnimationPlayback;
}

export interface AnimationPlayback {
  readonly positionMs: number;
  readonly playing: boolean;
}

export interface RectangleView {
  readonly kind: "rectangle";
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly unit: RectUnit;
}

export type StageItem = DialogueView | AnimationView | RectangleView;

export interface StageActions {
  readonly add: (item: StageItem) => void;
  readonly remove: (id: string) => void;
  readonly setAnimationPlayback: (id: string, playback: AnimationPlayback) => void;
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
    setAnimationPlayback: (id, playback) => set((state) => ({
      items: state.items.map((item) => item.id === id && item.kind === "animation"
        ? { ...item, playback }
        : item),
    })),
  }));
}
