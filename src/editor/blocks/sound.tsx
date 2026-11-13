import { Volume2 } from "lucide-react";
import type { BlockDefinitionSpec } from "../block-definition";
import { MediaExecution } from "../block-runtime";
import { durationSeconds } from "./duration-data";
import {
  fadeBoundaries,
  mediaCarry,
  mediaFromCarry,
  mediaPhases,
  onMediaLengthChange,
  type MediaData,
} from "./media-data";
import { mediaRenderBlock } from "./media-block";
import { mediaFadeHandles } from "./media-fades";

const sound: BlockDefinitionSpec<MediaData> = {
  kind: "sound",
  label: "Sound",
  color: "#059669",
  icon: Volume2,
  fields: [
    { kind: "duration", section: "block", key: "duration", label: "Duration" },
    { kind: "fades", section: "block", key: "fades", label: "Fades" },
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
  fadeHandles: mediaFadeHandles,
  phases: (data, length) => mediaPhases(data.fadeIn, data.fadeOut, length),
  phaseBoundaries: (block) =>
    fadeBoundaries(
      block.data.fadeIn,
      block.data.fadeOut,
      block.length,
    ).map((boundary) => boundary.offset),
  onLengthChange: onMediaLengthChange,
  createExecution: (context, block) =>
    new MediaExecution(
      block,
      context,
      durationSeconds(block.data, block.length, context.bpm) * 1000,
    ),
};

export default sound;
