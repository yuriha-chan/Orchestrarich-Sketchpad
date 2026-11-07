import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  BlockKind,
  DurationUnit,
  Placement,
  RectUnit,
  Track,
} from "./model";
import {
  canPlace,
  clampFadesToLength,
  convertDuration,
  convertPlacementKind,
  DEFAULT_BPM,
  DEFAULT_GRID_COLUMNS,
  DEFAULT_GRID_ROWS,
  DEFAULT_RECT_GEOMETRY,
  DEFAULT_TRACKS,
  isMediaKind,
  isMediaPlacement,
  isRectanglePlacement,
  MAX_GRID_SIZE,
  MIN_GRID_SIZE,
} from "./model";
import type { WorkspaceId } from "./workspaces";
import { convertRectUnit } from "./stage-geometry";

interface ExperimentState {
  blocks: Placement[];
  tracks: Track[];
  bpm: number;
  gridColumns: number;
  gridRows: number;
  selectedKind: BlockKind;
  selectedId: string | null;
  workspace: WorkspaceId;
  addTrack: () => void;
  create: (trackId: string, kind: BlockKind, start: number, length: number) => void;
  move: (id: string, trackId: string, start: number) => void;
  resize: (id: string, length: number) => void;
  setSpan: (
    id: string,
    start: number,
    length: number,
    fades?: { fadeIn?: number; fadeOut?: number },
  ) => void;
  remove: (id: string) => void;
  clear: () => void;
  select: (id: string | null) => void;
  setKind: (kind: BlockKind) => void;
  setBlockKind: (id: string, kind: BlockKind) => void;
  setCooperativeSkip: (id: string, value: boolean) => void;
  setFadeIn: (id: string, value: number) => void;
  setFadeOut: (id: string, value: number) => void;
  setDuration: (id: string, value: number) => void;
  setDurationUnit: (id: string, unit: DurationUnit) => void;
  setSyncBeatsToCellSpan: (id: string, value: boolean) => void;
  setRectValue: (id: string, field: "x" | "y" | "w" | "h", value: number) => void;
  setRectUnit: (id: string, unit: RectUnit, span: number) => void;
  setBpm: (value: number) => void;
  setGridColumns: (value: number) => void;
  setGridRows: (value: number) => void;
  setWorkspace: (id: WorkspaceId) => void;
}

interface SpanState {
  blocks: Placement[];
  tracks: Track[];
}

function editBlock(
  state: SpanState,
  id: string,
  edit: (block: Placement) => void,
): void {
  const block = state.blocks.find((candidate) => candidate.id === id);
  if (block !== undefined) {
    edit(block);
  }
}

function applySpan(
  state: SpanState,
  block: Placement,
  start: number,
  length: number,
  fades?: { fadeIn?: number; fadeOut?: number },
): void {
  if (
    !canPlace(
      state.tracks,
      state.blocks,
      { trackId: block.trackId, start, length },
      block.id,
    )
  ) {
    return;
  }
  block.start = start;
  block.length = length;
  if (block.kind !== "dialogue" && block.syncBeatsToCellSpan) {
    block.duration = length;
  }
  if (isMediaPlacement(block)) {
    const clamped = clampFadesToLength(
      fades?.fadeIn ?? block.fadeIn,
      fades?.fadeOut ?? block.fadeOut,
      length,
    );
    block.fadeIn = clamped.fadeIn;
    block.fadeOut = clamped.fadeOut;
  }
}

function clampGridSize(value: number): number {
  return Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, Math.round(value)));
}

let nextId = 1;
let nextTrackId = 1;

export const useExperimentStore = create<ExperimentState>()(
  immer((set) => ({
    blocks: [],
    tracks: DEFAULT_TRACKS.map((track) => ({ ...track })),
    bpm: DEFAULT_BPM,
    gridColumns: DEFAULT_GRID_COLUMNS,
    gridRows: DEFAULT_GRID_ROWS,
    selectedKind: "dialogue",
    selectedId: null,
    workspace: "staging",
    addTrack: () =>
      set((state) => {
        state.tracks.push({
          id: `track-${nextTrackId}`,
          label: `Track ${state.tracks.length + 1}`,
        });
        nextTrackId += 1;
      }),
    create: (trackId, kind, start, length) =>
      set((state) => {
        const id = `placement-${nextId}`;
        const base = { id, trackId, start, length, cooperativeSkip: false };
        const candidate: Placement =
          kind === "dialogue"
            ? { ...base, kind }
            : isMediaKind(kind)
              ? {
                  ...base,
                  kind,
                  duration: length,
                  durationUnit: "beats",
                  syncBeatsToCellSpan: false,
                  fadeIn: 0,
                  fadeOut: 0,
                }
              : kind === "rectangle"
                ? {
                    ...base,
                    kind,
                    duration: length,
                    durationUnit: "beats",
                    syncBeatsToCellSpan: false,
                    ...DEFAULT_RECT_GEOMETRY,
                  }
                : {
                    ...base,
                    kind,
                    duration: length,
                    durationUnit: "beats",
                    syncBeatsToCellSpan: false,
                  };
        if (!canPlace(state.tracks, state.blocks, candidate)) {
          return;
        }
        nextId += 1;
        state.blocks.push(candidate);
        state.selectedId = id;
      }),
    move: (id, trackId, start) =>
      set((state) => {
        editBlock(state, id, (block) => {
          if (
            !canPlace(
              state.tracks,
              state.blocks,
              { trackId, start, length: block.length },
              id,
            )
          ) {
            return;
          }
          block.trackId = trackId;
          block.start = start;
        });
      }),
    resize: (id, length) =>
      set((state) => {
        editBlock(state, id, (block) =>
          applySpan(state, block, block.start, length),
        );
      }),
    setSpan: (id, start, length, fades) =>
      set((state) => {
        editBlock(state, id, (block) =>
          applySpan(state, block, start, length, fades),
        );
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
        state.blocks = state.blocks.map((block) =>
          block.id === id ? convertPlacementKind(block, kind) : block,
        );
      }),
    setCooperativeSkip: (id, value) =>
      set((state) => {
        editBlock(state, id, (block) => {
          block.cooperativeSkip = value;
        });
      }),
    setFadeIn: (id, value) =>
      set((state) => {
        editBlock(state, id, (block) => {
          if (!isMediaPlacement(block)) {
            return;
          }
          const fades = clampFadesToLength(value, block.fadeOut, block.length);
          block.fadeIn = fades.fadeIn;
          block.fadeOut = fades.fadeOut;
        });
      }),
    setFadeOut: (id, value) =>
      set((state) => {
        editBlock(state, id, (block) => {
          if (!isMediaPlacement(block)) {
            return;
          }
          const fades = clampFadesToLength(block.fadeIn, value, block.length);
          block.fadeIn = fades.fadeIn;
          block.fadeOut = fades.fadeOut;
        });
      }),
    setDuration: (id, value) =>
      set((state) => {
        editBlock(state, id, (block) => {
          if (
            block.kind === "dialogue" ||
            block.syncBeatsToCellSpan ||
            !Number.isFinite(value) ||
            value <= 0
          ) {
            return;
          }
          block.duration = value;
        });
      }),
    setDurationUnit: (id, unit) =>
      set((state) => {
        editBlock(state, id, (block) => {
          if (
            block.kind === "dialogue" ||
            block.syncBeatsToCellSpan ||
            block.durationUnit === unit
          ) {
            return;
          }
          block.duration = convertDuration(
            block.duration,
            block.durationUnit,
            unit,
            state.bpm,
          );
          block.durationUnit = unit;
        });
      }),
    setSyncBeatsToCellSpan: (id, value) =>
      set((state) => {
        editBlock(state, id, (block) => {
          if (block.kind === "dialogue") {
            return;
          }
          block.syncBeatsToCellSpan = value;
          if (value) {
            block.durationUnit = "beats";
            block.duration = block.length;
          }
        });
      }),
    setRectValue: (id, field, value) =>
      set((state) => {
        editBlock(state, id, (block) => {
          if (!isRectanglePlacement(block) || !Number.isFinite(value)) {
            return;
          }
          if (field === "x" || field === "y") {
            if (value >= 0) {
              block[field] = value;
            }
          } else if (value > 0) {
            block[field] = value;
          }
        });
      }),
    setRectUnit: (id, unit, span) =>
      set((state) => {
        editBlock(state, id, (block) => {
          if (!isRectanglePlacement(block) || block.rectUnit === unit) {
            return;
          }
          const converted = convertRectUnit(block, unit, span);
          block.x = converted.x;
          block.y = converted.y;
          block.w = converted.w;
          block.h = converted.h;
          block.rectUnit = unit;
        });
      }),
    setBpm: (value) =>
      set((state) => {
        if (Number.isFinite(value) && value > 0) {
          state.bpm = value;
        }
      }),
    setGridColumns: (value) =>
      set((state) => {
        if (Number.isFinite(value)) {
          state.gridColumns = clampGridSize(value);
        }
      }),
    setGridRows: (value) =>
      set((state) => {
        if (Number.isFinite(value)) {
          state.gridRows = clampGridSize(value);
        }
      }),
    setWorkspace: (id) =>
      set((state) => {
        state.workspace = id;
      }),
  })),
);
