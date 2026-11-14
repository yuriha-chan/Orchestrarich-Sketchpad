# Phase F: block relocation and isolation

## Boundary and sequence

The editor consumes block contributions; it does not own their language or
execution contracts. Preserve the User's module-plus-registration extension
rule and avoid separately synchronized runtime and UI registries. First move
shared placement and presentation-target contracts plus execution base classes
into framework-independent core. Verify that these compile without DOM, React,
Lucide, Zustand, or editor modules. Then relocate block contributions and the
single builtin registry to `src/blocks`, and move purely editor-owned generated
panel widgets into the editor. Evaluate any remaining runtime dependency chain
before claiming that builtin execution is independent of rendering.

Do not alter block timing, unit behavior, stage ownership, or document data.
Tests should observe actual public operations rather than duplicate block
behavior. File moves and import rewiring are behavior-preserving refactors.

## First bounded increment

Define core `PlacementBase`/`Placement` in `src/core/blocks/placement.ts` and
`StageLayer`/`StageItem`/`StageActions` in `src/core/blocks/presentation.ts`.
Move `ExecutionInstance`, `ExecutionContext`, `TimedExecution`,
`MediaExecution` and related types to `src/core/blocks/runtime.ts`. The editor
model and stage store may re-export the same types to avoid widespread import
churn, but must not duplicate definitions. Update runtime imports and all
consumers of the old runtime module; remove that module. Keep node-executable
relative imports with explicit `.ts` extensions where needed.

Add an isolation typecheck configuration limited to the core placement,
presentation, runtime and runner dependency graph, using ES2022 without DOM.
It must not import `src/editor` or framework types. Run the isolation typecheck,
all existing tests, main typecheck, build and diff check. Existing runtime
session tests already exercise execution and lifecycle; do not fabricate RED for
moving a passing contract. Audit imports in the dependency graph, not just the
new file names. Do not create or modify a second block registry.

The first increment moved the shared types and execution classes into core.
`pnpm exec tsc -p tsconfig.isolation.json` passes with ES2022 and no DOM or
framework modules; Node ambient types provide the existing timer globals. This
proves the core contracts and base classes only, not builtin registry isolation.
The existing session suite, main typecheck and build also passed (546 tests).

## Second bounded increment: physical relocation

Move block-contribution modules and their block-specific data/gesture/rendering
helpers from `src/editor/blocks` to `src/blocks`, and move the single
`builtin-blocks.ts` registry there. Keep generic generated `block-panel.tsx`
and `panel-widgets.tsx` in `src/editor`; update their imports and every
consumer, including tests and editor execution. Preserve the existing single
registry and all behavior. Preserve `.ts` suffix on imports needed by Node.
This increment is only a move/rewire; do not split block definitions or add a
second registry. The remaining fact that current builtins import React/Lucide
is not solved or concealed by moving files.

Use file-edit tools only. Verify isolation typecheck, normal typecheck, full
tests, build and diff check. Report all moved paths and any remaining imports
from blocks back into concrete editor UI; do not commit.

## Shared unit helpers

Move the duration-unit type and four duration conversion functions from the editor model to a pure module under `src/core/blocks`, and move `RectUnit`, `RectGeometry`, `Vec3`, and the rectangle unit conversion operation to a pure core module. Keep editor re-exports so existing editor callers preserve their API. Point builtin duration and rectangle modules directly at these pure definitions. This is a behavior-preserving relocation: retain existing tests and run them, rather than inventing a failing behavior. Do not move stage measurement or change rectangle units, slot behavior, or the registry. No commits.

## Icon value isolation

Builtin definitions must not import UI component values merely to specify icons. Store a Lucide icon name in each definition and each choice instead of a React component, and resolve that name in one generic editor-side icon adapter using the library's exported icon map. The adapter is keyed by icon name, not block kind, so a new block using an available Lucide icon needs no extra registration. Preserve existing icons and their size/aria attributes in palette, blocks, menus, previews, and choice buttons. Keep the existing custom panel-field capability intact; it is outside this increment. Update existing type and registry tests as appropriate, and verify actual build size as well as typecheck/tests/build. No commit.

