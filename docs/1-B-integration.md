# Experiment 1-B Integration: Driving the Execution Engine from the Grid

## Question

Can the 1-A execution engine drive the 1-B grid so that logical time, blocking blocks, skip, and cooperative skip are observable in the UI without duplicating the execution model in the UI?

## Smallest Components

- `src/editor/execution.ts` wraps `TimelineRunner` in a `TimelineSession`.
  The session builds a `TimelineDefinition` from the placements, supplies each
  block's execution Promise and skip handler, and reports snapshots and activity
  messages to the UI.
- The editor debugger renders engine snapshots and sends transport commands
  (`start`, `requestSkip`) to the session. Stage effects are different: block
  execution modifies a dedicated UI store, and `Stage.tsx` renders only that
  store's presentation entries. It does not inspect runner state or placements.
- Workspaces are preset layouts selected in a top tab bar. Staging shows the
  palette, grid, stage, and selection status. Preview hides the grid and the
  editing controls and gives the stage the available space. The workspace is
  UI state; the document, selection, and running session are shared.
- Per-kind execution, for observation only:
  - Dialogue shows a dialog with the text "lazy dog jumps ..." and an OK button
    in the stage below the timeline. Pressing OK completes the block. Dialogue
    has no duration property.
  - Camera, sound, animation, and wait run for the block's duration. A block's
    duration is stored with its unit: beats follow the timeline BPM, while
    seconds are absolute. BPM is a timeline-level property (default 120).
  - A running animation shows a progress bar in the stage, filling over its
    natural duration, and a separate media preview fades its opacity in and out
     with the block's fade phases. Playback holds across phase-boundary waits.
    The block adds its presentation at runtime execution start and removes it
    at container finalization. The renderer does not infer this lifetime.
  - A wait block only occupies logical time; it has no stage effect.
  - A rectangle block draws a filled rectangle on the stage screen for the
    block's duration. It is added at execution start and removed when the
    block is finalized. Its geometry is document data in span or pixel units.
  - A skip request shortens a timed block to a 150 ms fade before completion.
  - Dialogue blocks have no skip handler and therefore ignore skip requests.
  - A media block (sound or animation) is a container with fade-in and fade-out
    lengths in cells. The session expands it into adjacent phase blocks at the
    fade boundaries, so every boundary is an end-time barrier. Each phase runs
    for the container's duration times its share of the cell span.
  - The stage card of a media block belongs to the container and stays mounted
    across the phase barriers, so the media is not cut off by the fades. It is
    unmounted when the container is finalized, that is, when its last phase goes
    through termination.
- The stage contains a screen with a configurable grid (default 16 x 9). The
  grid is centered in the available stage area and the leftover space is
  letterboxed. The cell size (span) is `min(width / columns, height / rows)`.
  Grid columns and rows are timeline-level properties edited next to BPM and
  locked during a run.
- A selected placement is edited in an inspector beside the grid: kind,
  cooperative skip, duration and sync of beats to the cell span for timed and
  media blocks, fade lengths for media blocks, and x/y/w/h plus a span/pixel
  unit for rectangle blocks. Start and the cell span are
  read-only; the block is moved and stretched on the grid. The engine decides
  when to fire the automatic skip event.
- A run uses the placements as they were when Run was pressed. Editing is
  locked while a run exists; Reset returns to editing.
- The track list is document state. The three default tracks can be extended
  with "Add track" while editing; the engine receives every track, including an
  empty one.
- Blocks are moved by dragging the body and stretched from either edge with
  the left button. Right-dragging a media block's edge inward sets a fade
  within the current span; dragging outward extends the block and assigns the
  new cells to that fade.
- Fade regions mask the block's colored surface using the supplied linear
  dot-gradient SVG. Small opaque dots at the outer edge grow into overlapping
  dots toward the solid body; gaps are transparent. Internal phase
  boundaries have left-drag handles snapped to cells.
- The grid is horizontally unbounded. It renders an initial number of columns
  and extends the rendered columns in chunks as the horizontal scroll reaches
  the right edge. The ruler, the track rows, and the block layer share that
  width.
- `TimelineRunner.barrierSpan(t)` returns the span between the distinct block
  end times that contains `t`; the time cursor spans that barrier span.
- The core engine is used as-is apart from the added `barrierSpan` query.

## Criterion

- Logical time stays at t while any block ending at t+1 is running, and the
  status bar lists those blocking blocks.
- A user skip shortens timed blocks, and the barrier still waits for a dialogue
  block that ignores the request.
- A cooperative block auto-skips when every not-completed block with
  `end <= block.end` is cooperative.
- A timed block executes for its duration: a beats duration scales with the
  BPM, a seconds duration does not, and a block whose beats are synced to its
  cell span follows the span.
- A wait block holds its column for its duration and has no stage effect.
- A rectangle block draws its rectangle on the stage screen while it executes
  and removes it at finalization. Span units follow the current grid cell size;
  pixel units stay fixed when the stage is resized. Changing the unit converts
  the stored geometry at the current span.
- A non-16:9 stage area centers the configured grid and letterboxes the excess
  space instead of stretching the cells.
- `barrierSpan(t)` splits logical time at the distinct block end times. For
  blocks ending at 2, 3, and 5, it returns [0,2] for t=0 and t=1, [2,3] for t=2,
  and [3,5] for t=3 and t=4.
- The time cursor covers the current barrier span, not only the current column.
- A media block with fades creates a barrier at each phase boundary, and its
   stage effect stays mounted and holds at completed phase boundaries until the next phase starts.
- Dragging a block's left edge changes its start while its end stays fixed.
- Right-dragging a media edge inward sets the fade within the block; dragging
  outward extends the block and fades the new cells.
- A running animation's media preview fades its opacity in and out with its fade
  phases; its progress indicator is outside the fading element.
- An animation's stage card remains visible while the timeline waits at a
   barrier. Its progress and fade animation hold at phase boundaries until the next phase starts.
- Adding a track gives the grid a new row and the run includes that track.
- Scrolling to the right edge extends the timeline columns; a block can be
  placed beyond the initially rendered columns.
- A run that reaches the finished phase performs Reset automatically and
  returns to editing; a failed run stays failed until Reset is pressed.
- Run, Skip, and Reset work together without duplicating the barrier in the UI.

## What Was Confirmed

- `pnpm typecheck`: core and 1-B UI both pass.
- `pnpm test`: 266 tests pass (55 core + 19 numeric slots + 40 placement model
  + 58 store + 16 timeline rows + 39 integration + 8 stage geometry + 10 slot
  value rail + 15 slot wires + 6 fade editing and dot-pattern tests).
- `pnpm build`: production build succeeds.
- The development server serves the page, the entry module, and the execution
  adapter with HTTP 200.
- Pending: the User must run `pnpm dev` and judge the integration, the
  workspace tabs, the inspector, and the duration control visually.

## What Was Decided

1. The integration lives inside `src/editor`; the pure execution engine is
   used as-is and remains independent of React.
2. A block's duration is a document property, and its unit is stored with it.
   A beats duration follows the timeline BPM; a seconds duration is absolute and
   is unaffected by BPM changes. Switching the unit converts the stored value at
   the current BPM, so the real duration at the moment of the switch is
   preserved. Timed blocks execute for the resulting seconds, replacing the
   earlier experimental per-kind timings.
3. Dialogue ignores skip requests, waits for OK, and has no duration property.
   This keeps the demonstration that the barrier waits for actual completion
   after a skip.
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
8. Selection is single-block. Pressing a block selects it, including the start
   of a move or stretch; Escape or a right-click on empty grid clears it. The
   selected block's properties are shown in the inspector.
9. Right-clicking a block opens a context menu with Duplicate and Delete. The
   menu is only available while editing; during a run a right-click selects the
   block but does not open editing actions.
10. Workspaces are view-layer layout presets over the same store and session,
    selected at the top tab bar. The active workspace is UI state, not document
    state: switching does not change placements, selection, logical time, or the
    running session. Staging is the editing layout; Preview hides the grid and
   editing controls and expands the stage. The Preview workspace is where the
   PixiJS game preview can live later.
11. Property editing uses a selection-gated inspector beside the grid in
    Staging instead of menu items or a modal dialog. It shows the block's
    editable properties (decision 13); numbers commit on Enter or blur and
    invalid results leave the placement unchanged. The fields are read-only
    while a run is loaded, and the inspector is hidden in Preview, where editing
    is not available.
12. While a run is active, the current barrier span is marked by a rectangular
    frame over the track area, in addition to the highlighted ruler cell. The
    frame spans from the last barrier check time at or before the current time
    to the next check time, and it does not intercept pointer events.
13. The inspector does not edit start or length. Start and the cell span are
    read-only; the block is moved and stretched directly on the grid. Duration
    is a separate property of timed blocks whose beats/seconds unit is stored on
    the block; dialogue has no duration. Enabling "Sync beats to cell span"
    makes the duration follow the span (one cell = one beat); it stores the
    duration in beats and makes both the duration field and the unit toggle
    read-only while enabled. BPM is a timeline property edited in the toolbar,
    and it is locked while a run is loaded.
14. Wait is a timed block kind with no stage effect; it only occupies logical
    time. Because the kind is part of the stored document, changing a block's
    kind keeps a timed block's duration but gives a dialogue that becomes timed
    the duration of its cell span in beats, and a timed block that becomes a
    dialogue loses its duration properties.
15. Barrier check times are the distinct block end times, not every unit cell.
    `barrierSpan(t)` returns the span between the previous check time at or
    before `t` (with 0 as the floor) and the next check time after `t`; a check
    time belongs to the span that starts at it. At or beyond the last check time
    the span is degenerate at that time, and an empty timeline returns [0,0].
    The query is structural: completed blocks still define the spans.
16. The document has no horizontal column limit. The grid renders an initial 16
    columns and adds another 16 when the horizontal scroll reaches within four
    cells of the right edge. The rendered width is shared by the ruler, the
    track rows, and the block layer so the grid background and the barrier-span
    cursor extend with the columns.
17. Tracks are document state, not constants. "Add track" appends a track with
    a generated id and a positional label while editing; the engine definition
    includes every track. Tracks cannot yet be renamed, reordered, or removed,
    and "Clear all" removes blocks but keeps the tracks.
18. When a run reaches the finished phase, the UI performs the same reset
    automatically: the session is disposed, the snapshot and activity are
    cleared, and editing is unlocked. Only the finished phase auto-resets; a
    failed run stays failed until Reset so the failure remains visible.
19. A media block (sound, animation) is a container of directly adjacent phase
    blocks, as the design describes for multi-phase blocks. Fade-in and fade-out
    are lengths in cells; the session splits the container at those boundaries,
    and each phase executes for the container duration proportionally to its
    share of the cell span. The phase ends are ordinary barrier check times, so
    logical time stops at each fade boundary until that phase completes. The
    stage effect belongs to the container and stays mounted across the
    boundaries, so the media is not cut off by the fades.
20. Blocks are stretched from either edge with the left button. Dragging the
    left edge changes the start and length while the end stays fixed; dragging
    the right edge changes the end. Right-dragging a media block's edge inward
    sets the fade-in or fade-out length within the current span; dragging
    outward expands the block and assigns the expanded cells to that fade, so an
    existing fade grows by the same amount. A span and fade change is applied
    atomically and rejected as a whole if it would overlap another block. A
    right press on an edge suppresses the context menu for that gesture, while a
    right press on the body still opens the menu. Phases are not separately
    selectable and inherit the container's cooperative skip for now.
21. A running animation's media preview fades its opacity with the fade phases: it
    starts transparent, reaches full opacity at the end of the fade-in, and
    returns to transparent at the end of the block. The opacity animation uses
    the block's duration and fade fractions and, like the progress bar, is timed
    on the wall clock rather than driven by logical-time snapshots.
22. The animation card represents presentation state owned by a runtime container
    execution, not a placement or one phase. Block execution adds a UI entry,
    and container termination removes it. The renderer uses that entry's identity
    without inspecting execution instances or their lifecycle events.
    Block execution writes playback position and playing state to the UI store at
    phase start and completion. Playback, opacity, and progress hold at a completed
    phase boundary until the next phase starts. The card
    remains mounted through intermediate and final barriers, including after
    early completion, until the container's final phase is terminated. Timeline
    failure finalizes active container instances. The fade targets only the media
    preview, not the card or progress indicator; a completed fade-out cannot hide
    the progress indicator before finalization.
23. Safety in this code comes from contracts and types, not from ad-hoc
    runtime guards. Engine block ids resolve to placements through total
    records because the session builds both from the same placement list; the
    runner keeps a block's lifecycle state, automatic-skip flag, and skip
    handler on its internal placement instead of parallel keyed collections;
    and the editor debugger represents a run as one nullable `RunState` (session,
    snapshot) instead of correlated nullable fields. Editing commands with
    an unknown id are a deliberate no-op centralized in `editBlock`. This
    refactor does not change observable behavior.
24. Media classification and multi-phase structure are independent. The compiler
    currently builds multi-phase definitions for media placements, but the
    structural expansion uses `ExecutionStructure` and `isMultiPhase`, not the
    media-kind predicate. A non-media multi-phase definition is structurally valid;
    no additional palette kind or phase editor is introduced.
25. A placement is document data, not an execution instance. Each container start
    allocates a distinct runtime identity referencing its definition. Phases share
    that instance until finalization; dialogue UI callbacks belong to the instance.
    Re-executing the same placement creates another identity. The runner remains
    one-shot; loop scheduling is not implemented by this change.
26. The block itself modifies UI state; the stage does not derive effects from
    runner state. Each App owns a stage store containing typed presentation
    entries: dialogue text and a confirmation callback, or animation label,
    duration, fade fractions, and playback position/playing state. No entry contains a placement, runner snapshot,
    or execution definition. Dialogue execution supplies the callback that removes
    its dialog and resolves its Promise; there is no public `advanceDialogue`
    session command. Animation execution adds its entry once, and container
    termination removes it. Reset/disposal also invokes the owned presentation
    cleanup. Start/finalization telemetry is not a stage rendering input.
27. Runtime behavior is polymorphic through `ExecutionInstance`: the session
    invokes phase start, phase termination, and container termination without
    kind-specific effect branches. `TimedExecution` owns timers and skip handling;
    `MediaExecution` extends it to own media initialization, phase playback/hold,
    and presentation termination. An animation presentation adapter supplies fade
    data and stage commands. Sound also uses the media subtype but has no output
    adapter while its effect remains timer-only. Kind dispatch is confined to the
     execution factory. Multi-phase structure remains independent of this hierarchy.
28. The grid's colored fade surfaces use `src/editor/dot-gradient.ts` as an alpha
    mask image, not a dark dot overlay. Dot radii follow the supplied linear
    interpolation from small dots at the outer edge to overlapping dots at the
    inner edge. Gaps reveal the timeline; the body stays solid. Labels and drag
    handles remain unmasked. This changes phase visualization, not runtime playback.
    Left-dragging an internal boundary changes the corresponding fade length,
    snapped to cells, without changing the container span or the opposite fade.
    A boundary cannot cross its neighbor. If the two fades meet without a body,
    their shared boundary moves both lengths while keeping their sum equal to the
    span. Dragging a boundary to an outer edge can remove that phase. Editing
    remains disabled during a run; outer-edge gestures are unchanged.

29. A rectangle is a block kind with a duration, a cooperative-skip flag, and
    a geometry stored as x/y/w/h plus a unit. It has no fade phases and is not
    classified as media. The stage screen is a 16 x 9 grid by default with
    configurable columns and rows; the span is the largest square cell that
    fits, and the grid is centered with letterboxing. Span units are responsive
    to the span, pixels are absolute; switching the unit converts the geometry
    at the current span, mirroring the beats/seconds contract for durations.
    Geometry is edited numerically in the inspector for now; a stage drag
    gesture is not introduced.

30. Slot-capable properties are declared as per-kind data in
    `SLOT_CAPABLE_PROPERTIES`; consumers look up that table instead of
    branching on block kind. Dragging a slot value pill or a rail dot onto a
    block opens a drop-area popup directly above the block with no gap, so the
    pointer can move from the block into the popup without losing it. Each
    capable property is a large drop target in a grid; a property already
    bound to a slot is marked distinctly. Dropping on one binds the property
    to the slot. The binding is a reference, not an assignment of the current
    literal value. A track-local slot can bind only to blocks on its track; a
    shared slot can bind on any track. The inspector's source selector remains
    the non-pointer path.

31. A slot reference is drawn as a wire on the timeline: a 4 px line in the
    rail color from the block's bottom edge down to the slot row's rail. Ending
    at the bottom edge means the wire never runs along a block edge. Every
    slot-capable input parameter of every block in a start column owns a lane
    across the first cell, ordered by track and then by parameter; only bound
    parameters draw a wire, but unbound parameters keep their lane. Wires
    starting in the same column therefore never overlap, and different columns
    use different cells. Output parameters do not take a column lane because
    their wire is routed at the assignment boundary instead. There is one wire
    per bound parameter, so two properties bound to the same slot draw two
    wires. A small dot marks each wire's endpoint on the block's bottom edge.
    Each vertical line is drawn over a white casing, so crossing a horizontal
    rail reads as an overpass rather than a junction; the casing stops just above
    the rail the wire branches from, so that connection stays continuous and
    only crossings with other slots' rails are isolated. Wires are drawn beneath
    the block layer so that wires crossing intervening tracks do not cover block
    labels; dots are drawn above the blocks so the endpoint remains visible where
    it crosses the block edge. A binding whose slot no longer exists has no row
    and therefore no wire; the read is still reported as invalid.

32. A track label carries a color accent and a right-click menu. The menu adds
    a track below the clicked one, renames it inline, duplicates it, picks one
    of the preset track colors, or removes it. Removal deletes the track, its
    blocks, and its track-local slots; shared slots stay, and the selection is
    cleared only when the selected block was on the removed track. Duplication inserts the copy directly below
    the source, copies the source track's blocks and track-local slots with new
    ids, and re-points duplicated bindings to the duplicated slots; bindings to
    shared slots keep pointing at the shared slot. The track color is document
    data and appears as an inset accent on the label. The Add track button sits
    at the foot of the label column; Add slot stays on each track label.

33. The addition block reads two numbers and outputs their sum. Each input is an
    immediate number or a slot binding; the output is defined the same way as an
    input, as a slot-capable property with direction `output` (`out`), so its
    binding lives in `slotBindings.out` and the inspector and drag-to-bind treat
    it like any other slot property. The addition has no duration: it computes
    instantly on its start. The block does not write the slot itself; its
    execution resolves with the output value and the runner assigns that value
    to the bound slot when the block reaches its end time, so a block starting at
    or after the addition's end time reads it. Read validation accepts a slot
    value from an authoring initialization at or before the read time or from an
    output whose block ends by the read time. Write validation rejects a missing
    slot or a local slot on another track. The addition has no stage effect.

34. An output reference is drawn differently from an input reference. It starts
    at the block's right edge, at the vertical center of the block, and lands at
    the gap of the block's end time, which is the boundary where the slot is
    written. The vertical part runs in that gap corridor, and the wire has no
    block-edge endpoint dot. This assignment also bounds the slot's value rail:
    the previous value's rail ends at the assignment gap, and a new rail starts
    there, so the rail reflects that the block replaces the previous value
    rather than the value continuing. Wires paint above slot value dots and the
    horizontal rails; blocks paint above wires, and endpoint dots paint above
    blocks, so a crossing rail or dot never covers the vertical wire.

35. Duplicating a block keeps its kind, duration, geometry, and slot bindings.
    The copy is placed on the same track at the next free space at or after the
    source's end, scanning forward past occupied spans, and becomes the selected
    block. There is no separate "paste at pointer" placement for duplicates yet.

## Carry-Over

- Multiple blocks may write the same slot; ordering is by completion time and
  the result is not statically checked or rejected yet.
- How a failed block should be surfaced; the current UI has no way to make one
  fail.
- Whether editing should remain possible while a run is paused or rewound.
- Per-workspace view state (scroll position, zoom, panel widths) and whether the
  active workspace should persist across reloads.
- Whether tracks should be reorderable; renaming, duplication, insertion
  below, removal, and color are now available.
- Whether the extending column list needs virtualization for very long
  timelines.
- Which additional workspaces are justified once more views exist (PixiJS
  preview, slots and wires, phase editing), and whether tabs confuse beginners.
- Per-phase selection, properties, and cooperative skip for multi-phase blocks;
  currently only fade boundaries are draggable and every phase inherits the
  container's cooperative skip.
- Whether runtime fades need easing or a media-specific curve; the editor's
  dot mask is a phase indicator, not the playback interpolation contract.
- Whether rectangles need fill/stroke/color properties, z-ordering, and a
  direct stage drag gesture; only numeric geometry is exposed now.
- Whether the stage grid should offer presets or separate the screen resolution
  from the grid cell count.
