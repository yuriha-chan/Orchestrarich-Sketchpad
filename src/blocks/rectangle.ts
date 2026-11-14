import type {
  BlockDefinitionSpec,
  NumberLimits,
} from "./block-definition";
import { numberInput } from "./block-inputs";
import { TimedExecution, type ExecutionContext } from "../core/blocks/runtime.ts";
import type { Placement } from "../core/blocks/placement.ts";
import type {
  RectGeometry,
  RectUnit,
  Vec3,
} from "../core/blocks/geometry.ts";
import { convertRectUnit } from "../core/blocks/geometry.ts";
import {
  durationCarry,
  durationField,
  durationFromCarry,
  onDurationLengthChange,
  type DurationData,
} from "./duration-data";
export const DEFAULT_RECT_COLOR: Vec3 = [219, 39, 119];

export const DEFAULT_RECT_GEOMETRY: RectGeometry = {
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  rectUnit: "span",
};

export interface RectangleData extends DurationData, RectGeometry {
  color: Vec3;
}

const duration = durationField<RectangleData>();

class RectangleExecution extends TimedExecution {
  constructor(block: Placement<RectangleData>, context: ExecutionContext) {
    super(
      block,
      context,
      duration.resolve(block.data, { length: block.length, bpm: context.bpm }) * 1000,
    );
    const data = block.data;
    context.stage.addRectangle({
      id: this.id,
      type: "rectangle",
      layer: "screen",
      x: xInput.resolve(block, context.readSlot),
      y: yInput.resolve(block, context.readSlot),
      w: wInput.resolve(block, context.readSlot),
      h: hInput.resolve(block, context.readSlot),
      unit: data.rectUnit,
      color: data.color,
    });
  }

  override terminate(): void {
    super.terminate();
    this.context.stage.remove(this.id);
  }
}

function chooseRectUnit(
  data: RectangleData,
  unit: RectUnit,
  stageSpan: number,
): RectangleData {
  if (data.rectUnit === unit || stageSpan <= 0) {
    return data;
  }
  return { ...data, ...convertRectUnit(data, unit, stageSpan) };
}

function geometryLimits(data: RectangleData, minimumSpan: number): NumberLimits {
  return data.rectUnit === "pixels"
    ? { min: minimumSpan === 0 ? 0 : 1, max: 4096, step: 1 }
    : { min: minimumSpan, max: 512, step: 0.25 };
}

function commitGeometry(
  data: RectangleData,
  key: "x" | "y" | "w" | "h",
  value: number,
): RectangleData {
  if (!Number.isFinite(value)) {
    return data;
  }
  if (key === "x" || key === "y") {
    return value < 0 ? data : { ...data, [key]: value };
  }
  return value <= 0 ? data : { ...data, [key]: value };
}

function commitColor(data: RectangleData, color: Vec3): RectangleData {
  if (!color.every(Number.isFinite)) {
    return data;
  }
  return {
    ...data,
    color: [
      clampColorChannel(color[0]),
      clampColorChannel(color[1]),
      clampColorChannel(color[2]),
    ],
  };
}

const xInput = numberInput<RectangleData>({
  kind: "number",
  section: "input",
  key: "x",
  label: "X",
  slot: true,
  min: 0,
  max: 512,
  step: 0.25,
  value: (data) => data.x,
  commit: (data, value) => commitGeometry(data, "x", value),
  limits: (data) => geometryLimits(data, 0),
});

const yInput = numberInput<RectangleData>({
  kind: "number",
  section: "input",
  key: "y",
  label: "Y",
  slot: true,
  min: 0,
  max: 512,
  step: 0.25,
  value: (data) => data.y,
  commit: (data, value) => commitGeometry(data, "y", value),
  limits: (data) => geometryLimits(data, 0),
});

const wInput = numberInput<RectangleData>({
  kind: "number",
  section: "input",
  key: "w",
  label: "Width",
  slot: true,
  min: 0.25,
  max: 512,
  step: 0.25,
  value: (data) => data.w,
  commit: (data, value) => commitGeometry(data, "w", value),
  limits: (data) => geometryLimits(data, 0.25),
});

const hInput = numberInput<RectangleData>({
  kind: "number",
  section: "input",
  key: "h",
  label: "Height",
  slot: true,
  min: 0.25,
  max: 512,
  step: 0.25,
  value: (data) => data.h,
  commit: (data, value) => commitGeometry(data, "h", value),
  limits: (data) => geometryLimits(data, 0.25),
});

const rectangle: BlockDefinitionSpec<RectangleData> = {
  kind: "rectangle",
  label: "Rectangle",
  color: "#db2777",
  icon: "Square",
  fields: [
    xInput,
    yInput,
    wInput,
    hInput,
    {
      kind: "color",
      section: "block",
      key: "color",
      label: "Color",
      value: (data) => data.color,
      commit: commitColor,
    },
    duration,
    {
      kind: "choice",
      section: "block",
      key: "units",
      label: "Units",
      value: (data) => data.rectUnit,
      enabled: (context) => context.stageSpan > 0,
      choices: [
        {
          value: "span",
          label: "Span",
          icon: "Grid2x2",
          commit: (data, context) =>
            chooseRectUnit(data, "span", context.stageSpan),
        },
        {
          value: "pixels",
          label: "Pixels",
          icon: "Monitor",
          commit: (data, context) =>
            chooseRectUnit(data, "pixels", context.stageSpan),
        },
      ],
    },
    {
      kind: "note",
      section: "block",
      key: "note",
      label: "Note",
      text: "Span units follow the stage grid; pixels stay fixed when the stage resizes.",
    },
  ],
  createData: (length) => ({
    duration: length,
    durationUnit: "beats",
    syncBeatsToCellSpan: false,
    ...DEFAULT_RECT_GEOMETRY,
    color: [...DEFAULT_RECT_COLOR] as Vec3,
  }),
  carryOver: durationCarry,
  convertFrom: (carry, length) => ({
    ...durationFromCarry(carry, length),
    ...DEFAULT_RECT_GEOMETRY,
    color: [...DEFAULT_RECT_COLOR] as Vec3,
  }),
  onLengthChange: onDurationLengthChange,
  createExecution: (context, block) => new RectangleExecution(block, context),
};

function clampColorChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export default rectangle;
