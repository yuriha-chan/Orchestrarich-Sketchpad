import {
  Fragment,
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
import {
  AudioLines,
  Calculator,
  Check,
  Clapperboard,
  Clock,
  Copy,
  Eraser,
  Grid2x2,
  Grid3x3,
  Hourglass,
  LayoutGrid,
  MessageSquare,
  Monitor,
  MonitorPlay,
  Palette,
  Pencil,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
  Square,
  Trash,
  TriangleAlert,
  Video,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  BlockKind,
  Placement,
  Track,
  Vec3,
} from "./model";
import {
  BLOCK_KINDS,
  BLOCK_LABELS,
  MAX_BPM,
  MAX_GRID_SIZE,
  MIN_BPM,
  MIN_GRID_SIZE,
  SLOT_CAPABLE_PROPERTIES,
  TRACK_COLORS,
  boundSlotProperties,
  canPlace,
  isDurationPlacement,
  isMediaPlacement,
} from "./model";
import { generateDotGradientSVG } from "./dot-gradient";
import { dragFadeBoundary, fadeBoundaries } from "./fade-editing";
import type { FadeBoundary } from "./fade-editing";
import { useExperimentStore } from "./store";
import { allLoops, blockLoopEdges, boundaryGapPaths, maxLoopDepth, type LoopNode } from "./loops";
import { loopLevelColor } from "./loop-colors";
import { TimelineSession, slotReads, slotWrites } from "./execution";
import { Stage } from "./Stage";
import { createStageStore } from "./stage-state";
import { compilePlacement, definitionBlocks } from "./execution-definition";
import { slotValueRail } from "./slot-value-rail";
import { outputWires, slotWires } from "./slot-wires";
import {
  BASE_GAP_WIDTH,
  CELL_WIDTH,
  anchorGapCenter,
  barrierRect,
  blockSpan,
  boundary,
  buildTimelineLayout,
  cellAtX,
  cellDelta,
  cellLeft,
  cellRight,
  loopEdgeX,
  type TimelineLayout,
} from "./timeline-layout";
import { WORKSPACES } from "./workspaces";
import {
  rowTop,
  timelineRows,
  trackAtY,
  trackRowIndex,
  type TimelineRow,
} from "./timeline-rows";
import {
  initializationPathKey,
  validateNumericSlotReads,
  validateNumericSlotWrites,
  type NumericSlot,
  type NumericSlotRead,
  type NumericSlotWrite,
} from "../core/slots/numeric-slots";
import { liveNumericSlots } from "./slot-gaps";
import type {
  BlockState,
  TimelinePhase,
  TimelineSnapshot,
} from "../core/execution/timeline-runner.ts";

const TRACK_HEIGHT = 48;
const SLOT_HEIGHT = 24;
const BLOCK_INSET = 3;
const INITIAL_COLUMNS = 16;
const COLUMN_CHUNK = 16;
const SLOT_EDITOR_WIDTH = 210;
const SLOT_CONTROL_HEIGHT = 32;
const SLOT_WIRE_CASING_INSET = 4;
const LOOP_LANE_HEIGHT = 24;
const GROWTH_MARGIN = 4 * (CELL_WIDTH + BASE_GAP_WIDTH);

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

const KIND_ICONS: Record<BlockKind, LucideIcon> = {
  dialogue: MessageSquare,
  camera: Video,
  sound: Volume2,
  animation: Clapperboard,
  wait: Hourglass,
  rectangle: Square,
  addition: Calculator,
};

function BlockKindIcon({
  kind,
  size = 14,
}: {
  readonly kind: BlockKind;
  readonly size?: number;
}) {
  const Icon = KIND_ICONS[kind];
  return <Icon size={size} aria-hidden="true" />;
}

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

type MenuState =
  | {
      readonly kind: "block";
      readonly blockId: string;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "track";
      readonly trackId: string;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "grid";
      readonly time: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "loop";
      readonly loopId: string;
      readonly x: number;
      readonly y: number;
    };

interface SlotDragState {
  readonly slotId: string;
  readonly slotName: string;
  readonly slotTrackId: string | null;
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly hoveredBlock: Placement | null;
  readonly hoveredRect: DOMRect | null;
  readonly hoveredX: number | null;
}

interface LoopDragState {
  readonly loopId: string;
  readonly edge: "start" | "end";
  readonly pointerId: number;
}

interface RunState {
  readonly session: TimelineSession;
  readonly snapshot: TimelineSnapshot;
}

type RectField = "x" | "y" | "w" | "h";

const gridVariables = {
  "--track-height": `${TRACK_HEIGHT}px`,
  "--slot-height": `${SLOT_HEIGHT}px`,
  "--loop-height": "24px",
  "--loop-lane-height": `${LOOP_LANE_HEIGHT}px`,
} as CSSProperties;

export function App() {
  const [useStageStore] = useState(createStageStore);
  const stageItems = useStageStore((state) => state.items);
  const blocks = useExperimentStore((state) => state.blocks);
  const tracks = useExperimentStore((state) => state.tracks);
  const slots = useExperimentStore((state) => state.slots);
  const loops = useExperimentStore((state) => state.loops);
  const addTrack = useExperimentStore((state) => state.addTrack);
  const addTrackAfter = useExperimentStore((state) => state.addTrackAfter);
  const duplicateTrack = useExperimentStore((state) => state.duplicateTrack);
  const removeTrack = useExperimentStore((state) => state.removeTrack);
  const setTrackColor = useExperimentStore((state) => state.setTrackColor);
  const addSlot = useExperimentStore((state) => state.addSlot);
  const selectedKind = useExperimentStore((state) => state.selectedKind);
  const selectedId = useExperimentStore((state) => state.selectedId);
  const setKind = useExperimentStore((state) => state.setKind);
  const setBlockKind = useExperimentStore((state) => state.setBlockKind);
  const create = useExperimentStore((state) => state.create);
  const move = useExperimentStore((state) => state.move);
  const resize = useExperimentStore((state) => state.resize);
  const duplicateBlock = useExperimentStore((state) => state.duplicateBlock);
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
  const addLoopForBlock = useExperimentStore((state) => state.addLoopForBlock);
  const addLoopAtCell = useExperimentStore((state) => state.addLoopAtCell);
  const removeLoop = useExperimentStore((state) => state.removeLoop);
  const setLoopBoundary = useExperimentStore((state) => state.setLoopBoundary);
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
  const setRectValue = useExperimentStore((state) => state.setRectValue);
  const setRectColor = useExperimentStore((state) => state.setRectColor);
  const setAdditionInput = useExperimentStore(
    (state) => state.setAdditionInput,
  );
  const workspace = useExperimentStore((state) => state.workspace);
  const setWorkspace = useExperimentStore((state) => state.setWorkspace);
  const [creation, setCreation] = useState<CreationState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingTrackId, setRenamingTrackId] = useState<string | null>(null);
  const [slotDrag, setSlotDrag] = useState<SlotDragState | null>(null);
  const [columnCount, setColumnCount] = useState(INITIAL_COLUMNS);
  const [loopDrag, setLoopDrag] = useState<LoopDragState | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [stageSpan, setStageSpan] = useState(0);
  const sessionRef = useRef<TimelineSession | null>(null);
  const loopBarRef = useRef<HTMLDivElement | null>(null);

  const loopEntries = useMemo(() => flattenLoops(loops), [loops]);
  const loopBarHeight =
    Math.max(1, maxLoopDepth(loops)) * LOOP_LANE_HEIGHT;
  const loopRegions = useMemo(() => allLoops(loops), [loops]);
  const layout = useMemo(
    () =>
      buildTimelineLayout(columnCount, (time) =>
        boundaryGapPaths(loops, time),
      ),
    [columnCount, loops],
  );
  const slotWireLayout = useMemo(
    () => ({
      layout,
      blockInset: BLOCK_INSET,
      trackHeight: TRACK_HEIGHT,
      slotHeight: SLOT_HEIGHT,
      loops: loopRegions,
    }),
    [layout, loopRegions],
  );
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
    const block = blocks.find((candidate) => candidate.id === selectedId);
    if (block === undefined) {
      return;
    }
    setColumnCount((count) =>
      Math.max(count, block.start + block.length),
    );
  }, [blocks, selectedId]);

  useEffect(() => {
    const end = loopRegions.reduce(
      (maximum, region) => Math.max(maximum, region.end),
      0,
    );
    if (end > 0) {
      setColumnCount((count) => Math.max(count, end));
    }
  }, [loopRegions]);

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
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement)
      ) {
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
        setMenu(null);
        setRenamingTrackId(null);
        useExperimentStore.getState().select(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (editable) {
      return;
    }
    setMenu(null);
    setRenamingTrackId(null);
  }, [editable]);

  useEffect(() => {
    if (menu === null) {
      return;
    }
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

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
  const menuBlock =
    menu?.kind === "block"
      ? (blocks.find((block) => block.id === menu.blockId) ?? null)
      : null;
  const menuTrack =
    menu?.kind === "track"
      ? (tracks.find((track) => track.id === menu.trackId) ?? null)
      : null;
  const menuLoop =
    menu?.kind === "loop"
      ? (loopRegions.find((node) => node.id === menu.loopId) ?? null)
      : null;
  const selectedDuration =
    selected && isDurationPlacement(selected)
      ? roundTo(
          selected.syncBeatsToCellSpan ? selected.length : selected.duration,
          3,
        )
      : 0;
  const selectedRect = selected?.kind === "rectangle" ? selected : null;
  const selectedAddition = selected?.kind === "addition" ? selected : null;
  const rectMax = selectedRect?.rectUnit === "pixels" ? 4096 : 512;
  const rectMinSize = selectedRect?.rectUnit === "pixels" ? 1 : 0.25;
  const rectStep = selectedRect?.rectUnit === "pixels" ? 1 : 0.25;

  const rows = useMemo(() => timelineRows(tracks, slots), [tracks, slots]);
  const wires = useMemo(
    () => slotWires(rows, blocks, slotWireLayout),
    [rows, blocks, slotWireLayout],
  );
  const outputWireList = useMemo(
    () => outputWires(rows, blocks, slotWireLayout),
    [rows, blocks, slotWireLayout],
  );
  const slotAssignments = useMemo(() => {
    const assignments = new Map<string, number[]>();
    for (const block of blocks) {
      for (const { slotId } of boundSlotProperties(block, "output")) {
        const times = assignments.get(slotId);
        if (times === undefined) {
          assignments.set(slotId, [block.start + block.length]);
        } else {
          times.push(block.start + block.length);
        }
      }
    }
    return assignments;
  }, [blocks]);
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
  const liveSlots = useMemo(
    () => liveNumericSlots(slots, loops),
    [slots, loops],
  );
  const writes = useMemo(() => slotWrites(blocks), [blocks]);
  const invalidSlotWrites = useMemo(
    () => validateNumericSlotWrites(liveSlots, writes),
    [liveSlots, writes],
  );
  const invalidSlotReads = useMemo(
    () => validateNumericSlotReads(liveSlots, slotReads(blocks), writes),
    [liveSlots, blocks, writes],
  );
  const slotValidationMessage = useMemo(
    () =>
      formatSlotValidation(
        invalidSlotReads,
        invalidSlotWrites,
        liveSlots,
        tracks,
      ),
    [invalidSlotReads, invalidSlotWrites, liveSlots, tracks],
  );

  const beginSlotDrag = useCallback(
    (
      slotId: string,
      slotName: string,
      slotTrackId: string | null,
      pointerId: number,
      x: number,
      y: number,
    ) => {
      setSlotDrag({
        slotId,
        slotName,
        slotTrackId,
        pointerId,
        x,
        y,
        hoveredBlock: null,
        hoveredRect: null,
        hoveredX: null,
      });
    },
    [],
  );

  const dragPointerId = slotDrag?.pointerId;
  const dragSlotId = slotDrag?.slotId;

  useEffect(() => {
    if (dragPointerId === undefined || dragSlotId === undefined) {
      return;
    }
    const handleMove = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) {
        return;
      }
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const overPopup =
        element !== null && element.closest("[data-parameter-popup]") !== null;
      setSlotDrag((current) => {
        if (current === null) {
          return null;
        }
        const moved = { ...current, x: event.clientX, y: event.clientY };
        if (overPopup) {
          return moved;
        }
        const blockElement =
          element === null
            ? null
            : element.closest<HTMLElement>("[data-block-id]");
        const blockId = blockElement?.dataset.blockId;
        if (blockElement === null || blockId === undefined) {
          return {
            ...moved,
            hoveredBlock: null,
            hoveredRect: null,
            hoveredX: null,
          };
        }
        if (blockId === current.hoveredBlock?.id) {
          return moved;
        }
        const hovered = blocks.find((block) => block.id === blockId);
        if (hovered === undefined) {
          return {
            ...moved,
            hoveredBlock: null,
            hoveredRect: null,
            hoveredX: null,
          };
        }
        return {
          ...moved,
          hoveredBlock: hovered,
          hoveredRect: blockElement.getBoundingClientRect(),
          hoveredX: event.clientX,
        };
      });
    };
    const handleUp = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) {
        return;
      }
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const row =
        element === null
          ? null
          : element.closest<HTMLElement>("[data-drop-parameter]");
      const popup = row?.closest<HTMLElement>("[data-parameter-popup]");
      const key = row?.dataset.dropParameter;
      const blockId = popup?.dataset.blockId;
      if (key !== undefined && blockId !== undefined) {
        useExperimentStore.getState().setSlotBinding(blockId, key, dragSlotId);
        useExperimentStore.getState().select(blockId);
      }
      setSlotDrag(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSlotDrag(null);
      }
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dragPointerId, dragSlotId, blocks]);

  const startRun = () => {
    let next: TimelineSession;
    try {
      next = new TimelineSession(
        tracks,
        blocks,
        loops,
        bpm,
        useStageStore.getState(),
        {
          slots,
          onSnapshot: (snapshot) =>
            setRun((current) =>
              current === null ? null : { ...current, snapshot },
            ),
          onActivity: setActivity,
        },
      );
      sessionRef.current = next;
      setRun({ session: next, snapshot: next.snapshot });
      next.start();
    } catch (error) {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      setRun(null);
      setActivity(error instanceof Error ? error.message : String(error));
    }
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
    const start = cellFromPointer(event, layout);
    if (!canPlace(tracks, blocks, { trackId, start, length: 1 }, loopRegions)) {
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
    const currentCell = cellFromPointer(event, layout);
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
    const end = cellFromPointer(event, layout);
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
      setMenu(null);
      return;
    }
    setMenu({
      kind: "block",
      blockId: block.id,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const openTrackContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    track: Track,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu(null);
    if (!editable) {
      return;
    }
    setMenu({
      kind: "track",
      trackId: track.id,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handleGridContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setMenu(null);
    select(null);
    if (!editable) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const time = Math.max(0, cellAtX(layout, event.clientX - rect.left));
    setMenu({ kind: "grid", time, x: event.clientX, y: event.clientY });
  };

  const openLoopContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    node: LoopNode,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editable) {
      return;
    }
    setMenu({ kind: "loop", loopId: node.id, x: event.clientX, y: event.clientY });
  };

  const handleGridScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (
      element.scrollLeft + element.clientWidth >=
      element.scrollWidth - GROWTH_MARGIN
    ) {
      setColumnCount((count) => count + COLUMN_CHUNK);
    }
  };

  const beginLoopDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    node: LoopNode,
    edge: "start" | "end",
  ) => {
    if (!editable) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    loopBarRef.current?.setPointerCapture(event.pointerId);
    setLoopDrag({ loopId: node.id, edge, pointerId: event.pointerId });
  };

  const handleLoopPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (loopDrag === null || loopDrag.pointerId !== event.pointerId) {
      return;
    }
    const node = loopRegions.find(
      (candidate) => candidate.id === loopDrag.loopId,
    );
    if (node === undefined) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const time = cellAtX(layout, event.clientX - rect.left);
    if (loopDrag.edge === "start") {
      setLoopBoundary(node.id, "start", clamp(time, 0, node.end - 1));
    } else {
      setLoopBoundary(node.id, "end", clamp(time, node.start + 1, columnCount));
    }
  };

  const finishLoopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (loopDrag === null || loopDrag.pointerId !== event.pointerId) {
      return;
    }
    setLoopDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
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
    }, loopRegions);
  const previewSpan =
    creation === null
      ? null
      : blockSpan(
          layout,
          previewStart,
          previewLength,
          BLOCK_INSET,
          blockLoopEdges(loopRegions, previewStart, previewLength),
        );
  const cursorRect =
    barrierSpan === null
      ? null
      : barrierRect(layout, barrierSpan.start, barrierSpan.end);

  return (
    <main className="app" style={gridVariables}>
      <nav className="workspace-bar" role="tablist" aria-label="Workspaces">
        {WORKSPACES.map((entry) => {
          const Icon = entry.id === "staging" ? LayoutGrid : MonitorPlay;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={workspace === entry.id}
              className={`workspace-tab${workspace === entry.id ? " is-active" : ""}`}
              onClick={() => {
                setMenu(null);
                setCreation(null);
                setWorkspace(entry.id);
              }}
            >
              <Icon size={14} aria-hidden="true" />
              {entry.label}
            </button>
          );
        })}
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
                <BlockKindIcon kind={kind} />
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
                invalidSlotReads.length > 0 ||
                invalidSlotWrites.length > 0
              }
            >
              <Play size={14} aria-hidden="true" />
              Run
            </button>
            <button
              type="button"
              onClick={requestSkip}
              disabled={requestSkip === undefined}
            >
              <SkipForward size={14} aria-hidden="true" />
              Skip
            </button>
            <button type="button" onClick={resetRun} disabled={editable}>
              <RotateCcw size={14} aria-hidden="true" />
              Reset
            </button>
          </div>
          <label className="bpm-field">
            <AudioLines size={13} aria-hidden="true" />
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
            <Grid3x3 size={13} aria-hidden="true" />
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
            <button
              type="button"
              onClick={deleteSelected}
              disabled={deleteSelected === undefined}
            >
              <Trash size={14} aria-hidden="true" />
              Delete selected
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={clearAll === undefined}
            >
              <Eraser size={14} aria-hidden="true" />
              Clear all
            </button>
          </div>
        ) : null}
      </header>

      {slotValidationMessage ? (
        <p className="slot-validation" role="alert">
          <TriangleAlert size={15} aria-hidden="true" />
          {slotValidationMessage}
        </p>
      ) : null}

      <section
        className={`stage${isStaging ? "" : " is-expanded"}`}
        aria-label="Stage"
      >
        <div className="stage-heading">
          <Monitor size={14} aria-hidden="true" />
          Stage
        </div>
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
              <div className="loop-spacer" style={{ height: loopBarHeight }} />
              <div className="ruler-spacer" />
              {rows.map((row, rowIndex) => {
                if (row.kind === "track") {
                  const track = tracks.find(
                    (candidate) => candidate.id === row.trackId,
                  )!;
                  return (
                    <TrackLabel
                      key={`track-${row.trackId}`}
                      track={track}
                      editable={editable}
                      groupStart={rowGroupStarts[rowIndex]}
                      renaming={renamingTrackId === track.id}
                      onEndRename={() => setRenamingTrackId(null)}
                      onContextMenu={(event) =>
                        openTrackContextMenu(event, track)
                      }
                    />
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
              <div className="track-add" style={{ height: SLOT_CONTROL_HEIGHT }}>
                <button
                  type="button"
                  className="slot-add"
                  aria-label="Add track"
                  disabled={!editable}
                  onClick={addTrack}
                >
                  <Plus size={11} aria-hidden="true" />
                  Add track
                </button>
              </div>
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
                  <Plus size={11} aria-hidden="true" />
                  Add shared slot
                </button>
              </div>
            </div>
            <div className="grid-scroll" onScroll={handleGridScroll}>
              <div
                className="grid-content"
                style={{ width: layout.width }}
              >
                <div
                  className="loop-bar"
                  ref={loopBarRef}
                  style={{ height: loopBarHeight }}
                  onPointerMove={handleLoopPointerMove}
                  onPointerUp={finishLoopDrag}
                  onPointerCancel={finishLoopDrag}
                >
                  {loopEntries.map(({ node, depth }) => {
                    const colors = loopLevelColor(depth);
                    const startX = loopEdgeX(layout, node.start, node.id, "start");
                    const endX = loopEdgeX(layout, node.end, node.id, "end");
                    return (
                      <div
                        key={node.id}
                        className="loop-region"
                        style={{
                          left: startX,
                          width: endX - startX,
                          top: depth * LOOP_LANE_HEIGHT,
                          borderColor: colors.line,
                          background: colors.barFill,
                        }}
                        onContextMenu={(event) =>
                          openLoopContextMenu(event, node)
                        }
                      >
                        <button
                          type="button"
                          className="loop-handle is-start"
                          aria-label={`Loop start at cell ${node.start}`}
                          title="Drag to move the loop start"
                          disabled={!editable}
                          style={{ background: colors.line }}
                          onPointerDown={(event) =>
                            beginLoopDrag(event, node, "start")
                          }
                        />
                        <span
                          className="loop-caption"
                          style={{ color: colors.text }}
                        >
                          Loop {node.start}–{node.end}
                        </span>
                        <button
                          type="button"
                          className="loop-handle is-end"
                          aria-label={`Loop end at cell ${node.end}`}
                          title="Drag to move the loop end"
                          disabled={!editable}
                          style={{ background: colors.line }}
                          onPointerDown={(event) =>
                            beginLoopDrag(event, node, "end")
                          }
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="ruler">
                  {Array.from({ length: columnCount }, (_, column) => (
                    <span
                      key={column}
                      className={`ruler-cell${runningRun !== null && runningRun.snapshot.time === column ? " is-current" : ""}`}
                      style={{
                        left: cellLeft(layout, column),
                        width: layout.cellWidth,
                      }}
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
                        >
                          <RowTiles layout={layout} />
                        </div>
                      ) : (
                        <SlotRow
                          key={`slot-${row.slotId}`}
                          slot={slotsById[row.slotId]}
                          name={slotNames.get(row.slotId) ?? row.slotId}
                          layout={layout}
                          columnCount={columnCount}
                          editable={editable}
                          groupStart={rowGroupStarts[rowIndex]}
                          assignmentTimes={slotAssignments.get(row.slotId) ?? []}
                          onValueDragStart={beginSlotDrag}
                        />
                      ),
                    )}
                    {loopEntries.map(({ node, depth }) => {
                      const colors = loopLevelColor(depth);
                      const startX = loopEdgeX(layout, node.start, node.id, "start");
                      const endX = loopEdgeX(layout, node.end, node.id, "end");
                      return (
                        <Fragment key={node.id}>
                          <div
                            className="loop-band"
                            aria-hidden="true"
                            style={{
                              left: startX,
                              width: endX - startX,
                              background: colors.fill,
                            }}
                          />
                          <div
                            className="loop-line"
                            aria-hidden="true"
                            style={{
                              left: startX,
                              background: colors.line,
                            }}
                          />
                          <div
                            className="loop-line"
                            aria-hidden="true"
                            style={{
                              left: endX,
                              background: colors.line,
                            }}
                          />
                        </Fragment>
                      );
                    })}
                    <svg className="slot-wire-layer" aria-hidden="true">
                      {wires.map((wire) => (
                        <g key={wire.key}>
                          <line
                            className="slot-wire-casing"
                            x1={wire.x}
                            y1={wire.blockBottomY}
                            x2={wire.x}
                            y2={wire.slotY - SLOT_WIRE_CASING_INSET}
                          />
                          <line
                            x1={wire.x}
                            y1={wire.blockBottomY}
                            x2={wire.x}
                            y2={wire.slotY}
                          />
                        </g>
                      ))}
                      {outputWireList.map((wire) => (
                        <g key={`out-${wire.key}`}>
                          <polyline
                            className="slot-wire-casing"
                            points={`${wire.blockRightX},${wire.blockCenterY} ${wire.gapX},${wire.blockCenterY} ${wire.gapX},${wire.slotY - SLOT_WIRE_CASING_INSET}`}
                          />
                          <polyline
                            points={`${wire.blockRightX},${wire.blockCenterY} ${wire.gapX},${wire.blockCenterY} ${wire.gapX},${wire.slotY}`}
                          />
                        </g>
                      ))}
                    </svg>
                    <div className="block-layer">
                      {blocks.map((block) => (
                        <BlockView
                          key={block.id}
                          block={block}
                          rows={rows}
                          layout={layout}
                          loopRegions={loopRegions}
                          columnCount={columnCount}
                          selected={block.id === selectedId}
                          editable={editable}
                          state={runStateByPlacementId.get(block.id)}
                          blocking={blockingPlacementIds.has(block.id)}
                          onContextMenu={(event) => openBlockContextMenu(event, block)}
                        />
                      ))}
                      {creation && previewSpan ? (
                        <div
                          className={`block block-${creation.kind} is-preview${previewValid ? "" : " is-invalid"}`}
                          style={{
                            left: previewSpan.left,
                            top:
                              rowTop(
                                rows,
                                previewRowIndex,
                                TRACK_HEIGHT,
                                SLOT_HEIGHT,
                              ) + BLOCK_INSET,
                            width: previewSpan.width,
                            height: TRACK_HEIGHT - 2 * BLOCK_INSET,
                          }}
                        >
                          <span className="block-label">
                            <BlockKindIcon kind={creation.kind} size={12} />
                            <span className="block-label-text">
                              {BLOCK_LABELS[creation.kind]}
                            </span>
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <svg className="slot-dot-layer" aria-hidden="true">
                      {wires.map((wire) => (
                        <circle
                          key={wire.key}
                          cx={wire.x}
                          cy={wire.blockBottomY}
                          r={4}
                        />
                      ))}
                    </svg>
                    {cursorRect ? (
                      <div
                        className="time-cursor"
                        style={{
                          left: cursorRect.left,
                          width: cursorRect.width,
                        }}
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                  <div
                    className="shared-slot-add-spacer"
                    style={{ height: SLOT_CONTROL_HEIGHT * 2 }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
          </div>
          <aside className="inspector" aria-label="Block properties">
            <div className="inspector-heading">
              <SlidersHorizontal size={13} aria-hidden="true" />
              Properties
            </div>
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
                ) : selected.kind === "addition" ? (
                  <p className="inspector-note">
                    The addition computes instantly; its output is assigned
                    when the block ends.
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
                            <AudioLines size={12} aria-hidden="true" />
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
                            <Clock size={12} aria-hidden="true" />
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
                    {selectedAddition ? (
                      <>
                        <div className="rect-fields">
                          <SlotPropertyField
                            placementId={selectedAddition.id}
                            field="a"
                            label="A"
                            value={selectedAddition.inputA}
                            min={-1000000}
                            max={1000000}
                            step={1}
                            valueKey="number"
                            boundSlotId={selectedAddition.slotBindings?.a}
                            trackId={selectedAddition.trackId}
                            slots={slots}
                            tracks={tracks}
                            editable={editable}
                            ariaLabel="Addition input A"
                            onCommit={(next) =>
                              setAdditionInput(selectedAddition.id, "a", next)
                            }
                          />
                          <SlotPropertyField
                            placementId={selectedAddition.id}
                            field="b"
                            label="B"
                            value={selectedAddition.inputB}
                            min={-1000000}
                            max={1000000}
                            step={1}
                            valueKey="number"
                            boundSlotId={selectedAddition.slotBindings?.b}
                            trackId={selectedAddition.trackId}
                            slots={slots}
                            tracks={tracks}
                            editable={editable}
                            ariaLabel="Addition input B"
                            onCommit={(next) =>
                              setAdditionInput(selectedAddition.id, "b", next)
                            }
                          />
                        </div>
                        {SLOT_CAPABLE_PROPERTIES.addition
                          .filter(
                            (property) => property.direction === "output",
                          )
                          .map((property) => (
                            <OutputSlotField
                              key={property.key}
                              placementId={selectedAddition.id}
                              field={property.key}
                              label={`${property.label} slot`}
                              trackId={selectedAddition.trackId}
                              boundSlotId={
                                selectedAddition.slotBindings?.[property.key]
                              }
                              slots={slots}
                              tracks={tracks}
                              editable={editable}
                            />
                          ))}
                      </>
                    ) : null}
                    {selectedRect ? (
                      <>
                        <div className="rect-fields">
                          <SlotPropertyField
                            placementId={selectedRect.id}
                            field="x"
                            label="X"
                            value={selectedRect.x}
                            min={0}
                            max={rectMax}
                            step={rectStep}
                            valueKey={selectedRect.rectUnit}
                            boundSlotId={selectedRect.slotBindings?.x}
                            trackId={selectedRect.trackId}
                            slots={slots}
                            tracks={tracks}
                            editable={editable}
                            ariaLabel="Rectangle x"
                            onCommit={(next) =>
                              setRectValue(selectedRect.id, "x", next)
                            }
                          />
                          <SlotPropertyField
                            placementId={selectedRect.id}
                            field="y"
                            label="Y"
                            value={selectedRect.y}
                            min={0}
                            max={rectMax}
                            step={rectStep}
                            valueKey={selectedRect.rectUnit}
                            boundSlotId={selectedRect.slotBindings?.y}
                            trackId={selectedRect.trackId}
                            slots={slots}
                            tracks={tracks}
                            editable={editable}
                            ariaLabel="Rectangle y"
                            onCommit={(next) =>
                              setRectValue(selectedRect.id, "y", next)
                            }
                          />
                          <SlotPropertyField
                            placementId={selectedRect.id}
                            field="w"
                            label="Width"
                            value={selectedRect.w}
                            min={rectMinSize}
                            max={rectMax}
                            step={rectStep}
                            valueKey={selectedRect.rectUnit}
                            boundSlotId={selectedRect.slotBindings?.w}
                            trackId={selectedRect.trackId}
                            slots={slots}
                            tracks={tracks}
                            editable={editable}
                            ariaLabel="Rectangle width"
                            onCommit={(next) =>
                              setRectValue(selectedRect.id, "w", next)
                            }
                          />
                          <SlotPropertyField
                            placementId={selectedRect.id}
                            field="h"
                            label="Height"
                            value={selectedRect.h}
                            min={rectMinSize}
                            max={rectMax}
                            step={rectStep}
                            valueKey={selectedRect.rectUnit}
                            boundSlotId={selectedRect.slotBindings?.h}
                            trackId={selectedRect.trackId}
                            slots={slots}
                            tracks={tracks}
                            editable={editable}
                            ariaLabel="Rectangle height"
                            onCommit={(next) =>
                              setRectValue(selectedRect.id, "h", next)
                            }
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
                              <Grid2x2 size={12} aria-hidden="true" />
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
                              <Monitor size={12} aria-hidden="true" />
                              Pixels
                            </button>
                          </div>
                        </div>
                        <div className="inspector-field">
                          <span>Color</span>
                          <div className="rect-color">
                            <span
                              className="rect-color-swatch"
                              style={{
                                background: `rgb(${selectedRect.color[0]}, ${selectedRect.color[1]}, ${selectedRect.color[2]})`,
                              }}
                              aria-hidden="true"
                            />
                            <div className="rect-color-fields">
                              {(["R", "G", "B"] as const).map((label, index) => (
                                <label key={label} className="inspector-field">
                                  <span>{label}</span>
                                  <PropertyNumber
                                    key={`color-${selectedRect.id}-${index}`}
                                    value={selectedRect.color[index]}
                                    min={0}
                                    max={255}
                                    step={1}
                                    ariaLabel={`Rectangle ${label}`}
                                    disabled={!editable}
                                    onCommit={(value) => {
                                      const next: Vec3 = [...selectedRect.color];
                                      next[index] = value;
                                      setRectColor(selectedRect.id, next);
                                    }}
                                  />
                                </label>
                              ))}
                            </div>
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
      {menu?.kind === "block" && menuBlock ? (
        <div
          className="context-menu"
          role="menu"
          aria-label={`Actions for ${BLOCK_LABELS[menuBlock.kind]} at ${menuBlock.start}`}
          style={{
            left: clamp(menu.x, 8, window.innerWidth - 228),
            top: clamp(menu.y, 8, window.innerHeight - 180),
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="context-menu-title">
            <BlockKindIcon kind={menuBlock.kind} size={12} />
            {BLOCK_LABELS[menuBlock.kind]} at t={menuBlock.start}–
            {menuBlock.start + menuBlock.length}
          </div>
          <div className="context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="context-menu-item"
            onClick={() => {
              addLoopForBlock(menuBlock.id);
              setMenu(null);
            }}
          >
            <Repeat size={14} aria-hidden="true" />
            Loop around block
          </button>
          <button
            type="button"
            role="menuitem"
            className="context-menu-item"
            onClick={() => {
              duplicateBlock(menuBlock.id);
              setMenu(null);
            }}
          >
            <Copy size={14} aria-hidden="true" />
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            className="context-menu-item is-danger"
            onClick={() => {
              remove(menuBlock.id);
              setMenu(null);
            }}
          >
            <Trash size={14} aria-hidden="true" />
            Delete
          </button>
        </div>
      ) : null}
      {menu?.kind === "grid" ? (
        <div
          className="context-menu"
          role="menu"
          aria-label={`Timeline actions at ${menu.time}`}
          style={{
            left: clamp(menu.x, 8, window.innerWidth - 228),
            top: clamp(menu.y, 8, window.innerHeight - 72),
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="context-menu-title">
            <Repeat size={12} aria-hidden="true" />t={menu.time}
          </div>
          <div className="context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="context-menu-item"
            onClick={() => {
              addLoopAtCell(menu.time);
              setMenu(null);
            }}
          >
            <Repeat size={14} aria-hidden="true" />
            Add loop
          </button>
        </div>
      ) : null}
      {menu?.kind === "loop" && menuLoop ? (
        <div
          className="context-menu"
          role="menu"
          aria-label={`Actions for loop ${menuLoop.start} to ${menuLoop.end}`}
          style={{
            left: clamp(menu.x, 8, window.innerWidth - 228),
            top: clamp(menu.y, 8, window.innerHeight - 72),
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="context-menu-title">
            <Repeat size={12} aria-hidden="true" />
            Loop {menuLoop.start}–{menuLoop.end}
          </div>
          <div className="context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="context-menu-item is-danger"
            onClick={() => {
              removeLoop(menuLoop.id);
              setMenu(null);
            }}
          >
            <Trash size={14} aria-hidden="true" />
            Remove loop
          </button>
        </div>
      ) : null}
      {menu?.kind === "track" && menuTrack ? (
        <div
          className="context-menu"
          role="menu"
          aria-label={`Actions for track ${menuTrack.label}`}
          style={{
            left: clamp(menu.x, 8, window.innerWidth - 228),
            top: clamp(menu.y, 8, window.innerHeight - 250),
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="context-menu-title">
            <Palette size={12} aria-hidden="true" />
            {menuTrack.label}
          </div>
          <div className="context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="context-menu-item"
            onClick={() => {
              addTrackAfter(menuTrack.id);
              setMenu(null);
            }}
          >
            <Plus size={14} aria-hidden="true" />
            Add track below
          </button>
          <button
            type="button"
            role="menuitem"
            className="context-menu-item"
            onClick={() => {
              setRenamingTrackId(menuTrack.id);
              setMenu(null);
            }}
          >
            <Pencil size={14} aria-hidden="true" />
            Rename track
          </button>
          <button
            type="button"
            role="menuitem"
            className="context-menu-item"
            onClick={() => {
              duplicateTrack(menuTrack.id);
              setMenu(null);
            }}
          >
            <Copy size={14} aria-hidden="true" />
            Duplicate track
          </button>
          <div className="context-menu-separator" role="separator" />
          <div className="context-menu-caption">Track color</div>
          <div className="track-color-choices">
            {TRACK_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`track-color-choice${menuTrack.color === color ? " is-active" : ""}`}
                style={{ background: color }}
                aria-label={`Set track color ${color}`}
                onClick={() => {
                  setTrackColor(menuTrack.id, color);
                  setMenu(null);
                }}
              />
            ))}
          </div>
          <div className="context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="context-menu-item is-danger"
            onClick={() => {
              removeTrack(menuTrack.id);
              setMenu(null);
            }}
          >
            <Trash size={14} aria-hidden="true" />
            Remove track
          </button>
        </div>
      ) : null}
      {slotDrag !== null ? (
        <>
          <div
            className="slot-drag-ghost"
            style={{ left: slotDrag.x + 16, top: slotDrag.y + 16 }}
            aria-hidden="true"
          >
            {slotDrag.slotName}
          </div>
          {slotDrag.hoveredBlock !== null &&
          slotDrag.hoveredRect !== null &&
          slotDrag.hoveredX !== null ? (
            <SlotParameterPopup
              block={slotDrag.hoveredBlock}
              blockRect={slotDrag.hoveredRect}
              anchorX={slotDrag.hoveredX}
              slotName={slotDrag.slotName}
              slotTrackId={slotDrag.slotTrackId}
              slotNames={slotNames}
            />
          ) : null}
        </>
      ) : null}
      {activity ? <p className="activity">{activity}</p> : null}
    </main>
  );
}

function SlotParameterPopup({
  block,
  blockRect,
  anchorX,
  slotName,
  slotTrackId,
  slotNames,
}: {
  block: Placement;
  blockRect: DOMRect;
  anchorX: number;
  slotName: string;
  slotTrackId: string | null;
  slotNames: ReadonlyMap<string, string>;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({
    left: blockRect.left,
    top: blockRect.top,
  });

  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) {
      return;
    }
    const { width, height } = node.getBoundingClientRect();
    const left = Math.min(
      Math.max(anchorX - width / 2, 0),
      Math.max(0, window.innerWidth - width),
    );
    const above = blockRect.top - height;
    setPosition({
      left,
      top: above >= 8 ? above : blockRect.bottom,
    });
  }, [blockRect, anchorX]);

  const properties = SLOT_CAPABLE_PROPERTIES[block.kind];
  const sameTrack = slotTrackId === null || slotTrackId === block.trackId;

  return (
    <div
      ref={ref}
      className="parameter-popup"
      data-parameter-popup=""
      data-block-id={block.id}
      role="group"
      aria-label={`Bind ${slotName} to ${BLOCK_LABELS[block.kind]}`}
      style={{ left: position.left, top: position.top }}
    >
      <div className="parameter-popup-caption">
        <span className="parameter-popup-slot">{slotName}</span>
        <span>Drop to bind</span>
      </div>
      {!sameTrack ? (
        <p className="parameter-popup-note">
          This slot belongs to another track.
        </p>
      ) : properties.length === 0 ? (
        <p className="parameter-popup-note">No slot-capable parameters.</p>
      ) : (
        <div className="parameter-popup-list">
          {properties.map(({ key, label }) => {
            const bound = block.slotBindings?.[key];
            return (
              <div
                key={key}
                className={
                  bound === undefined
                    ? "parameter-popup-row"
                    : "parameter-popup-row is-bound"
                }
                data-drop-parameter={key}
                title={`Drop to bind ${label}`}
              >
                <span className="parameter-popup-key">{label}</span>
                <span className="parameter-popup-source">
                  {bound === undefined
                    ? "Number"
                    : (slotNames.get(bound) ?? bound)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrackLabel({
  track,
  editable,
  groupStart,
  renaming,
  onEndRename,
  onContextMenu,
}: {
  track: Track;
  editable: boolean;
  groupStart: boolean;
  renaming: boolean;
  onEndRename: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  const addSlot = useExperimentStore((state) => state.addSlot);
  const renameTrack = useExperimentStore((state) => state.renameTrack);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (renaming) {
      setDraft(track.label);
    }
  }, [renaming, track.label]);

  const commitName = () => {
    renameTrack(track.id, draft.trim());
    onEndRename();
  };

  return (
    <div
      className={`track-label${groupStart ? " is-group-start" : ""}`}
      title={track.label}
      style={{ boxShadow: `inset 4px 0 0 ${track.color}` }}
      onContextMenu={onContextMenu}
    >
      {renaming ? (
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
            aria-label={`Name for ${track.label}`}
            placeholder={track.label}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                onEndRename();
              }
            }}
          />
          <button
            type="submit"
            className="slot-action is-icon"
            aria-label="Save track name"
            title="Save name"
          >
            <Check size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="slot-action is-icon"
            aria-label="Cancel renaming"
            title="Cancel"
            onClick={onEndRename}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <>
          <span className="track-label-text">{track.label}</span>
          <button
            type="button"
            className="slot-add"
            aria-label={`Add slot to ${track.label}`}
            disabled={!editable}
            onClick={() => addSlot(track.id)}
          >
            <Plus size={11} aria-hidden="true" />
            Add slot
          </button>
        </>
      )}
    </div>
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
              }
            }}
          />
          <button
            type="submit"
            className="slot-action is-icon"
            aria-label="Save slot name"
            title="Save name"
          >
            <Check size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="slot-action is-icon"
            aria-label="Cancel renaming"
            title="Cancel"
            onClick={() => setEditing(false)}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <>
          <span className="slot-label-name" title={name}>
            {name}
          </span>
          <button
            type="button"
            className="slot-action is-icon"
            aria-label={`Rename ${name}`}
            title={`Rename ${name}`}
            disabled={!editable}
            onClick={startRenaming}
          >
            <Pencil size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="slot-action is-icon is-danger"
            aria-label={`Remove ${name}`}
            title={`Remove ${name}`}
            disabled={!editable}
            onClick={() => removeSlot(slot.id)}
          >
            <Trash size={12} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

function SlotRow({
  slot,
  name,
  layout,
  columnCount,
  editable,
  groupStart,
  assignmentTimes,
  onValueDragStart,
}: {
  slot: NumericSlot;
  name: string;
  layout: TimelineLayout;
  columnCount: number;
  editable: boolean;
  groupStart: boolean;
  assignmentTimes: readonly number[];
  onValueDragStart: (
    slotId: string,
    slotName: string,
    slotTrackId: string | null,
    pointerId: number,
    x: number,
    y: number,
  ) => void;
}) {
  const initializeSlot = useExperimentStore((state) => state.initializeSlot);
  const clearSlotInitialization = useExperimentStore(
    (state) => state.clearSlotInitialization,
  );
  const [editing, setEditing] = useState<{
    boundary: number;
    path: readonly string[];
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingDrag, setPendingDrag] = useState<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const suppressClickUntil = useRef(0);

  useEffect(() => {
    if (!editable) {
      setEditing(null);
      setPendingDrag(null);
    }
  }, [editable]);

  useEffect(() => {
    if (pendingDrag === null) {
      return;
    }
    const handleMove = (event: PointerEvent) => {
      if (event.pointerId !== pendingDrag.pointerId) {
        return;
      }
      if (
        Math.hypot(
          event.clientX - pendingDrag.x,
          event.clientY - pendingDrag.y,
        ) < 4
      ) {
        return;
      }
      suppressClickUntil.current = performance.now() + 400;
      setPendingDrag(null);
      onValueDragStart(
        slot.id,
        name,
        slot.trackId,
        event.pointerId,
        event.clientX,
        event.clientY,
      );
    };
    const handleUp = (event: PointerEvent) => {
      if (event.pointerId === pendingDrag.pointerId) {
        setPendingDrag(null);
      }
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [pendingDrag, onValueDragStart, slot.id, slot.trackId, name]);

  const initializationAt = (
    boundary: number,
    path: readonly string[],
  ) => {
    const key = initializationPathKey(path);
    return slot.initializations.find(
      (candidate) =>
        candidate.boundary === boundary &&
        initializationPathKey(candidate.path) === key,
    );
  };

  const editedInitialization =
    editing === null
      ? undefined
      : initializationAt(editing.boundary, editing.path);

  const startEditing = (boundary: number, path: readonly string[]) => {
    if (!editable) {
      return;
    }
    const initialization = initializationAt(boundary, path);
    setDraft(initialization === undefined ? "0" : String(initialization.value));
    setEditing({ boundary, path });
  };

  const commit = () => {
    if (editing === null) {
      return;
    }
    const value = Number.parseFloat(draft);
    if (!Number.isFinite(value)) {
      return;
    }
    initializeSlot(slot.id, editing.boundary, editing.path, value);
    setEditing(null);
  };

  const gapCenters = layout.boundaries.flatMap((run) =>
    run.gaps.map((gap) => gap.center),
  );
  const anchors = layout.boundaries.flatMap((run) => {
    const positions = run.gaps
      .filter((gap) => initializationAt(run.time, gap.path) !== undefined)
      .map((gap) => ({ left: gap.left, center: gap.center }));
    if (assignmentTimes.includes(run.time)) {
      const first = run.gaps[0];
      positions.push({ left: first.left, center: first.center });
    }
    return positions;
  });
  const rail = slotValueRail(anchors, gapCenters, layout.width);
  const editingGap =
    editing === null
      ? undefined
      : layout.boundaries
          .find((run) => run.time === editing.boundary)
          ?.gaps.find(
            (gap) =>
              initializationPathKey(gap.path) ===
              initializationPathKey(editing.path),
          );

  return (
    <div
      className={`slot-row${groupStart ? " is-group-start" : ""}`}
      data-slot-id={slot.id}
      role="group"
      aria-label={`${name} slot row`}
    >
      <RowTiles layout={layout} />
      <svg
        className="slot-value-rail"
        width="100%"
        height="100%"
        aria-hidden="true"
        focusable="false"
      >
        {rail.spans.map((span) => (
          <line
            key={`span-${span.x1}-${span.x2}`}
            x1={span.x1}
            x2={span.x2}
            y1={SLOT_HEIGHT / 2}
            y2={SLOT_HEIGHT / 2}
          />
        ))}
      </svg>
      {layout.boundaries.flatMap((run) =>
        run.gaps.map((gap) => {
          const initialization = initializationAt(run.time, gap.path);
          const key = initializationPathKey(gap.path);
          const initialized = initialization !== undefined;
          const context =
            key === "" ? "outside all loops" : `inside ${key.replaceAll("/", " and ")}`;
          const description = initialized
            ? `${name} at time ${run.time} (${context}), initialized to ${initialization.value}. Open to edit or delete the initialization.`
            : `${name} at time ${run.time} (${context}), unset. Open to initialize it.`;
          return (
            <button
              key={`gap-${run.time}-${key}`}
              type="button"
              className={`slot-cell${initialized ? " is-initialized" : ""}`}
              style={{ left: gap.left, width: gap.width }}
              aria-label={description}
              title={initialized ? "Edit or delete initialization" : "Initialize slot"}
              disabled={!editable}
              onClick={() => {
                if (performance.now() < suppressClickUntil.current) {
                  return;
                }
                startEditing(run.time, gap.path);
              }}
            >
              {initialization !== undefined ? (
                <span
                  className="slot-cell-value"
                  style={{ left: gap.center - gap.left }}
                  title="Drag to bind a parameter"
                  onPointerDown={(event) => {
                    if (!editable || event.button !== 0) {
                      return;
                    }
                    event.stopPropagation();
                    setPendingDrag({
                      pointerId: event.pointerId,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                >
                  {initialization.value}
                </span>
              ) : null}
            </button>
          );
        }),
      )}
      {rail.dots.map((x) => (
        <button
          key={`dot-${x}`}
          type="button"
          className="slot-value-dot"
          style={{ left: x }}
          aria-label={`${name} value at ${x}px; drag to bind a parameter`}
          title="Drag to bind a parameter"
          disabled={!editable}
          onPointerDown={(event) => {
            if (!editable || event.button !== 0) {
              return;
            }
            event.stopPropagation();
            event.preventDefault();
            onValueDragStart(
              slot.id,
              name,
              slot.trackId,
              event.pointerId,
              event.clientX,
              event.clientY,
            );
          }}
        />
      ))}
      {editing !== null && editingGap !== undefined && editable ? (
        <form
          className="slot-editor"
          style={{
            left: Math.max(
              2,
              Math.min(editingGap.left, layout.width - SLOT_EDITOR_WIDTH - 2),
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
            aria-label={`${name} value at time ${editing.boundary}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setEditing(null);
              }
            }}
          />
          <button
            type="submit"
            aria-label={`Set ${name} at time ${editing.boundary}`}
            title="Set value"
          >
            <Check size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Cancel editing ${name} at time ${editing.boundary}`}
            title="Cancel"
            onClick={() => setEditing(null)}
          >
            <X size={12} aria-hidden="true" />
          </button>
          {editedInitialization !== undefined ? (
            <button
              type="button"
              className="slot-editor-delete"
              aria-label={`Delete initialization for ${name} at time ${editing.boundary}`}
              title="Delete initialization"
              onClick={() => {
                clearSlotInitialization(
                  slot.id,
                  editing.boundary,
                  editing.path,
                );
                setEditing(null);
              }}
            >
              <Trash size={12} aria-hidden="true" />
            </button>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

function SlotPropertyField({
  placementId,
  field,
  label,
  value,
  min,
  max,
  step,
  valueKey,
  boundSlotId,
  trackId,
  slots,
  tracks,
  editable,
  ariaLabel,
  onCommit,
}: {
  placementId: string;
  field: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueKey: string;
  boundSlotId: string | undefined;
  trackId: string;
  slots: readonly NumericSlot[];
  tracks: readonly Track[];
  editable: boolean;
  ariaLabel: string;
  onCommit: (value: number) => void;
}) {
  const setSlotBinding = useExperimentStore((state) => state.setSlotBinding);
  const { local, shared } = slotChoices(slots, tracks, trackId);
  const missingBound =
    boundSlotId !== undefined &&
    ![...local, ...shared].some(({ slot }) => slot.id === boundSlotId);

  return (
    <div className="inspector-field">
      <label htmlFor={`property-${placementId}-${field}-source`}>
        {label}
      </label>
      <select
        id={`property-${placementId}-${field}-source`}
        className="rect-source"
        aria-label={`${ariaLabel} source`}
        value={boundSlotId ?? ""}
        disabled={!editable}
        onChange={(event) => {
          const next = event.target.value;
          setSlotBinding(placementId, field, next === "" ? null : next);
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
        key={`property-${field}-${placementId}-${valueKey}`}
        value={roundTo(value, 3)}
        min={min}
        max={max}
        step={step}
        ariaLabel={ariaLabel}
        disabled={!editable || boundSlotId !== undefined}
        onCommit={onCommit}
      />
    </div>
  );
}

function OutputSlotField({
  placementId,
  field,
  label,
  trackId,
  boundSlotId,
  slots,
  tracks,
  editable,
}: {
  placementId: string;
  field: string;
  label: string;
  trackId: string;
  boundSlotId: string | undefined;
  slots: readonly NumericSlot[];
  tracks: readonly Track[];
  editable: boolean;
}) {
  const setSlotBinding = useExperimentStore((state) => state.setSlotBinding);
  const { local, shared } = slotChoices(slots, tracks, trackId);
  const missingBound =
    boundSlotId !== undefined &&
    ![...local, ...shared].some(({ slot }) => slot.id === boundSlotId);

  return (
    <div className="inspector-field">
      <label htmlFor={`property-${placementId}-${field}-output`}>{label}</label>
      <select
        id={`property-${placementId}-${field}-output`}
        className="rect-source"
        aria-label={`${label} slot`}
        value={boundSlotId ?? ""}
        disabled={!editable}
        onChange={(event) => {
          const next = event.target.value;
          setSlotBinding(placementId, field, next === "" ? null : next);
        }}
      >
        <option value="">None</option>
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
    </div>
  );
}

function BlockView({
  block,
  rows,
  layout,
  loopRegions,
  columnCount,
  selected,
  editable,
  state,
  blocking,
  onContextMenu,
}: {
  block: Placement;
  rows: readonly TimelineRow[];
  layout: TimelineLayout;
  loopRegions: readonly LoopNode[];
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
    const rowsArea = event.currentTarget.closest(".rows-area");
    if (rowsArea === null) {
      return;
    }
    const rowsRect = rowsArea.getBoundingClientRect();
    const delta = cellDelta(
      layout,
      current.originX - rowsRect.left,
      event.clientX - rowsRect.left,
    );
    if (current.boundary !== undefined) {
      const origin = current.boundary === "fadeOut"
        ? current.length - current.fadeOut
        : current.fadeIn;
      setSpan(block.id, current.start, current.length, dragFadeBoundary(
        current.boundary, origin + delta, current.length, current.fadeIn, current.fadeOut,
      ));
      return;
    }
    if (current.mode === "resizeStart") {
      const end = current.start + current.length;
      const start = clamp(current.start + delta, 0, end - 1);
      setSpan(block.id, start, end - start);
      return;
    }
    if (current.mode === "fadeIn" || current.mode === "fadeOut") {
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
      const start = clamp(
        current.start + delta,
        0,
        columnCount - current.length,
      );
      const trackId = trackAtY(
        rows,
        event.clientY - rowsRect.top,
        TRACK_HEIGHT,
        SLOT_HEIGHT,
      );
      move(block.id, trackId, start);
      return;
    }
    const length = clamp(
      current.length + delta,
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

  const span = blockSpan(
    layout,
    block.start,
    block.length,
    BLOCK_INSET,
    blockLoopEdges(loopRegions, block.start, block.length),
  );
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
      data-block-id={block.id}
      style={{
        left: span.left,
        top: rowTop(rows, trackIndex, TRACK_HEIGHT, SLOT_HEIGHT) + BLOCK_INSET,
        width: span.width,
        height: TRACK_HEIGHT - 2 * BLOCK_INSET,
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
              blockWidth={span.width}
              inward
            />
          ) : null}
          {block.fadeOut > 0 ? (
            <FadeSurface
              className="block-fade block-fade-out"
              cells={block.fadeOut}
              length={block.length}
              blockWidth={span.width}
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
      <span className="block-label">
        <BlockKindIcon kind={block.kind} size={12} />
        <span className="block-label-text">{BLOCK_LABELS[block.kind]}</span>
      </span>
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

function RowTiles({ layout }: { layout: TimelineLayout }) {
  return (
    <span className="row-tiles" aria-hidden="true">
      {layout.cellLefts.map((left, time) => (
        <span
          key={time}
          className="row-tile"
          style={{ left, width: layout.cellWidth }}
        />
      ))}
    </span>
  );
}

function FadeSurface({ className, cells, length, blockWidth, inward }: {
  className: string;
  cells: number;
  length: number;
  blockWidth: number;
  inward: boolean;
}) {
  const maskImage = useMemo(() => {
    const width = blockWidth * cells / length;
    const svg = generateDotGradientSVG(
      Math.ceil(width / 6) * 6,
      TRACK_HEIGHT - 2 * BLOCK_INSET,
      6,
      inward ? 0.25 : 4.5, inward ? 4.5 : 0.25);
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [cells, length, blockWidth, inward]);
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

function slotChoices(
  slots: readonly NumericSlot[],
  tracks: readonly Track[],
  trackId: string,
): {
  local: { slot: NumericSlot; name: string }[];
  shared: { slot: NumericSlot; name: string }[];
} {
  const available = slots
    .map((slot, index) => ({ slot, name: slotDisplayName(slot, index, tracks) }))
    .filter(({ slot }) => slot.trackId === null || slot.trackId === trackId);
  return {
    local: available.filter(({ slot }) => slot.trackId !== null),
    shared: available.filter(({ slot }) => slot.trackId === null),
  };
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
  writes: readonly NumericSlotWrite[],
  slots: readonly NumericSlot[],
  tracks: readonly Track[],
): string | null {
  if (reads.length === 0 && writes.length === 0) {
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
    const initializations = entry.slot.initializations;
    if (initializations.length === 0) {
      messages.add(`${name} has no value at or before ${readAt}.`);
      continue;
    }
    if (entry.slot.trackId !== null && entry.slot.trackId !== read.trackId) {
      messages.add(
        `${name} belongs to ${trackLabel(entry.slot.trackId)} and cannot be read on ${trackLabel(read.trackId)} at time ${read.time}.`,
      );
      continue;
    }
    const firstInitializationTime = Math.min(
      ...initializations.map((initialization) => initialization.boundary),
    );
    if (read.time < firstInitializationTime) {
      messages.add(
        `${name} initializes at time ${firstInitializationTime}, after it is read at ${readAt}.`,
      );
    }
  }
  for (const write of writes) {
    const entry = slotsById.get(write.slotId);
    const name = entry?.name ?? `Slot ${write.slotId}`;
    if (entry === undefined) {
      messages.add(`${name} is unavailable but is written by a block.`);
      continue;
    }
    messages.add(
      `${name} belongs to ${trackLabel(entry.slot.trackId!)} and cannot be written from ${trackLabel(write.trackId)}.`,
    );
  }
  return messages.size > 0
    ? `Cannot run: ${Array.from(messages).join(" ")}`
    : null;
}

function flattenLoops(
  nodes: readonly LoopNode[],
  depth = 0,
): { node: LoopNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenLoops(node.children, depth + 1),
  ]);
}

function cellFromPointer(
  event: ReactPointerEvent<HTMLDivElement>,
  layout: TimelineLayout,
): number {
  const rect = event.currentTarget.getBoundingClientRect();
  return cellAtX(layout, event.clientX - rect.left);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
