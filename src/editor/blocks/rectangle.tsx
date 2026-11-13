import { Grid2x2, Monitor, Square } from "lucide-react";
import type {
  BlockDefinitionSpec,
  FieldProps,
  NumberLimits,
  StageViewProps,
} from "../block-definition";
import { TimedExecution, type ExecutionContext } from "../block-runtime";
import type { Placement, RectGeometry, RectUnit, Vec3 } from "../model";
import { convertRectUnit } from "../stage-geometry";
import { useExperimentStore } from "../store";
import {
  durationCarry,
  durationFromCarry,
  durationSeconds,
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

export interface RectanglePayload {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly unit: RectUnit;
  readonly color: Vec3;
}

class RectangleExecution extends TimedExecution {
  constructor(block: Placement<RectangleData>, context: ExecutionContext) {
    super(
      block,
      context,
      durationSeconds(block.data, block.length, context.bpm) * 1000,
    );
    const data = block.data;
    const bindings = block.slotBindings;
    context.stage.add({
      id: this.id,
      kind: "rectangle",
      layer: "screen",
      payload: {
        x: bindings?.x === undefined ? data.x : context.readSlot(bindings.x),
        y: bindings?.y === undefined ? data.y : context.readSlot(bindings.y),
        w: bindings?.w === undefined ? data.w : context.readSlot(bindings.w),
        h: bindings?.h === undefined ? data.h : context.readSlot(bindings.h),
        unit: data.rectUnit,
        color: data.color,
      } satisfies RectanglePayload,
    });
  }

  override terminate(): void {
    super.terminate();
    this.context.stage.remove(this.id);
  }
}

function RectangleStage({ view }: StageViewProps<RectanglePayload>) {
  const payload = view.payload;
  const size = (value: number): string =>
    payload.unit === "span"
      ? `calc(var(--stage-span) * ${value})`
      : `${value}px`;
  return (
    <div
      className="stage-rect"
      style={{
        left: size(payload.x),
        top: size(payload.y),
        width: size(payload.w),
        height: size(payload.h),
        background: `rgb(${payload.color[0]}, ${payload.color[1]}, ${payload.color[2]})`,
      }}
    />
  );
}

function RectUnitsField({ block, editable, update }: FieldProps<RectangleData>) {
  const stageSpan = useExperimentStore((state) => state.stageSpan);
  const data = block.data;
  return (
    <div className="inspector-field">
      <span>Units</span>
      <div className="unit-toggle" role="group" aria-label="Rectangle units">
        <button
          type="button"
          className={data.rectUnit === "span" ? "is-active" : ""}
          aria-pressed={data.rectUnit === "span"}
          disabled={!editable || stageSpan <= 0}
          onClick={() =>
            update((current) =>
              current.rectUnit === "span" || stageSpan <= 0
                ? current
                : { ...current, ...convertRectUnit(current, "span", stageSpan) },
            )
          }
        >
          <Grid2x2 size={12} aria-hidden="true" />
          Span
        </button>
        <button
          type="button"
          className={data.rectUnit === "pixels" ? "is-active" : ""}
          aria-pressed={data.rectUnit === "pixels"}
          disabled={!editable || stageSpan <= 0}
          onClick={() =>
            update((current) =>
              current.rectUnit === "pixels" || stageSpan <= 0
                ? current
                : { ...current, ...convertRectUnit(current, "pixels", stageSpan) },
            )
          }
        >
          <Monitor size={12} aria-hidden="true" />
          Pixels
        </button>
      </div>
    </div>
  );
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

const rectangle: BlockDefinitionSpec<RectangleData, RectanglePayload> = {
  kind: "rectangle",
  label: "Rectangle",
  color: "#db2777",
  icon: Square,
  fields: [
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
      kind: "color",
      section: "block",
      key: "color",
      label: "Color",
      value: (data) => data.color,
      commit: commitColor,
    },
    { kind: "duration", section: "block", key: "duration", label: "Duration" },
    {
      kind: "custom",
      section: "block",
      key: "units",
      label: "Units",
      render: RectUnitsField,
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
  renderStage: RectangleStage,
  onLengthChange: onDurationLengthChange,
  createExecution: (context, block) => new RectangleExecution(block, context),
};

function clampColorChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export default rectangle;
