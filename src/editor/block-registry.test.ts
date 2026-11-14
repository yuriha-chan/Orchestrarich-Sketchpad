import { describe, expect, it } from "vitest";
import { BLOCK_DEFINITIONS, blockDefinition } from "../blocks/builtin-blocks";
import {
  deriveSlotProperties,
  panelSections,
  packBlockDefinition,
  type BlockDefinition,
  type ChoicePanelField,
  type DurationData,
  type DurationPanelField,
  type EntryContext,
  type NumberPanelField,
  type OutputPanelField,
} from "../blocks/block-definition";
import { numberInput, numberOutput } from "../blocks/block-inputs";
import { durationField } from "../blocks/duration-data";
import type { Placement } from "./model";
import { ExecutionInstance } from "../core/blocks/runtime.ts";
import { createStageStore } from "./stage-state";
import { blockIcon } from "./icons";

import dialogue from "../blocks/dialogue";
import camera from "../blocks/camera";
import sound from "../blocks/sound";
import animation from "../blocks/animation";
import wait from "../blocks/wait";
import rectangle, {
  DEFAULT_RECT_COLOR,
  type RectangleData,
} from "../blocks/rectangle";
import addition from "../blocks/addition";
import { mediaPhases, onMediaLengthChange, type MediaData } from "../blocks/media-data";

describe("block registry", () => {
  it("registers every builtin block with a unique kind and complete fields", () => {
    const kinds = BLOCK_DEFINITIONS.map((definition) => definition.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const definition of BLOCK_DEFINITIONS) {
      expect(definition.kind).not.toBe("");
      expect(definition.label).not.toBe("");
      expect(definition.color).toMatch(/^#/);
      expect(definition.icon).toBeTypeOf("string");
      expect(definition.icon).not.toBe("");
      expect(Array.isArray(definition.slotProperties)).toBe(true);
      expect(typeof definition.createData).toBe("function");
      expect(typeof definition.convertFrom).toBe("function");
      expect(Array.isArray(definition.fields)).toBe(true);
      expect(typeof definition.createExecution).toBe("function");
    }
    expect(kinds).toEqual([
      "dialogue",
      "camera",
      "sound",
      "animation",
      "wait",
      "rectangle",
      "addition",
    ]);
  });

  it("resolves every builtin and choice icon name through the editor adapter", () => {
    for (const definition of BLOCK_DEFINITIONS) {
      expect(blockIcon(definition.icon)).toBeDefined();
      for (const field of definition.fields) {
        if (field.kind !== "choice") continue;
        for (const choice of field.choices) {
          expect(choice.icon).toBeTypeOf("string");
          expect(blockIcon(choice.icon)).toBeDefined();
        }
      }
    }
  });

  it("throws for an unknown kind", () => {
    expect(() => blockDefinition("missing")).toThrow(/Unknown block kind/);
  });

  it("advertises timeline fade rendering only for fade-capable blocks", () => {
    expect(blockDefinition("sound").timelineFades).toBe(true);
    expect(blockDefinition("animation").timelineFades).toBe(true);
    expect(blockDefinition("dialogue").timelineFades).not.toBe(true);
  });
});

describe("block data conversion", () => {
  it("creates each block's default data from its length", () => {
    expect(dialogue.createData(2)).toEqual({});
    expect(camera.createData(2)).toEqual({
      duration: 2,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
    });
    expect(wait.createData(2)).toEqual({
      duration: 2,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
    });
    expect(sound.createData(2)).toEqual({
      duration: 2,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
      fadeIn: 0,
      fadeOut: 0,
    });
    expect(animation.createData(2)).toEqual({
      duration: 2,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
      fadeIn: 0,
      fadeOut: 0,
    });
    expect(rectangle.createData(2)).toMatchObject({
      duration: 2,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rectUnit: "span",
      color: DEFAULT_RECT_COLOR,
    });
    expect(addition.createData(2)).toEqual({ inputA: 0, inputB: 0 });
  });

  it("carries duration from blocks that define it", () => {
    const duration = {
      duration: 3,
      durationUnit: "seconds" as const,
      syncBeatsToCellSpan: false,
    };
    expect(camera.carryOver?.(duration)).toEqual({ duration });
    expect(camera.convertFrom({}, 4)).toEqual({
      duration: 4,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
    });
    expect(wait.convertFrom({ duration }, 4)).toEqual(duration);
    expect(sound.convertFrom({ duration }, 4)).toEqual({
      ...duration,
      fadeIn: 0,
      fadeOut: 0,
    });
  });

  it("carries fades only between media blocks", () => {
    const media: MediaData = {
      duration: 3,
      durationUnit: "seconds",
      syncBeatsToCellSpan: false,
      fadeIn: 1,
      fadeOut: 2,
    };
    const carried = sound.carryOver?.(media);
    expect(carried?.fades).toEqual({ fadeIn: 1, fadeOut: 2 });
    expect(animation.convertFrom(carried ?? {}, 2)).toEqual(media);
    expect(camera.convertFrom(carried ?? {}, 2)).toEqual({
      duration: 3,
      durationUnit: "seconds",
      syncBeatsToCellSpan: false,
    });
  });

  it("does not carry geometry or addition inputs across kinds", () => {
    const duration = camera.createData(2);
    expect(rectangle.convertFrom({ duration }, 3)).toMatchObject({
      duration: 2,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rectUnit: "span",
      color: DEFAULT_RECT_COLOR,
    });
    expect(addition.convertFrom({ duration }, 3)).toEqual({
      inputA: 0,
      inputB: 0,
    });
  });

  it("declares carry-over only for kinds that contribute shared data", () => {
    expect(dialogue.carryOver).toBeUndefined();
    expect(addition.carryOver).toBeUndefined();
    expect(camera.carryOver).toBeTypeOf("function");
    expect(wait.carryOver).toBeTypeOf("function");
    expect(sound.carryOver).toBeTypeOf("function");
    expect(animation.carryOver).toBeTypeOf("function");
    expect(rectangle.carryOver).toBeTypeOf("function");
  });
});

describe("length changes", () => {
  it("updates a synced duration from the cell span", () => {
    const cameraDef = blockDefinition("camera");
    const data = {
      duration: 5,
      durationUnit: "beats" as const,
      syncBeatsToCellSpan: true,
    };
    expect(cameraDef.onLengthChange?.(data, 3)).toEqual({
      duration: 3,
      durationUnit: "beats",
      syncBeatsToCellSpan: true,
    });
  });

  it("clamps fades to the new media length", () => {
    const data: MediaData = {
      duration: 6,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
      fadeIn: 4,
      fadeOut: 4,
    };
    expect(onMediaLengthChange(data, 4)).toMatchObject({
      fadeIn: 2,
      fadeOut: 2,
    });
  });

  it("computes media phases from the cell length", () => {
    expect(mediaPhases(1, 1, 4)).toEqual([
      { index: 0, offset: 0, length: 1 },
      { index: 1, offset: 1, length: 2 },
      { index: 2, offset: 3, length: 1 },
    ]);
  });
});

describe("derived block panel", () => {
  it("groups fields into input, block, and output sections in order", () => {
    const rectangleSections = panelSections(blockDefinition("rectangle"));
    expect(rectangleSections.map((section) => section.section)).toEqual([
      "input",
      "block",
    ]);
    expect(
      rectangleSections[0].fields.map((field) => field.key),
    ).toEqual(["x", "y", "w", "h"]);
    expect(rectangleSections[1].fields.map((field) => field.kind)).toEqual([
      "color",
      "duration",
      "choice",
      "note",
    ]);

    const additionSections = panelSections(blockDefinition("addition"));
    expect(additionSections.map((section) => section.section)).toEqual([
      "input",
      "block",
      "output",
    ]);
    expect(additionSections[2].fields.map((field) => field.key)).toEqual(["out"]);
  });

  it("keeps the block section for blocks without panel fields", () => {
    const cameraSections = panelSections(blockDefinition("camera"));
    expect(cameraSections.map((section) => section.section)).toEqual(["block"]);
    expect(cameraSections[0].fields.map((field) => field.kind)).toEqual([
      "duration",
    ]);
    expect(panelSections(blockDefinition("dialogue"))[0].fields).toHaveLength(1);
  });

  it("covers every declared field exactly once in definition order", () => {
    for (const definition of BLOCK_DEFINITIONS) {
      const sectioned = panelSections(definition).flatMap(
        (section) => section.fields,
      );
      expect(sectioned).toEqual([...definition.fields]);
    }
  });

  it("derives slot properties from input and output fields", () => {
    expect(blockDefinition("rectangle").slotProperties).toEqual([
      { key: "x", label: "X", direction: "input" },
      { key: "y", label: "Y", direction: "input" },
      { key: "w", label: "Width", direction: "input" },
      { key: "h", label: "Height", direction: "input" },
    ]);
    expect(blockDefinition("addition").slotProperties).toEqual([
      { key: "a", label: "A", direction: "input" },
      { key: "b", label: "B", direction: "input" },
      { key: "out", label: "Output", direction: "output" },
    ]);
    expect(blockDefinition("camera").slotProperties).toEqual([]);
  });
});

interface FreshInputData {
  firstAmount: number;
  secondAmount: number;
}

const freshLeftInput = {
  kind: "number",
  section: "input",
  key: "left",
  label: "Left",
  slot: true,
  min: -10,
  max: 10,
  step: 1,
  value: (data) => data.firstAmount,
  commit: (data, value) =>
    Number.isFinite(value) ? { ...data, firstAmount: value } : data,
} satisfies NumberPanelField<FreshInputData>;

const freshRightInput = {
  kind: "number",
  section: "input",
  key: "right",
  label: "Right",
  slot: true,
  min: 0,
  max: 10,
  step: 1,
  value: (data) => data.secondAmount,
  commit: (data, value) =>
    Number.isFinite(value) ? { ...data, secondAmount: value } : data,
} satisfies NumberPanelField<FreshInputData>;

const freshTotalOutput: OutputPanelField<FreshInputData> = {
  kind: "output",
  section: "output",
  key: "total",
  label: "Total",
};

function freshPlacement(
  data: FreshInputData,
  slotBindings?: Partial<Record<string, string>>,
): Placement<FreshInputData> {
  return {
    id: "fresh-block",
    trackId: "fresh-track",
    start: 0,
    length: 1,
    cooperativeSkip: false,
    kind: "fresh-sum",
    data,
    slotBindings,
  };
}

describe("block input declarations", () => {
  it("executes a fresh packed definition using the same edited and bound fields", async () => {
    const left = numberInput(freshLeftInput);
    const right = numberInput(freshRightInput);
    const total = numberOutput(freshTotalOutput);
    const packed = packBlockDefinition<FreshInputData>({
      kind: "fresh-sum", label: "Fresh Sum", color: "#123456", icon: "Calculator",
      fields: [left, right, total],
      createData: () => ({ firstAmount: 0, secondAmount: 0 }),
      convertFrom: () => ({ firstAmount: 0, secondAmount: 0 }),
      createExecution: (context, block) => new class extends ExecutionInstance {
        startPhase() {
          return { execution: Promise.resolve(total.emit(
            left.resolve(block, context.readSlot) + right.resolve(block, context.readSlot),
          )) };
        }
        terminatePhase() {}
        terminate() {}
      }(block),
    });
    const field = packed.fields[0];
    if (field.kind !== "number") throw new Error("Expected the declared numeric input");
    const data = field.commit(packed.createData(1), -4);
    const placement: Placement = {
      ...freshPlacement({ firstAmount: 0, secondAmount: 0 }),
      data, slotBindings: { right: "rhs" },
    };
    const reads: string[] = [];
    const execution = packed.createExecution({
      bpm: 90, stage: createStageStore().getState(), report: () => {}, time: () => 0,
      readSlot: (id) => { reads.push(id); return 9; },
    }, placement);
    const result = execution.startPhase({
      id: placement.id, trackId: placement.trackId, start: 0, end: 1,
      state: "running", cooperativeSkip: false,
    });
    await expect(result.execution).resolves.toEqual({ total: 5 });
    expect(reads).toEqual(["rhs"]);
    expect(packed.slotProperties).toEqual(deriveSlotProperties([left, right, total]));
    expect(panelSections(packed).map(({ section }) => section)).toEqual(["input", "block", "output"]);
    execution.terminate();
  });

  it("resolves literal zero and negative values without reading slots", () => {
    const reads: string[] = [];
    const readSlot = (id: string) => {
      reads.push(id);
      return 100;
    };
    const block = freshPlacement({ firstAmount: 0, secondAmount: -6 });
    expect(numberInput(freshLeftInput).resolve(block, readSlot)).toBe(0);
    expect(numberInput(freshRightInput).resolve(block, readSlot)).toBe(-6);
    expect(reads).toEqual([]);
  });

  it("reads bound zero and negative slot expressions by declaration key", () => {
    const reads: string[] = [];
    const readSlot = (id: string) => {
      reads.push(id);
      return id === "left-slot" ? 0 : -5;
    };
    const block = freshPlacement(
      { firstAmount: 42, secondAmount: 43 },
      { left: "left-slot", right: "right-slot" },
    );
    expect(numberInput(freshLeftInput).resolve(block, readSlot)).toBe(0);
    expect(numberInput(freshRightInput).resolve(block, readSlot)).toBe(-5);
    expect(reads).toEqual(["left-slot", "right-slot"]);
  });

  it("commits through the returned declaration operation", () => {
    const input = numberInput(freshLeftInput);
    const data: FreshInputData = { firstAmount: 3, secondAmount: -2 };
    expect(input.commit(data, 0)).toEqual({
      firstAmount: 0,
      secondAmount: -2,
    });
    expect(input.commit(data, -4)).toEqual({
      firstAmount: -4,
      secondAmount: -2,
    });
    expect(data).toEqual({ firstAmount: 3, secondAmount: -2 });
  });

  it("emits output values using the declared non-out key", () => {
    const output = numberOutput(freshTotalOutput);
    expect(output.key).toBe("total");
    expect(output.key).not.toBe("out");
    expect(output.emit(0)).toEqual({ total: 0 });
    expect(output.emit(-8)).toEqual({ total: -8 });
  });

  it("uses the returned objects directly in panel and slot derivation", () => {
    const left = numberInput(freshLeftInput);
    const right = numberInput(freshRightInput);
    const total = numberOutput(freshTotalOutput);
    const definition: BlockDefinition<FreshInputData> = {
      kind: "fresh-sum",
      label: "Fresh Sum",
      color: "#123456",
      icon: "Calculator",
      slotProperties: [],
      fields: [left, right, total],
      createData: () => ({ firstAmount: 0, secondAmount: 0 }),
      convertFrom: () => ({ firstAmount: 0, secondAmount: 0 }),
      createExecution: () => {
        throw new Error("unused");
      },
    };
    const sections = panelSections(definition);
    expect(sections.map((section) => section.section)).toEqual([
      "input",
      "block",
      "output",
    ]);
    expect(sections[0].fields[0]).toBe(left);
    expect(sections[0].fields[1]).toBe(right);
    expect(sections[1].fields).toEqual([]);
    expect(sections[2].fields[0]).toBe(total);
    expect(deriveSlotProperties(definition.fields)).toEqual([
      { key: "left", label: "Left", direction: "input" },
      { key: "right", label: "Right", direction: "input" },
      { key: "total", label: "Total", direction: "output" },
    ]);
  });
});

interface FreshDurationData extends DurationData {
  caption: string;
  lane: number;
}

const freshDurationContext: EntryContext = {
  length: 5,
  bpm: 90,
  stageSpan: 16,
};

function freshDurationData(): FreshDurationData {
  return {
    duration: 2,
    durationUnit: "beats",
    syncBeatsToCellSpan: false,
    caption: "intro",
    lane: 7,
  };
}

const BEAT_LIMITS = { min: 0.25, max: 256, step: 0.25 };
const SECOND_LIMITS = { min: 0.05, max: 120, step: 0.05 };

describe("duration field", () => {
  it("resolves the same stored-unit and span relationship used by its entry", () => {
    const field = durationField<FreshDurationData>();
    const beats = { ...freshDurationData(), duration: 3 };
    expect(field.resolve(beats, { length: 6, bpm: 90 })).toBe(2);
    expect(field.resolve({ ...beats, durationUnit: "seconds" }, { length: 6, bpm: 90 })).toBe(3);
    expect(field.resolve({ ...beats, syncBeatsToCellSpan: true }, { length: 6, bpm: 90 })).toBe(4);
  });
  it("reads beat limits and the stored value", () => {
    const field = durationField<FreshDurationData>();
    expect(field.kind).toBe("duration");
    expect(field.section).toBe("block");
    expect(field.key).toBe("duration");
    expect(field.label).toBe("Duration");
    expect(field.read(freshDurationData(), freshDurationContext)).toEqual({
      value: 2,
      unit: "beats",
      synced: false,
      limits: BEAT_LIMITS,
    });
  });

  it("reads second limits for a stored second value", () => {
    const field = durationField<FreshDurationData>();
    const data = {
      ...freshDurationData(),
      duration: 3,
      durationUnit: "seconds" as const,
    };
    expect(field.read(data, freshDurationContext)).toEqual({
      value: 3,
      unit: "seconds",
      synced: false,
      limits: SECOND_LIMITS,
    });
  });

  it("reads the cell span as the effective value while synced", () => {
    const field = durationField<FreshDurationData>();
    const data = {
      ...freshDurationData(),
      duration: 99,
      syncBeatsToCellSpan: true,
    };
    expect(field.read(data, freshDurationContext)).toEqual({
      value: 5,
      unit: "beats",
      synced: true,
      limits: BEAT_LIMITS,
    });
  });

  it("commits unit conversion at 90 BPM without touching unrelated fields", () => {
    const field = durationField<FreshDurationData>();
    const data = {
      ...freshDurationData(),
      duration: 6,
      durationUnit: "beats" as const,
    };
    expect(
      field.commit(data, { kind: "unit", unit: "seconds" }, freshDurationContext),
    ).toEqual({
      duration: 4,
      durationUnit: "seconds",
      syncBeatsToCellSpan: false,
      caption: "intro",
      lane: 7,
    });
    expect(data).toEqual({
      duration: 6,
      durationUnit: "beats",
      syncBeatsToCellSpan: false,
      caption: "intro",
      lane: 7,
    });
  });

  it("commits sync edits against the context length and disabling keeps the value", () => {
    const field = durationField<FreshDurationData>();
    const data = {
      ...freshDurationData(),
      duration: 3,
      durationUnit: "seconds" as const,
    };
    const synced = field.commit(
      data,
      { kind: "sync", enabled: true },
      freshDurationContext,
    );
    expect(synced).toEqual({
      duration: 5,
      durationUnit: "beats",
      syncBeatsToCellSpan: true,
      caption: "intro",
      lane: 7,
    });
    expect(
      field.commit(synced, { kind: "sync", enabled: false }, freshDurationContext),
    ).toEqual({ ...synced, syncBeatsToCellSpan: false });
  });

  it("preserves the data for invalid value edits", () => {
    const field = durationField<FreshDurationData>();
    const data = freshDurationData();
    for (const value of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        field.commit(data, { kind: "value", value }, freshDurationContext),
      ).toEqual(data);
    }
  });
});

function rectangleEntryData(): RectangleData {
  return {
    duration: 2,
    durationUnit: "beats",
    syncBeatsToCellSpan: false,
    x: 2,
    y: 1,
    w: 4,
    h: 3,
    rectUnit: "span",
    color: [10, 20, 30],
  };
}

const rectangleContext: EntryContext = {
  length: 4,
  bpm: 90,
  stageSpan: 50,
};

function rectangleChoiceField(): ChoicePanelField<RectangleData> {
  const field = rectangle.fields.find((candidate) => candidate.key === "units");
  if (field?.kind !== "choice") {
    throw new Error("Expected the rectangle units choice field");
  }
  return field;
}

function rectangleChoice(
  field: ChoicePanelField<RectangleData>,
  value: string,
) {
  const choice = field.choices.find((candidate) => candidate.value === value);
  if (choice === undefined) {
    throw new Error(`Expected the rectangle ${value} choice`);
  }
  return choice;
}

describe("rectangle unit choice field", () => {
  it("declares one grouped choice field at the units position", () => {
    const fields = rectangle.fields;
    const index = fields.findIndex((field) => field.key === "units");
    const field = rectangleChoiceField();
    expect(index).toBeGreaterThan(-1);
    expect(field.section).toBe("block");
    expect(field.label).toBe("Units");
    expect(field.value(rectangleEntryData())).toBe("span");
    expect(field.choices.map(({ value, label }) => ({ value, label }))).toEqual([
      { value: "span", label: "Span" },
      { value: "pixels", label: "Pixels" },
    ]);
  });

  it("converts span geometry to pixels and back with the measured scale", () => {
    const field = rectangleChoiceField();
    const data = rectangleEntryData();
    const pixels = rectangleChoice(field, "pixels").commit(
      data,
      rectangleContext,
    );
    expect(pixels).toEqual({
      ...data,
      x: 100,
      y: 50,
      w: 200,
      h: 150,
      rectUnit: "pixels",
    });
    expect(rectangleChoice(field, "span").commit(pixels, rectangleContext)).toEqual(
      data,
    );
    expect(data).toEqual(rectangleEntryData());
  });

  it("preserves unrelated duration and color when changing units", () => {
    const field = rectangleChoiceField();
    const data: RectangleData = {
      ...rectangleEntryData(),
      duration: 3,
      durationUnit: "seconds",
      syncBeatsToCellSpan: false,
      color: [1, 2, 3],
    };
    const converted = rectangleChoice(field, "pixels").commit(
      data,
      rectangleContext,
    );
    expect(converted).toMatchObject({
      duration: 3,
      durationUnit: "seconds",
      syncBeatsToCellSpan: false,
      color: [1, 2, 3],
      rectUnit: "pixels",
    });
  });

  it("does not convert for the same unit or without a measured scale", () => {
    const field = rectangleChoiceField();
    const data = rectangleEntryData();
    expect(rectangleChoice(field, "span").commit(data, rectangleContext)).toBe(
      data,
    );
    expect(
      rectangleChoice(field, "pixels").commit(data, {
        ...rectangleContext,
        stageSpan: 0,
      }),
    ).toBe(data);
    expect(field.enabled(rectangleContext)).toBe(true);
    expect(field.enabled({ ...rectangleContext, stageSpan: 0 })).toBe(false);
  });

  it("interprets a bound slot expression in the selected units without converting its value", () => {
    const field = rectangleChoiceField();
    const bindings = { x: "slot-x" };
    const placement: Placement<RectangleData> = {
      id: "rect",
      trackId: "track",
      start: 0,
      length: 4,
      cooperativeSkip: false,
      kind: "rectangle",
      data: rectangleEntryData(),
      slotBindings: bindings,
    };
    const converted = rectangleChoice(field, "pixels").commit(
      placement.data,
      rectangleContext,
    );
    const stage = createStageStore();
    const reads: string[] = [];
    const execution = rectangle.createExecution({
      bpm: 90,
      stage: stage.getState(),
      report: () => {},
      time: () => 0,
      readSlot: (id) => { reads.push(id); return 5; },
    }, { ...placement, data: converted });
    expect(stage.getState().items[0]).toMatchObject({ x: 5, unit: "pixels" });
    expect(reads).toEqual(["slot-x"]);
    expect(placement.slotBindings).toEqual({ x: "slot-x" });
    expect(deriveSlotProperties(rectangle.fields)).toEqual([
      { key: "x", label: "X", direction: "input" },
      { key: "y", label: "Y", direction: "input" },
      { key: "w", label: "Width", direction: "input" },
      { key: "h", label: "Height", direction: "input" },
    ]);
    execution.terminate();
  });

  it("retains span units in the runtime payload after conversion at a changed measured scale", () => {
    const field = rectangleChoiceField();
    const data = rectangleEntryData();
    const pixels = rectangleChoice(field, "pixels").commit(
      data,
      rectangleContext,
    );
    const span = rectangleChoice(field, "span").commit(
      pixels,
      { ...rectangleContext, stageSpan: 100 },
    );
    const stage = createStageStore();
    const placement: Placement<RectangleData> = {
      id: "rect",
      trackId: "track",
      start: 0,
      length: 4,
      cooperativeSkip: false,
      kind: "rectangle",
      data: span,
    };
    const execution = rectangle.createExecution(
      {
        bpm: 90,
        stage: stage.getState(),
        report: () => {},
        time: () => 0,
        readSlot: () => 0,
      },
      placement,
    );
    const item = stage.getState().items.find(
      (candidate) => candidate.id === execution.id,
    )!;
    expect({
      x: item.type === "rectangle" ? item.x : undefined,
      y: item.type === "rectangle" ? item.y : undefined,
      w: item.type === "rectangle" ? item.w : undefined,
      h: item.type === "rectangle" ? item.h : undefined,
      unit: item.type === "rectangle" ? item.unit : undefined,
      color: item.type === "rectangle" ? item.color : undefined,
    }).toEqual({
      x: 1,
      y: 0.5,
      w: 2,
      h: 1.5,
      unit: "span",
      color: [10, 20, 30],
    });
    execution.terminate();
  });
});

function typeNegativeAccessorAndCommit(): void {
  numberInput<FreshInputData>({
    kind: "number",
    section: "input",
    key: "left",
    label: "Left",
    slot: true,
    min: 0,
    max: 10,
    // @ts-expect-error accessor must return the declared number
    value: (data: FreshInputData) => `${data.firstAmount}`,
    // @ts-expect-error commit value must be the declared number
    commit: (data: FreshInputData, value: string) => data,
  });
}

function typeNegativeDurationField(): void {
  // @ts-expect-error a duration tag alone lacks read and commit operations
  const tagOnly: DurationPanelField<FreshDurationData> = { kind: "duration", section: "block", key: "duration", label: "Duration" };
  // @ts-expect-error duration data must carry the duration shape
  durationField<{ text: string }>();
  void tagOnly;
}
