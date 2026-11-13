# Repair and refactoring schedule

## Status and scope

Approved by the User against commit `d5c5315`, with M5 added by subsequent
instruction. Execute bounded increments, commit after each completed phase, and
continue to the next phase without further permission. Use Senior Programmer
extensively for bounded tasks; Lead retains architecture and semantic review.
Consult Counsel when phase closure is uncertain. Review evidence and exact repair
locations remain in `code-review.md` and `test-review.md`.

The requested scope comprises recorded bugs, M1-M4, remaining test corrections,
block-module relocation/isolation, unit-bearing input contracts, and M5 semantic
gap traversal ownership.

## Requirements and preservation boundaries

- A block module plus registration must suffice; generic consumers have no
  block-kind branches. Panels derive from block specifications.
- Units are stored input semantics, not widget-local display state. Beats follow
  BPM, seconds are absolute; spans follow stage scale, pixels are absolute.
- A slot expression supplies an input value. Unit edits do not mutate slots.
- Keep existing rectangle unit grouping and conversion behavior unless the User
  authorizes a change; moving unit ownership does not itself authorize separate
  units for X/Y/W/H or a new slot-bound conversion policy.
- Completion is Promise settlement; outputs are assigned at end termination.
  Execution owns stage effects; media holds at phase boundaries and survives
  until whole-container finalization.
- Unstarted executions receive no termination. Same-time execution order is not
  prescribed. Runner state update notification counts/sequences are volatile.
- Preserve loop/gap semantics, three-iteration pilot playback and the pilot's
  rejection of containing blocks. Authoring still allows containing blocks.
- Safety comes from explicit contracts/types, not impossible-state fallbacks.

### Authority and scope

- The module-plus-registration goal is quoted in `code-review.md:39-41`; its
  scope matches the extension contract preserved here. The User's current unit
  and relocation discussion accepts the direction, not an exact typed API.
- Promise-only completion is the User's instruction quoted at
  `code-review.md:32-35`. Output assignment at block end is required by
  `design.md:95-99` and described for the current addition in `slots.md:65-72`.
- Media removal at whole-container termination is `design.md:173-178`.
  `consultations.md`, "Phase structure and execution identity", records the
  later correction "Sorry media should wait at phase boundaries." These cover
  lifetime and phase holding, not a choice of rendering framework.
- `loop-execution.md:5-15` quotes the User's three-iteration authorization. Its
  containing-block rejection is a documented pilot restriction (`29-32`), not a
  permanent language requirement; preserve rather than silently expand it.
- Stored units, rectangle unit grouping and current conversion behavior are
  preservation baselines. The input refactor must not silently broaden unit
  capabilities or change those behaviors under the heading of reorganization.

## Order and bounded increments

Phase A is complete: see `phase-a-lifecycle.md` for the contract, regression
coverage, consultation outcome and verification. Phase B is complete: see
`phase-b-repairs.md` and `Implementation_Notes.B4.md`. Phase C is next.

### A. Execution lifecycle correctness — R1/R2, T1/T3

First agree a small lifecycle contract covering allocation, startup, managed
failure, phase completion, container finalization and disposal. Then repair the
runner/session mismatch together. A disposed session cannot pump, start blocks,
write outputs or invoke released lifecycle callbacks through queued settlements.

Permanent regression tests precede implementation: factory throw, phase-start
throw, cleanup related to actual starts rather than track order, resolved-but-
queued completion after disposal, independently pending late callbacks, and
cleanup of a still-live container during failure. Keep fresh execution identity
and generation isolation across loop iterations.

Design checkpoint: document the lifecycle before implementation. Lead chooses
the internal cancellation mechanism under the established no-post-disposal-work
requirement. If a public terminal state or observable stop behavior must change,
ask the User about that concrete change; do not silently treat disposal as
ordinary completion or failure. Exact API spelling alone is not a User decision.
Do not reopen the unstarted-block or same-time-order decisions.

### B. Bounded correctness repairs and baseline witnesses

Separate independently reviewable increments:

1. **R3:** make fade-pair edits atomic, using one production operation. Cover the
   2/2 -> 3/1 shared-boundary case and rejected geometry+data transactions through
   public commands. This is a lasting atomic-edit contract, not a temporary guard.
2. **R6:** validate original container spans before phase lowering; consolidate
   definition assembly so public compiler tests exercise the session's compiler.
   Compare the same containing span with/without fades; keep authoring unchanged.
3. Fix the open track-rename form's run-lock transition and loop-end targeting of
   the final rendered boundary. Give boundary gestures a boundary query; retain
   existing cell-query behavior. The User verifies UI interaction.
4. Add the missing session witnesses for output availability before/end of span,
   output-versus-initialization boundary order, and gap re-entry with an intervening
   write, including nested/touching contexts. These protect semantics before the
   input/phase refactor; they do not redesign loop traversal.

### C. Connected input definitions and domain edits — M1/M4, R4/R5, units

Design one typed input/output definition from which binding, literal access,
runtime input resolution and panel generation follow. Localize heterogeneous
registry type erasure instead of spreading `any`; retain an open registry.

Implement vertical slices, not an all-block rewrite in one step:

1. Prove the typed definition/production-edit path with addition and a fresh test
   definition. Include type-negative cases for unsupported field/data contracts.
2. Move reusable value/unit operations out of widgets. Add time-input behavior
   (beats/seconds, injected BPM, span synchronization as a value relationship).
3. Add spatial-input behavior (spans/pixels, injected stage scale). Preserve
   resize-responsive spans and existing stored-unit semantics. Inject context
   rather than importing the concrete editor store from block definitions.
4. Migrate remaining builtins and remove superseded declarations/operations.
   No parallel port tables, per-kind store APIs or internal shape sniffing.

Replace R5's copied RGB/addition/rectangle-unit edit algorithms with tests that
invoke actual registered operations. Preserve genuine creation/duplication/store
tests. Remove unused copied unit/sync helpers. Add non-120-BPM and synchronized
duration session tests while migrating time inputs.

Design checkpoint: write the compact typed input/edit contract, including its
context and registry boundary, before the first vertical slice. The slice then
validates that design through actual consumers before further migration. Lead
owns the TypeScript representation; the User need not select type machinery.
Ask only if a concrete behavioral conflict or extension-scope change emerges.
No new unit-policy question is needed merely to preserve existing behavior.

### D. Phase structure, interaction ownership and layout — M2/M3, R7

Connect authored phases, compiled execution structure, boundary handles and
container lifetime explicitly. Phase structure remains independent of media.
Use the lifecycle contract from A rather than introduce another lifetime model.

The generic pointer host owns capture/hit testing/selection; block-defined
operations own the semantic edit. Use B's atomic transaction contract for edits
that change fades and geometry together. Remove host-owned fade meaning, not
just the functions' current file locations.

Resolve phase lines and fade regions through timeline layout, not proportional
fractions of a block's total width. Keep dot alpha masks and existing gestures.
Test fresh non-media multi-phase execution, shared-boundary production edits,
container lifetime, and layout with widened gap runs.

Behavioral decision gate for R7 only: establish whether an existing visual-anchor
convention covers phase boundaries within multi-gap runs. If not, show the User
the placement/gesture alternatives at a concrete boundary before changing those
visuals. This does not block independent phase-ownership work, and it must not
reopen settled gap execution semantics. Per-phase cooperative-skip authoring
remains deferred; a suitable phase representation is not permission to add it.

### E. Semantic gap traversal ownership — M5

Give semantic gap visits one framework-independent owner, shared by execution
and the structure projected by layout. Replace the session's reconstruction from
separate time/repeat callbacks, context slicing, and skipped initialization times
with consumption of explicit semantic visits. Select the precise representation
after inspecting the lifecycle and phase contracts established in A-D; do not
introduce a second traversal model beside the existing one.

Preserve the settled boundary/path identity, close-then-open gap order, nested
and touching loop behavior, initialization frequency relative to enclosing
contexts, and output-before-boundary-initialization ordering. This is a
responsibility refactor, not a change to the loop language or pilot restrictions.

Use B's baseline witnesses and add functional traversal/session composition tests
for normal advancement, repeated entry, nested/shared boundaries, and empty
regions. Verify layout still projects the same semantic paths without moving
pixel geometry into execution. Remove the superseded adapter reconstruction.

Complete this before physical relocation so the semantic traversal contract has
an established owner when dependencies are isolated.

### F. Block relocation and dependency isolation

After responsibilities stabilize, make relocation its own reviewable increment:

- `src/core/`: framework-independent document/block/runtime and presentation-target
  contracts; no React, Lucide, concrete editor store or DOM dependencies.
- `src/blocks/`: self-contained builtins, shared block behavior, rendering
  contributions and `builtin-blocks.ts` registration.
- `src/editor/`: generic generated panels, workspace/timeline interaction and
  concrete rendering/state adapters.

Do not split each block into separately registered runtime/panel/render tables.
Module-plus-registration extensibility must remain sufficient. Isolate concrete
rendering dependencies so pure runtime use does not require the editor. The
specific packaging is part of the proposal in C, not a second registry design.

Verify a runtime-only import/typecheck path plus a fresh-definition functional
extension case. Do not claim framework isolation merely from a folder name.
Keep file movement separate from behavior changes wherever possible.

### G. Remaining test corrections and completion check

Most test work belongs in A-F. Finish the independent remainder against the
locatable checklist in `test-review.md`: misleading test names, unsupported
conversion fixtures, actual empty/interleaved field sections, incidental hook-
absence assertions, orphan-pruning composition/purity, final-track removal,
nonfinite initialization and fractional placement command cases, and rail-anchor
composition where that production responsibility is extracted.

Remove unspecified cross-track order requirements while preserving required
partial orders. Retain exact AST/path/layout/lane assertions with real contracts.
Do not replace test quality assessment with counts or indiscriminately weaken
assertions. Do not leave replaced APIs/helpers beside their replacements.

## Execution and review cadence

- Schedule approval covers scope, order and bounded work under established
  behavior. It does not approve unselected public cancellation behavior or phase
  anchors in advance. Design checkpoints make Lead's choices inspectable; only
  consequential unsettled behavior/constraints require the User's decision.
- Execute one bounded increment at a time; maintain an executable task ledger for
  the active increment rather than mark entire architectural phases in progress.
- For bugs, observe a functional regression fail before implementation. Refactor
  valid passing tests without pretending their unchanged behavior requires RED.
  Add type-negative tests at the selected typed extension boundary.
- After each increment, Lead semantically reviews contract-to-code ownership and
  runs focused tests, `pnpm typecheck`, `pnpm test`, `pnpm build` and
  `git diff --check`. ESLint is not configured. The User runs UI checks.
- Report what changed, remaining decisions and verification. Commit after each
  completed phase as requested, then continue without further permission.
- Lead owns architectural judgment and critical repairs already investigated.
  Use Senior Programmer extensively for bounded implementation and test tasks
  under explicit contracts; retain Lead review and critical investigated fixes.
  Do not delegate the review again.
- Revisit consultation at the lifecycle, typed-input and phase-layout contract
  milestones, or on a material deviation. Do not batch unrelated open decisions
  into a speculative up-front design exercise. Consult Counsel if phase closure
  is uncertain.
