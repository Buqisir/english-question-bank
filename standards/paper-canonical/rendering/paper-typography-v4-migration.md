# Renderer Typography v4 migration

`paper-typography-v4.json` replaces v3 only for new canonical compilation and
publication. It preserves the v3 slot-identity projection, centered A-D
placement, 18-point line box, and the v2 Question/outer-option origin.

The new contract binds one semantic-role adjacency graph for the complete
Reading A-D vertical rhythm. Optional roles collapse directly to the next
visible semantic role without phantom space. B-D bind the previous passage's
last question tail: Student output uses the last visible option line, while
Teacher output includes the visible answer/explanation tail. The same graph
also covers passage-to-first-question, one- and two-line stems, wrapped and
multi-row options, question transitions, same/cross-page continuations, and
the Reading D transition to the next exact section.

Measurement evidence is bound at
`docs/cuts/paper-canonical-unification/qa/20-reading-vertical-rhythm-reference-measurements-v3.json`.
Its exact G03-G08 JPEG bytes contribute only dimensionless local-baseline
ratios. Screen and exact-A4 Chromium PDF map those ratios to independently
measured public-artifact line steps.

Existing manifest-v1 through manifest-v13 Publications remain resolvable
through their immutable authority closures. New Publications use manifest
v14, Screen v14, and Print/PDF v15.
