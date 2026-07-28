# NCK1 Profile v5 migration

NCK1 Profile v5 preserves every v4 active family binding, part, section,
score, instruction, answer region, and rendering rule. It changes only the
source-closure contract of the two already-inactive listening slots.

`listening.short-dialogue` remains questions 1–5 and
`listening.long-form` remains questions 6–20. Both still use
`activation: inactive_source` and `renderPolicy: suppress`; neither gains a
Canonical Question Group or consumer occurrence. Profile v5 additionally
binds `listening-raw-closure@nck1-v1`, which requires exact A–C source
Questions, official-answer membership, five transcript segments per slot,
literal supplied timing or proved absence, and a closed audio inventory.

Manifest v11 retains every earlier authority for existing Publications and
makes Profile v5 the only NCK1 Profile accepted for new compilation. Current
Screen, Print/PDF, and DOCX Consumer Contracts bind v11 but still enumerate
only the six active canonical families; listening remains absent.
