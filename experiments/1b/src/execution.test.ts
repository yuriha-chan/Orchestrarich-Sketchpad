import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineSnapshot } from "../../../src/core/execution/timeline-runner.ts";
import { TimelineSession, SKIP_FADE_MS, toTimelineDefinition, type ExecutionInstance } from "./execution";
import { compilePlacement, definitionBlocks, isMultiPhase, type ExecutionDefinition } from "./execution-definition";
import type {
  BlockKind,
  DialoguePlacement,
  DurationUnit,
  Placement,
} from "./model";
import { DEFAULT_TRACKS } from "./model";
import { createStageStore, type DialogueView } from "./stage-state";
import { MediaExecution, TimedExecution } from "./block-execution";

type PlacementOverrides = Omit<Partial<DialoguePlacement>, "kind"> & {
  kind?: BlockKind;
  duration?: number;
  durationUnit?: DurationUnit;
  syncBeatsToCellSpan?: boolean;
  fadeIn?: number;
  fadeOut?: number;
};

function placement(overrides: PlacementOverrides = {}): Placement {
  const {
    kind = "dialogue",
    duration,
    durationUnit,
    syncBeatsToCellSpan,
    fadeIn,
    fadeOut,
    ...rest
  } = overrides;
  const base = {
    id: "placement-1",
    trackId: DEFAULT_TRACKS[0].id,
    start: 0,
    length: 1,
    cooperativeSkip: false,
    ...rest,
  };
  if (kind === "dialogue") {
    return { ...base, kind };
  }
  const durationFields = {
    duration: duration ?? 1,
    durationUnit: durationUnit ?? "beats",
    syncBeatsToCellSpan: syncBeatsToCellSpan ?? false,
  };
  if (kind === "sound" || kind === "animation") {
    return {
      ...base,
      kind,
      ...durationFields,
      fadeIn: fadeIn ?? 0,
      fadeOut: fadeOut ?? 0,
    };
  }
  return { ...base, kind, ...durationFields };
}

function setup(placements: Placement[], bpm = 120, stage = createStageStore()) {
  const activities: string[] = [];
  const finalized: string[] = [];
  const startedInstances: ExecutionInstance[] = [];
  const finalizedInstances: ExecutionInstance[] = [];
  let snapshot: TimelineSnapshot | null = null;
  const session = new TimelineSession(DEFAULT_TRACKS, placements, bpm, stage.getState(), {
    onSnapshot: (value) => {
      snapshot = value;
    },
    onActivity: (message) => {
      activities.push(message);
    },
    onExecutionStart: (instance) => {
      startedInstances.push(instance);
    },
    onFinalize: (instance) => {
      finalized.push(instance.definition.placement.id);
      finalizedInstances.push(instance);
    },
  });
  return {
    session,
    activities,
    finalized,
    startedInstances,
    finalizedInstances,
    stage,
    advanceDialogue: (placementId: string) => {
      const instance = startedInstances.find((instance) => instance.definition.placement.id === placementId)!;
      const dialogue = stage.getState().items.find(
        (item): item is DialogueView => item.id === instance.id && item.kind === "dialogue",
      )!;
      dialogue.confirm();
    },
    snapshot: (): TimelineSnapshot | null => snapshot,
    blockState: (id: string) =>
      snapshot?.blocks.find((block) => block.id === id)?.state,
  };
}

describe("toTimelineDefinition", () => {
  it("groups placements by track and keeps cooperative skip", () => {
    const definition = toTimelineDefinition(DEFAULT_TRACKS, [
      placement({ id: "dialogue", start: 0, length: 1 }),
      placement({
        id: "bgm",
        trackId: DEFAULT_TRACKS[2].id,
        kind: "sound",
        start: 2,
        length: 3,
        cooperativeSkip: true,
      }),
    ]);

    expect(definition.tracks).toHaveLength(DEFAULT_TRACKS.length);
    expect(definition.tracks[0].blocks).toEqual([
      { id: "dialogue", start: 0, length: 1, cooperativeSkip: false },
    ]);
    expect(definition.tracks[1].blocks).toEqual([]);
    expect(definition.tracks[2].blocks).toEqual([
      { id: "bgm~0", start: 2, length: 3, cooperativeSkip: true },
    ]);
  });

  it("splits a media block into phases at its fade boundaries", () => {
    const definition = toTimelineDefinition(DEFAULT_TRACKS, [
      placement({
        id: "clip",
        trackId: DEFAULT_TRACKS[1].id,
        kind: "animation",
        start: 2,
        length: 4,
        fadeIn: 1,
        fadeOut: 1,
      }),
    ]);

    expect(definition.tracks[1].blocks).toEqual([
      { id: "clip~0", start: 2, length: 1, cooperativeSkip: false },
      { id: "clip~1", start: 3, length: 2, cooperativeSkip: false },
      { id: "clip~2", start: 5, length: 1, cooperativeSkip: false },
    ]);
  });

  it("includes a track added to the document", () => {
    const tracks = [...DEFAULT_TRACKS, { id: "extra", label: "Track 4" }];
    const definition = toTimelineDefinition(tracks, [
      placement({ id: "extra-block", trackId: "extra" }),
    ]);

    expect(definition.tracks).toHaveLength(4);
    expect(definition.tracks[3]).toEqual({
      id: "extra",
      blocks: [
        { id: "extra-block", start: 0, length: 1, cooperativeSkip: false },
      ],
    });
  });
});

describe("execution structure", () => {
  it("classifies multi-phase structure independently of media kind", () => {
    const wait = placement({ kind: "wait", length: 3 });
    const definition: ExecutionDefinition = {
      placement: wait,
      structure: {
        type: "multi-phase",
        phases: [
          { index: 0, offset: 0, length: 1 },
          { index: 1, offset: 1, length: 2 },
        ],
      },
    };
    expect(isMultiPhase(definition.structure)).toBe(true);
    expect(isMultiPhase(compilePlacement(wait).structure)).toBe(false);
    expect(definitionBlocks(definition)).toEqual([
      { id: "placement-1~0", start: 0, length: 1, cooperativeSkip: false },
      { id: "placement-1~1", start: 1, length: 2, cooperativeSkip: false },
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

  it("creates media execution subtypes that own presentation and timer cleanup", () => {
    const run = setup([
      placement({ id: "clip", kind: "animation" }),
      placement({ id: "sound", kind: "sound", trackId: DEFAULT_TRACKS[1].id }),
      placement({ id: "wait", kind: "wait", trackId: DEFAULT_TRACKS[2].id }),
    ]);
    run.session.start();
    const [animation, sound, wait] = run.startedInstances;
    expect(animation).toBeInstanceOf(MediaExecution);
    expect(sound).toBeInstanceOf(MediaExecution);
    expect(wait).toBeInstanceOf(TimedExecution);
    expect(wait).not.toBeInstanceOf(MediaExecution);
    expect(run.stage.getState().items.map((item) => item.id)).toEqual([animation.id]);
    expect(vi.getTimerCount()).toBe(3);

    run.session.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(run.stage.getState().items).toEqual([]);
  });

  it("waits at the end barrier for the animation after the dialogue advances", async () => {
    const run = setup([
      placement({ id: "line", kind: "dialogue" }),
      placement({
        id: "door",
        trackId: DEFAULT_TRACKS[1].id,
        kind: "animation",
        length: 1,
      }),
    ]);

    run.session.start();

    expect(run.snapshot()?.time).toBe(0);
    expect([...(run.snapshot()?.blockingBlockIds ?? [])].sort()).toEqual([
      "door~0",
      "line",
    ]);

    run.advanceDialogue("line");
    await vi.advanceTimersByTimeAsync(0);

    expect(run.blockState("line")).toBe("completed");
    expect(run.snapshot()?.blockingBlockIds).toEqual(["door~0"]);

    await vi.advanceTimersByTimeAsync(500);

    expect(run.blockState("door~0")).toBe("completed");
    expect(run.snapshot()?.time).toBe(1);
    expect(run.snapshot()?.phase).toBe("finished");
  });

  it("runs a timed block for its duration rather than its cell span", async () => {
    const run = setup([
      placement({
        id: "sfx",
        trackId: DEFAULT_TRACKS[2].id,
        kind: "sound",
        length: 1,
        duration: 2,
      }),
    ]);

    run.session.start();

    await vi.advanceTimersByTimeAsync(999);

    expect(run.blockState("sfx~0")).toBe("running");
    expect(run.snapshot()?.time).toBe(0);

    await vi.advanceTimersByTimeAsync(1);

    expect(run.blockState("sfx~0")).toBe("completed");
    expect(run.snapshot()?.time).toBe(1);
  });

  it("runs a seconds duration regardless of the BPM", async () => {
    const run = setup(
      [
        placement({
          id: "sfx",
          trackId: DEFAULT_TRACKS[2].id,
          kind: "sound",
          length: 1,
          duration: 2,
          durationUnit: "seconds",
        }),
      ],
      240,
    );

    run.session.start();

    await vi.advanceTimersByTimeAsync(1999);

    expect(run.blockState("sfx~0")).toBe("running");
    expect(run.snapshot()?.time).toBe(0);

    await vi.advanceTimersByTimeAsync(1);

    expect(run.blockState("sfx~0")).toBe("completed");
    expect(run.snapshot()?.time).toBe(1);
  });

  it("runs a wait block for its duration", async () => {
    const run = setup([
      placement({
        id: "pause",
        trackId: DEFAULT_TRACKS[1].id,
        kind: "wait",
        length: 1,
        duration: 2,
      }),
    ]);

    run.session.start();

    await vi.advanceTimersByTimeAsync(999);

    expect(run.blockState("pause")).toBe("running");
    expect(run.snapshot()?.time).toBe(0);

    await vi.advanceTimersByTimeAsync(1);

    expect(run.blockState("pause")).toBe("completed");
    expect(run.snapshot()?.time).toBe(1);
    expect(run.snapshot()?.phase).toBe("finished");
  });

  it("keeps waiting for a dialogue block that ignores a user skip", async () => {
    const run = setup([
      placement({ id: "line", kind: "dialogue" }),
      placement({
        id: "sfx",
        trackId: DEFAULT_TRACKS[2].id,
        kind: "sound",
        length: 1,
      }),
    ]);

    run.session.start();
    run.session.requestSkip();
    await vi.advanceTimersByTimeAsync(SKIP_FADE_MS);

    expect(run.blockState("sfx~0")).toBe("completed");
    expect(run.blockState("line")).toBe("running");
    expect(run.snapshot()?.time).toBe(0);
    expect(run.snapshot()?.blockingBlockIds).toEqual(["line"]);
    expect(run.activities).toContain("Skip (user): sfx at t=0");

    run.advanceDialogue("line");
    await vi.advanceTimersByTimeAsync(0);

    expect(run.snapshot()?.time).toBe(1);
    expect(run.snapshot()?.phase).toBe("finished");
  });

  it("auto-skips a lone cooperative block", async () => {
    const run = setup([
      placement({
        id: "bgm",
        trackId: DEFAULT_TRACKS[2].id,
        kind: "sound",
        start: 0,
        length: 1,
        cooperativeSkip: true,
      }),
    ]);

    run.session.start();

    expect(run.activities).toContain("Skip (cooperative): bgm at t=0");
    expect(run.snapshot()?.blockingBlockIds).toEqual(["bgm~0"]);

    await vi.advanceTimersByTimeAsync(SKIP_FADE_MS);

    expect(run.blockState("bgm~0")).toBe("completed");
    expect(run.snapshot()?.time).toBe(1);
    expect(run.snapshot()?.phase).toBe("finished");
  });

  it("holds the cooperative skip until an earlier-ending non-cooperative block completes", async () => {
    const run = setup([
      placement({
        id: "bgm",
        trackId: DEFAULT_TRACKS[2].id,
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
    expect(run.blockState("bgm~0")).toBe("running");
    expect(run.activities.some((message) => message.includes("Skip"))).toBe(
      false,
    );

    run.advanceDialogue("line");
    await vi.advanceTimersByTimeAsync(0);

    expect(run.activities).toContain("Skip (cooperative): bgm at t=1");
    expect(run.snapshot()?.time).toBe(2);
    expect(run.snapshot()?.blockingBlockIds).toEqual(["bgm~0"]);

    await vi.advanceTimersByTimeAsync(SKIP_FADE_MS);

    expect(run.snapshot()?.time).toBe(3);
    expect(run.snapshot()?.phase).toBe("finished");
  });

  it("creates a barrier at each media phase boundary", async () => {
    const run = setup([
      placement({
        id: "clip",
        trackId: DEFAULT_TRACKS[1].id,
        kind: "animation",
        start: 0,
        length: 4,
        duration: 4,
        fadeIn: 1,
        fadeOut: 1,
      }),
    ]);

    run.session.start();

    expect(run.snapshot()?.time).toBe(0);
    expect(run.snapshot()?.blockingBlockIds).toEqual(["clip~0"]);

    await vi.advanceTimersByTimeAsync(499);

    expect(run.blockState("clip~0")).toBe("running");
    expect(run.snapshot()?.time).toBe(0);

    await vi.advanceTimersByTimeAsync(1);

    expect(run.blockState("clip~0")).toBe("completed");
    expect(run.snapshot()?.time).toBe(2);
    expect(run.snapshot()?.blockingBlockIds).toEqual(["clip~1"]);

    await vi.advanceTimersByTimeAsync(1000);

    expect(run.blockState("clip~1")).toBe("completed");
    expect(run.snapshot()?.time).toBe(3);
    expect(run.snapshot()?.blockingBlockIds).toEqual(["clip~2"]);

    await vi.advanceTimersByTimeAsync(499);

    expect(run.blockState("clip~2")).toBe("running");

    await vi.advanceTimersByTimeAsync(1);

    expect(run.blockState("clip~2")).toBe("completed");
    expect(run.snapshot()?.time).toBe(4);
    expect(run.snapshot()?.phase).toBe("finished");
  });

  it("keeps one execution instance through intermediate and final barrier waits", async () => {
    const run = setup([
      placement({ id: "gate", length: 1 }),
      placement({ id: "end-gate", start: 1, length: 3 }),
      placement({
        id: "clip",
        trackId: DEFAULT_TRACKS[1].id,
        kind: "animation",
        length: 4,
        duration: 4,
        fadeIn: 1,
        fadeOut: 1,
      }),
    ]);
    run.session.start();
    const clip = run.startedInstances.find((instance) => instance.definition.placement.id === "clip")!;
    const presentation = run.stage.getState().items.find((item) => item.id === clip.id)!;
    expect(presentation).toMatchObject({
      kind: "animation",
      durationMs: 2000,
      fadeInFraction: 0.25,
      fadeOutFraction: 0.25,
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(run.snapshot()?.time).toBe(0);
    expect(run.blockState("clip~0")).toBe("completed");
    expect(run.blockState("clip~1")).toBe("pending");
    expect(run.finalizedInstances).not.toContain(clip);
    expect(run.stage.getState().items.find((item) => item.id === clip.id)).toMatchObject({
      id: presentation.id,
      playback: { positionMs: 500, playing: false },
    });

    run.advanceDialogue("gate");
    await vi.advanceTimersByTimeAsync(0);
    expect(run.stage.getState().items.find((item) => item.id === clip.id)).toMatchObject({
      id: presentation.id,
      playback: { positionMs: 500, playing: true },
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(run.snapshot()?.time).toBe(3);
    expect(run.blockState("clip~2")).toBe("completed");
    expect(run.finalizedInstances).not.toContain(clip);
    expect(run.stage.getState().items.find((item) => item.id === clip.id)).toMatchObject({
      id: presentation.id,
      playback: { positionMs: 2000, playing: false },
    });
    expect(run.startedInstances.filter((instance) => instance.definition.placement.id === "clip")).toEqual([clip]);

    run.advanceDialogue("end-gate");
    await vi.advanceTimersByTimeAsync(0);
    expect(run.finalizedInstances).toContain(clip);
    expect(run.stage.getState().items).toEqual([]);
    run.session.dispose();
  });

  it("dialogue execution writes UI state and owns the confirmation callback", async () => {
    const run = setup([placement({ id: "line" })]);
    expect(run.stage.getState().items).toEqual([]);
    run.session.start();
    const dialogue = run.stage.getState().items[0];
    expect(dialogue).toMatchObject({
      kind: "dialogue",
      text: "lazy dog jumps ...",
      label: "Dialogue @0",
    });
    expect(run.blockState("line")).toBe("running");

    run.advanceDialogue("line");
    expect(run.stage.getState().items).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run.blockState("line")).toBe("completed");
    run.session.dispose();
  });

  it("disposal terminates the presentations owned by active blocks", () => {
    const run = setup([
      placement({ id: "line" }),
      placement({ id: "clip", kind: "animation", trackId: DEFAULT_TRACKS[1].id }),
    ]);
    run.session.start();
    expect(run.stage.getState().items.map((item) => item.kind)).toEqual(["dialogue", "animation"]);
    run.session.dispose();
    expect(run.stage.getState().items).toEqual([]);
    expect(run.finalizedInstances).toEqual(run.startedInstances);
  });

  it("allocates different execution identities for the same placement", async () => {
    const documentPlacement = placement({ kind: "wait" });
    const first = setup([documentPlacement]);
    const second = setup([documentPlacement]);
    first.session.start();
    second.session.start();

    const firstInstance = first.startedInstances[0];
    const secondInstance = second.startedInstances[0];
    expect(firstInstance).not.toBe(secondInstance);
    expect(firstInstance.id).not.toBe(secondInstance.id);
    expect(firstInstance.definition.placement).toBe(documentPlacement);
    expect(secondInstance.definition.placement).toBe(documentPlacement);

    await vi.advanceTimersByTimeAsync(500);
    expect(first.finalizedInstances).toEqual([firstInstance]);
    expect(second.finalizedInstances).toEqual([secondInstance]);
    first.session.dispose();
    second.session.dispose();
  });

  it("each execution removes only its own presentation of the same placement", async () => {
    const sharedStage = createStageStore();
    const documentPlacement = placement({ kind: "animation" });
    const first = setup([documentPlacement], 120, sharedStage);
    const second = setup([documentPlacement], 120, sharedStage);
    first.session.start();
    await vi.advanceTimersByTimeAsync(250);
    second.session.start();
    expect(sharedStage.getState().items.map((item) => item.id)).toEqual([
      first.startedInstances[0].id,
      second.startedInstances[0].id,
    ]);

    await vi.advanceTimersByTimeAsync(250);
    expect(sharedStage.getState().items.map((item) => item.id)).toEqual([
      second.startedInstances[0].id,
    ]);
    await vi.advanceTimersByTimeAsync(250);
    expect(sharedStage.getState().items).toEqual([]);
    first.session.dispose();
    second.session.dispose();
  });

  it("finalizes a media container only when its last phase terminates", async () => {
    const run = setup([
      placement({
        id: "clip",
        trackId: DEFAULT_TRACKS[1].id,
        kind: "animation",
        start: 0,
        length: 4,
        duration: 4,
        fadeIn: 1,
        fadeOut: 1,
      }),
    ]);

    run.session.start();

    await vi.advanceTimersByTimeAsync(500);

    expect(run.blockState("clip~0")).toBe("completed");
    expect(run.finalized).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);

    expect(run.blockState("clip~1")).toBe("completed");
    expect(run.finalized).toEqual([]);

    await vi.advanceTimersByTimeAsync(500);

    expect(run.blockState("clip~2")).toBe("completed");
    expect(run.finalized).toEqual(["clip"]);
    expect(run.snapshot()?.phase).toBe("finished");
  });
});
