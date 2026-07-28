# 56 — Migrate national legacy batch B

Status: ready
Blocked by: 55 — Migrate national legacy batch A
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/57-migrate-zhejiang-batch-a.md`
Terminal: no

## What to build

Atomically migrate and artifact-verify `paper-2022-yi`,
`paper-2023-jia`, `paper-2023-yi`, and `paper-2024-jia`, closing the
remaining national legacy cohort.

## Acceptance criteria

- [ ] Each paper has source-backed national Profile and exact required slots.
- [ ] Compile, Publication, reopen, switch, exact reload, actual artifacts,
      retry, and rollback pass for all four.
- [ ] Remaining national accounting is eight/eight and prior canaries remain
      reproducible.
- [ ] A single failure keeps the cohort incomplete without hidden skip or
      denominator change.
- [ ] From the exact reviewed HEAD, the task provisions and opens the national
      Profile/risk-boundary page and artifacts with the canonical QA checklist;
      QA pauses for owner verdict.
- [ ] Focused batch checks, ordinary self-check, full verify, and
      `git diff --check` pass with durable hashes.

## Result

Commit:
Verify:
Notes:
