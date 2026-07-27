# Renderer Typography v2 migration

`paper-typography-v2.json` replaces v1 only for new canonical compilation and
publication. It binds the existing 420-twip Question-stem and outer A–D Option
block origin into Renderer Typography; the physical value and rendered output
do not change.

Existing manifest-v1 and manifest-v2 Publications remain resolvable through
their immutable authority closures. New Publications use manifest v3 and the
matching Screen v3, Print/PDF v4, and DOCX v3 Consumer Contracts. The
one-column continuation/hanging indent remains an independent A–D layout rule,
even though its current value is also 420 twips.
