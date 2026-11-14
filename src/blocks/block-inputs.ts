import type { BlockOutputs } from "../core/execution/timeline-runner";
import type {
  NumberPanelField,
  OutputPanelField,
  StringPanelField,
} from "./block-definition";
import type { Placement } from "../core/blocks/placement.ts";

export type NumberInputSpec<T> = NumberPanelField<T> & {
  readonly section: "input";
  readonly slot: true;
};

export type StringInputSpec<T> = StringPanelField<T> & {
  readonly section: "input";
  readonly slot: true;
};

export function numberInput<T>(
  spec: NumberInputSpec<T>,
): NumberInputSpec<T> & {
  resolve(block: Placement<T>, readSlot: (id: string) => number | string): number;
} {
  return {
    ...spec,
    resolve(block, readSlot) {
      const slotId = block.slotBindings?.[spec.key];
      if (slotId === undefined) {
        return spec.value(block.data);
      }
      const value = readSlot(slotId);
      if (typeof value !== "number") {
        throw new Error(`Slot "${slotId}" does not hold a numeric value`);
      }
      return value;
    },
  };
}

export function stringInput<T>(
  spec: StringInputSpec<T>,
): StringInputSpec<T> & {
  resolve(block: Placement<T>, readSlot: (id: string) => number | string): string;
} {
  return {
    ...spec,
    resolve(block, readSlot) {
      const slotId = block.slotBindings?.[spec.key];
      if (slotId === undefined) {
        return spec.value(block.data);
      }
      const value = readSlot(slotId);
      if (typeof value !== "string") {
        throw new Error(`Slot "${slotId}" does not hold a string value`);
      }
      return value;
    },
  };
}

export function numberOutput<T>(
  spec: OutputPanelField<T>,
): OutputPanelField<T> & {
  emit(value: number): BlockOutputs;
} {
  return {
    ...spec,
    emit(value) {
      return { [spec.key]: value };
    },
  };
}
