# Numeric slots

Track slots belong to one track; shared slots can be read from any track. Slots
can be given a name, and each slot has a row on the timeline. A slot can be
initialized with a number at a logical time; only one initialization is allowed
per slot. Editing the initialization at the same time changes its value. Delete
removes the initialization, leaving the slot available to be initialized again.
Removing a slot does not remove bindings to it, so those bindings remain invalid
until repaired.

Grouped slot rows are half-height. Cells are separated by a horizontal gap, with
a leading gap before the first column. An initialization is shown as a value
badge in the gap at its time boundary.

Rectangle X, Y, width, and height accept either an immediate number or a slot
reference. A slot expression supplies a number to the property; it does not have
the property's span or pixel unit. An initialization at the rectangle's start time
is applied before the rectangle reads its inputs. An earlier initialization also
remains available.

The editor reports invalid reads and disables Run. The execution session also
refuses to start if a referenced slot is missing, inaccessible, empty, or only
initialized after the read. Numeric slots and read validation are independent of
the UI framework. Block output, discard, other value types, ownership, wires, and
slot-backed properties beyond rectangle geometry remain outside this slice.

The runner invokes its time-start callback once per processed logical time,
before starting blocks at that time. Slot initialization uses this boundary so
the same-time ordering holds even when the runner revisits a barrier.
