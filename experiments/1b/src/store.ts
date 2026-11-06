import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { BlockKind, Placement } from "./model";
import { canPlace } from "./model";

interface ExperimentState {
  blocks: Placement[];
  selectedKind: BlockKind;
  selectedId: string | null;
  create: (trackId: string, kind: BlockKind, start: number, length: number) => void;
  move: (id: string, trackId: string, start: number) => void;
  resize: (id: string, length: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  select: (id: string | null) => void;
  setKind: (kind: BlockKind) => void;
}

let nextId = 1;

export const useExperimentStore = create<ExperimentState>()(
  immer((set) => ({
    blocks: [],
    selectedKind: "dialogue",
    selectedId: null,
    create: (trackId, kind, start, length) =>
      set((state) => {
        const id = `placement-${nextId}`;
        const candidate: Placement = {
          id,
          trackId,
          kind,
          start,
          length,
        };
        if (!canPlace(state.blocks, candidate)) {
          return;
        }
        nextId += 1;
        state.blocks.push(candidate);
        state.selectedId = id;
      }),
    move: (id, trackId, start) =>
      set((state) => {
        const block = state.blocks.find((candidate) => candidate.id === id);
        if (!block) {
          return;
        }
        if (!canPlace(state.blocks, { trackId, start, length: block.length }, id)) {
          return;
        }
        block.trackId = trackId;
        block.start = start;
      }),
    resize: (id, length) =>
      set((state) => {
        const block = state.blocks.find((candidate) => candidate.id === id);
        if (!block) {
          return;
        }
        if (
          !canPlace(
            state.blocks,
            { trackId: block.trackId, start: block.start, length },
            id,
          )
        ) {
          return;
        }
        block.length = length;
      }),
    remove: (id) =>
      set((state) => {
        state.blocks = state.blocks.filter((block) => block.id !== id);
        if (state.selectedId === id) {
          state.selectedId = null;
        }
      }),
    clear: () =>
      set((state) => {
        state.blocks = [];
        state.selectedId = null;
      }),
    select: (id) =>
      set((state) => {
        state.selectedId = id;
      }),
    setKind: (kind) =>
      set((state) => {
        state.selectedKind = kind;
      }),
  })),
);
