# Renderer Typography v3 migration

`paper-typography-v3.json` replaces v2 only for new canonical compilation and
publication. It preserves the v2 Question-stem and outer A–D Option-block
origin unchanged and adds the owner-accepted Reading A–D passage-letter
projection and physical geometry.

The letter comes only from the explicit `reading.a` through `reading.d` Profile
slot identity carried by a ready whole-paper Consumption Plan. Screen and
Print/PDF render exactly one matching letter before the passage content,
centered on the Reading content column, in a zero-margin 18-point line box.
Free-form section or title text is not an identity source.

The measured golden-reference evidence and tolerances are digest-bound through
`docs/cuts/paper-canonical-unification/qa/20-reading-passage-letter-reference-measurements.json`.
Existing manifest-v1 through manifest-v12 Publications remain resolvable
through their immutable authority closures. New Publications use manifest v13,
Screen v13, and Print/PDF v14.
