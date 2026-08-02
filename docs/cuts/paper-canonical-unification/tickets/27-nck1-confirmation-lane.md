# 27 — NCK1 Import Candidate and Teacher Confirmation lane

Status: ready
Blocked by: Ticket 26 PASS
Next on PASS: parallel join handoff
Terminal: no
Parallel frontier: not-applicable
Parallel join: `docs/cuts/paper-canonical-unification/tickets/30-integrate-confirmed-canonical-corpus.md`
Model: gpt-5.6-terra
Effort: max
Parallel lane: NCK1; isolated worktree from exact Ticket 26 PASS commit

## What to build

Run the unchanged accepted adapter over the 16 NCK1-lane Source Captures,
resolve deterministic issues through explicit Teacher Confirmation, and
produce 16 complete unpublished Canonical Papers or fail with an exact
unresolved-paper list.

## Approved membership

`paper-2020-i`, `paper-2020-ii`, `paper-2021-i`, `paper-2021-ii`,
`paper-2022-i`, `paper-2022-ii`, `paper-2023-i`, `paper-2023-ii`,
`paper-2024-i`, `paper-2024-ii`, `paper-2025-ii`, `paper-960d0f8d`,
`paper-zj-2023-jan`, `paper-zj-2024-jan`, `paper-zj-2025-jan`, and
`paper-zj-2026-jan`.

## Write surfaces

- Exclusive: the listed papers' candidates, confirmation decisions, fixtures,
  and lane evidence.
- Forbidden: every other paper; shared module/schema/authority files; migration
  ledger/manifest; publication/current refs; route receipts.

## Acceptance criteria

- [ ] Exact source digests, deterministic issues, and candidate identities close for all 16 papers.
- [ ] Teacher decisions bind to exact candidates and no caller-authored semantics become authority.
- [ ] Missing active content and answer conflicts remain unresolved; inactive non-rendered `not_supplied` slots do not block unrelated readiness.
- [ ] The unchanged adapter/schema/authority versions are preserved.
- [ ] Narrow per-paper checks and lane aggregate accounting pass; no per-paper full suite, authority bump, or independent code review is performed.
- [ ] Return one lane-result handoff to Ticket 30; do not dispatch the join until Tickets 27–29 all PASS.

## Superseded-ticket mapping

Collapses old Tickets 27–42 into one data lane.

## Result

Commit:
Verify:
Notes:
