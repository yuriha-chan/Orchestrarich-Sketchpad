# Phase A: execution lifecycle

## Contract

- A due block enters running immediately before its start callback is invoked.
  Other due blocks have not started yet and remain pending. No same-time ordering
  is promised. Startup failure stops further starts; termination applies only to
  callbacks that were invoked, including the failing callback.
- Session allocation precedes phase startup. While a factory is executing, its
  record explicitly represents allocation in progress; if allocation throws,
  there is no returned instance to finalize. Once returned, the instance is owned
  by the session before its phase starts. A phase-start throw finalizes that
  allocated instance through managed failure.
- A completed phase and a finalized container are different. Failure finalizes
  every still-owned container, including one whose phase already completed but
  whose end barrier has not cleared. Normal finalization stays at container end.
- Disposal revokes runner execution before releasing session instances. Promise
  settlements and pending skip callbacks thereafter do no work. Disposal is
  resource release, not success or failure: it does not change the last runner
  snapshot into a new terminal phase. Starting a disposed runner is invalid;
  repeated disposal is harmless. No post-disposal notifications or output writes.
- Existing generation isolation across loop iterations is retained.

## Senior Programmer delegation: regression tests only

Read `docs/code-review.md` R1/R2 and `docs/test-review.md` T1/T3 for exact
reproduction locations. Modify only the existing runner and session test files;
do not change application code. Lead implements the critical repair.

Write functional desired-behavior tests and run them to observe RED:

1. Correct the runner startup-failure test so it asserts termination against
   actually invoked starts, not an assumed cross-track order. Include the failed
   start itself, exclude pending/unstarted peers. Do not prescribe A-before-B.
2. Session factory throw and phase-start throw must produce managed failed state
   without throwing a secondary TypeError. Spy at registered factory/instance
   public lifecycle methods with restoration after each test, or use a bounded
   test definition if supported. Do not invent a parallel block registry.
3. Start a real instant addition then dispose synchronously before Promise
   reactions run. After flushing, no progress/notifications/finalization/output
   assignment/new starts may occur; disposal removes owned effects once. Also
   exercise an independently pending skip rejection after disposal if practical.
   Observe continuation rejection explicitly if necessary to avoid unhandled
   rejection artifacts; never assert the current TypeError as desired behavior.
4. Failure while another container has a completed phase but is waiting at a
   barrier removes its still-owned presentation exactly once. Use actual stage
   effects and public session APIs.
5. Replace T1's resolve-then-reject-the-same-Promise witness with an independent
   pending skip rejection delivered after completion, preserving real stale-loop
   rejection coverage.

Use existing deferred/fake-timer helpers and real registry/session composition.
Do not require exact update counts or cross-track total order. No UI tests.
Do not duplicate production domain algorithms in test helpers. Bound new fixture
code to lifecycle needs. Report changed tests, exact RED output, any test that is
already green, and any unresolved contract issue. Do not commit.

Lead will add focused runner-disposal tests when introducing its public resource
release operation. For this delegation the session's existing dispose API is
sufficient; do not add a failing type-level call to a nonexistent runner method.

## Independent consultation checkpoint: phase closure

### Original context

User: "in that case B's termination should not be called, but generally the spec
does not specify the order of exection. so \"A starting fails -> B does not
terminate\" test is wrong technically".

User: "I only allow designing safety by setting up a proper contract" and
"fix all, use typing wisely".

User approved the schedule and instructed: "1 utilize Senior Programmar subagent
extensively to keep main context clean 2 commit after Phase completion 3 you can
continue to next phase without permission. If you are not confident to close the
phase consult to Counsel."

### Current work and observed situation

Phase A aligns actual startup with cleanup and revokes execution on disposal.
The desired regression tests first reproduced unstarted-peer termination,
secondary factory/phase failure TypeErrors, post-disposal queued callbacks,
backward loop movement after disposal in a callback, and phase startup after
disposal in an allocation observer. Lead repaired source; Senior Programmer
wrote tests. No new terminal phase is introduced. The runner exposes disposal
separately from its frozen historical state; the session releases its effects.

### Relevant evidence and changes

`src/core/execution/timeline-runner.ts`: each due block becomes running at its
own start callback, disposal disables further pumping/settlement/notifications,
including callback re-entry. Existing loop generations remain unchanged.
`src/editor/execution.ts`: explicit allocating/active records distinguish a
throwing factory (no instance returned) from an allocated instance whose phase
throws. The latter receives phase cleanup and container finalization; remaining
owned containers are finalized on failure. Disposal revokes the runner before
releasing instances. No optional missing-instance cleanup fallback was added.

### Current understanding and question

These are ordinary lifecycle repairs under the approved schedule and preserve
Promise-only completion, output timing, media lifetime, and unspecified same-time
order. A throwing factory cannot hand ownership of an instance it never returned
to the session; constructor-internal resources must therefore be exception-safe
within that factory. This is a responsibility boundary, not a new promise that
the runtime can undo arbitrary partial constructor effects.

Is there a consequential User judgment being implicitly made at closure, given
these boundaries? This checkpoint is not a request to review implementation or
select an internal cancellation mechanism. No specific unresolved behavior
question has been identified by Lead. A concern requiring User choice would stop
the affected work; do not decide preferences on the User's behalf.

### Blocking status

Closure and commit await this checkpoint and final verification; no additional
scope is authorized by test success.

## Completion record

Counsel identified no necessary User question at the checkpoint. Disposal's
historical-state behavior is a selected preservation contract, not a verbatim
User instruction; factory ownership does not imply arbitrary constructor rollback.

Senior Programmer added desired functional regressions before implementation and
observed the original secondary TypeErrors, unstarted-peer termination, queued
settlement/skip work, and callback-reentry failures. Lead implemented the source
repair and reviewed the tests for unspecified ordering. The existing startup
failure test compares termination multiplicities to actually invoked starts. The
old resolve-then-reject-same-Promise test now uses an independently pending skip
Promise. Existing stale-loop-generation tests remain intact.

Runner disposal is explicit resource lifetime (`isDisposed`), separate from the
last execution snapshot. All asynchronous settlements and synchronous callback
continuations respect it. Session disposal revokes the runner before finalizing
allocated instances. Allocating versus active records represent factory ownership
without treating a missing instance as an optional cleanup case. Later phases
require the existing active allocation; factory failure never starts them.

Verification: `pnpm typecheck`, all 430 tests in 16 suites, `pnpm build`, all four
`pnpm demo:1a*` scripts, and `git diff --check` passed. No browser test was run.
No language units, output timing, gap semantics, or phase timing were changed.
