# 31 — Deterministic 1035-set A–D conformance sweep

Status: ready
Blocked by: Ticket 30 independent review PASS
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/32-seven-choices-correction-batch-01.md`
Terminal: no

## What to build

Use one deterministic script to prove the shared A–D placement contract over
all 1035 frozen question-owned sets and their actual renderer translations.

## Acceptance criteria

- [ ] The denominator is exactly 1035 sets with one logical mode, row, column,
      order, and placement signature per set.
- [ ] Gold q21/q22/q23, the 15-row Cloze, corpus boundary cases, hard breaks,
      and synthetic unbreakable overflow retain accepted outcomes.
- [ ] PaperSurface/Print HTML, actual PDF, DOCX/OOXML, and converted PDF
      translate the same plan with accepted physical tolerances.
- [ ] Dense wrapping, hybrid rows, clipping, shrink-to-fit, or semantic-digest
      drift fails the sweep.
- [ ] From the exact reviewed HEAD, the implementation task provisions and
      opens the boundary artifacts with the canonical QA checklist; QA pauses
      for owner verdict.
- [ ] Focused script/artifact checks, ordinary self-check, full verify, and
      `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
