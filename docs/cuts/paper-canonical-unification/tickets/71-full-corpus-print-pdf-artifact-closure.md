# 71 — Full-corpus Print/PDF artifact closure

Status: ready
Blocked by: 70
Next on PASS: independent review
Terminal: no
Model: gpt-5.6-terra
Effort: max
Independent review model: gpt-5.6-sol
Independent review effort: high
Parallel lane: none; downstream route is serial

## What to build

汇总并验证 Student/Teacher Print HTML 与 direct Chromium PDF 的 A4、语义、答案边界、分页和 rollback artifact proof。

## Approved membership

- `Frozen 33-paper denominator`

## Measured/costed capacity

- 33-paper Student/Teacher Print HTML and direct-PDF closure.

## Fail-closed boundary

- Preserve whole-paper atomicity, immutable historical inputs, zero-write behavior where required, recovery/retry/rollback proof, and the Screen plus Print/PDF artifact matrix.
- Do not add DOCX output, production deployment, database/config mutation, or R2 work.
- Any changed denominator, unresolved queue, missing artifact, stale candidate, or unproved rollback stops this ticket.

## Superseded-ticket mapping

Old Ticket 45; historical Old Tickets 63–64 Print/PDF.

## Acceptance criteria

- [ ] Deliver exactly the approved end-to-end slice, membership, blocker, model route, and downstream obligation.
- [ ] Preserve Student/Teacher answer visibility, canonical semantics, recovery/rollback, and all required public-seam evidence.
- [ ] Run the affected checks and final ticket-closure suite required by current repository authority.
- [ ] Record exact candidate, verification, review/QA state when applicable, and result commit.

## Result

Commit:
Verify:
Notes:
