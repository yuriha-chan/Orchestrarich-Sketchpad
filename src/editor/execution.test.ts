import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineSnapshot } from "../core/execution/timeline-runner.ts";
import type { NumericSlot } from "../core/slots/numeric-slots.ts";
import { TimelineSession, SKIP_FADE_MS, slotReads, toTimelineDefinition, type ExecutionInstance } from "./execution";
import { compilePlacement, definitionBlocks, isMultiPhase, type ExecutionDefinition } from "./execution-definition";
import type {
  BlockKind,
  DialoguePlacement,
  DurationUnit,
  Placement,
  RectUnit,
  Track,
} from "./model";
import { DEFAULT_TRACKS } from "./model";
import {
  createStageStore,
  type DialogueView,
  type RectangleView,
} from "./stage-state";
import { MediaExecution, TimedExecution } from "./block-execution";

type PlacementOverrides = Omit<Partial<DialoguePlacement>, "kind"> & {
  kind?: BlockKind;
  duration?: number;
  durationUnit?: DurationUnit;
  syncBeatsToCellSpan?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rectUnit?: RectUnit;
  inputA?: number;
  inputB?: number;
  slotBindings?: Partial<Record<string, string>>;
};

function placement(overrides: PlacementOverrides = {}): Placement {
  const {
    kind = "dialogue",
    duration,
    durationUnit,
    syncBeatsToCellSpan,
    fadeIn,
    fadeOut,
    x,
    y,
    w,
    h,
    rectUnit,
    inputA,
    inputB,
    slotBindings,
    ...rest
  } = overrides;
  const base = {
    id: "placement-1",
    trackId: DEFAULT_TRACKS[0].id,
    start: 0,
    length: 1,
    cooperativeSkip: false,
    ...(slotBindings === undefined ? {} : { slotBindings }),
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
  if (kind === "rectangle") {
    return {
      ...base,
      kind,
      ...durationFields,
      x: x ?? 0,
      y: y ?? 0,
      w: w ?? 1,
      h: h ?? 1,
      rectUnit: rectUnit ?? "span",
    };
  }
  if (kind === "addition") {
    return {
      ...base,
      kind,
      ...durationFields,
      inputA: inputA ?? 0,
      inputB: inputB ?? 0,
    };
  }
  return { ...base, kind, ...durationFields };
}

function numericSlot(
  id: string,
  trackId: string | null,
  initializations: { time: number; value: number }[] = [],
): NumericSlot {
  return { id, trackId, initializations };
}

function setup(
  placements: Placement[],
  bpm = 120,
  stage = createStageStore(),
  slots: readonly NumericSlot[] = [],
) {
  const activities: string[] = [];
  const finalized: string[] = [];
  const startedInstances: ExecutionInstance[] = [];
  const finalizedInstances: ExecutionInstance[] = [];
  let snapshot: TimelineSnapshot | null = null;
  const session = new TimelineSession(DEFAULT_TRACKS, placements, bpm, stage.getState(), {
    slots,
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

function rectangleItem(run: ReturnType<typeof setup>, placementId: string) {
  const instance = run.startedInstances.find(
    (started) => started.definition.placement.id === placementId,
  )!;
  return run.stage.getState().items.find(
    (item): item is RectangleView =>
      item.kind === "rectangle" && item.id === instance.id,
  );
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
    const tracks: readonly Track[] = [
      ...DEFAULT_TRACKS,
      { id: "extra", label: "Track 4", color: "#d97706" },
    ];
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

describe("slotReads", () => {
  it("derives reads for each slot-capable property in capability order", () => {
    const reads = slotReads([
      placement({
        id: "rect",
        trackId: DEFAULT_TRACKS[1].id,
        kind: "rectangle",
        start: 3,
        slotBindings: { h: "height-slot", x: "x-slot" },
      }),
    ]);

    expect(reads).toEqual([
      { slotId: "x-slot", trackId: DEFAULT_TRACKS[1].id, time: 3 },
      { slotId: "height-slot", trackId: DEFAULT_TRACKS[1].id, time: 3 },
    ]);
  });

  it("ignores bindings on block kinds without slot-capable properties", () => {
    const reads = slotReads([
      placement({
        id: "camera",
        kind: "camera",
        slotBindings: { x: "x-slot" },
      }),
    ]);

    expect(reads).toEqual([]);
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

  it("keeps a rectangle on the stage until its block terminates", async () => {
    const run = setup([
      placement({ id: "gate", kind: "dialogue" }),
      placement({
        id: "rect",
        trackId: DEFAULT_TRACKS[1].id,
        kind: "rectangle",
        x: 3,
        y: 2,
        w: 1,
        h: 1,
        rectUnit: "span",
      }),
    ]);

    run.session.start();

    const rectangle = run.startedInstances.find(
      (instance) => instance.definition.placement.id === "rect",
    )!;
    expect(
      run.stage.getState().items.filter((item) => item.kind === "rectangle"),
    ).toEqual([
      { kind: "rectangle", id: rectangle.id, x: 3, y: 2, w: 1, h: 1, unit: "span" },
    ]);

    await vi.advanceTimersByTimeAsync(500);

    expect(run.snapshot()?.time).toBe(0);
    expect(run.blockState("rect")).toBe("completed");
    expect(
      run.stage.getState().items.filter((item) => item.kind === "rectangle"),
    ).toHaveLength(1);

    run.advanceDialogue("gate");
    await vi.advanceTimersByTimeAsync(0);

    expect(run.stage.getState().items).toEqual([]);
    expect(run.snapshot()?.time).toBe(1);
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

  it("reads a slot initialized at the same logical time before the rectangle starts", () => {
    const run = setup(
      [
        placement({
          id: "rect",
          trackId: DEFAULT_TRACKS[1].id,
          kind: "rectangle",
          start: 0,
          slotBindings: { x: "same-time" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("same-time", DEFAULT_TRACKS[1].id, [{ time: 0, value: 4 }])],
    );

    run.session.start();

    expect(rectangleItem(run, "rect")).toMatchObject({
      x: 4,
      y: 0,
      w: 1,
      h: 1,
      unit: "span",
    });
  });

  it("reads a slot initialized in an earlier empty column", () => {
    const run = setup(
      [
        placement({
          id: "rect",
          trackId: DEFAULT_TRACKS[1].id,
          kind: "rectangle",
          start: 3,
          slotBindings: { h: "earlier" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("earlier", DEFAULT_TRACKS[1].id, [{ time: 1, value: 7 }])],
    );

    run.session.start();

    expect(run.snapshot()?.time).toBe(3);
    expect(rectangleItem(run, "rect")).toMatchObject({
      x: 0,
      y: 0,
      w: 1,
      h: 7,
      unit: "span",
    });
  });

  it("reads the latest initialization at or before the rectangle start", () => {
    const run = setup(
      [
        placement({
          id: "rect",
          trackId: DEFAULT_TRACKS[1].id,
          kind: "rectangle",
          start: 2,
          slotBindings: { w: "size" },
        }),
      ],
      120,
      createStageStore(),
      [
        numericSlot("size", DEFAULT_TRACKS[1].id, [
          { time: 0, value: 1 },
          { time: 1, value: 5 },
          { time: 3, value: 9 },
        ]),
      ],
    );

    run.session.start();

    expect(run.snapshot()?.time).toBe(2);
    expect(rectangleItem(run, "rect")).toMatchObject({ w: 5 });
  });

  it("uses immediate numbers for fields without a slot binding", () => {
    const run = setup(
      [
        placement({
          id: "rect",
          trackId: DEFAULT_TRACKS[1].id,
          kind: "rectangle",
          x: 9,
          y: 3,
          w: 2,
          h: 5,
          slotBindings: { x: "x-slot" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("x-slot", DEFAULT_TRACKS[1].id, [{ time: 0, value: 1 }])],
    );

    run.session.start();

    expect(rectangleItem(run, "rect")).toMatchObject({
      x: 1,
      y: 3,
      w: 2,
      h: 5,
      unit: "span",
    });
  });

  it("binds all four rectangle properties to slots", () => {
    const run = setup(
      [
        placement({
          id: "rect",
          trackId: DEFAULT_TRACKS[1].id,
          kind: "rectangle",
          slotBindings: { x: "x-slot", y: "y-slot", w: "w-slot", h: "h-slot" },
        }),
      ],
      120,
      createStageStore(),
      [
        numericSlot("x-slot", DEFAULT_TRACKS[1].id, [{ time: 0, value: 1 }]),
        numericSlot("y-slot", DEFAULT_TRACKS[1].id, [{ time: 0, value: 2 }]),
        numericSlot("w-slot", DEFAULT_TRACKS[1].id, [{ time: 0, value: 3 }]),
        numericSlot("h-slot", DEFAULT_TRACKS[1].id, [{ time: 0, value: 4 }]),
      ],
    );

    run.session.start();

    expect(rectangleItem(run, "rect")).toMatchObject({
      x: 1,
      y: 2,
      w: 3,
      h: 4,
      unit: "span",
    });
  });

  it("reads one slot through multiple rectangle properties", () => {
    const run = setup(
      [
        placement({
          id: "rect",
          trackId: DEFAULT_TRACKS[1].id,
          kind: "rectangle",
          x: 1,
          y: 2,
          slotBindings: { w: "size", h: "size" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("size", DEFAULT_TRACKS[1].id, [{ time: 0, value: 6 }])],
    );

    run.session.start();

    expect(rectangleItem(run, "rect")).toMatchObject({
      x: 1,
      y: 2,
      w: 6,
      h: 6,
      unit: "span",
    });
  });

  it("reads a shared slot from multiple blocks on different tracks", () => {
    const run = setup(
      [
        placement({
          id: "dialogue-rect",
          trackId: DEFAULT_TRACKS[0].id,
          kind: "rectangle",
          start: 0,
          slotBindings: { x: "shared" },
        }),
        placement({
          id: "camera-rect",
          trackId: DEFAULT_TRACKS[1].id,
          kind: "rectangle",
          start: 0,
          slotBindings: { x: "shared" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("shared", null, [{ time: 0, value: 8 }])],
    );

    run.session.start();

    expect(rectangleItem(run, "dialogue-rect")).toMatchObject({ x: 8 });
    expect(rectangleItem(run, "camera-rect")).toMatchObject({ x: 8 });
  });

  it("rejects start for a nonexistent slot without producing stage output", () => {
    const run = setup(
      [
        placement({
          id: "rect",
          trackId: DEFAULT_TRACKS[1].id,
          kind: "rectangle",
          slotBindings: { x: "missing" },
        }),
      ],
    );

    expect(() => run.session.start()).toThrow();
    expect(run.startedInstances).toEqual([]);
    expect(run.stage.getState().items).toEqual([]);
  });

  it("rejects start for an uninitialized slot without producing stage output", () => {
    const run = setup(
      [
        placement({
          id: "rect",
          trackId: DEFAULT_TRACKS[1].id,
          kind: "rectangle",
          slotBindings: { x: "empty" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("empty", DEFAULT_TRACKS[1].id)],
    );

    expect(() => run.session.start()).toThrow();
    expect(run.startedInstances).toEqual([]);
    expect(run.stage.getState().items).toEqual([]);
  });

  it("rejects start for a later-initialized slot without producing stage output", () => {
    const run = setup(
      [
        placement({
          id: "rect",
          trackId: DEFAULT_TRACKS[1].id,
          kind: "rectangle",
          start: 0,
          slotBindings: { x: "late" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("late", DEFAULT_TRACKS[1].id, [{ time: 2, value: 5 }])],
    );

    expect(() => run.session.start()).toThrow();
    expect(run.startedInstances).toEqual([]);
    expect(run.stage.getState().items).toEqual([]);
  });

  it("rejects start for a local slot read from another track without producing stage output", () => {
    const run = setup(
      [
        placement({
          id: "rect",
          trackId: DEFAULT_TRACKS[1].id,
          kind: "rectangle",
          slotBindings: { x: "other-track" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("other-track", DEFAULT_TRACKS[2].id, [{ time: 0, value: 3 }])],
    );

    expect(() => run.session.start()).toThrow();
    expect(run.startedInstances).toEqual([]);
    expect(run.stage.getState().items).toEqual([]);
  });
});

describe("addition blocks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the sum to its output slot before the next column starts", async () => {
    const run = setup(
      [
        placement({
          id: "add",
          kind: "addition",
          start: 0,
          length: 1,
          inputA: 2,
          inputB: 3,
          slotBindings: { out: "sum" },
        }),
        placement({
          id: "reader",
          kind: "rectangle",
          start: 1,
          length: 1,
          duration: 1,
          slotBindings: { x: "sum" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("sum", null)],
    );

    run.session.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(run.blockState("add")).toBe("completed");
    expect(run.snapshot()?.time).toBe(1);
    expect(rectangleItem(run, "reader")?.x).toBe(5);
  });

  it("reads its two inputs from slots", async () => {
    const run = setup(
      [
        placement({
          id: "add",
          kind: "addition",
          start: 0,
          length: 1,
          slotBindings: { a: "left", b: "right", out: "sum" },
        }),
        placement({
          id: "reader",
          kind: "rectangle",
          start: 1,
          length: 1,
          duration: 1,
          slotBindings: { x: "sum" },
        }),
      ],
      120,
      createStageStore(),
      [
        numericSlot("left", null, [{ time: 0, value: 4 }]),
        numericSlot("right", null, [{ time: 0, value: 6 }]),
        numericSlot("sum", null),
      ],
    );

    run.session.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(rectangleItem(run, "reader")?.x).toBe(10);
  });

  it("assigns the output at the block's end time", async () => {
    const run = setup(
      [
        placement({
          id: "add",
          kind: "addition",
          start: 0,
          length: 3,
          inputA: 2,
          inputB: 3,
          slotBindings: { out: "sum" },
        }),
        placement({
          id: "reader",
          kind: "rectangle",
          start: 3,
          length: 1,
          duration: 1,
          slotBindings: { x: "sum" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("sum", null)],
    );

    run.session.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(run.blockState("add")).toBe("completed");
    expect(run.snapshot()?.time).toBe(3);
    expect(rectangleItem(run, "reader")?.x).toBe(5);
  });

  it("rejects a read inside the block's span", () => {
    const run = setup(
      [
        placement({
          id: "reader",
          kind: "rectangle",
          start: 1,
          length: 1,
          duration: 1,
          slotBindings: { x: "sum" },
        }),
        placement({
          id: "add",
          kind: "addition",
          trackId: DEFAULT_TRACKS[1].id,
          start: 0,
          length: 3,
          inputA: 2,
          inputB: 3,
          slotBindings: { out: "sum" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("sum", null)],
    );

    expect(() => run.session.start()).toThrow(/Invalid numeric slot reads/);
  });

  it("rejects a read of a slot that is only produced later", () => {
    const run = setup(
      [
        placement({
          id: "reader",
          kind: "rectangle",
          start: 0,
          length: 1,
          duration: 1,
          slotBindings: { x: "sum" },
        }),
        placement({
          id: "add",
          kind: "addition",
          start: 1,
          length: 1,
          duration: 1,
          inputA: 1,
          inputB: 1,
          slotBindings: { out: "sum" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("sum", null)],
    );

    expect(() => run.session.start()).toThrow(/Invalid numeric slot reads/);
  });

  it("rejects an output binding to another track's local slot", () => {
    const run = setup(
      [
        placement({
          id: "add",
          kind: "addition",
          inputA: 1,
          inputB: 1,
          slotBindings: { out: "local" },
        }),
      ],
      120,
      createStageStore(),
      [numericSlot("local", DEFAULT_TRACKS[1].id)],
    );

    expect(() => run.session.start()).toThrow(/Invalid numeric slot writes/);
  });
});
