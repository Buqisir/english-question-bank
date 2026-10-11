# 04 — Repair and recover one exact published paper

Status: restore-base protection and exact published feedback implemented locally;
behavioral acceptance and bounded recovery exercise pending
Depends on: [01](01-exact-restore.md), [02](02-durable-handoff.md)
Spec: [paper-remote-handoff](../spec.md)

## Outcome

A problem reported against a published version can produce a new private
Candidate without changing the current public paper. The Owner rechecks the
product and separately authorizes its replacement or severe-issue mitigation.

## Scope

Bind public feedback to the actual Canonical publication and originating Review
revision, not mutable latest. Preserve one paper identity and one active writer.
Reconcile a historical issue against current changes before creating a repair;
carry an expected current base through submission/finalization to reject races.
Reuse issue resolution, approval and single-paper promotion. Restore old
evidence; never regenerate authority from a fresh model answer.

Expose bounded operator recovery using existing publication journals and
version identities, not whole-database restoration. Suspension/rollback is
Owner-authorized and single-paper/product scoped. A publication rollback must
not rewind user data, unrelated papers, or newer writes. UNKNOWN stays under
read-only reconciliation; no blind replay or automatic guard removal.

## Acceptance

- A v1 issue can be inspected while v2 exists without silently treating it as
  v2 feedback or overwriting v2; stale-base repairs are rejected.
- Failed repair upload leaves the old finalized and public products readable.
- Owner approval alone does not publish. A later authorized promotion binds
  the exact approved identity and verifies real public products afterward.
- Interrupted publication, authorized rollback and denied recovery targets are
  exercised in isolation; no live publication is used as an unapproved test.
- Local repair files become removable only through ticket 02's custody checks.

## Implemented slice

Hydrate records a local origin/paper/revision/bundle binding, separate from
approval or intake claims. Push carries its restored revision as
`expectedBaseRevisionId`. The server checks that base both at revision creation
and inside the finalization transaction. A competing revision finalized during
upload leaves the stale upload retained and rejects its finalization. An exact
retry of the current already-finalized upload remains idempotent.

The CLI regression checks historical restore-to-push base propagation. The
existing source-intake base-revision regression covers two overlapping repairs,
retention of the rejected upload and successful exact replay. Tests are written,
not yet executed under the pre-Ship cadence.

Published feedback binds paper, asset version and Canonical publication digest
to the unique completed Review promotion. A v1 report can be recorded while a
private v2 exists without clearing the historical approval or replacing public
content. Screen loads its asset/sidecars from the version selected by consumption,
not mutable latest. Tests cover old-public/new-private feedback, forged version
rejection and preserved approvals through existing structured issue routes; they
have not run. The product UI only hands off discussion to Amp. New screenshot
storage and combined repair-closing approval from the rejected form were removed;
existing authorized issue closure remains separate from approval and publication.

Historical correction reconciliation and the isolated bounded recovery exercise
remain pending. No new rollback automation is implemented. Operators must use
the existing publication journal/recovery contract only after exact-target
authorization; normal feedback never starts that path. No publication, rollback
or production mutation has occurred.
