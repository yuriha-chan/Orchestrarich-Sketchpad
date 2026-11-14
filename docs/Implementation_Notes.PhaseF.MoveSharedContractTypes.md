# Implementation Notes: Phase F Move Shared Contract Types

## Relocation

Added `src/core/blocks/contracts.ts` as the pure core block-contract module
containing `SlotDirection`, `SlotProperty`, `BoundSlotProperty` and
`LoopRegion`, moved verbatim from `src/editor/model.ts`.

`src/editor/model.ts` re-exports the four types from the core module and imports
`LoopRegion` locally for its placement helper signatures. No type is defined
twice.

The isolation typecheck `files` list now includes
`src/core/blocks/contracts.ts`; it has no imports, so it adds no DOM or framework
dependency to the graph.

## Block library imports

Block library modules now use the pure core modules directly:

- `block-definition.ts`: `LoopRegion`, `SlotProperty` from
  `../core/blocks/contracts.ts`; `DurationUnit` from
  `../core/blocks/duration.ts`; `Vec3` from `../core/blocks/geometry.ts`;
  `Placement` from `../core/blocks/placement.ts`. `IconName` still comes from
  `../editor/icons`, and `ComponentType` still comes from `react`, because the
  icon and custom panel-field contracts are unchanged in this increment.
- `block-inputs.ts`: `Placement` from `../core/blocks/placement.ts`.
- `builtin-blocks.ts`: `BoundSlotProperty`, `SlotDirection` from
  `../core/blocks/contracts.ts`; `Placement` from
  `../core/blocks/placement.ts`.
- `media-fades.ts`: `LoopRegion` from `../core/blocks/contracts.ts`;
  `Placement` from `../core/blocks/placement.ts`.
- `rectangle.tsx`, `addition.tsx`, `dialogue.tsx`, `media-data.test.ts`:
  `Placement` from `../core/blocks/placement.ts`.
- `animation.tsx`: `Placement` from `../core/blocks/placement.ts`; `StageActions`
  from `../core/blocks/presentation.ts`.

No registry or registry behavior was changed. Tests were not modified.

## Remaining editor/UI dependencies

- `src/blocks/block-definition.ts` still imports the `IconName` type from
  `../editor/icons` (icon contract intentionally unchanged).
- `src/blocks/block-definition.ts` still imports `ComponentType` from `react`
  for the unchanged custom panel-field contract.
- No other block-library module imports from `src/editor`.

## Verification

- `pnpm exec tsc -p tsconfig.isolation.json`: passes.
- `pnpm exec tsc --noEmit`: passes.
- `pnpm test`: 16 files, 548 tests passed.
- `pnpm build`: passes; JS bundle unchanged at 995.02 kB (274.30 kB gzip).
- `git diff --check`: no whitespace errors.

No commit was made.
