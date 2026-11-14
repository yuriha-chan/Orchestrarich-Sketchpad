# Implementation Notes: Phase F First Bounded Increment

## Runtime module contents

`src/editor/block-runtime.ts` moved wholesale to `src/core/blocks/runtime.ts`.
Besides the classes named in the task, the move carries `SKIP_FADE_MS`,
`MediaPlayback` and `MediaPresentation`, because they are part of the same
execution contract and had no other owner. Their signatures and behavior are
unchanged.

## Editor re-exports

`src/editor/model.ts` re-exports `PlacementBase` and `Placement` from
`src/core/blocks/placement.ts`. `src/editor/stage-state.ts` re-exports
`StageLayer`, `StageItem` and `StageActions` from
`src/core/blocks/presentation.ts`. In both cases the definitions exist only in
the core module; the editor files import the types for their own use and
re-export the same symbols so existing import paths keep working.

## Isolation typecheck

`tsconfig.isolation.json` lists the five files in the dependency graph
explicitly: placement, presentation, runtime, `timeline-runner.ts` and its
`gap-contexts.ts` dependency. It uses `lib: ["ES2022"]` without DOM and
`types: ["node"]` so `setTimeout`/`clearTimeout` remain typed in the
framework-free runtime. The config imports no editor module and no React,
Lucide or Zustand type.

## Verification scope

Existing runtime session tests were not changed beyond the moved import path.
The increment is a file move and import rewiring; no timing, unit, stage
ownership, document data or registry behavior changed.
