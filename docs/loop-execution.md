# Loop playback (pilot): 3 iterations

## Decision

The User's earlier "only authoring markers" was an implementation-convenience
permit, not a hard constraint:

> The intention of "only authoring markers" direction is I wanted to check out
> basic UI interaction first before investing details in semantics. So this was a
> implementation convinience permit and not a hard constraint. Now we are more
> natural to implement semantics. for now we can implement loops to be 3 times
> loop (because this is pilot implementation of semantics)

Loop playback is therefore in scope. Each loop body executes **3 times total**
(nested loops multiply, so an inner loop runs 3 times per outer iteration).

## Semantics

- A block strictly inside a loop re-executes on every iteration as a new
  execution instance; its slot writes repeat.
- Slot values persist across iterations unless an initialization inside the loop
  runs again. A boundary initialization at a re-entered time is applied again.
- Blocks outside every loop execute once, unaffected by repetition.
- The barrier still waits for completion at every logical time, in every
  iteration. Termination of blocks ending at the loop end runs once per
  iteration.
- Logical time jumps backward from the loop end boundary to the loop start; the
  cursor and barrier span follow.
- A block that **contains** a loop (allowed by design.md 3.5 and by the editor) is
  rejected at run time in this pilot, because the design does not define its
  timing under repeated traversal. Blocks must be strictly inside a loop or
  disjoint from it. This limitation applies only when loop playback is active.
- Stale promise settlements from a previous iteration must not complete the new
  iteration; each internal block execution needs a generation token.

## Deferred to the gap stage (already established by the User)

- Gaps are initialization positions, not decoration.
- The gap/cell sequence is derived recursively from the loop forest; `k` edges at
  a boundary produce `k+1` contiguous gaps; every gap keeps 32 px width.
- Each gap carries its enclosing loop path. An initialization in the gap before a
  loop edge runs once per entry to that context; after the edge it runs at every
  iteration. Frequency is relative to the enclosing loops, so a gap inside an
  outer loop repeats with the outer loop even if it is before an inner edge.
- Initializations are keyed by gap (slot, boundary time, gap context), not by time
  only.
- The derived structure is used by the renderer and by execution.

## Implementation stages

1. Core loop playback: `TimelineLoop` tree in the timeline definition, 3
   iterations, time jumps, block reset, stale-settlement guard, loop-aware
   horizon, rejection of containing/partial blocks.
2. Derived gap/cell structure with gap identity and loop paths.
3. Gap-keyed slot initializations: storage, placement UI, execution schedule,
   and validation by the unrolled visit order.
4. Renderer: contiguous gap runs, loop markers between gaps, pills and rails in
   the correct gaps.

## Stage 1 implemented: core playback

- `TimelineDefinition.loops?: readonly LoopDefinition[]`; a loop is
  `{ start, end, iterations, loops }`. Nested loops form a laminar forest:
  children lie inside the parent, siblings are disjoint or touch, and crossing
  loops are rejected. `iterations` is explicit and at least 1; the editor maps
  every authored loop with `LOOP_ITERATIONS = 3` (`src/editor/execution.ts`).
- The runner keeps a stack of active loop frames. Entering a loop start pushes a
  frame. At the loop end barrier, after the blocks ending there complete and
  terminate, a frame with iterations remaining resets every block strictly
  inside that loop (state `pending`, outputs cleared, generation incremented),
  jumps logical time to the loop start, and increments the frame. An exhausted
  frame is popped; the check repeats for an outer loop that ends at the same
  boundary.
- Because the generation is part of every completion, failure, and skip-promise
  callback, a settlement or rejection left over from a previous iteration is
  ignored instead of completing or failing the new iteration.
- The session creates a new `ExecutionInstance` when a placement's start is
  reached again, so each iteration gets fresh block execution and presentation
  state.
- Loop ends are barrier check times and count toward the horizon. A loop whose
  last cells are empty still repeats to its end.
- Blocks must be strictly inside a loop or disjoint from it. A block that
  contains a loop, or partially overlaps one, is rejected while the runner is
  constructed; the UI reports that message in the activity line and starts no
  run. This is a pilot limitation: design.md 3.5 allows containing blocks, but
  their timing under repeated traversal is undefined.
- Slot initializations are still keyed by absolute time in this stage and are
  re-applied whenever a loop re-enters that time. Gap-keyed initializations are
  stage 3.

## Stage 2 implemented: derived gap and cell structure

- `boundaryGapPaths(loops, time)` in `src/editor/loops.ts` derives the gap
  contexts at a boundary. The left context holds loops with
  `start < time && end >= time`; the right context holds loops with
  `start <= time && end > time`, both ordered outer to inner. Contexts are
  visited by closing loops from the innermost to the common prefix and then
  opening loops from the common prefix outward. Every visited context is one
  gap, so `k` edges at a boundary produce `k + 1` contiguous gaps.
- `buildTimelineLayout(cellCount, gapPathsAt)` in
  `src/editor/timeline-layout.ts` emits one 32 px gap per derived context,
  followed by the 96 px cell, for every boundary including the trailing one.
  Each gap carries `path`, its enclosing loop ids.
- `loopEdgeX(layout, time, loopId, edge)` returns the x between the two gaps
  that the loop's start or end edge separates; the loop bar, the row band, and
  the two marker lines use it.
- `anchorGapCenter(layout, time)` returns the first gap of a run. Time-keyed
  slot badges, rail endpoints, and output wires still use this anchor; gap-keyed
  initialization authoring and execution remain stage 3.
- The App builds the layout from the loop forest, so the extra gaps widen the
  grid immediately: row tiles paint the cells over the gap-colored row
  background, and blocks, slots, rails, wires, the ruler, and the barrier
  cursor all follow the shifted cell positions.

## Stage 3 implemented: gap-keyed slot initializations

- A numeric slot initialization is keyed by `(boundary, path)`, where `path`
  holds the enclosing loop ids, and is applied when the traversal visits that
  gap.
- The slot row renders one initialization region per gap from the layout; the
  value badge sits in the gap, and the rail connects gap positions in rendered
  order.
- The runner reports loop repeats with the repeating loop. The session applies
  the closing contexts at the loop end (from the inside out to the parent
  context) and the opening contexts at the loop start (from the parent inward),
  then skips the normal boundary application for the jump target.
- Read validation keeps the "initialization at or before the read time" rule.
  Initializations whose gap no longer exists are pruned before validation,
  rendering, and execution.
- Coverage: path existence and pruning (`slot-gaps`), storing and clearing gap
  keys and orphan retention (store), per-iteration reapplication (session), and
  repeat events (runner).
