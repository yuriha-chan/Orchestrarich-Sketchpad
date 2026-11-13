# Test review under the TDD guide

Baseline: `93fe57d`. The initial review changed no tests or application code. Lead
reads the tests directly. This record supplements `docs/code-review.md`; it does
not withdraw its supported findings. All 16 current test suites have been read;
the assessment and its limits are recorded below.

## Assessment method and scope

The User clarified: some tests express implicit contracts, some reflect
implementation coincidence, and some require judgment. An exact assertion or a
test of a helper is not inherently wrong. Assess what behavior the public caller
relies on, where its authority comes from, and what production change would cause
the test to fail. Do not automatically weaken assertions to make refactoring easy.

The TDD guide requires functional API tests, boundary/error cases, meaningful
high-level mocks with interaction assertions, and semantic audit of how the
requirements were specialized. Its REFACTOR criteria include parallel models and
incompatible responsibilities. Current green tests cannot prove historical
test-first execution. No claim about all historical RED steps is made here.

Classification:

- **Contract:** explicit requirement or necessary observable API behavior.
- **Implicit/pilot contract:** existing observable policy worth preserving, with
  scope/provenance stated; not automatically a User mandate.
- **Incidental assertion:** restricts implementation without protecting the named
  behavior or an identified dependency.
- **Insufficient witness:** fixture/assertions cannot distinguish an important
  violation from correct behavior.
- **Judgment candidate:** consequences remain unsettled; retain the test while
  recording the issue, and do not repair affected semantics without a decision.

## Inspected suites

Full test-body inspection completed:

- `src/core/execution/timeline-runner.test.ts:1-1875`.
- `src/editor/execution.test.ts:1-1413`.
- `src/editor/block-registry.test.ts:1-248`.
- `src/core/slots/numeric-slots.test.ts:1-221`.
- `src/editor/store.test.ts:1-1242`.
- `src/editor/model.test.ts:1-253`.
- `src/editor/loops.test.ts:1-432`.
- `src/editor/blocks/media-data.test.ts:1-113`.
- `src/editor/slot-gaps.test.ts:1-62`.
- `src/editor/timeline-layout.test.ts:1-305`.
- `src/editor/timeline-rows.test.ts:1-211`.
- `src/editor/stage-geometry.test.ts:1-78`.
- `src/editor/loop-colors.test.ts:1-32`.
- `src/editor/fade-editing.test.ts:1-46`.
- `src/editor/slot-value-rail.test.ts:1-79`.
- `src/editor/slot-wires.test.ts:1-323`.

This covers the source inventory of `*.test.ts` files, not browser interactions,
historical RED execution, mutation-testing results, or all possible program traces.
Claims that a witness cannot distinguish a violation are reasoned from its fixture
and observations; no mutation campaign was performed.

## Runner: substantial functional coverage to preserve

The deferred execution helper (`timeline-runner.test.ts:12-90`) controls Promises
returned through `onBlockStart`; it does not bypass completion with a private
method. This is appropriate API-level dependency control, not an imitation of the
runner. Callback effects are observed through event lists and snapshots.

- Both completion orders (`139-181`) and end-time rather than start-time barriers
  (`454-497`) directly protect design.md 1.1-1.2 and the User's correction.
- Cooperative tests (`628-1024`) cover pending earlier-ending blocks, exclusion
  of later-ending blocks, lone cooperative startup, and one event per execution.
  User verdict: "end <= B.end . implementation is right"; its scope matches these
  predicates. Do not weaken these tests back to a same-end/current-barrier reading.
- Termination (`1027-1153`) distinguishes completion from end-time finalization,
  including early completion and the horizon. Outputs (`1541-1582`) are observed at
  termination, not written by the test block.
- Promise/skip errors and post-failure settlement (`1179-1281,1402-1416`) protect
  managed failure and Promise-only completion. A fulfilled skip Promise is correctly
  distinguished from fulfilled execution.
- Repeated/nested loops, shared ends, and empty tails (`1584-1765`) are functional
  checks of pilot playback. The stale skip-Promise rejection test (`1767-1805`)
  genuinely delivers an old callback while the next iteration runs; retain it.
- Validation tests exercise actual constructor errors, and barrierSpan tests
  (`1483-1539,1866-1874`) include the User's example and loop-marker directive.

### T1 — One late-rejection test never reaches the runner's rejection path

`timeline-runner.test.ts:1283-1307` resolves an execution Promise, flushes it, then
rejects that same Promise. JavaScript ignores the second settlement. The runner
receives no late rejection. Thus the test does not protect its named behavior;
removing a runner late-rejection guard would not be detected by this case.

Keep the legitimate settlement-is-final observation if useful, but do not count
it as runtime callback-isolation coverage. The stale skip-Promise test above is a
real example because execution and skip use different Promises. A repaired test
should deliver an independently pending callback at the relevant public boundary.

### T2 — Runner state update tests check progress, not exact callback traces

At the reviewed baseline, `208-229` required exactly five runner state update
notifications, including three running states at time 0. This fixed incidental
callback counts rather than just observable progress.

User decision: "exact number and sequence of invocations is indeed volatile. so
check for at least on invocation for barrier logic time in order, early-finishing
block and blocking block updates at different timings etc." Use "runner state
update notification", not the obscure term "snapshot notification".

The existing test was adjusted after consultation. Execution Promises settle at
separate timings: animation, sfx, click-wait, then next-line. After each step it
requires at least one newly received update with the corresponding completed,
running and pending states and the exact set of remaining blockers. It observes
logical times 0, 1 and 2 in order and rejects backward progress in this non-loop
fixture, but permits additional invocations. It does not order simultaneous block
starts or modify the runner implementation.

Time-before-start (`299-451`) is not merely incidental: same-time initialization
must precede input reads. Likewise termination-before-next-start is required.
But exact cross-track start/termination order in lists (`232-253,1046-1050`) is
stronger than those partial orders. The User clarified that the specification
does not generally specify execution order (quoted under T3). Such exact traces
must not be treated as a language requirement. Preserve the required partial
orders rather than indiscriminately replacing every list with a set. Exact
notification multiplicity is not a required test contract per the User decision.

The repeat callback checks object identity (`1622-1632`). The session uses a map
keyed by those exact LoopDefinition objects (`execution.ts:115-131,230`). Identity
is therefore an actual current integration dependency, not a gratuitous `toBe`.
If that contract changes, coordinate caller and test rather than only relaxing it.

### T3 — Cleanup depends on actual startup, not a prescribed cross-block order

`1369-1399` fixes A before B during synchronous failure, and requires termination
for B although its start callback never ran. The core's eager running state
produces that cleanup; it conflicts with the session's instance ownership (R1).

User decision: "in that case B's termination should not be called, but generally
the spec does not specify the order of exection. so \"A starting fails -> B does
not terminate\" test is wrong technically".

Thus simply changing the expected termination list to A alone would still bake
in an unspecified startup order. A functional test should relate cleanup to
which executions actually began, without prescribing whether A or B starts
first. An unstarted B must not be terminated; B is not necessarily unstarted
merely because A fails. This lifecycle test and implementation remain unchanged.

`1350-1367` excludes already-completed blocks from failure termination. This has
basis in design.md 2.10's "running blocks" and is not simply a bad test. It does
not establish how a whole container's still-live effect is finalized when its
completed phase awaits a barrier; the session needs its own lifetime coverage.

## Session: functional effects and composition coverage

`execution.test.ts` uses the real runner, registered executions and Stage store.
Fake timers control wall-clock execution; dialogue is completed through the
execution-written confirmation callback (`173-181`), not an external completion
API. These are meaningful integration tests without UI testing.

Strong cases include rectangle lifetime after early completion (`415-459`),
media hold/resume and stable container presentation through barrier waits
(`704-762`), execution identity and independent ownership (`798-840`), slot input
resolution (`875-1074`), preflight rejection before effects (`1076-1152`), and
addition output consumed by a later block (`1164-1264`). Preserve these.

The media subtype assertions (`382-400`) have explicit architectural provenance:
User: "media handling (intialize/fade/terminate) should not be hardcoded on
branches. it should be sub type of execution." Do not reject `instanceof` here
merely because it is structural. Initial timer count 3 is a narrower scaffold
choice; zero owned timers after disposal matters more than the initial count.

### T4 — Session coverage misses important composition boundaries

- No session factory/start failure case or independently queued settlement after
  disposal; `786-796` observes only immediate cleanup. R1/R2 have diagnostic
  reproduction recipes in code-review.md, but no permanent regression test.
- Addition's end-time test (`1232-1264`) has only a reader at the end; the pump
  immediately reaches that time after instant completion. It does not detect
  assigning outputs prematurely on completion. A prior value plus an inside-span
  reader gated at an intermediate barrier would distinguish the two semantics.
  Static rejection of an uninitialized inside-span reader (`1266-1294`) is useful
  but does not supply that runtime witness.
- Gap execution tests (`1346-1413`) exercise one loop. `[2,2,2]` does not by itself
  distinguish reinitialization each iteration from initialization once followed
  by persistence. The `[1,5,5]` companion usefully detects an outside-start reset.
  Add an intervening write to distinguish repeated initialization, then test
  nested/touching contexts and output-versus-initialization boundary order.
- Preflight covers missing, empty, late and wrong-track reads plus wrong-track
  writes; missing output target is not covered at the session boundary.
- Beat duration integration is exercised at 120 BPM; the 240 BPM case uses
  seconds. A beat-valued block at another BPM is needed to catch a session that
  ignores its BPM argument. Synced-length execution also has no focused case here.
- The synthetic non-media multi-phase case (`296-315`) demonstrates lowering
  independently of media; it does not exercise non-media phase execution through
  TimelineSession. Keep its narrower claim, rather than count it as end-to-end
  registry extensibility coverage.

The placement fixture (`21-117`) repeats closed-kind defaults. Fixtures may name
kinds, but these defaults can drift from registered createData and make extension
work require editing the test factory. Prefer production defaults plus explicit
test overrides where testing defaults is not the objective. Do not confuse this
fixture concern with R5's copied edit algorithms.

## Registry: contract checks plus several insufficient or over-narrow witnesses

- Default data, carry-over, length changes, section grouping and derived ports
  exercise public definition operations. Their exact values often encode useful
  current policies; do not discard them as internal-structure tests wholesale.
- The exact builtin-kind list (`block-registry.test.ts:29-37`) fixes the palette
  inventory/order, not the extension mechanism. It may be useful product policy;
  it is not proof that adding a new module requires no generic consumer changes.
- `216-223`, titled "keeps the block section for blocks without panel fields",
  never supplies empty fields: camera has duration and dialogue has a note. An
  implementation dropping an actually empty Block section still passes.
- `225-231` asserts the flattened section groups equal declaration order. Current
  modules already declare grouped fields, so it does not test grouping interleaved
  declarations. The necessary contract is section order plus order within a
  section and exactly-once membership, not necessarily global declaration order.
- `141-149` requires optional carryOver hooks to be absent for dialogue/addition.
  An explicit hook returning an empty carry has the same conversion semantics;
  function absence is not shown to matter to callers. This is a likely incidental
  assertion; behavior tests should carry the policy.
- `106-121` converts fades 1/2 to a target length 2 and expects them unchanged.
  The real store converts a placement without changing its length. This fixture
  goes outside that trusted same-span conversion context; do not infer from it
  either that invalid fades are valid authored data or that internal defensive
  validation must be added. Make the fixture respect the real caller's contract.
- There is no permanent type-negative test for R4 or functional exercise of a
  fresh test definition through the generic field/consumer contracts. Runtime
  assertions that hooks exist do not establish that data and hooks are compatible.

## Store: genuine command tests coexist with test-owned domain edits

`store.test.ts` drives the actual Zustand store and reads its observable document
state. Using `setState` for fixture setup does not make these tests internal-state
tests: the store's exposed state is its API. No dependency mock replaces the store.

Retain the functional coverage:

- Creation and initialization (`181-297`), binding/accessibility/unbinding
  (`299-397`), rename/removal (`413-489`), and clearing (`491-550`) exercise real
  commands. Keeping broken references on slot removal is an established authoring
  policy, not an incidental memory layout. The validation checks compose real
  `slotReads` and core validation with those edits.
- Track editing/duplication/removal (`552-721`) checks placement order, distinct
  identities, local-slot remapping, shared-slot preservation and selection. These
  are useful observable policies. Specific generated id strings are not asserted.
- Block duplication (`821-905`) genuinely tests next-space placement, copying,
  selection, binding preservation and independent editing of the copy. Supplying
  arbitrary data through `editBlockData` is legitimate setup for a copy test, even
  when its helper is not a legitimate production property-edit regression test.
- Loop authoring (`907-1088`) protects nesting, absorption/release, block boundary
  restrictions and duplication around loops. Allowing authored containing blocks
  is correct; pilot execution rejects them separately. Do not unify those distinct
  contracts by weakening either test set.
- Gap-keyed initialization (`1090-1168`) checks same-boundary distinct contexts,
  per-gap deletion, rejection of an absent context and retention after a loop edit.
  Kind conversions (`1170-1242`) exercise real source carry/target conversion and
  loss of kind-private data through the store.

### T5 — Identify exactly what the copied helpers do and do not cover

The test-owned algorithms are at `68-168`. RGB behavior assertions (`730-751`) and
addition input edits (`781-792`) directly test those algorithms, not the registered
field commits. The unit-change/slot-preservation test (`399-410`) also bypasses the
production rectangle unit control. It cannot catch that control mutating slots.
The principle it names is important: the User explicitly said a slot is an
expression yielding a literal property input; conversions must not mutate slots.
Preserve that regression objective while moving its operation to the production
command boundary.

The duration helper at `113-125` is used to prepare or edit copied data in
duplication tests (`841-853,889-904`); those tests still provide real duplication
coverage. `setDurationUnit` (`127-140`) and `setSyncBeatsToCellSpan` (`142-153`) are
unused. There are no current store duration-unit/sync behavior suites to credit or
discredit. The earlier broad description of such suites in R5 was too wide.

Repair locations: production rectangle commits `blocks/rectangle.tsx:142-167`,
duration/unit/sync operations `blocks/panel-widgets.tsx:80-98,113-122,153-164`.
Use registered field operations, or shared typed operations actually called by
the widgets. Delete test-owned edit algorithms, not the useful store-copy tests.
No UI test or restoration of per-kind store setters is required.

### T6 — Store command coverage does not yet protect atomic span/data changes

No permanent test invokes `setSpan`. Loop tests invoke `resize` only for a rejected
loop crossing (`1073-1079`), and `move` only for a rejected crossing (`1065-1071`).
There is no functional store witness for a successful span edit coordinating
geometry with synced duration/fade clamping, or for preserving all data after a
rejected compound span edit. Helper length-change tests cover their own results,
not their wiring into the store. These are gaps, not evidence those store paths
currently fail; R3's confirmed lost fade pair is a separate command-composition bug.

Track removal tests do not exercise removing the final track. Slot initialization
tests cover negative/fractional boundaries, but not the command's nonfinite-value
rejection. Add these only at the real command boundary; do not add defensive
validation inside trusted data helpers merely to satisfy an imagined error matrix.

Two names should be narrowed without changing semantics: `1124-1133` says it
rejects an invalid path but supplies a valid path and expects acceptance; the
following `1135-1142` really tests rejection. `1208-1215` says it keeps an
addition's data, but starts with wait and checks addition defaults. Neither is a
reason to discard the useful acceptance/default assertions.

## Slot validation and orphan filtering: sound focused APIs, bounded guarantees

`numeric-slots.test.ts:23-153` checks exact-boundary availability, reads between
substitutions, missing/empty slots, local/shared access and invalid-read reporting.
`155-220` checks producer-end availability, read-before-output rejection, slot-id
separation and write accessibility. These are functional tests of validation, not
tests proving execution has performed a write. Exact returned invalid-read order
is useful diagnostic behavior of this filtering API, unlike an arbitrary order
of independent runtime callbacks. No change is proposed.

The validator assumes its slots are live and writes represent supplied producers;
it does not execute the loop tree or validate each producer's inputs. Do not claim
these tests establish runtime gap frequency or transitive producer readiness.
`slot-gaps.test.ts:15-61` covers the separate pruning boundary, including a nested
context and a disappeared loop. Keeping orphaned initializations in authored data
is intentional. A useful extra witness would assert the input document remains
unchanged after pruning, and compose pruning with validation so an orphan alone
cannot satisfy a read. The current isolated tests do not demonstrate that full
preflight path; this is a coverage recommendation, not a fresh semantic question.

## Loops and placement: structural outputs are the public contract

The loop tree was explicitly requested as an AST. Exact `LoopNode` trees in
`loops.test.ts` therefore are not forbidden internal-structure assertions. They
protect the API output: nesting and equal-span insertion (`38-103`), promotion on
removal (`105-126`), re-span with absorption/release and round trip (`128-222`),
well-formedness (`224-248`), traversal/depth (`250-271`), closure over crossing
blocks (`346-368`), and loop-aware block anchors (`370-417`). The no-mutation case
(`97-102`) protects pure command behavior. Preserve these tests.

`boundaryGapPaths` (`273-344`) is especially important: exact ordered paths encode
the settled User diagram, including touching loops and three nested simultaneous
starts/ends. Do not weaken these arrays to sets or rediscover gap semantics from
test outcomes. They are the unit-level derivation oracle; the missing runtime
composition cases are in T4, not an absence of derivation coverage.

The name at `140-144`, "rejects a change that leaves a child outside", is too
broad: both fixtures cut a child. Fully clearing a child releases it, explicitly
tested at `179-212`. Similarly `146-149` rejects a partial sibling cut, not all
sibling overlap. Tighten the names when editing tests; do not restore the rejected
immovable-child policy. Escaping the parent (`214-217`) remains a separate existing
command policy; these tests do not establish arbitrary tree reparenting.

`model.test.ts` checks interval adjacency/overlap (`28-40`), track-specific placement
and unbounded horizontal time (`42-101`), the authored loop span rule (`103-169`),
duration units/BPM (`171-190`) and first-free duplication (`192-253`). The expected
numbers are legitimate API outputs, not copies of a search implementation. Unit
duration coverage at 60/90 BPM does not replace the missing non-120-BPM session
integration witness. Fractional placement inputs are not directly covered by this
suite; malformed spans are tested at other boundaries, which is not the same as
testing this command's rejection behavior.

## Geometry, rails and wires: precise coordinates can be meaningful contracts

- `timeline-layout.test.ts:35-139` exercises the explicit sequence, accumulated
  positions, trailing gap and contiguous runs. `141-170` protects the containing-
  cell hit-test API, including clamping; `172-214` checks distinct marker transitions;
  `216-288` checks block/loop gap anchors; `290-305` checks the barrier rectangle.
  Exact pixels are appropriate for this geometry API. Some fixtures supply paths
  directly to isolate geometry; they do not test loop derivation. Additional
  composition with the real `boundaryGapPaths` would protect wiring, without
  replacing either focused suite. The `cellAtX` last-cell clamp is correct for a
  cell query; using it for a boundary drag is the caller mismatch in code-review.md,
  not evidence that these tests assert the wrong cell behavior.
- `timeline-rows.test.ts:30-87` preserves track/local/shared grouping; `98-154`
  protects index-based lookup; `159-210` exercises real mixed-height coordinates
  and tie handling. Track order and half-height slots are deliberate UI policies.
  Earlier-track tie breaking is a reasonable current gesture contract, not a
  reason for User interruption. `nearestTrackRow` is index-based, while `trackAtY`
  is pixel-based; testing both does not alone prove duplicate responsibility.
- `stage-geometry.test.ts:7-77` uses the User's grid formula at exact, wider and
  taller viewports, a configurable grid, span/pixel coordinates and conversion.
  These expected values are geometric oracles. They do not verify ResizeObserver,
  actual rendered letterboxing or the production unit-toggle event path. Do not
  count them as browser coverage or demand invalid internal dimensions without
  changing the contract of this trusted helper.
- `slot-value-rail.test.ts:8-78` checks persistence to rendered width, split anchors,
  gap dots, sorting and clipping. It deliberately accepts already-resolved anchors;
  no test here proves that App builds the correct anchors from initializations
  and assignments. Earlier time-based assignment cases were replaced by this
  x-based API. Preserve the helper tests, but add a functional composition witness
  when that anchor-building responsibility is extracted or changed.
- `slot-wires.test.ts:62-216` checks per-parameter lanes (including unbound reserves
  and same-slot separate wires), per-column allocation and missing-row omission.
  `219-322` checks output direction, assignment-end geometry, loop-extended right
  edges and nonexistent rows. Parameter order has explicit User provenance:
  "assign lane to parameter according to the total number of block parameters".
  Exact numbers protect this visual policy; they are not automatically incidental.
  Some fixtures intentionally bypass accessibility/complete block data to test a
  projection. Do not infer from them that invalid local bindings are executable.
  This suite does not test CSS paint order, white casing, dot size or alpha masks.
  Those remain User visual judgments, not tests secretly performed here.

## Media/fade helpers: useful local coverage, missing production edit composition

`blocks/media-data.test.ts:11-113` checks clamp policy, omitted zero-length phases,
shared/internal boundaries and length-change effects. The overlong-fade fixture
at `97-112` can represent old valid data being resized from a larger span; the API
receives the target length, not the old one. This differs from the unsupported
same-span conversion fixture identified in the registry review.

`fade-editing.test.ts:5-35` checks noncrossing drags, removals and shared redistribution
through the real helper. Those are good functional helper tests. They cannot
protect the App's subsequent two-setter application of the pair: R3 demonstrates
the helper returns the right pair and production composition destroys it. Test
the production atomic operation once its contract is selected; do not duplicate
the helper algorithm in a UI test.

The dot mask test (`38-45`) has explicit linear-radii provenance and samples its
public SVG output. It is not an irrelevant implementation test. Its string matching
also fixes attribute formatting/three-decimal serialization, narrower than the
visible pattern requirement. If serialization changes, preserve numeric center/
radius checks rather than rewriting linearity expectations. It does not prove
that the renderer applies the SVG as an alpha mask instead of an overlay.

`loop-colors.test.ts:4-31` preserves a fixed depth palette, clamping and shared hue
across returned tokens. The User requested gradual depth color, not these exact
hue numbers or HSL serialization. Those are narrower existing presentation policy;
they may be deliberately changed with the palette, not treated as language rules.
No need to ask the User merely to retain current choices during this review.

## TDD and maintainability synthesis

- Most tests exercise actual public commands, pure transformations or runtime
  composition. A returned tree/coordinate object is an API result, not necessarily
  an internal structure. Broad weakening would destroy real contract protection.
- The main responsibility mismatch in tests is R5/T5: test-owned edit algorithms
  stand in for production module/widget operations. Helper-only fade success and
  geometry tests leave their caller composition untested (R3/R7); green counts
  must not be used as evidence those relationships are sound.
- The suite uses real store/registry/runner/Stage composition, captured Promise
  resolvers and fake wall-clock timers. These are appropriate high-level control
  boundaries. Callback interactions are asserted. No broad module-mocking system
  needs replacement. Exact traces need individual review under T2, not a blanket
  weaker matcher policy.
- Prioritize regression witnesses for lifecycle failures/disposal, original-
  container preflight, atomic fade edits and typed field compatibility (R1-R4/R6).
  Then strengthen output timing, gap re-entry and generic-definition integration.
  Keep meaningful lower-level tests; they complement rather than replace these
  composition boundaries. Type-negative tests should target the packed registry
  contract selected for R4, not force a closed builtin-kind model.
- No historical test-first claim follows from 419 green tests. The six removed
  diagnostic probes asserted observations of defects and are not permanent TDD
  regression examples. No permanent test was added, weakened or removed here.

## Consultation decisions and remaining repair boundaries

The User resolved T3: unstarted peers receive no termination, but tests must not
prescribe unspecified cross-block execution order. The User also resolved T2:
runner state update notifications must expose ordered barrier progress and updates
at distinct completion timings, not an exact invocation count or sequence. Only
that state update test has been adjusted. Existing integration dependencies should
be identified, not assumed irrelevant.

Routine fixture/name/coverage corrections can be distinguished from policy changes in a
later authorized repair plan. This review has selected no cancellation API, typed
registry packaging, phase anchor semantics, or gap execution redesign.

## Verification

Final review-only baseline verification passed:

- `pnpm typecheck`.
- `pnpm test`: 419 tests across 16 files.
- `pnpm build`.
- `git diff --check`.

`git status --short` reports the modified `docs/consultations.md`, the three
untracked review documents, and the pre-existing unrelated `.opencode/` directory.
The targeted diff of `src`, demos, package/lock files and configuration is empty.
Application and permanent test files were unchanged at that review-only checkpoint.
The subsequent User-authorized change is limited to the runner state update test
described under T2. No runtime repair or commit was made. No browser/UI test or
ESLint run is claimed; ESLint is not configured.

Verification after the authorized T2 test adjustment also passed: the runner's
70 tests, full suite 419/419 across 16 files, `pnpm typecheck`, `pnpm build`, and
`git diff --check`. No application source changed and no commit was made.
