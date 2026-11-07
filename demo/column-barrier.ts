import { createInterface } from "node:readline";

import {
  TimelineRunner,
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
      id: "animation",
      blocks: [{ id: "open-door", start: 0, length: 1 }],
    },
    {
      id: "sound",
      blocks: [{ id: "sfx", start: 0, length: 1 }],
    },
  ],
};

const durations: Record<string, number> = {
  "open-door": 800,
  sfx: 300,
  "next-line": 500,
};

const timers = new Map<string, NodeJS.Timeout>();
let resolveClickWait: (() => void) | undefined;

const runner = new TimelineRunner(definition, {
  onBlockStart(block) {
    if (block.id === "click-wait") {
      return {
        execution: new Promise<void>((resolve) => {
          resolveClickWait = resolve;
        }),
      };
    }

    const duration = durations[block.id];
    if (duration === undefined) {
      throw new Error(`No duration configured for block: ${block.id}`);
    }

    return {
      execution: new Promise<void>((resolve) => {
        timers.set(
          block.id,
          setTimeout(() => {
            timers.delete(block.id);
            resolve();
          }, duration),
        );
      }),
    };
  },
});

function printSnapshot(snapshot: TimelineSnapshot): void {
  if (snapshot.phase !== "running") {
    if (snapshot.phase === "finished") {
      console.log(`t=${snapshot.time}  timeline finished`);
    }
    return;
  }

  const blocking = snapshot.blockingBlockIds.map((id) => {
    const block = snapshot.blocks.find((candidate) => candidate.id === id);
    return block === undefined ? id : `${block.id} (${block.trackId})`;
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
  resolveClickWait?.();
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

console.log("Experiment 1-A: column barrier synchronization");
console.log("t does not advance until all blocks in the same column complete.");
console.log("Animation 800ms / sound effect 300ms / dialogue is a click wait.");

if (process.stdin.isTTY === true) {
  readline = createInterface({ input: process.stdin, output: process.stdout });
  readline.once("line", () => {
    readline?.close();
    sendClick();
  });
  console.log("Press Enter to complete the click-wait block.");
} else {
  console.log("Not a TTY, so a click will be sent automatically after 1500ms.");
  setTimeout(sendClick, 1500);
}

runner.start();
