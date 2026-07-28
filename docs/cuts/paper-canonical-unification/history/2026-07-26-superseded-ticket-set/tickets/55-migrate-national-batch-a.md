# 55 — Migrate national legacy batch A

Status: ready
Blocked by: Ticket 54 independent review PASS and owner QA acceptance
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/56-migrate-national-batch-b.md`
Terminal: no

## What to build

Atomically migrate and artifact-verify `paper-2020-jia`,
`paper-2021-jia`, `paper-2021-yi`, and `paper-2022-jia`.

## Acceptance criteria

- [ ] Each paper has source-backed national legacy Profile and exact
      active/inactive/N/A closure.
- [ ] Every disposition and source/answer join is closed before Publication.
- [ ] Each paper passes compile, seal, reopen, switch, exact reload, actual
      three-surface artifacts, retry, and rollback.
- [ ] One failure keeps the four-paper batch incomplete and preserves all
      prior canaries and denominator equations.
- [ ] Focused batch checks, ordinary self-check, full verify, and
      `git diff --check` pass with durable hashes.

## Result

Commit:
Verify:
Notes:
