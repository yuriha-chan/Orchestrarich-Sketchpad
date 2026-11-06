# Experiment 1-B Integration: Driving the Execution Engine from the Grid

## Question

Can the 1-A execution engine drive the 1-B grid so that logical time, blocking blocks, skip, and cooperative skip are observable in the UI without duplicating the execution model in the UI?

## Smallest Components

- `experiments/1b/src/execution.ts` wraps `TimelineRunner` in a `TimelineSession`.
  The session builds a `TimelineDefinition` from the placements, supplies each
  block's execution Promise and skip handler, and reports snapshots and activity
  messages to the UI.
- The UI renders engine snapshots and sends commands (`start`, `requestSkip`,
  `advanceDialogue`) to the session. It does not advance logical time itself.
- Per-kind execution, for observation only:
  - Dialogue shows a dialog with the text "lazy dog jumps ..." and an OK button
    in the stage below the timeline. Pressing OK completes the block.
  - Camera, sound, and animation run for 500, 350, and 700 ms per unit cell.
  - A running animation shows a progress bar in the stage, filling over its
    natural duration.
  - A skip request shortens a timed block to a 150 ms fade before completion.
  - Dialogue blocks have no skip handler and therefore ignore skip requests.
- Cooperative skip is a placement property, toggled in the status bar; the
  engine decides when to fire the automatic skip event.
- A run uses the placements as they were when Run was pressed. Editing is
  locked while a run exists; Reset returns to editing.
- The core engine is unchanged.

## Criterion

- Logical time stays at t while any block ending at t+1 is running, and the
  status bar lists those blocking blocks.
- A user skip shortens timed blocks, and the barrier still waits for a dialogue
  block that ignores the request.
- A cooperative block auto-skips when every not-completed block with
  `end <= block.end` is cooperative.
- Run, Skip, and Reset work together without duplicating the barrier in the UI.

## What Was Confirmed

- `pnpm typecheck`: core and 1-B UI both pass.
- `pnpm test`: 59 tests pass (45 core + 9 placement model + 5 integration).
- `pnpm build:1b`: production build succeeds.
- The development server serves the page, the entry module, and the execution
  adapter with HTTP 200.
- Pending: the User must run `pnpm dev:1b` and judge the integration visually.

## What Was Decided

1. The integration lives inside `experiments/1b`; the pure execution engine is
   used as-is and remains independent of React.
2. The per-kind execution timings above are experimental scaffolding. They are
   not a design requirement and can be replaced once blocks carry their own
   duration or media parameters.
3. Dialogue ignores skip requests so the integration also shows the rule that
   the barrier waits for actual completion after a skip.
4. Cooperative skip is stored on the placement and passed to the engine. The
   UI never fires the automatic event itself.
5. A run works on a placement snapshot. Editing, dragging, stretching, and
   deletion are disabled until Reset.
6. The UI displays the current logical time in the ruler, the blocking blocks
   and phase in the status bar, block states as opacity and outlines, and the
   last skip or finish event as an activity line.
7. Effects produced by running blocks are rendered in a stage area below the
   timeline, not as overlays, so the grid and the blocking state stay visible
   while a dialogue waits for OK.

## Carry-Over

- Whether per-kind timing should become document-defined duration or media
  playback parameters.
- How a failed block should be surfaced; the current UI has no way to make one
  fail.
- Whether editing should remain possible while a run is paused or rewound.
