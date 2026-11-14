# Phase G delegation 1 implementation notes

Scope: `src/editor/block-registry.test.ts` and `src/editor/loops.test.ts`.
No product code changed. Store tests were left to their owner.

## Decisions

- Same-span fade conversion fixture: used target length `3`, matching the
  fixture's media duration and the `1 + 2` fade total. This keeps the fixture
  inside the store's actual "convert without changing length" caller contract
  instead of converting a span-3 fade pair into a span-2 placement.
- Carry-over hook witness: removed the assertion that `dialogue` and `addition`
  have no `carryOver` hook, since an empty hook is equivalent to callers. Kept
  the existing hook-presence assertions for contributing kinds and added
  behavior assertions showing a duration carry is ignored by `dialogue` and
  `addition`.
- Empty block-section witness: added a fresh input-only definition so the
  `block` section is actually empty, while retaining the existing camera and
  dialogue section assertions.
- Interleaved section witness: replaced the global declaration-order assertion
  with section order, per-section declaration order, and exactly-once membership
  for builtins, plus a fresh definition whose output/input fields are interleaved.
- Loop test names tightened to the reviewed partial-cut cases. The misleading
  store test names called out in the same review are outside this delegation and
  were not edited.

## Verification

- `pnpm exec vitest run src/editor/block-registry.test.ts src/editor/loops.test.ts`
  passed: 2 files, 91 tests.
- `pnpm typecheck` passed.
- The full suite also passed during the focused run: 16 files, 553 tests.
