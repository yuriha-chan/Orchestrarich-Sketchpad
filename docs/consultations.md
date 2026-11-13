# Consultation Ledger

## Repair schedule and block/input boundaries

- Affected work: the approved plan for bugs, M1-M5, test corrections, block
  relocation/isolation and unit-bearing inputs.
- Proposed sequence: `docs/refactoring-schedule.md`. Full independent checkpoint
  package: `docs/consultation-refactoring-schedule.md`.
- Established direction: block definitions are not editor-owned; panels derive
  from semantic input specifications; stored units affect runtime behavior.
- Design checkpoints: lifecycle cancellation and typed input/registry operations.
  Lead owns internal mechanisms and type representation; these do not inherently
  require the User to select an implementation. Public stop-state changes, if
  needed, require a concrete behavioral question. Unsettled visible phase anchors
  block only the affected R7 work. Existing order/notification decisions are closed.
- The User approved execution, added M5, authorized phase-completion commits and
  continuation, and requested extensive Senior Programmer delegation. Later
  questions do not block unrelated
  established increments. No new unit-policy decision is needed to preserve the
  current behavior and grouping.
- Status: Counsel checkpoint completed. The schedule separates behavioral decision
  gates from Lead-owned design checkpoints and records requirement provenance.
  Phase A's lifecycle contract and closure checkpoint are recorded in
  `docs/phase-a-lifecycle.md`. Counsel identified no necessary User question at
  closure; the implementation preserves historical snapshots on resource disposal
  and does not claim rollback of arbitrary throwing-factory effects. Type/input
  and phase remedies remain for their scheduled increments.

## Test review: lifecycle and observable ordering

- Affected work: lifecycle review and the runner state update notification test.
  The User authorized adjusting that test; runtime repairs remain outside scope.
- User guidance: "some tests are indeed implicit contract, other test are
  implementation coincidence, or in gray area. Some case may require my
  judgement." Preserve that distinction rather than weakening all exact tests.
- Decision 1: `timeline-runner.test.ts:1369-1399` requires termination of a
  same-time peer whose start callback never ran. User: "in that case B's
  termination should not be called, but generally the spec does not specify the
  order of exection. so \"A starting fails -> B does not terminate\" test is wrong
  technically". An unstarted peer must not receive termination; a test must not
  assume A starts before B to assert that outcome. Observe whether execution
  actually began rather than prescribe an unspecified cross-block order.
  Core/session incompatibility remains R1 in code-review.md; no repair authorized.
- Decision 2: use the comprehensible term "runner state update notification",
  not "snapshot notification". User: "exact number and sequence of invocations
  is indeed volatile. so check for at least on invocation for barrier logic time
  in order, early-finishing block and blocking block updates at different timings
  etc." The existing test now requires an update at each observed barrier logical
  time, separately timed completion/blocking updates, and ordered logical-time
  progress, without an exact callback count. General cross-block execution order
  is unspecified; time-start before reads and termination before next starts
  remain established, distinct partial-order constraints. Runner code unchanged.
- Evidence and narrower test classifications: `docs/test-review.md`, T2/T3.
  Both questions have User answers; the lifecycle test and runtime are unchanged.

## Phase structure and execution identity

- Governing User corrections: "Animation should not be stopped for the phase boundary";
  "isMedia and isMutliPhase is different thing, while *currently* only media blocks are multi phase blocks."
  "placement is not an execution instance (think about looping)".
- Affected work: playback continuity, structural expansion, and stage-effect lifetime.
- Independent checkpoint: Counsel examined the proposed separation of media kind,
  multi-phase structure, and runtime execution identity against design.md §§2.9
  and 4.2. No additional User decision was identified for this bounded correction.
- Playback correction: the User subsequently stated "Sorry media should wait at phase boundaries."
  Media holds at a completed phase boundary and resumes when the next phase starts.
  Container finalization still ends the effect. Distinct execution identities do not implement loop scheduling
  or decide interruption semantics.
- Status: unblocked; implementation follows the explicit corrections.

## Blocks own presentation state

- Governing User correction: "Wrong modeling: the interface inspects the runner state. render components according to the states"
  "Correct modeling: the block itself modifies the UI state. renderer shows components according to the UI states."
- Affected work: the stage previously inferred effects from active runtime
  instances and runner snapshots. Execution identity alone did not establish the
  required ownership boundary.
- Plan: block execution writes typed presentation entries through injected UI
  commands; block/container termination removes them. The renderer receives only
  UI data and callbacks. Runner snapshots remain editor-debugger input only.
- Independent checkpoint: no additional User decision was identified within this
  bounded correction. Zustand and the per-App store are implementation choices,
  not separately established User requirements.
- Status: unblocked; the stage no longer derives presentation from runner state.

## Media execution subtype

- Governing User correction: "media handling (intialize/fade/terminate) should not be hardcoded on branches. it should be sub type of execution."
- Affected work: replace session-owned kind branches with execution lifecycle
  polymorphism. The factory selects dialogue, timed, or media execution. Media
  execution owns presentation initialization, phase playback/hold, and termination;
  the session only schedules lifecycle calls.
- Independent checkpoint: no additional User decision was identified. Factory
  dispatch selects a subtype rather than performing effects. Sound stays timer-only
  without an output adapter; this does not introduce an audio feature.
- Status: unblocked. Phase waits and block-owned UI state remain governing contracts.

## Initial slot scope

- User request: "commit; let's add slots; read TDD skill; adhere to Lead document".
- `design.md` §§2.2–2.6 describes typed track and shared slots and their execution
  semantics; `steps.md` proposes visual slot and wire representation without types
  before introducing types and ownership verification.
- The requested increment's intended user-visible scope is not specified: visual
  editing versus engine-backed storage and block reads and writes. Counsel identified
  this as a scope question rather than a contradiction between the documents.
- User answer: "support both; I am thinking of number fields in block property be
  assignable to slot instead of immediate value". This establishes visual and
  engine-backed scope and identifies numeric property inputs as a use case.
- User direction: "let's slot clickable and be able to input number and initialize
  the slot that timing (slot should be appended at the bottom of track/timeline
  as a new row)". Initialization is therefore authored on the timeline rather
  than only as an untimed initial value.
- User decisions: "1: use a rectangle's X, Y, W, H for now\n2: yes". The
  second answer confirms that a block starting at the same logical time as a slot
  initialization reads the newly initialized value.
- Independent checkpoint: `design.md` §4.4 requires discarding before overwriting;
  it does not settle whether discard and reuse belong in this increment. An empty
  slot read's handling is also unspecified by the examined execution rules.
- User decisions: "1. editor rejects empty slot reading and runner refuses to
  start timeline\n2. start with one initialization". Slot reads must be checked
  before playback; discard and reinitialization are deferred.
- Status: initial scope unblocked. Track and shared slot rows follow `design.md`
  §§2.2–2.3; initialization times are existing logical-time boundaries.

## Slot-bound rectangle units

- Affected work: rectangle properties can now reference a numeric slot, while the
  rectangle's existing span/pixel toggle converts its immediate geometry.
- The same slot can supply several properties or blocks. Converting the slot's
  stored value when one rectangle changes units would also alter those other reads;
  retaining the number instead changes the rectangle's rendered size or position.
- User correction: "slot is a expression, evaluated to literal number, and it is
  used as a input of the property of the block. internally converting the value
  to XXX is irrelevant". Slot values are numbers supplied to the property; the
  property's unit interprets the input. A rectangle's unit change does not mutate
  a slot or establish a slot-specific unit contract.
- Status: resolved; the earlier framing incorrectly attributed property-unit
  semantics to slots.

## Loop markers and playback scope

- User request (verbatim): "add loop start and loop end".
- `design.md` §3.1: loop start and end markers are placed at unit cell boundaries
  and span the entire timeline; the end marker can specify a termination condition,
  and markers can instruct redoing the loop or exiting it. §3.5: a block must include
  the entire loop section or none of it. `steps.md` Round 3+: "First, put only loops
  on barrier synchronization."
- The request does not state whether this increment includes playback repetition or
  only marker authoring, nor what ends a loop when no condition is specified. A loop
  with no termination would never finish, which conflicts with one-shot runs.
- Questions sent to the User: (1) markers only or playback repetition now; (2) if
  playback, the termination for this increment (condition now, repeat count, or
  infinite until Reset).
- User answer: "only authoring markers." Playback repetition is excluded from
  this increment.
- Status: resolved. Markers are timeline-level document data with editor UI and
  design.md 3.5 placement validation; loop conditions, redo/exit markers, and
  playback remain for a later increment.
- Follow-up request (verbatim): "we need more than one loop" and "I see this
  system as a visual programming language, so I took for granted that we have
  multiple and nested loops. so please think of AST".
- The flat single-region model was replaced by a forest of properly nested loop
  nodes. Creating a loop around a block uses the minimum span that does not cut
  another block; an empty cell creates a one-cell loop. The user chose the
  context-menu authoring path ("right-click -> context menu -> Loop") and asked
  for a lane per nesting depth; the implementation renders nested brackets with
  outer loops taller and bottom-aligned. The gap between the marker and the
  loop fill (half a cell gap, handles outside the fill) was a Lead proposal, not
  a separate User decision.
- Status: resolved for authoring. Playback, conditions, and redo/exit remain
  later increments.

## Semantic gaps and recursive gap/cell derivation

- Consultation package for manual Counsel review:
  `docs/consultation-semantic-gaps.md`. This entry is the ledger pointer only.
- Affected work: the timeline layout model (`src/editor/timeline-layout.ts`,
  committed as 8dc624a), the identity and placement of slot initializations, and
  whether loop playback enters this increment. Loop-gap work is stopped.
- User message (verbatim): "two things to clarify: gaps are not only a visual
  component. gap is a place where value initialization take place. so initialize
  in the gap before loop edge: variable initialized only once. initialize in the
  gap after loop edge: variable initialized at every iteration. so don't think
  there are three kinds of gaps (before, base, after) to render. the structure
  automatically derives gap and cell sequence by recursive rules, and the
  component reflect that structure. there may be 4 or more contiguous gap run if
  nested loop starts at the same position. the derived model is used in the
  execution too." The message was accompanied by a nested-loop diagram showing a
  gap on each side of every loop bracket, with the innermost level containing
  `gap | cell | gap | cell | gap`.
- Earlier layout request (verbatim): "In current UI model, gaps are part of cell.
  We are going to create contiguous gaps since there will be outer-loop gap and
  inner-loop gap. So at first we change the UI model. cells and gaps are UI
  objects, like: [gap, cell, gap, cell, gap, gap, cell, gap, cell, gap, gap, gap,
  cell, gap, cell, gap, gap]".
- Established facts: loops are an authored laminar forest (`src/editor/loops.ts`)
  with authoring only ("only authoring markers"); the runner executes a single
  pass; slot initializations are keyed by logical time only (latest at or before
  a read), rendered as pills in the single 32px base gap at each boundary, and
  applied through the runner's `onTimeStart(time)` hook.
- Lead reading of the new message: start from a spine `gap, cell, gap, ..., gap`.
  Every loop start edge splits the gap at its time into an outside gap (runs
  once) and an inside gap (runs every iteration), with the marker between them;
  every end edge splits it into an inside and an outside gap. Nested loops split
  the same inside gap again, so `k` edges at one boundary produce `k+1`
  contiguous gaps (e.g. four gaps for three nested starts at the same position).
  Ordering at a boundary: ending edges innermost-to-outermost, then starting
  edges outermost-to-innermost. Each gap therefore carries the loop path that
  determines repetition, and the derived sequence drives both rendering and
  execution. The earlier before/base/after classification is discarded.
- Questions requiring the User's judgment:
  1. Does this increment include loop playback/repetition (so "initialized at
     every iteration" is observable), or only the recursive structure and
     gap-attached initialization with runs still single-pass?
  2. Must a slot initialization now be identified by its gap (for example slot,
     boundary time, gap index), so two initializations at the same logical time
     can sit on opposite sides of a loop edge and the editor can choose among the
     gaps? Today it is keyed by time alone and always occupies the single gap.
  3. Should every derived gap keep the current 32px width, so the grid widens by
     32px for each extra gap at a boundary, or should gaps share the existing
     boundary space?
- Status: blocked pending the User's manual counsel answer. No code changed
  since commit 8dc624a.
