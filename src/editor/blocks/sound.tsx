import { Volume2 } from "lucide-react";
import type { BlockDefinitionSpec } from "../block-definition";
import { MediaExecution } from "../block-runtime";
import { durationField } from "./duration-data";
import {
  mediaCarry,
  mediaFromCarry,
  mediaPhases,
  onMediaLengthChange,
  type MediaData,
} from "./media-data";
import { mediaRenderBlock } from "./media-block";
import {
  fadesField,
  mediaFadeTitle,
  mediaGesture,
  MEDIA_TIMELINE_CLASS,
} from "./media-fades";

const duration = durationField<MediaData>();

const sound: BlockDefinitionSpec<MediaData> = {
  kind: "sound",
  label: "Sound",
  color: "#059669",
  icon: Volume2,
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
  renderBlock: mediaRenderBlock,
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
    ),
};

export default sound;
