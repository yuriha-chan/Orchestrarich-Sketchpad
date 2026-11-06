# Development Process Proposal: Verification-Driven Exploratory Development

First, without finalizing the overall design, start from **the smallest single point where "if we build this, we are likely to find a flaw in the design."** Each prototype is not a deliverable but **a tool for answering a question**. At the end of each prototype, record what was decided and what questions newly emerged, and choose the next prototype.

## Unit of Progress: "Question" and "Experiment"

Write each experiment in the following four lines, and size it to finish in one to several days.

- **Question**: What do we want to confirm (logically or in the UI)?
- **Smallest components**: The smallest implementation necessary to confirm it.
- **Criterion**: What must be observed for us to say "the question is answered"?
- **Carry-over**: Questions that the result opens or closes for the next step.

Treat the specification (design document) as a **living document** that is rewritten based on experimental results, and do not complete it in advance.

## Round 1: Attack the Most Dangerous Hypothesis in a Single Component

The first candidate is the part that is central to the design but that no one has run yet.

**Experiment 1-A (logical): Minimal execution engine for column barrier synchronization**
- Smallest components: 2-3 tracks, fixed-length blocks only. Blocks complete by timer. No branches, loops, or types.
- Criterion: "t does not advance until both the click wait and the animation finish" works. "Which blocks are currently blocking t" can be displayed.
- Carry-over: What happens when no-wait mode and skip are added?

**Experiment 1-B (UI): Grid with time horizontally and tracks vertically, block placement and stretching**
- Smallest components: No execution engine; just snap blocks to cells and change their width.
- Criterion: Can I, not a beginner, assemble one staging arrangement in 5 minutes?
- Carry-over: Serialization format of placement data, handling of phase handles.

These two are independent and can proceed in parallel. Neither includes types or ownership. However, this is not the final form; it is only for examining the UI and synchronization.

## Round 2: Choose the Next Path Based on What Was Decided in Round 1

We will choose after seeing the results of Round 1, but the candidates currently visible are as follows.

- **Skip + no-wait + termination processing** (extension of 1-A): Whether the decision "after sending a skip to a no-wait block, the barrier waits" can be naturally written as the closing of loop BGM in actual staging.
- **Editor representation of multi-phase blocks** (extension of 1-B): Whether the rule that media does not cut off at fade boundaries is preserved in rendering. Add minimal rendering (PixiJS) to the preview to confirm.
- **Visual representation of slots and wires** (extension of 1-B): With types still absent, enable drawing only connection lines to slots, and see whether it remains readable when lines increase. Here you get the first feel for the goal of "not getting in the way in simple scenes and not breaking down in complex scenes."

In Round 2, **run at most 2-3 in parallel** from here. Too many makes it hard to see the influence between results.

## Round 3 and Beyond: Paths Opened by Added Components

The following is a prediction, and the order is not fixed.

- **Introduction of types and ownership**: Build the static verifier standalone and test the diagnostic display of "which line is broken" with a single case (double assignment). Then extend it to ownership sections spanning loops.
- **Loops and branches**: First, put only loops on barrier synchronization. Then branches, and finally combinations with ownership (3.3, 3.4).
- **Subtimelines**: Declare calls and inputs/outputs. Test output on interruption and specification of skip availability.
- **Persistent state via records**: Write a small scene that keeps updating character state, and see whether the central use case of the design can actually be written easily.
- **Tests that write concrete staging**: Assemble one each of dialogue, camera movement, and battle-start staging, and actually build them. Only here does the need to look through the eyes of a beginner first arise.

## How to Iterate

1. List the "carry-overs" from the previous experiment.
2. Among them, choose **the hypothesis with the largest rework cost if it is wrong**.
3. Build the smallest component to confirm that hypothesis.
4. Reflect the results in the specification and the list of questions.
5. Return to 1.

If you feel that the only point to review has become "implementation convenience," stop the experiment and return to the test that writes concrete staging.

## Image of the Mesh-Like Overall Picture

The path is not a single line but branches and merges along the way, as imagined below.

```text
Execution engine (synchronization) ──→ Skip / no-wait ──→ Subtimeline ──┐
     │                                                ├─→ Staging tests ─→ Product
Grid UI ──→ Phase editing ──→ Media rendering ──────────┤
     │                                                │
     └──→ Slots and wires ──→ Type/ownership verifier ──┘
                    └──→ Loops/branches ──→ Record state
```

The execution-engine branch and the UI branch proceed independently at first. They merge around the point where the visual representation of slots and wires begins to require the execution engine's data model. I think this merge point will be the first major integration test.

## Rules to Follow in Each Experiment

- **Do not fear throwaway code**. Experimental code may be discarded once it has answered the question. What remains are decisions and learnings.
- **Write the core independently**. The separation described in the previous answer (model, verifier, and execution engine are framework-independent) is also observed in experiments. Even if the prototype is discarded, only this part can be carried forward.

## First Step

I think it is good to start by writing Experiment 1-A (the execution engine for column barrier synchronization) in **a few dozen lines of TypeScript**. If tests work without a UI, one side of Round 1 is complete. The other side, 1-B, can start without waiting for that result.
