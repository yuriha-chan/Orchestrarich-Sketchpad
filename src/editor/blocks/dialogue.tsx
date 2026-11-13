import { Check, MessageSquare } from "lucide-react";
import type { BlockSnapshot, BlockStartResult } from "../../core/execution/timeline-runner.ts";
import type { BlockDefinitionSpec, StageViewProps } from "../block-definition";
import { ExecutionInstance, type ExecutionContext } from "../block-runtime";
import type { Placement } from "../model";

interface DialogueData {}

export interface DialoguePayload {
  readonly label: string;
  readonly text: string;
  readonly confirm: () => void;
}

class DialogueExecution extends ExecutionInstance {
  constructor(
    block: Placement<DialogueData>,
    private readonly context: ExecutionContext,
  ) {
    super(block);
  }

  startPhase(block: BlockSnapshot): BlockStartResult {
    const execution = new Promise<void>((resolve) => {
      this.context.stage.add({
        id: this.id,
        kind: "dialogue",
        layer: "card",
        payload: {
          label: `Dialogue @${block.start}`,
          text: "lazy dog jumps ...",
          confirm: () => {
            this.context.stage.remove(this.id);
            this.context.report(`Dialogue advanced: ${this.placement.id} at t=${this.context.time()}`);
            resolve();
          },
        } satisfies DialoguePayload,
      });
    });
    return { execution };
  }

  terminatePhase(_block: BlockSnapshot): void {}

  terminate(): void {
    this.context.stage.remove(this.id);
  }
}

function DialogueStage({ view }: StageViewProps<DialoguePayload>) {
  return (
    <div className="stage-dialogue">
      <span className="stage-tag">
        <MessageSquare size={12} aria-hidden="true" />
        {view.payload.label}
      </span>
      <p className="stage-dialogue-text">{view.payload.text}</p>
      <button type="button" className="stage-ok" onClick={view.payload.confirm}>
        <Check size={14} aria-hidden="true" />
        OK
      </button>
    </div>
  );
}

const dialogue: BlockDefinitionSpec<DialogueData, DialoguePayload> = {
  kind: "dialogue",
  label: "Dialogue",
  color: "#2563eb",
  icon: MessageSquare,
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
  renderStage: DialogueStage,
  createExecution: (context, block) => new DialogueExecution(block, context),
};

export default dialogue;
