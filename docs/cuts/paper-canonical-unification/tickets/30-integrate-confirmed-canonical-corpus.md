# 30 — Integrate the confirmed 33-paper Canonical corpus

Status: ready
Blocked by: Tickets 27, 28, and 29 PASS
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/31-atomic-canary-publication-recovery.md`
Terminal: no
Parallel frontier: not-applicable
Parallel join: not-applicable
Model: gpt-5.6-terra
Effort: max
Parallel lane: serial join; sole writer of shared migration accounting

## What to build

Integrate the Ticket 25 seam pair and three paper-family lanes in the fixed
order Ticket 27 → Ticket 28 → Ticket 29, then close exact 33-paper Canonical
Paper accounting without publishing or switching current refs.

## Write surfaces

- Exclusive: integrated candidate set, shared migration ledger/manifest,
  whole-corpus accounting and zero-write evidence.
- Forbidden: shared adapter/schema/authority behavior, publication/current
  refs, renderer behavior, route receipts.

## Acceptance criteria

- [ ] Each lane fork base remains an ancestor and protected shared surfaces match the Ticket 26 base.
- [ ] Fixed integration order is enforced; conflicts or shared writes fail closed without automatic resolution.
- [ ] Exactly 33 Source Captures, Teacher Confirmations, and complete unpublished Canonical Papers are accounted for with no duplicate or missing paper.
- [ ] Frozen counts and zero-write state invariants remain exact.
- [ ] No authority version changes and no new adapter behavior are introduced.
- [ ] Narrow lane and aggregate checks plus `git diff --check` pass; a new full suite/review is not repeated for unchanged accepted shared behavior.
- [ ] Ticket 30 is dispatched only after all three lane-result handoffs resolve to exact PASS commits.

## Superseded-ticket mapping

Replaces old Ticket 58 and its join obligations.

## Result

Commit:
Verify:
Notes:
