# 02 — Reference conformance and shared A–D selector

Status: ready
Blocked by: 01 — Canonical authority/evidence/publication foundation
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/03-seven-choices.md`
Terminal: no

## What to build

Move Cloze and Grammar Fill reference behavior behind the whole-paper
foundation, remove their proof allowlists/on-the-fly compatibility
normalization/renderer-local fallback, and implement the single
`layoutAbcdOptionSet(...)` placement Module for every question-owned A–D set.

Close the known Cloze Screen/Print-PDF/DOCX column-alignment failure without
changing canonical Question, Option, answer, order, source map, or semantic
digest.

## Acceptance criteria

- [ ] Canonical-only and hash-bound real Cloze/Grammar fixtures compile,
      publish, load, and project through the public whole-paper seams.
- [ ] Marker ambiguity, duplicate/missing blanks, answer conflict, stale
      source, and partial legacy/canonical selection fail closed.
- [ ] The selector implements the accepted fixed-twip 4-column → 2×2 →
      1-column whole-set fallback, hard-break handling, and unbreakable
      overflow `needs_review`.
- [ ] Gold q21/q22/q23 select 4/1/2 columns; the page-9 15-row Cloze selects
      four columns; all 1035 current A–D sets and synthetic boundary fixtures
      produce one shared logical placement signature.
- [ ] Screen/Print, actual PDF, and DOCX translate the same mode/row/column/
      order plan, stay within 1pt, keep Cloze same-column x-spread within
      0.5pt, and have no hybrid row, dense wrap, clipping, or shrink-to-fit.
- [ ] Analysis and student/teacher modes do not change canonical or placement
      signatures.
- [ ] Focused checks, actual artifacts, app build, full verify, and
      `git diff --check` pass.
- [ ] A fresh independent review lineage is green and the provisioned
      `qa-local-owner` Screen/Print-PDF/DOCX checklist is owner-accepted before
      the ticket is marked done.

## Out of scope

No Seven Choices A–G layout, listening A–C layout, later family implementation,
new-import latch, corpus publication, or legacy retirement.

## Result

Commit:
Verify:
Notes:
