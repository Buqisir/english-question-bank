# Ticket 11 Application Writing QA checklist

Status: prepared; owner QA not started

This checklist is provisioned only after the required independent review
passes. The provisioning task must use the exact reviewed HEAD and run:

```sh
EQB_PERSIST_ACTUAL_ARTIFACTS=1 \
EQB_ACTUAL_ARTIFACT_ROOT=.scratch/ticket-11-application-writing \
node scripts/verify-paper-canonical-application-writing-rendered-behavior.mjs
```

The command creates present, absent, and full-fixed-part Screen screenshots,
Print HTML/PDF artifacts, packaged DOCX artifacts, and the matching
Consumption fixtures under `.scratch/ticket-11-application-writing/`.

## Canonical owner checklist

1. In the present case, confirm the source-provided title appears once at the
   top of the response box and the prompt appears once immediately above it.
2. In the absent case, confirm the response box contains no invented title,
   salutation, opening, closing, or signature.
3. In the full-fixed-part proof, confirm title/salutation/opening stay above
   the writing space while closing/signature stay below it.
4. Compare student and teacher Screen artifacts: the teacher supplement may
   appear, but prompt, fixed text, placement, and response identity must not
   move or disappear.
5. Compare Screen, Print/PDF, and DOCX: each must contain one prompt, one
   response region, and exactly the fixed parts supplied by its canonical
   variant.
