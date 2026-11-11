Asking back to Lead

The central issue is the distinction between a gap's structural position and its execution occurrence. The User's clarification establishes that two gaps at the same logical boundary can have different initialization semantics, so the current time-indexed representation cannot fully express the intended model. Gap identity must therefore reflect its position in the recursively derived structure.

One consequence deserves particular attention: an initialization before an inner-loop edge is not necessarily executed only once throughout the program. If that gap belongs to an enclosing outer loop, it is encountered on each iteration of the outer loop, although only once per entry into the inner loop. Thus, initialization frequency is relative to the enclosing execution structure, not simply to whether a gap precedes or follows a particular marker.

The unresolved question is whether this increment must make those execution frequencies observable. The earlier decision restricted loop development to authoring markers, whereas the latest clarification explicitly requires the derived structure to be used in execution.

Question to Lead: What evidence establishes the intended execution scope of this increment, particularly whether the User's latest clarification supersedes the earlier restriction to authoring markers?

This distinction should be examined before asking the User to decide whether loop playback is included. The structural identity of gaps and their execution semantics can be established independently of implementing repeated traversal, but whether that separation is acceptable for the current increment remains to be determined.
