# Phase G delegation 2: store and orphan tests

Scope: `src/editor/store.test.ts` and `src/editor/slot-gaps.test.ts`. No product
files were edited and no commit was made.

## Changes

- `store.test.ts`: added final-track removal coverage, including its blocks,
  track-local slots and selection.
- `store.test.ts`: added non-finite slot initialization value coverage (`NaN`,
  `+Infinity`, `-Infinity`) at the real `initializeSlot` command.
- `store.test.ts`: corrected two misleading names from `test-review.md`:
  "rejects a path that is not a gap at the boundary" now says "accepts ...",
  and "keeps an addition's data..." now describes creating the addition's
  default data.
- `slot-gaps.test.ts`: added an input-immutability witness for `liveNumericSlots`.
- `slot-gaps.test.ts`: composed pruning with `validateNumericSlotReads` so an
  orphaned initialization that is pruned no longer satisfies a read; the same
  read is accepted when validation sees the unpruned slot.

## Fractional placement observation

The delegation asked for fractional placement coverage only if the established
command contract rejects it. I observed the current command behavior directly:

- `create(trackId, kind, 1.5, 1)` stores a placement at `start: 1.5`.
- `create(trackId, kind, 4, 1.5)` stores a placement with `length: 1.5`.
- `move(id, trackId, 8.5)` stores `start: 8.5`.
- `resize(id, 2.5)` returns `true` and stores `length: 2.5`.

`canPlace` only rejects `start < 0` and `length < 1`; it has no integer check.
`setSpan` shares that path. Fractional placement boundaries are enforced by
`addLoopAtCell`, `setLoopBoundary` and the slot-initialization boundary, but not
by placement commands. Because the current implementation accepts
fractional inputs, I did not add a test asserting rejection and did not invent a
fractional-placement policy. Whether acceptance is intended remains ambiguous;
the existing tests only state the negative-start and empty-length rules.

## Verification

- `npx vitest run src/editor/store.test.ts src/editor/slot-gaps.test.ts`:
  2 files, 131 tests passed.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
