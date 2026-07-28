# 53 — Migrate `paper-2020-bing` canary

Status: ready
Blocked by: 52 — Migrate `paper-960d0f8d` canary
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/54-migrate-paper-zj-2020-jul-canary.md`
Terminal: no

## What to build

Migrate the national-legacy `paper-2020-bing` canary with source-backed
Profile structure and no fabricated Writing Groups.

## Acceptance criteria

- [ ] The national legacy Profile and all active/inactive/N/A slots are proven
      from whole-paper source structure.
- [ ] Compile, Publication, reopen, switch, exact reload, retry, and rollback
      pass with no invented writing content.
- [ ] Actual Screen, Print/PDF, and DOCX artifacts preserve the accepted
      national legacy paper shape.
- [ ] Failure blocks the paper and next canary without changing the denominator.
- [ ] Focused migration/artifact checks, ordinary self-check, full verify, and
      `git diff --check` pass with durable hashes.

## Result

Commit:
Verify:
Notes:
