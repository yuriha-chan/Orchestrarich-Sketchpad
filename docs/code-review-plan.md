# Structural and semantic review

## Scope

Review the entire current codebase against the TDD skill's REFACTOR rules and
delegation guidance, not merely the latest commit. This is a review, not
authorization to change application behavior or implement refactors. The initial
review left application code and tests unchanged; the follow-up scope is below.

The governing goal is that a block module plus one registry entry defines a block
and its panel interactions, without block-kind branches in generic consumers.
Other governing constraints are execution-owned presentation, Promise-only
completion, runtime-owned output assignment, and contract/type-based safety.

## Method

1. Establish repository state and read the registry contracts and design records.
2. Lead reviews runtime, type contracts, UI/store responsibilities, tests, and
   semantic conclusions directly. No subagent supplies review judgments or
   contract audits. Explore may be used only for bounded, simple fact lookups.
3. Look for parallel abstractions, duplicated responsibility, incompatible models,
   implicit specializations of requirements, and tests tied to incidental choices.
4. Run type checking, the full test suite, and the build. No UI testing. ESLint is
   not configured; do not introduce tooling for this review.
5. Report evidence, severity, affected contracts, and whether a proposed remedy is
   locally established or needs User consultation. Do not change implementation.

## Evidence

Use exact source references and small temporary probes when needed. Probes observe
implementation behavior under established semantics; they do not establish the
meaning of requirements. Remove temporary probe tests after recording results.

Keep acknowledged pilot limitations separate from defects. Accepted semantics
include `end <= B.end` cooperative skip, stored duration units, instant addition
with assignment at termination, three iterations, and rejection of loop-containing
blocks during pilot playback.

## Review status

The runtime, slot-flow, definition/edit-contract, and UI/geometry inspections
produced the assessment in `docs/code-review.md`. The initial selective test reading
did not complete the requested TDD-guided assessment; its earlier completion claim
was unsupported. The subsequent dedicated pass personally read all 16 current
test suites. Its inventory, locatable assessments and limits are in
`docs/test-review.md`.

The maintainability assessment was added after the User corrected the defect-led
framing. It distinguishes observed ownership/change paths from proposed design
directions; those directions are not approved architectures.

Temporary probes were removed. Application code and permanent tests are unchanged.
Review artifacts are this plan, `docs/code-review.md`, `docs/test-review.md`, and
the candidate entries in `docs/consultations.md`. No commit was requested. Lead
reviewed the written conclusions first, then the User authorized careful
continuation: some tests encode implicit contracts, others incidental choices or
gray areas requiring User judgment. The assessment preserves those distinctions;
it does not select repair semantics or authorize implementation changes.

Final review-only verification after the dedicated assessment passed typecheck,
419 tests across 16 suites, build and diff checking. Status confirms only the
listed review artifacts and the unrelated `.opencode/`; the targeted application,
test, demo and configuration diff is empty. No repair or commit was made.

## Follow-up scope after consultation

The User clarified that unstarted blocks receive no termination, but the tests
must not prescribe unspecified cross-block execution order. That lifecycle test
and runtime remain unchanged pending a bounded repair.

The User authorized replacing the volatile exact invocation trace in the runner
state update notification test with checks for ordered barrier logical-time
progress and separately timed completion/blocking updates. Only that existing
test is adjusted; no application behavior or other tests are changed. Decisions
and test details are recorded in `docs/test-review.md` T2/T3 and the consultation
ledger. No commit requested.
