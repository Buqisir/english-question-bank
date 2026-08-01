# 72 — Retire Cloze legacy path

Status: ready
Blocked by: Ticket 71 independent review PASS
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/73-retire-grammar-fill-legacy-path.md`
Terminal: no
Model: gpt-5.6-terra
Effort: high
Parallel lane: none; downstream route is serial

## What to build

先证明 canonical-only public behavior，再删除 Cloze legacy selection/fallback，并保留 rollback 证据。

## Approved membership

- `Cloze complete frozen denominator`

## Measured/costed capacity

- One family retirement after full-corpus closure.

## Fail-closed boundary

- Preserve whole-paper atomicity, immutable historical inputs, zero-write behavior where required, recovery/retry/rollback proof, and the Screen plus Print/PDF artifact matrix.
- Do not add DOCX output, production deployment, database/config mutation, or R2 work.
- Any changed denominator, unresolved queue, missing artifact, stale candidate, or unproved rollback stops this ticket.

## Superseded-ticket mapping

Old Ticket 46; historical Old Ticket 65.

## Acceptance criteria

- [ ] Deliver exactly the approved end-to-end slice, membership, blocker, model route, and downstream obligation.
- [ ] Preserve Student/Teacher answer visibility, canonical semantics, recovery/rollback, and all required public-seam evidence.
- [ ] Run the affected checks and final ticket-closure suite required by current repository authority.
- [ ] Record exact candidate, verification, review/QA state when applicable, and result commit.

## Result

Commit:
Verify:
Notes:
