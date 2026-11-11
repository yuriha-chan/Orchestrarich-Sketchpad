# Numeric slots

Track slots belong to one track; shared slots can be read from any track. Slots
can be given a name, and each slot has a row on the timeline. A slot can be
initialized in any gap of its row. The key is the boundary time together with
the enclosing loop path, and the value is applied every time the traversal
visits that gap. An initialization in the gap before a loop edge runs once per
entry to that context; one in the gap after the edge runs once per loop
iteration, and nested loops multiply. Editing the initialization in a gap
changes its value. Delete removes only the initialization in that gap. Removing
a slot does not remove bindings to it, so those bindings remain invalid until
repaired. If a loop edit removes a gap, its initializations are kept in the
document but are neither rendered nor executed until the gap exists again.

Multiple initializations are the current scope. It temporarily relaxes the
single-value rule for a slot; discard and reuse are still not modeled.

Grouped slot rows are half-height. The timeline is a sequence of cell and gap
objects; each time boundary has a contiguous gap run derived from the loop
edges, and a trailing run follows the last cell. Every gap in a slot row is an
initialization position; an initialization is shown as a value badge centered in
its gap, and clicking a gap edits that gap's initialization. A value's rail runs
from its gap to the next gap that replaces it, whether that gap is another
initialization or a block output assignment.

Rectangle X, Y, width, and height accept either an immediate number or a slot
reference. A slot expression supplies a number to the property; it does not have
the property's span or pixel unit. A read uses the latest initialization at or
before the read time, so an initialization at the rectangle's start time is
applied before the rectangle reads its inputs.

Slot values can be dragged. Dragging a value pill or a rail dot onto a block
shows that block's slot-capable parameters; dropping on one binds the property
to the slot, like the inspector's source selector. The capable parameters are
per-kind data in `SLOT_CAPABLE_PROPERTIES`; only rectangle geometry is capable
in the current slice. A track-local slot can bind only within its track.

A reference is also drawn on the timeline: a 4 px rail-colored line runs from the
block's bottom edge down to the slot's row, so a wire never runs along a block
edge. Every slot-capable input parameter of every block in a start column is
assigned its own lane, in track order then property order, across the first cell.
Only bound parameters draw a wire, but an unbound parameter keeps its lane, so
wires never overlap and a parameter reaches the same lane whatever its neighbours
bind. Output parameters do not take a column lane; their wire is routed at the
assignment boundary instead. There is one wire per bound parameter, so two
properties bound to the same slot draw two wires. A small dot marks the wire's
endpoint on the block's bottom edge. Each vertical line is drawn over a white
casing, so crossing a horizontal rail reads as an overpass rather than a junction.
The casing stops just above
the rail the wire branches from, so that connection stays continuous; only
crossings with other slots' rails are isolated. Wires are drawn beneath the
blocks, so wires crossing other tracks do not cover block labels; the dots are
drawn above the blocks so the endpoint stays visible where it crosses the block
edge. A binding to a removed slot has no row to connect to and draws nothing.

An output reference is drawn as an assignment rather than an input. It starts at
the block's right edge, at the vertical center of the block, and lands at the gap
of the block's end time, where the slot is written. Its vertical part runs in
that gap corridor and it has no endpoint dot. An assignment is a value boundary:
the previous value's rail ends at the assignment gap and a new rail starts there,
so the rail shows the block replacing the previous value.

An addition block reads two numeric inputs and outputs their sum. The output is
defined exactly like an input: it is a slot-capable property with direction
`output` in the per-kind table, its binding is stored in `slotBindings` under
that key, and the inspector lists it as a slot selector. The addition has no
duration; it computes on its start and completes at once. The block does not
write the slot itself: its execution resolves with the output value, and the
runner assigns that value to the bound slot when the block reaches its end time.
Blocks starting at or after the addition's end time therefore read it.

The editor reports invalid reads and writes and disables Run. A read is valid
when the slot has an authoring initialization at or before the read time or an
addition output whose block ends by the read time. The session refuses to start
if an input slot is missing, inaccessible, or has no value in time, or if an
output binding is missing or inaccessible. Numeric slots and validation are
independent of the UI framework. Discard, other value types, ownership,
value-transfer wires, and slot-backed properties beyond rectangle geometry and
the addition inputs/output remain outside this slice.

The runner invokes its time-start callback once per processed logical time,
before starting blocks at that time, and reports a loop repeat with the
repeating loop. The session applies all gaps at a normal boundary entry; on a
repeat it applies the closing gaps at the loop end that belong to the repeated
body, then the opening gaps at the loop start, so the shared parent gap is not
revisited. A read therefore uses the value left by the last visited gap before
the block starts; every gap at the block's own boundary is visited first.
