import { describe, expect, it } from "vitest";
import { BLOCK_DEFINITIONS, blockDefinition } from "./builtin-blocks";
import { panelSections } from "./block-definition";

import dialogue from "./blocks/dialogue";
import camera from "./blocks/camera";
import sound from "./blocks/sound";
import animation from "./blocks/animation";
import wait from "./blocks/wait";
import rectangle, { DEFAULT_RECT_COLOR } from "./blocks/rectangle";
import addition from "./blocks/addition";
import { mediaPhases, onMediaLengthChange, type MediaData } from "./blocks/media-data";

describe("block registry", () => {
  it("registers every builtin block with a unique kind and complete fields", () => {
    const kinds = BLOCK_DEFINITIONS.map((definition) => definition.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const definition of BLOCK_DEFINITIONS) {
      expect(definition.kind).not.toBe("");
      expect(definition.label).not.toBe("");
      expect(definition.color).toMatch(/^#/);
      expect(definition.icon).toBeDefined();
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

  it("throws for an unknown kind", () => {
    expect(() => blockDefinition("missing")).toThrow(/Unknown block kind/);
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
      "custom",
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