## Move shared definition operations

Relocate `block-definition.ts` and `block-inputs.ts` from the editor to the block library, retaining the single registry and all existing contracts, including custom panel fields. Update imports rather than creating duplicate definitions or registries. This removes editor value imports from builtin modules; it does not by itself prove no-DOM type isolation because the custom field contract still references React types. Keep the move behavior-preserving and verify existing registry and session tests, typecheck, isolation typecheck, build and diff. Report any remaining type-only editor dependencies; do not change the custom field contract or commit.

## Move shared contract types

Move `SlotDirection`, `SlotProperty`, `BoundSlotProperty` and `LoopRegion` from the editor model to a pure core block-contract module. Editor model re-exports them. Update block library imports to reference pure core types directly, including `Placement` and `StageActions` from their existing core modules and the duration/geometry types already moved. Do not change the custom panel field or icon contracts in this increment. Verify existing tests, normal and isolation typechecks, build and diff. No commit.

## Plain TypeScript builtin modules

After moving stage components into the editor, the seven builtin definition modules contain no JSX. Rename those modules from `.tsx` to `.ts`, preserving the one-module-per-block structure and updating references where necessary. Do not rename editor React components, alter behavior, or remove the custom field extension. Verify tests, normal and isolation typechecks, build and diff. No commit.

## Icon name contract location

The icon name type currently lives in the editor adapter, leaving a type-only block-library dependency on the editor. Move the `IconName` type to the block library and import it into the generic editor icon adapter. Keep the same Lucide key set, runtime adapter and all behavior; do not change custom fields or claim framework-independent type isolation from this move. Verify existing registry tests, typechecks and build. No commit.

## Fresh-definition session witness

Add a functional test in the existing session suite for a fresh typed block definition with a numeric panel input and an execution that calls the generic stage rectangle API. Exercise the real generic input declaration commit and a real TimelineSession, then observe the rectangle primitive and its cleanup after promise completion/termination. Substitute only the high-level block-definition lookup for the fresh kind, forwarding all builtins unchanged; verify the lookup was actually used. Do not add a production registry, mutate the readonly registry array, add kind branches, or build a test-only implementation of the domain behavior. This tests the session/panel-operation/stage composition; it does not claim a browser panel render or literally edit the builtin registration file. No production changes or commit. Observe RED only if an expected behavior is absent; passing characterization is valid for preserved behavior.

## Phase result and verification

The block library and its single registry are in `src/blocks`; framework-independent placement, execution, presentation and unit contracts are in core. Blocks supply a timeline fade flag rather than a React timeline renderer. Block execution uses the typed stage presentation API, and the editor renders its UI primitives without block-kind dispatch. Custom panel fields remain supported. `tsconfig.isolation.json` includes the builtin registry with no DOM library; the custom field and icon contracts still use React and Lucide types, so this is not a claim that the entire library's type graph is framework-free. A Vite SSR bundle of the builtin registry ran under Node and contained no React, Lucide, Zustand or editor runtime imports.

The fresh-definition session witness uses the generic input operation, real session and stage API with a substituted high-level definition lookup. It does not claim a browser interaction or literal registration-file change. Full verification: 549 tests, normal and isolation typechecks, build and diff check passed. No browser verification was performed.

The generic Lucide-name adapter preserves icon choice without another per-block registration, but increases the production JS bundle from approximately 330 kB to 995 kB (101 kB to 274 kB gzipped). This is a measured tradeoff, not an established performance requirement; an untested lazy-loading alternative could change first-render behavior. Counsel identified no closure blocker, while emphasizing the distinction between runtime isolation and framework-dependent type contracts.
