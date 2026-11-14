# Integer placement coordinates

The User confirmed that placement API start and length should use an integer
type rather than accepting arbitrary numbers, matching the runner contract.
TypeScript has no built-in integer primitive; a nominal integer type and an
explicit checked conversion at uncontrolled numeric boundaries express this
contract. Preserve the separate existing nonnegative-start and positive-length
rules and existing UI behavior. Do not silently round fractional values.

Inspect all placement construction and edit paths, including duplication and
gestures. Apply the integer type to document placement coordinates and the
store placement commands; ensure callers produce or check integers at their
boundaries rather than asserting arbitrary numbers. Tests must demonstrate
compile-time rejection of ordinary numbers and runtime rejection of fractional
conversion, and preserve current valid command and gesture behavior. Avoid
introducing parallel placement representations or unrelated feature changes.
