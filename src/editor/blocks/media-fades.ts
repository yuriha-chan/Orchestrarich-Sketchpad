import type {
  FadeData,
  FadeEdit,
  FadeHandles,
  FadesPanelField,
} from "../block-definition";
import type { Placement } from "../model";
import { clampFadesToLength } from "./media-data";

export function fadesField<T extends FadeData>(): FadesPanelField<T> {
  return {
    kind: "fades",
    section: "block",
    key: "fades",
    label: "Fades",
    read(data) {
      return { fadeIn: data.fadeIn, fadeOut: data.fadeOut };
    },
    commit(data, edit, context) {
      return editFades(data, edit, context);
    },
  };
}

export function editFades<T extends FadeData>(
  data: T,
  edit: FadeEdit,
  context: { length: number },
): T {
  const next: FadeData =
    edit.kind === "pair"
      ? edit.value
      : edit.kind === "fadeIn"
        ? { fadeIn: edit.value, fadeOut: data.fadeOut }
        : { fadeIn: data.fadeIn, fadeOut: edit.value };
  return {
    ...data,
    ...clampFadesToLength(next.fadeIn, next.fadeOut, context.length),
  };
}

export function mediaFadeHandles<T extends FadeData>(
  block: Placement<T>,
  update: (change: (data: T) => T) => void,
): FadeHandles {
  const length = block.length;
  return {
    fadeIn: block.data.fadeIn,
    fadeOut: block.data.fadeOut,
    setFadeIn(value) {
      update((current) =>
        editFades(current, { kind: "fadeIn", value }, { length }),
      );
    },
    setFadeOut(value) {
      update((current) =>
        editFades(current, { kind: "fadeOut", value }, { length }),
      );
    },
    setFades(fades: FadeData) {
      update((current) =>
        editFades(current, { kind: "pair", value: fades }, { length }),
      );
    },
  };
}
