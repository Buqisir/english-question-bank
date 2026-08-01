# 67 — Measured migration cohort E

Status: ready
Blocked by: 66
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/68-measured-migration-cohort-f.md`
Terminal: no
Model: gpt-5.6-terra
Effort: max
Parallel lane: none; downstream route is serial

## What to build

逐纸 atomic publish、reload、Screen/Print/PDF、retry 与 rollback。

## Approved membership

- `paper-zj-2024-jan`
- `paper-2021-ii`
- `paper-zj-2020-jan`
- `paper-zj-2022-jan`

## Measured/costed capacity

- 4 papers / 267 Ticket 22 baseline units; actual migration cost remains measured per paper.

## Fail-closed boundary

- Preserve whole-paper atomicity, immutable historical inputs, zero-write behavior where required, recovery/retry/rollback proof, and the Screen plus Print/PDF artifact matrix.
- Do not add DOCX output, production deployment, database/config mutation, or R2 work.
- Any changed denominator, unresolved queue, missing artifact, stale candidate, or unproved rollback stops this ticket.

## Superseded-ticket mapping

Old Ticket 41; historical Old Tickets 55–62.

## Acceptance criteria

- [ ] Deliver exactly the approved end-to-end slice, membership, blocker, model route, and downstream obligation.
- [ ] Preserve Student/Teacher answer visibility, canonical semantics, recovery/rollback, and all required public-seam evidence.
- [ ] Run the affected checks and final ticket-closure suite required by current repository authority.
- [ ] Record exact candidate, verification, review/QA state when applicable, and result commit.

## Result

Commit:
Verify:
Notes:
