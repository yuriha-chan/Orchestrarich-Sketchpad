import { describe, expect, it } from "vitest";

import {
  TimelineRunner,
  type SkipReason,
  type TimelineDefinition,
  type TimelineSnapshot,
} from "./timeline-runner.ts";

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

function completeColumnZero(runner: TimelineRunner): void {
  runner.complete("click-wait");
  runner.complete("animation");
  runner.complete("sfx");
}

describe("TimelineRunner column barrier", () => {
  it("starts every block in the current column", () => {
    const runner = new TimelineRunner(createTimeline());

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

  it("does not advance while the click wait remains after the animation finishes", () => {
    const runner = new TimelineRunner(createTimeline());

    runner.start();
    runner.complete("animation");
    runner.complete("sfx");

    expect(runner.time).toBe(0);
    expect(runner.phase).toBe("running");
    expect(runner.snapshot().blockingBlockIds).toEqual(["click-wait"]);

    runner.complete("click-wait");

    expect(runner.time).toBe(1);
    expect(runner.snapshot().blockingBlockIds).toEqual(["next-line"]);
  });

  it("does not advance while the animation remains after the click wait finishes", () => {
    const runner = new TimelineRunner(createTimeline());

    runner.start();
    runner.complete("click-wait");

    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual([
      "animation",
      "sfx",
    ]);

    runner.complete("animation");

    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual(["sfx"]);

    runner.complete("sfx");

    expect(runner.time).toBe(1);
  });

  it("advances to the next column and finishes after the last block", () => {
    const runner = new TimelineRunner(createTimeline());

    runner.start();
    completeColumnZero(runner);

    expect(runner.time).toBe(1);
    expect(
      runner.snapshot().blocks.find((block) => block.id === "next-line")?.state,
    ).toBe("running");

    runner.complete("next-line");

    expect(runner.phase).toBe("finished");
    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual([]);
    expect(
      runner.snapshot().blocks.every((block) => block.state === "completed"),
    ).toBe(true);
  });

  it("notifies subscribers at stable barrier states only", () => {
    const runner = new TimelineRunner(createTimeline());
    const snapshots: TimelineSnapshot[] = [];

    runner.subscribe((snapshot) => snapshots.push(snapshot));
    runner.start();
    runner.complete("animation");
    runner.complete("sfx");
    runner.complete("click-wait");
    runner.complete("next-line");

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

  it("calls onBlockStart once per block", () => {
    const started: string[] = [];
    const runner = new TimelineRunner(createTimeline(), {
      onBlockStart: (block) => started.push(block.id),
    });

    runner.start();
    expect(started).toEqual(["click-wait", "animation", "sfx"]);

    completeColumnZero(runner);
    expect(started).toEqual([
      "click-wait",
      "animation",
      "sfx",
      "next-line",
    ]);
  });

  it("handles synchronous completion during block start", () => {
    const runner = new TimelineRunner(
      {
        tracks: [
          { id: "a", blocks: [{ id: "a0", start: 0, length: 1 }] },
          { id: "b", blocks: [{ id: "b0", start: 0, length: 1 }] },
        ],
      },
      {
        onBlockStart: (block) => runner.complete(block.id),
      },
    );

    runner.start();

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
  it("waits for blocks by end time rather than start time", () => {
    const runner = new TimelineRunner({
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

    runner.complete("short");

    expect(runner.time).toBe(1);
    expect(runner.snapshot().blockingBlockIds).toEqual(["later"]);

    runner.complete("later");

    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["long"]);

    runner.complete("long");

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
  it("delivers user skip requests to every running block", () => {
    const events: Array<[string, SkipReason]> = [];
    const runner = new TimelineRunner(
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
        onSkipRequest: (block, reason) => events.push([block.id, reason]),
      },
    );

    runner.start();
    runner.requestSkip();

    expect(events).toEqual([
      ["long", "user"],
      ["short", "user"],
    ]);

    events.length = 0;
    runner.complete("short");

    expect(runner.time).toBe(2);
    runner.requestSkip();

    expect(events).toEqual([["long", "user"]]);
  });

  it("keeps waiting when a block ignores a user skip request", () => {
    const runner = new TimelineRunner(
      {
        tracks: [{ id: "a", blocks: [{ id: "gate", start: 0, length: 1 }] }],
      },
      {
        onSkipRequest: () => {},
      },
    );

    runner.start();
    runner.requestSkip();

    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual(["gate"]);

    runner.complete("gate");

    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("finished");
  });

  it("advances when a block honors a user skip request", () => {
    const runner = new TimelineRunner(
      {
        tracks: [{ id: "a", blocks: [{ id: "gate", start: 0, length: 1 }] }],
      },
      {
        onSkipRequest: (block) => {
          if (block.id === "gate") {
            runner.complete(block.id);
          }
        },
      },
    );

    runner.start();
    runner.requestSkip();

    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("finished");
  });

  it("auto-fires cooperative skip when only cooperative blocks remain", () => {
    const events: Array<[string, SkipReason]> = [];
    const runner = new TimelineRunner(
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
        onSkipRequest: (block, reason) => events.push([block.id, reason]),
      },
    );

    runner.start();

    expect(events).toEqual([]);
    expect(
      runner.snapshot().blocks.find((block) => block.id === "anim")
        ?.cooperativeSkip,
    ).toBe(true);

    runner.complete("gate");

    expect(events).toEqual([["anim", "cooperative"]]);
    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual(["anim"]);

    runner.complete("anim");

    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("finished");
  });

  it("advances when a block honors an automatic cooperative skip", () => {
    const runner = new TimelineRunner(
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
        onSkipRequest: (block, reason) => {
          if (reason === "cooperative") {
            runner.complete(block.id);
          }
        },
      },
    );

    runner.start();

    expect(runner.time).toBe(0);
    expect(runner.snapshot().blockingBlockIds).toEqual(["gate", "anim"]);

    runner.complete("gate");

    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("finished");
  });

  it("waits for non-cooperative blocks before auto-firing", () => {
    const events: string[] = [];
    const runner = new TimelineRunner(
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
        onSkipRequest: (block, reason) => {
          if (reason === "cooperative") {
            events.push(block.id);
          }
        },
      },
    );

    runner.start();
    runner.complete("gate-a");

    expect(events).toEqual([]);
    expect(runner.time).toBe(0);

    runner.complete("gate-b");

    expect(events).toEqual(["anim"]);
    expect(runner.time).toBe(0);
  });

  it("waits for a non-cooperative block that shares the end time", () => {
    const events: string[] = [];
    const runner = new TimelineRunner(
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
        onSkipRequest: (block, reason) => {
          if (reason === "cooperative") {
            events.push(block.id);
          }
        },
      },
    );

    runner.start();

    expect(runner.time).toBe(2);
    expect(events).toEqual([]);

    runner.complete("gate");

    expect(events).toEqual(["long"]);
    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["long"]);
  });

  it("auto-fires before the end-time barrier when only cooperative blocks remain until the end", () => {
    const events: Array<[string, SkipReason, number]> = [];
    const runner = new TimelineRunner(
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
        onSkipRequest: (block, reason) =>
          events.push([block.id, reason, runner.time]),
      },
    );

    runner.start();

    expect(events).toEqual([]);
    expect(runner.snapshot().blockingBlockIds).toEqual(["gate"]);

    runner.complete("gate");

    expect(events).toEqual([["loop", "cooperative", 0]]);
    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["loop"]);

    runner.complete("loop");

    expect(runner.time).toBe(3);
    expect(runner.phase).toBe("finished");
  });

  it("waits for a future non-cooperative block that must complete by the cooperative block's end", () => {
    const events: Array<[string, SkipReason, number]> = [];
    const runner = new TimelineRunner(
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
        onSkipRequest: (block, reason) =>
          events.push([block.id, reason, runner.time]),
      },
    );

    runner.start();

    expect(events).toEqual([]);
    expect(runner.time).toBe(1);
    expect(runner.snapshot().blockingBlockIds).toEqual(["gate"]);

    runner.complete("gate");

    expect(events).toEqual([["loop", "cooperative", 1]]);
    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["loop"]);
  });

  it("ignores non-cooperative blocks that end after the cooperative block", () => {
    const events: Array<[string, SkipReason, number]> = [];
    const runner = new TimelineRunner(
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
        onSkipRequest: (block, reason) =>
          events.push([block.id, reason, runner.time]),
      },
    );

    runner.start();

    expect(events).toEqual([["loop", "cooperative", 0]]);
    expect(runner.time).toBe(1);
    expect(runner.snapshot().blockingBlockIds).toEqual(["loop"]);

    runner.complete("loop");

    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["gate"]);

    runner.complete("gate");

    expect(runner.time).toBe(3);
    expect(runner.phase).toBe("finished");
  });

  it("auto-fires a lone cooperative block when it starts", () => {
    const events: Array<[string, SkipReason, number]> = [];
    const runner = new TimelineRunner(
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
        onSkipRequest: (block, reason) =>
          events.push([block.id, reason, runner.time]),
      },
    );

    runner.start();

    expect(events).toEqual([["loop", "cooperative", 0]]);
    expect(runner.time).toBe(2);
    expect(runner.snapshot().blockingBlockIds).toEqual(["loop"]);

    runner.complete("loop");

    expect(runner.time).toBe(3);
    expect(runner.phase).toBe("finished");
  });

  it("auto-fires when every block in the end-time barrier is cooperative", () => {
    const events: string[] = [];
    const runner = new TimelineRunner(
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
        onSkipRequest: (block, reason) => {
          if (reason === "cooperative") {
            events.push(block.id);
          }
        },
      },
    );

    runner.start();

    expect(events).toEqual(["a0", "b0"]);
    expect(runner.time).toBe(0);
  });

  it("auto-fires an automatic skip only once per block", () => {
    const events: string[] = [];
    const runner = new TimelineRunner(
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
        onSkipRequest: (block, reason) => {
          if (reason === "cooperative") {
            events.push(block.id);
          }
        },
      },
    );

    runner.start();

    expect(events).toEqual(["a0", "b0"]);

    runner.complete("a0");

    expect(events).toEqual(["a0", "b0"]);
    expect(runner.time).toBe(0);

    runner.complete("b0");

    expect(runner.time).toBe(1);
    expect(runner.phase).toBe("finished");
  });
});

describe("TimelineRunner lifecycle", () => {
  it("rejects starting twice", () => {
    const runner = new TimelineRunner(createTimeline());

    runner.start();

    expect(() => runner.start()).toThrow(/cannot start/i);
  });

  it("rejects completing an unknown block", () => {
    const runner = new TimelineRunner(createTimeline());
    runner.start();

    expect(() => runner.complete("missing")).toThrow(/unknown block/i);
  });

  it("rejects completing a block before it starts", () => {
    const runner = new TimelineRunner(createTimeline());
    runner.start();

    expect(() => runner.complete("next-line")).toThrow(/not started/i);
  });

  it("rejects completing a block twice", () => {
    const runner = new TimelineRunner(createTimeline());
    runner.start();
    runner.complete("sfx");

    expect(() => runner.complete("sfx")).toThrow(/already completed/i);
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
