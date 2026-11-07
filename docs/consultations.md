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
