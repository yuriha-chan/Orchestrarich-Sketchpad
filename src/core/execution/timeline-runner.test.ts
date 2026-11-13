import { describe, expect, it } from "vitest";

import {
  TimelineRunner,
  type BlockSnapshot,
  type LoopDefinition,
  type SkipReason,
  type TimelineDefinition,
  type TimelineSnapshot,
} from "./timeline-runner.ts";

interface Deferred {
  readonly promise: Promise<void>;
  resolve: () => void;
  reject: (error?: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface RunnerConfig {
  readonly onTimeStart?: (time: number) => void;
  readonly onStart?: (block: BlockSnapshot) => void;
  readonly onSkip?: (
    block: BlockSnapshot,
    reason: SkipReason,
    resolve: (blockId: string) => void,
  ) => void | Promise<void>;
  readonly onTerminate?: (block: BlockSnapshot) => void;
  readonly onLoopRepeat?: (
    loop: LoopDefinition,
    endTime: number,
    startTime: number,
  ) => void;
}

function createRunner(
  definition: TimelineDefinition,
  config: RunnerConfig = {},
) {
  const executions = new Map<string, Deferred>();

  const resolve = (blockId: string): void => {
    const execution = executions.get(blockId);
    if (execution === undefined) {
      throw new Error(`Block has not started: ${blockId}`);
    }
    execution.resolve();
  };

  const reject = (blockId: string, error?: unknown): void => {
    const execution = executions.get(blockId);
    if (execution === undefined) {
      throw new Error(`Block has not started: ${blockId}`);
    }
    execution.reject(error);
  };

  const runner = new TimelineRunner(definition, {
    onTimeStart: config.onTimeStart,
    onLoopRepeat: config.onLoopRepeat,
    onBlockStart: (block) => {
      config.onStart?.(block);
      const execution = deferred();
      executions.set(block.id, execution);
      return {
        execution: execution.promise,
        skip:
          config.onSkip === undefined
            ? undefined
            : (reason) => config.onSkip!(block, reason, resolve),
      };
    },
    onBlockTerminate: config.onTerminate,
  });

  return { runner, resolve, reject, executions };
}

function createTimeline(): TimelineDefinition {
  return {
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
        blocks: [{ id: "animation", start: 0, length: 1 }],
      },
      {
        id: "sound",
        blocks: [{ id: "sfx", start: 0, length: 1 }],
      },
    ],
  };
}

describe("TimelineRunner column barrier", () => {
  it("starts every block in the current column", () => {
    const { runner } = createRunner(createTimeline());

    runner.start();

    expect(runner.phase).toBe("running");
    expect(runner.time).toBe(0);
    expect(
      runner.snapshot().blocks
        .filter((block) => block.start === 0)
        .map((block) => [block.id, block.state]),
    ).toEqual([
      ["click-wait", "running"],
      ["animation", "running"],
      ["sfx", "running"],
    ]);
    expect(runner.snapshot().blockingBlockIds).toEqual([
      "click-wait",
      "animation",
      "sfx",
    ]);
  });

  it("does not advance while the click wait remains after the animation finishes", async () => {
    const { runner, resolve } = createRunner(createTimeline());

    runner.start();
    resolve("animation");
    resolve("sfx");
    await flush();

    expect(runner.time).toBe(0);
    expect(runner.phase).toBe("running");
    expect(runner.snapshot().blockingBlockIds).toEqual(["click-wait"]);

    resolve("click-wait");
    await flush();

    expect(runner.time).toBe(1);
    expect(runner.snapshot().blockingBlockIds).toEqual(["next-line"]);
  });

  it("does not advance while the animation remains after the click wait finishes", async () => {
    const { runner, resolve } = createRunner(createTimeline());

    runner.start();
    resolve("click-wait");
    await flush();

    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual([
      "animation",
      "sfx",
    ]);

    resolve("animation");
    await flush();

    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual(["sfx"]);

    resolve("sfx");
    await flush();

    expect(runner.time).toBe(1);
  });

  it("advances to the next column and finishes after the last block", async () => {
    const { runner, resolve } = createRunner(createTimeline());

    runner.start();
    resolve("click-wait");
    resolve("animation");
    resolve("sfx");
    await flush();

    expect(runner.time).toBe(1);
    expect(
      runner.snapshot().blocks.find((block) => block.id === "next-line")?.state,
    ).toBe("running");

    resolve("next-line");
    await flush();

    expect(runner.phase).toBe("finished");
    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual([]);
    expect(
      runner.snapshot().blocks.every((block) => block.state === "completed"),
    ).toBe(true);
  });

  it("notifies runner state updates as blocks finish and barriers advance in order", async () => {
    const { runner, resolve } = createRunner(createTimeline());
    const snapshots: TimelineSnapshot[] = [];
    let checkedUpdates = 0;

    const expectUpdate = (
      time: number,
      phase: TimelineSnapshot["phase"],
      states: Readonly<Record<string, BlockSnapshot["state"]>>,
      blockingBlockIds: readonly string[],
    ): void => {
      const updates = snapshots.slice(checkedUpdates).map((snapshot) => ({
        time: snapshot.time,
        phase: snapshot.phase,
        states: Object.fromEntries(
          snapshot.blocks.map((block) => [block.id, block.state]),
        ),
        blockingBlockIds: new Set(snapshot.blockingBlockIds),
      }));

      expect(updates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          time,
          phase,
          states: expect.objectContaining(states),
          blockingBlockIds: new Set(blockingBlockIds),
        }),
      ]));
      checkedUpdates = snapshots.length;
    };

    runner.subscribe((snapshot) => snapshots.push(snapshot));
    runner.start();
    await flush();
    expectUpdate(0, "running", {
      "click-wait": "running",
      animation: "running",
      sfx: "running",
      "next-line": "pending",
    }, ["click-wait", "animation", "sfx"]);

    resolve("animation");
    await flush();
    expectUpdate(0, "running", {
      animation: "completed",
      "click-wait": "running",
      sfx: "running",
      "next-line": "pending",
    }, ["click-wait", "sfx"]);

    resolve("sfx");
    await flush();
    expectUpdate(0, "running", {
      animation: "completed",
      sfx: "completed",
      "click-wait": "running",
      "next-line": "pending",
    }, ["click-wait"]);

    resolve("click-wait");
    await flush();
    expectUpdate(1, "running", {
      animation: "completed",
      sfx: "completed",
      "click-wait": "completed",
      "next-line": "running",
    }, ["next-line"]);

    resolve("next-line");
    await flush();
    expectUpdate(2, "finished", {
      animation: "completed",
      sfx: "completed",
      "click-wait": "completed",
      "next-line": "completed",
    }, []);

    const notifiedTimes = snapshots.map((snapshot) => snapshot.time);
    expect(notifiedTimes).toEqual([...notifiedTimes].sort((a, b) => a - b));
  });

  it("calls onBlockStart once per block", async () => {
    const started: string[] = [];
    const { runner, resolve } = createRunner(createTimeline(), {
      onStart: (block) => {
        started.push(block.id);
      },
    });

    runner.start();
    expect(started).toEqual(["click-wait", "animation", "sfx"]);

    resolve("click-wait");
    resolve("animation");
    resolve("sfx");
    await flush();

    expect(started).toEqual([
      "click-wait",
      "animation",
      "sfx",
      "next-line",
    ]);
  });

  it("completes on the microtask after a block starts", async () => {
    const runner = new TimelineRunner(
      {
        tracks: [
          { id: "a", blocks: [{ id: "a0", start: 0, length: 1 }] },
          { id: "b", blocks: [{ id: "b0", start: 0, length: 1 }] },
        ],
      },
      {
        onBlockStart: () => ({ execution: Promise.resolve() }),
      },
    );

    runner.start();
    expect(runner.phase).toBe("running");

    await flush();

    expect(runner.phase).toBe("finished");
    expect(runner.time).toBe(1);
  });

  it("advances through columns without blocks immediately", () => {
    const runner = new TimelineRunner({
      tracks: [{ id: "a", blocks: [{ id: "late", start: 2, length: 1 }] }],
    });

    runner.start();

    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["late"]);
  });

  it("finishes an empty timeline immediately", () => {
    const runner = new TimelineRunner({ tracks: [] });

    runner.start();

    expect(runner.phase).toBe("finished");
    expect(runner.time).toBe(0);
  });
});

describe("TimelineRunner time boundary", () => {
  it("notifies each time boundary before the blocks at that time", async () => {
    const events: Array<["time", number] | ["block", string]> = [];
    const { runner, resolve } = createRunner(createTimeline(), {
      onTimeStart: (time) => events.push(["time", time]),
      onStart: (block) => events.push(["block", block.id]),
    });

    runner.start();

    expect(events).toEqual([
      ["time", 0],
      ["block", "click-wait"],
      ["block", "animation"],
      ["block", "sfx"],
    ]);

    resolve("animation");
    resolve("sfx");
    await flush();

    expect(events).toEqual([
      ["time", 0],
      ["block", "click-wait"],
      ["block", "animation"],
      ["block", "sfx"],
    ]);

    resolve("click-wait");
    await flush();

    expect(events).toEqual([
      ["time", 0],
      ["block", "click-wait"],
      ["block", "animation"],
      ["block", "sfx"],
      ["time", 1],
      ["block", "next-line"],
    ]);

    resolve("next-line");
    await flush();

    expect(events).toEqual([
      ["time", 0],
      ["block", "click-wait"],
      ["block", "animation"],
      ["block", "sfx"],
      ["time", 1],
      ["block", "next-line"],
    ]);
    expect(runner.phase).toBe("finished");
    expect(runner.time).toBe(2);
  });

  it("observes empty intermediate times between blocks", async () => {
    const events: Array<["time", number] | ["block", string]> = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "a",
            blocks: [
              { id: "first", start: 0, length: 1 },
              { id: "second", start: 2, length: 1 },
            ],
          },
        ],
      },
      {
        onTimeStart: (time) => events.push(["time", time]),
        onStart: (block) => events.push(["block", block.id]),
      },
    );

    runner.start();

    expect(events).toEqual([
      ["time", 0],
      ["block", "first"],
    ]);

    resolve("first");
    await flush();

    expect(events).toEqual([
      ["time", 0],
      ["block", "first"],
      ["time", 1],
      ["time", 2],
      ["block", "second"],
    ]);

    resolve("second");
    await flush();

    expect(events).toEqual([
      ["time", 0],
      ["block", "first"],
      ["time", 1],
      ["time", 2],
      ["block", "second"],
    ]);
    expect(runner.phase).toBe("finished");
    expect(runner.time).toBe(3);
  });

  it("does not re-fire a time boundary when the pump revisits a time", async () => {
    const times: number[] = [];
    const { runner, resolve } = createRunner(createTimeline(), {
      onTimeStart: (time) => times.push(time),
    });

    runner.start();
    expect(times).toEqual([0]);

    resolve("animation");
    await flush();
    expect(times).toEqual([0]);

    resolve("sfx");
    await flush();
    expect(times).toEqual([0]);

    resolve("click-wait");
    await flush();
    expect(times).toEqual([0, 1]);

    resolve("next-line");
    await flush();
    expect(times).toEqual([0, 1]);
    expect(runner.phase).toBe("finished");
  });

  it("does not fire a time boundary at the horizon", async () => {
    const times: number[] = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [{ id: "a", blocks: [{ id: "only", start: 0, length: 1 }] }],
      },
      { onTimeStart: (time) => times.push(time) },
    );

    runner.start();
    expect(times).toEqual([0]);

    resolve("only");
    await flush();

    expect(times).toEqual([0]);
    expect(runner.phase).toBe("finished");
    expect(runner.time).toBe(1);
  });
});

describe("TimelineRunner end-time barrier", () => {
  it("waits for blocks by end time rather than start time", async () => {
    const { runner, resolve } = createRunner({
      tracks: [
        {
          id: "long",
          blocks: [{ id: "long", start: 0, length: 3 }],
        },
        {
          id: "short",
          blocks: [
            { id: "short", start: 0, length: 1 },
            { id: "later", start: 1, length: 1 },
          ],
        },
      ],
    });

    runner.start();

    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual(["short"]);
    expect(
      runner.snapshot().blocks.find((block) => block.id === "long")?.end,
    ).toBe(3);

    resolve("short");
    await flush();

    expect(runner.time).toBe(1);
    expect(runner.snapshot().blockingBlockIds).toEqual(["later"]);

    resolve("later");
    await flush();

    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["long"]);

    resolve("long");
    await flush();

    expect(runner.time).toBe(3);
    expect(runner.phase).toBe("finished");
  });

  it("rejects blocks that overlap a longer block", () => {
    expect(
      () =>
        new TimelineRunner({
          tracks: [
            {
              id: "a",
              blocks: [
                { id: "long", start: 0, length: 3 },
                { id: "next", start: 2, length: 1 },
              ],
            },
          ],
        }),
    ).toThrow(/overlap/i);
  });

  it("accepts blocks adjacent to a longer block", () => {
    expect(
      () =>
        new TimelineRunner({
          tracks: [
            {
              id: "a",
              blocks: [
                { id: "long", start: 0, length: 3 },
                { id: "next", start: 3, length: 1 },
              ],
            },
          ],
        }),
    ).not.toThrow();
  });

  it("rejects invalid lengths", () => {
    for (const length of [0, -1, 0.5, Number.NaN]) {
      expect(
        () =>
          new TimelineRunner({
            tracks: [
              { id: "a", blocks: [{ id: "b", start: 0, length }] },
            ],
          }),
      ).toThrow(/invalid length/i);
    }
  });
});

describe("TimelineRunner skip", () => {
  it("delivers user skip requests to every running block", async () => {
    const events: Array<[string, SkipReason]> = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "a",
            blocks: [
              { id: "long", start: 0, length: 3 },
              { id: "last", start: 3, length: 1 },
            ],
          },
          { id: "b", blocks: [{ id: "short", start: 0, length: 1 }] },
        ],
      },
      {
        onSkip: (block, reason) => {
          events.push([block.id, reason]);
        },
      },
    );

    runner.start();
    runner.requestSkip();

    expect(events).toEqual([
      ["long", "user"],
      ["short", "user"],
    ]);

    events.length = 0;
    resolve("short");
    await flush();

    expect(runner.time).toBe(2);
    runner.requestSkip();

    expect(events).toEqual([["long", "user"]]);
  });

  it("keeps waiting when a block ignores a user skip request", async () => {
    const { runner, resolve } = createRunner({
      tracks: [{ id: "a", blocks: [{ id: "gate", start: 0, length: 1 }] }],
    });

    runner.start();
    runner.requestSkip();

    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual(["gate"]);

    resolve("gate");
    await flush();

    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("finished");
  });

  it("advances when a block honors a user skip request", async () => {
    const { runner } = createRunner(
      {
        tracks: [{ id: "a", blocks: [{ id: "gate", start: 0, length: 1 }] }],
      },
      {
        onSkip: (block, _reason, resolve) => {
          if (block.id === "gate") {
            resolve(block.id);
          }
        },
      },
    );

    runner.start();
    runner.requestSkip();
    await flush();

    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("finished");
  });

  it("auto-fires cooperative skip when only cooperative blocks remain", async () => {
    const events: Array<[string, SkipReason]> = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          { id: "a", blocks: [{ id: "gate", start: 0, length: 1 }] },
          {
            id: "b",
            blocks: [
              { id: "anim", start: 0, length: 1, cooperativeSkip: true },
            ],
          },
        ],
      },
      {
        onSkip: (block, reason) => {
          events.push([block.id, reason]);
        },
      },
    );

    runner.start();

    expect(events).toEqual([]);
    expect(
      runner.snapshot().blocks.find((block) => block.id === "anim")
        ?.cooperativeSkip,
    ).toBe(true);

    resolve("gate");
    await flush();

    expect(events).toEqual([["anim", "cooperative"]]);
    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual(["anim"]);

    resolve("anim");
    await flush();

    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("finished");
  });

  it("advances when a block honors an automatic cooperative skip", async () => {
    const { runner, resolve } = createRunner(
      {
        tracks: [
          { id: "a", blocks: [{ id: "gate", start: 0, length: 1 }] },
          {
            id: "b",
            blocks: [
              { id: "anim", start: 0, length: 1, cooperativeSkip: true },
            ],
          },
        ],
      },
      {
        onSkip: (_block, reason, resolve) => {
          if (reason === "cooperative") {
            resolve("anim");
          }
        },
      },
    );

    runner.start();

    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual(["gate", "anim"]);

    resolve("gate");
    await flush();

    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("finished");
  });

  it("waits for non-cooperative blocks before auto-firing", async () => {
    const events: string[] = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          { id: "a", blocks: [{ id: "gate-a", start: 0, length: 1 }] },
          { id: "b", blocks: [{ id: "gate-b", start: 0, length: 1 }] },
          {
            id: "c",
            blocks: [
              { id: "anim", start: 0, length: 1, cooperativeSkip: true },
            ],
          },
        ],
      },
      {
        onSkip: (block, reason) => {
          if (reason === "cooperative") {
            events.push(block.id);
          }
        },
      },
    );

    runner.start();
    resolve("gate-a");
    await flush();

    expect(events).toEqual([]);
    expect(runner.time).toBe(0);

    resolve("gate-b");
    await flush();

    expect(events).toEqual(["anim"]);
    expect(runner.time).toBe(0);
  });

  it("waits for a non-cooperative block that shares the end time", async () => {
    const events: string[] = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "a",
            blocks: [
              {
                id: "long",
                start: 0,
                length: 3,
                cooperativeSkip: true,
              },
            ],
          },
          { id: "b", blocks: [{ id: "gate", start: 2, length: 1 }] },
        ],
      },
      {
        onSkip: (block, reason) => {
          if (reason === "cooperative") {
            events.push(block.id);
          }
        },
      },
    );

    runner.start();

    expect(runner.time).toBe(2);
    expect(events).toEqual([]);

    resolve("gate");
    await flush();

    expect(events).toEqual(["long"]);
    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["long"]);
  });

  it("auto-fires before the end-time barrier when only cooperative blocks remain until the end", async () => {
    const events: Array<[string, SkipReason, number]> = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "bgm",
            blocks: [
              { id: "loop", start: 0, length: 3, cooperativeSkip: true },
            ],
          },
          {
            id: "dialogue",
            blocks: [{ id: "gate", start: 0, length: 1 }],
          },
        ],
      },
      {
        onSkip: (block, reason) => {
          events.push([block.id, reason, runner.time]);
        },
      },
    );

    runner.start();

    expect(events).toEqual([]);
    expect(runner.snapshot().blockingBlockIds).toEqual(["gate"]);

    resolve("gate");
    await flush();

    expect(events).toEqual([["loop", "cooperative", 0]]);
    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["loop"]);

    resolve("loop");
    await flush();

    expect(runner.time).toBe(3);
    expect(runner.phase).toBe("finished");
  });

  it("waits for a future non-cooperative block that must complete by the cooperative block's end", async () => {
    const events: Array<[string, SkipReason, number]> = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "bgm",
            blocks: [
              { id: "loop", start: 0, length: 3, cooperativeSkip: true },
            ],
          },
          {
            id: "dialogue",
            blocks: [{ id: "gate", start: 1, length: 1 }],
          },
        ],
      },
      {
        onSkip: (block, reason) => {
          events.push([block.id, reason, runner.time]);
        },
      },
    );

    runner.start();

    expect(events).toEqual([]);
    expect(runner.time).toBe(1);
    expect(runner.snapshot().blockingBlockIds).toEqual(["gate"]);

    resolve("gate");
    await flush();

    expect(events).toEqual([["loop", "cooperative", 1]]);
    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["loop"]);
  });

  it("ignores non-cooperative blocks that end after the cooperative block", async () => {
    const events: Array<[string, SkipReason, number]> = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "bgm",
            blocks: [
              { id: "loop", start: 0, length: 2, cooperativeSkip: true },
            ],
          },
          {
            id: "other",
            blocks: [{ id: "gate", start: 0, length: 3 }],
          },
        ],
      },
      {
        onSkip: (block, reason) => {
          events.push([block.id, reason, runner.time]);
        },
      },
    );

    runner.start();

    expect(events).toEqual([["loop", "cooperative", 0]]);
    expect(runner.time).toBe(1);
    expect(runner.snapshot().blockingBlockIds).toEqual(["loop"]);

    resolve("loop");
    await flush();

    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["gate"]);

    resolve("gate");
    await flush();

    expect(runner.time).toBe(3);
    expect(runner.phase).toBe("finished");
  });

  it("auto-fires a lone cooperative block when it starts", async () => {
    const events: Array<[string, SkipReason, number]> = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "bgm",
            blocks: [
              { id: "loop", start: 0, length: 3, cooperativeSkip: true },
            ],
          },
        ],
      },
      {
        onSkip: (block, reason) => {
          events.push([block.id, reason, runner.time]);
        },
      },
    );

    runner.start();

    expect(events).toEqual([["loop", "cooperative", 0]]);
    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["loop"]);

    resolve("loop");
    await flush();

    expect(runner.time).toBe(3);
    expect(runner.phase).toBe("finished");
  });

  it("auto-fires when every block in the end-time barrier is cooperative", async () => {
    const events: string[] = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "a",
            blocks: [
              { id: "a0", start: 0, length: 1, cooperativeSkip: true },
            ],
          },
          {
            id: "b",
            blocks: [
              { id: "b0", start: 0, length: 1, cooperativeSkip: true },
            ],
          },
        ],
      },
      {
        onSkip: (block, reason) => {
          if (reason === "cooperative") {
            events.push(block.id);
          }
        },
      },
    );

    runner.start();

    expect(events).toEqual(["a0", "b0"]);
    expect(runner.time).toBe(0);

    resolve("a0");
    resolve("b0");
    await flush();

    expect(runner.phase).toBe("finished");
  });

  it("auto-fires an automatic skip only once per block", async () => {
    const events: string[] = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "a",
            blocks: [
              { id: "a0", start: 0, length: 1, cooperativeSkip: true },
            ],
          },
          {
            id: "b",
            blocks: [
              { id: "b0", start: 0, length: 1, cooperativeSkip: true },
            ],
          },
        ],
      },
      {
        onSkip: (block, reason) => {
          if (reason === "cooperative") {
            events.push(block.id);
          }
        },
      },
    );

    runner.start();

    expect(events).toEqual(["a0", "b0"]);

    resolve("a0");
    await flush();

    expect(events).toEqual(["a0", "b0"]);
    expect(runner.time).toBe(0);

    resolve("b0");
    await flush();

    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("finished");
  });
});

describe("TimelineRunner termination", () => {
  it("terminates blocks ending at the barrier before advancing", async () => {
    const events: Array<[string, number, string]> = [];
    const { runner, resolve } = createRunner(createTimeline(), {
      onTerminate: (block) => {
        events.push([block.id, runner.time, block.state]);
      },
    });

    runner.start();
    resolve("animation");
    resolve("sfx");
    await flush();

    expect(events).toEqual([]);

    resolve("click-wait");
    await flush();

    expect(events).toEqual([
      ["click-wait", 0, "completed"],
      ["animation", 0, "completed"],
      ["sfx", 0, "completed"],
    ]);
    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("running");
    expect(
      runner.snapshot().blocks.find((block) => block.id === "next-line")?.state,
    ).toBe("running");
  });

  it("terminates a block completed early only at its end time", async () => {
    const events: Array<[string, number]> = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "media",
            blocks: [{ id: "loop-bgm", start: 0, length: 3 }],
          },
          {
            id: "gate",
            blocks: [
              { id: "gate-1", start: 0, length: 1 },
              { id: "gate-2", start: 1, length: 1 },
              { id: "gate-3", start: 2, length: 1 },
            ],
          },
        ],
      },
      {
        onTerminate: (block) => {
          events.push([block.id, runner.time]);
        },
      },
    );

    runner.start();
    resolve("loop-bgm");
    await flush();

    expect(events).toEqual([]);

    resolve("gate-1");
    await flush();

    expect(events).toEqual([["gate-1", 0]]);
    expect(runner.time).toBe(1);

    resolve("gate-2");
    await flush();

    expect(events).toEqual([
      ["gate-1", 0],
      ["gate-2", 1],
    ]);
    expect(runner.time).toBe(2);

    resolve("gate-3");
    await flush();

    expect(events).toEqual([
      ["gate-1", 0],
      ["gate-2", 1],
      ["loop-bgm", 2],
      ["gate-3", 2],
    ]);
    expect(runner.time).toBe(3);
    expect(runner.phase).toBe("finished");
  });

  it("terminates blocks ending at the horizon", async () => {
    const events: string[] = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "a",
            blocks: [{ id: "a0", start: 0, length: 2 }],
          },
          {
            id: "b",
            blocks: [{ id: "b0", start: 0, length: 1 }],
          },
        ],
      },
      {
        onTerminate: (block) => {
          events.push(block.id);
        },
      },
    );

    runner.start();
    resolve("b0");
    await flush();

    expect(events).toEqual(["b0"]);
    expect(runner.time).toBe(1);

    resolve("a0");
    await flush();

    expect(events).toEqual(["b0", "a0"]);
    expect(runner.phase).toBe("finished");
  });
});

describe("TimelineRunner promise execution", () => {
  it("completes a block when its execution promise resolves", async () => {
    const runner = new TimelineRunner(
      {
        tracks: [{ id: "a", blocks: [{ id: "a0", start: 0, length: 1 }] }],
      },
      {
        onBlockStart: () => ({
          execution: new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
          }),
        }),
      },
    );

    runner.start();
    expect(runner.phase).toBe("running");

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("finished");
  });

  it("fails the block when its execution promise rejects", async () => {
    const terminated: Array<[string, string]> = [];
    const runner = new TimelineRunner(createTimeline(), {
      onBlockStart: (block) => ({
        execution:
          block.id === "animation"
            ? Promise.reject(new Error("animation broke"))
            : new Promise<void>(() => {}),
      }),
      onBlockTerminate: (block) => {
        terminated.push([block.id, block.state]);
      },
    });

    runner.start();
    await flush();

    expect(runner.phase).toBe("failed");
    expect(runner.time).toBe(0);
    expect(
      runner.snapshot().blocks.find((block) => block.id === "animation")
        ?.state,
    ).toBe("failed");
    expect(terminated).toEqual([
      ["click-wait", "running"],
      ["animation", "failed"],
      ["sfx", "running"],
    ]);
  });

  it("fails the block when its start callback throws synchronously", () => {
    const runner = new TimelineRunner(createTimeline(), {
      onBlockStart: (block) => {
        if (block.id === "animation") {
          throw new Error("animation broke");
        }
        return { execution: new Promise<void>(() => {}) };
      },
    });

    runner.start();

    expect(runner.phase).toBe("failed");
    expect(runner.time).toBe(0);
    expect(
      runner.snapshot().blocks.find((block) => block.id === "animation")
        ?.state,
    ).toBe("failed");
  });

  it("fails the block when its skip handler throws", () => {
    const { runner } = createRunner(createTimeline(), {
      onSkip: (block) => {
        if (block.id === "sfx") {
          throw new Error("skip handling broke");
        }
      },
    });

    runner.start();
    runner.requestSkip();

    expect(runner.phase).toBe("failed");
    expect(
      runner.snapshot().blocks.find((block) => block.id === "sfx")?.state,
    ).toBe("failed");
  });

  it("fails the block when its skip handler promise rejects", async () => {
    const { runner } = createRunner(createTimeline(), {
      onSkip: (block) =>
        block.id === "sfx"
          ? Promise.reject(new Error("skip handling broke"))
          : undefined,
    });

    runner.start();
    runner.requestSkip();
    await flush();

    expect(runner.phase).toBe("failed");
    expect(
      runner.snapshot().blocks.find((block) => block.id === "sfx")?.state,
    ).toBe("failed");
  });

  it("does not complete a block when its skip handler promise resolves", async () => {
    const { runner } = createRunner(createTimeline(), {
      onSkip: () => Promise.resolve(),
    });

    runner.start();
    runner.requestSkip();
    await flush();

    expect(runner.phase).toBe("running");
    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual([
      "click-wait",
      "animation",
      "sfx",
    ]);
  });

  it("ignores a skip rejection delivered after the block has completed", async () => {
    const execution = deferred();
    const skip = deferred();
    const runner = new TimelineRunner(
      {
        tracks: [{ id: "a", blocks: [{ id: "a0", start: 0, length: 1 }] }],
      },
      {
        onBlockStart: () => ({
          execution: execution.promise,
          skip: () => skip.promise,
        }),
      },
    );

    runner.start();
    runner.requestSkip();
    execution.resolve();
    await flush();
    expect(runner.phase).toBe("finished");
    expect(runner.time).toBe(1);

    skip.reject(new Error("late skip"));
    await flush();

    expect(runner.phase).toBe("finished");
    expect(runner.time).toBe(1);
  });
});

describe("TimelineRunner failure", () => {
  it("stops the timeline and terminates running blocks, including the failed one", async () => {
    const terminated: Array<[string, number, string]> = [];
    const skipped: string[] = [];
    const { runner, reject } = createRunner(createTimeline(), {
      onTerminate: (block) => {
        terminated.push([block.id, runner.time, block.state]);
      },
      onSkip: (block) => {
        skipped.push(block.id);
      },
    });

    runner.start();
    reject("click-wait");
    await flush();

    expect(runner.phase).toBe("failed");
    expect(runner.time).toBe(0);
    expect(terminated).toEqual([
      ["click-wait", 0, "failed"],
      ["animation", 0, "running"],
      ["sfx", 0, "running"],
    ]);
    expect(
      runner
        .snapshot()
        .blocks.filter((block) => block.start === 0)
        .map((block) => [block.id, block.state]),
    ).toEqual([
      ["click-wait", "failed"],
      ["animation", "running"],
      ["sfx", "running"],
    ]);
    expect(runner.snapshot().blockingBlockIds).toEqual([]);

    runner.requestSkip();
    expect(skipped).toEqual([]);
  });

  it("does not terminate blocks that already completed", async () => {
    const terminated: string[] = [];
    const { runner, resolve, reject } = createRunner(createTimeline(), {
      onTerminate: (block) => {
        terminated.push(block.id);
      },
    });

    runner.start();
    resolve("sfx");
    await flush();
    reject("animation");
    await flush();

    expect(terminated).toEqual(["click-wait", "animation"]);
    expect(runner.phase).toBe("failed");
    expect(runner.time).toBe(0);
  });

  it("stops startup and terminates only callbacks that were invoked", () => {
    const started: string[] = [];
    const terminated: string[] = [];

    const runner = new TimelineRunner(
      {
        tracks: [
          { id: "a", blocks: [{ id: "a0", start: 0, length: 1 }] },
          { id: "b", blocks: [{ id: "b0", start: 0, length: 1 }] },
        ],
      },
      {
        onBlockStart: (block) => {
          started.push(block.id);
          if (block.id === "a0") {
            throw new Error("a0 broke");
          }
          return { execution: new Promise<void>(() => {}) };
        },
        onBlockTerminate: (block) => {
          terminated.push(block.id);
        },
      },
    );

    runner.start();

    const invoked = new Set(started);
    const invocationCounts = new Map<string, number>();
    const terminationCounts = new Map<string, number>();
    for (const id of started) {
      invocationCounts.set(id, (invocationCounts.get(id) ?? 0) + 1);
    }
    for (const id of terminated) {
      terminationCounts.set(id, (terminationCounts.get(id) ?? 0) + 1);
    }

    expect(invoked.has("a0")).toBe(true);
    expect(terminationCounts).toEqual(invocationCounts);
    for (const block of runner.snapshot().blocks) {
      if (!invoked.has(block.id)) {
        expect(block.state).toBe("pending");
      }
    }
    expect(runner.phase).toBe("failed");
    expect(runner.time).toBe(0);
  });

  it("ignores settlements after the timeline failed", async () => {
    const { runner, resolve, reject } = createRunner(createTimeline());

    runner.start();
    reject("animation");
    await flush();

    expect(runner.phase).toBe("failed");

    resolve("click-wait");
    await flush();

    expect(runner.phase).toBe("failed");
    expect(runner.time).toBe(0);
  });
});

describe("TimelineRunner lifecycle", () => {
  it("rejects starting twice", () => {
    const { runner } = createRunner(createTimeline());

    runner.start();

    expect(() => runner.start()).toThrow(/cannot start/i);
  });
});

describe("TimelineRunner disposal", () => {
  it("rejects a later start and tolerates repeated disposal", () => {
    const started: string[] = [];
    const { runner } = createRunner(
      { tracks: [{ id: "a", blocks: [{ id: "a0", start: 0, length: 1 }] }] },
      {
        onStart: (block) => started.push(block.id),
      },
    );

    runner.dispose();
    expect(() => runner.dispose()).not.toThrow();
    expect(() => runner.start()).toThrow();
    expect(started).toEqual([]);
    expect(runner.phase).toBe("idle");
    expect(runner.time).toBe(0);
  });

  it("freezes the running snapshot and ignores queued completion, future starts, and termination", async () => {
    const started: string[] = [];
    const terminated: string[] = [];
    const notifications: TimelineSnapshot[] = [];
    const { runner, resolve } = createRunner(
      {
        tracks: [
          {
            id: "a",
            blocks: [
              { id: "a0", start: 0, length: 1 },
              { id: "a1", start: 1, length: 1 },
            ],
          },
        ],
      },
      {
        onStart: (block) => started.push(block.id),
        onTerminate: (block) => terminated.push(block.id),
      },
    );

    runner.subscribe((snapshot) => notifications.push(snapshot));
    runner.start();
    const snapshotAtStart = runner.snapshot();

    resolve("a0");
    runner.dispose();
    expect(() => runner.dispose()).not.toThrow();
    expect(runner.snapshot()).toEqual(snapshotAtStart);
    const notificationsAtDispose = notifications.length;

    await flush();

    expect(runner.snapshot()).toEqual(snapshotAtStart);
    expect(runner.phase).toBe("running");
    expect(started).toEqual(["a0"]);
    expect(terminated).toEqual([]);
    expect(notifications.length).toBe(notificationsAtDispose);
  });

  it("ignores pending skip rejection and later skip requests after disposal", async () => {
    const skip = deferred();
    const skipped: SkipReason[] = [];
    const terminated: string[] = [];
    const notifications: TimelineSnapshot[] = [];
    const { runner } = createRunner(
      { tracks: [{ id: "a", blocks: [{ id: "a0", start: 0, length: 1 }] }] },
      {
        onSkip: (_block, reason) => {
          skipped.push(reason);
          return skip.promise;
        },
        onTerminate: (block) => terminated.push(block.id),
      },
    );

    runner.subscribe((snapshot) => notifications.push(snapshot));
    runner.start();
    runner.requestSkip();
    expect(skipped).toEqual(["user"]);
    const snapshotAtDispose = runner.snapshot();

    runner.dispose();
    const notificationsAtDispose = notifications.length;
    expect(runner.snapshot()).toEqual(snapshotAtDispose);

    runner.requestSkip();
    expect(skipped).toEqual(["user"]);
    expect(notifications.length).toBe(notificationsAtDispose);

    skip.reject(new Error("late skip"));
    await flush();

    expect(runner.snapshot()).toEqual(snapshotAtDispose);
    expect(runner.phase).toBe("running");
    expect(terminated).toEqual([]);
    expect(notifications.length).toBe(notificationsAtDispose);
  });

  it("stops the pump when a start callback disposes synchronously", async () => {
    const started: string[] = [];
    const terminated: string[] = [];
    const notifications: TimelineSnapshot[] = [];
    let firstStarted: string | undefined;
    let runner: TimelineRunner;
    const created = createRunner(
      {
        tracks: [
          {
            id: "a",
            blocks: [
              { id: "a0", start: 0, length: 1 },
              { id: "later", start: 1, length: 1 },
            ],
          },
          {
            id: "b",
            blocks: [{ id: "b0", start: 0, length: 1 }],
          },
        ],
      },
      {
        onStart: (block) => {
          started.push(block.id);
          if (firstStarted === undefined) {
            firstStarted = block.id;
            runner.dispose();
          }
        },
        onTerminate: (block) => terminated.push(block.id),
      },
    );
    runner = created.runner;
    runner.subscribe((snapshot) => notifications.push(snapshot));

    runner.start();
    const snapshotAtDispose = runner.snapshot();
    const notificationsAtDispose = notifications.length;

    expect(firstStarted).toBeDefined();
    created.resolve(firstStarted!);
    await flush();

    expect(started).toEqual([firstStarted]);
    expect(runner.snapshot()).toEqual(snapshotAtDispose);
    expect(runner.phase).toBe("running");
    expect(terminated).toEqual([]);
    expect(notifications.length).toBe(notificationsAtDispose);
  });

  it("freezes at the loop repeat snapshot when disposed from onLoopRepeat", async () => {
    const started: string[] = [];
    let snapshotAtDispose: TimelineSnapshot | undefined;
    let runner: TimelineRunner;
    const created = createRunner(
      {
        tracks: [{ id: "a", blocks: [{ id: "a0", start: 1, length: 2 }] }],
        loops: [{ start: 1, end: 3, iterations: 2 }],
      },
      {
        onStart: (block) => started.push(block.id),
        onLoopRepeat: () => {
          snapshotAtDispose = runner.snapshot();
          runner.dispose();
        },
      },
    );
    runner = created.runner;

    runner.start();
    created.resolve("a0");
    await flush();

    expect(snapshotAtDispose).toBeDefined();
    expect(started).toEqual(["a0"]);
    expect(runner.snapshot()).toEqual(snapshotAtDispose);
    expect(runner.phase).toBe("running");

    await flush();

    expect(started).toEqual(["a0"]);
    expect(runner.snapshot()).toEqual(snapshotAtDispose);
  });
});

