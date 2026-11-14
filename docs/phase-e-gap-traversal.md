# Phase E: semantic gap traversal

## Objective and constraints

The runner owns semantic gap visits. The editor session consumes visits and
applies slot initializations; it no longer reconstructs visits from time-start
and loop-repeat callbacks. The same framework-independent boundary-context
derivation is used by both execution and the editor's layout projection.
Preserve established gap identities, traversal order and frequencies; output
termination precedes visits at the next boundary. Preserve runner disposal and
loop-generation guarantees. Prior behavior does not visit
the terminal horizon on ordinary completion; this refactor does not invent a
new terminal initialization policy.

## First increment: runner visit contract

Add `onGapVisit?: (boundary: number, path: readonly LoopDefinition[]) => void`
to runner options. Paths contain the actual loop definition objects ordered
outer-to-inner; empty path is the outermost context. Normal entry visits each
derived context in close-then-open order before same-time starts. On a loop
repeat, visit the end contexts from the inside up to but excluding the parent,
then the start contexts strictly after that parent; the jump's normal entry
must not repeat those visits. All callbacks stop immediately if the runner is
disposed. Existing `onTimeStart` and `onLoopRepeat` are retained for existing
external consumers, but will no longer be used to reconstruct visits by the
session. No editor behavior is changed in this first test increment.

The reusable derivation will accept an already outer-to-inner flattened list of
structural loops, and produce paths of the original loop objects; editor loop
IDs are a projection of those objects. No duplicate path enumeration algorithm
is to remain in the editor.

The runner RED suite observed six failures with the callback unimplemented and
now passes. `boundaryGapContexts` in the framework-independent core supplies
the same context derivation to both runner and editor `boundaryGapPaths`.
The session maps visited loop objects to authored loop IDs and applies the
corresponding initialization; its old time/repeat slicing and skip-time state
have been removed. Existing `onTimeStart` and `onLoopRepeat` callbacks remain
compatible. Focused runner, session and loop suites pass (203 tests), as does
typecheck. The runner suppresses only the duplicate normal visit after a repeat;
the same-time callback still occurs. Disposal is checked between gap visits.

## Additional traversal witnesses

Add functional tests in existing runner tests for touching sibling loops and
simultaneous nested starts, comparing complete ordered boundary/path visits
against the settled close-then-open context rule, including repeats. Include a
disposal during a repeat-end gap visit to show that the loop jump and later
visits do not occur. Keep timeline horizon and current callback contracts, do
not assert same-time block execution order. Use explicit fixture loop identity
labels. Run the focused suite and typecheck. No production changes or commit.

The additional touching-sibling, simultaneous nested-start, and disposal
witnesses pass. Full verification passed: 546 tests, typecheck, build and diff
check. No UI test was performed. An independent consultation checkpoint found
no necessary User question within this preservation-scoped phase. Terminal-
horizon nonvisitation is observed prior behavior kept unchanged, not a
separately approved language rule; this phase does not settle terminal semantics.

### RED task

Modify only `src/core/execution/timeline-runner.ts` and its existing test file.
Add the optional callback type only, with no implementation. Add functional
runner tests for no-loop normal visits and ordering before block start, simple
loop repeat visits, nested/shared boundary contexts, and disposal from a gap
visit stopping subsequent visits and starts. Drive completion through existing
deferred Promise helper; compare paths by fixture object identity or stable
fixture labels rather than depending on same-time block ordering. Explicitly
cover no terminal-horizon normal visit. Run focused tests and typecheck, report
RED and already-passing cases. No production implementation or commit.
