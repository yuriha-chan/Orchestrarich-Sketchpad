# Multi-Track Visual Programming Environment Design Document

## 1. Basic Concept and Execution Model

This environment is a **visual programming language** that places **blocks** representing event processing on a **discretized two-dimensional grid** and advances by synchronizing the completion of processing placed in the same column. Even for programming beginners, event processing based on staging can be written as easily as video editing. Even when requirements for interaction between objects and flow structures increase, the environment aims to allow a natural migration to a modern, managed, productive programming paradigm that does not suffer from bugs caused by aliases or from problems such as forgetting initialization or termination processing.

### 1.1 Basic Concepts

The smallest logical time frame in which event processing can be performed is called a **unit cell**. A linear arrangement of unit cells along the logical time axis is called a **track**. A stack of tracks arranged in parallel is called a **timeline**.

In the programming screen, logical time t is the horizontal axis, and tracks are stacked vertically.

When logical time `t` starts, on all tracks, the start processing of blocks whose start time is t is executed, and the execution state of the blocks is set to "running".

After that, it waits until the execution state of all blocks whose end time is `t + 1` becomes "completed". When that is complete, the logical time is updated to t+1, and new processing starts.

### 1.2 Real Time and Logical Time

Logical time is a progression unit in the program that is independent of real time. The following processing can be placed in a column.

```text
               logical time t               t+1
Track A    [dialogue / click wait]      [next dialogue]
Track B    [entrance animation]         [idle behavior]
Track C    [sound effect]               [state update]
               └── advance when all complete ──┘
```

Even if the click on the dialogue happens first, if the animation continues, `t` does not advance. Conversely, even if the animation finishes first, as long as the click wait continues, `t` does not advance.

### 1.3 Skip Event

A skip operation does not directly change logical time.

A user's skip request is transmitted as a "skip request event" to the running blocks. Blocks are expected to cooperatively shorten or finish processing upon receiving the event and become "completed", but they may also ignore the request.

Blocks that write values, or for which the value to return when processing is skipped is not set, ignore skip requests.

### 1.4 Cooperative Skip Mode

A block can be set to cooperative skip mode. When the blocks that must complete execution by the end logical time of a block set to cooperative skip mode become only cooperative skip blocks, the skip event of that block occurs automatically.

## 2. Execution Model

## 2.1 Types

The following types are primitive types, and assignment is a copy operation.

Integer type
Real number type
String type
Vector<n> type (n=2,3,4)
Matrix<n, m> type (n=2,3,4, m=2,3,4)
EMPTY type

The following types are object types, and assignment is an ownership transfer operation.

Array<Type> type
Dictionary<Type> type
Tuple<Type, Type, ...> type
Record<Type, Type, ...> type
Union container<Type, Type, ...> type

## 2.2 Slots

Each track can have multiple slots. A slot is specified with the type of value it can store. A slot can hold at most one value.

## 2.3 Shared Slots

A shared slot is a slot shared by the entire timeline.

## 2.4 Blocks

A block consists of the following parts.

Input part
Reading from track slots.
Reading from shared slots.

Reading an object-type value from a track slot transfers ownership to the block. An object-type value read from a shared slot does not have ownership.

Calculation part
A pure function can be applied to the read values.
If the value of the pure function is an object type, it does not have ownership.
The calculation part can output multiple values.

Object operation part
If the input or calculated value is an object with ownership, instructions for side-effecting object operations can be executed.
Functions that wait for time to pass can also be executed.
Object creation can be executed.
A copy of the input or calculated object-type value can be executed. This can be done regardless of ownership.
The object operation part can have multiple return values.
The output of the object operation part always has ownership if it is an object type.

Output part
Writing to track slots.
Writing to shared slots.

Output is executed immediately before the block's end time.
One object can be written to only one slot.

## 2.5 Subtimelines

A subtimeline is a delimited timeline with inputs and outputs. A call to a subtimeline can be placed in the "object operation part".
Inputs and outputs must be specified with names and types.
Inputs must specify whether they have ownership. Inputs with ownership can be assigned to track slots. Inputs without ownership can only be assigned to shared slots.
Only object-type values with ownership or primitive-type values can be output.

A subtimeline call can be configured whether its execution can be stopped in response to a skip request.

## 2.6 Object Passing

At logical time boundaries, values and ownership can be transferred to another track's slot. Or they can be discarded.
However, in a section where a block is using a value read from a shared slot, the shared slot's value cannot be transferred elsewhere.

## 2.7 Example

The array operation instruction pop takes one array<Type> value with ownership as input and outputs the first value of union<Empty, Type> type and the array<Type> value with the first value removed.
In unwrap mode, it outputs the first value as a Type value, and if it cannot be extracted, the block's execution fails.

## 2.8 Block Execution Failure

If a block fails execution, the timeline stops execution. In a subtimeline block, by specifying the value to output when an error occurs, processing can still be executed even if an error occurs in the subtimeline.

## 2.9 Multi-Phase Blocks

A container consisting of multiple directly adjacent phase blocks is called a multi-phase block. Phase boundaries must be placed at logical time boundaries.
The effect of a multi-phase block is the same as placing multiple phase blocks as blocks, but the adjacency condition is imposed, and the convention that internally used values are passed through as-is applies.

The application of "cooperative skip mode" to each constituent phase block can be set independently.

## 2.10 Termination Processing

When all blocks necessary to advance to the next logical time have become completed, the termination processing of all blocks ending at that time is called, and then processing for the next logical time starts.
Also, even when the timeline stops due to a block execution failure or interruption of a subtimeline call, termination processing of running blocks is performed.

## 3. Loops and Branches

Regions on the grid can be set as loops or branches. A loop repeatedly executes the same logical event sequence, and a branch selects the next execution region according to a condition.

### 3.1 Loops

By placing loop start and end markers on a track, a loop section can be made explicit. These markers are placed at unit cell boundaries. Loop markers are placed across the entire timeline.

Also, at the loop end marker, the loop termination condition can be specified.
Also, markers can be placed to instruct redoing the loop when the condition is met, or to instruct exiting the loop.

### 3.2 Branching and Merging

Branching and merging are represented as branching and merging of the entire timeline. Markers representing these also span the timeline and are placed at unit cell boundaries.
The branch condition is represented as a logical expression computed from values read from any slot.

### 3.3 Ownership Sections Spanning Loops

At the start of a loop, if there is a slot that has ownership of an object, that slot must still have ownership of the object at the end of the loop.

### 3.4 Branching and Merging of Ownership

In a conditional branch, as a visual representation on the track, the lifetime of the value branches. At runtime, only the actually selected path receives ownership.
In order for a track to hold a value after the merge of conditional branches, the value must be held in the track on all paths.

### 3.5 Blocks Spanning Loops and Branches

When a block is placed spanning a branch or loop, it must either include the entire branch or loop section or not include it at all.
Also, blocks inside a loop cannot be placed spanning a marker that instructs redoing the loop or a marker that instructs exiting the loop.

## 4. Editing Model

### 4.1 Variable-Length Blocks

A block can be placed spanning multiple unit cells.

### 4.2 Media Blocks

Media files such as images can be placed as blocks. This means an instruction to display the media on the screen. Playback parameters of the media can be taken as input.
A media block can be placed as a multi-phase block with fade-in and fade-out settings.

A media block is displayed or played at the start, and is removed or stopped when the termination processing of the entire multi-phase block is executed.

### 4.3 Object Lifetimes

The lifetime of an object is represented as a single continuous line. The lifetime of an object-type value with ownership is represented by a highly saturated thick line, and the lifetime of an object without ownership is represented by a low-saturation line. Different colors are assigned by type.

### 4.4 Edit-Time Validation

Connections of values that violate the execution model, such as assigning multiple values to one slot, are not allowed. To overwrite a slot, the value must first be discarded.
