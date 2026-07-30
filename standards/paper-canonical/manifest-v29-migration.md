# Manifest v29 migration

Manifest v29 publishes Screen v29 and Print/PDF v30. Manifest v1 through
Manifest v28 and every artifact reachable from them remain unchanged and
resolvable.

This successor closes one Continuation Writing source-fidelity defect. The
immutable `continuation-writing-source-capture-v2` and
`continuation-writing-source-transcription-v2` artifacts record their exact
v1 predecessor paths and SHA-256 digests, use Unicode NFC plus ASCII-whitespace
collapse for source comparison, and preserve punctuation code points,
punctuation-adjacent spacing, apostrophe code points, and word presence. The
complete source-material comparison therefore requires `ditch （沟）.` and
rejects `ditch (沟) .`; it is not an output-to-oracle self-comparison.

Continuation Writing family v3 and Source Adapters v8 make those v2 source
contracts the only admitted current identities. NCK1 v8 and Zhejiang legacy
v7 are compatibility successors that advance only the Continuation family
reference. `continuation-writing-rhythm-v2` rebinds the corrected source and
coverage oracles while preserving every v1 geometry value and behavior:
equal 4em starter indentation, narrow-screen wrapping, normal-flow writable
areas, cross-page movement, zero chrome indentation, absent Teacher analysis,
and end-of-paper behavior.

Grammar Fill public-geometry-fixtures v8 changes only its compatible
Consumption Plan identity from Manifest v28 to Manifest v29. Application
Writing, Reading, Seven Choices, Cloze, Grammar Fill, and inactive Listening
semantics do not change.
