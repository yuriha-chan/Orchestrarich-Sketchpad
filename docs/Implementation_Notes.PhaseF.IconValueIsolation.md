# Implementation Notes: Phase F Icon Value Isolation

## Definition values

`BlockDefinition.icon` and each choice entry's `icon` store a Lucide icon
name rather than a React component. The name type is `IconName`, derived from
`keyof typeof icons` in the editor icon adapter, so definitions can only name an
icon the library exports.

The builtin definitions use the same icons as before:

- dialogue: `MessageSquare`
- camera: `Video`
- sound: `Volume2`
- animation: `Clapperboard`
- wait: `Hourglass`
- rectangle: `Square`
- rectangle unit choices: `Grid2x2` and `Monitor`
- addition: `Calculator`

## Adapter

`src/editor/icons.tsx` owns the generic adapter. `blockIcon(name)` looks up the
library's exported icon map by name, and `BlockIcon` renders that component with
the supplied Lucide props. The lookup has no block-kind keys or registrations.
Palette, timeline blocks, context menus, creation previews and choice buttons
all use `BlockIcon` while keeping their existing sizes and `aria-hidden`
attributes.

The custom panel-field capability is unchanged.

## Build size tradeoff

Importing the library's exported icon map keeps every Lucide icon reachable at
runtime, so unused icons can no longer be tree-shaken out of the client bundle.

Measured production build with the component icons:

- JavaScript: 330.31 kB (101.38 kB gzip)
- CSS: 19.29 kB (4.13 kB gzip)

Measured production build with the icon-name adapter:

- JavaScript: 995.02 kB (274.30 kB gzip)
- CSS: 19.29 kB (4.13 kB gzip)

Vite also reports the JavaScript chunk as larger than 500 kB.

## Verification

- `pnpm exec tsc -p tsconfig.isolation.json` passes.
- `pnpm exec tsc --noEmit` passes.
- `pnpm test` passes: 16 files, 548 tests.
- `pnpm build` passes.
- `git diff --check` reports no whitespace errors.

The registry test checks that definition icons are non-empty strings and
that every builtin and choice icon name resolves through the adapter.
