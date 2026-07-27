# Ticket 13 Continuation Writing QA checklist

Status: prepared; owner QA not started

This checklist is provisioned only after the required independent review
passes. The provisioning task must use the exact reviewed HEAD and run:

```sh
EQB_PERSIST_ACTUAL_ARTIFACTS=1 \
EQB_ACTUAL_ARTIFACT_ROOT=.scratch/ticket-13-continuation-writing \
node scripts/verify-paper-canonical-continuation-writing-rendered-behavior.mjs
```

The command creates two-starter and source-proven zero-starter Screen
screenshots, Print HTML/PDF artifacts, packaged DOCX artifacts, and converted
DOCX PDFs under `.scratch/ticket-13-continuation-writing/`.

## Canonical owner checklist

1. In the two-starter case, confirm the material appears once, followed by one
   response box with exactly two ordered source starter lines and no
   `Paragraph N:` prefix.
2. In the zero-starter case, confirm the complete material appears once and
   the one response box is empty; no starter or instruction is invented.
3. Compare student and teacher Screen artifacts: the teacher supplement may
   appear, but material, instructions, starters, word ruling, response
   identity, and placement must not change.
4. Compare Screen, Print/PDF, and DOCX: each case must preserve the same
   semantic signature, occurrence signature, canonical instructions, material,
   starter cardinality, word ruling, and one response region.
5. Confirm no artifact contains legacy pollution, a third starter, forged
   Analysis text, or a renderer-created prefix.
