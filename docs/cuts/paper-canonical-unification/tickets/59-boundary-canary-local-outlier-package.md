# 59 — Boundary canary 1 — local/outlier package

Status: ready
Blocked by: Ticket 58 independent review PASS
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/60-boundary-canary-national-ii.md`
Terminal: no
Model: gpt-5.6-terra
Effort: max
Parallel lane: none; downstream route is serial

## What to build

原子迁移 `paper-960d0f8d`，完成 exact reload、Screen/Print/PDF、retry 与 rollback。

## Approved membership

- `paper-960d0f8d`

## Measured/costed capacity

- One paper / 69 Ticket 22 baseline units; migration cost must be measured on the exact candidate.

## Fail-closed boundary

- Preserve whole-paper atomicity, immutable historical inputs, zero-write behavior where required, recovery/retry/rollback proof, and the Screen plus Print/PDF artifact matrix.
- Do not add DOCX output, production deployment, database/config mutation, or R2 work.
- Any changed denominator, unresolved queue, missing artifact, stale candidate, or unproved rollback stops this ticket.

## Superseded-ticket mapping

Old Ticket 33; historical Old Tickets 51–54.

## Acceptance criteria

- [ ] Deliver exactly the approved end-to-end slice, membership, blocker, model route, and downstream obligation.
- [ ] Preserve Student/Teacher answer visibility, canonical semantics, recovery/rollback, and all required public-seam evidence.
- [ ] Run the affected checks and final ticket-closure suite required by current repository authority.
- [ ] Record exact candidate, verification, review/QA state when applicable, and result commit.

## Result

Commit:
Verify:
Notes:
