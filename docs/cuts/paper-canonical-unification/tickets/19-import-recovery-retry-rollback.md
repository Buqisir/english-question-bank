# 19 — Import recovery, retry, and rollback

Status: done
Blocked by: 18 — Atomic canonical import admission
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/20-backend-canonical-import-pilot.md`
Terminal: no

## What to build

Make the public canonical import flow deterministic across failures, process
restart, retry, digest conflict, stale load, and rollback.

## Acceptance criteria

- [x] Forced pre-commit failure restores exact prior state.
- [x] Forced post-commit failure recovers only the committed target after
      restart.
- [x] Identical retry is idempotent and conflicting digest identity fails
      closed.
- [x] Stale/corrupt load fails and rollback restores one validated prior
      Publication or exact prior Consumer Contract.
- [x] Rollback may close canonical import but cannot re-enable non-canonical,
      partial, or generated-DOCX output behavior.
- [x] Focused fault-injection checks, ordinary Standards + Spec self-check,
      app/server checks, full verify, and `git diff --check` pass.

## Superseded-ticket mapping

Replaces old Ticket 17.

## Result

Commit: `63fbbaec`; `f0566307`; `dde9f530`
Verify: canonical import recovery/retry/rollback PASS; canonical Publication
seam PASS; normalization import gate PASS; C7 publish 36/36; app build PASS;
`verify:all` 112 PASS / 1 declared SKIP / 0 FAIL; `git diff --check` PASS.
Notes: Publish and rollback now use durable journals before immutable version
rename, reconcile SQLite current authority with exact latest identity after
restart, validate committed canonical-only consumers before cleanup, make the
interrupted identical retry idempotent, and reject a conflicting digest.
Public-seam child-process fault injection covers the pre-commit orphan window;
post-commit restart, stale/corrupt load, and rollback retain only validated
Screen and Print/PDF canonical outputs. Initial Standards + Spec Must Fixes are
closed and the final focused re-review passed on both axes.
