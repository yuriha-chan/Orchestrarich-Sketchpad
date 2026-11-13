import type { ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type {
  DurationUnit,
  Placement,
  SlotProperty,
  Vec3,
} from "./model";
import type { ExecutionContext, ExecutionInstance } from "./block-runtime";

export interface FieldProps<T = any> {
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

export interface DurationPanelField<T> extends PanelFieldBase {
  readonly kind: "duration";
  readonly section: "block";
}

export interface FadesPanelField<T> extends PanelFieldBase {
  readonly kind: "fades";
  readonly section: "block";
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
  | OutputPanelField<T>
  | NotePanelField<T>
  | CustomPanelField<T>;

export interface DurationData {
  duration: number;
  durationUnit: DurationUnit;
  syncBeatsToCellSpan: boolean;
}

export interface FadeData {
  fadeIn: number;
  fadeOut: number;
}

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

export interface StageViewProps<T = any> {
  readonly view: { readonly id: string; readonly payload: T };
}

export interface FadeHandles {
  readonly fadeIn: number;
  readonly fadeOut: number;
  setFadeIn(value: number): void;
  setFadeOut(value: number): void;
  setFades(fades: FadeData): void;
}

export interface PhaseSpan {
  readonly index: number;
  readonly offset: number;
  readonly length: number;
}

export interface BlockDefinition<T = any, S = any> {
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
  readonly renderBlock?: (block: Placement<T>, width: number) => ReactNode;
  readonly fadeHandles?: (
    block: Placement<T>,
    update: (change: (data: T) => T) => void,
  ) => FadeHandles | null;
  readonly phases?: (data: T, length: number) => readonly PhaseSpan[];
  readonly phaseBoundaries?: (block: Placement<T>) => readonly number[];
  readonly onLengthChange?: (data: T, length: number) => T;
  readonly createExecution: (
    context: ExecutionContext,
    block: Placement<T>,
  ) => ExecutionInstance;
}

export type BlockDefinitionSpec<T = any, S = any> = Omit<
  BlockDefinition<T, S>,
  "slotProperties"
>;
