# Consultation Ledger

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
