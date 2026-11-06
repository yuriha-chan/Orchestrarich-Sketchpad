import { describe, expect, it } from "vitest";

import {
  TimelineRunner,
  type BlockSnapshot,
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
  readonly onStart?: (block: BlockSnapshot) => void;
  readonly onSkip?: (
    block: BlockSnapshot,
    reason: SkipReason,
    resolve: (blockId: string) => void,
  ) => void | Promise<void>;
  readonly onTerminate?: (block: BlockSnapshot) => void;
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

  it("notifies subscribers at stable barrier states only", async () => {
    const { runner, resolve } = createRunner(createTimeline());
    const snapshots: TimelineSnapshot[] = [];

    runner.subscribe((snapshot) => snapshots.push(snapshot));
    runner.start();
    resolve("animation");
    resolve("sfx");
    resolve("click-wait");
    await flush();
    resolve("next-line");
    await flush();

    expect(
      snapshots.map((snapshot) => [snapshot.phase, snapshot.time]),
    ).toEqual([
      ["running", 0],
      ["running", 0],
      ["running", 0],
      ["running", 1],
      ["finished", 2],
    ]);
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

  it("ignores a rejection after the block has completed", async () => {
    let execution: Deferred | undefined;
    const runner = new TimelineRunner(
      {
        tracks: [{ id: "a", blocks: [{ id: "a0", start: 0, length: 1 }] }],
      },
      {
        onBlockStart: () => {
          execution = deferred();
          return { execution: execution.promise };
        },
      },
    );

    runner.start();
    execution!.resolve();
    await flush();
    expect(runner.phase).toBe("finished");

    execution!.reject(new Error("late"));
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

  it("stops starting the remaining blocks when a start callback fails", () => {
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

    expect(started).toEqual(["a0"]);
    expect(terminated).toEqual(["a0", "b0"]);
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
