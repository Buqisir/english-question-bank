# 57 — Migrate Zhejiang legacy batch A

Status: ready
Blocked by: Ticket 56 independent review PASS and owner QA acceptance
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/58-migrate-zhejiang-batch-b.md`
Terminal: no

## What to build

Atomically migrate and artifact-verify `paper-zj-2020-jan`,
`paper-zj-2021-jan`, and `paper-zj-2021-jun`.

## Acceptance criteria

- [ ] Every paper has source-backed Zhejiang Profile and exact active,
      inactive, and writing closure.
- [ ] Compile, Publication, reopen, switch, exact reload, actual artifacts,
      retry, and rollback pass for all three.
- [ ] Zero/two starter, headings, answers, and duplicate-payload provenance
      remain evidence-bound.
- [ ] One failure keeps the batch incomplete and prior cohorts unchanged.
- [ ] Focused batch checks, ordinary self-check, full verify, and
      `git diff --check` pass with durable hashes.

## Result

Commit:
Verify:
Notes:
