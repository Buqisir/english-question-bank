# 37 — Measured migration cohort A

Status: ready
Blocked by: Ticket 36 independent review PASS
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/38-measured-migration-cohort-b.md`
Terminal: no

## What to build

5 papers / 328 units；逐纸 atomic publish、reload、Screen/Print/PDF、retry/rollback

## Approved membership

- `paper-2022-i`
- `paper-zj-2026-jan`
- `paper-zj-2021-jan`
- `paper-2020-jia`
- `paper-2021-jia`

## Capacity and fail-closed rule

- Pilot is 1 paper / 88 units.
- Diagnostic clusters are capped at 328 units and 5 papers.
- Migration canaries contain 1 paper each.
- Migration cohorts are capped at 328 units and 5 papers.
- This ticket must reserve implementation, ordinary Standards/Spec review, and fix room within about 150K context. If new diagnostics increase risk or change the approved shape, fail closed instead of absorbing more scope.
- Any correction may only add an immutable Source Capture or an explicit review decision; it must not edit historical source, answer, or Publication bytes in place.

## Acceptance criteria

- [ ] Deliver exactly the approved slice above without merging, splitting, or broadening it.
- [ ] Preserve the approved blocker, membership, old-ticket mapping, and capacity/fail-closed rule.
- [ ] Run the affected checks required by current repository authority and record the result below.

## Superseded-ticket mapping

Old 55–62

## Result

Commit:
Verify:
Notes:
