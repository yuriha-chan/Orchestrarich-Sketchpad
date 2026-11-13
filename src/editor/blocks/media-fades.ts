import type { FadeData, FadeHandles } from "../block-definition";
import type { Placement } from "../model";
import { clampFadesToLength, type MediaData } from "./media-data";

export function mediaFadeHandles<T extends MediaData>(
  block: Placement<T>,
  update: (change: (data: T) => T) => void,
): FadeHandles {
  const length = block.length;
  return {
    fadeIn: block.data.fadeIn,
    fadeOut: block.data.fadeOut,
    setFadeIn(value) {
      update((current) => {
        const fades = clampFadesToLength(value, current.fadeOut, length);
        return { ...current, ...fades };
      });
    },
    setFadeOut(value) {
      update((current) => {
        const fades = clampFadesToLength(current.fadeIn, value, length);
        return { ...current, ...fades };
      });
    },
    setFades(fades: FadeData) {
      update((current) => ({
        ...current,
        ...clampFadesToLength(fades.fadeIn, fades.fadeOut, length),
      }));
    },
  };
}
