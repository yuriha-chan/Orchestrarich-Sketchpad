- **Document model**: Definition and serialization of tracks, blocks, slots, markers, and phases.
- **Static verifier**: Ownership, double assignment to slots, ownership sections spanning loops and branches, and block placement constraints (3.5). This also handles the edit-time validation in 4.4 and diagnostics for "which line is broken".
- **Execution engine**: Column-by-column barrier synchronization, skip, termination processing, and stopping on failure.

These are written as pure TypeScript independent of the DOM and frameworks. The UI only renders state and sends operations as commands. That way, the UI technology choice can be changed later, and the verifier and execution engine can be solidified with unit tests. It can be bundled as-is into the game-side runtime and run without the editor. The reason for choosing TypeScript is that the Promise-based execution model meshes well with JavaScript, and typed model definitions become the foundation of the verifier as-is.

## React for the UI Layer

- **Combination with state management**: Zustand + Immer allows the document to be treated as immutable data. This makes Undo/Redo and state snapshots at logical time boundaries (save, rewind, column-by-column stepping) straightforward to implement.

## Rendering Approach

Since the timeline itself is a grid, I think it is good to divide responsibilities as follows.

- **Blocks and cells**: DOM (or SVG). Variable-length blocks, phase handles, and slot connection points can be handled directly with pointer events.
- **Lifetime lines and wires**: SVG overlay. Thick lines, saturation differences, and color-coding by type are easy with SVG.
- **Game preview**: Canvas/WebGL such as PixiJS. Renders media block display and fade. Separate it into a different layer from the editor UI.

For drag operations, since snapping to the grid and edge resizing are required, a custom implementation using pointer events fits better than a general-purpose library like dnd-kit.

React Flow nodes are data with "free coordinates". In this environment, a block is defined by (track, start cell, width), and screen coordinates are derived from that. Placing it on React Flow would mean dual management of grid positions and React Flow coordinates, requiring a layer to synchronize both on every snap, resize, and drag.

We will refer to the React Flow API but will not depend on it.
