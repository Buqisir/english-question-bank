# 62 — Boundary canary 4 — Zhejiang dual-session shape

Status: ready
Blocked by: 61
Next on PASS: independent review
Terminal: no
Model: gpt-5.6-terra
Effort: max
Independent review model: gpt-5.6-sol
Independent review effort: medium
Parallel lane: none; downstream route is serial

## What to build

原子迁移 `paper-zj-2022-jun`，闭合相同 public seams 与 rollback；汇总四个 boundary canaries。

## Approved membership

- `paper-zj-2022-jun`

## Measured/costed capacity

- One paper / 66 Ticket 22 baseline units; migration cost must be measured on the exact candidate.

## Fail-closed boundary

- Preserve whole-paper atomicity, immutable historical inputs, zero-write behavior where required, recovery/retry/rollback proof, and the Screen plus Print/PDF artifact matrix.
- Do not add DOCX output, production deployment, database/config mutation, or R2 work.
- Any changed denominator, unresolved queue, missing artifact, stale candidate, or unproved rollback stops this ticket.

## Superseded-ticket mapping

Old Ticket 36; historical Old Tickets 51–54.

## Acceptance criteria

- [ ] Deliver exactly the approved end-to-end slice, membership, blocker, model route, and downstream obligation.
- [ ] Preserve Student/Teacher answer visibility, canonical semantics, recovery/rollback, and all required public-seam evidence.
- [ ] Run the affected checks and final ticket-closure suite required by current repository authority.
- [ ] Record exact candidate, verification, review/QA state when applicable, and result commit.

## Result

Commit:
Verify:
Notes:
