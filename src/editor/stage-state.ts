import { create } from "zustand";

import type {
  StageActions,
  StageAnimationCard,
  StageAnimationPlayback,
  StageDialogueCard,
  StagePrimitive,
  StageRectangle,
} from "../core/blocks/presentation.ts";

export type {
  StageActions,
  StageAnimationCard,
  StageAnimationPlayback,
  StageDialogueCard,
  StageLayer,
  StagePrimitive,
  StageRectangle,
} from "../core/blocks/presentation.ts";

interface StageState extends StageActions {
  readonly items: readonly StagePrimitive[];
}

export function createStageStore() {
  return create<StageState>((set) => ({
    items: [],
    addDialogue: (card: StageDialogueCard) => set((state) => ({
      items: [...state.items, card],
    })),
    addAnimation: (card: StageAnimationCard) => set((state) => ({
      items: [...state.items, card],
    })),
    addRectangle: (rectangle: StageRectangle) => set((state) => ({
      items: [...state.items, rectangle],
    })),
    updateAnimationPlayback: (id: string, playback: StageAnimationPlayback) =>
      set((state) => ({
        items: state.items.map((item) =>
          item.id === id && item.type === "animation"
            ? { ...item, playback }
            : item,
        ),
      })),
    remove: (id) => set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
  }));
}
