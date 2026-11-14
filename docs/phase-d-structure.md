# Phase D: phase structure and timeline editing

## First increment: a single phase structure

Block definitions declare an execution structure, either a single block or a
multi-phase container. The phase list is the source for compilation and the
offsets of its internal boundaries. A generic operation derives those offsets
from the ends of all phases except the last; no separate boundary list is
declared by a block. The definition remains responsible for producing phases,
and media classification remains independent of that structure.

This increment preserves existing phase IDs, skip settings, start and end
times, and container lifecycle. It does not settle the pixel anchor of an
internal boundary within a loop-gap run. Timeline gesture ownership and atomic
span/data edits are subsequent increments.

The helper's three new tests were observed failing against the skeleton and
passing after implementation. The host now reads phase offsets from the same
compiled structure used by execution; the separate per-definition boundary
declaration has been removed. Media rendering and gesture semantics still need
to be connected to that structure. Full verification at this point: typecheck,
489 tests, build and diff check passed.

## RED task: phase boundary derivation

Work only in `src/editor/execution-definition.ts` and
`src/editor/execution.test.ts`. Add an exported
`phaseOffsets(structure: ExecutionStructure): readonly number[]` skeleton and
functional tests: a single structure has no internal offsets; a multi-phase
structure returns the end offset of each phase except the final phase, including
unequal phase lengths; a one-phase multi-phase structure has no internal
offsets. Use existing tests and fixtures where practical. Run the focused tests
and report the observed failures, without implementing the skeleton. Do not
change other code or commit.

## Next increment: transactional span and data edits

Extend the existing `setSpan` command with an optional data update callback.
After a target span passes existing placement validation and the block's
`onLengthChange` operation has run, apply the callback to the resulting data in
the same store transaction. A rejected span applies neither geometry nor data
update. Existing three-argument callers retain their behavior. This provides the
generic host a single transaction for a block-provided semantic gesture edit;
it does not give the store knowledge of fades or block kinds.

The success test failed with the unused callback skeleton, then passed with
the transaction implemented. Overlap rejection, loop-cut rejection, and the
existing three-argument command were already passing preservation cases. The
gesture host has not yet been migrated to this command. Typecheck, all 493
tests, build and diff check passed after the increment.

### RED task

Work only in `src/editor/store.ts` and `src/editor/store.test.ts`. Extend the
`setSpan` interface and implementation signature to accept an optional
`(data: unknown) => unknown` fourth argument, but leave it unused as the RED
skeleton. Add functional tests against the real store that (1) a valid span
applies the data callback after length-change processing in the same command,
(2) overlapping and loop-cutting spans apply neither callback nor geometry,
and (3) existing three-argument span operations still work. Use a real media
block and existing registered operations or an explicit callback, not a copied
fade algorithm. Run the focused store suite and report observed outcomes; do
not implement callback application or commit.

## Media gesture operation

The pointer host identifies a right-button outer edge or a left-button internal
phase boundary by index. A block-provided operation captures the original
placement and returns an edit for each cell delta. An edit consists of a target
start and length and a data-update callback, submitted together to `setSpan`.
The host owns pointer capture, bounds and hit testing, but does not calculate
fade directions, shared boundaries or fade amounts.

The media operation retains current behavior: inward edge drags set the fade
absolutely; outward drags expand the span and grow the existing fade by the
expansion, constrained by start zero or the rendered column count. Internal
boundary drags keep the span and calculate the pair atomically from the initial
fade data. The returned update uses `editFades` against data after the store's
length-change operation. Invalid spans remain wholly rejected by `setSpan`.

During one edge drag, an inward movement following an outward expansion must
preserve the currently accepted span, as the existing host does. The operation
therefore receives the current placement geometry on each move as well as the
initial placement captured at pointer down. This preserves existing behavior;
do not silently reset the span to its original geometry when the pointer
crosses back over the starting point.

### RED task: media gesture

In `src/editor/blocks/media-fades.ts` add an exported throwing skeleton
`mediaGesture(block: Placement<MediaData>, target: { kind: "edge"; edge:
"start" | "end" } | { kind: "boundary"; index: number }, columnCount: number)`
returning `(delta: number) => { start: number; length: number; update: (data:
MediaData) => MediaData }`. Add functional tests to existing
`src/editor/blocks/media-data.test.ts` for both inward edges, outward expansion
and limits on both sides, and shared-boundary redistribution. Apply each
returned update to data adjusted for the returned length through the real
`onMediaLengthChange`. Do not modify other files or implement the skeleton.
Run the focused suite and report RED and typecheck results.

## Host integration task

Add a generic `TimelineGestureTarget` union (`edge` start/end or `boundary`
index), `TimelineGestureEdit<T>` (start, length, update), and optional
`timelineGesture` factory to `BlockDefinition<T>`. It takes the original
placement, target and column count and returns a function of cell delta and
current placement geometry. Register `mediaGesture` for sound and animation.
In `BlockView`, right-edge hit testing and internal boundary index hit testing
select a target; the generic host stores the returned gesture function and
calls it on movement, applying the result through the single `setSpan` command.
Preserve selection, pointer capture and edge context-menu suppression. Keep
ordinary move/resize paths unchanged. No fade-specific calculations or imports
should remain in `App.tsx`. Existing fade-handle title and media styling may
remain for this increment. Work only in `block-definition.ts`, `App.tsx`,
`blocks/sound.tsx`, and `blocks/animation.tsx`; verify typecheck and focused
tests; do not commit. Lead will inspect semantic equivalence and remaining
parallel responsibilities.

## Phase boundary level

The User clarified: "placing the phase boundary inside the loop means looping
phase boundary => meaningless so phase boundary must be at the same level of
the entire block, and boudary must be at the outside gap". A boundary inside a
block therefore uses the gap whose path is the block's enclosing loop context,
excluding loops contained by the block. At nested same-time edges this picks
the gap at the block's level, not simply the first gap. The line is centered in
that gap, following the existing gap-center anchoring convention. This is an
authoring visual rule, including cases the current loop execution pilot rejects.

## RED task: phase geometry

Work only in `src/editor/timeline-layout.ts` and its existing test file. Add a
throwing skeleton `phaseBoundaryX(layout: TimelineLayout, time: number, path:
readonly string[]): number`. It returns the center of the gap with the exact
path at the supplied boundary. Test ordinary and multiple contiguous gaps,
including selecting a middle path for a block inside an outer loop while
excluding a contained inner loop; test the established contract error for a
missing path. Use real `buildTimelineLayout` and gap paths; no duplicated pixel
formula as implementation. Run the focused suite and typecheck, report RED;
no implementation or commit.

## Fade gesture snapping around contained loops

The User clarified that a fade-in dragged inside a contained loop moves to the
loop start, while fade-out moves to its end. When both fades share a boundary,
the User said "should separate (shared boundary is coincidential)": they snap
independently and the loop becomes body between them. For nested contained
loops, snap outside all containing loops, so the block-level constraint holds.
Do not move a boundary already at an edge. Preserve wall-clock execution and
unrelated loop or span behavior.

Pass the authored loop regions into the registered block-owned gesture as
context. The media gesture calculates the proposed fades then snaps internal
fade-in and fade-out boundaries independently using the proposed span. Submit
the resulting geometry and pair through the existing atomic `setSpan` command.
Other authoring operations still reject combinations that would leave an
internal phase boundary inside a contained loop; this clarification concerns
fade gesture behavior.

### RED task: fade gesture snapping

Modify only `src/editor/block-definition.ts`, `src/editor/blocks/media-fades.ts`,
`src/editor/blocks/media-data.test.ts`, `src/editor/store.test.ts` and call
sites in `src/editor/App.tsx` needed for a compatible optional loop-context
argument. Add the context parameter but do not implement snapping. Add functional
tests for fade-in and fade-out separate boundary gestures, shared-boundary split,
loop edge unchanged, nested loops, and production registered gesture plus
store transaction. Use real loop regions, no fabricated fade calculations in
the test. Run focused tests and typecheck, report observed RED. No commit.

The User clarified that a shared boundary is coincidental and must split when
the two fade endpoints snap to opposite sides of a contained loop. Tests
initially failed without snapping and now pass for individual, shared and
nested-loop gestures and the registered-gesture/store transaction. Further
tests exposed excessive-delta and reversal cases; the implementation now
applies the existing fade-clamping edit before snapping and preserves the
current opposite fade. Those tests were observed RED before the correction.
Existing inspector and loop-geometry commands reject changes that would put a
phase boundary strictly inside a contained loop; the User's snapping answer
was given to the specifically described fade-drag interaction.

Phase compilation supplies internal boundary offsets; session lifecycle uses
first/last compiled phase identity rather than inferring container lifecycle
from endpoint equality. The layout uses the block-level gap center for phase
handles and fade surfaces. The generic host delegates gesture edits to blocks,
and the superseded fade-handle edit API was removed. Functional tests cover
non-media multi-phase execution, span/data atomicity and real layout/loop/phase
composition. No UI test was performed.

## Layout rendering integration

The generic host computes internal phase offsets from `compilePlacement`, uses
`blockLoopPath` for the block's level and `phaseBoundaryX` for each boundary,
then passes positions relative to the block's drawn left edge to the block's
`renderBlock` contribution. The media contribution uses those positions for
both handle placement and fade/body surface widths, with the block edges as
endpoints when a fade occupies the entire block. Dot-mask generation uses the
actual pixel width of each fade surface. The block still owns which phase is a
fade; the host has no media-specific interpretation. No timeline execution or
loop-gap scheduling changes.

## Phase boundary validity

The User clarified that a fade-phase boundary cannot lie strictly inside a
loop contained by its block. Enforce this through generic compiled phase
structure, not media-kind checks. A candidate placement is valid with respect
to phases when no internal phase time is strictly inside a contained loop.
Coinciding with either loop edge remains valid and uses the block-level gap.
Existing valid editing behavior is preserved: reject edits that would create an
invalid combination, without partially applying geometry/data/loop changes.
Apply the same rule to block data edits, geometry moves/resizes, kind changes,
loop creation and boundary changes; block duplication must search forward for
the next span satisfying the rule as well as the existing placement constraints.

### RED task: authoring validity

In `src/editor/store.test.ts` only add functional tests through real store
commands. Cover a media block containing a loop with a phase boundary strictly
inside it: reject a data edit introducing the boundary; reject moving or
resizing an already phased block into such a combination; reject loop creation
or boundary edits that would make the combination invalid; permit boundaries
exactly at loop start/end; and duplicate to the next valid free span rather
than producing an invalid duplicate. Use real registered fade field operations
or `editBlockData`, real loops and existing helpers. Assert no partial change
on rejection. Run the focused store suite and report observed RED, without
editing production code or committing. Do not assume cross-track order.

## Remove the superseded fade handle interface

The media gesture operation now owns edits, so `fadeHandles` is a parallel
edit API. Replace its two display-only uses with generic block-definition
contributions: an optional timeline class name and a title function. Media
definitions provide `is-media` and the existing fade title. Remove FadeHandles
and mediaFadeHandles; no block-kind branches in the host. Refactor the existing
shared-boundary regression tests to call the registered timeline gesture and
real `setSpan`, keeping the 2/2 -> 3/1, 1/3 and zero-fade assertions and
atomic-update semantics. Retain all other tests. Delegate only
`block-definition.ts`, `App.tsx`, `blocks/media-fades.ts`, `blocks/sound.tsx`,
`blocks/animation.tsx`, `store.test.ts`; run focused store/media tests and
typecheck; no commit. Lead audits the semantic diff.

## Layout composition witness

Extract the host's existing phase-position calculation into a pure exported
`phasePositions(layout, loops, block, offsets, blockLeft)` helper in
`timeline-layout.ts`. It must use the existing `blockLoopPath` and
`phaseBoundaryX` operations; the host invokes that helper. Add functional
tests in the existing layout suite with real loop forest paths and compiled
phase offsets: an ordinary boundary, a block enclosing a loop edge, and a
block inside an outer loop enclosing an inner loop at the same boundary. Check
that positions are relative to the drawn block left and select the block-level
gap. This is a behavior-preserving extraction: existing valid placement and
authored User rule are the specification. No browser test or screenshot claim.

Delegate integration only across `App.tsx`, `block-definition.ts`, and
`blocks/media-block.tsx`. Preserve zero-width and no-fade cases, pointer target
indices, and mask direction. Run typecheck, focused layout/loop/media tests,
and build. Do not change other files or commit. Lead audits the geometry and
tests the production composition separately.

## RED task: block-level loop path

In `src/editor/loops.ts` and its existing test file only, add a throwing
`blockLoopPath(loops: readonly LoopNode[], start: number, length: number):
readonly string[]` skeleton. The flat loop list is in the same form accepted by
`blockLoopEdges`. Return enclosing loops outer-to-inner, excluding any loop
contained by the block (including equal spans, matching `blockLoopEdges`). Test
no loop, a block strictly inside nested loops, a block inside an outer loop
containing nested loops, and a block equal to a loop. Run focused tests and
typecheck and report RED; no implementation or commit.
