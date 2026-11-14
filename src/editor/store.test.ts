import { beforeEach, describe, expect, it } from "vitest";

import { validateNumericSlotReads } from "../core/slots/numeric-slots";
import { slotReads } from "./execution";
import { DEFAULT_BPM, DEFAULT_TRACKS, TRACK_COLORS, type DurationUnit, type Placement, type Vec3 } from "./model";
import { DEFAULT_RECT_COLOR, type RectangleData } from "../blocks/rectangle";
import { editDuration, type DurationData } from "../blocks/duration-data";
import type { AdditionData } from "../blocks/addition";
import type { MediaData } from "../blocks/media-data";
import type { EntryContext, TimelineGestureContext } from "../blocks/block-definition";
import { blockDefinition } from "../blocks/builtin-blocks";
import { allLoops } from "./loops";
import { useExperimentStore } from "./store";

function resetStore(): void {
  useExperimentStore.setState({
    blocks: [],
    tracks: DEFAULT_TRACKS.map((track) => ({ ...track })),
    slots: [],
    selectedId: null,
    loops: [],
    bpm: DEFAULT_BPM,
  });
}

beforeEach(resetStore);

function addSlot(trackId: string | null): string {
  useExperimentStore.getState().addSlot(trackId);
  const slots = useExperimentStore.getState().slots;
  return slots[slots.length - 1].id;
}

function createAddition(
  trackId: string = DEFAULT_TRACKS[1].id,
  start = 0,
): string {
  useExperimentStore.getState().create(trackId, "addition", start, 1);
  const blocks = useExperimentStore.getState().blocks;
  return blocks[blocks.length - 1].id;
}

function createRectangle(
  trackId: string = DEFAULT_TRACKS[1].id,
  start = 0,
): string {
  useExperimentStore.getState().create(trackId, "rectangle", start, 1);
  const blocks = useExperimentStore.getState().blocks;
  return blocks[blocks.length - 1].id;
}

function rectangle(id: string): Placement<RectangleData> & RectangleData {
  const block = useExperimentStore
    .getState()
    .blocks.find((candidate) => candidate.id === id);
  if (block === undefined) {
    throw new Error(`rectangle ${id} not found`);
  }
  return { ...block, data: block.data as RectangleData, ...(block.data as RectangleData) };
}

function editData(id: string, update: (data: unknown) => unknown): void {
  useExperimentStore.getState().editBlockData(id, update);
}

function blockById(id: string): Placement | undefined {
  return useExperimentStore
    .getState()
    .blocks.find((candidate) => candidate.id === id);
}

function entryContext(block: Placement, stageSpan = 0): EntryContext {
  return {
    length: block.length,
    bpm: useExperimentStore.getState().bpm,
    stageSpan,
  };
}

function requiredBlock(id: string): Placement {
  const block = blockById(id);
  if (block === undefined) throw new Error(`Block ${id} not found`);
  return block;
}

function setRectValue(
  id: string,
  field: "x" | "y" | "w" | "h",
  value: number,
): void {
  const block = requiredBlock(id);
  const declaration = blockDefinition(block.kind).fields.find(
    (candidate) =>
      candidate.kind === "number" &&
      candidate.section === "input" &&
      candidate.key === field,
  );
  if (declaration?.kind !== "number") {
    throw new Error(`Missing numeric input "${field}" on ${block.kind}`);
  }
  editData(id, (data) => declaration.commit(data, value));
}

function setRectUnit(
  id: string,
  unit: "span" | "pixels",
  span: number,
): void {
  const block = requiredBlock(id);
  const field = blockDefinition(block.kind).fields.find(
    (candidate) => candidate.kind === "choice" && candidate.key === "units",
  );
  if (field?.kind !== "choice") {
    throw new Error(`Missing unit choice on ${block.kind}`);
  }
  const choice = field.choices.find((candidate) => candidate.value === unit);
  if (choice === undefined) {
    throw new Error(`Missing ${unit} choice on ${block.kind}`);
  }
  editData(id, (data) => choice.commit(data, entryContext(block, span)));
}

function setRectColor(id: string, color: Vec3): void {
  const block = requiredBlock(id);
  const field = blockDefinition(block.kind).fields.find(
    (candidate) => candidate.kind === "color" && candidate.key === "color",
  );
  if (field?.kind !== "color") {
    throw new Error(`Missing color field on ${block.kind}`);
  }
  editData(id, (data) => field.commit(data, color));
}

function setDuration(id: string, value: number): void {
  const block = requiredBlock(id);
  const field = blockDefinition(block.kind).fields.find(
    (candidate) => candidate.kind === "duration",
  );
  if (field?.kind !== "duration") {
    throw new Error(`Missing duration field on ${block.kind}`);
  }
  editData(id, (data) =>
    field.commit(data, { kind: "value", value }, entryContext(block)),
  );
}

function setAdditionInput(
  id: string,
  field: "a" | "b",
  value: number,
): void {
  const block = requiredBlock(id);
  const declaration = blockDefinition(block.kind).fields.find(
    (candidate) =>
      candidate.kind === "number" &&
      candidate.section === "input" &&
      candidate.key === field,
  );
  if (declaration?.kind !== "number") {
    throw new Error(`Missing numeric input "${field}" on ${block.kind}`);
  }
  editData(id, (data) => declaration.commit(data, value));
}

function createAnimation(
  trackId: string = DEFAULT_TRACKS[1].id,
  start = 0,
  length = 4,
): string {
  useExperimentStore.getState().create(trackId, "animation", start, length);
  const blocks = useExperimentStore.getState().blocks;
  return blocks[blocks.length - 1].id;
}

function animationBlock(id: string): Placement<MediaData> {
  const block = blockById(id);
  if (block === undefined) {
    throw new Error(`animation ${id} not found`);
  }
  return block as Placement<MediaData>;
}

type PhaseSnapshot = readonly {
  readonly index: number;
  readonly offset: number;
  readonly length: number;
}[];

function commitBoundaryGesture(
  id: string,
  index: number,
  delta: number,
  context?: TimelineGestureContext,
): readonly PhaseSnapshot[] {
  const definition = blockDefinition("animation");
  const gestureFactory = definition.timelineGesture;
  if (gestureFactory === undefined) {
    throw new Error("animation definition has no timeline gesture");
  }
  const block = animationBlock(id);
  const gesture = gestureFactory(
    block,
    { kind: "boundary", index },
    useExperimentStore.getState().gridColumns,
    context,
  );
  const edit = gesture(delta, { start: block.start, length: block.length });
  const snapshots: PhaseSnapshot[] = [];
  const unsubscribe = useExperimentStore.subscribe((state) => {
    const current = state.blocks.find((candidate) => candidate.id === id);
    if (current !== undefined) {
      snapshots.push(definition.phases?.(current.data, current.length) ?? []);
    }
  });
  try {
    const applied = useExperimentStore
      .getState()
      .setSpan(id, edit.start, edit.length, edit.update);
    if (!applied) {
      throw new Error("animation boundary gesture was rejected");
    }
  } finally {
    unsubscribe();
  }
  return snapshots;
}

function animationSnapshot(id: string): Placement<MediaData> {
  const block = animationBlock(id);
  return { ...block, data: { ...block.data } };
}

function slotById(id: string) {
  const slot = useExperimentStore
    .getState()
    .slots.find((candidate) => candidate.id === id);
  if (slot === undefined) {
    throw new Error(`slot ${id} not found`);
  }
  return slot;
}

describe("slot creation", () => {
  it("appends an empty shared slot", () => {
    useExperimentStore.getState().addSlot(null);

    const slots = useExperimentStore.getState().slots;
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ trackId: null, initializations: [] });
  });

  it("appends an empty slot to an existing track", () => {
    useExperimentStore.getState().addSlot(DEFAULT_TRACKS[0].id);

    const slots = useExperimentStore.getState().slots;
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      trackId: DEFAULT_TRACKS[0].id,
      initializations: [],
    });
  });

  it("appends distinct slots for repeated requests", () => {
    useExperimentStore.getState().addSlot(null);
    useExperimentStore.getState().addSlot(null);
    useExperimentStore.getState().addSlot(DEFAULT_TRACKS[2].id);

    const slots = useExperimentStore.getState().slots;
    expect(slots).toHaveLength(3);
    expect(new Set(slots.map((slot) => slot.id)).size).toBe(3);
    expect(slots.map((slot) => slot.initializations)).toEqual([[], [], []]);
  });
});

describe("slot initialization", () => {
  it("adds an initialization to a slot", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 3, [], 10);

    expect(slotById(slotId).initializations).toEqual([{ boundary: 3, path: [], value: 10 }]);
  });

  it("accepts initialization at logical time zero", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 0, [], 5);

    expect(slotById(slotId).initializations).toEqual([{ boundary: 0, path: [], value: 5 }]);
  });

  it("accepts an initialization value of zero", () => {
    const slotId = addSlot(DEFAULT_TRACKS[0].id);

    useExperimentStore.getState().initializeSlot(slotId, 2, [], 0);

    expect(slotById(slotId).initializations).toEqual([{ boundary: 2, path: [], value: 0 }]);
  });

  it("permits editing the value at the same initialization time", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 2, [], 5);
    useExperimentStore.getState().initializeSlot(slotId, 2, [], 9);

    expect(slotById(slotId).initializations).toEqual([{ boundary: 2, path: [], value: 9 }]);
  });

  it("stores initializations at multiple times in time order", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 2, [], 9);
    useExperimentStore.getState().initializeSlot(slotId, 1, [], 5);

    expect(slotById(slotId).initializations).toEqual([
      { boundary: 1, path: [], value: 5 },
      { boundary: 2, path: [], value: 9 },
    ]);
  });

  it("replaces one time without disturbing the other times", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 0, [], 1);
    useExperimentStore.getState().initializeSlot(slotId, 5, [], 9);
    useExperimentStore.getState().initializeSlot(slotId, 0, [], 3);

    expect(slotById(slotId).initializations).toEqual([
      { boundary: 0, path: [], value: 3 },
      { boundary: 5, path: [], value: 9 },
    ]);
  });

  it("rejects initialization at a negative time", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, -1, [], 5);

    expect(slotById(slotId).initializations).toEqual([]);
  });

  it("rejects initialization at a fractional time", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 1.5, [], 5);

    expect(slotById(slotId).initializations).toEqual([]);
  });

  it("initializes only the requested slot", () => {
    const first = addSlot(null);
    const second = addSlot(null);

    useExperimentStore.getState().initializeSlot(first, 0, [], 7);

    expect(slotById(first).initializations).toEqual([{ boundary: 0, path: [], value: 7 }]);
    expect(slotById(second).initializations).toEqual([]);
  });
});

describe("rectangle slot selection", () => {
  it("stores a binding for every rectangle field", () => {
    const rectangleId = createRectangle();
    const slotId = addSlot(null);

    for (const field of ["x", "y", "w", "h"] as const) {
      useExperimentStore.getState().setSlotBinding(rectangleId, field, slotId);
    }

    expect(rectangle(rectangleId).slotBindings).toEqual({
      x: slotId,
      y: slotId,
      w: slotId,
      h: slotId,
    });
  });

  it("binds a local slot on the rectangle's track", () => {
    const rectangleId = createRectangle(DEFAULT_TRACKS[1].id);
    const slotId = addSlot(DEFAULT_TRACKS[1].id);

    useExperimentStore.getState().setSlotBinding(rectangleId, "x", slotId);

    expect(rectangle(rectangleId).slotBindings?.x).toBe(slotId);
  });

  it("binds a shared slot regardless of the rectangle's track", () => {
    const rectangleId = createRectangle(DEFAULT_TRACKS[2].id);
    const slotId = addSlot(null);

    useExperimentStore.getState().setSlotBinding(rectangleId, "h", slotId);

    expect(rectangle(rectangleId).slotBindings?.h).toBe(slotId);
  });

  it("rejects a local slot from another track", () => {
    const rectangleId = createRectangle(DEFAULT_TRACKS[1].id);
    const slotId = addSlot(DEFAULT_TRACKS[2].id);

    useExperimentStore.getState().setSlotBinding(rectangleId, "x", slotId);

    expect(rectangle(rectangleId).slotBindings?.x).toBeUndefined();
  });

  it("rejects a nonexistent slot", () => {
    const rectangleId = createRectangle();

    useExperimentStore.getState().setSlotBinding(rectangleId, "y", "missing");

    expect(rectangle(rectangleId).slotBindings?.y).toBeUndefined();
  });
  it("rejects a property key the block kind does not expose", () => {
    const rectangleId = createRectangle();
    const slotId = addSlot(null);

    useExperimentStore.getState().setSlotBinding(rectangleId, "z", slotId);

    expect(rectangle(rectangleId).slotBindings).toBeUndefined();
  });

  it("rejects a slot binding on a kind without slot-capable properties", () => {
    useExperimentStore.getState().create(DEFAULT_TRACKS[2].id, "camera", 0, 1);
    const cameraId = useExperimentStore.getState().blocks[0].id;
    const slotId = addSlot(null);

    useExperimentStore.getState().setSlotBinding(cameraId, "x", slotId);

    const camera = useExperimentStore
      .getState()
      .blocks.find((block) => block.id === cameraId);
    expect(camera?.slotBindings).toBeUndefined();
  });

  it("unbinds only the requested property", () => {
    const rectangleId = createRectangle();
    const first = addSlot(null);
    const second = addSlot(null);
    useExperimentStore.getState().setSlotBinding(rectangleId, "x", first);
    useExperimentStore.getState().setSlotBinding(rectangleId, "y", second);

    useExperimentStore.getState().setSlotBinding(rectangleId, "x", null);

    expect(rectangle(rectangleId).slotBindings).toEqual({ y: second });
  });

  it("switches a field back to its previous immediate number", () => {
    const rectangleId = createRectangle();
    setRectValue(rectangleId, "x", 4);
    const slotId = addSlot(null);

    useExperimentStore.getState().setSlotBinding(rectangleId, "x", slotId);
    expect(rectangle(rectangleId).x).toBe(4);
    expect(rectangle(rectangleId).slotBindings?.x).toBe(slotId);

    useExperimentStore.getState().setSlotBinding(rectangleId, "x", null);

    expect(rectangle(rectangleId).x).toBe(4);
    expect(rectangle(rectangleId).slotBindings?.x).toBeUndefined();
  });

  it("leaves slot values unchanged when the rectangle unit changes", () => {
    const rectangleId = createRectangle();
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 0, [], 3);
    useExperimentStore.getState().setSlotBinding(rectangleId, "x", slotId);

    setRectUnit(rectangleId, "pixels", 20);

    expect(slotById(slotId).initializations).toEqual([{ boundary: 0, path: [], value: 3 }]);
    expect(rectangle(rectangleId).slotBindings?.x).toBe(slotId);
    expect(rectangle(rectangleId).rectUnit).toBe("pixels");
  });
});

