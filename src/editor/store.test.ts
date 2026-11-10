import { beforeEach, describe, expect, it } from "vitest";

import { validateNumericSlotReads } from "../core/slots/numeric-slots";
import { rectangleSlotReads } from "./execution";
import { DEFAULT_TRACKS, type RectanglePlacement } from "./model";
import { useExperimentStore } from "./store";

function resetStore(): void {
  useExperimentStore.setState({
    blocks: [],
    tracks: DEFAULT_TRACKS.map((track) => ({ ...track })),
    slots: [],
    selectedId: null,
  });
}

beforeEach(resetStore);

function addSlot(trackId: string | null): string {
  useExperimentStore.getState().addSlot(trackId);
  const slots = useExperimentStore.getState().slots;
  return slots[slots.length - 1].id;
}

function createRectangle(
  trackId: string = DEFAULT_TRACKS[1].id,
  start = 0,
): string {
  useExperimentStore.getState().create(trackId, "rectangle", start, 1);
  const blocks = useExperimentStore.getState().blocks;
  return blocks[blocks.length - 1].id;
}

function rectangle(id: string): RectanglePlacement {
  const block = useExperimentStore
    .getState()
    .blocks.find((candidate) => candidate.id === id);
  if (block === undefined || block.kind !== "rectangle") {
    throw new Error(`rectangle ${id} not found`);
  }
  return block;
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

    useExperimentStore.getState().initializeSlot(slotId, 3, 10);

    expect(slotById(slotId).initializations).toEqual([{ time: 3, value: 10 }]);
  });

  it("accepts initialization at logical time zero", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 0, 5);

    expect(slotById(slotId).initializations).toEqual([{ time: 0, value: 5 }]);
  });

  it("accepts an initialization value of zero", () => {
    const slotId = addSlot(DEFAULT_TRACKS[0].id);

    useExperimentStore.getState().initializeSlot(slotId, 2, 0);

    expect(slotById(slotId).initializations).toEqual([{ time: 2, value: 0 }]);
  });

  it("permits editing the value at the same initialization time", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 2, 5);
    useExperimentStore.getState().initializeSlot(slotId, 2, 9);

    expect(slotById(slotId).initializations).toEqual([{ time: 2, value: 9 }]);
  });

  it("stores initializations at multiple times in time order", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 2, 9);
    useExperimentStore.getState().initializeSlot(slotId, 1, 5);

    expect(slotById(slotId).initializations).toEqual([
      { time: 1, value: 5 },
      { time: 2, value: 9 },
    ]);
  });

  it("replaces one time without disturbing the other times", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 0, 1);
    useExperimentStore.getState().initializeSlot(slotId, 5, 9);
    useExperimentStore.getState().initializeSlot(slotId, 0, 3);

    expect(slotById(slotId).initializations).toEqual([
      { time: 0, value: 3 },
      { time: 5, value: 9 },
    ]);
  });

  it("rejects initialization at a negative time", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, -1, 5);

    expect(slotById(slotId).initializations).toEqual([]);
  });

  it("rejects initialization at a fractional time", () => {
    const slotId = addSlot(null);

    useExperimentStore.getState().initializeSlot(slotId, 1.5, 5);

    expect(slotById(slotId).initializations).toEqual([]);
  });

  it("initializes only the requested slot", () => {
    const first = addSlot(null);
    const second = addSlot(null);

    useExperimentStore.getState().initializeSlot(first, 0, 7);

    expect(slotById(first).initializations).toEqual([{ time: 0, value: 7 }]);
    expect(slotById(second).initializations).toEqual([]);
  });
});

describe("rectangle slot selection", () => {
  it("stores a binding for every rectangle field", () => {
    const rectangleId = createRectangle();
    const slotId = addSlot(null);

    for (const field of ["x", "y", "w", "h"] as const) {
      useExperimentStore.getState().setRectSlot(rectangleId, field, slotId);
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

    useExperimentStore.getState().setRectSlot(rectangleId, "x", slotId);

    expect(rectangle(rectangleId).slotBindings?.x).toBe(slotId);
  });

  it("binds a shared slot regardless of the rectangle's track", () => {
    const rectangleId = createRectangle(DEFAULT_TRACKS[2].id);
    const slotId = addSlot(null);

    useExperimentStore.getState().setRectSlot(rectangleId, "h", slotId);

    expect(rectangle(rectangleId).slotBindings?.h).toBe(slotId);
  });

  it("rejects a local slot from another track", () => {
    const rectangleId = createRectangle(DEFAULT_TRACKS[1].id);
    const slotId = addSlot(DEFAULT_TRACKS[2].id);

    useExperimentStore.getState().setRectSlot(rectangleId, "x", slotId);

    expect(rectangle(rectangleId).slotBindings?.x).toBeUndefined();
  });

  it("rejects a nonexistent slot", () => {
    const rectangleId = createRectangle();

    useExperimentStore.getState().setRectSlot(rectangleId, "y", "missing");

    expect(rectangle(rectangleId).slotBindings?.y).toBeUndefined();
  });

  it("switches a field back to its previous immediate number", () => {
    const rectangleId = createRectangle();
    useExperimentStore.getState().setRectValue(rectangleId, "x", 4);
    const slotId = addSlot(null);

    useExperimentStore.getState().setRectSlot(rectangleId, "x", slotId);
    expect(rectangle(rectangleId).x).toBe(4);
    expect(rectangle(rectangleId).slotBindings?.x).toBe(slotId);

    useExperimentStore.getState().setRectSlot(rectangleId, "x", null);

    expect(rectangle(rectangleId).x).toBe(4);
    expect(rectangle(rectangleId).slotBindings?.x).toBeUndefined();
  });

  it("leaves slot values unchanged when the rectangle unit changes", () => {
    const rectangleId = createRectangle();
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 0, 3);
    useExperimentStore.getState().setRectSlot(rectangleId, "x", slotId);

    useExperimentStore.getState().setRectUnit(rectangleId, "pixels", 20);

    expect(slotById(slotId).initializations).toEqual([{ time: 0, value: 3 }]);
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
    useExperimentStore.getState().initializeSlot(slotId, 2, 4);

    useExperimentStore.getState().renameSlot(slotId, "Health");

    expect(slotById(slotId)).toMatchObject({
      id: slotId,
      trackId: DEFAULT_TRACKS[0].id,
      initializations: [{ time: 2, value: 4 }],
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
    useExperimentStore.getState().initializeSlot(kept, 1, 6);

    useExperimentStore.getState().removeSlot(removed);

    const slots = useExperimentStore.getState().slots;
    expect(slots.map((slot) => slot.id)).toEqual([kept]);
    expect(slots[0]).toMatchObject({
      name: "Kept",
      initializations: [{ time: 1, value: 6 }],
    });
  });

  it("preserves a rectangle binding to the removed slot", () => {
    const rectangleId = createRectangle(DEFAULT_TRACKS[1].id);
    const slotId = addSlot(DEFAULT_TRACKS[1].id);
    useExperimentStore.getState().initializeSlot(slotId, 0, 3);
    useExperimentStore.getState().setRectSlot(rectangleId, "x", slotId);

    useExperimentStore.getState().removeSlot(slotId);

    expect(useExperimentStore.getState().slots).toHaveLength(0);
    expect(rectangle(rectangleId).slotBindings?.x).toBe(slotId);
  });

  it("rejects reads of a removed slot through established validation", () => {
    const rectangleId = createRectangle(DEFAULT_TRACKS[1].id);
    const slotId = addSlot(DEFAULT_TRACKS[1].id);
    useExperimentStore.getState().initializeSlot(slotId, 0, 3);
    useExperimentStore.getState().setRectSlot(rectangleId, "x", slotId);

    useExperimentStore.getState().removeSlot(slotId);

    const { slots, blocks } = useExperimentStore.getState();
    expect(validateNumericSlotReads(slots, rectangleSlotReads(blocks))).toEqual([
      { slotId, trackId: DEFAULT_TRACKS[1].id, time: 0 },
    ]);
  });
});

describe("slot initialization clearing", () => {
  it("clears the requested initialization time", () => {
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 3, 10);

    useExperimentStore.getState().clearSlotInitialization(slotId, 3);

    expect(slotById(slotId).initializations).toEqual([]);
  });

  it("leaves the other initialization times intact", () => {
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 1, 5);
    useExperimentStore.getState().initializeSlot(slotId, 4, 9);

    useExperimentStore.getState().clearSlotInitialization(slotId, 1);

    expect(slotById(slotId).initializations).toEqual([{ time: 4, value: 9 }]);
  });

  it("leaves other slots unchanged", () => {
    const cleared = addSlot(DEFAULT_TRACKS[0].id);
    const kept = addSlot(null);
    useExperimentStore.getState().initializeSlot(cleared, 1, 2);
    useExperimentStore.getState().initializeSlot(kept, 4, 8);

    useExperimentStore.getState().clearSlotInitialization(cleared, 1);

    expect(slotById(cleared).initializations).toEqual([]);
    expect(slotById(kept).initializations).toEqual([{ time: 4, value: 8 }]);
  });

  it("makes an existing rectangle read invalid when no earlier value remains", () => {
    const rectangleId = createRectangle();
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 0, 3);
    useExperimentStore.getState().setRectSlot(rectangleId, "x", slotId);
    const before = useExperimentStore.getState();
    expect(
      validateNumericSlotReads(before.slots, rectangleSlotReads(before.blocks)),
    ).toEqual([]);

    useExperimentStore.getState().clearSlotInitialization(slotId, 0);

    const after = useExperimentStore.getState();
    expect(
      validateNumericSlotReads(after.slots, rectangleSlotReads(after.blocks)),
    ).toEqual([{ slotId, trackId: DEFAULT_TRACKS[1].id, time: 0 }]);
  });

  it("allows the slot to be initialized again", () => {
    const slotId = addSlot(null);
    useExperimentStore.getState().initializeSlot(slotId, 1, 5);

    useExperimentStore.getState().clearSlotInitialization(slotId, 1);
    useExperimentStore.getState().initializeSlot(slotId, 4, 9);

    expect(slotById(slotId).initializations).toEqual([{ time: 4, value: 9 }]);
  });
});
