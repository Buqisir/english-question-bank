# 17 — Import recovery, retry, and rollback

Status: ready
Blocked by: 16 — Atomic canonical import admission
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/18-backend-canonical-import-pilot.md`
Terminal: no

## What to build

Make the public canonical import flow deterministic across failures, process
restart, retry, digest conflict, stale load, and rollback.

## Acceptance criteria

- [ ] Forced pre-commit failure restores exact prior state.
- [ ] Forced post-commit failure recovers only the committed target after
      restart.
- [ ] Identical retry is idempotent and conflicting digest identity fails
      closed.
- [ ] Stale/corrupt load fails and rollback restores one validated prior
      Publication or exact prior Consumer Contract.
- [ ] Rollback may close canonical import but cannot re-enable non-canonical or
      partial new import.
- [ ] Focused fault-injection checks, ordinary Standards + Spec self-check,
      app/server checks, full verify, and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
