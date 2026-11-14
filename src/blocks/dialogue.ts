import type { BlockSnapshot, BlockStartResult } from "../core/execution/timeline-runner.ts";
import type { BlockDefinitionSpec } from "./block-definition";
import { ExecutionInstance, type ExecutionContext } from "../core/blocks/runtime.ts";
import type { Placement } from "../core/blocks/placement.ts";

interface DialogueData {}

class DialogueExecution extends ExecutionInstance {
  constructor(
    block: Placement<DialogueData>,
    private readonly context: ExecutionContext,
  ) {
    super(block);
  }

  startPhase(block: BlockSnapshot): BlockStartResult {
    const execution = new Promise<void>((resolve) => {
      this.context.stage.addDialogue({
        id: this.id,
        type: "dialogue",
        layer: "card",
        label: `Dialogue @${block.start}`,
        text: "lazy dog jumps ...",
        confirm: () => {
          this.context.stage.remove(this.id);
          this.context.report(`Dialogue advanced: ${this.placement.id} at t=${this.context.time()}`);
          resolve();
        },
      });
    });
    return { execution };
  }

  terminatePhase(_block: BlockSnapshot): void {}

  terminate(): void {
    this.context.stage.remove(this.id);
  }
}

const dialogue: BlockDefinitionSpec<DialogueData> = {
  kind: "dialogue",
  label: "Dialogue",
  color: "#2563eb",
  icon: "MessageSquare",
  fields: [
    {
      kind: "note",
      section: "block",
      key: "note",
      label: "Note",
      text: "Dialogue completes with the OK button.",
    },
  ],
  createData: () => ({}),
  convertFrom: () => ({}),
  createExecution: (context, block) => new DialogueExecution(block, context),
};

export default dialogue;
