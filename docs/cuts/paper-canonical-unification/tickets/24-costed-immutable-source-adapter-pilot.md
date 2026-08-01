# 24 — Costed immutable-source-adapter pilot — `paper-2026-i`

Status: ready
Blocked by: Ticket 23 approved publication and exact manifest-digest approval
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/25-source-adapter-recovery-cluster-a.md`
Terminal: no

## What to build

对最高成本、12 documents、88 units、risk 17 的 paper 建立注册不可变 source envelope；零写编译并实测新 diagnostics、family、成本和风险；不迁移

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

Old 21–50 pilot

## Result

Commit:
Verify:
Notes:
