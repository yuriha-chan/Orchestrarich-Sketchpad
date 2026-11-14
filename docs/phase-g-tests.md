# Phase G: remaining test corrections

Scope follows the Phase G checklist in `refactoring-schedule.md` and the original
individual assessments in `test-review.md`. Preserve established observable
contracts; do not infer requirements from tests or modify application behavior.

## Bounded delegations

1. Registry and test names: correct the reviewed empty/interleaved section
   witnesses, same-span carry conversion fixture, incidental hook-absence check,
   and misleading loop/store test names where still applicable. Exercise actual
   public operations. Do not change product code. Report each modified test and
   focused verification; preserve meaningful existing assertions.
2. Store and orphan tests: cover final-track removal, nonfinite initialization,
   fractional placement at the real command boundary if its established contract
   rejects it, and orphan-pruning purity composed with validation. Do not invent
   validation requirements or change product code. Report any behavior that does
   not match the established contract instead of working around it.

Lead audits the test semantics and remaining cross-track ordering and rail
composition. Tests that merely characterize existing behavior do not require a
manufactured RED. Run the full typecheck, isolation check, test suite, build and
diff check before phase completion; the User performs UI verification.

## Review and completion

- Registry tests now exercise truly empty and interleaved sections, use a valid
  same-span conversion, and check conversion behavior rather than requiring
  optional carry hooks to be absent. Existing per-kind contributing hooks remain
  covered. Two loop and two store test names now describe their actual fixtures.
- Runner assertions no longer prescribe ordering between simultaneous blocks;
  they retain membership, counts, and time-boundary partial ordering. Ordered
  gap visits and sequential-time behavior remain unchanged.
- Store tests cover removing the last track and rejecting nonfinite slot values.
  Orphan pruning is checked for input preservation and composed with read
  validation. No production behavior was changed.
- Fractional geometry is currently accepted by editor placement commands; the
  core runner rejects noninteger geometry. This discrepancy was not changed or
  characterized as a desired contract by the test-only phase. It merits a
  separate bounded review of editor input boundaries.
- Rail anchor construction still lives in `App.tsx`; it has not been extracted
  or changed in this phase. The reviewed composition witness remains deferred
  until that responsibility changes, as scoped by the schedule.
- The existing exact AST, path, coordinate and lane checks remain in place.
  These changes refine test witnesses; they do not establish specification
  semantics by running tests and do not claim browser verification.

Final verification: `pnpm typecheck`, `pnpm exec tsc -p tsconfig.isolation.json`,
`pnpm test` (553 tests in 16 suites), `pnpm build`, and `git diff --check` passed.
The build still reports the previously recorded large icon bundle warning.
