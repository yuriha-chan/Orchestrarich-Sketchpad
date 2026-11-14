# Integer placement coordinates implementation notes

## Type and conversion

- `src/core/blocks/placement.ts` owns `Integer`, a nominal branded number, plus
  `isInteger` and `toInteger`. `toInteger` is the explicit checked conversion:
  it returns the same value for whole numbers and throws `RangeError` for
  fractional or non-finite values. It never rounds.
- `PlacementBase.start` and `PlacementBase.length` are `Integer`. `model.ts`
  re-exports the type and helpers so editor code has one placement import.

## Store and construction paths

- `create`, `move`, `resize`, and `setSpan` on the experiment store accept
  `Integer` coordinates.
- `canPlace` retains the existing nonnegative-start and positive-length rules;
  its integer inputs are guaranteed by the placement type contract.
- `nextFreeStart` returns `Integer`, covering block duplication. Its inputs
  remain ordinary numbers because they also accept loop spans and arithmetic
  results; the returned placement coordinate is checked once at the boundary.
- Placement gestures now publish `Integer` edits. `mediaGesture` converts its
  computed starts and lengths with `toInteger`, so `setSpan` receives checked
  values rather than asserted ones.
- `App.tsx` checks pointer cells, creation spans, clamped drag results, and
  preview spans with `toInteger`. Layout, loop, and runner geometry keep their
  existing numeric types because they are not document placement coordinates.

## Tests

- `src/core/blocks/placement.test.ts` demonstrates whole-number conversion,
  runtime rejection of fractional/non-finite values, and compile-time
  rejection of ordinary numbers through `@ts-expect-error`.
- `src/editor/store.test.ts` checks compile-time rejection of fractional
  `create` starts and lengths, `move`, `resize`, and `setSpan` calls without
  executing calls that violate the contract.
- Existing test fixtures that construct placements now convert their numeric
  literals through `toInteger`; no existing command or gesture assertion was
  weakened or removed.

## Verification

- Focused RED run before implementation: conversion and store integer tests
  failed on missing helpers; `tsc` also reported the unused compile-time
  negative directives.
- `pnpm typecheck` passed.
- `pnpm exec tsc -p tsconfig.isolation.json` passed.
- `pnpm test` passed after Lead's contract audit: 17 files, 556 tests.
- `pnpm build` passed with the existing large-bundle warning.
- `git diff --check` passed.

UI behavior was not exercised in a browser; the User performs UI verification.
