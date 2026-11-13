import { Hourglass } from "lucide-react";
import type { BlockDefinitionSpec } from "../block-definition";
import { TimedExecution } from "../block-runtime";
import { durationCarry, durationField, durationFromCarry, onDurationLengthChange, type DurationData } from "./duration-data";

const duration = durationField<DurationData>();

const wait: BlockDefinitionSpec<DurationData> = {
  kind: "wait",
  label: "Wait",
  color: "#475569",
  icon: Hourglass,
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

export default wait;
