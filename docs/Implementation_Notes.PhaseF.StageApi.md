# Implementation Notes: Phase F Stage Presentation API

## StageActions method shape

`StageActions` accepts full presentation primitives, so each add method owns the
primitive's identity, type and layer:

- `addDialogue(card)`
- `addAnimation(card)`
- `addRectangle(rectangle)`
- `updateAnimationPlayback(id, playback)`
- `remove(id)`

`updateAnimationPlayback` changes only an item whose `id` matches and whose
`type` is `"animation"`. The generic `add`/`update` methods and the `StageItem`
`kind`/`payload` shape were removed; the store now holds `StagePrimitive` values.
`StageLayer` remains an exported literal type.

## Editor-owned stage rendering

The three React views moved from the block modules into
`src/editor/stage-primitives.tsx`. Their markup, CSS classes, animation
keyframes, durations and playback effect dependency structure are unchanged.
`Stage.tsx` maps each layer to a small `StagePrimitiveView` that switches on
`primitive.type`; it no longer imports the builtin registry or block kinds.

## Block modules

Dialogue, animation and rectangle executions now call the typed stage actions.
Their block-local payload interfaces were removed in favor of the core
presentation types. `renderStage`, `StageViewProps` and the unused second
`BlockDefinition` type parameter were removed; `BlockDefinitionSpec` and
`packBlockDefinition` now take one type parameter.

## Tests

`execution.test.ts` now reads typed primitives directly, using type-guard
`find` callbacks for dialogue confirmation and rectangle geometry.
`block-registry.test.ts` asserts rectangle values on the primitive itself; the
unit-conversion test still compares all six geometry/color values with
`toEqual`. No behavioral assertion was dropped.

## Verification

- `pnpm exec vitest run src/editor/execution.test.ts src/editor/block-registry.test.ts`: 100 passed.
- `pnpm exec vitest run`: 547 passed.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm exec tsc -p tsconfig.isolation.json`: passed.
- `pnpm run build`: passed.
