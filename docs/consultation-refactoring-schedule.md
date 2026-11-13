# Consultation: repair and refactoring schedule

## Original context

The User requested a schedule, not implementation:

> OK. so there are many things to do. Spotted bugs, M1-M4, remaining test updates, and block module relocation and isolation, and unit property. How do you plan and schedule the task?

Prior architecture discussion:

> ok commit. I audit M1-M5 review. Still I have a question - why blocks are under editor directory? I think the now the interface is its specs (for panel generation) and rendering targets. So I think it can be moved to core (or newly created lib). What do you think?

Lead recommended sibling `src/blocks/`, pure contracts in `core/`, editor as a
consumer, with no direct block dependency on its concrete store. No move occurred.

> OK. Also considering M1-M4, I think beats/seconds and spans/pixels should be largely a property of input entry. How do you think.

Lead distinguished authored unit-bearing input semantics from widget-local view
state, suggested generated panels and shared input operations, and retained slot
expressions, stored units and reactive span geometry. The latest User request
begins "OK"; this supports the direction, not a particular typed API.

Established extension goal:

> writing blocks/(block-name).ts and adding a line in builtin-blocks.ts must be sufficient to define a new block with panel interactions. No type branch.

Established lifecycle and testing decisions:

> in that case B's termination should not be called, but generally the spec does not specify the order of exection. so "A starting fails -> B does not terminate" test is wrong technically

Context: same-time A/B, where A throws before B's start callback. Cleanup follows
actual startup, not a prescribed A-before-B order.

> exact number and sequence of invocations is indeed volatile. so check for at least on invocation for barrier logic time in order, early-finishing block and blocking block updates at different timings etc.

Context: runner state update notifications. That existing test was adjusted and
committed; no runtime repair was authorized by it.

## Current work

Planning only, baseline `d5c5315`. Proposed schedule is
`docs/refactoring-schedule.md`. Order: A lifecycle R1/R2; B bounded R3/R6/UI repairs
and missing baseline witnesses; C M1/M4 typed inputs/units/domain edits R4/R5;
D M2/M3 phase/edit/layout R7; E relocation/isolation; F residual test corrections.
Tests accompany each increment. M5 traversal redesign and new language features
are excluded. No source/test changes are proposed in this planning turn.

## Observed situation and relevant evidence

`docs/code-review.md` and `docs/test-review.md` contain Lead's completed assessment
and exact repair locations. They are evidence records, not approved remedies.

- R1/R2 are public-session reproductions: factory/start failure can terminate
  unallocated instances; disposal releases instances but queued settlements still
  pump the runner. Lifecycle/cancellation API is not selected.
- R3's shared fade pair is computed correctly then corrupted by two clamping
  setters. Rejected outward span expansion was explicitly ruled out as a bug.
- R6 phase lowering hides a containing container from pilot run validation.
- R4 typed field declarations permit duration/fades on unsupported data; R5 some
  tests implement their own property edit algorithms.
- M1/M4 concern disconnected input reading and widget-owned domain operations.
  M2/M3 concern independently maintained phase projections and host-owned fades.
- R7 proportional media geometry ignores variable gap runs. Exact phase anchor
  within a multi-gap run is not specified in the reviewed sources.
- `stack.md:1-5` requires pure framework-independent model/verifier/engine.
  Current block definitions reference React/Lucide; rectangle custom field and
  widgets import the editor store. Simple relocation to core would violate this.
- User confirmed stored duration units and slot expressions; no decision to
  change rectangle's current grouped units to individual per-property units.

## Candidate questions

This is an independent consultation checkpoint, not a request to solve the code
or choose architecture. Does the schedule conceal a consequential User decision
or an unapproved scope change? Are its lifecycle/input/phase-anchor gates enough
to distinguish settled behavior from unselected implementation contracts? Is
anything in the plan unnecessarily treated as requiring User judgment?

Do not design a cancellation API, typed registry implementation or replacement
phase model. Do not review source or spawn subagents; the package bounds the
consultation. Report only consultation needs/omissions, with reasons.

## Proposed changes and current understanding

Only planning documents and a consultation-ledger pointer. Repair correctness
before broad contract changes; use shared production operations rather than
parallel fixes; physically relocate after responsibilities stabilize, separately
from behavior. Preserve self-contained block extension and pure-core direction.
No new persistence, audio, typed slot system, ownership checker or per-phase skip
UI is included. Existing pilot limitations remain.

## Blocking status

All implementation awaits User approval of a schedule. A, C and D also require
bounded contract proposals when reached; planning and unrelated established work
need not wait for every later decision. This checkpoint must not authorize an
implementation or silently answer unsettled semantics.

## Lead response to checkpoint

Counsel distinguished a behavioral decision from approval of internal design.
The schedule has been adjusted accordingly: internal cancellation and typed
registry choices remain Lead responsibilities, not automatic User questionnaires.
Only a necessary public disposal/stop-state change requires a concrete question.
The input design is written before its first validation slice, not retroactively
after migration has committed to it. Existing units/grouping are preserved; no
new unit-policy question is presently identified.

The R7 anchor issue is visual/interactive, not missing loop-gap semantics, and
blocks only anchor-dependent work. Existing conventions must be checked before
asking; absent one, show a concrete example rather than ask for a type/API design.

Requirement provenance was checked against `design.md:95-99,173-178`,
`loop-execution.md:5-34`, `slots.md:65-89` and the recorded direct User corrections
in `code-review.md` and `consultations.md`. The schedule now separates explicit
requirements, current preservation baselines and a documented pilot limitation.
This does not reopen their semantics or convert missing quotations in this
package into questions already answered by the User.

No further up-front behavioral question was established. Approval requested is
scope/sequence and bounded execution under existing contracts, not permission to
choose unsettled public behavior later without consultation.
