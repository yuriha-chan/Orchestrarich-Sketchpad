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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

const runner = new TimelineRunner(definition, {
  onBlockStart(block) {
    if (block.id === "sfx") {
      return { execution: delay(300) };
    }
    if (block.id === "line-hold") {
      return { execution: new Promise<void>(() => {}) };
    }
    if (block.id === "open-door") {
      return {
        execution: (async () => {
          await delay(800);
          throw new Error("door is jammed");
        })(),
      };
    }
    return undefined;
  },
  onBlockTerminate(block) {
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

console.log("Experiment 1-A: Promise-based block execution");
console.log(
  "sfx resolves after 300ms, open-door throws after 800ms, line-hold never settles.",
);

runner.start();
