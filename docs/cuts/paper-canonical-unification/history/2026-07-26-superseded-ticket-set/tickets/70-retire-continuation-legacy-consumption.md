# 70 — Retire Continuation Writing legacy consumption

Status: ready
Blocked by: Ticket 69 independent review PASS and owner QA acceptance
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/71-repository-release-closeout.md`
Terminal: no

## What to build

Retire Continuation Writing legacy capability and remove starter slicing,
prefix parsing, instruction fabrication, Analysis intrusion, allowlists, and
fallback across current consumers.

## Acceptance criteria

- [ ] All 24 Tasks and nine Profile-backed N/A cases are canonical-selected
      with zero queue.
- [ ] All surfaces consume only canonical material, starters, word ruling,
      and response facts.
- [ ] The corrected three-starter evidence remains traceable and cannot
      regress to polluted legacy interpretation.
- [ ] Missing, stale, or corrupt canonical Continuation Writing hard-fails
      with accepted whole-release rollback only.
- [ ] From the exact reviewed HEAD, the task provisions and opens two/zero
      starter artifacts with the canonical QA checklist; QA pauses for owner
      verdict.
- [ ] Focused retirement/recovery checks, ordinary self-check, full verify,
      and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
