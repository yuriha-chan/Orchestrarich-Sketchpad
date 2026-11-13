import { Video } from "lucide-react";
import type { BlockDefinitionSpec } from "../block-definition";
import { TimedExecution } from "../block-runtime";
import { durationCarry, durationField, durationFromCarry, onDurationLengthChange, type DurationData } from "./duration-data";

const duration = durationField<DurationData>();

const camera: BlockDefinitionSpec<DurationData> = {
  kind: "camera",
  label: "Camera",
  color: "#7c3aed",
  icon: Video,
  fields: [duration],
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
      duration.resolve(block.data, { length: block.length, bpm: context.bpm }) * 1000,
    ),
};

export default camera;
