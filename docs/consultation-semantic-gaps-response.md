# Lead response: execution scope of the gap increment

## Counsel's question

> What evidence establishes the intended execution scope of this increment,
> particularly whether the User's latest clarification supersedes the earlier
> restriction to authoring markers?

## Answer

No evidence establishes that the earlier restriction was lifted. The latest
clarification adds requirements on the model's semantics but does not state that
loop repetition enters this increment.

### 1. The earlier restriction, its context, and its scope

Verbatim User answer: "only authoring markers."

Question it answered: "markers only or playback repetition now; if playback, the
termination for this increment (condition now, repeat count, or infinite until
Reset)."

Scope: the increment that introduced loop start/end markers. Within that scope the
answer explicitly excluded playback repetition and deferred conditions and
redo/exit markers. It was a scope decision about loop execution, not only about
which UI controls to draw.

### 2. Later loop messages do not revisit that scope

- "we need more than one loop"; "I see this system as a visual programming
  language, so I took for granted that we have multiple and nested loops. so
  please think of AST" — document structure.
- The context-menu creation path, depth colors, boundary drags, sibling absorption
  and release — all authoring behavior.
- "So at first we change the UI model." — explicitly a first UI-model step.

None requests repeated traversal.

### 3. The development plan keeps playback a separate step

`steps.md` Round 3 and beyond: "Loops and branches: First, put only loops on
barrier synchronization." The order is stated as a prediction, not fixed, but it
treats running loops as a distinct step after authoring.

### 4. The latest clarification does not supersede it

Verbatim: "gaps are not only a visual component. gap is a place where value
initialization take place. so initialize in the gap before loop edge: variable
initialized only once. initialize in the gap after loop edge: variable initialized
at every iteration. so don't think there are three kinds of gaps (before, base,
after) to render. the structure automatically derives gap and cell sequence by
recursive rules, and the component reflect that structure. there may be 4 or more
contiguous gap run if nested loop starts at the same position. the derived model is
used in the execution too."

The affirmative content is: gaps are initialization positions; their repetition
semantics differ by side of a loop edge; the sequence is derived recursively; the
same derived model is consumed by execution. It does not say that loops now
repeat, nor that the earlier authoring-only decision is withdrawn. "Initialized at
every iteration" describes the semantics the gap model must encode; it is not by
itself an instruction to implement iteration.

Conclusion: the intended execution scope of this increment is not established by
the available evidence. It is a User decision.

## Counsel's frequency correction

Accepted and important: occurrence frequency is relative to the enclosing
execution structure, not absolute. A gap before an inner loop's edge, but inside an
outer loop, is re-entered once per outer iteration; "only once" means once per
entry into the context that contains the gap. The gap's ordered list of enclosing
loops, not the mere before/after side of one marker, determines how often the
initialization runs. This must be part of gap identity in the derived model.

## Consequence for the candidate questions

- Initialization identity is settled by the User's statement: a time alone cannot
  distinguish two gaps at the same boundary, so an initialization must be
  identified by its gap (slot, boundary time, gap identity). This no longer needs a
  User decision.
- Gap width is an ordinary design choice: every derived gap keeps the existing
  32 px width, so the grid widens by 32 px for each additional gap at a boundary.
  This follows the earlier sequence example and keeps initialization pills the same
  size.
- Only the playback scope remains for the User: whether repeated traversal is part
  of this increment, or the derived structure and gap-keyed initialization are
  implemented while runs remain single-pass. If single-pass, every gap is entered
  once and the encoded loop path is unused until playback; that separation is
  technically possible but the User must say whether it is acceptable.
