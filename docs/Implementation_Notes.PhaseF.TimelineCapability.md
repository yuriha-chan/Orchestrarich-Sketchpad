# Implementation Notes: Phase F Timeline Fade Capability

## Generic surface location

The former media timeline renderer now lives in
`src/editor/timeline-fades.tsx` as `TimelineFadeSurface`. Its markup, CSS class
names, mask generation, body surface and phase-boundary elements are unchanged.
`sound` and `animation` no longer supply a `renderBlock` callback; the
definition contract no longer declares that callback.

## Fade value source

`readTimelineFades` in the same editor module locates the definition's declared
`fades` field by field kind and calls its `read` operation with the block data.
It does not inspect `block.kind` or assume a concrete data shape. If a flagged
definition has no fades field, it throws instead of rendering nothing, so the
contract violation remains visible.

## Host integration

`BlockView` checks `definition.timelineFades`, resolves the fade values through
`readTimelineFades`, and passes the fade values, `block.length`, the rendered
block width and the phase positions to `TimelineFadeSurface`. Unflagged blocks
continue to render without a timeline fade surface. Stage presentation and
gesture handling were not changed.

## Removed media renderer

`src/blocks/media-block.tsx` was removed after its logic moved into the editor.
The `renderBlock` member was removed from `BlockDefinition`, which also made the
`ReactNode` import in `src/editor/block-definition.ts` unused. No second
rendering mechanism was introduced.
