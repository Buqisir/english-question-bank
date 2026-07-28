# 69 — Retire Application Writing legacy consumption

Status: ready
Blocked by: Ticket 68 independent review PASS and owner QA acceptance
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/70-retire-continuation-legacy-consumption.md`
Terminal: no

## What to build

Retire Application Writing legacy capability and remove skeleton
reconstruction, genre inference, Analysis intrusion, allowlists, and fallback
across current consumers.

## Acceptance criteria

- [ ] All 24 Tasks and nine Profile-backed N/A cases are canonical-selected
      with zero queue.
- [ ] All surfaces consume only canonical prompt, fixed parts, word ruling,
      and response facts.
- [ ] Missing, stale, or corrupt canonical Application Writing hard-fails with
      accepted whole-release rollback only.
- [ ] Student/teacher artifacts preserve task semantics, fixed-part placement,
      response occurrence, and answer visibility.
- [ ] From the exact reviewed HEAD, the task provisions and opens Application
      artifacts with the canonical QA checklist; QA pauses for owner verdict.
- [ ] Focused retirement/recovery checks, ordinary self-check, full verify,
      and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
