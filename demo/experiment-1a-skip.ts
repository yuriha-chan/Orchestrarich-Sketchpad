import { createInterface } from "node:readline";

import {
  TimelineRunner,
  type BlockSnapshot,
  type SkipReason,
  type TimelineDefinition,
  type TimelineSnapshot,
} from "../src/core/execution/timeline-runner.ts";

const definition: TimelineDefinition = {
  tracks: [
    {
      id: "dialogue",
      blocks: [
        { id: "click-wait", start: 0, length: 1 },
        { id: "next-line", start: 1, length: 1 },
      ],
    },
    {
      id: "bgm",
      blocks: [
        { id: "loop-bgm", start: 0, length: 3, cooperativeSkip: true },
      ],
    },
    {
      id: "sound",
      blocks: [{ id: "sfx", start: 0, length: 1 }],
    },
  ],
};

const durations: Record<string, number> = {
  "loop-bgm": 5000,
  sfx: 300,
  "next-line": 500,
};

const timers = new Map<string, NodeJS.Timeout>();
const resolutions = new Map<string, () => void>();
const fading = new Set<string>();

function finish(blockId: string): void {
  timers.delete(blockId);
  fading.delete(blockId);
  resolutions.get(blockId)?.();
}

const runner = new TimelineRunner(definition, {
  onBlockStart(block) {
    let resolveExecution!: () => void;
    const execution = new Promise<void>((resolve) => {
      resolveExecution = resolve;
    });
    resolutions.set(block.id, resolveExecution);

    const skip = (reason: SkipReason) => {
      const label = reason === "user" ? "user" : "cooperative";
      console.log(
        `Skip request (${label}) at t=${runner.time}: ${describeBlock(block)}`,
      );

      if (block.id !== "loop-bgm") {
        console.log(`  ${block.id} ignores the skip request`);
        return;
      }
      if (fading.has(block.id)) {
        return;
      }

      const timer = timers.get(block.id);
      if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(block.id);
      }

      fading.add(block.id);
      console.log("  loop-bgm fades out over 200ms and completes");
      timers.set(
        block.id,
        setTimeout(() => finish(block.id), 200),
      );
    };

    if (block.id === "click-wait") {
      return { execution, skip };
    }

    const duration = durations[block.id];
    if (duration === undefined) {
      throw new Error(`No duration configured for block: ${block.id}`);
    }

    timers.set(
      block.id,
      setTimeout(() => finish(block.id), duration),
    );
    return { execution, skip };
  },
  onBlockTerminate(block) {
    console.log(`Termination at t=${runner.time}: ${describeBlock(block)}`);
  },
});

function describeBlock(block: BlockSnapshot): string {
  const span =
    block.end - block.start === 1
      ? `${block.start}`
      : `${block.start}-${block.end}`;
  return `${block.id} (${block.trackId}, ${span})`;
}

function printSnapshot(snapshot: TimelineSnapshot): void {
  if (snapshot.phase !== "running") {
    if (snapshot.phase === "finished") {
      console.log(`t=${snapshot.time}  timeline finished`);
    }
    return;
  }

  const blocking = snapshot.blockingBlockIds.map((id) => {
    const block = snapshot.blocks.find((candidate) => candidate.id === id);
    return block === undefined ? id : describeBlock(block);
  });

  console.log(`t=${snapshot.time}  blocked by: ${blocking.join(", ")}`);
}

let readline: ReturnType<typeof createInterface> | undefined;
let clickSent = false;

function sendClick(): void {
  if (clickSent) {
    return;
  }
  clickSent = true;
  resolutions.get("click-wait")?.();
}

let lastRendered = "";
runner.subscribe((snapshot) => {
  const key = JSON.stringify({
    phase: snapshot.phase,
    time: snapshot.time,
    blocking: snapshot.blockingBlockIds,
  });
  if (key === lastRendered) {
    return;
  }
  lastRendered = key;
  printSnapshot(snapshot);

  if (snapshot.phase === "finished") {
    readline?.close();
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
  }
});

console.log("Experiment 1-A: skip and cooperative skip mode");
console.log(
  "loop-bgm spans 3 cells and is waited for only at its end-time barrier.",
);
console.log(
  "When the closing-side blocks complete, only cooperative-skip blocks remain, and a skip request is issued automatically.",
);

if (process.stdin.isTTY === true) {
  readline = createInterface({ input: process.stdin, output: process.stdout });
  readline.on("line", (line) => {
    if (line.trim().toLowerCase() === "s") {
      runner.requestSkip();
      return;
    }
    sendClick();
  });
  console.log("Enter: complete the click wait / s + Enter: skip request");
} else {
  console.log("Not a TTY, so a click will be sent automatically after 1500ms.");
  setTimeout(sendClick, 1500);
}

runner.start();