describe("TimelineRunner validation", () => {
  it("rejects duplicate track ids", () => {
    expect(
      () =>
        new TimelineRunner({
          tracks: [
            { id: "same", blocks: [] },
            { id: "same", blocks: [] },
          ],
        }),
    ).toThrow(/duplicate track id/i);
  });

  it("rejects duplicate block ids across tracks", () => {
    expect(
      () =>
        new TimelineRunner({
          tracks: [
            { id: "a", blocks: [{ id: "same", start: 0, length: 1 }] },
            { id: "b", blocks: [{ id: "same", start: 1, length: 1 }] },
          ],
        }),
    ).toThrow(/duplicate block id/i);
  });

  it("rejects overlapping blocks in one track", () => {
    expect(
      () =>
        new TimelineRunner({
          tracks: [
            {
              id: "a",
              blocks: [
                { id: "first", start: 0, length: 1 },
                { id: "second", start: 0, length: 1 },
              ],
            },
          ],
        }),
    ).toThrow(/overlap/i);
  });

  it("rejects invalid starts", () => {
    for (const start of [-1, 0.5, Number.NaN]) {
      expect(
        () =>
          new TimelineRunner({
            tracks: [{ id: "a", blocks: [{ id: "b", start, length: 1 }] }],
          }),
      ).toThrow(/invalid start/i);
    }
  });
});

describe("barrierSpan", () => {
  function runnerWithChecks(): TimelineRunner {
    return new TimelineRunner({
      tracks: [
        { id: "a", blocks: [{ id: "a", start: 0, length: 2 }] },
        { id: "b", blocks: [{ id: "b", start: 0, length: 5 }] },
        { id: "c", blocks: [{ id: "c", start: 1, length: 2 }] },
      ],
    });
  }

  it("splits logical time by the block end times", () => {
    const runner = runnerWithChecks();

    expect(runner.barrierSpan(0)).toEqual({ start: 0, end: 2 });
    expect(runner.barrierSpan(1)).toEqual({ start: 0, end: 2 });
    expect(runner.barrierSpan(2)).toEqual({ start: 2, end: 3 });
    expect(runner.barrierSpan(3)).toEqual({ start: 3, end: 5 });
    expect(runner.barrierSpan(4)).toEqual({ start: 3, end: 5 });
  });

  it("splits logical time by the loop marker times", () => {
    const runner = new TimelineRunner({
      tracks: [
        { id: "a", blocks: [{ id: "a", start: 0, length: 1 }] },
        { id: "b", blocks: [{ id: "b", start: 6, length: 2 }] },
      ],
      loops: [{ start: 2, end: 6, iterations: 3 }],
    });

    expect(runner.barrierSpan(0)).toEqual({ start: 0, end: 1 });
    expect(runner.barrierSpan(1)).toEqual({ start: 1, end: 2 });
    expect(runner.barrierSpan(2)).toEqual({ start: 2, end: 6 });
    expect(runner.barrierSpan(5)).toEqual({ start: 2, end: 6 });
    expect(runner.barrierSpan(6)).toEqual({ start: 6, end: 8 });
  });

  it("returns the span containing the current time by default", () => {
    const runner = runnerWithChecks();

    expect(runner.barrierSpan()).toEqual({ start: 0, end: 2 });
  });

  it("returns a degenerate span at or beyond the last check time", () => {
    const runner = runnerWithChecks();

    expect(runner.barrierSpan(5)).toEqual({ start: 5, end: 5 });
    expect(runner.barrierSpan(8)).toEqual({ start: 5, end: 5 });
  });

  it("returns a degenerate span for an empty timeline", () => {
    const runner = new TimelineRunner({ tracks: [] });

    expect(runner.barrierSpan(0)).toEqual({ start: 0, end: 0 });
    expect(runner.barrierSpan(4)).toEqual({ start: 0, end: 0 });
  });
});

describe("TimelineRunner block outputs", () => {
  it("delivers execution outputs to the block's end termination", async () => {
    const terminated: { id: string; outputs: unknown; time: number }[] = [];
    const runner = new TimelineRunner(
      { tracks: [{ id: "t", blocks: [{ id: "sum", start: 0, length: 2 }] }] },
      {
        onBlockStart: () => ({ execution: Promise.resolve({ out: 9 }) }),
        onBlockTerminate: (block, outputs) => {
          terminated.push({ id: block.id, outputs, time: runner.time });
        },
      },
    );

    runner.start();
    await flush();

    expect(terminated).toEqual([{ id: "sum", outputs: { out: 9 }, time: 1 }]);
    expect(runner.snapshot().phase).toBe("finished");
    expect(runner.time).toBe(2);
  });

  it("does not assign outputs when the execution fails", async () => {
    const terminated: { outputs: unknown }[] = [];
    const runner = new TimelineRunner(
      { tracks: [{ id: "t", blocks: [{ id: "sum", start: 0, length: 1 }] }] },
      {
        onBlockStart: () => ({
          execution: Promise.reject(new Error("boom")),
        }),
        onBlockTerminate: (_block, outputs) => {
          terminated.push({ outputs });
        },
      },
    );

    runner.start();
    await flush();

    expect(terminated).toEqual([{ outputs: {} }]);
    expect(runner.snapshot().phase).toBe("failed");
  });
});

describe("TimelineRunner loop playback", () => {
  function loopRunner(
    blocks: readonly { id: string; start: number; length: number }[],
    loops: readonly LoopDefinition[],
    config: RunnerConfig = {},
  ) {
    return createRunner({ tracks: [{ id: "t", blocks }], loops }, config);
  }

  it("runs a loop body three times, jumping back to its start", async () => {
    const starts: string[] = [];
    const times: number[] = [];
    const { runner, resolve } = loopRunner(
      [
        { id: "a", start: 0, length: 1 },
        { id: "b", start: 1, length: 1 },
      ],
      [{ start: 0, end: 2, iterations: 3 }],
      {
        onStart: (block) => starts.push(block.id),
        onTimeStart: (time) => times.push(time),
      },
    );

    runner.start();
    for (let iteration = 0; iteration < 3; iteration += 1) {
      resolve("a");
      await flush();
      resolve("b");
      await flush();
    }

    expect(starts).toEqual(["a", "b", "a", "b", "a", "b"]);
    expect(times).toEqual([0, 1, 0, 1, 0, 1]);
    expect(runner.time).toBe(2);
    expect(runner.phase).toBe("finished");
  });

  it("reports each loop repeat with the loop and its boundaries", async () => {
    const repeats: [number, number][] = [];
    const loop: LoopDefinition = { start: 0, end: 2, iterations: 3 };
    const { runner, resolve } = loopRunner(
      [{ id: "a", start: 0, length: 1 }],
      [loop],
      {
        onLoopRepeat: (repeated, end, start) => {
          expect(repeated).toBe(loop);
          repeats.push([end, start]);
        },
      },
    );

    runner.start();
    for (let iteration = 0; iteration < 3; iteration += 1) {
      resolve("a");
      await flush();
    }

    expect(repeats).toEqual([
      [2, 0],
      [2, 0],
    ]);
    expect(runner.phase).toBe("finished");
  });

  it("runs a block after the loop exactly once", async () => {
    const starts: string[] = [];
    const { runner, resolve } = loopRunner(
      [
        { id: "inside", start: 0, length: 1 },
        { id: "after", start: 2, length: 1 },
      ],
      [{ start: 0, end: 2, iterations: 3 }],
      { onStart: (block) => starts.push(block.id) },
    );

    runner.start();
    for (let iteration = 0; iteration < 3; iteration += 1) {
      resolve("inside");
      await flush();
    }

    expect(starts).toEqual(["inside", "inside", "inside", "after"]);
    expect(runner.time).toBe(2);

    resolve("after");
    await flush();

    expect(starts).toEqual(["inside", "inside", "inside", "after"]);
    expect(runner.time).toBe(3);
    expect(runner.phase).toBe("finished");
  });

  it("terminates blocks ending at the loop end on every iteration", async () => {
    const terminated: string[] = [];
    const { runner, resolve } = loopRunner(
      [{ id: "span", start: 0, length: 2 }],
      [{ start: 0, end: 2, iterations: 3 }],
      { onTerminate: (block) => terminated.push(block.id) },
    );

    runner.start();
    for (let iteration = 0; iteration < 3; iteration += 1) {
      resolve("span");
      await flush();
    }

    expect(terminated).toEqual(["span", "span", "span"]);
    expect(runner.time).toBe(2);
    expect(runner.phase).toBe("finished");
  });

  it("multiplies nested loop iterations", async () => {
    const starts: string[] = [];
    const { runner, resolve } = loopRunner(
      [{ id: "a", start: 0, length: 1 }],
      [
        {
          start: 0,
          end: 2,
          iterations: 3,
          loops: [{ start: 0, end: 1, iterations: 3 }],
        },
      ],
      { onStart: (block) => starts.push(block.id) },
    );

    runner.start();
    for (let iteration = 0; iteration < 9; iteration += 1) {
      resolve("a");
      await flush();
    }

    expect(starts).toHaveLength(9);
    expect(runner.time).toBe(2);
    expect(runner.phase).toBe("finished");
  });

  it("runs loops that share an end boundary", async () => {
    const starts: string[] = [];
    const { runner, resolve } = loopRunner(
      [{ id: "a", start: 1, length: 1 }],
      [
        {
          start: 0,
          end: 2,
          iterations: 2,
          loops: [{ start: 1, end: 2, iterations: 2 }],
        },
      ],
      { onStart: (block) => starts.push(block.id) },
    );

    runner.start();
    for (let iteration = 0; iteration < 4; iteration += 1) {
      resolve("a");
      await flush();
    }

    expect(starts).toHaveLength(4);
    expect(runner.time).toBe(2);
    expect(runner.phase).toBe("finished");
  });

  it("keeps looping to the loop end even when the last cells are empty", async () => {
    const starts: string[] = [];
    const { runner, resolve } = loopRunner(
      [{ id: "a", start: 0, length: 1 }],
      [{ start: 0, end: 3, iterations: 3 }],
      { onStart: (block) => starts.push(block.id) },
    );

    runner.start();
    for (let iteration = 0; iteration < 3; iteration += 1) {
      resolve("a");
      await flush();
    }

    expect(starts).toHaveLength(3);
    expect(runner.time).toBe(3);
    expect(runner.phase).toBe("finished");
  });

  it("ignores a skip rejection from a previous loop iteration", async () => {
    const executions: Deferred[] = [];
    const skipRejects: ((error?: unknown) => void)[] = [];
    const starts: string[] = [];
    const runner = new TimelineRunner(
      {
        tracks: [{ id: "t", blocks: [{ id: "a", start: 0, length: 1 }] }],
        loops: [{ start: 0, end: 1, iterations: 2 }],
      },
      {
        onBlockStart: (block) => {
          starts.push(block.id);
          const execution = deferred();
          executions.push(execution);
          const skip = new Promise<void>((_resolve, reject) => {
            skipRejects.push(reject);
          });
          return { execution: execution.promise, skip: () => skip };
        },
      },
    );

    runner.start();
    expect(starts).toEqual(["a"]);

    runner.requestSkip();
    executions[0].resolve();
    await flush();

    expect(starts).toEqual(["a", "a"]);
    expect(runner.phase).toBe("running");
    expect(runner.time).toBe(0);

    skipRejects[0](new Error("late rejection"));
    await flush();

    expect(runner.phase).toBe("running");
    expect(runner.snapshot().blocks[0].state).toBe("running");
  });

  it("allows a block spanning exactly the loop", async () => {
    const { runner, resolve } = loopRunner(
      [{ id: "a", start: 0, length: 2 }],
      [{ start: 0, end: 2, iterations: 2 }],
    );

    runner.start();
    resolve("a");
    await flush();
    resolve("a");
    await flush();

    expect(runner.phase).toBe("finished");
    expect(runner.time).toBe(2);
  });

  it("rejects a block that contains a loop", () => {
    expect(
      () =>
        new TimelineRunner({
          tracks: [{ id: "t", blocks: [{ id: "wrap", start: 0, length: 4 }] }],
          loops: [{ start: 1, end: 3, iterations: 3 }],
        }),
    ).toThrow(/contains loop/i);
  });

  it("rejects a block that partially overlaps a loop", () => {
    expect(
      () =>
        new TimelineRunner({
          tracks: [{ id: "t", blocks: [{ id: "cut", start: 0, length: 2 }] }],
          loops: [{ start: 1, end: 3, iterations: 3 }],
        }),
    ).toThrow(/overlaps loop/i);
  });

  it("rejects crossing loops", () => {
    expect(
      () =>
        new TimelineRunner({
          tracks: [],
          loops: [
            { start: 0, end: 4, iterations: 2 },
            { start: 3, end: 6, iterations: 2 },
          ],
        }),
    ).toThrow(/loop/i);
  });

  it("rejects a loop with no iterations", () => {
    expect(
      () =>
        new TimelineRunner({
          tracks: [],
          loops: [{ start: 0, end: 2, iterations: 0 }],
        }),
    ).toThrow(/iterations/i);
  });

  it("includes loop ends in the barrier check times", () => {
    const runner = new TimelineRunner({
      tracks: [{ id: "t", blocks: [{ id: "a", start: 0, length: 1 }] }],
      loops: [{ start: 0, end: 5, iterations: 2 }],
    });

    expect(runner.barrierSpan(0)).toEqual({ start: 0, end: 1 });
    expect(runner.barrierSpan(1)).toEqual({ start: 1, end: 5 });
  });
});
