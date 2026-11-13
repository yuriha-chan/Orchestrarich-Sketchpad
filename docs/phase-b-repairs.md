# Phase B: bounded repairs and composition witnesses

## B1: atomic fade edits and span transactions

Preserve the existing cell-snapped fade rules. A shared phase boundary must
commit the fade pair together: moving the boundary of a four-cell media block
from 2/2 to 3/1 must not introduce a body phase through intermediate clamping.

Add `FadeHandles.setFades(fades: FadeData)` as the production pair operation.
The media implementation performs one data update and clamps once. Individual
edge operations remain for their existing single-edge behavior. The timeline
boundary gesture invokes the pair operation for every computed boundary edit.

Exercise this through the registered animation definition and the real store,
not through a test copy of the fade algorithm. The existing `setSpan` command
must also have functional witnesses for successful synced-duration/fade changes
and rejected changes preserving the entire placement. Rejected outward edits
were not a reproduced mutation bug; these tests protect the existing contract.

Later phase D owns the broader block-local gesture contract; phase C owns the
typed heterogeneous data boundary. Do not preempt either with a parallel API.

## Delegation: B1 RED tests

Senior Programmer edits only `src/editor/store.test.ts` and, if a minimal
compile skeleton is needed, adds a no-op `setFades` signature/implementation in
`block-definition.ts` and `blocks/media-fades.ts`. Do not implement the repair.
Use existing registry defaults and store actions. Add functional cases for:

- registered animation fade handles committing 2/2 -> 3/1 in one update;
- 2/2 -> 1/3, and a pair containing a zero fade;
- successful `setSpan` on synced media updates geometry, duration and clamps
  fades consistently;
- overlapping or loop-cutting `setSpan` leaves geometry and data unchanged.

Run the focused suite and report exact RED cases versus already-green
preservation cases. Do not invent RED for existing behavior. No copied domain
algorithms, UI tests, commits, or unrelated edits. Lead implements the fix and
audits the production gesture integration.

## B2: authored container preflight and one compiler

The loop playback pilot rejects a placement that contains a loop, even when
its lowered phases individually fit outside/inside that loop. This restriction
is unchanged by fade settings; authoring still permits the containing span.

Lead will consolidate the existing helper and session compilation into one
compiler result containing the timeline, phase-to-execution mapping and
identity-keyed loop paths. Validate original placement spans before lowering,
using the same span rule as the core runner. Do not instantiate a second
runner just to validate or change gap visits/three-iteration playback.

### Delegation: B2 RED tests

Senior Programmer edits only `src/editor/execution.test.ts`. Add functional
constructor and exported `toTimelineDefinition` cases for an animation [0,4)
containing loop [1,3), with fades 0/0 and 1/1: both configurations must reject
as containing, before any stage effect. Also retain/establish allowed media
inside a loop, disjoint media, and exact-equal loop/block spans (allowed inside
the loop by existing pilot policy). Reuse registry defaults and existing setup;
do not modify source, create a parallel compiler, or prescribe cross-track
execution order. Observe focused RED versus already-green cases. No commit.

## Delegation: B3 bounded UI repairs

Senior Programmer owns only `src/editor/App.tsx`, `timeline-layout.ts` and
`timeline-layout.test.ts`. Implement two localized repairs:

1. A track rename form already open when editing becomes locked must close,
   and its input/save must be disabled when not editable. Follow the existing
   slot-name editor locking pattern, preserving rename behavior during editing.
   No browser/UI testing; source audit/typecheck/build verify this small adapter.
2. Introduce `boundaryAtX(layout, x)` for loop boundary gestures. It returns the
   boundary time of the containing gap or the start time of the containing
   cell, preserving existing containing-cell snapping except that the trailing
   boundary returns `cellCount`, not `cellCount - 1`. Clamp outside coordinates
   to 0 / cellCount. All gaps in a contiguous run share the same time. Empty
   layout returns 0. Keep `cellAtX` unchanged for actual cell operations. Use the
   new query for both loop boundary handles in App.

Write functional layout tests first, observe RED with a minimal throwing
query skeleton, implement GREEN, re-run focused tests and typecheck/build.
Include leading/interior/trailing gaps, multi-gap boundaries, cells, out-of-range
and empty layout. Do not change semantic gap paths, widths, loop constraints,
or other gestures. Report edits and test evidence; do not commit.

