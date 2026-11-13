# Block definition registry

## Goal

Adding a block must require only two things:

1. a new module `src/editor/blocks/<name>.tsx`;
2. one line in `src/editor/builtin-blocks.ts` registering it.

That module must define everything block-specific: label, icon, color, default data,
data conversion, slot-capable parameters, the inspector panel, the stage effect, the
timeline block visuals, and execution behavior. No code outside `src/editor/blocks/`
may test the block kind. `if (block.kind === "...")`, `switch (kind)`, per-kind
placement interfaces, and per-kind setter actions are forbidden.

The definition is a value in a table; consumers look it up with
`blockDefinition(kind)` and use its capabilities. The table is total over the
registered kinds; an unregistered kind is a contract violation and throws.

## Types (`src/editor/block-definition.ts`)

```ts
interface PlacementBase {
  readonly id: string;
  readonly trackId: string;
  readonly start: number;
  readonly length: number;
  readonly cooperativeSkip: boolean;
  readonly slotBindings?: Readonly<Record<string, string>>;
}

type Placement<T = unknown> = PlacementBase & { readonly kind: string; readonly data: T };
```

A block owns an opaque `data` value. Only its own module and tests know its shape.
`Placement` no longer exposes duration, fades, rectangle geometry, or addition inputs.

```ts
interface FieldProps<T = any> {
  readonly block: Placement<T>;
  readonly editable: boolean;
  readonly update: (change: (data: T) => T) => void;
}

interface StageViewProps<T = any> {
  readonly view: { readonly id: string; readonly payload: T };
}

interface FadeHandles {
  readonly fadeIn: number;
  readonly fadeOut: number;
  setFadeIn(value: number): void;
  setFadeOut(value: number): void;
}

interface PhaseSpan { readonly index: number; readonly offset: number; readonly length: number }

type PanelSection = "input" | "block" | "output";

interface PanelFieldBase {
  readonly section: PanelSection;
  readonly key: string;
  readonly label: string;
}

// number (optionally slot-capable), color, duration, fades, output slot,
// note, or custom control
type PanelField<T> =
  | { kind: "number"; section: "input" | "block"; slot?: boolean;
      value(data: T): number; commit(data: T, value: number): T;
      min: number; max: number; step?: number;
      limits?(data: T): { min: number; max: number; step: number } }
  | { kind: "color"; section: "block"; value(data: T): Vec3;
      commit(data: T, value: Vec3): T }
  | { kind: "duration"; section: "block" }
  | { kind: "fades"; section: "block" }
  | { kind: "output"; section: "output" }
  | { kind: "note"; section: "block"; text: string }
  | { kind: "custom"; section: "input" | "block"; render: ComponentType<FieldProps<T>> };

interface CarryOver {
  readonly duration?: DurationData; // { duration, durationUnit, syncBeatsToCellSpan }
  readonly fades?: FadeData;        // { fadeIn, fadeOut }
}

interface BlockDefinition<T = any> {
  readonly kind: string;
  readonly label: string;
  readonly color: string;
  readonly icon: LucideIcon;
  readonly slotProperties: readonly SlotProperty[]; // derived from fields
  readonly fields: readonly PanelField<T>[];
  readonly createData: (length: number) => T;
  readonly carryOver?: (data: T) => CarryOver;
  readonly convertFrom: (carry: CarryOver, length: number) => T;
  readonly renderStage?: ComponentType<StageViewProps<T>>;
  readonly renderBlock?: (block: Placement<T>, width: number) => ReactNode;
  readonly fadeHandles?: (block: Placement<T>) => FadeHandles | null;
  readonly phases?: (data: T, length: number) => readonly PhaseSpan[];
  readonly onLengthChange?: (data: T, length: number) => T;
  readonly createExecution: (context: ExecutionContext, block: Placement<T>) => ExecutionInstance;
}
```

Kind conversion consumes typed carry-over fields, never `data: unknown`.
`durationCarry`/`durationFromCarry` and `mediaCarry`/`mediaFromCarry` are the
shared helpers; a block module opts in by assigning them. Data defined by only
one kind (rectangle geometry, addition inputs) has no carry-over path and the
target uses its own defaults. Validating malformed or unknown data belongs to
the document import/persistence boundary, not to conversion.

`builtin-blocks.ts` holds the specs and derives the slot capability table:

```ts
export const BLOCK_DEFINITIONS: readonly BlockDefinition[] =
  BLOCK_SPECS.map((spec) => ({ ...spec, slotProperties: deriveSlotProperties(spec.fields) }));
export function blockDefinition(kind: string): BlockDefinition;
```

`panelSections(definition)` groups fields into Input, Block, and Output in that
order. Input is present only when it has fields; Output is present only when it
has fields; Block is always present because the cooperative-skip control is
appended to it. `BlockPanel` renders the sections; block modules never render a
panel.

## Model (`src/editor/model.ts`)

Keep: `PlacementBase`, `Placement`, `SlotProperty`, `Track`, `Vec3`,
`DEFAULT_BPM`/`MIN_BPM`/`MAX_BPM`, `DurationUnit`, `beatsToSeconds`,
`secondsToBeats`, `convertDuration`, `blockDurationSeconds` (takes data-free
duration arguments or the block's data through the definition), loop helpers,
`canPlace`, `nextFreeStart`, `intervalsOverlap`, `PlacementShape`.

Remove: the `BlockKind` union, `DialoguePlacement`, `TimedPlacement`,
`MediaPlacement`, `RectanglePlacement`, `AdditionPlacement`, `DurationPlacement`,
all type guards, `SLOT_CAPABLE_PROPERTIES`, `BLOCK_KINDS`, `BLOCK_LABELS`,
`convertPlacementKind`, `isMediaKind`.

Move to `src/editor/blocks/media-data.ts`: `clampFadesToLength`, `mediaPhases`,
`phaseBlockId`, `isFaded` if needed.

`blockDurationSeconds` becomes `blockDurationSeconds(duration: number, unit: DurationUnit, bpm: number)`
or stays as a helper used by duration panels.

## Execution (`src/editor/block-runtime.ts`)

Unchanged base classes, moved out of `block-execution.ts`:

- `ExecutionContext { bpm, time(), stage, report, readSlot(slotId) }`.
- `ExecutionInstance` abstract with `execution-N` ids and `startPhase(block)`,
  `terminatePhase(block)`, `terminate()`.
- `TimedExecution` (phase timers, skip fade) and `MediaExecution` (phase playback
  hold) stay as reusable bases. They must not import kind names.

`createExecution` lives on the definition. `execution-definition.ts` uses
`blockDefinition(placement.kind).phases?.(data)` to decide single vs multi-phase;
no `isMediaPlacement`.

`execution.ts` builds definitions, keeps loop expansion, gap-keyed slot contexts,
read/write validation via `definition.slotProperties`, and termination output
assignment. It must not branch on kind.

## Stage (`src/editor/stage-state.ts`, `Stage.tsx`)

```ts
interface StageItem { readonly id: string; readonly kind: string;
                      readonly layer: "screen" | "card"; readonly payload: unknown }
interface StageActions { add(item): void; remove(id): void; update(id, payload): void }
```

`Stage` renders `layer: "screen"` items inside the letterboxed grid and
`layer: "card"` items below, each through `blockDefinition(item.kind).renderStage`.
Animation playback updates go through `update(id, payload)` with the animation
block's payload type. No item-kind switch in `Stage.tsx`.

## Store (`src/editor/store.ts`)

- `create` uses `blockDefinition(kind).createData(length)`.
- `setBlockKind(id, kind)` is a no-op for the same kind. Otherwise the source
  definition's `carryOver(data)` returns the typed fields that may cross the
  kind boundary, and the target's `convertFrom(carry, length)` builds its data.
  Retain only slot bindings whose keys are in the target definition's
  `slotProperties`.
- Replace all per-kind setters with
  `editBlockData(id: string, update: (data: unknown) => unknown)`.
  Fields supply typed callbacks (cast inside their own module).
- `applySpan` calls `blockDefinition(block.kind).onLengthChange?.(data, length)`.
- Slot binding stays generic (`setSlotBinding`).

## App

- Palette maps `BLOCK_DEFINITIONS`.
- Inspector renders `<BlockPanel definition block editable update setCooperativeSkip />`;
  the host owns only the shell (title, kind selector, read-only time range, note
  when the run is locked). Panels are derived from `definition.fields`.
- Block rendering uses the definition's icon/color and `renderBlock` overlay.
- Fade edge gestures use `definition.fadeHandles(block)` when present.
- The drop-area popup lists `definition.slotProperties`.
- No `kind ===` comparisons anywhere in `App.tsx`.

## Blocks

`src/editor/blocks/dialogue.tsx`, `sound.tsx`, `animation.tsx`, `camera.tsx`,
`wait.tsx`, `rectangle.tsx`, `addition.tsx`.

Shared files: `panel-widgets.tsx` (`PropertyNumber`, `SlotPropertyField`,
`DurationFields`), `duration-data.ts` (duration/unit/sync fields and helpers),
`media-data.ts` (fades/phases), `duration-execution.ts` if useful.

Rectangle data: `{ duration, durationUnit, syncBeatsToCellSpan, x, y, w, h,
rectUnit, color }` and slot properties x/y/w/h. Addition data: `{ inputA,
inputB }` and slot properties a/b/out. Media data adds `fadeIn/fadeOut`.
Dialogue data: `{}`.

## Tests

Update factories to `placement(kind, data, span)`; store tests drive
`editBlockData` or the block module's data helpers; execution tests assert stage
payloads through the definition's view props. Keep all behavioral coverage:
duration units and BPM, sync, fades and phase barriers, rectangle fill and
slot inputs, addition outputs at termination, skip/cooperative skip, loops,
gaps, validation.

## Verification

`pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`. The UI cannot be
checked in this environment; the User runs `pnpm dev`.

## Final File Map

- `src/editor/block-definition.ts`: `Placement`-facing definition contract,
  panel/stage/fade/phase hooks.
- `src/editor/block-runtime.ts`: `ExecutionContext`, `ExecutionInstance`,
  `TimedExecution`, `MediaExecution`, and the presentation adapter contract.
  `block-execution.ts` and `fade-editing.ts` are removed.
- `src/editor/builtin-blocks.ts`: `BLOCK_DEFINITIONS`, `blockDefinition`, and
  `boundSlotProperties`.
- `src/editor/blocks/dialogue.tsx`, `camera.tsx`, `sound.tsx`, `animation.tsx`,
  `wait.tsx`, `rectangle.tsx`, `addition.tsx`: one module per block, owning data,
  conversion, panel fields, stage view, timeline visuals, and execution.
- `src/editor/blocks/block-panel.tsx`: `BlockPanel` and `FieldView`; renders
  `panelSections(definition)` for every block.
- `src/editor/blocks/panel-widgets.tsx`: `PropertyNumber`,
  `SlotPropertyField`, `OutputSlotField`, `DurationFields`, `FadeFields`,
  `ColorField`, slot name/choice helpers.
- `src/editor/blocks/duration-data.ts`: duration/unit/sync data and length
  changes.
- `src/editor/blocks/media-data.ts`: fades, phase boundaries, media phases, and
  the pure fade-drag helper.
- `src/editor/blocks/media-fades.ts`, `media-block.tsx`: shared fade handles and
  timeline fade visuals.
- `src/editor/stage-state.ts`, `Stage.tsx`: stage items are
  `{ id, kind, layer, payload }` and render through each definition's
  `renderStage`.
- `src/editor/store.ts`: `createData`, `convertFrom`, `editBlockData`,
  `onLengthChange`, and generic slot binding; no per-kind setters.
- `src/editor/App.tsx`: palette, inspector shell, block shell, and fade gestures
  driven by definitions.
