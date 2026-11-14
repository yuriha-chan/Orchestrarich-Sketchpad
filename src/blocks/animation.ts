import type { BlockDefinitionSpec } from "./block-definition";
import {
  MediaExecution,
  type MediaPresentation,
} from "../core/blocks/runtime.ts";
import type {
  StageAnimationCard,
  StageAnimationPlayback,
} from "../core/blocks/presentation.ts";
import type { Placement } from "../core/blocks/placement.ts";
import type { StageActions } from "../core/blocks/presentation.ts";
import { durationField } from "./duration-data";
import {
  mediaCarry,
  mediaFromCarry,
  mediaPhases,
  onMediaLengthChange,
  type MediaData,
} from "./media-data";
import {
  fadesField,
  mediaFadeTitle,
  mediaGesture,
  MEDIA_TIMELINE_CLASS,
} from "./media-fades";

class AnimationPresentation implements MediaPresentation {
  constructor(
    private readonly block: Placement<MediaData>,
    private readonly stage: StageActions,
  ) {}

  initialize(id: string, durationMs: number): void {
    const payload: StageAnimationCard = {
      id,
      type: "animation",
      layer: "card",
      label: `Animation @${this.block.start}–${this.block.start + this.block.length}`,
      durationMs,
      fadeInFraction: this.block.data.fadeIn / this.block.length,
      fadeOutFraction: this.block.data.fadeOut / this.block.length,
      playback: { positionMs: 0, playing: true },
    };
    this.stage.addAnimation(payload);
  }

  setPlayback(id: string, playback: StageAnimationPlayback): void {
    this.stage.updateAnimationPlayback(id, playback);
  }

  terminate(id: string): void {
    this.stage.remove(id);
  }
}

const duration = durationField<MediaData>();

const animation: BlockDefinitionSpec<MediaData> = {
  kind: "animation",
  label: "Animation",
  color: "#ea580c",
  icon: "Clapperboard",
  fields: [
    duration,
    fadesField<MediaData>(),
  ],
  createData: (length) => ({
    duration: length,
    durationUnit: "beats",
    syncBeatsToCellSpan: false,
    fadeIn: 0,
    fadeOut: 0,
  }),
  carryOver: mediaCarry,
  convertFrom: mediaFromCarry,
  timelineFades: true,
  timelineClassName: MEDIA_TIMELINE_CLASS,
  timelineTitle: mediaFadeTitle,
  phases: (data, length) => mediaPhases(data.fadeIn, data.fadeOut, length),
  timelineGesture: mediaGesture,
  onLengthChange: onMediaLengthChange,
  createExecution: (context, block) =>
    new MediaExecution(
      block,
      context,
      duration.resolve(block.data, { length: block.length, bpm: context.bpm }) * 1000,
      new AnimationPresentation(block, context.stage),
    ),
};

export default animation;
