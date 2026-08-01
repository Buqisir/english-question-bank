# 69 — Full-corpus semantic, accounting, recovery and rollback closure

Status: ready
Blocked by: 68
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/70-full-corpus-screen-artifact-closure.md`
Terminal: no
Model: gpt-5.6-terra
Effort: max
Parallel lane: none; downstream route is serial

## What to build

关闭 33 papers / 273 Groups / 1,530 objective Questions / 1,035 A–D sets；证明无漏纸、重复 current、孤立 publication/journal，且 recovery 与 rollback 可重演。

## Approved membership

- `Frozen 33-paper denominator`

## Measured/costed capacity

- Full-corpus high-risk aggregate; no fixed per-paper estimate.

## Fail-closed boundary

- Preserve whole-paper atomicity, immutable historical inputs, zero-write behavior where required, recovery/retry/rollback proof, and the Screen plus Print/PDF artifact matrix.
- Do not add DOCX output, production deployment, database/config mutation, or R2 work.
- Any changed denominator, unresolved queue, missing artifact, stale candidate, or unproved rollback stops this ticket.

## Superseded-ticket mapping

Old Ticket 43; historical Old Tickets 63–64.

## Acceptance criteria

- [ ] Deliver exactly the approved end-to-end slice, membership, blocker, model route, and downstream obligation.
- [ ] Preserve Student/Teacher answer visibility, canonical semantics, recovery/rollback, and all required public-seam evidence.
- [ ] Run the affected checks and final ticket-closure suite required by current repository authority.
- [ ] Record exact candidate, verification, review/QA state when applicable, and result commit.

## Result

Commit:
Verify:
Notes:
