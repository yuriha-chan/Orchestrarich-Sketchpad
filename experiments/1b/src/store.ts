import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { BlockKind, Placement } from "./model";
import { canPlace } from "./model";
import type { WorkspaceId } from "./workspaces";

interface ExperimentState {
  blocks: Placement[];
  selectedKind: BlockKind;
  selectedId: string | null;
  workspace: WorkspaceId;
  create: (trackId: string, kind: BlockKind, start: number, length: number) => void;
  move: (id: string, trackId: string, start: number) => void;
  resize: (id: string, length: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  select: (id: string | null) => void;
  setKind: (kind: BlockKind) => void;
  setBlockKind: (id: string, kind: BlockKind) => void;
  setCooperativeSkip: (id: string, value: boolean) => void;
  setWorkspace: (id: WorkspaceId) => void;
}

let nextId = 1;

export const useExperimentStore = create<ExperimentState>()(
  immer((set) => ({
    blocks: [],
    selectedKind: "dialogue",
    selectedId: null,
    workspace: "staging",
    create: (trackId, kind, start, length) =>
      set((state) => {
        const id = `placement-${nextId}`;
        const candidate: Placement = {
          id,
          trackId,
          kind,
          start,
          length,
          cooperativeSkip: false,
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
    setBlockKind: (id, kind) =>
      set((state) => {
        const block = state.blocks.find((candidate) => candidate.id === id);
        if (block) {
          block.kind = kind;
        }
      }),
    setCooperativeSkip: (id, value) =>
      set((state) => {
        const block = state.blocks.find((candidate) => candidate.id === id);
        if (block) {
          block.cooperativeSkip = value;
        }
      }),
    setWorkspace: (id) =>
      set((state) => {
        state.workspace = id;
      }),
  })),
);
