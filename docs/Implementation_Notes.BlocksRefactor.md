# Implementation Notes: Block Definition Registry

## Placement types

`PlacementBase` and `Placement<T>` remain in `src/editor/model.ts`, as the Model
section of `docs/blocks-refactor.md` keeps them. `block-definition.ts` imports
and reuses those types instead of declaring a second copy.

## Phase spans need the cell length

Fade phases depend on the block's cell length as well as its fade lengths. The
definition hook is therefore `phases(data, length)` and
`compilePlacement` passes `placement.length`. Calling `phases(data)` alone
cannot reproduce the existing phase barriers without duplicating the length in
every media data value.

## Stage payload generics

`BlockDefinition` takes a second stage-payload generic
(`BlockDefinition<T, S>`); `renderStage` receives `StageViewProps<S>`. A block's
stored data and its runtime stage payload are different shapes, so one generic
would not type both honestly. The registry stores `BlockDefinition` with `any`
payloads.

## Stage span

The measured stage span moved from `App` local state into the experiment store
(`stageSpan` / `setStageSpan`). The rectangle units control needs it for unit
conversion, and `FieldProps` intentionally exposes only block, editable, and
update. Stage geometry itself is still computed in `Stage.tsx` from the DOM.

## Panel fields

Block modules declare `fields`; they do not render a panel. `panelSections`
groups fields into Input, Block, and Output, and `BlockPanel` renders them.
Only the rectangle units control and the shared duration/fade controls are
components; all other fields are data descriptors. Cooperative skip belongs to
the Block section for every block and is appended by `BlockPanel`, not declared
per module. The registry derives `slotProperties` from slot-capable input and
output fields, so the capability table has one source.

## Kind conversion

`convertFrom` previously received the whole previous placement and sniffed its
`data` shape. The contract is now typed: the source definition exports
`CarryOver` and the target consumes it. `durationCarry`/`mediaCarry` copy only
the shared fields, so a media block converting to a camera cannot leak fade
fields into the camera data. Geometry and addition inputs have no exporter
because no other kind consumes them; a round trip through another kind
therefore resets them, which the store tests assert. Same-kind changes are
skipped by the store instead of being signalled by `convertFrom` returning
`undefined`.

## Fade gestures

`FadeHandles.setFadeIn` / `setFadeOut` keep the old per-field clamping
semantics. Internal phase-boundary drags call the pure `dragFadeBoundary`
helper with the definition's `phaseBoundaries` and then apply the changed
edges through those handles. `setSpan` returns a boolean so an outward edge
drag updates the fade only when the span change was accepted.

## Timeline visuals

`mediaRenderBlock` renders the fade surfaces and boundaries for sound and
animation. It uses the same 42 px inner block height that the previous App
constant produced (`TRACK_HEIGHT - 2 * BLOCK_INSET`). Internal boundary handles
are always rendered as editable and CSS disables them while the block carries
the `is-locked` class, preserving run-lock behavior.

## Tests

Model fixtures were migrated to `{ kind, data }`. Behavioral coverage for
duration, BPM, sync, fades, phases, rectangle slots and color, addition output,
skip, loops, gaps, wires, and layout is retained. A registry test checks unique
kinds, complete definitions, and the unknown-kind throw.
