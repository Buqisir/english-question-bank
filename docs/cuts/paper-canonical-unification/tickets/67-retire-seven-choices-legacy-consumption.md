# 67 — Retire Seven Choices legacy consumption

Status: ready
Blocked by: Ticket 66 independent review PASS and owner QA acceptance
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/68-retire-reading-legacy-consumption.md`
Terminal: no

## What to build

Retire Seven Choices legacy capability and all raw-marker or bank
reconstruction across current consumers.

## Acceptance criteria

- [ ] All 33 Groups / 165 Blanks / 33 banks are canonical-selected with zero
      queue.
- [ ] Every surface retains five pairs, seven Option anchors, one bank, and
      zero per-question choices.
- [ ] Repeated/nested bank projection, raw-marker reconstruction, allowlists,
      and partial fallback are removed.
- [ ] Missing, stale, or corrupt canonical Seven Choices hard-fails with
      accepted whole-release rollback only.
- [ ] From the exact reviewed HEAD, the task provisions and opens single-bank
      artifacts with the canonical QA checklist; QA pauses for owner verdict.
- [ ] Focused retirement/recovery checks, ordinary self-check, full verify,
      and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