describe("slot renaming", () => {
  it("stores a configured name on the slot", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().renameSlot(slotId, "Speed");

    expect(slotById(slotId).name).toBe("Speed");
  });

  it("keeps the slot identity and initializations when renaming", () => {
    const slotId = addSlot(DEFAULT_TRACKS[0].id);
    useExperimentStore.getState().initializeSlot(slotId, 2, [], 4);

    useExperimentStore.getState().renameSlot(slotId, "Health");

    expect(slotById(slotId)).toMatchObject({
      id: slotId,
      trackId: DEFAULT_TRACKS[0].id,
      initializations: [{ boundary: 2, path: [], value: 4 }],
      name: "Health",
    });
  });

  it("renames only the requested slot", () => {
    const renamed = addSlot(null);
    const untouched = addSlot(DEFAULT_TRACKS[0].id);

    useExperimentStore.getState().renameSlot(renamed, "Speed");

    expect(slotById(renamed).name).toBe("Speed");
    expect(slotById(untouched).name).toBeUndefined();
  });
});

describe("slot removal", () => {
  it("removes the requested slot and keeps the others", () => {
    const removed = addSlot(null);
    const kept = addSlot(DEFAULT_TRACKS[0].id);
    useExperimentStore.getState().renameSlot(kept, "Kept");
    useExperimentStore.getState().initializeSlot(kept, 1, [], 6);

    useExperimentStore.getState().removeSlot(removed);

    const slots = useExperimentStore.getState().slots;
    expect(slots.map((slot) => slot.id)).toEqual([kept]);
    expect(slots[0]).toMatchObject({
      name: "Kept",
      initializations: [{ boundary: 1, path: [], value: 6 }],
    });
  });

  it("preserves a rectangle binding to the removed slot", () => {
    const rectangleId = createRectangle(DEFAULT_TRACKS[1].id);
    const slotId = addSlot(DEFAULT_TRACKS[1].id);
    useExperimentStore.getState().initializeSlot(slotId, 0, [], 3);
    useExperimentStore.getState().setSlotBinding(rectangleId, "x", slotId);

    useExperimentStore.getState().removeSlot(slotId);

    expect(useExperimentStore.getState().slots).toHaveLength(0);
    expect(rectangle(rectangleId).slotBindings?.x).toBe(slotId);
  });

  it("rejects reads of a removed slot through established validation", () => {
    const rectangleId = createRectangle(DEFAULT_TRACKS[1].id);
    const slotId = addSlot(DEFAULT_TRACKS[1].id);
    useExperimentStore.getState().initializeSlot(slotId, 0, [], 3);
    useExperimentStore.getState().setSlotBinding(rectangleId, "x", slotId);

    useExperimentStore.getState().removeSlot(slotId);

    const { slots, blocks } = useExperimentStore.getState();
    expect(validateNumericSlotReads(slots, slotReads(blocks))).toEqual([
      { slotId, trackId: DEFAULT_TRACKS[1].id, time: 0 },
    ]);
  });
});

describe("slot initialization clearing", () => {
  it("clears the requested initialization time", () => {
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 3, [], 10);

    useExperimentStore.getState().clearSlotInitialization(slotId, 3, []);

    expect(slotById(slotId).initializations).toEqual([]);
  });

  it("leaves the other initialization times intact", () => {
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 1, [], 5);
    useExperimentStore.getState().initializeSlot(slotId, 4, [], 9);

    useExperimentStore.getState().clearSlotInitialization(slotId, 1, []);

    expect(slotById(slotId).initializations).toEqual([{ boundary: 4, path: [], value: 9 }]);
  });

  it("leaves other slots unchanged", () => {
    const cleared = addSlot(DEFAULT_TRACKS[0].id);
    const kept = addSlot(null);
    useExperimentStore.getState().initializeSlot(cleared, 1, [], 2);
    useExperimentStore.getState().initializeSlot(kept, 4, [], 8);

    useExperimentStore.getState().clearSlotInitialization(cleared, 1, []);

    expect(slotById(cleared).initializations).toEqual([]);
    expect(slotById(kept).initializations).toEqual([{ boundary: 4, path: [], value: 8 }]);
  });

  it("makes an existing rectangle read invalid when no earlier value remains", () => {
    const rectangleId = createRectangle();
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 0, [], 3);
    useExperimentStore.getState().setSlotBinding(rectangleId, "x", slotId);
    const before = useExperimentStore.getState();
    expect(
      validateNumericSlotReads(before.slots, slotReads(before.blocks)),
    ).toEqual([]);

    useExperimentStore.getState().clearSlotInitialization(slotId, 0, []);

    const after = useExperimentStore.getState();
    expect(
      validateNumericSlotReads(after.slots, slotReads(after.blocks)),
    ).toEqual([{ slotId, trackId: DEFAULT_TRACKS[1].id, time: 0 }]);
  });

  it("allows the slot to be initialized again", () => {
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 1, [], 5);

    useExperimentStore.getState().clearSlotInitialization(slotId, 1, []);
    useExperimentStore.getState().initializeSlot(slotId, 4, [], 9);

    expect(slotById(slotId).initializations).toEqual([{ boundary: 4, path: [], value: 9 }]);
  });
});

describe("track editing", () => {
  it("assigns a color to a newly appended track", () => {
    useExperimentStore.getState().addTrack();

    const tracks = useExperimentStore.getState().tracks;
    expect(TRACK_COLORS).toContain(tracks[tracks.length - 1].color);
  });

  it("inserts a new track directly after the requested track", () => {
    const [first, second] = useExperimentStore.getState().tracks;

    useExperimentStore.getState().addTrackAfter(first.id);

    const tracks = useExperimentStore.getState().tracks;
    expect(tracks).toHaveLength(4);
    expect(tracks[0].id).toBe(first.id);
    expect(tracks[2].id).toBe(second.id);
    expect(tracks[1].id).not.toBe(first.id);
    expect(tracks[1].id).not.toBe(second.id);
  });

  it("renames only the requested track", () => {
    const [first, second] = useExperimentStore.getState().tracks;

    useExperimentStore.getState().renameTrack(first.id, "  Intro  ");

    const tracks = useExperimentStore.getState().tracks;
    expect(tracks[0].label).toBe("Intro");
    expect(tracks[1].label).toBe(second.label);
  });

  it("keeps the existing label when the new name is blank", () => {
    const [first] = useExperimentStore.getState().tracks;

    useExperimentStore.getState().renameTrack(first.id, "   ");

    expect(useExperimentStore.getState().tracks[0].label).toBe(first.label);
  });

  it("changes only the requested track color", () => {
    const [first, second] = useExperimentStore.getState().tracks;

    useExperimentStore.getState().setTrackColor(first.id, "#db2777");

    const tracks = useExperimentStore.getState().tracks;
    expect(tracks[0].color).toBe("#db2777");
    expect(tracks[1].color).toBe(second.color);
  });

  it("inserts a duplicate directly after the source track", () => {
    const [first, second] = useExperimentStore.getState().tracks;

    useExperimentStore.getState().duplicateTrack(first.id);

    const tracks = useExperimentStore.getState().tracks;
    expect(tracks).toHaveLength(4);
    expect(tracks[0].id).toBe(first.id);
    expect(tracks[2].id).toBe(second.id);
    expect(tracks[1].id).not.toBe(first.id);
    expect(tracks[1].label).toBe(`${first.label} copy`);
    expect(tracks[1].color).toBe(first.color);
  });

  it("duplicates the track's blocks with new identities", () => {
    const trackId = DEFAULT_TRACKS[1].id;
    const sourceId = createRectangle(trackId, 2);

    useExperimentStore.getState().duplicateTrack(trackId);

    const state = useExperimentStore.getState();
    const copyTrack = state.tracks[state.tracks.findIndex((t) => t.id === trackId) + 1];
    expect(state.blocks).toHaveLength(2);
    const copy = state.blocks.find((block) => block.id !== sourceId)!;
    expect(copy.id).not.toBe(sourceId);
    expect(copy.trackId).toBe(copyTrack.id);
    expect(copy.start).toBe(2);
    expect(copy.kind).toBe("rectangle");
  });

  it("duplicates track-local slots and re-points duplicated bindings", () => {
    const trackId = DEFAULT_TRACKS[1].id;
    const slotId = addSlot(trackId);
    useExperimentStore.getState().initializeSlot(slotId, 0, [], 7);
    const rectangleId = createRectangle(trackId, 0);
    useExperimentStore.getState().setSlotBinding(rectangleId, "x", slotId);

    useExperimentStore.getState().duplicateTrack(trackId);

    const state = useExperimentStore.getState();
    const copyTrack = state.tracks[state.tracks.findIndex((t) => t.id === trackId) + 1];
    const copySlot = state.slots.find((slot) => slot.trackId === copyTrack.id)!;
    expect(copySlot).toBeDefined();
    expect(copySlot.id).not.toBe(slotId);
    expect(copySlot.initializations).toEqual([{ boundary: 0, path: [], value: 7 }]);
    const copyBlock = state.blocks.find((block) => block.trackId === copyTrack.id)!;
    expect(copyBlock.slotBindings).toEqual({ x: copySlot.id });
    const sourceBlock = state.blocks.find((block) => block.id === rectangleId)!;
    expect(sourceBlock.slotBindings).toEqual({ x: slotId });
  });

  it("keeps shared-slot bindings pointing at the shared slot when duplicating", () => {
    const trackId = DEFAULT_TRACKS[1].id;
    const sharedId = addSlot(null);
    useExperimentStore.getState().initializeSlot(sharedId, 0, [], 4);
    const rectangleId = createRectangle(trackId, 0);
    useExperimentStore.getState().setSlotBinding(rectangleId, "y", sharedId);

    useExperimentStore.getState().duplicateTrack(trackId);

    const state = useExperimentStore.getState();
    const copyTrack = state.tracks[state.tracks.findIndex((t) => t.id === trackId) + 1];
    const copyBlock = state.blocks.find((block) => block.trackId === copyTrack.id)!;
    expect(copyBlock.slotBindings).toEqual({ y: sharedId });
    expect(state.slots).toHaveLength(1);
  });

  it("does not copy blocks from other tracks", () => {
    createRectangle(DEFAULT_TRACKS[0].id, 0);

    useExperimentStore.getState().duplicateTrack(DEFAULT_TRACKS[1].id);

    expect(useExperimentStore.getState().blocks).toHaveLength(1);
  });
});

describe("track removal", () => {
  it("removes the requested track and keeps the others", () => {
    const [first, second] = useExperimentStore.getState().tracks;

    useExperimentStore.getState().removeTrack(first.id);

    const tracks = useExperimentStore.getState().tracks;
    expect(tracks.map((track) => track.id)).toEqual(
      DEFAULT_TRACKS.slice(1).map((track) => track.id),
    );
    expect(tracks[0].id).toBe(second.id);
  });

  it("removes the track's blocks and track-local slots", () => {
    const trackId = DEFAULT_TRACKS[1].id;
    createRectangle(trackId, 0);
    addSlot(trackId);
    const sharedId = addSlot(null);

    useExperimentStore.getState().removeTrack(trackId);

    const state = useExperimentStore.getState();
    expect(state.blocks).toEqual([]);
    expect(state.slots.map((slot) => slot.id)).toEqual([sharedId]);
  });

  it("clears the selection when the selected block was on the removed track", () => {
    const trackId = DEFAULT_TRACKS[1].id;
    const rectangleId = createRectangle(trackId, 0);
    useExperimentStore.getState().select(rectangleId);

    useExperimentStore.getState().removeTrack(trackId);

    expect(useExperimentStore.getState().selectedId).toBeNull();
  });

  it("keeps the selection when the selected block is on another track", () => {
    const rectangleId = createRectangle(DEFAULT_TRACKS[0].id, 0);
    useExperimentStore.getState().select(rectangleId);

    useExperimentStore.getState().removeTrack(DEFAULT_TRACKS[1].id);

    expect(useExperimentStore.getState().selectedId).toBe(rectangleId);
  });
});

describe("rectangle color", () => {
  it("creates rectangles with the default rgb color", () => {
    const rectangleId = createRectangle();

    expect(rectangle(rectangleId).color).toEqual(DEFAULT_RECT_COLOR);
  });

  it("stores an rgb color", () => {
    const rectangleId = createRectangle();

    setRectColor(rectangleId, [12, 34, 56]);

    expect(rectangle(rectangleId).color).toEqual([12, 34, 56]);
  });

  it("clamps each channel into 0-255 and rounds it", () => {
    const rectangleId = createRectangle();

    setRectColor(rectangleId, [300, -5, 12.6]);

    expect(rectangle(rectangleId).color).toEqual([255, 0, 13]);
  });

  it("rejects a color with a non-finite channel", () => {
    const rectangleId = createRectangle();

    setRectColor(rectangleId, [Number.NaN, 10, 20]);

    expect(rectangle(rectangleId).color).toEqual(DEFAULT_RECT_COLOR);
  });

});

describe("addition blocks", () => {
  it("creates an addition with zero immediate inputs and no output binding", () => {
    const id = createAddition();
    const block = useExperimentStore
      .getState()
      .blocks.find((candidate) => candidate.id === id)!;

    expect(block.kind).toBe("addition");
    const data = block.data as AdditionData;
    expect(data.inputA).toBe(0);
    expect(data.inputB).toBe(0);
    expect(block.slotBindings).toBeUndefined();
  });

  it("creates an addition without duration data", () => {
    const id = createAddition();
    const block = useExperimentStore
      .getState()
      .blocks.find((candidate) => candidate.id === id)!;
    const data = block.data as Record<string, unknown>;
    expect("duration" in data).toBe(false);
    expect("durationUnit" in data).toBe(false);
    expect("syncBeatsToCellSpan" in data).toBe(false);
  });

  it("stores immediate inputs", () => {
    const id = createAddition();

    setAdditionInput(id, "a", 4);
    setAdditionInput(id, "b", 7);

    const block = useExperimentStore
      .getState()
      .blocks.find((candidate) => candidate.id === id)!;
    const data = block.data as AdditionData;
    expect(data.inputA).toBe(4);
    expect(data.inputB).toBe(7);
  });

  it("binds the output slot like an input property", () => {
    const trackId = DEFAULT_TRACKS[1].id;
    const slotId = addSlot(trackId);
    const id = createAddition(trackId);

    useExperimentStore.getState().setSlotBinding(id, "out", slotId);

    const block = useExperimentStore
      .getState()
      .blocks.find((candidate) => candidate.id === id)!;
    expect(block.slotBindings).toEqual({ out: slotId });
  });

  it("rejects an output binding to another track's local slot", () => {
    const foreignSlot = addSlot(DEFAULT_TRACKS[0].id);
    const id = createAddition(DEFAULT_TRACKS[1].id);

    useExperimentStore.getState().setSlotBinding(id, "out", foreignSlot);

    const block = useExperimentStore
      .getState()
      .blocks.find((candidate) => candidate.id === id)!;
    expect(block.slotBindings).toBeUndefined();
  });
});

describe("media fade boundary gestures", () => {
  it("commits a shared 2/2 boundary as 3/1 in one update", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 4);
    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 2, fadeOut: 2 }));

    const snapshots = commitBoundaryGesture(id, 0, 1);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual([
      { index: 0, offset: 0, length: 3 },
      { index: 1, offset: 3, length: 1 },
    ]);
    expect(animationBlock(id).data).toMatchObject({ fadeIn: 3, fadeOut: 1 });
  });

  it("commits a shared 2/2 boundary as 1/3 in one update", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 4);
    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 2, fadeOut: 2 }));

    const snapshots = commitBoundaryGesture(id, 0, -1);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual([
      { index: 0, offset: 0, length: 1 },
      { index: 1, offset: 1, length: 3 },
    ]);
    expect(animationBlock(id).data).toMatchObject({ fadeIn: 1, fadeOut: 3 });
  });

  it("commits a fade-in boundary containing a zero fade in one update", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 4);
    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 1, fadeOut: 2 }));

    const snapshots = commitBoundaryGesture(id, 0, -1);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual([
      { index: 0, offset: 0, length: 2 },
      { index: 1, offset: 2, length: 2 },
    ]);
    expect(animationBlock(id).data).toMatchObject({ fadeIn: 0, fadeOut: 2 });
  });
});

describe("media fade gesture snapping", () => {
  function addContainedLoop(start: number, end: number): void {
    useExperimentStore.getState().addLoopAtCell(start);
    const loopId = useExperimentStore.getState().loops[0].id;
    useExperimentStore.getState().setLoopBoundary(loopId, "end", end);
  }

  it("applies a snapped fade-in boundary through the registered gesture and store transaction", () => {
    addContainedLoop(2, 6);
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    editData(id, (data) => ({
      ...(data as MediaData),
      fadeIn: 6,
      fadeOut: 0,
    }));
    const loops = allLoops(useExperimentStore.getState().loops);

    const snapshots = commitBoundaryGesture(id, 0, -2, { loops });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual([
      { index: 0, offset: 0, length: 2 },
      { index: 1, offset: 2, length: 6 },
    ]);
    expect(animationBlock(id).data).toMatchObject({ fadeIn: 2, fadeOut: 0 });
  });
});

describe("media span transactions", () => {
  it("updates synced geometry, duration and clamped fades", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 6);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 6,
      syncBeatsToCellSpan: true,
      fadeIn: 3,
      fadeOut: 3,
    }));

    const applied = useExperimentStore.getState().setSpan(id, 2, 4);

    expect(applied).toBe(true);
    const block = animationBlock(id);
    expect(block.start).toBe(2);
    expect(block.length).toBe(4);
    expect(block.data).toMatchObject({
      duration: 4,
      syncBeatsToCellSpan: true,
      fadeIn: 2,
      fadeOut: 2,
    });
    expect(
      blockDefinition("animation").phases?.(block.data, block.length),
    ).toEqual([
      { index: 0, offset: 0, length: 2 },
      { index: 1, offset: 2, length: 2 },
    ]);
  });

  it("keeps the whole placement when the span would overlap another block", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 4);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 4,
      fadeIn: 1,
      fadeOut: 1,
    }));
    const before = animationSnapshot(id);
    createAnimation(DEFAULT_TRACKS[1].id, 6, 2);

    const applied = useExperimentStore.getState().setSpan(id, 4, 4);

    expect(applied).toBe(false);
    expect(blockById(id)).toEqual(before);
  });

  it("keeps the whole placement when the span would cut a loop", () => {
    const id = createAnimation(DEFAULT_TRACKS[2].id, 1, 2);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 2,
      fadeIn: 1,
      fadeOut: 1,
    }));
    useExperimentStore.getState().addLoopAtCell(0);
    const loopId = useExperimentStore.getState().loops[0].id;
    useExperimentStore.getState().setLoopBoundary(loopId, "end", 4);
    const before = animationSnapshot(id);

    const applied = useExperimentStore.getState().setSpan(id, 3, 2);

    expect(applied).toBe(false);
    expect(blockById(id)).toEqual(before);
  });
});

describe("transactional span and data edits", () => {
  it("applies the data callback after length-change processing", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 6);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 6,
      syncBeatsToCellSpan: true,
      fadeIn: 3,
      fadeOut: 3,
    }));
    const received: MediaData[] = [];

    const applied = useExperimentStore.getState().setSpan(id, 2, 4, (data) => {
      received.push({ ...(data as MediaData) });
      return { ...(data as MediaData), fadeIn: 1, fadeOut: 3 };
    });

    expect(applied).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      duration: 4,
      fadeIn: 2,
      fadeOut: 2,
    });
    const block = animationBlock(id);
    expect(block.start).toBe(2);
    expect(block.length).toBe(4);
    expect(block.data).toMatchObject({
      duration: 4,
      syncBeatsToCellSpan: true,
      fadeIn: 1,
      fadeOut: 3,
    });
  });

  it("applies neither callback nor geometry when the span overlaps another block", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 4);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 4,
      fadeIn: 1,
      fadeOut: 1,
    }));
    const before = animationSnapshot(id);
    createAnimation(DEFAULT_TRACKS[1].id, 6, 2);
    let called = false;

    const applied = useExperimentStore.getState().setSpan(id, 4, 4, (data) => {
      called = true;
      return data;
    });

    expect(applied).toBe(false);
    expect(called).toBe(false);
    expect(blockById(id)).toEqual(before);
  });

  it("applies neither callback nor geometry when the span would cut a loop", () => {
    const id = createAnimation(DEFAULT_TRACKS[2].id, 1, 2);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 2,
      fadeIn: 1,
      fadeOut: 1,
    }));
    useExperimentStore.getState().addLoopAtCell(0);
    const loopId = useExperimentStore.getState().loops[0].id;
    useExperimentStore.getState().setLoopBoundary(loopId, "end", 4);
    const before = animationSnapshot(id);
    let called = false;

    const applied = useExperimentStore.getState().setSpan(id, 3, 2, (data) => {
      called = true;
      return data;
    });

    expect(applied).toBe(false);
    expect(called).toBe(false);
    expect(blockById(id)).toEqual(before);
  });

  it("keeps three-argument span operations working", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 6);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 6,
      syncBeatsToCellSpan: true,
      fadeIn: 3,
      fadeOut: 3,
    }));

    const applied = useExperimentStore.getState().setSpan(id, 2, 4);

    expect(applied).toBe(true);
    expect(animationBlock(id)).toMatchObject({
      start: 2,
      length: 4,
      data: {
        duration: 4,
        syncBeatsToCellSpan: true,
        fadeIn: 2,
        fadeOut: 2,
      },
    });
  });
});

describe("phase boundary validity", () => {
  function addLoop(start: number, end: number): string {
    useExperimentStore.getState().addLoopAtCell(start);
    const loops = useExperimentStore.getState().loops;
    const loop = loops[loops.length - 1];
    if (loop.end !== end) {
      useExperimentStore.getState().setLoopBoundary(loop.id, "end", end);
    }
    return loop.id;
  }

  function loopSnapshots() {
    return useExperimentStore.getState().loops.map((loop) => ({
      id: loop.id,
      start: loop.start,
      end: loop.end,
    }));
  }

  it("rejects a fade edit that puts a phase boundary strictly inside a contained loop", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    addLoop(2, 6);
    const before = animationSnapshot(id);

    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 4, fadeOut: 0 }));

    expect(blockById(id)).toEqual(before);
  });

  it("permits a phase boundary at the contained loop start", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    addLoop(2, 6);

    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 2, fadeOut: 0 }));

    expect(animationBlock(id).data).toMatchObject({ fadeIn: 2, fadeOut: 0 });
  });

  it("permits a phase boundary at the contained loop end", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    addLoop(2, 6);

    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 6, fadeOut: 0 }));

    expect(animationBlock(id).data).toMatchObject({ fadeIn: 6, fadeOut: 0 });
  });

  it("rejects a span callback that puts a phase boundary strictly inside a contained loop", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    addLoop(2, 6);
    const before = animationSnapshot(id);

    const applied = useExperimentStore.getState().setSpan(id, 1, 8, (data) => ({
      ...(data as MediaData),
      fadeIn: 4,
      fadeOut: 0,
    }));

    expect(applied).toBe(false);
    expect(blockById(id)).toEqual(before);
  });

  it("permits a span callback whose phase boundary coincides with the contained loop start", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    addLoop(2, 6);

    const applied = useExperimentStore.getState().setSpan(id, 0, 8, (data) => ({
      ...(data as MediaData),
      fadeIn: 2,
      fadeOut: 0,
    }));

    expect(applied).toBe(true);
    expect(animationBlock(id).data).toMatchObject({ fadeIn: 2, fadeOut: 0 });
  });

  it("permits a span callback whose phase boundary coincides with the contained loop end", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    addLoop(2, 6);

    const applied = useExperimentStore.getState().setSpan(id, 0, 8, (data) => ({
      ...(data as MediaData),
      fadeIn: 6,
      fadeOut: 0,
    }));

    expect(applied).toBe(true);
    expect(animationBlock(id).data).toMatchObject({ fadeIn: 6, fadeOut: 0 });
  });

  it("keeps a carried fade boundary at a contained loop edge through a media kind change", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    addLoop(2, 6);
    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 2, fadeOut: 0 }));

    useExperimentStore.getState().setBlockKind(id, "sound");

    const block = requiredBlock(id);
    expect(block.kind).toBe("sound");
    expect(block.data).toMatchObject({ fadeIn: 2, fadeOut: 0 });
  });

  it("rejects moving a phased block so a boundary falls strictly inside a loop it contains", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 4, fadeOut: 0 }));
    addLoop(10, 14);
    const before = animationSnapshot(id);

    useExperimentStore.getState().move(id, DEFAULT_TRACKS[1].id, 8);

    expect(blockById(id)).toEqual(before);
  });

  it("rejects resizing a phased block so a boundary falls strictly inside a loop it contains", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 8, 2);
    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 1, fadeOut: 1 }));
    addLoop(10, 14);
    const before = animationSnapshot(id);

    const applied = useExperimentStore.getState().resize(id, 6);

    expect(applied).toBe(false);
    expect(blockById(id)).toEqual(before);
  });

  it("rejects wrapping a phased block in a loop that would contain its boundary", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 4, fadeOut: 0 }));
    const before = loopSnapshots();

    useExperimentStore.getState().addLoopForBlock(id);

    expect(loopSnapshots()).toEqual(before);
  });

  it("rejects extending a contained loop over a phase boundary", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 4, fadeOut: 0 }));
    const loopId = addLoop(2, 3);
    const before = loopSnapshots();

    useExperimentStore.getState().setLoopBoundary(loopId, "end", 6);

    expect(loopSnapshots()).toEqual(before);
  });

  it("duplicates to the next free span that keeps a contained loop clear of phase boundaries", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 8);
    editData(id, (data) => ({ ...(data as MediaData), fadeIn: 4, fadeOut: 0 }));
    addLoop(8, 14);
    const sourceBefore = animationSnapshot(id);

    useExperimentStore.getState().duplicateBlock(id);

    const state = useExperimentStore.getState();
    expect(state.blocks).toHaveLength(2);
    const copy = state.blocks.find((block) => block.id !== id)!;
    expect(copy.start).toBe(14);
    expect(blockById(id)).toEqual(sourceBefore);
  });
});

describe("duration edits", () => {
  it("converts stored beats to seconds at 90 BPM", () => {
    useExperimentStore.getState().setBpm(90);
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 4);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 6,
      durationUnit: "beats",
      fadeIn: 1,
      fadeOut: 1,
    }));
    const block = animationBlock(id);

    editData(id, (data) =>
      editDuration(
        data as MediaData,
        { kind: "unit", unit: "seconds" },
        { length: block.length, bpm: useExperimentStore.getState().bpm },
      ),
    );

    expect(animationBlock(id).data).toMatchObject({
      duration: 4,
      durationUnit: "seconds",
      syncBeatsToCellSpan: false,
      fadeIn: 1,
      fadeOut: 1,
    });
  });

  it("converts stored seconds to beats at 90 BPM", () => {
    useExperimentStore.getState().setBpm(90);
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 4);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 4,
      durationUnit: "seconds",
      fadeIn: 2,
      fadeOut: 1,
    }));
    const block = animationBlock(id);

    editData(id, (data) =>
      editDuration(
        data as MediaData,
        { kind: "unit", unit: "beats" },
        { length: block.length, bpm: useExperimentStore.getState().bpm },
      ),
    );

    expect(animationBlock(id).data).toMatchObject({
      duration: 6,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
      fadeIn: 2,
      fadeOut: 1,
    });
  });

  it("leaves the stored value unchanged when the unit does not change", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 4);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 6,
      durationUnit: "seconds",
      fadeIn: 1,
      fadeOut: 2,
    }));
    const block = animationBlock(id);

    editData(id, (data) =>
      editDuration(
        data as MediaData,
        { kind: "unit", unit: "seconds" },
        { length: block.length, bpm: useExperimentStore.getState().bpm },
      ),
    );

    expect(animationBlock(id).data).toMatchObject({
      duration: 6,
      durationUnit: "seconds",
      syncBeatsToCellSpan: false,
      fadeIn: 1,
      fadeOut: 2,
    });
  });

  it("accepts a finite positive value and preserves unit and unrelated fields", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 4);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 1,
      durationUnit: "seconds",
      fadeIn: 2,
      fadeOut: 1,
    }));
    const block = animationBlock(id);

    editData(id, (data) =>
      editDuration(
        data as MediaData,
        { kind: "value", value: 2.5 },
        { length: block.length, bpm: useExperimentStore.getState().bpm },
      ),
    );

    expect(animationBlock(id).data).toMatchObject({
      duration: 2.5,
      durationUnit: "seconds",
      syncBeatsToCellSpan: false,
      fadeIn: 2,
      fadeOut: 1,
    });
  });

  it("rejects zero, negative and non-finite values", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 4);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 3,
      durationUnit: "seconds",
      fadeIn: 1,
      fadeOut: 1,
    }));
    const block = animationBlock(id);

    for (const value of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      editData(id, (data) =>
        editDuration(
          data as MediaData,
          { kind: "value", value },
          { length: block.length, bpm: useExperimentStore.getState().bpm },
        ),
      );
    }

    expect(animationBlock(id).data).toMatchObject({
      duration: 3,
      durationUnit: "seconds",
      syncBeatsToCellSpan: false,
      fadeIn: 1,
      fadeOut: 1,
    });
  });

  it("enables sync at the block length in beats", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 5);
    editData(id, (data) => ({
      ...(data as MediaData),
      duration: 2,
      durationUnit: "seconds",
      fadeIn: 2,
      fadeOut: 1,
    }));
    const block = animationBlock(id);

    editData(id, (data) =>
      editDuration(
        data as MediaData,
        { kind: "sync", enabled: true },
        { length: block.length, bpm: useExperimentStore.getState().bpm },
      ),
    );

    expect(animationBlock(id).data).toMatchObject({
      duration: 5,
      durationUnit: "beats",
      syncBeatsToCellSpan: true,
      fadeIn: 2,
      fadeOut: 1,
    });
  });

  it("blocks value and unit edits while synced", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 5);
    const block = animationBlock(id);
    editData(id, (data) =>
      editDuration(
        data as MediaData,
        { kind: "sync", enabled: true },
        { length: block.length, bpm: useExperimentStore.getState().bpm },
      ),
    );

    editData(id, (data) =>
      editDuration(
        data as MediaData,
        { kind: "value", value: 9 },
        { length: block.length, bpm: useExperimentStore.getState().bpm },
      ),
    );
    editData(id, (data) =>
      editDuration(
        data as MediaData,
        { kind: "unit", unit: "seconds" },
        { length: block.length, bpm: useExperimentStore.getState().bpm },
      ),
    );

    expect(animationBlock(id).data).toMatchObject({
      duration: 5,
      durationUnit: "beats",
      syncBeatsToCellSpan: true,
    });
  });

  it("retains the stored beats value when sync is disabled and accepts later edits", () => {
    const id = createAnimation(DEFAULT_TRACKS[1].id, 0, 4);
    const block = animationBlock(id);
    editData(id, (data) =>
      editDuration(
        data as MediaData,
        { kind: "sync", enabled: true },
        { length: block.length, bpm: useExperimentStore.getState().bpm },
      ),
    );

    editData(id, (data) =>
      editDuration(
        data as MediaData,
        { kind: "sync", enabled: false },
        { length: block.length, bpm: useExperimentStore.getState().bpm },
      ),
    );
    expect(animationBlock(id).data).toMatchObject({
      duration: 4,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
    });

    editData(id, (data) =>
      editDuration(
        data as MediaData,
        { kind: "value", value: 3 },
        { length: block.length, bpm: useExperimentStore.getState().bpm },
      ),
    );
    expect(animationBlock(id).data).toMatchObject({
      duration: 3,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
    });
  });
});

