import { Calculator } from "lucide-react";
import type { BlockSnapshot, BlockStartResult } from "../../core/execution/timeline-runner.ts";
import type { BlockDefinitionSpec } from "../block-definition";
import { numberInput, numberOutput } from "../block-inputs";
import { ExecutionInstance, type ExecutionContext } from "../block-runtime";
import type { Placement } from "../model";

export interface AdditionData {
  inputA: number;
  inputB: number;
}

class AdditionExecution extends ExecutionInstance {
  private readonly value: number;

  constructor(
    block: Placement<AdditionData>,
    context: ExecutionContext,
  ) {
    super(block);
    this.value =
      inputA.resolve(block, context.readSlot) +
      inputB.resolve(block, context.readSlot);
  }

  startPhase(_block: BlockSnapshot): BlockStartResult {
    return { execution: Promise.resolve(output.emit(this.value)) };
  }

  terminatePhase(_block: BlockSnapshot): void {}

  terminate(): void {}
}

const inputA = numberInput<AdditionData>({
  kind: "number",
  section: "input",
  key: "a",
  label: "A",
  slot: true,
  min: -1000000,
  max: 1000000,
  value: (data) => data.inputA,
  commit: (data, value) =>
    Number.isFinite(value) ? { ...data, inputA: value } : data,
});
const inputB = numberInput<AdditionData>({
  kind: "number",
  section: "input",
  key: "b",
  label: "B",
  slot: true,
  min: -1000000,
  max: 1000000,
  value: (data) => data.inputB,
  commit: (data, value) =>
    Number.isFinite(value) ? { ...data, inputB: value } : data,
});
const output = numberOutput<AdditionData>({
  kind: "output",
  section: "output",
  key: "out",
  label: "Output",
});

const addition: BlockDefinitionSpec<AdditionData> = {
  kind: "addition",
  label: "Addition",
  color: "#0891b2",
  icon: Calculator,
  fields: [
    inputA,
    inputB,
    {
      kind: "note",
      section: "block",
      key: "note",
      label: "Note",
      text: "The addition computes instantly; its output is assigned when the block ends.",
    },
    output,
  ],
  createData: () => ({ inputA: 0, inputB: 0 }),
  convertFrom: () => ({ inputA: 0, inputB: 0 }),
  createExecution: (context, block) => new AdditionExecution(block, context),
};

export default addition;
