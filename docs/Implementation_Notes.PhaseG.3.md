# Phase G delegation 3: runner cross-track ordering

Scope: `src/core/execution/timeline-runner.test.ts` only. No production files
were edited and no commit was made.

## Change strategy

Added `expectSameMembers`, which asserts equal length plus `arrayContaining`.
For these fixtures, whose expected members are distinct, it ignores order while
preserving multiplicity and membership. Same-time
independent callbacks and lists now use it; sequential-time and required
before/after relationships remain explicit.

## Changed tests

- `starts every block in the current column`: the start-time block snapshot and
  blocking list no longer require definition/track order; all three running
  blocks and the complete blocking membership remain required.
- `does not advance while the animation remains after the click wait finishes`:
  the two simultaneous blockers are order-independent.
- `calls onBlockStart once per block`: the three time-0 starts are
  order-independent; `next-line` remains required after all of them.
- `notifies each time boundary before the blocks at that time`: time 0 still
  precedes all time-0 starts, those starts are unordered, and time 1 still
  precedes `next-line`.
- `delivers user skip requests to every running block`: the simultaneous user
  skip deliveries are order-independent.
- `advances when a block honors an automatic cooperative skip`: the simultaneous
  `gate`/`anim` blockers are order-independent.
- `auto-fires when every block in the end-time barrier is cooperative` and
  `auto-fires an automatic skip only once per block`: cooperative skip events
  are order-independent while the length checks still reject duplicate fires.
- `terminates blocks ending at the barrier before advancing`: all three time-0
  terminations remain required, but their order is not.
- `terminates a block completed early only at its end time`: the time-0 and
  time-1 terminations remain exact; the two time-2 terminations are
  order-independent.
- `fails the block when its execution promise rejects`: the same-time failure
  terminations are order-independent.
- `does not complete a block when its skip handler promise resolves`: the three
  simultaneous blockers are order-independent.
- `stops the timeline and terminates running blocks, including the failed one`:
  the same-time termination list and current-column snapshot list are
  order-independent.
- `does not terminate blocks that already completed`: the two simultaneous
  remaining terminations are order-independent.

## Explicit choices

- User-skip delivery was included even though the task names cooperative skips,
  because it asserts the same unspecified same-time callback order.
- The snapshot block lists in the start and failure tests were included because
  their expected order was also exact cross-track same-time order. Membership,
  multiplicity and every block state remain asserted.
- Gap visit ordering and sequential-time loop/time tests were left unchanged.

## Verification

- `pnpm exec vitest run src/core/execution/timeline-runner.test.ts`: 84 passed.
- `pnpm typecheck`: passed.
- `git diff --check`: passed.
