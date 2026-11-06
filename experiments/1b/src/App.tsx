import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { BlockKind, Placement } from "./model";
import { BLOCK_KINDS, BLOCK_LABELS, COLUMNS, TRACKS, canPlace } from "./model";
import { useExperimentStore } from "./store";

const CELL_WIDTH = 64;
const TRACK_HEIGHT = 48;

interface DragState {
  readonly pointerId: number;
  readonly mode: "move" | "resize";
  readonly originX: number;
  readonly originY: number;
  readonly start: number;
  readonly length: number;
  readonly trackId: string;
}

interface CreationState {
  readonly pointerId: number;
  readonly trackId: string;
  readonly kind: BlockKind;
  readonly anchor: number;
  readonly current: number;
}

const gridVariables = {
  "--cell-width": `${CELL_WIDTH}px`,
  "--track-height": `${TRACK_HEIGHT}px`,
} as CSSProperties;

export function App() {
  const blocks = useExperimentStore((state) => state.blocks);
  const selectedKind = useExperimentStore((state) => state.selectedKind);
  const selectedId = useExperimentStore((state) => state.selectedId);
  const setKind = useExperimentStore((state) => state.setKind);
  const create = useExperimentStore((state) => state.create);
  const remove = useExperimentStore((state) => state.remove);
  const clear = useExperimentStore((state) => state.clear);
  const [creation, setCreation] = useState<CreationState | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      const current = useExperimentStore.getState();
      if (!current.selectedId) {
        return;
      }
      event.preventDefault();
      current.remove(current.selectedId);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selected = blocks.find((block) => block.id === selectedId) ?? null;

  const handleRowPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    trackId: string,
  ) => {
    if (event.button !== 0 || creation) {
      return;
    }
    const start = cellFromPointer(event);
    if (!canPlace(blocks, { trackId, start, length: 1 })) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setCreation({
      pointerId: event.pointerId,
      trackId,
      kind: selectedKind,
      anchor: start,
      current: start,
    });
  };

  const handleRowPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointerId = event.pointerId;
    const currentCell = cellFromPointer(event);
    setCreation((state) =>
      state && state.pointerId === pointerId
        ? { ...state, current: currentCell }
        : state,
    );
  };

  const finishCreation = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = creation;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const end = cellFromPointer(event);
    const start = Math.min(active.anchor, end);
    const length = Math.abs(end - active.anchor) + 1;
    create(active.trackId, active.kind, start, length);
    setCreation(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelCreation = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!creation || creation.pointerId !== event.pointerId) {
      return;
    }
    setCreation(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const previewStart = creation ? Math.min(creation.anchor, creation.current) : 0;
  const previewLength = creation
    ? Math.abs(creation.current - creation.anchor) + 1
    : 0;
  const previewTrackIndex = creation
    ? TRACKS.findIndex((track) => track.id === creation.trackId)
    : -1;
  const previewValid =
    creation !== null &&
    canPlace(blocks, {
      trackId: creation.trackId,
      start: previewStart,
      length: previewLength,
    });

  return (
    <main className="app" style={gridVariables}>
      <header className="toolbar">
        <div className="palette" role="group" aria-label="Block kinds">
          {BLOCK_KINDS.map((kind) => (
            <button
              type="button"
              key={kind}
              className={`palette-button palette-${kind}${kind === selectedKind ? " is-active" : ""}`}
              aria-pressed={kind === selectedKind}
              onClick={() => setKind(kind)}
            >
              {BLOCK_LABELS[kind]}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <button
            type="button"
            onClick={() => selectedId && remove(selectedId)}
            disabled={!selectedId}
          >
            Delete selected
          </button>
          <button type="button" onClick={clear} disabled={blocks.length === 0}>
            Clear all
          </button>
        </div>
      </header>

      <p className="hint">
        Pick a kind, then drag across empty cells to place a block from its start to its end. Drag
        a block to move it. Drag its right edge to stretch it. Delete removes the selected block.
      </p>

      <div className="table">
        <div className="track-labels">
          <div className="ruler-spacer" />
          {TRACKS.map((track) => (
            <div key={track.id} className="track-label" title={track.label}>
              {track.label}
            </div>
          ))}
        </div>
        <div className="grid-scroll">
          <div className="grid-content">
            <div className="ruler">
              {Array.from({ length: COLUMNS }, (_, column) => (
                <span key={column} className="ruler-cell">
                  {column}
                </span>
              ))}
            </div>
            <div className="tracks-area">
              {TRACKS.map((track) => (
                <div
                  key={track.id}
                  className="track-row"
                  onPointerDown={(event) => handleRowPointerDown(event, track.id)}
                  onPointerMove={handleRowPointerMove}
                  onPointerUp={finishCreation}
                  onPointerCancel={cancelCreation}
                />
              ))}
              <div className="block-layer">
                {blocks.map((block) => (
                  <BlockView
                    key={block.id}
                    block={block}
                    selected={block.id === selectedId}
                  />
                ))}
                {creation ? (
                  <div
                    className={`block block-${creation.kind} is-preview${previewValid ? "" : " is-invalid"}`}
                    style={{
                      left: previewStart * CELL_WIDTH + 3,
                      top: previewTrackIndex * TRACK_HEIGHT + 3,
                      width: previewLength * CELL_WIDTH - 6,
                      height: TRACK_HEIGHT - 6,
                    }}
                  >
                    <span className="block-label">{BLOCK_LABELS[creation.kind]}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="status">
        {selected ? (
          <>
            Selected <strong>{BLOCK_LABELS[selected.kind]}</strong> on{" "}
            {TRACKS.find((track) => track.id === selected.trackId)?.label ?? selected.trackId} at t=
            {selected.start}–{selected.start + selected.length} ({selected.length}{" "}
            {selected.length === 1 ? "cell" : "cells"})
          </>
        ) : (
          "Nothing selected"
        )}
        <span className="status-count">{blocks.length} blocks</span>
      </footer>
    </main>
  );
}

function BlockView({ block, selected }: { block: Placement; selected: boolean }) {
  const move = useExperimentStore((state) => state.move);
  const resize = useExperimentStore((state) => state.resize);
  const select = useExperimentStore((state) => state.select);
  const drag = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const trackIndex = TRACKS.findIndex((track) => track.id === block.trackId);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    select(block.id);
    const target = event.target as HTMLElement;
    drag.current = {
      pointerId: event.pointerId,
      mode: target.dataset.handle === "resize" ? "resize" : "move",
      originX: event.clientX,
      originY: event.clientY,
      start: block.start,
      length: block.length,
      trackId: block.trackId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    if (current.mode === "move") {
      const deltaColumns = Math.round((event.clientX - current.originX) / CELL_WIDTH);
      const deltaTracks = Math.round((event.clientY - current.originY) / TRACK_HEIGHT);
      const start = clamp(current.start + deltaColumns, 0, COLUMNS - current.length);
      const currentIndex = TRACKS.findIndex((track) => track.id === current.trackId);
      const nextIndex = clamp(currentIndex + deltaTracks, 0, TRACKS.length - 1);
      move(block.id, TRACKS[nextIndex].id, start);
      return;
    }
    const deltaColumns = Math.round((event.clientX - current.originX) / CELL_WIDTH);
    const length = clamp(current.length + deltaColumns, 1, COLUMNS - current.start);
    resize(block.id, length);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) {
      return;
    }
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className={`block block-${block.kind}${selected ? " is-selected" : ""}${dragging ? " is-dragging" : ""}`}
      style={{
        left: block.start * CELL_WIDTH + 3,
        top: trackIndex * TRACK_HEIGHT + 3,
        width: block.length * CELL_WIDTH - 6,
        height: TRACK_HEIGHT - 6,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <span className="block-label">{BLOCK_LABELS[block.kind]}</span>
      <span className="resize-handle" data-handle="resize" aria-hidden="true" />
    </div>
  );
}

function cellFromPointer(event: ReactPointerEvent<HTMLDivElement>): number {
  const rect = event.currentTarget.getBoundingClientRect();
  return clamp(
    Math.floor((event.clientX - rect.left) / CELL_WIDTH),
    0,
    COLUMNS - 1,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
