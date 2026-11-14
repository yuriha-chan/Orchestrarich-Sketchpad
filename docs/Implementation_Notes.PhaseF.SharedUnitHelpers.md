# Implementation Notes: Phase F Shared Unit Helpers

## Core modules

`src/core/blocks/duration.ts` owns `DurationUnit` and the four conversion
functions `blockDurationSeconds`, `beatsToSeconds`, `secondsToBeats` and
`convertDuration`. `src/core/blocks/geometry.ts` owns `RectUnit`, `Vec3`,
`RectGeometry` and `convertRectUnit`. Both modules are pure: they import no
editor, React, Lucide or Zustand module.

`src/editor/model.ts` re-exports the same symbols so existing editor import
paths keep their API. `src/editor/stage-geometry.ts` re-exports
`convertRectUnit` and keeps `computeStageLayout` and `rectPixels`; stage
measurement did not move.

## Builtin modules

`src/blocks/duration-data.ts` now imports the conversion functions from the
core duration module. `src/blocks/rectangle.tsx` imports `RectGeometry`,
`RectUnit`, `Vec3` and `convertRectUnit` from the core geometry module. The
rectangle module still imports the `Placement` type through the editor model
re-export because placement is outside this increment.

## Isolation typecheck

`tsconfig.isolation.json` now lists `src/core/blocks/duration.ts` and
`src/core/blocks/geometry.ts` alongside the earlier core runtime graph, so the
isolation typecheck covers the new pure modules without DOM or framework
types.

## Verification scope

No test was added or changed. The existing model and stage-geometry tests
continue to exercise the editor re-export paths, confirming that the relocation
preserves API and behavior. Rectangle units, slot behavior, stage measurement
and the block registry are unchanged.
