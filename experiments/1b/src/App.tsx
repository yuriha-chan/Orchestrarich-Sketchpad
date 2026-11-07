import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { BlockKind, Placement } from "./model";
import { BLOCK_KINDS, BLOCK_LABELS, COLUMNS, TRACKS, canPlace } from "./model";
import { useExperimentStore } from "./store";
import { KIND_DURATION_MS, TimelineSession } from "./execution";
import { WORKSPACES } from "./workspaces";
import type {
  BlockState,
  TimelinePhase,
  TimelineSnapshot,
} from "../../../src/core/execution/timeline-runner.ts";

const CELL_WIDTH = 64;
const TRACK_HEIGHT = 48;
const DIALOGUE_TEXT = "lazy dog jumps ...";

const PHASE_LABELS: Record<TimelinePhase, string> = {
  idle: "Not running",
  running: "Running",
  finished: "Finished",
  failed: "Failed",
};

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

interface ContextMenuState {
  readonly blockId: string;
  readonly x: number;
  readonly y: number;
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
  const workspace = useExperimentStore((state) => state.workspace);
  const setWorkspace = useExperimentStore((state) => state.setWorkspace);
  const [creation, setCreation] = useState<CreationState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [session, setSession] = useState<TimelineSession | null>(null);
  const [snapshot, setSnapshot] = useState<TimelineSnapshot | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const sessionRef = useRef<TimelineSession | null>(null);

  const editable = session === null;
  const phase: TimelinePhase = snapshot?.phase ?? "idle";
  const running = phase === "running";
  const isStaging = workspace === "staging";

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

  const runBlocks = useMemo(
    () => new Map((snapshot?.blocks ?? []).map((block) => [block.id, block])),
    [snapshot],
  );
  const blockingIds = new Set(snapshot?.blockingBlockIds ?? []);
  const blockingLabels = (snapshot?.blockingBlockIds ?? []).map((id) => {
    const placement = blocks.find((block) => block.id === id);
    return placement
      ? `${BLOCK_LABELS[placement.kind]}@${placement.start}`
      : id;
  });

  const selected = blocks.find((block) => block.id === selectedId) ?? null;
  const menuBlock = contextMenu
    ? (blocks.find((block) => block.id === contextMenu.blockId) ?? null)
    : null;

  const blocksById = useMemo(
    () => new Map(blocks.map((block) => [block.id, block])),
    [blocks],
  );
  const runningPlacements = (snapshot?.blocks ?? [])
    .filter((block) => block.state === "running")
    .map((block) => blocksById.get(block.id))
    .filter((block): block is Placement => block !== undefined);
  const runningDialogues = runningPlacements.filter(
    (block) => block.kind === "dialogue",
  );
  const runningAnimations = runningPlacements.filter(
    (block) => block.kind === "animation",
  );

  const startRun = () => {
    if (session || blocks.length === 0) {
      return;
    }
    const next = new TimelineSession(blocks, {
      onSnapshot: setSnapshot,
      onActivity: setActivity,
    });
    sessionRef.current = next;
    setSession(next);
    setActivity(null);
    next.start();
  };

  const resetRun = () => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setSession(null);
    setSnapshot(null);
    setActivity(null);
  };

  const handleRowPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    trackId: string,
  ) => {
    if (!editable || event.button !== 0 || creation) {
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

  const hint = isStaging
    ? editable
      ? "Pick a kind, then drag across empty cells to place a block from its start to its end. Drag a block to move it. Drag its right edge to stretch it. Click a block to select it; the inspector edits its properties. Delete removes the selected block."
      : running
        ? "Running. Dialogue and animation effects appear in the stage below the timeline. Press OK to finish a dialogue. Skip delivers a skip request to running blocks; the barrier still waits for them to complete."
        : "Timeline ended. Reset to edit and run again."
    : editable
      ? "Preview gives the stage the workspace. Switch to Staging to place or edit blocks, or press Run to play the arrangement."
      : running
        ? "Running. The status bar shows logical time and the blocks blocking it; switching workspaces does not interrupt the run."
        : "Timeline ended. Reset to run again, or switch to Staging to edit.";

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
        <div className="run-controls">
          <button
            type="button"
            className="run-button"
            onClick={startRun}
            disabled={!editable || blocks.length === 0}
          >
            Run
          </button>
          <button
            type="button"
            onClick={() => session?.requestSkip()}
            disabled={!running}
          >
            Skip
          </button>
          <button type="button" onClick={resetRun} disabled={editable}>
            Reset
          </button>
        </div>
        {isStaging ? (
          <div className="toolbar-actions">
            <button
              type="button"
              onClick={() => selectedId && remove(selectedId)}
              disabled={!editable || !selectedId}
            >
              Delete selected
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={!editable || blocks.length === 0}
            >
              Clear all
            </button>
          </div>
        ) : null}
      </header>

      <p className="hint">{hint}</p>

      {isStaging ? (
        <div className="staging-area">
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
                    <span
                      key={column}
                      className={`ruler-cell${running && snapshot?.time === column ? " is-current" : ""}`}
                    >
                      {column}
                    </span>
                  ))}
                </div>
                <div className="tracks-area" onContextMenu={handleGridContextMenu}>
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
                        editable={editable}
                        state={runBlocks.get(block.id)?.state}
                        blocking={blockingIds.has(block.id)}
                        onContextMenu={(event) => openBlockContextMenu(event, block)}
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
                  {running && snapshot ? (
                    <div
                      className="time-cursor"
                      style={{ left: snapshot.time * CELL_WIDTH }}
                      aria-hidden="true"
                    />
                  ) : null}
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
                    {TRACKS.find((track) => track.id === selected.trackId)?.label ??
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
                <label className="inspector-field">
                  <span>Start</span>
                  <PropertyNumber
                    key={`start-${selected.id}`}
                    value={selected.start}
                    min={0}
                    max={COLUMNS - selected.length}
                    disabled={!editable}
                    onCommit={(value) => move(selected.id, selected.trackId, value)}
                  />
                </label>
                <label className="inspector-field">
                  <span>Length</span>
                  <PropertyNumber
                    key={`length-${selected.id}`}
                    value={selected.length}
                    min={1}
                    max={COLUMNS - selected.start}
                    disabled={!editable}
                    onCommit={(value) => resize(selected.id, value)}
                  />
                </label>
                <p className="inspector-range">
                  t={selected.start}–{selected.start + selected.length}
                </p>
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

      <section
        className={`stage${isStaging ? "" : " is-expanded"}`}
        aria-label="Stage"
      >
        <div className="stage-heading">Stage</div>
        <div className="stage-content">
          {runningDialogues.map((block) => (
            <div key={block.id} className="stage-dialogue">
              <span className="stage-tag">Dialogue @{block.start}</span>
              <p className="stage-dialogue-text">{DIALOGUE_TEXT}</p>
              <button
                type="button"
                className="stage-ok"
                onClick={() => session?.advanceDialogue(block.id)}
              >
                OK
              </button>
            </div>
          ))}
          {runningAnimations.map((block) => (
            <div key={block.id} className="stage-animation">
              <span className="stage-tag">
                Animation @{block.start}–{block.start + block.length}
              </span>
              <div
                className="stage-progress"
                role="progressbar"
                aria-label={`Animation at ${block.start}`}
              >
                <div
                  className="stage-progress-fill"
                  style={{
                    animationDuration: `${KIND_DURATION_MS.animation * block.length}ms`,
                  }}
                />
              </div>
            </div>
          ))}
          {runningDialogues.length === 0 && runningAnimations.length === 0 ? (
            <p className="stage-empty">Nothing playing</p>
          ) : null}
        </div>
      </section>

      <footer className="status">
        <div className={`status-run status-${phase}`}>
          {snapshot ? (
            <>
              <strong>{PHASE_LABELS[phase]}</strong>
              <span>t={snapshot.time}</span>
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

function BlockView({
  block,
  selected,
  editable,
  state,
  blocking,
  onContextMenu,
}: {
  block: Placement;
  selected: boolean;
  editable: boolean;
  state: BlockState | undefined;
  blocking: boolean;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  const move = useExperimentStore((store) => store.move);
  const resize = useExperimentStore((store) => store.resize);
  const select = useExperimentStore((store) => store.select);
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
    if (!editable) {
      return;
    }
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

  const className = [
    "block",
    `block-${block.kind}`,
    selected ? "is-selected" : "",
    dragging ? "is-dragging" : "",
    state ? `is-${state}` : "",
    blocking ? "is-blocking" : "",
    block.cooperativeSkip ? "is-cooperative" : "",
    editable ? "" : "is-locked",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{
        left: block.start * CELL_WIDTH + 3,
        top: trackIndex * TRACK_HEIGHT + 3,
        width: block.length * CELL_WIDTH - 6,
        height: TRACK_HEIGHT - 6,
      }}
      title={block.cooperativeSkip ? "Cooperative skip" : undefined}
      onContextMenu={onContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <span className="block-label">{BLOCK_LABELS[block.kind]}</span>
      {editable ? (
        <span className="resize-handle" data-handle="resize" aria-hidden="true" />
      ) : null}
    </div>
  );
}

function PropertyNumber({
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useLayoutEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
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
      value={draft}
      min={min}
      max={max}
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
