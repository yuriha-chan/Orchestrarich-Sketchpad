# Current codebase review

Baseline: `93fe57d`. Review-only: no application changes authorized. Lead performs
the review; no subagent review report is used. Sources read and conclusions are
recorded below so repairs do not require rediscovering the data flow.

## Status and limits of this review

The initial test reading selectively supported the defect investigation; its
completion claim was too broad. The subsequent dedicated TDD-guided assessment
personally inspected all 16 suites and is recorded in `docs/test-review.md`. R5 is
one supported finding within that broader assessment, not a reason to discount
the whole suite.

R1-R7 distinguish reproduced behavior from source findings. M1-M5 assess
concept-to-code ownership and change paths; their proposed directions are design
candidates, not conclusions established by a failing test. Distinct projections
of one concept do not by themselves prove a bad abstraction. The relevant question
is which relationships are declared/derived and which must be maintained manually.

A passing baseline does not establish historical RED-first discipline, functional
test quality, appropriate mocking, or faithful specialization of requirements.
Those require their own evidence. The User authorized careful continuation after
self-review; the dedicated assessment distinguishes contracts, incidental choices,
insufficient witnesses and unresolved judgment candidates.

## Governing contracts and scope

- User: "I only allow designing safety by setting up a proper contract" and
  "fix all, use typing wisely". Applies to internal lifecycle/type invariants;
  adding optional chaining to conceal a missing execution is not a remedy.
- User: "the block should complete only by resolving promise (or fail by
  rejecting promise)"; approved result `{ execution: Promise<void>, skip? }`.
  Outputs later extend the resolved value. `design.md:121-135` specifies timeline
  failure and termination. Throwing during startup must become managed failure.
- User: "the block itself modifies the UI state. renderer shows components
  according to the UI states." Stage effects belong to execution; runner
  snapshots remain appropriate for the debugger grid/cursor.
- User: "writing blocks/(block-name).ts and adding a line in builtin-blocks.ts
  must be sufficient to define a new block with panel interactions. No type
  branch." Later: "panel definition should be derived from block definition".
- `docs/loop-execution.md:14-34`: three iterations, nested multiplication,
  persistent slots, fresh execution instances, stale-settlement isolation, and
  the pilot restriction rejecting a block that contains a loop.
- `docs/slots.md:3-16,65-89`: gap visits apply initializations; instant addition
  returns outputs; runtime assigns at block-end termination. Repeated assignment
  is an explicit pilot relaxation, not a violation to fix back to single assignment.

## R1 — Startup failure violates the session's execution-existence invariant

Priority: high. Status: reproduced through public session startup (two probes).

- Core `src/core/execution/timeline-runner.ts:544-551` marks every due block
  running before invoking callbacks. A callback throw calls `failBlock`
  (`377-394`), which terminates running/failed records (`436-452,507-517`).
- This includes the failed block whose factory threw and same-time blocks whose
  callbacks have not run. Core test `timeline-runner.test.ts:1369-1399` explicitly
  asserts that only `a0` starts but both `a0` and `b0` terminate. This records the
  current implementation policy; the test is not authority that this policy is
  required by the language. The User subsequently clarified: "in that case B's
  termination should not be called, but generally the spec does not specify the
  order of exection. so \"A starting fails -> B does not terminate\" test is wrong
  technically". Cleanup must follow actual startup; neither the current test nor
  a replacement expecting A-only cleanup may prescribe unspecified startup order.
- Session `src/editor/execution.ts:277-295` inserts an instance only after
  `createExecution` returns; `297-310` unconditionally dereferences
  `activeExecutions.get(definition)!` and calls `terminatePhase`.
- Consequently a factory throw produces a second TypeError during failure
  cleanup rather than cleanly stopping/finalizing. Missing instance is a state
  permitted by core startup, not an impossible condition.

Repair boundary: make allocation/start/termination states agree explicitly across
runner and session. Retain managed failure and finally-like cleanup. Do not add
silent `?.terminatePhase` as a substitute for a lifecycle contract. Test factory
throw, first-phase throw, and same-time unstarted peers at the session boundary.
Current session tests cover disposal/normal finalization (`execution.test.ts:704-871`)
but not this path.

## R2 — Disposal releases instances but leaves their runner callbacks live

Priority: high. Status: reproduced with an actual addition execution Promise.

- `src/editor/execution.ts:207-213` unsubscribes and terminates/clears instances;
  it does not stop or invalidate the runner.
- Core Promise handlers remain attached (`timeline-runner.ts:377-393`), and
  completion checks only phase/generation/running state (`416-433`). None changes
  on session disposal.
- Dialogue confirmation (`blocks/dialogue.tsx:23-39`) and instant addition
  (`blocks/addition.tsx:27-29`) can already have resolved, with the completion
  microtask still queued when disposal occurs. Timer cancellation cannot revoke
  an already-resolved Promise.
- That microtask can pump termination into the cleared map at
  `execution.ts:300-301`. The `.then` continuation has no observer for an exception
  thrown from that pump (`timeline-runner.ts:390-393`).
- UI Reset/unmount call this disposal (`App.tsx:311-316,641-646`). The current
  disposal test (`execution.test.ts:786-796`) checks immediate removal only,
  without advancing a queued settlement.

Repair boundary: disposal must invalidate pending callbacks and prevent later
starts as part of an explicit run lifecycle, before releasing instance ownership.
The cancellation/terminal-state API must be chosen consistently; a second set of
ad-hoc liveness checks in every block would duplicate the runner's responsibility.

## R3 — Shared fade movement is split into two clamping edits

Priority: high for the editing gesture. Status: reproduced by composing the real
fade commands exactly as the shared-boundary handler does; no browser test.

- Pure `blocks/media-data.ts:76-91` returns an atomic pair from a shared-boundary
  drag. A 4-cell block with fades 2/2 dragged to offset 3 yields 3/1.
- `App.tsx:2413-2437` applies that pair through `handles.setFadeIn` followed by
  `handles.setFadeOut`, using the same handle object.
- `blocks/media-fades.ts:13-23` independently clamps each intermediate pair.
  `clampFadesToLength(3,2,4)` is 2/2; the second edit then produces 2/1, not 3/1.
  A body cell is introduced instead of moving the shared boundary.
- `FadeFields` duplicates the same pair-edit responsibility
  (`blocks/panel-widgets.tsx:172-221`). Geometry expansion is likewise two store
  updates: `App.tsx:2452-2454,2466-2468` versus `store.ts:115-139,318-325`.

Repair boundary: provide a generic atomic data/geometry edit contract and commit
the pair together. Preserve rejection of an invalid span without changing fades.
Keep the shared pure drag rule, not a second UI-only fade algorithm. Test the
public editing path, not only `dragFadeBoundary` in isolation.

The outward-expansion handlers already check `setSpan`'s boolean result before
editing a fade, and refresh handles from the store (`App.tsx:2310-2314`). Do not
report rejected expansion as changing fades: that earlier defect is guarded here.
The confirmed lost-pair bug is specifically the shared-boundary composition.

## R4 — Generic field declarations do not carry the data capability they require

Priority: medium (extension-contract weakness). Status: compile probe accepted by
`pnpm typecheck` despite the incompatible data shape.

- `block-definition.ts:50-58` permits `duration`/`fades` on arbitrary `T` without
  getters, editors, or a constraint relating `T` to DurationData/MediaData.
- `blocks/block-panel.tsx:85-88,144-147` erases `T` through `any` and passes that
  data to widgets requiring the corresponding shape (`panel-widgets.tsx:65-78,
  172-181`). A well-typed new definition can declare a duration widget on data
  lacking duration and render undefined/NaN values.
- The registry erases data and stage payload types at `builtin-blocks.ts:16-28`;
  `BlockDefinition`/`FieldProps`/`StageViewProps` default to `any`
  (`block-definition.ts:11,134,151`). `Placement.kind` and `data` are independent
  (`model.ts:37-40`); generic `editBlockData` is `(unknown)=>unknown`
  (`store.ts:63,410-415`).

Repair boundary: localize heterogeneous type erasure at registry packing and
retain typed capability operations there; make a declared field require its data
access/edit contract. Do not restore a closed per-kind union or shape sniffing.
Choosing the exact typed registry representation is an architectural decision;
this record does not authorize that change.

## Inspection coverage

Read fully: runner, numeric slot validator, session, store, registry contracts,
execution-definition, Stage/stage-state, rectangle/animation/dialogue/addition
modules, panel renderer/widgets, duration/media helpers, loops, timeline-layout,
slot-gaps, slot-wires, slot-value-rail. Read relevant lifecycle/output/gap tests
and registry tests. App inspected through run controls and the complete BlockView.
App rendering/slot interactions and all builtin execution modules have also been
read. The later dedicated test assessment read every current test body; its
locatable conclusions and limits are in `docs/test-review.md`. Focused probe
results and final checks are recorded below.

## R5 — Property-edit tests reimplement the behavior being tested

Priority: medium (regression assurance). Status: verified source evidence.

- `src/editor/store.test.ts:68-168` implements geometry edits, RGB validation,
  duration editing/conversion/sync, and addition input edits in test-only helpers.
  These helpers supply their own update functions to generic `editBlockData`.
- RGB edit assertions at `730-751`, addition input edits at `781-792`, and the
  rectangle-unit/slot-preservation case at `399-410` bypass production field/widget
  commands. They cannot protect those production operations from regressions.
- The duration setter is used as setup/edit input in genuine duplication tests
  (`841-853,889-904`), which still test real copying behavior. The duration-unit
  and sync helper declarations (`127-153`) are unused; no current store duration-
  unit/sync behavior suites were found. The earlier broader claim is narrowed here.
- Actual production geometry/color commits are in `blocks/rectangle.tsx:142-167`;
  duration/unit/sync edits live in `blocks/panel-widgets.tsx:80-98,113-122,153-164`.
  A regression there need not fail these store tests. Tests for creation,
  duplication, generic storage, bindings and span changes still exercise real
  store behavior; they should not all be dismissed.

Repair boundary: migrate behavior assertions to registered field APIs; extract
typed edit operations used by both widgets and their functional tests where the
widget currently owns the operation. Keep store tests about store contracts.
Remove the test-owned versions of production algorithms rather than maintaining
them in parallel. Do not introduce UI testing contrary to the verification rule.

## R6 — Phase expansion bypasses the pilot's container/loop restriction

Priority: medium. Status: reproduced through the public session constructor.

- `docs/loop-execution.md:29-32` rejects a block containing a loop during pilot
  playback. This restriction is independent of the block's kind or fades.
- `execution-definition.ts:30-59` expands a container into phase blocks. Session
  construction (`execution.ts:132-149`) passes only those blocks to the core;
  core `validateBlocksAgainstLoops` (`timeline-runner.ts:307` onward) therefore
  cannot validate the original container span.
- Concrete case: animation `[0,4)` with fade-in/out 1 compiles to `[0,1)`, `[1,3)`,
  `[3,4)`. A loop `[1,3)` is contained by the original animation, but no individual
  phase contains/cuts the loop. Adding fades can turn a rejected container into
  an accepted one without changing its span.
- `execution.ts:280-294` creates the instance only at container start. Repeating
  the middle phase would reuse that outside container instance, precisely the
  timing model the pilot has not defined.

Repair boundary: validate the authored execution container span before lowering
to phases, sharing the span relation rule rather than a per-media condition.
Keep authoring support for containing blocks; only pilot run rejection is at issue.
Cover the same containing span with and without phase boundaries.

## Structural observations not promoted to defects

- `execution.ts:40-63` and `115-149` both assemble timeline/loop definitions; the
  constructor additionally needs editor loop identities. Consolidation is a
  bounded opportunity, but the exported helper must test the same compiler used
  by the actual session. This is lower priority than the lifecycle mismatches.
- Fade commands are duplicated by panel and timeline paths (R3); test-owned
  property edits are a further parallel model (R5). These are actionable shared
  responsibilities, not a general request to split App.tsx by size alone.
- `AnimationPresentation.setPlayback` (`blocks/animation.tsx:59-64`) silently
  ignores an uninitialized payload although `MediaExecution` initializes it in
  construction before playback (`block-runtime.ts:96-109`). Model that lifecycle
  explicitly when repairing runtime contracts; do not accumulate more fallbacks.
- Stage rendering still uses execution-written entries, not runner-derived
  effects. Timer-only sound and fixed three-iteration loops are acknowledged
  scaffolding, not bugs.

## R7 — Media visuals use a second, proportional timeline geometry

Priority: medium for authoring accuracy. Status: source evidence; no browser test.

- `blocks/media-block.tsx:30-44,60-68` positions phase boundaries and fade surfaces
  as `offset / length * blockWidth`. It receives only the total pixel width.
- The actual timeline (`timeline-layout.ts:169-182`, `App.tsx:2506-2512`) includes
  cell widths, intervening context-dependent gap runs, and loop-edge anchors.
  Pixels are not uniformly proportional to logical time. A contained loop can
  widen an internal boundary without altering either phase length.
- Generic phase dragging snaps through `cellDelta` (`App.tsx:2408-2427`), so the
  rendered phase line and the coordinate model used to drag it are different
  abstractions. A scalar width cannot recover the missing intermediate geometry.

Repair boundary: pass layout-resolved phase/region positions through a generic
timeline-render contract, instead of teaching individual media kinds about loop
gap arithmetic. Preserve the dot alpha-mask appearance and logical phase lengths.
The exact edge anchor within a multi-gap boundary should be specified as part of
that contract; this review does not invent a new gap-side semantic.

## Lower-priority UI observations

- Track renaming begun before Run remains an enabled form during playback:
  `TrackLabel` (`App.tsx:1761-1817`) does not close on `editable=false` or disable
  the input/save, unlike `SlotLabel` (`1854-1858`). `commitName` still changes the
  document. Repair by making the edit-lock transition own open editors, not by
  scattering run checks into store commands. Source finding; not browser-tested.
- Loop end dragging uses `cellAtX` (`App.tsx:811-816`), which clamps every trailing
  gap to the last cell index (`timeline-layout.ts:121-137`). It cannot select the
  final rendered boundary `columnCount` even though the handle's bound allows it.
  A boundary-hit query should serve boundary gestures; retain `cellAtX` semantics
  for cell creation/movement. Source finding; not browser-tested.

## Reproduction results and regression recipes

Six temporary diagnostic witnesses were run with
`pnpm vitest run src/editor/code-review.probe.test.ts`: **6 passed**. These assert
the observed defective behavior, not the desired repaired behavior. The probes
also passed `pnpm typecheck`; they are removed after recording these recipes, not
added as permanent tests that would preserve bugs.

These are not six examples of the TDD guide's functional-test standard. R1/R6 use
the session boundary (R1 injects factory/start failures), R2 instruments a Promise
continuation, R3 composes lower-level production commands rather than invoking the
gesture, and R4 is compile-time evidence. They support bounded findings; permanent
regressions must exercise the appropriate production API and desired contract.

| Finding | Setup / action | Observed | Regression requirement |
| --- | --- | --- | --- |
| R1 factory | Spy on registered wait `createExecution` to throw `Error("factory failed")`; start a one-block session | `start()` throws a second `TypeError`; snapshot phase is failed | Factory failure must become managed failure without dereferencing an unallocated execution |
| R1 peer | Two waits start at 0 on separate tracks; first instance's `startPhase` throws | Only first factory runs; cleanup of second peer throws `TypeError` | Termination contract must account for same-time peers whose callbacks never ran |
| R2 dispose | Start real instant addition; dispose synchronously before its completion microtask | Core's Promise continuation rejects `TypeError`; snapshot is still running with the block completed | Disposed session cannot advance, invoke lifecycle callbacks, or start more blocks from old settlements |
| R3 pair | Length 4, fades 2/2; `dragFadeBoundary("shared",3,4,2,2)` then both real fade setters | Intended pair is 3/1; committed pair is 2/1 | One atomic edit must commit 3/1, with no intermediate clamping |
| R4 typing | Declare duration and fades fields as `PanelField<{text:string}>[]` | Both compile without data access/edit capabilities | Unsupported data/field combinations must be rejected by the type contract |
| R6 span | Animation start 0 length 4, loop [1,3); compare fades 0/0 with 1/1 | Constructor rejects first, accepts second | The pilot containing-loop rule must be independent of phase subdivision |

For the R2 probe, observe the **returned continuation** of the actual execution
Promise's `then`, not only the execution Promise itself: the latter resolves
successfully. Wrap that instance's `then` to call the original unchanged and save
the returned Promise. Immediately after `session.start(); session.dispose();`,
attach an expectation to the saved continuation before flushing microtasks.
This catches the cleanup exception without an unhandled-rejection artifact or
changing runner/session logic. The real addition factory and phase method run;
only the continuation is observed.

For R3, construct `mediaFadeHandles(block, change => data = change(data))` and call
`setFadeIn(3); setFadeOut(1)` on the same handles, as App does. The test observes
production commands, not a copied clamp implementation.

## Repair grouping and authorization boundary

1. **Lifecycle ownership (R1/R2):** align constructed/starting/active/finalized
   executions and cancellation/settlement invalidation together. An optional-map
   lookup fix and a separate session-only disposed guard would hide incompatible
   lifecycle models instead of resolving them.
2. **Typed edits and field capabilities (R3/R4/R5):** retain module-local data,
   open registry extension and derived panels; express capability operations and
   atomic multi-field edits without global `any` or copied test implementations.
3. **One lowering/validation path (R6):** validate authored container spans before
   phase lowering; use that same path for public definition assembly and sessions.
4. **One timeline coordinate model (R7):** resolve visual positions through the
   layout contract, with explicit phase edge anchors rather than pixel ratios.

No repair has been implemented. The exact cancellation API and heterogeneous
typed-field packaging are not selected by this review. Those are the consequential
design points to settle before a broad refactor; local regression contracts above
are already established. Review findings do not authorize new features, a closed
kind union, runtime shape probing, or changes to accepted pilot semantics.

## Maintainability: concept-to-code mapping

The User clarified that the concern is maintainability through contract/concept
mapping, not source length or merely the presence of defects. The following are
structural judgments grounded in the current ownership and change paths. They do
not authorize a replacement architecture or extend the implemented language.

### M1 — A block input is represented as panel metadata plus hand-written runtime reading

The language has block inputs/outputs (`design.md:74-99`). In code,
`PanelField` is the declaration vocabulary, and `deriveSlotProperties`
(`block-definition.ts:120-132`) extracts semantic ports from number/output UI
fields. But the input declaration's literal accessor is not used to resolve the
runtime input. Addition separately repeats the association between port `a` and
`data.inputA`, then decides slot-versus-literal (`blocks/addition.tsx:20-24,41-65`).
Rectangle repeats the same resolution for four ports (`rectangle.tsx:49-60,175-227`).

Changing an input therefore requires keeping its declaration, binding key, literal
accessor, and execution read aligned by convention. Output field keys and resolved
output object keys likewise agree by convention, not through a connected contract.
The mapping is local to each module, which is an improvement, but one semantic
input still has multiple independently maintained representations.

Direction: a block's input/output definition should be the authority from which
panel interactions and runtime binding follow. Preserve the User's derived-panel
decision; do not create a second, parallel port table. This finding does not
require implementing unimplemented ownership/types/calculation features.

### M2 — Multi-phase structure is not a cohesive authoring/runtime concept

`ExecutionStructure` explicitly distinguishes single from multi-phase
(`execution-definition.ts:15-22`), which is a good separation from media kinds.
However, `BlockDefinition` independently declares `phases`, `phaseBoundaries`,
`fadeHandles`, and `renderBlock` (`block-definition.ts:161-169`). Animation connects
these by convention (`blocks/animation.tsx:148-158`). The session separately infers
container start/finalization from endpoint equality (`execution.ts:277-310`).

Consequently a phase-structure change must stay synchronized across lowering,
editing, drawing, and lifetime rules. The design's per-phase cooperative skip
(`design.md:130`) has no per-phase home in the authored phase data: one placement
flag is copied to every lowered phase (`execution-definition.ts:54-59`). This is
an acknowledged pilot limitation, but also an identifiable structural obstacle
to extending that concept. It is not permission to implement the feature now.

Direction: make the relationship between container, phases, their editable
boundaries, and their execution lifetime explicit. Keep media behavior separate
from multi-phase structure; do not make every phase a media fade.

### M3 — The generic block interaction host still owns media-specific editing semantics

`App.tsx:2313-2468` knows fade-in/out/shared boundary meanings, computes inward and
outward fade geometry, and coordinates span changes with fade commands. It has no
block-kind branch, but it still contains a particular block family's semantics.
The extension contract exposes fade-specific setters rather than delegating the
whole edit. `fadeHandles` presence even supplies the `is-media` class (`2515`).

Adding a different multi-phase editing scheme cannot be expressed through
`phases` alone; the host interaction model must change. Thus removing kind checks
has not fully achieved semantic localization. Generic pointer capture, hit testing
and selection belong in the host; the meaning of a block-specific edit should have
one owner outside it. The shared-boundary defect R3 is evidence of that split, not
the definition of the maintainability problem.

### M4 — Some widgets render domain operations; others define them

Number/color fields delegate edits to definition-owned `commit` operations
(`block-definition.ts:31-48`). Duration/fades fields are only tags (`50-58`);
`panel-widgets.tsx:80-98,113-122,153-164,194-217` owns their conversion, sync and
clamping operations. Store length changes separately invoke the corresponding
data helpers (`store.ts:115-137`, `blocks/media-data.ts:109-115`).

This is an inconsistent responsibility rule: some properties are defined by
modules and rendered by widgets, whereas other properties are partly defined by
their widgets. A non-panel editing path needs to reconstruct those operations;
the copied test algorithms in R5 demonstrate the cost. Direction: domain edits
should be reusable operations, and widgets should project/invoke them. This does
not imply a universal command framework or additional abstraction for every field.

### M5 — Semantic gap identity is shared, but traversal policy remains an adapter reconstruction

The loop forest and `boundaryGapPaths` are established semantic structure. Layout
projects its paths into pixels (`timeline-layout.ts:39-83`), which maps the concept
well. Execution also uses those paths, but reconstructs visit order from separate
runner time/repeat callbacks, context slicing, and `skipInitializationTime`
(`execution.ts:215-253`). The runner itself traverses loops rather than gaps.

This is not a newly established correctness defect. The maintainability issue is
that changing a control-flow transition requires coordinating the runner's event
ordering with the session's reconstruction of which semantic positions were
visited. A shared definition of semantic visits would give that contract a clear
home; its exact representation is not selected by this review. Do not re-derive or
change the settled gap sequence/frequency rules.

### Mappings to preserve

- The loop forest represents nested regions directly, rather than unrelated
  marker pairs. Do not replace it with flat intervals.
- Placement, compiled structure, and per-traversal execution instance are distinct
  concepts. Preserve those distinctions while making their relationships explicit.
- Execution writes presentation entries and owns their removal; Stage renders
  those entries. This correctly separates effects from debugger snapshots.
- Block modules localize kind-specific data and behavior. The registry is useful;
  its incomplete contracts do not justify returning to central kind branches.
- Layout is the authority for timeline pixels. Media's proportional reconstruction
  (R7) should join that model rather than establish another coordinate system.

These judgments prioritize semantic ownership and predictable change paths. Moving
functions to smaller files without changing those relationships would not address
them. Cancellation, typed packaging, and phase/gap contracts still need a bounded
design proposal before implementation.

## Final baseline verification

After removing all temporary probes:

- `pnpm typecheck`: passed.
- `pnpm test`: 419 tests passed across 16 files.
- `pnpm build`: passed.
- `git diff --check`: passed.
- `git status --short`: review artifacts are `docs/code-review-plan.md`,
  `docs/code-review.md`, `docs/test-review.md` and the modified consultation ledger
  `docs/consultations.md`. `.opencode/` remains unrelated and untracked. No source
  or permanent test files changed.

Passing baseline tests do not negate the reproduced failures or the gaps in test
coverage described above. No browser/UI verification was performed; ESLint is not
configured. No repair or commit was made.

## Follow-up test scope

After the baseline review, the User clarified that exact runner state update
notification counts and invocation sequences are volatile. Only the existing
notification test is adjusted to check ordered barrier progress and updates at
separate completion timings. See `docs/test-review.md` T2. No runtime repair or
other permanent test change is included.