describe("block duplication", () => {
  const trackId = DEFAULT_TRACKS[1].id;

  function blockAt(index: number) {
    return useExperimentStore.getState().blocks[index];
  }

  it("places the copy right after the source block", () => {
    const sourceId = createRectangle(trackId, 2);

    useExperimentStore.getState().duplicateBlock(sourceId);

    const state = useExperimentStore.getState();
    expect(state.blocks).toHaveLength(2);
    const copy = state.blocks.find((block) => block.id !== sourceId)!;
    expect(copy.start).toBe(3);
    expect(copy.length).toBe(1);
    expect(copy.trackId).toBe(trackId);
  });

  it("copies the block properties and selects the copy", () => {
    const sourceId = createRectangle(trackId, 0);
    setDuration(sourceId, 3);
    setRectValue(sourceId, "w", 5);

    useExperimentStore.getState().duplicateBlock(sourceId);

    const state = useExperimentStore.getState();
    const copy = state.blocks.find((block) => block.id !== sourceId)!;
    expect(copy.kind).toBe("rectangle");
    expect(copy).toMatchObject({ data: { duration: 3, w: 5 } });
    expect(state.selectedId).toBe(copy.id);
  });

  it("uses the next free space when the position after the source is taken", () => {
    const sourceId = createRectangle(trackId, 0);
    createAddition(trackId, 1);

    useExperimentStore.getState().duplicateBlock(sourceId);

    const blocks = useExperimentStore.getState().blocks;
    const copy = blocks[blocks.length - 1];
    expect(copy.id).not.toBe(sourceId);
    expect(copy.start).toBe(2);
  });

  it("keeps slot bindings on the same track", () => {
    const slotId = addSlot(trackId);
    const rectangleId = createRectangle(trackId, 0);
    useExperimentStore.getState().setSlotBinding(rectangleId, "x", slotId);

    useExperimentStore.getState().duplicateBlock(rectangleId);

    const copy = useExperimentStore
      .getState()
      .blocks.find((block) => block.id !== rectangleId)!;
    expect(copy.slotBindings).toEqual({ x: slotId });
  });

  it("does nothing for an unknown block", () => {
    createRectangle(trackId, 0);

    useExperimentStore.getState().duplicateBlock("missing");

    expect(useExperimentStore.getState().blocks).toHaveLength(1);
    expect(useExperimentStore.getState().selectedId).not.toBe("missing");
  });

  it("lets the copy be selected independently of the source", () => {
    const sourceId = createRectangle(trackId, 0);
    useExperimentStore.getState().duplicateBlock(sourceId);
    const copyId = useExperimentStore.getState().selectedId!;

    setDuration(copyId, 4);

    const blocks = useExperimentStore.getState().blocks;
    expect(blocks.find((block) => block.id === copyId)).toMatchObject({
      data: { duration: 4 },
    });
    expect(blocks.find((block) => block.id === sourceId)).toMatchObject({
      data: { duration: 1 },
    });
    expect(blockAt(0).id).toBe(sourceId);
  });
});

describe("loop markers", () => {
  function createBlock(
    trackId: string = DEFAULT_TRACKS[0].id,
    start = 0,
    length = 1,
  ): string {
    useExperimentStore.getState().create(trackId, "dialogue", start, length);
    const blocks = useExperimentStore.getState().blocks;
    return blocks[blocks.length - 1].id;
  }

  function loops() {
    return useExperimentStore.getState().loops;
  }

  function loopSpans(nodes = loops()): number[][] {
    return nodes.map((node) => [node.start, node.end]);
  }

  function firstLoopId(): string {
    return loops()[0].id;
  }

  function blockAt(index: number) {
    return useExperimentStore.getState().blocks[index];
  }

  it("adds a loop around a block", () => {
    const id = createBlock(DEFAULT_TRACKS[1].id, 6, 2);
    useExperimentStore.getState().addLoopForBlock(id);
    expect(loopSpans()).toEqual([[6, 8]]);
  });

  it("adds a one-cell loop at an empty cell", () => {
    useExperimentStore.getState().addLoopAtCell(3);
    expect(loopSpans()).toEqual([[3, 4]]);
  });

  it("rejects an invalid cell", () => {
    useExperimentStore.getState().addLoopAtCell(-1);
    useExperimentStore.getState().addLoopAtCell(1.5);
    expect(loops()).toEqual([]);
  });

  it("expands a loop to include a block that would be cut", () => {
    const first = createBlock(DEFAULT_TRACKS[0].id, 3, 2);
    createBlock(DEFAULT_TRACKS[1].id, 4, 2);
    useExperimentStore.getState().addLoopForBlock(first);
    expect(loopSpans()).toEqual([[3, 6]]);
  });

  it("nests a loop created at a cell inside another loop", () => {
    useExperimentStore.getState().addLoopAtCell(0);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 8);
    useExperimentStore.getState().addLoopAtCell(4);
    expect(loopSpans()).toEqual([[0, 8]]);
    expect(loopSpans(loops()[0].children)).toEqual([[4, 5]]);
  });

  it("keeps disjoint loops as siblings in time order", () => {
    useExperimentStore.getState().addLoopAtCell(4);
    useExperimentStore.getState().addLoopAtCell(1);
    expect(loopSpans()).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });

  it("removes a loop and promotes its children", () => {
    useExperimentStore.getState().addLoopAtCell(0);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 8);
    const outerId = firstLoopId();
    useExperimentStore.getState().addLoopAtCell(3);
    const innerId = loops()[0].children[0].id;
    useExperimentStore.getState().removeLoop(outerId);
    expect(loops().map((node) => node.id)).toEqual([innerId]);
    expect(loopSpans()).toEqual([[3, 4]]);
  });

  it("removes nothing for an unknown loop", () => {
    useExperimentStore.getState().addLoopAtCell(2);
    useExperimentStore.getState().removeLoop("missing");
    expect(loopSpans()).toEqual([[2, 3]]);
  });

  it("moves a loop boundary", () => {
    useExperimentStore.getState().addLoopAtCell(0);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 6);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "start", 2);
    expect(loopSpans()).toEqual([[2, 6]]);
  });

  it("absorbs a sibling loop when a boundary expands over it", () => {
    useExperimentStore.getState().addLoopAtCell(0);
    useExperimentStore.getState().addLoopAtCell(4);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 5);
    expect(loopSpans()).toEqual([[0, 5]]);
    expect(loopSpans(loops()[0].children)).toEqual([[4, 5]]);
  });

  it("keeps touching sibling loops as siblings", () => {
    useExperimentStore.getState().addLoopAtCell(0);
    useExperimentStore.getState().addLoopAtCell(4);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 4);
    expect(loopSpans()).toEqual([
      [0, 4],
      [4, 5],
    ]);
  });

  it("rejects invalid or inverted boundaries", () => {
    useExperimentStore.getState().addLoopAtCell(0);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 4);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "start", 1.5);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "start", -1);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "start", 4);
    expect(loopSpans()).toEqual([[0, 4]]);
  });

  it("rejects a boundary move that would cut a block", () => {
    const id = createBlock(DEFAULT_TRACKS[0].id, 3, 2);
    useExperimentStore.getState().addLoopForBlock(id);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 8);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "start", 4);
    expect(loopSpans()).toEqual([[3, 8]]);
  });

  it("releases a child loop when the boundary shrinks past it", () => {
    useExperimentStore.getState().addLoopAtCell(0);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 10);
    useExperimentStore.getState().addLoopAtCell(4);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "start", 5);
    expect(loopSpans()).toEqual([
      [4, 5],
      [5, 10],
    ]);
  });

  it("rejects creating a block that cuts any loop boundary", () => {
    useExperimentStore.getState().addLoopAtCell(0);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 8);
    useExperimentStore.getState().addLoopAtCell(2);
    const innerId = loops()[0].children[0].id;
    useExperimentStore.getState().setLoopBoundary(innerId, "end", 4);
    useExperimentStore
      .getState()
      .create(DEFAULT_TRACKS[0].id, "dialogue", 1, 2);
    expect(useExperimentStore.getState().blocks).toHaveLength(0);
  });

  it("allows creating a block inside or containing a loop", () => {
    useExperimentStore.getState().addLoopAtCell(2);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 6);
    createBlock(DEFAULT_TRACKS[1].id, 3, 1);
    createBlock(DEFAULT_TRACKS[0].id, 0, 10);
    expect(useExperimentStore.getState().blocks).toHaveLength(2);
  });

  it("rejects moving a block across a loop boundary", () => {
    useExperimentStore.getState().addLoopAtCell(0);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 4);
    const id = createBlock(DEFAULT_TRACKS[0].id, 8, 3);
    useExperimentStore.getState().move(id, DEFAULT_TRACKS[0].id, 2);
    expect(blockAt(0).start).toBe(8);
  });

  it("rejects resizing a block across a loop boundary", () => {
    useExperimentStore.getState().addLoopAtCell(0);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 4);
    const id = createBlock(DEFAULT_TRACKS[0].id, 3, 1);
    useExperimentStore.getState().resize(id, 3);
    expect(blockAt(0).length).toBe(1);
  });

  it("duplicates a block past a loop boundary it would cut", () => {
    const id = createBlock(DEFAULT_TRACKS[0].id, 0, 2);
    useExperimentStore.getState().addLoopAtCell(3);
    useExperimentStore.getState().setLoopBoundary(firstLoopId(), "end", 5);
    useExperimentStore.getState().duplicateBlock(id);
    expect(blockAt(1).start).toBe(3);
  });
});

describe("gap-keyed slot initializations", () => {
  function addLoopAt(start: number, end: number): string {
    useExperimentStore.getState().addLoopAtCell(start);
    const loop = useExperimentStore.getState().loops[0];
    if (loop.end !== end) {
      useExperimentStore.getState().setLoopBoundary(loop.id, "end", end);
    }
    return loop.id;
  }

  it("stores an initialization with its enclosing loop path", () => {
    const loopId = addLoopAt(0, 3);
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 0, [loopId], 4);

    expect(slotById(slotId).initializations).toEqual([
      { boundary: 0, path: [loopId], value: 4 },
    ]);
  });

  it("distinguishes gaps at the same boundary by path", () => {
    const loopId = addLoopAt(0, 3);
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 0, [], 1);
    useExperimentStore.getState().initializeSlot(slotId, 0, [loopId], 2);

    expect(slotById(slotId).initializations).toEqual([
      { boundary: 0, path: [], value: 1 },
      { boundary: 0, path: [loopId], value: 2 },
    ]);
  });

  it("rejects a path that is not a gap at the boundary", () => {
    const loopId = addLoopAt(2, 5);
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 2, [loopId], 4);

    expect(slotById(slotId).initializations).toEqual([
      { boundary: 2, path: [loopId], value: 4 },
    ]);
  });

  it("rejects a path that the boundary does not contain", () => {
    const loopId = addLoopAt(2, 5);
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 0, [loopId], 4);

    expect(slotById(slotId).initializations).toEqual([]);
  });

  it("clears only the initialization in the requested gap", () => {
    const loopId = addLoopAt(0, 3);
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 0, [], 1);
    useExperimentStore.getState().initializeSlot(slotId, 0, [loopId], 2);

    useExperimentStore.getState().clearSlotInitialization(slotId, 0, []);

    expect(slotById(slotId).initializations).toEqual([
      { boundary: 0, path: [loopId], value: 2 },
    ]);
  });

  it("keeps an initialization whose loop later shrinks away", () => {
    const loopId = addLoopAt(0, 5);
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 3, [loopId], 7);

    useExperimentStore.getState().setLoopBoundary(loopId, "end", 2);

    expect(slotById(slotId).initializations).toEqual([
      { boundary: 3, path: [loopId], value: 7 },
    ]);
  });
});

describe("block kind changes", () => {
  it("keeps only the slot bindings the target kind exposes", () => {
    const rectangleId = createRectangle(DEFAULT_TRACKS[1].id);
    const slotId = addSlot(null);
    useExperimentStore.getState().setSlotBinding(rectangleId, "x", slotId);
    useExperimentStore.getState().setSlotBinding(rectangleId, "y", slotId);

    useExperimentStore.getState().setBlockKind(rectangleId, "camera");

    const block = blockById(rectangleId)!;
    expect(block.kind).toBe("camera");
    expect(block.slotBindings).toBeUndefined();
  });

  it("builds the target kind's data during a change", () => {
    useExperimentStore.getState().create(DEFAULT_TRACKS[2].id, "camera", 0, 3);

    const cameraId = useExperimentStore.getState().blocks[0].id;
    editData(cameraId, (data) => ({
      ...(data as DurationData),
      duration: 2,
      durationUnit: "seconds" as DurationUnit,
    }));

    useExperimentStore.getState().setBlockKind(cameraId, "rectangle");

    const block = blockById(cameraId)!;
    expect(block.data).toMatchObject({
      duration: 2,
      durationUnit: "seconds",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rectUnit: "span",
    });
  });

  it("keeps an addition's data when another kind becomes an addition", () => {
    useExperimentStore.getState().create(DEFAULT_TRACKS[2].id, "wait", 0, 2);

    const waitId = useExperimentStore.getState().blocks[0].id;
    useExperimentStore.getState().setBlockKind(waitId, "addition");

    expect(blockById(waitId)!.data).toEqual({ inputA: 0, inputB: 0 });
  });

  it("resets data that only the previous kind defines", () => {
    useExperimentStore.getState().create(DEFAULT_TRACKS[2].id, "rectangle", 0, 2);
    const rectangleId = useExperimentStore.getState().blocks[0].id;
    editData(rectangleId, (data) => ({
      ...(data as RectangleData),
      x: 4,
      y: 5,
      w: 2,
      h: 2,
      rectUnit: "pixels",
      color: [1, 2, 3] as Vec3,
    }));

    useExperimentStore.getState().setBlockKind(rectangleId, "camera");
    useExperimentStore.getState().setBlockKind(rectangleId, "rectangle");

    expect(blockById(rectangleId)!.data).toMatchObject({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rectUnit: "span",
      color: DEFAULT_RECT_COLOR,
    });
  });
});
