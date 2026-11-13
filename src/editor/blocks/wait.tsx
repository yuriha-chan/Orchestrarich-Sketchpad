import { Hourglass } from "lucide-react";
import type { BlockDefinitionSpec } from "../block-definition";
import { TimedExecution } from "../block-runtime";
import { durationCarry, durationFromCarry, durationSeconds, onDurationLengthChange, type DurationData } from "./duration-data";

const wait: BlockDefinitionSpec<DurationData> = {
  kind: "wait",
  label: "Wait",
  color: "#475569",
  icon: Hourglass,
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

export default wait;
