# 60 — Migrate NCK1 batch B

Status: ready
Blocked by: 59 — Migrate NCK1 batch A
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/61-migrate-nck1-batch-c.md`
Terminal: no

## What to build

Atomically migrate and artifact-verify `paper-2022-i`, `paper-2022-ii`,
`paper-2023-i`, and `paper-2023-ii`.

## Acceptance criteria

- [ ] Each paper has source-backed NCK1 Profile and complete required slots.
- [ ] Compile, Publication, reopen, switch, exact reload, actual artifacts,
      retry, and rollback pass for all four.
- [ ] All evidence corrections remain immutable and source-traceable.
- [ ] One failure keeps the batch incomplete and prior selections unchanged.
- [ ] Focused batch checks, ordinary self-check, full verify, and
      `git diff --check` pass with durable hashes.

## Result

Commit:
Verify:
Notes:
