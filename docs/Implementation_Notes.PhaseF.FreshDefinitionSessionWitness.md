# Implementation Notes: Phase F Fresh-Definition Session Witness

## Witness location and shape

The witness lives in the existing `src/editor/execution.test.ts` session suite.
It builds a fresh `BlockDefinition` with one `numberInput` field, commits a
value through that field's declaration operation, and runs a real
`TimelineSession` against the real stage store.

The fresh execution extends `TimedExecution` and calls
`context.stage.addRectangle` with the resolved numeric input. Its
`terminate` override removes the rectangle through the same generic stage
action. This uses the shared runtime and stage contracts rather than a parallel
test-only implementation of rectangle behavior.

## Lookup substitution

`vi.mock` replaces `../blocks/builtin-blocks` with a wrapper. The wrapper
records every kind lookup, returns the fresh definition only when its kind
matches, and delegates every other lookup to the original module. The test
asserts that the fresh kind appears in the recorded lookups, proving the
session and compilation path used the substituted high-level lookup. No
production registry is added, no readonly registry array is mutated, and no
production file gains a kind branch.

The wrapper is reset after the test so other session cases keep resolving
only builtin definitions.

## Observed behavior

After `session.start()`, the stage contains one rectangle whose `x` equals the
value committed through the numeric input declaration. Advancing fake timers
through the execution duration resolves the session promise, finalizes the
block and runs termination; the test then observes the rectangle removed and
`onFinalize` recorded for the fresh placement.

## Verification

- `pnpm exec vitest run src/editor/execution.test.ts`: 67 passed.
- `pnpm exec vitest run`: 549 passed.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm exec tsc -p tsconfig.isolation.json`: passed.
- `pnpm run build`: passed.
- No production file was changed by this increment.
