# 64 — Full-corpus artifact, recovery, and rollback closure

Status: ready
Blocked by: 63 — Full-corpus semantic and accounting closure
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/65-retire-cloze-legacy-consumption.md`
Terminal: no

## What to build

Aggregate and verify the complete actual-artifact, recovery, retry, and
rollback matrix for all 33 canonical-selected papers before any legacy
capability is retired.

## Acceptance criteria

- [ ] Every applicable PaperSurface plain/lecture, student/teacher Print
      HTML/PDF, and student/teacher DOCX/OOXML/converted-PDF cell is PASS.
- [ ] Semantic, anchor, occurrence, answer-visibility, response-region,
      table/Figure, pagination, and clipping signatures agree.
- [ ] SKIP exists only for contract-declared N/A; no unknown skip or hidden
      missing artifact remains.
- [ ] Whole-corpus stale/corrupt load, restart/retry, and exact prior
      Publication/Consumer Contract rollback pass.
- [ ] From the exact reviewed HEAD, the task provisions and opens
      corpus/profile/risk artifacts with the canonical QA checklist; QA pauses
      for owner verdict.
- [ ] Focused artifact/recovery checks, ordinary self-check, full verify/CI,
      and `git diff --check` pass with durable hashes.

## Result

Commit:
Verify:
Notes:
