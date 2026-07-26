# 66 — Retire Grammar Fill legacy consumption

Status: ready
Blocked by: Ticket 65 independent review PASS and owner QA acceptance
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/67-retire-seven-choices-legacy-consumption.md`
Terminal: no

## What to build

Retire Grammar Fill legacy capability and interpretation across all current
consumers without regressing the prior Cloze retirement.

## Acceptance criteria

- [ ] All 33 Groups / 330 Questions are canonical-selected with closed
      source/blank/answer joins and zero queue.
- [ ] Raw marker parsing, compatibility normalization, allowlists, and
      field/Group/renderer fallback are removed.
- [ ] Missing, stale, or corrupt canonical Grammar hard-fails with only
      accepted whole-release rollback.
- [ ] Known label-marker and isolated-number actual artifacts remain correct.
- [ ] From the exact reviewed HEAD, the task provisions and opens Grammar
      artifacts with the canonical QA checklist; QA pauses for owner verdict.
- [ ] Focused retirement/recovery checks, ordinary self-check, full verify,
      and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
