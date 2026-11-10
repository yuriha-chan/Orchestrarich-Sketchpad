import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  UIEvent as ReactUIEvent,
} from "react";
import type {
  BlockKind,
  Placement,
  Track,
} from "./model";
import {
  BLOCK_KINDS,
  BLOCK_LABELS,
  MAX_BPM,
  MAX_GRID_SIZE,
  MIN_BPM,
  MIN_GRID_SIZE,
  canPlace,
  isMediaPlacement,
} from "./model";
import { generateDotGradientSVG } from "./dot-gradient";
import { dragFadeBoundary, fadeBoundaries } from "./fade-editing";
import type { FadeBoundary } from "./fade-editing";
import { useExperimentStore } from "./store";
import { TimelineSession, rectangleSlotReads } from "./execution";
import { Stage } from "./Stage";
import { createStageStore } from "./stage-state";
import { compilePlacement, definitionBlocks } from "./execution-definition";
import { WORKSPACES } from "./workspaces";
import {
  rowTop,
  timelineRows,
  trackAtY,
  trackRowIndex,
  type TimelineRow,
} from "./timeline-rows";
import {
  validateNumericSlotReads,
  type NumericSlot,
  type NumericSlotRead,
} from "../core/slots/numeric-slots";
import type {
  BlockState,
  TimelinePhase,
  TimelineSnapshot,
} from "../core/execution/timeline-runner.ts";

const CELL_WIDTH = 128;
const CELL_GAP = 32;
const TRACK_HEIGHT = 48;
const SLOT_HEIGHT = 24;
const INITIAL_COLUMNS = 16;
const COLUMN_CHUNK = 16;
const SLOT_EDITOR_WIDTH = 210;
const SLOT_CONTROL_HEIGHT = 32;

const PHASE_LABELS: Record<TimelinePhase, string> = {
  idle: "Not running",
  running: "Running",
  finished: "Finished",
  failed: "Failed",
};

const STATE_RANK: Record<BlockState, number> = {
  failed: 4,
  running: 3,
  pending: 2,
  completed: 1,
};

const FADE_HANDLE_PX = 10;

interface DragState {
  readonly pointerId: number;
  readonly mode: "move" | "resize" | "resizeStart" | "fadeIn" | "fadeOut";
  readonly originX: number;
  readonly originY: number;
  readonly start: number;
  readonly length: number;
  readonly fadeIn: number;
  readonly fadeOut: number;
  readonly trackId: string;
  readonly boundary?: FadeBoundary;
}

interface CreationState {
  readonly pointerId: number;
  readonly trackId: string;
  readonly kind: BlockKind;
  readonly anchor: number;
  readonly current: number;
}

interface ContextMenuState {
  readonly blockId: string;
  readonly x: number;
  readonly y: number;
}

interface RunState {
  readonly session: TimelineSession;
  readonly snapshot: TimelineSnapshot;
}

type RectField = "x" | "y" | "w" | "h";

const gridVariables = {
  "--cell-width": `${CELL_WIDTH}px`,
  "--cell-gap": `${CELL_GAP}px`,
  "--track-height": `${TRACK_HEIGHT}px`,
  "--slot-height": `${SLOT_HEIGHT}px`,
} as CSSProperties;

export function App() {
  const [useStageStore] = useState(createStageStore);
  const stageItems = useStageStore((state) => state.items);
  const blocks = useExperimentStore((state) => state.blocks);
  const tracks = useExperimentStore((state) => state.tracks);
  const slots = useExperimentStore((state) => state.slots);
  const addTrack = useExperimentStore((state) => state.addTrack);
  const addSlot = useExperimentStore((state) => state.addSlot);
  const selectedKind = useExperimentStore((state) => state.selectedKind);
  const selectedId = useExperimentStore((state) => state.selectedId);
  const setKind = useExperimentStore((state) => state.setKind);
  const setBlockKind = useExperimentStore((state) => state.setBlockKind);
  const create = useExperimentStore((state) => state.create);
  const move = useExperimentStore((state) => state.move);
  const resize = useExperimentStore((state) => state.resize);
  const remove = useExperimentStore((state) => state.remove);
  const clear = useExperimentStore((state) => state.clear);
  const select = useExperimentStore((state) => state.select);
  const setCooperativeSkip = useExperimentStore(
    (state) => state.setCooperativeSkip,
  );
  const setFadeIn = useExperimentStore((state) => state.setFadeIn);
  const setFadeOut = useExperimentStore((state) => state.setFadeOut);
  const bpm = useExperimentStore((state) => state.bpm);
  const setBpm = useExperimentStore((state) => state.setBpm);
  const gridColumns = useExperimentStore((state) => state.gridColumns);
  const gridRows = useExperimentStore((state) => state.gridRows);
  const setGridColumns = useExperimentStore((state) => state.setGridColumns);
  const setGridRows = useExperimentStore((state) => state.setGridRows);
  const setRectUnit = useExperimentStore((state) => state.setRectUnit);
  const setDuration = useExperimentStore((state) => state.setDuration);
  const setDurationUnit = useExperimentStore((state) => state.setDurationUnit);
  const setSyncBeatsToCellSpan = useExperimentStore(
    (state) => state.setSyncBeatsToCellSpan,
  );
  const workspace = useExperimentStore((state) => state.workspace);
  const setWorkspace = useExperimentStore((state) => state.setWorkspace);
  const [creation, setCreation] = useState<CreationState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [columnCount, setColumnCount] = useState(INITIAL_COLUMNS);
  const [run, setRun] = useState<RunState | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [stageSpan, setStageSpan] = useState(0);
  const sessionRef = useRef<TimelineSession | null>(null);

  const editable = run === null;
  const phase: TimelinePhase = run?.snapshot.phase ?? "idle";
  const runningRun =
    run !== null && run.snapshot.phase === "running" ? run : null;
  const running = runningRun !== null;
  const isStaging = workspace === "staging";
  const barrierSpan =
    runningRun === null
      ? null
      : runningRun.session.barrierSpan(runningRun.snapshot.time);

  useEffect(() => {
    return () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!editable || !isStaging) {
      return;
    }
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
  }, [editable, isStaging]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        useExperimentStore.getState().select(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  const blocksById = useMemo(() => {
    const map: Record<string, Placement> = {};
    for (const block of blocks) {
      for (const engineBlock of definitionBlocks(compilePlacement(block))) {
        map[engineBlock.id] = block;
      }
    }
    return map;
  }, [blocks]);
  const runStateByPlacementId = useMemo(() => {
    const map = new Map<string, BlockState>();
    for (const engineBlock of run?.snapshot.blocks ?? []) {
      const placement = blocksById[engineBlock.id];
      const existing = map.get(placement.id);
      if (
        existing === undefined ||
        STATE_RANK[engineBlock.state] > STATE_RANK[existing]
      ) {
        map.set(placement.id, engineBlock.state);
      }
    }
    return map;
  }, [run, blocksById]);
  const blockingPlacementIds = new Set(
    (run?.snapshot.blockingBlockIds ?? []).map((id) => blocksById[id].id),
  );
  const blockingLabels = (run?.snapshot.blockingBlockIds ?? []).map((id) => {
    const placement = blocksById[id];
    return `${BLOCK_LABELS[placement.kind]}@${placement.start}`;
  });

  const selected = blocks.find((block) => block.id === selectedId) ?? null;
  const menuBlock = contextMenu
    ? (blocks.find((block) => block.id === contextMenu.blockId) ?? null)
    : null;
  const selectedDuration =
    selected && selected.kind !== "dialogue"
      ? roundTo(
          selected.syncBeatsToCellSpan ? selected.length : selected.duration,
          3,
        )
      : 0;
  const selectedRect = selected?.kind === "rectangle" ? selected : null;
  const rectMax = selectedRect?.rectUnit === "pixels" ? 4096 : 512;
  const rectMinSize = selectedRect?.rectUnit === "pixels" ? 1 : 0.25;
  const rectStep = selectedRect?.rectUnit === "pixels" ? 1 : 0.25;

  const rows = useMemo(() => timelineRows(tracks, slots), [tracks, slots]);
  const slotsById = useMemo(
    () => Object.fromEntries(slots.map((slot) => [slot.id, slot])) as Record<string, NumericSlot>,
    [slots],
  );
  const rowGroupStarts = useMemo(() => {
    const keys = rows.map((row) => {
      if (row.kind === "track") {
        return `track:${row.trackId}`;
      }
      const trackId = slotsById[row.slotId]?.trackId ?? null;
      return trackId === null ? "shared" : `track:${trackId}`;
    });
    return keys.map((key, index) => index > 0 && keys[index - 1] !== key);
  }, [rows, slotsById]);
  const slotNames = useMemo(() => {
    const names = new Map<string, string>();
    slots.forEach((slot, index) =>
      names.set(slot.id, slotDisplayName(slot, index, tracks)),
    );
    return names;
  }, [slots, tracks]);
  const invalidSlotReads = useMemo(
    () => validateNumericSlotReads(slots, rectangleSlotReads(blocks)),
    [slots, blocks],
  );
  const slotValidationMessage = useMemo(
    () => formatSlotValidation(invalidSlotReads, slots, tracks),
    [invalidSlotReads, slots, tracks],
  );

  const startRun = () => {
    const next = new TimelineSession(tracks, blocks, bpm, useStageStore.getState(), {
      slots,
      onSnapshot: (snapshot) =>
        setRun((current) =>
          current === null ? null : { ...current, snapshot },
        ),
      onActivity: setActivity,
    });
    sessionRef.current = next;
    setRun({ session: next, snapshot: next.snapshot });
    next.start();
  };

  const resetRun = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setRun(null);
    setActivity(null);
  }, []);

  useEffect(() => {
    if (run?.snapshot.phase === "finished") {
      resetRun();
    }
  }, [run?.snapshot.phase, resetRun]);

  const requestSkip =
    runningRun === null ? undefined : () => runningRun.session.requestSkip();
  const deleteSelected =
    run === null && selectedId !== null ? () => remove(selectedId) : undefined;
  const clearAll = run === null && blocks.length > 0 ? clear : undefined;

  const handleRowPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    trackId: string,
  ) => {
    if (!editable || event.button !== 0 || creation) {
      return;
    }
    const start = cellFromPointer(event, columnCount);
    if (!canPlace(tracks, blocks, { trackId, start, length: 1 })) {
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
    const currentCell = cellFromPointer(event, columnCount);
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
    const end = cellFromPointer(event, columnCount);
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

  const openBlockContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    block: Placement,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    select(block.id);
    if (!editable) {
      setContextMenu(null);
      return;
    }
    setContextMenu({ blockId: block.id, x: event.clientX, y: event.clientY });
  };

  const handleGridContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenu(null);
    select(null);
  };

  const handleGridScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (
      element.scrollLeft + element.clientWidth >=
      element.scrollWidth - CELL_WIDTH * 4
    ) {
      setColumnCount((count) => count + COLUMN_CHUNK);
    }
  };

  const previewStart = creation ? Math.min(creation.anchor, creation.current) : 0;
  const previewLength = creation
    ? Math.abs(creation.current - creation.anchor) + 1
    : 0;
  const previewRowIndex = creation
    ? trackRowIndex(rows, creation.trackId)
    : -1;
  const previewValid =
    creation !== null &&
    canPlace(tracks, blocks, {
      trackId: creation.trackId,
      start: previewStart,
      length: previewLength,
    });

  return (
    <main className="app" style={gridVariables}>
      <nav className="workspace-bar" role="tablist" aria-label="Workspaces">
        {WORKSPACES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={workspace === entry.id}
            className={`workspace-tab${workspace === entry.id ? " is-active" : ""}`}
            onClick={() => {
              setContextMenu(null);
              setCreation(null);
              setWorkspace(entry.id);
            }}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <header className="toolbar">
        {isStaging ? (
          <div className="palette" role="group" aria-label="Block kinds">
            {BLOCK_KINDS.map((kind) => (
              <button
                type="button"
                key={kind}
                className={`palette-button palette-${kind}${kind === selectedKind ? " is-active" : ""}`}
                aria-pressed={kind === selectedKind}
                disabled={!editable}
                onClick={() => setKind(kind)}
              >
                {BLOCK_LABELS[kind]}
              </button>
            ))}
          </div>
        ) : null}
        <div className="transport">
          <div className="run-controls">
            <button
              type="button"
              className="run-button"
              onClick={startRun}
              disabled={
                !editable ||
                blocks.length === 0 ||
                invalidSlotReads.length > 0
              }
            >
              Run
            </button>
            <button
              type="button"
              onClick={requestSkip}
              disabled={requestSkip === undefined}
            >
              Skip
            </button>
            <button type="button" onClick={resetRun} disabled={editable}>
              Reset
            </button>
          </div>
          <label className="bpm-field">
            <span>BPM</span>
            <PropertyNumber
              value={bpm}
              min={MIN_BPM}
              max={MAX_BPM}
              step={1}
              disabled={!editable}
              onCommit={(value) => setBpm(Math.round(value))}
            />
          </label>
          <label className="bpm-field">
            <span>Grid</span>
            <PropertyNumber
              value={gridColumns}
              min={MIN_GRID_SIZE}
              max={MAX_GRID_SIZE}
              step={1}
              ariaLabel="Grid columns"
              disabled={!editable}
              onCommit={(value) => setGridColumns(Math.round(value))}
            />
            <span>×</span>
            <PropertyNumber
              value={gridRows}
              min={MIN_GRID_SIZE}
              max={MAX_GRID_SIZE}
              step={1}
              ariaLabel="Grid rows"
              disabled={!editable}
              onCommit={(value) => setGridRows(Math.round(value))}
            />
          </label>
        </div>
        {isStaging ? (
          <div className="toolbar-actions">
            <button type="button" onClick={addTrack} disabled={!editable}>
              Add track
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              disabled={deleteSelected === undefined}
            >
              Delete selected
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={clearAll === undefined}
            >
              Clear all
            </button>
          </div>
        ) : null}
      </header>

      {slotValidationMessage ? (
        <p className="slot-validation" role="alert">
          {slotValidationMessage}
        </p>
      ) : null}

      <section
        className={`stage${isStaging ? "" : " is-expanded"}`}
        aria-label="Stage"
      >
        <div className="stage-heading">Stage</div>
        <Stage
          items={stageItems}
          columns={gridColumns}
          rows={gridRows}
          onSpanChange={setStageSpan}
        />
      </section>

      {isStaging ? (
        <div className="staging-area">
          <div className="table">
            <div className="track-labels">
              <div className="ruler-spacer" />
              {rows.map((row, rowIndex) => {
                if (row.kind === "track") {
                  const track = tracks.find(
                    (candidate) => candidate.id === row.trackId,
                  )!;
                  return (
                    <div
                      key={`track-${row.trackId}`}
                      className={`track-label${rowGroupStarts[rowIndex] ? " is-group-start" : ""}`}
                      title={track.label}
                    >
                      <span className="track-label-text">{track.label}</span>
                      <button
                        type="button"
                        className="slot-add"
                        aria-label={`Add slot to ${track.label}`}
                        disabled={!editable}
                        onClick={() => addSlot(track.id)}
                      >
                        Add slot
                      </button>
                    </div>
                  );
                }
                const slot = slotsById[row.slotId];
                return (
                  <SlotLabel
                    key={`slot-${row.slotId}`}
                    slot={slot}
                    name={slotNames.get(slot.id) ?? slot.id}
                    editable={editable}
                    groupStart={rowGroupStarts[rowIndex]}
                  />
                );
              })}
              <div
                className="shared-slot-add"
                style={{ height: SLOT_CONTROL_HEIGHT }}
              >
                <button
                  type="button"
                  className="slot-add"
                  aria-label="Add shared slot"
                  disabled={!editable}
                  onClick={() => addSlot(null)}
                >
                  Add shared slot
                </button>
              </div>
            </div>
            <div className="grid-scroll" onScroll={handleGridScroll}>
              <div
                className="grid-content"
                style={{ width: columnCount * CELL_WIDTH }}
              >
                <div className="ruler">
                  {Array.from({ length: columnCount }, (_, column) => (
                    <span
                      key={column}
                      className={`ruler-cell${runningRun !== null && runningRun.snapshot.time === column ? " is-current" : ""}`}
                    >
                      {column}
                    </span>
                  ))}
                </div>
                <div className="tracks-area" onContextMenu={handleGridContextMenu}>
                  <div
                    className="rows-area"
                    style={{
                      height: rowTop(
                        rows,
                        rows.length,
                        TRACK_HEIGHT,
                        SLOT_HEIGHT,
                      ),
                    }}
                  >
                    {rows.map((row, rowIndex) =>
                      row.kind === "track" ? (
                        <div
                          key={`track-${row.trackId}`}
                          className={`track-row${rowGroupStarts[rowIndex] ? " is-group-start" : ""}`}
                          onPointerDown={(event) =>
                            handleRowPointerDown(event, row.trackId)
                          }
                          onPointerMove={handleRowPointerMove}
                          onPointerUp={finishCreation}
                          onPointerCancel={cancelCreation}
                        />
                      ) : (
                        <SlotRow
                          key={`slot-${row.slotId}`}
                          slot={slotsById[row.slotId]}
                          name={slotNames.get(row.slotId) ?? row.slotId}
                          columnCount={columnCount}
                          editable={editable}
                          groupStart={rowGroupStarts[rowIndex]}
                        />
                      ),
                    )}
                    <div className="block-layer">
                      {blocks.map((block) => (
                        <BlockView
                          key={block.id}
                          block={block}
                          rows={rows}
                          columnCount={columnCount}
                          selected={block.id === selectedId}
                          editable={editable}
                          state={runStateByPlacementId.get(block.id)}
                          blocking={blockingPlacementIds.has(block.id)}
                          onContextMenu={(event) => openBlockContextMenu(event, block)}
                        />
                      ))}
                      {creation ? (
                        <div
                          className={`block block-${creation.kind} is-preview${previewValid ? "" : " is-invalid"}`}
                          style={{
                            left: previewStart * CELL_WIDTH + CELL_GAP + 3,
                            top:
                              rowTop(
                                rows,
                                previewRowIndex,
                                TRACK_HEIGHT,
                                SLOT_HEIGHT,
                              ) + 3,
                            width: previewLength * CELL_WIDTH - CELL_GAP - 6,
                            height: TRACK_HEIGHT - 6,
                          }}
                        >
                          <span className="block-label">{BLOCK_LABELS[creation.kind]}</span>
                        </div>
                      ) : null}
                    </div>
                    {barrierSpan ? (
                      <div
                        className="time-cursor"
                        style={{
                          left: barrierSpan.start * CELL_WIDTH + CELL_GAP,
                          width:
                            (barrierSpan.end - barrierSpan.start) * CELL_WIDTH -
                            CELL_GAP,
                        }}
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                  <div
                    className="shared-slot-add-spacer"
                    style={{ height: SLOT_CONTROL_HEIGHT }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
          </div>
          <aside className="inspector" aria-label="Block properties">
            <div className="inspector-heading">Properties</div>
            {selected ? (
              <div className="inspector-body">
                <div className="inspector-summary">
                  <span className={`inspector-swatch palette-${selected.kind}`} />
                  <span>
                    {BLOCK_LABELS[selected.kind]} on{" "}
                    {tracks.find((track) => track.id === selected.trackId)?.label ??
                      selected.trackId}
                  </span>
                </div>
                <label className="inspector-field">
                  <span>Kind</span>
                  <select
                    value={selected.kind}
                    disabled={!editable}
                    onChange={(event) =>
                      setBlockKind(selected.id, event.target.value as BlockKind)
                    }
                  >
                    {BLOCK_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {BLOCK_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="inspector-range">
                  t={selected.start}–{selected.start + selected.length} ·{" "}
                  {selected.length} {selected.length === 1 ? "cell" : "cells"}
                </p>
                {selected.kind === "dialogue" ? (
                  <p className="inspector-note">
                    Dialogue completes with the OK button.
                  </p>
                ) : (
                  <>
                    <div className="inspector-field">
                      <span>Duration</span>
                      <div className="duration-control">
                        <PropertyNumber
                          key={`duration-${selected.id}-${selected.durationUnit}`}
                          value={selectedDuration}
                          min={selected.durationUnit === "beats" ? 0.25 : 0.05}
                          max={selected.durationUnit === "beats" ? 256 : 120}
                          step={selected.durationUnit === "beats" ? 0.25 : 0.05}
                          ariaLabel="Duration"
                          disabled={!editable || selected.syncBeatsToCellSpan}
                          onCommit={(value) => setDuration(selected.id, value)}
                        />
                        <div
                          className="unit-toggle"
                          role="group"
                          aria-label="Duration unit"
                        >
                          <button
                            type="button"
                            className={
                              selected.durationUnit === "beats"
                                ? "is-active"
                                : ""
                            }
                            aria-pressed={selected.durationUnit === "beats"}
                            disabled={!editable || selected.syncBeatsToCellSpan}
                            onClick={() =>
                              setDurationUnit(selected.id, "beats")
                            }
                          >
                            Beats
                          </button>
                          <button
                            type="button"
                            className={
                              selected.durationUnit === "seconds"
                                ? "is-active"
                                : ""
                            }
                            aria-pressed={selected.durationUnit === "seconds"}
                            disabled={!editable || selected.syncBeatsToCellSpan}
                            onClick={() =>
                              setDurationUnit(selected.id, "seconds")
                            }
                          >
                            Seconds
                          </button>
                        </div>
                      </div>
                    </div>
                    <label className="inspector-check">
                      <input
                        type="checkbox"
                        checked={selected.syncBeatsToCellSpan}
                        disabled={!editable}
                        onChange={(event) =>
                          setSyncBeatsToCellSpan(
                            selected.id,
                            event.target.checked,
                          )
                        }
                      />
                      Sync beats to cell span
                    </label>
                    {selectedRect ? (
                      <>
                        <div className="rect-fields">
                          <RectangleProperty
                            placementId={selectedRect.id}
                            field="x"
                            label="X"
                            value={selectedRect.x}
                            min={0}
                            max={rectMax}
                            step={rectStep}
                            rectUnit={selectedRect.rectUnit}
                            boundSlotId={selectedRect.slotBindings?.x}
                            trackId={selectedRect.trackId}
                            slots={slots}
                            tracks={tracks}
                            editable={editable}
                            ariaLabel="Rectangle x"
                          />
                          <RectangleProperty
                            placementId={selectedRect.id}
                            field="y"
                            label="Y"
                            value={selectedRect.y}
                            min={0}
                            max={rectMax}
                            step={rectStep}
                            rectUnit={selectedRect.rectUnit}
                            boundSlotId={selectedRect.slotBindings?.y}
                            trackId={selectedRect.trackId}
                            slots={slots}
                            tracks={tracks}
                            editable={editable}
                            ariaLabel="Rectangle y"
                          />
                          <RectangleProperty
                            placementId={selectedRect.id}
                            field="w"
                            label="Width"
                            value={selectedRect.w}
                            min={rectMinSize}
                            max={rectMax}
                            step={rectStep}
                            rectUnit={selectedRect.rectUnit}
                            boundSlotId={selectedRect.slotBindings?.w}
                            trackId={selectedRect.trackId}
                            slots={slots}
                            tracks={tracks}
                            editable={editable}
                            ariaLabel="Rectangle width"
                          />
                          <RectangleProperty
                            placementId={selectedRect.id}
                            field="h"
                            label="Height"
                            value={selectedRect.h}
                            min={rectMinSize}
                            max={rectMax}
                            step={rectStep}
                            rectUnit={selectedRect.rectUnit}
                            boundSlotId={selectedRect.slotBindings?.h}
                            trackId={selectedRect.trackId}
                            slots={slots}
                            tracks={tracks}
                            editable={editable}
                            ariaLabel="Rectangle height"
                          />
                        </div>
                        <div className="inspector-field">
                          <span>Units</span>
                          <div
                            className="unit-toggle"
                            role="group"
                            aria-label="Rectangle units"
                          >
                            <button
                              type="button"
                              className={
                                selectedRect.rectUnit === "span"
                                  ? "is-active"
                                  : ""
                              }
                              aria-pressed={selectedRect.rectUnit === "span"}
                              disabled={!editable || stageSpan <= 0}
                              onClick={() =>
                                setRectUnit(selectedRect.id, "span", stageSpan)
                              }
                            >
                              Span
                            </button>
                            <button
                              type="button"
                              className={
                                selectedRect.rectUnit === "pixels"
                                  ? "is-active"
                                  : ""
                              }
                              aria-pressed={selectedRect.rectUnit === "pixels"}
                              disabled={!editable || stageSpan <= 0}
                              onClick={() =>
                                setRectUnit(selectedRect.id, "pixels", stageSpan)
                              }
                            >
                              Pixels
                            </button>
                          </div>
                        </div>
                        <p className="inspector-note">
                          Span units follow the stage grid ({gridColumns} ×{" "}
                          {gridRows}); pixels stay fixed when the stage resizes.
                        </p>
                      </>
                    ) : null}
                    {isMediaPlacement(selected) ? (
                      <>
                        <label className="inspector-field">
                          <span>Fade in</span>
                          <PropertyNumber
                            key={`fade-in-${selected.id}`}
                            value={selected.fadeIn}
                            min={0}
                            max={selected.length}
                            step={1}
                            ariaLabel="Fade in"
                            disabled={!editable}
                            onCommit={(value) => setFadeIn(selected.id, value)}
                          />
                        </label>
                        <label className="inspector-field">
                          <span>Fade out</span>
                          <PropertyNumber
                            key={`fade-out-${selected.id}`}
                            value={selected.fadeOut}
                            min={0}
                            max={selected.length}
                            step={1}
                            ariaLabel="Fade out"
                            disabled={!editable}
                            onCommit={(value) => setFadeOut(selected.id, value)}
                          />
                        </label>
                        <p className="inspector-note">
                          Fades are measured in cells and add barriers at their
                          boundaries. Right-drag a media block's edge inward to
                          set the fade, or outward to extend the block and fade
                          the new region.
                        </p>
                      </>
                    ) : null}
                  </>
                )}
                <label className="inspector-check">
                  <input
                    type="checkbox"
                    checked={selected.cooperativeSkip}
                    disabled={!editable}
                    onChange={(event) =>
                      setCooperativeSkip(selected.id, event.target.checked)
                    }
                  />
                  Cooperative skip
                </label>
                {editable ? null : (
                  <p className="inspector-note">
                    Read-only while the timeline is loaded. Reset to edit.
                  </p>
                )}
              </div>
            ) : (
              <p className="inspector-empty">
                Select a block to edit its properties.
              </p>
            )}
          </aside>
        </div>
      ) : null}

      <footer className="status">
        <div className={`status-run status-${phase}`}>
          {run !== null ? (
            <>
              <strong>{PHASE_LABELS[phase]}</strong>
              <span>t={run.snapshot.time}</span>
              {blockingLabels.length > 0 ? (
                <span>blocked by: {blockingLabels.join(", ")}</span>
              ) : null}
            </>
          ) : (
            <span>{PHASE_LABELS.idle}</span>
          )}
        </div>
        <span className="status-count">{blocks.length} blocks</span>
      </footer>
      {contextMenu && menuBlock ? (
        <div
          className="context-menu"
          role="menu"
          aria-label={`Actions for ${BLOCK_LABELS[menuBlock.kind]} at ${menuBlock.start}`}
          style={{
            left: clamp(contextMenu.x, 8, window.innerWidth - 228),
            top: clamp(contextMenu.y, 8, window.innerHeight - 110),
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="context-menu-title">
            {BLOCK_LABELS[menuBlock.kind]} at t={menuBlock.start}–
            {menuBlock.start + menuBlock.length}
          </div>
          <div className="context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="context-menu-item is-danger"
            onClick={() => {
              remove(menuBlock.id);
              setContextMenu(null);
            }}
          >
            <span className="context-menu-check" />
            Delete
          </button>
        </div>
      ) : null}
      {activity ? <p className="activity">{activity}</p> : null}
    </main>
  );
}

function SlotLabel({
  slot,
  name,
  editable,
  groupStart,
}: {
  slot: NumericSlot;
  name: string;
  editable: boolean;
  groupStart: boolean;
}) {
  const renameSlot = useExperimentStore((state) => state.renameSlot);
  const removeSlot = useExperimentStore((state) => state.removeSlot);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!editable) {
      setEditing(false);
    }
  }, [editable]);

  const startRenaming = () => {
    if (!editable) {
      return;
    }
    setDraft(slot.name ?? "");
    setEditing(true);
  };

  const commitName = () => {
    renameSlot(slot.id, draft.trim());
    setEditing(false);
  };

  return (
    <div
      className={`slot-label${groupStart ? " is-group-start" : ""}`}
      id={`slot-label-${slot.id}`}
    >
      {editing ? (
        <form
          className="slot-label-form"
          onSubmit={(event) => {
            event.preventDefault();
            commitName();
          }}
        >
          <input
            className="slot-label-input"
            autoFocus
            aria-label={`Name for ${name}`}
            placeholder={name}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setEditing(false);
              } else if (
                event.key === "Backspace" ||
                event.key === "Delete"
              ) {
                event.stopPropagation();
              }
            }}
          />
          <button type="submit" className="slot-action">
            Save
          </button>
          <button
            type="button"
            className="slot-action"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span className="slot-label-name" title={name}>
            {name}
          </span>
          <button
            type="button"
            className="slot-action"
            aria-label={`Rename ${name}`}
            disabled={!editable}
            onClick={startRenaming}
          >
            Rename
          </button>
          <button
            type="button"
            className="slot-action is-danger"
            aria-label={`Remove ${name}`}
            disabled={!editable}
            onClick={() => removeSlot(slot.id)}
          >
            Remove
          </button>
        </>
      )}
    </div>
  );
}

function SlotRow({
  slot,
  name,
  columnCount,
  editable,
  groupStart,
}: {
  slot: NumericSlot;
  name: string;
  columnCount: number;
  editable: boolean;
  groupStart: boolean;
}) {
  const initializeSlot = useExperimentStore((state) => state.initializeSlot);
  const clearSlotInitialization = useExperimentStore(
    (state) => state.clearSlotInitialization,
  );
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!editable) {
      setEditing(null);
    }
  }, [editable]);

  const initialization = slot.initialization;

  const startEditing = (time: number) => {
    if (!editable) {
      return;
    }
    if (initialization !== null && initialization.time !== time) {
      return;
    }
    setDraft(initialization === null ? "0" : String(initialization.value));
    setEditing(time);
  };

  const commit = () => {
    if (editing === null) {
      return;
    }
    const value = Number.parseFloat(draft);
    if (!Number.isFinite(value)) {
      return;
    }
    initializeSlot(slot.id, editing, value);
    setEditing(null);
  };

  return (
    <div
      className={`slot-row${groupStart ? " is-group-start" : ""}`}
      data-slot-id={slot.id}
      role="group"
      aria-label={`${name} slot row`}
    >
      {Array.from({ length: columnCount }, (_, time) => {
        const initialized =
          initialization !== null && initialization.time === time;
        const disabled =
          !editable ||
          (initialization !== null && !initialized);
        const description = initialized
          ? `${name} at time ${time}, initialized to ${initialization.value}. Open to edit or delete the initialization.`
          : initialization !== null
            ? `${name} at time ${time}, disabled because the slot is initialized at time ${initialization.time}`
            : `${name} at time ${time}, unset`;
        return (
          <button
            key={time}
            type="button"
            className={`slot-cell${initialized ? " is-initialized" : ""}`}
            aria-label={description}
            title={initialized ? "Edit or delete initialization" : undefined}
            disabled={disabled}
            onClick={() => startEditing(time)}
          >
            {initialized ? (
              <span className="slot-cell-value">{initialization.value}</span>
            ) : null}
          </button>
        );
      })}
      {editing !== null && editable ? (
        <form
          className="slot-editor"
          style={{
            left: Math.max(
              2,
              Math.min(
                editing * CELL_WIDTH + CELL_GAP + 2,
                columnCount * CELL_WIDTH - SLOT_EDITOR_WIDTH - 2,
              ),
            ),
            width: SLOT_EDITOR_WIDTH,
          }}
          onSubmit={(event) => {
            event.preventDefault();
            commit();
          }}
        >
          <input
            className="slot-editor-input"
            type="number"
            step="any"
            inputMode="decimal"
            autoFocus
            aria-label={`${name} value at time ${editing}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setEditing(null);
              } else if (
                event.key === "Backspace" ||
                event.key === "Delete"
              ) {
                event.stopPropagation();
              }
            }}
          />
          <button type="submit" aria-label={`Set ${name} at time ${editing}`}>
            Set
          </button>
          <button
            type="button"
            aria-label={`Cancel editing ${name} at time ${editing}`}
            onClick={() => setEditing(null)}
          >
            Cancel
          </button>
          {initialization !== null ? (
            <button
              type="button"
              className="slot-editor-delete"
              aria-label={`Delete initialization for ${name} at time ${initialization.time}`}
              onClick={() => {
                clearSlotInitialization(slot.id);
                setEditing(null);
              }}
            >
              Delete
            </button>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

function RectangleProperty({
  placementId,
  field,
  label,
  value,
  min,
  max,
  step,
  rectUnit,
  boundSlotId,
  trackId,
  slots,
  tracks,
  editable,
  ariaLabel,
}: {
  placementId: string;
  field: RectField;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  rectUnit: "span" | "pixels";
  boundSlotId: string | undefined;
  trackId: string;
  slots: readonly NumericSlot[];
  tracks: readonly Track[];
  editable: boolean;
  ariaLabel: string;
}) {
  const setRectValue = useExperimentStore((state) => state.setRectValue);
  const setRectSlot = useExperimentStore((state) => state.setRectSlot);
  const available = slots
    .map((slot, index) => ({ slot, name: slotDisplayName(slot, index, tracks) }))
    .filter(
      ({ slot }) => slot.trackId === null || slot.trackId === trackId,
    );
  const local = available.filter(({ slot }) => slot.trackId !== null);
  const shared = available.filter(({ slot }) => slot.trackId === null);
  const missingBound =
    boundSlotId !== undefined &&
    !available.some(({ slot }) => slot.id === boundSlotId);

  return (
    <div className="inspector-field">
      <label htmlFor={`rect-${placementId}-${field}-source`}>{label}</label>
      <select
        id={`rect-${placementId}-${field}-source`}
        className="rect-source"
        aria-label={`${ariaLabel} source`}
        value={boundSlotId ?? ""}
        disabled={!editable}
        onChange={(event) => {
          const next = event.target.value;
          setRectSlot(placementId, field, next === "" ? null : next);
        }}
      >
        <option value="">Number</option>
        {local.length > 0 ? (
          <optgroup label="Track slots">
            {local.map(({ slot, name }) => (
              <option key={slot.id} value={slot.id}>
                {name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {shared.length > 0 ? (
          <optgroup label="Shared slots">
            {shared.map(({ slot, name }) => (
              <option key={slot.id} value={slot.id}>
                {name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {missingBound ? (
          <option value={boundSlotId}>{`${boundSlotId} (unavailable)`}</option>
        ) : null}
      </select>
      <PropertyNumber
        key={`rect-${field}-${placementId}-${rectUnit}`}
        value={roundTo(value, 3)}
        min={min}
        max={max}
        step={step}
        ariaLabel={ariaLabel}
        disabled={!editable || boundSlotId !== undefined}
        onCommit={(next) => setRectValue(placementId, field, next)}
      />
    </div>
  );
}

function BlockView({
  block,
  rows,
  columnCount,
  selected,
  editable,
  state,
  blocking,
  onContextMenu,
}: {
  block: Placement;
  rows: readonly TimelineRow[];
  columnCount: number;
  selected: boolean;
  editable: boolean;
  state: BlockState | undefined;
  blocking: boolean;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  const move = useExperimentStore((store) => store.move);
  const resize = useExperimentStore((store) => store.resize);
  const setSpan = useExperimentStore((store) => store.setSpan);
  const select = useExperimentStore((store) => store.select);
  const drag = useRef<DragState | null>(null);
  const suppressEdgeMenu = useRef(false);
  const [dragging, setDragging] = useState(false);

  const trackIndex = trackRowIndex(rows, block.trackId);
  const isMedia = isMediaPlacement(block);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 2) {
      if (!editable || !isMedia) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const offset = event.clientX - rect.left;
      const mode =
        offset <= FADE_HANDLE_PX
          ? "fadeIn"
          : rect.width - offset <= FADE_HANDLE_PX
            ? "fadeOut"
            : null;
      if (mode === null) {
        return;
      }
      suppressEdgeMenu.current = true;
      event.stopPropagation();
      event.preventDefault();
      select(block.id);
      drag.current = {
        pointerId: event.pointerId,
        mode,
        originX: event.clientX,
        originY: event.clientY,
        start: block.start,
        length: block.length,
        fadeIn: block.fadeIn,
        fadeOut: block.fadeOut,
        trackId: block.trackId,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      return;
    }
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    select(block.id);
    if (!editable) {
      return;
    }
    const target = event.target as HTMLElement;
    const handle = target.dataset.handle;
    const boundary = isMedia
      ? fadeBoundaries(block).find((phase) => phase.boundary === target.dataset.boundary)?.boundary
      : undefined;
    drag.current = {
      pointerId: event.pointerId,
      mode:
        handle === "resize"
          ? "resize"
          : handle === "resize-start"
            ? "resizeStart"
            : "move",
      originX: event.clientX,
      originY: event.clientY,
      start: block.start,
      length: block.length,
      fadeIn: isMedia ? block.fadeIn : 0,
      fadeOut: isMedia ? block.fadeOut : 0,
      trackId: block.trackId,
      boundary,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    if (current.boundary !== undefined) {
      const delta = Math.round((event.clientX - current.originX) / CELL_WIDTH);
      const origin = current.boundary === "fadeOut"
        ? current.length - current.fadeOut
        : current.fadeIn;
      setSpan(block.id, current.start, current.length, dragFadeBoundary(
        current.boundary, origin + delta, current.length, current.fadeIn, current.fadeOut,
      ));
      return;
    }
    if (current.mode === "resizeStart") {
      const delta = Math.round((event.clientX - current.originX) / CELL_WIDTH);
      const end = current.start + current.length;
      const start = clamp(current.start + delta, 0, end - 1);
      setSpan(block.id, start, end - start);
      return;
    }
    if (current.mode === "fadeIn" || current.mode === "fadeOut") {
      const delta = Math.round((event.clientX - current.originX) / CELL_WIDTH);
      if (current.mode === "fadeIn") {
        if (delta >= 0) {
          setSpan(block.id, current.start, current.length, { fadeIn: delta });
        } else {
          const start = Math.max(0, current.start + delta);
          const extra = current.start - start;
          setSpan(block.id, start, current.length + extra, {
            fadeIn: current.fadeIn + extra,
          });
        }
        return;
      }
      if (delta <= 0) {
        setSpan(block.id, current.start, current.length, { fadeOut: -delta });
      } else {
        const length = Math.min(
          current.length + delta,
          Math.max(current.length, columnCount - current.start),
        );
        const extra = length - current.length;
        setSpan(block.id, current.start, length, {
          fadeOut: current.fadeOut + extra,
        });
      }
      return;
    }
    if (current.mode === "move") {
      const deltaColumns = Math.round((event.clientX - current.originX) / CELL_WIDTH);
      const start = clamp(
        current.start + deltaColumns,
        0,
        columnCount - current.length,
      );
      const rowsArea = event.currentTarget.closest(".rows-area");
      const trackId =
        rowsArea === null
          ? current.trackId
          : trackAtY(
              rows,
              event.clientY - rowsArea.getBoundingClientRect().top,
              TRACK_HEIGHT,
              SLOT_HEIGHT,
            );
      move(block.id, trackId, start);
      return;
    }
    const deltaColumns = Math.round((event.clientX - current.originX) / CELL_WIDTH);
    const length = clamp(
      current.length + deltaColumns,
      1,
      columnCount - current.start,
    );
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

  const className = [
    "block",
    `block-${block.kind}`,
    isMedia ? "is-media" : "",
    selected ? "is-selected" : "",
    dragging ? "is-dragging" : "",
    state ? `is-${state}` : "",
    blocking ? "is-blocking" : "",
    block.cooperativeSkip ? "is-cooperative" : "",
    editable ? "" : "is-locked",
  ]
    .filter(Boolean)
    .join(" ");

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressEdgeMenu.current) {
      suppressEdgeMenu.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onContextMenu(event);
  };

  const fadeTitle = isMedia
    ? `Fade in ${block.fadeIn}, fade out ${block.fadeOut} (cells)`
    : "";
  const title =
    [block.cooperativeSkip ? "Cooperative skip" : "", fadeTitle]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <div
      className={className}
      style={{
        left: block.start * CELL_WIDTH + CELL_GAP + 3,
        top: rowTop(rows, trackIndex, TRACK_HEIGHT, SLOT_HEIGHT) + 3,
        width: block.length * CELL_WIDTH - CELL_GAP - 6,
        height: TRACK_HEIGHT - 6,
      }}
      title={title}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      {isMedia ? (
        <>
          {block.fadeIn > 0 ? (
            <FadeSurface
              className="block-fade block-fade-in"
              cells={block.fadeIn}
              length={block.length}
              inward
            />
          ) : null}
          {block.fadeOut > 0 ? (
            <FadeSurface
              className="block-fade block-fade-out"
              cells={block.fadeOut}
              length={block.length}
              inward={false}
            />
          ) : null}
          <span
            className="block-body-surface"
            style={{
              left: `${block.fadeIn / block.length * 100}%`,
              width: `${(block.length - block.fadeIn - block.fadeOut) / block.length * 100}%`,
            }}
            aria-hidden="true"
          />
          {fadeBoundaries(block).map((phase) => (
              <span
                key={phase.boundary}
                className={`block-phase-boundary${editable ? " is-editable" : ""}`}
                data-boundary={phase.boundary}
                style={{ left: `${(phase.offset / block.length) * 100}%` }}
                title="Drag to move phase boundary"
                aria-hidden="true"
              />
            ))}
        </>
      ) : null}
      <span className="block-label">{BLOCK_LABELS[block.kind]}</span>
      {editable ? (
        <>
          <span
            className="resize-handle resize-handle-start"
            data-handle="resize-start"
            aria-hidden="true"
          />
          <span className="resize-handle" data-handle="resize" aria-hidden="true" />
        </>
      ) : null}
    </div>
  );
}

function FadeSurface({ className, cells, length, inward }: {
  className: string;
  cells: number;
  length: number;
  inward: boolean;
}) {
  const maskImage = useMemo(() => {
    const width = (length * CELL_WIDTH - CELL_GAP - 6) * cells / length;
    const svg = generateDotGradientSVG(Math.ceil(width / 6) * 6, TRACK_HEIGHT - 6, 6,
      inward ? 0.25 : 4.5, inward ? 4.5 : 0.25);
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [cells, length, inward]);
  return <span className={className} style={{ width: `${cells / length * 100}%`, maskImage }} aria-hidden="true" />;
}

function PropertyNumber({
  value,
  min,
  max,
  step = 1,
  disabled,
  ariaLabel,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  ariaLabel?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useLayoutEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    onCommit(clamp(parsed, min, max));
    setDraft(String(value));
  };

  return (
    <input
      type="number"
      className="inspector-number"
      aria-label={ariaLabel}
      value={draft}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function slotDisplayName(
  slot: NumericSlot,
  index: number,
  tracks: readonly Track[],
): string {
  const configured = slot.name?.trim();
  if (configured !== undefined && configured !== "") {
    return configured;
  }
  if (slot.trackId === null) {
    return `Shared slot ${index + 1}`;
  }
  const track = tracks.find((candidate) => candidate.id === slot.trackId);
  return track === undefined
    ? `Slot ${index + 1}`
    : `Slot ${index + 1} on ${track.label}`;
}

function formatSlotValidation(
  reads: readonly NumericSlotRead[],
  slots: readonly NumericSlot[],
  tracks: readonly Track[],
): string | null {
  if (reads.length === 0) {
    return null;
  }
  const slotsById = new Map(
    slots.map((slot, index) => [
      slot.id,
      { slot, name: slotDisplayName(slot, index, tracks) },
    ]),
  );
  const trackLabel = (trackId: string): string =>
    tracks.find((track) => track.id === trackId)?.label ?? trackId;
  const messages = new Set<string>();
  for (const read of reads) {
    const entry = slotsById.get(read.slotId);
    const name = entry?.name ?? `Slot ${read.slotId}`;
    const readAt = `time ${read.time} on ${trackLabel(read.trackId)}`;
    if (entry === undefined) {
      messages.add(`${name} is unavailable but is read at ${readAt}.`);
      continue;
    }
    const initialization = entry.slot.initialization;
    if (initialization === null) {
      messages.add(`${name} is empty; initialize it at or before ${readAt}.`);
      continue;
    }
    if (entry.slot.trackId !== null && entry.slot.trackId !== read.trackId) {
      messages.add(
        `${name} belongs to ${trackLabel(entry.slot.trackId)} and cannot be read on ${trackLabel(read.trackId)} at time ${read.time}.`,
      );
      continue;
    }
    if (read.time < initialization.time) {
      messages.add(
        `${name} initializes at time ${initialization.time}, after it is read at ${readAt}.`,
      );
    }
  }
  return messages.size > 0
    ? `Cannot run: ${Array.from(messages).join(" ")}`
    : null;
}

function cellFromPointer(
  event: ReactPointerEvent<HTMLDivElement>,
  columnCount: number,
): number {
  const rect = event.currentTarget.getBoundingClientRect();
  return clamp(
    Math.floor((event.clientX - rect.left) / CELL_WIDTH),
    0,
    columnCount - 1,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
