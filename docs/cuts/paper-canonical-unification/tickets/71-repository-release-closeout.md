# 71 — Repository release closeout

Status: ready
Blocked by: Ticket 70 independent review PASS and owner QA acceptance
Next on PASS: DONE
Terminal: yes

## What to build

Complete the repository release boundary for the fully reviewed and
owner-accepted cut: verify evidence, run or consume final checks, push and
merge, confirm `main` CI, and record the material release without executing
production or R2 work.

## Acceptance criteria

- [ ] Tickets 01–70 are done; every required independent review lineage has no
      Must Fix; every required owner QA verdict is accepted.
- [ ] The 33-paper closure and six ordered family retirements remain
      reproducible with zero unresolved queue and complete rollback refs.
- [ ] Full verify or exact PR CI is green with no undeclared FAIL or unknown
      SKIP.
- [ ] Worktree, remote, ancestry, target, and clean state are verified; the
      feature branch is pushed and merged without rewriting unrelated work.
- [ ] `main` CI is confirmed green and the status file records the material
      release in at most five lines.
- [ ] No production command, production database/configuration change, R2
      mutation, or production backfill is performed.
- [ ] The final response reports exact commits/evidence and `DONE`.

## Result

Commit:
Verify:
Notes:
