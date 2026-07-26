# 29 — Release-candidate closeout

Status: ready
Blocked by: 28 — Retire Continuation Writing consumer legacy interpretation
Next on PASS: DONE
Terminal: yes

## What to build

Ship the completed cut through the repository release boundary: verify the
exact clean feature branch, consume all required review/QA/migration evidence,
run or consume the final release checks, push and merge, confirm `main` CI, and
update `docs/STATUS.md` in at most five lines.

## Acceptance criteria

- [ ] Tickets 01–28 are done; every required independent review lineage has no
      Must Fix; every required owner QA verdict is accepted.
- [ ] The 33-paper canonical closure and six ordered legacy retirements remain
      reproducible at the exact release HEAD, with zero unresolved queue and
      complete rollback references.
- [ ] `pnpm -C app run verify:all` or exact PR CI is green; literal
      PASS/SKIP/FAIL has no undeclared FAIL or unknown SKIP.
- [ ] Worktree is clean, remote/ancestry/target are verified, the feature
      branch is pushed, and the change is merged without rewriting unrelated
      work.
- [ ] `main` CI is confirmed green and `docs/STATUS.md` records the material
      release in at most five lines.
- [ ] The final response reports exact branch/commits/evidence and `DONE`.

## Out of scope

No production server command, production DB/backfill, production
configuration, R2 synchronization/mutation, stable `paper-asset-v2`,
historical `versions/vN` compilation, active listening, or deferred adapter
consolidation.

## Result

Commit:
Verify:
Notes:
