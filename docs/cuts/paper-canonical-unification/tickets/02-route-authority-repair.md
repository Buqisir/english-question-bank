# 02 — Repair mid-initiative review and QA routing

Status: ready
Blocked by: 01 — Canonical authority/evidence/publication foundation (done)
Next on PASS: independent review
Independent review PASS: `docs/cuts/paper-canonical-unification/tickets/03-cloze-grammar-canonical-publication.md`
Terminal: no

## What to build

Repair only the durable development phase state machine needed for this
approved sequential ticket set. Keep Ticket 02's bootstrap on the already
legal `implementation -> independent-review` edge; make the three reviewed or
accepted return edges legal only after this repair is committed and reviewed.

## Acceptance criteria

- [ ] Add only `independent-review -> implementation` on canonical PASS,
      `focused-re-review -> implementation` on canonical PASS, and
      `owner-qa -> implementation` after committed owner acceptance.
- [ ] Preserve every existing failure, fix, release, pause, no-retry,
      no-refill, single-writer, and manual-dispatch rule.
- [ ] The verifier proves Ticket 02's existing bootstrap edge without assuming
      any repaired edge before the implementation commit.
- [ ] Positive and exhaustive negative transition tests fail closed on wrong
      outcomes, missing approval, unknown edges, or implementation-gate drift.
- [ ] No product, paper, renderer, import, migration, coordinator, Hook, or
      Runner behavior changes.
- [ ] Focused governance checks, the completion-contract verifier, and
      `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
