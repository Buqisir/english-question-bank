# 58 — Migrate Zhejiang legacy batch B

Status: ready
Blocked by: 57 — Migrate Zhejiang legacy batch A
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/59-migrate-nck1-batch-a.md`
Terminal: no

## What to build

Atomically migrate and artifact-verify `paper-zj-2022-jan` and
`paper-zj-2022-jun`, closing the remaining Zhejiang legacy cohort.

## Acceptance criteria

- [ ] Both papers have source-backed Zhejiang Profile and exact required slot
      closure.
- [ ] The polluted three-starter case is corrected only through new immutable
      evidence/review or remains blocking.
- [ ] Compile, Publication, reopen, switch, exact reload, actual artifacts,
      retry, and rollback pass for both.
- [ ] Remaining Zhejiang accounting is five/five and prior cohorts remain
      reproducible.
- [ ] From the exact reviewed HEAD, the task provisions and opens the Zhejiang
      Profile/starter-boundary artifacts with the canonical QA checklist; QA
      pauses for owner verdict.
- [ ] Focused batch checks, ordinary self-check, full verify, and
      `git diff --check` pass with durable hashes.

## Result

Commit:
Verify:
Notes:
