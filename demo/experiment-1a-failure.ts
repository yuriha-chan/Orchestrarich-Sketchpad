import {
  TimelineRunner,
  type BlockSnapshot,
  type TimelineDefinition,
  type TimelineSnapshot,
} from "../src/core/execution/timeline-runner.ts";

const definition: TimelineDefinition = {
  tracks: [
    {
      id: "dialogue",
      blocks: [
        { id: "line-hold", start: 0, length: 1 },
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

const timers = new Map<string, NodeJS.Timeout>();

const runner = new TimelineRunner(definition, {
  onBlockStart(block) {
    if (block.id === "next-line") {
      return undefined;
    }

    if (block.id === "open-door") {
      return {
        execution: new Promise<void>((_, reject) => {
          timers.set(
            block.id,
            setTimeout(() => {
              timers.delete(block.id);
              console.log(`open-door fails at t=${runner.time}`);
              reject(new Error("open-door failed"));
            }, 800),
          );
        }),
      };
    }

    const duration = block.id === "sfx" ? 300 : 5000;
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
  onBlockTerminate(block) {
    const timer = timers.get(block.id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(block.id);
    }
    console.log(
      `Termination at t=${runner.time}: ${describeBlock(block)} (${block.state})`,
    );
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
  if (snapshot.phase === "finished") {
    console.log(`t=${snapshot.time}  timeline finished`);
    return;
  }
  if (snapshot.phase === "failed") {
    console.log(`t=${snapshot.time}  timeline failed`);
    for (const block of snapshot.blocks) {
      console.log(`  ${describeBlock(block)}: ${block.state}`);
    }
    return;
  }

  const blocking = snapshot.blockingBlockIds.map((id) => {
    const block = snapshot.blocks.find((candidate) => candidate.id === id);
    return block === undefined ? id : describeBlock(block);
  });
  console.log(`t=${snapshot.time}  blocked by: ${blocking.join(", ")}`);
}

let lastRendered = "";
runner.subscribe((snapshot) => {
  const key = JSON.stringify({
    phase: snapshot.phase,
    time: snapshot.time,
    blocking: snapshot.blockingBlockIds,
    states: snapshot.blocks.map((block) => [block.id, block.state]),
  });
  if (key === lastRendered) {
    return;
  }
  lastRendered = key;
  printSnapshot(snapshot);
});

console.log("Experiment 1-A: block execution failure");
console.log(
  "open-door fails at 800ms while line-hold is still running and sfx has completed.",
);

runner.start();
