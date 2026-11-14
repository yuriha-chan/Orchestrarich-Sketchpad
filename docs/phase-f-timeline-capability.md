# Phase F: Generic timeline fade rendering

The User directed that timeline block rendering provide a generic fade-in and fade-out capability controlled by a flag. Sound and animation currently share the same fade surface and phase-boundary rendering through `mediaRenderBlock`; preserve its appearance and phase positions while moving this rendering responsibility into the editor. Blocks without the flag retain the ordinary timeline rendering. This change does not alter fade editing, phase execution, or stage presentation.

## Test task

Add functional tests for the definition-level capability using actual builtin definitions: sound and animation enable the flag; a non-fade block does not. Use the existing registry test suite. Add the smallest type skeleton for the flag if needed. Run the focused tests and report whether the intended behavior is RED; do not implement rendering or change other files. Do not assume that a missing optional flag must be explicitly false.

## Implementation task

Set `timelineFades: true` on sound and animation, remove their `renderBlock` callbacks, and remove that callback from the definition contract. Move the existing media timeline surface renderer into the editor as a generic fade surface. The generic host checks the flag and obtains fade values from the already-declared fades field's read operation, then supplies those values, length, width and phase positions to the surface; do not inspect a block kind or assume the data shape. Preserve the existing mask and boundary markup and all timeline gesture behavior. A flagged definition without a fades field violates the definition contract; do not silently hide it. Do not modify stage presentation. Run focused tests, typecheck and build; report the files and any type-contract issues. No commit.
