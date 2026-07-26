# 59 — Migrate NCK1 batch A

Status: ready
Blocked by: Ticket 58 independent review PASS and owner QA acceptance
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/60-migrate-nck1-batch-b.md`
Terminal: no

## What to build

Atomically migrate and artifact-verify `paper-2020-i`, `paper-2020-ii`,
`paper-2021-i`, and `paper-2021-ii`.

## Acceptance criteria

- [ ] Each paper has source-backed NCK1 Profile, nine active Groups, and exact
      required inactive/N/A closure.
- [ ] Compile, Publication, reopen, switch, exact reload, actual artifacts,
      retry, and rollback pass for all four.
- [ ] Marker, heading, writing, answer, and Profile decisions remain
      evidence-bound.
- [ ] One failure keeps the batch incomplete and prior cohorts unchanged.
- [ ] Focused batch checks, ordinary self-check, full verify, and
      `git diff --check` pass with durable hashes.

## Result

Commit:
Verify:
Notes:
