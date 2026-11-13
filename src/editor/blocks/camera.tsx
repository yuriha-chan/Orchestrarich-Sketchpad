import { Video } from "lucide-react";
import type { BlockDefinitionSpec } from "../block-definition";
import { TimedExecution } from "../block-runtime";
import { durationCarry, durationFromCarry, durationSeconds, onDurationLengthChange, type DurationData } from "./duration-data";

const camera: BlockDefinitionSpec<DurationData> = {
  kind: "camera",
  label: "Camera",
  color: "#7c3aed",
  icon: Video,
  fields: [
    { kind: "duration", section: "block", key: "duration", label: "Duration" },
  ],
  createData: (length) => ({
    duration: length,
    durationUnit: "beats",
    syncBeatsToCellSpan: false,
  }),
  carryOver: durationCarry,
  convertFrom: durationFromCarry,
  onLengthChange: onDurationLengthChange,
  createExecution: (context, block) =>
    new TimedExecution(
      block,
      context,
      durationSeconds(block.data, block.length, context.bpm) * 1000,
    ),
};

export default camera;
