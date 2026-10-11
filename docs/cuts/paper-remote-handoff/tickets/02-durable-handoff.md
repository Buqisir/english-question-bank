# 02 — Unpublished remote handoff without repeated large files

Status: local upload dedup, mount guard and inspection-only cleanup implemented;
behavioral acceptance and live custody pending; not shipped
Depends on: [01](01-exact-restore.md)
Spec: [paper-remote-handoff](../spec.md)

## Outcome

The server holds the complete unpublished paper independently of the Mac, and
an operator can determine precisely whether its local task-owned files are safe
to remove. Approval/publication is not a prerequisite for remote custody.

## Scope

Audit restore coverage against real import inputs, including OCR correction
bindings, four frozen products, audio evidence, profile sidecars and pagination
inputs. Reuse `blobStore.mjs` and existing manifest descriptors; extend private
storage to Review and exact recovery rather than archive only at publication.
All consumers must retain authorization and verify bytes. Preserve old finalized
manifests and provide compatible reads; no mass rewrite of historical identity.

Separate durable file archival from independent backup. Define exact-version
backup evidence using consistent database/file recovery, not bucket listing or
recent log timestamps. Dedup must count physical object bytes, not just manifest
entries. No automatic blob deletion in ingestion or publication.

Provide an inspection-only local cleanup inventory with explicit allowed paths,
sizes, remote identity and rejection reasons. Add actual cleanup only after the
deletion policy and bounded existing-batch paths receive Owner authorization.
Do not delete a worktree, personal source folder or unknown failed operation.

## Acceptance

- Restoring to a fresh empty workspace succeeds without the original Mac path.
- Identical audio/source files across two revisions use one immutable object
  per distinct byte sequence, while unauthorized reads remain rejected.
- Corrupt/missing objects, incomplete backup, stale input and active work each
  prevent cleanup eligibility; dry-run never deletes anything.
- Public products and private evidence cannot become mixed between versions.
- A mount failure prevents writes rather than falling back to the system disk.
- R2 backup failure is resolved and isolated restore is proven before live
  deletion eligibility; production operations require their reviewed approval.

## Implemented slice and limitations

Local Review uploads of audio, PDF and image files now pass through the existing
private SHA-addressed blob store before upload completion. Revision paths remain
ordinary files backed by hard links to the same immutable object. Uploaded bytes
and existing objects are checked with bounded streaming reads. Different original
and playback bytes remain different objects. Small JSON and historical revision
directories are unchanged; there is no historical migration or object deletion.

The local Review file root and configured blob root must share a filesystem.
Cross-device linking fails instead of quietly making another copy. New-disk
deployment must place both roots on that disk and configure the opt-in UUID/mount
guard. The guard checks the expected block device and actual root filesystems;
host mount ordering and non-writable unmounted directories remain necessary to
close unmount races. R2 mode retains its
existing upload/cache behavior and is not claimed as locally deduplicated.
Publication's existing local blob put reuses a verified object without writing
another temporary full copy; legacy public asset copies are not migrated here.

The existing storage verifier now exercises the real Review upload route and
store, physical inode sharing, distinct bytes, invalid uploads, authentication,
reference removal and corrupt-object rejection. Syntax and diff checks passed;
the behavioral verifier has not run under the pre-Ship cadence.

Restore coverage audit also found that the Candidate manifest contains the v2
OCR correction report but not `signals/agent-proofreading-receipt.json`. The
authenticated OCR confirmation endpoint now permits an already-confirmed,
finalized superseded OCR revision as well as an approved current one. Hydrate
retrieves that exact receipt, checks its paper/source/evidence/confirmation
binding and writes it unchanged. Missing or mismatched evidence aborts the
restore. Neither active intake claims nor new approvals are created. CLI and
historical-endpoint regression cases are written; behavioral acceptance remains
pending.

The backup script now includes the local private blob root and checks configured
mount identity before taking snapshots. It has not run; existing dated-copy
retention/pruning behavior is unchanged. This is not backup verification and
does not remove historical Review/public or off-site duplicate copies.

`review.mjs cleanup-plan --revision` inventories only the standard paper folder.
It preserves tracked, changed, non-manifest and symlink/special entries and does
not follow directory symlinks. It reports logical/allocated size and link counts,
but no reclaimed-byte estimate or deletion eligibility. Remote product reads,
independent backup/restore, task ownership and safe-stop evidence are explicit
blockers. CLI regression cases are written, not executed.

Complete recovery coverage and version-bound backup evidence remain pending.
No current result authorizes Mac cleanup or claims independent backup, durable
handoff acceptance, or live space savings. The reviewed execution boundary is
documented in [host-pilot](../host-pilot.md).
