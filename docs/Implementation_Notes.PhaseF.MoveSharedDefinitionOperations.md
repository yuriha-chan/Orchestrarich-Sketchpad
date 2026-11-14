# Implementation Notes: Phase F Move Shared Definition Operations

## Relocation

`block-definition.ts` and `block-inputs.ts` moved from `src/editor` to
`src/blocks`. Their contents are unchanged except for relative import paths:

- `block-definition.ts` imports the `IconName` type from `../editor/icons` and
  the model types from `../editor/model`.
- `block-inputs.ts` imports the `Placement` type from `../editor/model` and
  keeps importing `BlockOutputs` from `../core/execution/timeline-runner`.
- The runtime import in `block-definition.ts` stays at
  `../core/blocks/runtime.ts`.

All builtin modules now import `./block-definition` and `./block-inputs`
directly instead of reaching through `../editor`. Editor consumers import the
same two modules from `../blocks`; no re-export shim was left in the editor, so
there is a single definition of each contract and the single existing
`builtin-blocks.ts` registry is untouched.

The custom panel field contract (`CustomPanelField`, `ComponentType`,
`FieldProps`) is preserved exactly, including the React type reference.

## Remaining editor dependencies

No builtin module imports an editor value. Every import from the block library
into `src/editor` is `import type`:

- `block-definition.ts`: `IconName` from `../editor/icons`;
  `DurationUnit`, `LoopRegion`, `Placement`, `SlotProperty`, `Vec3` from
  `../editor/model`.
- `block-inputs.ts`: `Placement` from `../editor/model`.
- `addition.tsx`, `dialogue.tsx`, `media-data.test.ts`, `media-fades.ts`,
  `rectangle.tsx`: `Placement` from `../editor/model`; `media-fades.ts` also
  imports `LoopRegion`.
- `animation.tsx`: `Placement` from `../editor/model` and `StageActions` from
  `../editor/stage-state`.
- `builtin-blocks.ts`: `BoundSlotProperty`, `Placement`, `SlotDirection` from
  `../editor/model`.

These are type-only, so the move removes editor value imports from builtin
modules. It does not make the block library DOM-independent, because the custom
field contract still references React component types; the isolation
configuration is therefore unchanged.

## Verification

- `pnpm exec tsc -p tsconfig.isolation.json` passes.
- `pnpm exec tsc --noEmit` passes.
- `pnpm test` passes: 16 files, 548 tests.
- `pnpm build` passes; the JavaScript bundle is unchanged at 995.02 kB
  (274.30 kB gzip).
- `git diff --check` reports no whitespace errors.

No test was added or changed. The existing registry and session tests continue
to exercise the moved contracts. No commit was made.
