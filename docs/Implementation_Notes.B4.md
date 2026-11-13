# B4 session composition witnesses

Scope: `src/editor/execution.test.ts` only. No source edits, no commit. The B2
authored-container preflight block is preserved.

## Test-helper change

`setup` records rectangle `x` reads both in the existing `rectangleXs` array and
in `rectangleXsByPlacement` keyed by placement id. `rectangleXs` and all existing
callers are unchanged. The per-placement map is used by the nested-loop witness
so outer and inner frequencies are observable separately.

## Scenarios, authored paths, expected and observed

All cases use the real `TimelineSession`, registry block definitions, real stage
store and global numeric slots. Fake timers drive the runner; no property
algorithm is copied or mocked.

### 1. Output timing (adapted existing end-assignment test)

Authored:

- addition `[0,3)` on dialogue track, inputs `2 + 3`, output `sum`
- wait `gate` `[0,1)` on camera track, one beat at 120 BPM
- rectangle `inside` `[1,2)` on camera track, `x` reads `sum`
- rectangle `reader` `[3,4)` on camera track, `x` reads `sum`
- slot `sum` initialization at boundary `0`, path `[]`, value `7`

Expected and observed:

- immediately after `start`: time `0`, addition `running`, `inside` pending
- after flushing the pending instant promise: time `0`, addition `completed`,
  `inside` still pending
- after 500 ms: time `1`, the newly started `inside` reads `7`
- after another 500 ms: time `3`, `reader.x = 5`

The gate holds time 0 while the addition's completion reaction runs. Only
after completion does the inside reader start, so premature assignment on
completion would make it read 5 instead of 7. Merely inspecting a rectangle
that read before the completion reaction would not distinguish these policies;
Lead corrected that weakness during semantic review. The inside rectangle then
holds the intermediate barrier before end assignment.

### 2. Output versus same-boundary initialization

Authored:

- addition `[0,2)` on dialogue track, inputs `2 + 3`, output `value`
- rectangle `consumer` `[2,3)` on camera track, `x` reads `value`
- slot `value` initialization at boundary `2`, path `[]`, value `8`

Expected and observed after flushing the instant promise: time `2`, addition
`completed`, `consumer.x = 8`.

The producer's end assignment writes `5` at boundary 2; the boundary-2
time-start initialization writes `8` afterwards, so the consumer reads `8`.
This witnesses that end assignment precedes time-start initialization. The
microtask flush is needed only because an instant producer ending one column
ahead is still pending at the prior column.

### 3. Loop re-entry over an intervening output (adapted existing inside-start test)

Authored:

- loop `loop-1` `[0,3)`
- slot `speed` initializations at boundary `0`: path `[]` value `1`, path
  `["loop-1"]` value `2`
- rectangle `rect` `[1,2)` reads `speed`
- rectangle `written` `[2,3)` reads `speed`
- addition `[1,2)` on sound track, inputs `3 + 6`, output `speed`

Expected and observed: `rectangleXs = [2, 9, 2, 9, 2, 9]`, timeline `finished`.

The addition writes `9` at the end of each iteration. The inside-start
initialization is reapplied at the start of every iteration, so each `rect` read
is `2`; `written` observes the intervening write `9` before the next repeat.
Persistence alone would leave `9` for later `rect` reads. Reapplying only the
parent initialization would produce `1`.

### 4. Nested contexts (three-by-three pilot)

Authored:

- outer loop `[0,6)` with inner loop `[1,3)` as its child
- slot `signal` initialization at boundary `0`, path `["outer"]`, value `1`
- rectangle `outer-reader` `[0,1)` reads `signal`
- rectangle `inner-reader` `[1,2)` reads `signal`
- addition `[1,2)` on sound track, inputs `3 + 4`, output `signal`

Expected and observed after 6000 ms:

- `outer-reader`: `[1, 1, 1]`
- `inner-reader`: `[1, 7, 7, 1, 7, 7, 1, 7, 7]`
- timeline `finished`

The outer initialization resets `signal` to `1` at each outer iteration. It is
not reapplied at inner repeats, so after the addition writes `7` the remaining
two inner reads of that outer pass observe `7`. This separates the outer and
inner context frequencies.

### 5. Touching sibling loops

Authored:

- sibling loops `left` `[0,3)` and `right` `[3,6)` sharing boundary `3`
- slot `value` initializations at boundary `3`: path `["left"]` value `30`,
  path `[]` value `10`, path `["right"]` value `20`
- rectangle `reader` `[3,4)` inside `right`, `x` reads `value`
- addition `[4,5)` on sound track, inputs `50 + 49`, output `value`

Expected and observed after 1500 ms: `rectangleXs = [20, 20, 20]`, timeline
`finished`.

At the shared boundary the end, parent and second-loop start visits are authored
in the same order the session applies them. The start value `20` is the last
writer, so the consumer reads `20` rather than the end value `30` or parent
value `10`. On each `right` repeat the inside-start initialization is reapplied:
the addition writes `99`, but the next read is again `20`. Persistence alone
would leave `99`; a parent-only initialization would leave `10`.

## Results

- Focused `npx vitest run src/editor/execution.test.ts`: 60 passed.
- Full `npx vitest run`: 452 passed across 16 files.
- `npx tsc --noEmit`: clean.

No real semantic conflict was found; every case is green against the production
session behavior. Two weak existing cases (end assignment and inside-start loop
reapplication) were strengthened in place rather than duplicated, retaining
their original distinct coverage.
