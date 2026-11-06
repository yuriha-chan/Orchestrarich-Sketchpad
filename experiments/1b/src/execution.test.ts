import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineSnapshot } from "../../../src/core/execution/timeline-runner.ts";
import { TimelineSession, SKIP_FADE_MS, toTimelineDefinition } from "./execution";
import type { Placement } from "./model";
import { TRACKS } from "./model";

function placement(overrides: Partial<Placement> = {}): Placement {
  return {
    id: "placement-1",
    trackId: TRACKS[0].id,
    kind: "dialogue",
    start: 0,
    length: 1,
    cooperativeSkip: false,
    ...overrides,
  };
}

function setup(placements: Placement[]) {
  const activities: string[] = [];
  let snapshot: TimelineSnapshot | null = null;
  const session = new TimelineSession(placements, {
    onSnapshot: (value) => {
      snapshot = value;
    },
    onActivity: (message) => {
      activities.push(message);
    },
  });
  return {
    session,
    activities,
    snapshot: (): TimelineSnapshot | null => snapshot,
    blockState: (id: string) =>
      snapshot?.blocks.find((block) => block.id === id)?.state,
  };
}

describe("toTimelineDefinition", () => {
  it("groups placements by track and keeps cooperative skip", () => {
    const definition = toTimelineDefinition([
      placement({ id: "dialogue", start: 0, length: 1 }),
      placement({
        id: "bgm",
        trackId: TRACKS[2].id,
        kind: "sound",
        start: 2,
        length: 3,
        cooperativeSkip: true,
      }),
    ]);

    expect(definition.tracks).toHaveLength(TRACKS.length);
    expect(definition.tracks[0].blocks).toEqual([
      { id: "dialogue", start: 0, length: 1, cooperativeSkip: false },
    ]);
    expect(definition.tracks[1].blocks).toEqual([]);
    expect(definition.tracks[2].blocks).toEqual([
      { id: "bgm", start: 2, length: 3, cooperativeSkip: true },
    ]);
  });
});

describe("TimelineSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits at the end barrier for the animation after the dialogue advances", async () => {
    const run = setup([
      placement({ id: "line", kind: "dialogue" }),
      placement({
        id: "door",
        trackId: TRACKS[1].id,
        kind: "animation",
        length: 1,
      }),
    ]);

    run.session.start();

    expect(run.snapshot()?.time).toBe(0);
    expect([...(run.snapshot()?.blockingBlockIds ?? [])].sort()).toEqual([
      "door",
      "line",
    ]);

    run.session.advanceDialogue("line");
    await vi.advanceTimersByTimeAsync(0);

    expect(run.blockState("line")).toBe("completed");
    expect(run.snapshot()?.blockingBlockIds).toEqual(["door"]);

    await vi.advanceTimersByTimeAsync(700);

    expect(run.blockState("door")).toBe("completed");
    expect(run.snapshot()?.time).toBe(1);
    expect(run.snapshot()?.phase).toBe("finished");
  });

  it("keeps waiting for a dialogue block that ignores a user skip", async () => {
    const run = setup([
      placement({ id: "line", kind: "dialogue" }),
      placement({
        id: "sfx",
        trackId: TRACKS[2].id,
        kind: "sound",
        length: 1,
      }),
    ]);

    run.session.start();
    run.session.requestSkip();
    await vi.advanceTimersByTimeAsync(SKIP_FADE_MS);

    expect(run.blockState("sfx")).toBe("completed");
    expect(run.blockState("line")).toBe("running");
    expect(run.snapshot()?.time).toBe(0);
    expect(run.snapshot()?.blockingBlockIds).toEqual(["line"]);
    expect(run.activities).toContain("Skip (user): sfx at t=0");

    run.session.advanceDialogue("line");
    await vi.advanceTimersByTimeAsync(0);

    expect(run.snapshot()?.time).toBe(1);
    expect(run.snapshot()?.phase).toBe("finished");
  });

  it("auto-skips a lone cooperative block", async () => {
    const run = setup([
      placement({
        id: "bgm",
        trackId: TRACKS[2].id,
        kind: "sound",
        start: 0,
        length: 1,
        cooperativeSkip: true,
      }),
    ]);

    run.session.start();

    expect(run.activities).toContain("Skip (cooperative): bgm at t=0");
    expect(run.snapshot()?.blockingBlockIds).toEqual(["bgm"]);

    await vi.advanceTimersByTimeAsync(SKIP_FADE_MS);

    expect(run.blockState("bgm")).toBe("completed");
    expect(run.snapshot()?.time).toBe(1);
    expect(run.snapshot()?.phase).toBe("finished");
  });

  it("holds the cooperative skip until an earlier-ending non-cooperative block completes", async () => {
    const run = setup([
      placement({
        id: "bgm",
        trackId: TRACKS[2].id,
        kind: "sound",
        start: 0,
        length: 3,
        cooperativeSkip: true,
      }),
      placement({ id: "line", kind: "dialogue", start: 1, length: 1 }),
    ]);

    run.session.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(run.snapshot()?.time).toBe(1);
    expect(run.blockState("bgm")).toBe("running");
    expect(run.activities.some((message) => message.includes("Skip"))).toBe(
      false,
    );

    run.session.advanceDialogue("line");
    await vi.advanceTimersByTimeAsync(0);

    expect(run.activities).toContain("Skip (cooperative): bgm at t=1");
    expect(run.snapshot()?.time).toBe(2);
    expect(run.snapshot()?.blockingBlockIds).toEqual(["bgm"]);

    await vi.advanceTimersByTimeAsync(SKIP_FADE_MS);

    expect(run.snapshot()?.time).toBe(3);
    expect(run.snapshot()?.phase).toBe("finished");
  });
});
