import type { BlockSnapshot, BlockStartResult } from "../core/execution/timeline-runner.ts";
import type { BlockDefinitionSpec } from "./block-definition";
import { stringInput } from "./block-inputs";
import { ExecutionInstance, type ExecutionContext } from "../core/blocks/runtime.ts";
import type { Placement } from "../core/blocks/placement.ts";

export const DEFAULT_DIALOGUE_MESSAGE = "lazy dog jumps ...";

export interface DialogueData {
  message: string;
}

const messageInput = stringInput<DialogueData>({
  kind: "string",
  section: "input",
  key: "message",
  label: "Message",
  slot: true,
  value: (data) => data.message,
  commit: (data, value) => ({ ...data, message: value }),
});

class DialogueExecution extends ExecutionInstance {
  private readonly message: string;

  constructor(
    block: Placement<DialogueData>,
    private readonly context: ExecutionContext,
  ) {
    super(block);
    this.message = messageInput.resolve(block, context.readSlot);
  }

  startPhase(block: BlockSnapshot): BlockStartResult {
    const execution = new Promise<void>((resolve) => {
      this.context.stage.addDialogue({
        id: this.id,
        type: "dialogue",
        layer: "card",
        label: `Dialogue @${block.start}`,
        text: this.message,
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
    messageInput,
    {
      kind: "note",
      section: "block",
      key: "note",
      label: "Note",
      text: "Dialogue completes with the OK button.",
    },
  ],
  createData: () => ({ message: DEFAULT_DIALOGUE_MESSAGE }),
  convertFrom: () => ({ message: DEFAULT_DIALOGUE_MESSAGE }),
  createExecution: (context, block) => new DialogueExecution(block, context),
};

export default dialogue;
