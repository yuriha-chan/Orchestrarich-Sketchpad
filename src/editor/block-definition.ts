import type { ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type {
  DurationUnit,
  LoopRegion,
  Placement,
  SlotProperty,
  Vec3,
} from "./model";
import type { ExecutionContext, ExecutionInstance } from "./block-runtime";

export interface FieldProps<T = unknown> {
  readonly block: Placement<T>;
  readonly editable: boolean;
  readonly update: (change: (data: T) => T) => void;
}

export type PanelSection = "input" | "block" | "output";

export interface NumberLimits {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

interface PanelFieldBase {
  readonly section: PanelSection;
  readonly key: string;
  readonly label: string;
}

export interface NumberPanelField<T> extends PanelFieldBase {
  readonly kind: "number";
  readonly section: "input" | "block";
  readonly slot?: boolean;
  readonly value: (data: T) => number;
  readonly commit: (data: T, value: number) => T;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly limits?: (data: T) => NumberLimits;
}

export interface ColorPanelField<T> extends PanelFieldBase {
  readonly kind: "color";
  readonly section: "block";
  readonly value: (data: T) => Vec3;
  readonly commit: (data: T, value: Vec3) => T;
}

export interface EntryContext {
  readonly length: number;
  readonly bpm: number;
  readonly stageSpan: number;
}

export interface DurationPanelField<T> extends PanelFieldBase {
  readonly kind: "duration";
  readonly section: "block";
  readonly read: (
    data: T,
    context: EntryContext,
  ) => {
    value: number;
    unit: DurationUnit;
    synced: boolean;
    limits: NumberLimits;
  };
  readonly commit: (data: T, edit: DurationEdit, context: EntryContext) => T;
  readonly resolve: (data: T, context: Pick<EntryContext, "length" | "bpm">) => number;
}

export interface FadesPanelField<T> extends PanelFieldBase {
  readonly kind: "fades";
  readonly section: "block";
  readonly read: (data: T) => FadeData;
  readonly commit: (data: T, edit: FadeEdit, context: EntryContext) => T;
}

export interface ChoicePanelField<T> extends PanelFieldBase {
  readonly kind: "choice";
  readonly section: "input" | "block";
  readonly value: (data: T) => string;
  readonly enabled: (context: EntryContext) => boolean;
  readonly choices: readonly {
    readonly value: string;
    readonly label: string;
    readonly icon: LucideIcon;
    readonly commit: (data: T, context: EntryContext) => T;
  }[];
}

export interface OutputPanelField<T> extends PanelFieldBase {
  readonly kind: "output";
  readonly section: "output";
}

export interface NotePanelField<T> extends PanelFieldBase {
  readonly kind: "note";
  readonly section: "block";
  readonly text: string;
}

export interface CustomPanelField<T> extends PanelFieldBase {
  readonly kind: "custom";
  readonly section: "input" | "block";
  readonly render: ComponentType<FieldProps<T>>;
}

export type PanelField<T> =
  | NumberPanelField<T>
  | ColorPanelField<T>
  | DurationPanelField<T>
  | FadesPanelField<T>
  | ChoicePanelField<T>
  | OutputPanelField<T>
  | NotePanelField<T>
  | CustomPanelField<T>;

export interface DurationData {
  duration: number;
  durationUnit: DurationUnit;
  syncBeatsToCellSpan: boolean;
}

export type DurationEdit =
  | { kind: "value"; value: number }
  | { kind: "unit"; unit: DurationUnit }
  | { kind: "sync"; enabled: boolean };

export interface FadeData {
  fadeIn: number;
  fadeOut: number;
}

export type FadeEdit =
  | { kind: "fadeIn" | "fadeOut"; value: number }
  | { kind: "pair"; value: FadeData };

export interface CarryOver {
  readonly duration?: DurationData;
  readonly fades?: FadeData;
}

export interface PanelSectionView<T> {
  readonly section: PanelSection;
  readonly fields: readonly PanelField<T>[];
}

const PANEL_SECTIONS: readonly PanelSection[] = ["input", "block", "output"];

export function panelSections<T>(
  definition: BlockDefinition<T>,
): readonly PanelSectionView<T>[] {
  return PANEL_SECTIONS.flatMap((section) => {
    const fields = definition.fields.filter((field) => field.section === section);
    return section === "block" || fields.length > 0
      ? [{ section, fields }]
      : [];
  });
}

export function deriveSlotProperties<T>(
  fields: readonly PanelField<T>[],
): readonly SlotProperty[] {
  const properties: SlotProperty[] = [];
  for (const field of fields) {
    if (field.kind === "output") {
      properties.push({ key: field.key, label: field.label, direction: "output" });
    } else if (field.kind === "number" && field.section === "input" && field.slot) {
      properties.push({ key: field.key, label: field.label, direction: "input" });
    }
  }
  return properties;
}

export interface StageViewProps<T = unknown> {
  readonly view: { readonly id: string; readonly payload: T };
}

export interface PhaseSpan {
  readonly index: number;
  readonly offset: number;
  readonly length: number;
}

export type TimelineGestureTarget =
  | { readonly kind: "edge"; readonly edge: "start" | "end" }
  | { readonly kind: "boundary"; readonly index: number };

export interface TimelineGestureEdit<T> {
  readonly start: number;
  readonly length: number;
  readonly update: (data: T) => T;
}

export interface TimelineGestureContext {
  readonly loops: readonly LoopRegion[];
}

export type TimelineGesture<T> = (
  delta: number,
  current: { start: number; length: number },
) => TimelineGestureEdit<T>;

export interface BlockDefinition<T = unknown, S = unknown> {
  readonly kind: string;
  readonly label: string;
  readonly color: string;
  readonly icon: LucideIcon;
  readonly slotProperties: readonly SlotProperty[];
  readonly fields: readonly PanelField<T>[];
  readonly createData: (length: number) => T;
  readonly carryOver?: (data: T) => CarryOver;
  readonly convertFrom: (carry: CarryOver, length: number) => T;
  readonly renderStage?: ComponentType<StageViewProps<S>>;
  readonly renderBlock?: (block: Placement<T>, width: number, phasePositions: readonly number[]) => ReactNode;
  readonly timelineClassName?: string;
  readonly timelineTitle?: (block: Placement<T>) => string;
  readonly phases?: (data: T, length: number) => readonly PhaseSpan[];
  readonly timelineGesture?: (
    block: Placement<T>,
    target: TimelineGestureTarget,
    columnCount: number,
    context?: TimelineGestureContext,
  ) => TimelineGesture<T>;
  readonly onLengthChange?: (data: T, length: number) => T;
  readonly createExecution: (
    context: ExecutionContext,
    block: Placement<T>,
  ) => ExecutionInstance;
}

export type BlockDefinitionSpec<T = unknown, S = unknown> = Omit<
  BlockDefinition<T, S>,
  "slotProperties"
>;

export function packBlockDefinition<T, S>(
  spec: BlockDefinitionSpec<T, S>,
): BlockDefinition<unknown, unknown> {
  return {
    ...spec,
    slotProperties: deriveSlotProperties(spec.fields),
  } as unknown as BlockDefinition<unknown, unknown>;
}
