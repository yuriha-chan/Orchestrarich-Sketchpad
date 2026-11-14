# Implementation Notes: Phase F Icon Name Contract Location

## Relocation

Added `src/blocks/icon.ts` as the block-library home of the `IconName` type:

```ts
import type { icons } from "lucide-react";

export type IconName = keyof typeof icons;
```

The import is type-only, so the block library derives the same Lucide key set
without loading the icon map. `src/blocks/block-definition.ts` imports
`IconName` from `./icon`, and the generic adapter in `src/editor/icons.tsx`
imports the same type from `../blocks/icon`. The runtime lookup
(`icons[name]`), `blockIcon`, `BlockIcon` and their Lucide props are unchanged.

A dedicated contract module was chosen instead of declaring the type inside
`block-definition.ts` so the editor icon adapter does not depend on the broader
definition and custom panel-field contract.

## Scope

The custom panel-field contract is unchanged. The block library still has a
type-only React dependency through that contract, so this move does not claim
framework-independent type isolation.

## Verification

- `pnpm exec vitest run src/editor/block-registry.test.ts`: 35 tests passed.
- `pnpm exec tsc --noEmit`: passes.
- `pnpm exec tsc -p tsconfig.isolation.json`: passes.
- `pnpm test`: 16 files, 548 tests passed.
- `pnpm build`: passes; JavaScript 995.02 kB (274.30 kB gzip), CSS 19.29 kB
  (4.13 kB gzip).
- `git diff --check`: no whitespace errors.

No commit was made.
