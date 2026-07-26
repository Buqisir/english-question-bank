# 61 — Migrate NCK1 batch C

Status: ready
Blocked by: 60 — Migrate NCK1 batch B
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/62-migrate-nck1-batch-d.md`
Terminal: no

## What to build

Atomically migrate and artifact-verify `paper-2024-i`, `paper-2024-ii`,
`paper-2025-i`, and `paper-2025-ii`.

## Acceptance criteria

- [ ] Each paper has source-backed NCK1 Profile and complete required slots.
- [ ] Compile, Publication, reopen, switch, exact reload, actual artifacts,
      retry, and rollback pass for all four.
- [ ] Current database version leads do not fabricate missing filesystem
      histories.
- [ ] One failure keeps the batch incomplete and prior selections unchanged.
- [ ] Focused batch checks, ordinary self-check, full verify, and
      `git diff --check` pass with durable hashes.

## Result

Commit:
Verify:
Notes:
