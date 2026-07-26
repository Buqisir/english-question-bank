# 08 — Canonical-required new-import hard gate

Status: ready
Blocked by: 07 — Listening required inactive-source closure
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/09-freeze-corpus-dry-run.md`
Terminal: no

## What to build

Open the whole-paper canonical admission latch at the public
`publishPaperImportPackage(...)` seam. Update the backend agent/runbook so one
new source package is captured, compiled, sealed, validated, atomically
published, reloaded, and recoverable through the accepted Modules.

## Acceptance criteria

- [ ] The public publisher itself requires every Profile-required active
      family `available`, all inactive closures implemented, one complete
      `ready` Plan/Groups package, and a valid Publication/Consumer Contract
      before its first store write.
- [ ] Four blocked dispositions, unavailable family, stale/corrupt
      Publication, and injected authority/Profile mismatch return structured
      failure and preserve DB rows, refs, asset tree, latest bytes, versions,
      and journal byte-for-byte.
- [ ] Ready flow follows compile → in-memory seal/load → stage → staged
      reopen → journaled commit → exact committed reload.
- [ ] Forced pre/post-commit failure, process recovery, idempotent retry,
      digest conflict, stale load, and prior-Publication rollback pass through
      the public seam.
- [ ] Rollback can close canonical import but cannot re-enable non-canonical
      new import or partial family publication.
- [ ] One new local source package completes dry-run, successful publish,
      reload, actual Screen/student-teacher Print-PDF/DOCX, and rollback/retry.
- [ ] Runbook and mechanical pipeline point to the executable authority and
      public admission seam; no website import UI or operator-only bypass is
      introduced.
- [ ] Focused checks, app/server checks, full verify, and `git diff --check`
      pass.
- [ ] A fresh independent review lineage is green and integrated provisioned
      owner QA is accepted before the ticket is marked done.

## Out of scope

No current-`latest` migration, production import, production/R2 change,
historical compilation, or legacy deletion.

## Result

Commit:
Verify:
Notes:
