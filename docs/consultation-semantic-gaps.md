# Consultation: semantic gaps and recursive gap/cell derivation

## Original Context

### Request that produced the current layout model (verbatim)

> In current UI model, gaps are part of cell. We are going to create contiguous gaps
> since there will be outer-loop gap and inner-loop gap. So at first we change the UI
> model. cells and gaps are UI objects, like: [gap, cell, gap, cell, gap, gap, cell,
> gap, cell, gap, gap, gap, cell, gap, cell, gap, gap]

Surrounding situation: this followed a report that the timeline used a fixed cell
pitch (128 px = 96 px tile + 32 px gap, with the gap treated as part of the cell).
The example sequence is 6 cells with boundary gap-run lengths 1, 1, 2, 1, 3, 1, 2,
which is consistent with loops `[2,4)` and `[4,6)` contributing one additional gap
per marker at their start and end boundaries.

### Lead's follow-up questions (paraphrase, not User text)

1. Does a boundary with loop markers get one extra gap per marker (base + per
   start/end)?
2. Outer vs inner loop gap: same width, or narrower inside?
3. At a boundary with both an inner-loop end and an outer-loop start, which extra
   gap goes before vs after the base gap?
4. Should the grid widen when loop gaps are added, or should gaps take space from
   the cells?

### User clarification (verbatim)

> two things to clarify: gaps are not only a visual component. gap is a place where
> value initialization take place. so initialize in the gap before loop edge: variable
> initialized only once. initialize in the gap after loop edge: variable initialized
> at every iteration.
>
> so don't think there are three kinds of gaps (before, base, after) to render. the
> structure automatically derives gap and cell sequence by recursive rules, and the
> component reflect that structure. there may be 4 or more contiguous gap run if
> nested loop starts at the same position. the derived model is used in the execution
> too.
>
> ```text
> gap | most outer loop                                                                             | gap
>     | gap | intermediate loop                         | gap | intermediate loop #2          | gap |
>     |     | gap | inner loop                    | gap |     | gap | cell | gap | cell | gap |     |
>     |     |     | gap | cell | gap | cell | gap |     |     |     |      |     |      |     |     |
> ```

Surrounding situation: this message answered (and rejected the framing of) the four
questions above. The Lead had asked about "extra loop gaps" on top of a base gap;
the User instead treats every gap as a semantic initialization position and requires
the whole sequence to be derived recursively.

### Earlier decisions that constrain this work

- Loop markers increment: User answer "only authoring markers." Loop playback,
  termination conditions, and redo/exit markers are later increments.
- Multiple/nested loops: "I see this system as a visual programming language, so I
  took for granted that we have multiple and nested loops. so please think of AST".
  The implementation is a laminar forest of properly nested loop nodes.
- Slot initializations: several initializations may exist per slot at distinct
  logical times; a read uses the latest initialization at or before its time; reads
  before the first initialization are invalid; the editor rejects them and the
  runner refuses to start. This is a deliberate "for now" relaxation of design.md's
  single-value slot rule; discard/reuse are not modeled.

## Current Work

Objective: implement semantic gaps and the recursively derived gap/cell sequence,
and make the renderer and the execution use that same derived structure.

State before the clarification (commit `8dc624a`):

- `src/editor/timeline-layout.ts` builds a `TimelineLayout` from a
  `BoundarySpec { before?: readonly number[]; baseWidth?: number; after?: readonly number[] }`.
  Every boundary `0..n` (including the trailing one) emits one 32 px base gap;
  cells are 96 px; `segments`, `boundaries`, `cellLefts`, `width`, plus queries
  `cellLeft`, `cellRight`, `boundary`, `baseGapCenter`, `cellAtX`, `cellDelta`,
  `blockSpan`, `barrierRect`.
- `src/editor/App.tsx` renders the ruler, rows, blocks, creation previews, barrier
  cursor, slot rows, value rails, slot wires and loop bar from that layout; pointer
  hit-testing and drag deltas use `cellAtX`/`cellDelta`.
- `src/core/slots/numeric-slots.ts`: `NumericSlot { id, trackId, name?,
  initializations: { time, value }[] }`; a read is valid if an initialization
  exists at or before the read time.
- `src/editor/store.ts`: `initializeSlot(id, time, value)` upserts by time;
  `clearSlotInitialization(id, time)` removes one time.
- In the editor a value pill is centered in the single base gap of its boundary;
  execution applies initializations through the runner's `onTimeStart(time)` hook.
- Loops (`src/editor/loops.ts`) are authored only; the runner executes a single
  pass from `t=0` to the horizon.
- Verification at the commit: typecheck clean, 362 tests in 13 files, build
  succeeds, `git diff --check` clean.

Affected tasks: loop-gap derivation; gap identity; the initialization placement UI;
the execution's use of the derived model; possibly loop playback.

## Observed Situation

The clarification contradicts the implemented before/base/after `BoundarySpec`
classification. It establishes that:

- A gap is not decorative; it is a position where a value initialization occurs.
- An initialization in the gap before a loop edge runs once; in the gap after the
  edge it runs at every iteration.
- The gap and cell sequence is not categorized but derived recursively from the
  structure; nested loop starts at the same position can produce four or more
  contiguous gaps.
- The same derived model is used in execution.

No code has changed since `8dc624a`.

## Candidate Questions

1. Does this increment include loop playback/repetition, so that "initialized at
   every iteration" is observable? Or only the recursive structure and
   gap-attached initialization, with runs still single-pass?
2. Must a slot initialization now be identified by its gap (for example slot,
   boundary time, gap index) instead of by logical time alone, so two
   initializations at the same logical time can sit on opposite sides of a loop
   edge and the editor can choose the gap?
3. Should every derived gap keep the current 32 px width, so the grid widens by
   32 px for each additional gap at a boundary, or should the additional gaps
   share the existing boundary space?

## Relevant Evidence

- `src/editor/timeline-layout.ts`: `CELL_WIDTH = 96`, `BASE_GAP_WIDTH = 32`,
  `TimelineGap.role: "base" | "loop"`, `BoundarySpec.before/baseWidth/after`.
- `src/editor/loops.ts`: `LoopNode { id, start, end, children }`; laminar
  (integer spans, siblings disjoint and touching allowed, children inside parent,
  crossing rejected); `allLoops`, `maxLoopDepth`, `wraps`, `wrapsableSpan`.
- `src/editor/App.tsx`: builds a uniform base-gap layout over `columnCount`;
  loop bar uses `maxLoopDepth(loops) * 24`; loop markers use `baseGapCenter(t)`.
- `src/core/slots/numeric-slots.ts`: `validateNumericSlotReads(slots, reads, writes)`;
  a read before the first initialization and an uninitialized slot are rejected;
  a block output whose end is at or before the read time also satisfies a read.
- `src/editor/execution.ts`: `TimelineSession.start()` validates slot reads,
  `onTimeStart` applies initializations, and execution instances read the runtime
  value at block start.
- `design.md` has no gap concept. §3.1: loop start/end markers at unit cell
  boundaries spanning the whole timeline, with an optional termination condition
  and redo/exit markers. §3.5: a block must include an entire loop section or none.
  §2.2–2.6: slots, reads, writes. §2.4: output is executed immediately before the
  block's end time. §2.10: termination processing of blocks ending at a time runs
  before the next logical time starts.

## Proposed or Completed Changes

- Completed in `8dc624a`: the explicit cell/gap `TimelineLayout`, its App
  integration (renderer, hit-testing, drag deltas), 13 layout tests, and the
  documentation of the layout and the slot-pill geometry.
- Not implemented: loop-gap runs, gap identity, per-gap initialization placement,
  any change to slot identity/validation/execution, and loop playback.

## Current Understanding

- Derived reading: start from the spine `gap, cell, gap, ..., gap`, one gap per
  boundary. A loop start edge splits the gap at its time into an outside gap
  (before the edge; runs once) and an inside gap (after the edge; runs every
  iteration), with the marker between them. A loop end edge splits it into an
  inside and an outside gap. Nested loops split the same inside gap again, so `k`
  edges at one boundary give `k+1` contiguous gaps.
- Ordering: at a boundary with several edges, ending edges are ordered
  innermost-to-outermost, then starting edges outermost-to-innermost. For touching
  siblings, the ending loop's inside gap, its end edge, the shared outside gap,
  the next loop's start edge, and its inside gap are consecutive.
- Each gap therefore carries the loop path (which loops contain it), which decides
  once-vs-every-iteration. Gaps with no loop edge are the existing timeline gaps.
- Uncertainties: the three candidate questions; how the editor lets a user choose
  among several gaps at one time; how the value rail and reference wires traverse
  a multi-gap boundary; whether an inside initialization is applied at the same
  logical time on each iteration and what the slot holds after the loop ends; and
  whether the timeline-level spine's gap is the outermost loop's outside gap or a
  separate gap when a loop starts at the same boundary.

## Blocking Status

Loop-gap generation and any change to initialization identity, placement, or
execution are stopped pending the answer to the questions above. No code has
changed since `8dc624a`.
