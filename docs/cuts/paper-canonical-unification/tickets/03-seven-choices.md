# 03 — Seven Choices canonical vertical slice

Status: ready
Blocked by: 02 — Reference conformance and shared A–D selector
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/04-reading.md`
Terminal: no

## What to build

Implement the closed Seven Choices family contract from Source Capture through
compiler, Publication, shared projection, Screen, Print/PDF, and DOCX.
Replace the reproduced legacy `7,7,7,7,7` projection with five semantic
Question/Blank pairs referencing one group-owned A–G bank.

## Acceptance criteria

- [ ] The canonical variant enforces five ordered unique Question/Blank pairs,
      one A–G bank, stable option-answer joins, and no per-question option
      fallback.
- [ ] Registered source marker dialects preserve bytes/spans/punctuation;
      stray ordinals, unknown dialects, missing evidence, and answer conflict
      reach their exact blocked dispositions.
- [ ] Canonical-only plus `paper-2026-i` and `paper-960d0f8d` proofs pass the
      public compiler/Publication/loader path.
- [ ] Every plain/lecture, student/teacher Print-PDF, and student/teacher DOCX
      Group occurrence has five pairs, seven Option anchors, exactly one bank,
      and zero per-question choice sets, including across page breaks and
      teacher supplements.
- [ ] The historical repeated-bank output is retained as a failing regression
      proof; no renderer parses raw markers or reconstructs a bank.
- [ ] Focused checks, actual artifacts, app build, full verify, and
      `git diff --check` pass.
- [ ] A fresh independent review lineage is green and the provisioned owner
      QA checklist is accepted before the ticket is marked done.

## Out of scope

No Reading, Writing, listening, new-import latch, corpus migration, or legacy
deletion.

## Result

Commit:
Verify:
Notes:
