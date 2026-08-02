# 29 — Zhejiang-legacy Import Candidate and Teacher Confirmation lane

Status: ready
Blocked by: Ticket 26 PASS
Next on PASS: parallel join handoff
Terminal: no
Parallel frontier: not-applicable
Parallel join: `docs/cuts/paper-canonical-unification/tickets/30-integrate-confirmed-canonical-corpus.md`
Model: gpt-5.6-terra
Effort: max
Parallel lane: Zhejiang-legacy; isolated worktree from exact Ticket 26 PASS commit

## What to build

Run the unchanged accepted adapter over the six Zhejiang-legacy Source
Captures, obtain candidate-bound Teacher Confirmation, and produce six
complete unpublished Canonical Papers or fail with exact unresolved issues.

## Approved membership

`paper-zj-2020-jan`, `paper-zj-2020-jul`, `paper-zj-2021-jan`,
`paper-zj-2021-jun`, `paper-zj-2022-jan`, and `paper-zj-2022-jun`.

## Write surfaces

- Exclusive: the listed papers' candidates, confirmation decisions, fixtures,
  and lane evidence.
- Forbidden: every other paper; shared module/schema/authority files; migration
  ledger/manifest; publication/current refs; route receipts.

## Acceptance criteria

- [ ] Exact source digests, deterministic issues, and candidate identities close for all six papers.
- [ ] Teacher decisions bind to exact candidates and no caller-authored semantics become authority.
- [ ] Dual-session/Profile variation is expressed as confirmed paper data, not a new mirrored validation layer.
- [ ] The unchanged adapter/schema/authority versions are preserved.
- [ ] Narrow per-paper checks and lane aggregate accounting pass; no per-paper full suite, authority bump, or independent code review is performed.
- [ ] Return one lane-result handoff to Ticket 30; do not dispatch the join until Tickets 27–29 all PASS.

## Superseded-ticket mapping

Collapses old Tickets 52–57 into one data lane.

## Result

Commit:
Verify:
Notes:
