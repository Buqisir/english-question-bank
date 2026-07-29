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
Because those JPEG pages are cropped, their pixels never define absolute
Screen or PDF distance. Each crop instead uses the median nearby Latin
baseline step as its local scale. The measured heading-to-letter,
prior-content-to-letter, and letter-to-first-line ratios are mapped to the
actual 24px Screen and 18pt exact-A4 PDF line steps. Screen and Print/PDF
geometry checks resolve exactly one predecessor tag for each visible
`groupId`; missing, duplicate, wrong-Group, or cross-page bindings fail closed.
Existing manifest-v1 through manifest-v12 Publications remain resolvable
through their immutable authority closures. New Publications use manifest v13,
Screen v13, and Print/PDF v14.
