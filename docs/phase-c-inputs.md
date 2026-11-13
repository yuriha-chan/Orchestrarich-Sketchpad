# Phase C: connected inputs and production edits

## Contract and sequence

The approved schedule preserves authored values, stored units, slot expressions,
output assignment at end termination, and module-plus-registration extensibility.
This is not permission to add units, per-coordinate unit selection, or new slots.

1. A numeric input declaration owns its key, literal accessor, edit operation,
   panel metadata, and literal-or-slot resolution. Execution uses the declaration
   rather than repeating the binding key and accessor. An output declaration
   owns both the binding key and construction of the resolved output record.
2. Typed block specifications remain checked in their own data/presentation types.
   Packing a heterogeneous registry is the one deliberate type-erasure boundary;
   generic consumers use unknown, not an unchecked any default. Packing preserves
   the association between data and the operations supplied by its definition.
   Imported document data still requires boundary validation in a future I/O task.
3. Structured entries (duration, fades, spatial unit groups) must carry typed
   access/edit operations. A tag must not authorize a widget to assume the block
   data has a particular shape. Editing context supplies length, BPM and measured
   stage scale. Widgets invoke operations; they do not implement conversion,
   synchronization or fade clamping.
4. Duration and rectangle-unit policies remain unchanged: beats follow BPM,
   seconds are absolute, spans remain resize-responsive, pixel geometry is
   absolute, rectangle units stay grouped, and conversion never changes slots.
   Sync-to-span is a relationship, not a unit. Runtime does not eagerly turn span
   geometry into pixels.

The first slice connects Addition inputs/outputs and validates a fresh definition
through packing, generated field grouping, production edits and Promise execution.
Subsequent slices migrate structured time/spatial entries and remaining builtins,
then replace copied test algorithms with actual production operations. Phase D
retains ownership of broader timeline gestures/phase structure; Phase F retains
physical relocation and the runtime-only dependency proof.

## C1 delegation: numeric declaration tests

Owner: Senior Programmer. Read this document and the existing block definition,
registry test and Addition module. Do not select a different architecture.

Only edit `src/editor/block-registry.test.ts` and create the minimal throwing
skeleton `src/editor/block-inputs.ts`. No application implementation, no commit.

API to test:

- `numberInput<T>(spec)` accepts a `NumberPanelField<T>` whose section is input
  and slot is true. Returns that declaration plus
  `resolve(block: Placement<T>, readSlot: (id: string) => number): number`.
  It uses the declared key to read a bound slot, otherwise the declared accessor.
  Slot values are expressions: do not clamp or write their results in resolution.
- `numberOutput<T>(spec)` accepts an `OutputPanelField<T>` and returns it plus
  `emit(value: number): BlockOutputs`, using the declaration's key.
- The same returned objects are fields: `panelSections` and
  `deriveSlotProperties` consume them without a second declaration list.

Tests must use fresh data with different property names than binding keys. Test
literal zero/negative values, bound zero/negative values, correct read calls and
no reads for literal inputs; commit via the actual returned operation, without
copying it in a test helper. Output key must be non-`out` in a fresh fixture.
Include type-negative accessor/commit input mismatches using `@ts-expect-error`
in a never-invoked function (typecheck verifies it, runtime does not execute it).
Observe genuine RED using `pnpm vitest run src/editor/block-registry.test.ts`.
Report exact failures and files. Lead will implement helpers, migrate Addition,
and add packing/real execution composition before expanding migration.

## Verification

Each slice: focused tests, `pnpm typecheck`, `pnpm test`, `pnpm build`,
`git diff --check`, and Lead semantic audit. No browser testing. Commit only at
Phase C completion, as requested by the User.

## C2 time-entry RED delegation

Owner: Senior Programmer. Only edit `src/editor/blocks/duration-data.ts` with
minimal throwing skeletons and `src/editor/store.test.ts` with tests. Preserve
existing exports and behavior; no other edits or commit.

Add exported `editDuration<T extends DurationData>(data: T, edit: DurationEdit,
context: { length: number; bpm: number }): T`. `DurationEdit` is the union
`{kind: "value"; value: number}`, `{kind: "unit"; unit: DurationUnit}`,
`{kind: "sync"; enabled: boolean}`. Later the registered field and widget will
invoke this operation directly. Behavior is the existing DurationFields policy:
finite positive value accepted unless synced; changing unit converts the stored
value at BPM unless synced; same unit is a no-op; enabling sync sets beats and
duration=length; disabling retains stored beats/span value. Never modify other
data. No internal data-shape validation.

Write functional tests in existing store suite using this actual operation via
`editBlockData` and real created timed blocks. Cover beats/seconds conversion at
90 BPM, zero/negative/nonfinite entry rejection, sync enabling/disabling and
blocked value/unit edits while synced. Do not introduce copied test edit helpers.
Tests must show stored values, unit and unrelated fields preserved. Observe RED
with `pnpm vitest run src/editor/store.test.ts` and typecheck. Report precise RED.

## Typed structured fields and packing

`EntryContext` is `{ length, bpm, stageSpan }`, supplied by the generic inspector.
Duration fields require `read(data, context)` returning value/unit/synced/limits,
and `commit(data, DurationEdit, context)`. Fade fields require `read(data)` returning
the pair and `commit(data, FadeEdit, context)`; FadeEdit selects one fade or the
whole pair. Shared typed constructors require their data capability explicitly.
Neither field is just a tag. Number/color operations retain their typed accessors.

Packing takes `BlockDefinitionSpec<T,S>` and returns `BlockDefinition<unknown,
unknown>` with slot properties derived from fields. Only the packing function
asserts the erased data association, after typed module construction. Consumers
must not cast data to duration/media/rectangle. Generic panel functions can keep
their type parameter; heterogeneous lookup returns packed unknown. Stage payloads
follow the same packing boundary. Module files retain their own concrete types.

## C2 duration field migration delegation

Owner: Senior Programmer. This is only the duration-entry slice, not spatial,
fade, registry packing, or phase work. No commits. Files: block-definition.ts
(duration/context types only), blocks/duration-data.ts, blocks/panel-widgets.tsx
(DurationFields only), blocks/block-panel.tsx (duration case/context prop),
App.tsx (supply context to BlockPanel), builtin module imports/duration field
declarations, block-registry.test.ts (duration contract tests only).

Define EntryContext `{readonly length:number; readonly bpm:number; readonly
stageSpan:number}`. DurationPanelField<T> requires `read(data:T, context):
{value:number;unit:DurationUnit;synced:boolean;limits:NumberLimits}` and
`commit(data:T, edit:DurationEdit, context):T`. Define DurationEdit alongside
DurationData in block-definition.ts; duration-data.ts re-exports it for callers.
No default any added, no casts, no shape tests.

`durationField<T extends DurationData>(): DurationPanelField<T>` supplies the
existing kind/section/key/label, read and commit through editDuration. Its read
uses span when synced and returns existing beats .25..256 step .25 / seconds
.05..120 step .05. Rounding is widget display only. Runtime durationSeconds
retains the same stored-unit interpretation; reuse operations, not UI state.

First add throwing durationField skeleton and functional registered-operation
tests using a fresh typed data object with unrelated fields; test read limits,
sync effective value, commit conversion at90BPM, invalid value preservation.
Add never-called type-negative tests showing a tag-only duration field and
durationField<{text:string}> are rejected. Observe RED before implementation.

Then migrate all builtin duration declarations to durationField<TheirData>().
DurationFields becomes generic over arbitrary T: require field and context,
read via field.read, invoke field.commit inside update for all three edit kinds.
Remove its concrete store BPM read and inline conversion/sync logic. The generic
BlockPanel receives context `{length:block.length,bpm,stageSpan}` supplied by
App and passes it to DurationFields. Context is not block data and must not be
captured in a block module from the store. Other FieldView behavior unchanged.

Run focused tests, typecheck, full tests, build and diff check. Report tests
changed, observed RED and operation ownership; do not claim whole C complete.

## C2 fade field migration delegation

Owner: Senior Programmer. Only own block-definition.ts (FadeEdit/field types),
blocks/media-fades.ts, blocks/panel-widgets.tsx (FadeFields only),
blocks/block-panel.tsx (fades case), sound/animation fade field declarations and
blocks/media-data.test.ts. No commits. Other existing changes remain untouched.

FadesPanelField<T> requires `read(data:T):FadeData` and
`commit(data:T,edit:FadeEdit,context:EntryContext):T`. FadeEdit is
`{kind:"fadeIn"|"fadeOut";value:number}|{kind:"pair";value:FadeData}`.
In media-fades.ts export `fadesField<T extends FadeData>()` with existing
kind/section/key/label and exported `editFades<T extends FadeData>(data,edit,
context:{length:number}):T`. This invokes clampFadesToLength once, merges into
the current data, and preserves unrelated fields. Existing numeric gesture
clamps are not broadened with internal shape/nonfinite fallback checks.

First write functional operation tests in media-data.test.ts for each one-fade
edit and pair2/2->3/1, preserving unrelated data; throwing skeleton gives RED.
Add never-called type-negative checks for tag-only field and text-only data.
Then implement operations and migrate mediaFadeHandles' three setters to invoke
editFades (one callback per edit, preserving B1 atomic pair guarantee). FadeFields
accepts arbitrary T plus field/context and only invokes read/commit. Remove its
inline clamping and MediaData assumption. Builtins declare fadesField<MediaData>().
FieldView passes context. No D phase-gesture redesign in this slice.

Run focused media/store/registry tests, typecheck and diff check; report RED/GREEN.

## C2 spatial entry delegation

Owner: Senior Programmer. Only own block-definition.ts (choice field contract),
blocks/rectangle.tsx, blocks/block-panel.tsx (choice renderer), and
block-registry.test.ts (spatial tests plus existing expected field kind update).
No commit, no store/test-suite rewrite, no other files.

Add ChoicePanelField<T> to PanelField: kind choice, section input|block,
value(data:T):string, enabled(context:EntryContext):boolean, and choices array
of `{value:string;label:string;icon:LucideIcon;commit(data:T,context:EntryContext):T}`.
The generic renderer shows existing unit-toggle buttons, compares field.value
to choice.value, disables for !editable or !field.enabled(context), and invokes
the selected commit inside update. It owns no conversion policy. Existing
custom extension contract remains available; no need to remove it.

Rectangle replaces RectUnitsField/custom tag with one choice field at the same
position/key/label, preserving the grouped Span/Pixels UX. It declares conversion
operations using injected context.stageSpan and existing convertRectUnit. No
store import, eager runtime pixel conversion, per-coordinate units or slot writes.
Preserve same-unit/no-measured-scale no-op and unit button availability.

Wrap x/y/w/h declarations with numberInput<RectangleData> and reuse those exact
objects in execution.resolve rather than repeating slot key/accessor decisions.
Keep commitGeometry and commitColor policies and defaults unchanged.

First add functional production field tests in block-registry.test.ts via the
actual rectangle.fields declaration: convert span->pixels and back with measured
scale; changing units preserves unrelated color/duration; unavailable scale and
same-unit no-op; bindings are not changed. Observe RED before module changes
(a temporary absent-choice assertion can be the failing witness, not compile
failure). Then migrate contract/module/renderer. Existing expected rectangle
field kinds should change custom->choice, not weaken exact order. Runtime span
geometry must still be stored in stage payload as span after scale changes.

Run registry/session/store focused tests, typecheck/build/diff check. Report
precise RED/GREEN and any deviations. All existing C1/time/fade changes remain.

## C2 production-operation test delegation

Owner: Senior Programmer. Only own store.test.ts and execution.test.ts. No source
or other document changes, no commit. This is test repair/preservation work; do
not manufacture RED for already-correct behavior.

In store.test.ts replace the copied edit algorithms in setRectValue/setRectUnit/
setRectColor/setAdditionInput with thin invocation of the real registered fields
from blockDefinition(block.kind), using proper discriminant narrowing and the
actual commit operation. Use the choice with matching value for unit conversion,
and provide context from store BPM, block.length and the test's measured span.
Do not perform conversions/clamping in helpers. Route the setDuration duplication
setup helper to the registered duration field, preserving its real duplication
tests. Remove UNUSED setDurationUnit/setSyncBeatsToCellSpan and obsolete imports.
Preserve all meaningful assertions, especially slot-is-expression/no mutation
on unit switch. Earlier editDuration tests may continue testing the actual
exported operation, but add a registered duration field+store edit witness if
the setup helper doesn't already exercise it. Use context, not private internals.

In execution.test.ts add focused real-session preservation witnesses for a beat
duration at90BPM and sync-to-span duration using an authored stored duration
different from length (the effective relationship wins). Fake timers are fine.
Check running immediately before completion and completed afterward; no new UI
tests, cross-track execution order, registry mocks or copied duration formulas.
These should already be GREEN. Report exact modified/deleted tests/helpers and
focused/full typecheck/test/build/diff verification.

## Typed-contract consultation checkpoint

### Original context

- User: "goal: writing blocks/(block-name).ts and adding a line in builtin-blocks.ts must be sufficient to define a new block with panel interactions. No type branch."
- User: "panel definition should be derived from block definition, rather than defining own ***Panel individually".
- User: "beats/seconds toggle must be stored data (what happens when bpm changes??)".
- User: "slot is a expression, evaluated to literal number, and it is used as a input of the property of the block. internally converting the value to XXX is irrelevant".
- User: "OK. Also considering M1-M4, I think beats/seconds and spans/pixels should be largely a property of input entry. How do you think."
- Phase authorization: "OK let's begin. Rules: 1 utilize Senior Programmar subagent extensively to keep main context clean 2 commit after Phase completion 3 you can continue to next phase without permission. If you are not confident to close the phase consult to Counsel. Any question?"

The surrounding exchange accepted block isolation as direction, not an exact API.
The approved schedule lets Lead choose ordinary typed representation and asks for
User judgment only on a concrete behavioral conflict or consequential scope change.

### Current work and observed changes

Phase C, after committed A/B. `block-definition.ts` now requires typed access/edit
operations on duration/fade fields, defines injected EntryContext and generic
choice fields. `block-inputs.ts` numeric input/output declarations resolve the
same key/accessor used by fields and output records. Addition and rectangle reuse
those declarations in execution; timed builtins reuse their duration declaration
for both entry and runtime resolution. Slot capability metadata derives from
those fields, not another port list.

`packBlockDefinition` is the one explicit heterogeneous data/payload erasure to
unknown. Module specifications remain concrete and checked; consumers no longer
default to any or assume duration/media data shape. This is trusted internal
association, not validation of imported documents. No persistence feature added.

The rectangle's grouped unit buttons are a generic choice field with module-owned
conversion. Measured scale/BPM are supplied by the host; no builtin imports the
editor store. Stored units, geometry, span responsiveness, output timing and loop
policies remain unchanged. Duration/fade widgets invoke operations instead of
implementing conversion, synchronization or clamping. Physical isolation and
phase/gesture restructuring remain D/F, not claimed complete here.

### Evidence and tests

Existing registry tests gained numeric zero/negative literal and slot cases,
non-out output keys, a fresh typed definition with generic packing/edit/execution
composition, duration/fade type-negative declarations, runtime/unit/sync and
rectangle conversion preservation cases. Store tests now call registered edits
instead of copied RGB/addition/geometry/unit algorithms; unused copied helpers
removed. Real-session 90 BPM and sync-duration witnesses added. RED was observed
for helper skeletons and fresh choice/packing contracts; preservation cases are
not misreported as RED repairs. Current full verification: typecheck,486 tests,
build and diff check passed; Lead semantic audit is in progress before closure.

### Current understanding and blocking status

No new observable behavior has been intentionally selected. The architecture is
a typed connection of existing policies, not new units or a change to slot
meaning. No open User question identified; nothing currently blocked. Independent
checkpoint asks Counsel whether this package reveals an implicit consequential
choice requiring User judgment. It does not request implementation review,
architecture selection or approval. No broad exploration or subagents needed.

### Checkpoint outcome and Lead audit

Counsel identified no necessary User question from the supplied scope. Its report
did not verify implementation or approve phase closure. Lead subsequently read
the source/test diffs: numeric declarations are reused by runtime and panels;
duration entries resolve runtime seconds through the same declared operation;
widget operations never reinterpret block data; slot metadata is derived, not
duplicated. Packing erases only after typed definition construction, and generic
consumers use unknown. No new kind branches, slot writes by blocks, unit policies
or container/loop timing were introduced.

Lead corrected the first delegated fresh-field test to keep the always-present
empty Block section, narrowed numeric input specs to slot-capable input fields,
replaced a tautological binding-preservation assertion with an actual bound
rectangle execution, and made the changed-scale witness use two measured scales.
Test store reset restores BPM so the 90-BPM cases cannot leak state to later
tests. Test-only required-block lookup fails explicitly instead of skipping setup.

## Completion and test walkthrough

- `block-registry.test.ts`: added 19 functional tests for numeric declaration
  resolution/edits/output keys, fresh packed definition composition, duration
  read/edit/runtime resolution, and rectangle unit conversion/runtime semantics.
  Existing rectangle panel order changes only custom to choice. Negative compile
  witnesses reject wrong numeric access/edit types and unsupported duration data
  or tag-only fields. No browser rendering is claimed by these tests.
- `blocks/media-data.test.ts`: added 5 tests for one-fade edits, an atomic pair,
  oversize clamping and the typed field's production operation. Negative compile
  witnesses reject unsupported fade data and tag-only fields. Existing phase
  clamping and boundary tests remain intact.
- `store.test.ts`: added 8 duration-operation tests; replaced copied RGB,
  geometry, addition-input and rectangle-unit algorithms with registered commits.
  Duplication setup now invokes the registered duration field; removed unused
  copied duration-unit/sync helpers. Existing meaningful assertions are retained.
- `execution.test.ts`: added 2 real-session cases for beats at 90 BPM and synced
  duration overriding a different stored value. Existing output/lifecycle/gap
  cases remain intact. These preservation witnesses were already GREEN.
- Observed RED before implementation for numeric helper skeletons (5), typed
  duration field (6), duration edit operation (8), fade operation (5), missing
  rectangle choice/field order (7), fresh packing (1), and duration resolution (1).
  Typecheck validates the never-called negative cases; runtime tests do not execute
  them. Counts describe staged observations, not distinct final tests to sum.

Final verification: `pnpm typecheck`, `pnpm test` (486 tests in 16 files),
`pnpm build` (2099 modules), and `git diff --check` passed. No UI test or ESLint
run (unconfigured). Physical dependency isolation, full session registration proof
for a fresh contribution, and phase/gesture ownership remain their scheduled D/F
work rather than being claimed solved by field typing.