## Delegation: B4 session composition witnesses

Senior Programmer owns only `src/editor/execution.test.ts`. Add functional
tests through the real session, builtins, slots and execution-owned stage
entries. Existing passing policy is being witnessed, not changed; do not force
RED for behavior already correct. No implementation or commits.

- Output timing: initialize a shared slot with an old value, start an instant
  addition with a multi-cell span and output bound to that slot. A rectangle
  starting inside that span must read the old value, and a rectangle starting
  at its end must read the addition output. Use an intermediate timed barrier
  so the earlier observation is genuinely before termination, not after an
  automatic pump jump. No invalid/uninitialized inside-span input.
- Output versus same-boundary initialization: a producer ends at a boundary
  with a slot initialization and a consumer starts there. The consumer reads
  the initialization (end assignment precedes time-start initialization).
- Loop re-entry: an initialization in an inside-start gap is reapplied despite
  an intervening addition writing a different value; observe reads each of the
  three iterations. Persistence alone must not satisfy the witness.
- Nested contexts: one outer initialization resets on each outer iteration,
  but not each inner iteration; use intervening output so observed values
  distinguish the containing contexts/frequencies (three-by-three pilot).
- Touching sibling loops: end/parent/start gap visits at the shared boundary
  apply in established order. Observe a consumer inside the second loop and
  include a write that distinguishes its repeated inside initialization from
  parent-only initialization.

Use simple explicit authored paths from the settled close/open derivation.
Do not infer new semantics from tests. Inspect existing fixtures only as needed;
record each scenario, why it distinguishes the contract, and focused results.
Prefer adapting an existing weak loop/output test where it serves the same
objective, retaining useful earlier cases when they protect different behavior.

## Completed changes and semantic review

- B1: `FadeHandles.setFades` commits the pair through one production update;
  App's internal boundary drag now invokes it instead of successive setters.
  Three new store cases observed RED with a no-op operation, then GREEN for
  3/1, 1/3 and a zero fade. Three additional real `setSpan` cases were already
  GREEN: synced duration/fade adjustment and whole-placement preservation on
  overlapping and loop-cutting rejection. No rejected-expansion mutation is
  claimed. The broader gesture/panel domain contract remains phases C/D work.
- B2: core `validateBlockLoopSpan` owns the existing pilot span rule; the runner
  and original-placement preflight both invoke it. One internal compiler now
  produces the timeline, phase mapping and identity-keyed loop paths for the
  helper and session. Seven new tests cover both preflight entry points with
  and without fades, plus inside/disjoint/equal-span acceptance. Three cases
  observed RED; the other four protect already-correct behavior. Equal spans
  are inside the loop, not prohibited containing spans.
- B3: `boundaryAtX` maps the containing layout segment to its boundary time,
  including the trailing boundary. Six new query tests observed RED then
  GREEN; `cellAtX` remains unchanged. Loop handles use the boundary query.
  Track rename input/save are disabled during a run; the existing parent
  lock-transition effect already closes the editor. Lead removed the delegated
  duplicate child effect rather than enforcing that invariant twice. The
  layout contract covers every in-range coordinate, so the query uses the
  found segment rather than an impossible-state fallback.
- B4: two existing runtime tests were strengthened and three new cases added.
  See `Implementation_Notes.B4.md` for complete scenarios. Lead corrected the
  output witness to start its inside-span reader after the producer completes;
  an already-started reader would retain its captured input and miss premature
  assignment. Re-entry witnesses use intervening output, and nested reads are
  recorded per placement to avoid prescribing cross-track order.

The Lead reviewed source/test diffs and contracts personally. Senior Programmer
tasks supplied bounded tests and the B3 adapter/query work, not architecture or
review judgment. No additional User decision was needed for these localized
repairs. The changes preserve stored units, container lifetime, gap visit order,
three-iteration loops, Promise-only completion and end-time output assignment.

## Verification

`pnpm typecheck`, `pnpm test` (452 tests in 16 files), `pnpm build` and
`git diff --check` passed. No browser/UI verification was performed; the User
can check rename locking and the final-boundary handle with `pnpm dev`.
