import type { BlockOutputs } from "../core/execution/timeline-runner";
import type { NumberPanelField, OutputPanelField } from "./block-definition";
import type { Placement } from "../core/blocks/placement.ts";

export type NumberInputSpec<T> = NumberPanelField<T> & {
  readonly section: "input";
  readonly slot: true;
};

export function numberInput<T>(
  spec: NumberInputSpec<T>,
): NumberInputSpec<T> & {
  resolve(block: Placement<T>, readSlot: (id: string) => number): number;
} {
  return {
    ...spec,
    resolve(block, readSlot) {
      const slotId = block.slotBindings?.[spec.key];
      return slotId === undefined ? spec.value(block.data) : readSlot(slotId);
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
