# 68 — Retire Reading legacy consumption

Status: ready
Blocked by: Ticket 67 independent review PASS and owner QA acceptance
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/69-retire-application-legacy-consumption.md`
Terminal: no

## What to build

Retire Reading legacy capability and remove flattened, placeholder, marker,
allowlist, and fallback interpretation across all consumers.

## Acceptance criteria

- [ ] All 126 Groups / 465 Questions are canonical-selected with zero queue
      and exact rich-content/answer lineage.
- [ ] PaperSurface, Print/PDF, and DOCX consume only typed canonical content,
      native tables/Figures, Questions, and shared A–D plans.
- [ ] Missing, stale, or corrupt canonical Reading hard-fails with accepted
      whole-release rollback only.
- [ ] Actual prose/table/Figure artifacts preserve order, structure, media,
      anchors, placement, and Analysis independence.
- [ ] From the exact reviewed HEAD, the task provisions and opens Reading
      artifacts with the canonical QA checklist; QA pauses for owner verdict.
- [ ] Focused retirement/recovery checks, ordinary self-check, full verify,
      and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
