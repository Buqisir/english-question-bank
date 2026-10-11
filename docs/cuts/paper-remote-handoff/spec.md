# 试卷远端接管、极简审核与修订

Status: local implementation and synthetic UI preview prepared; backend acceptance,
live custody and migration pending; uncommitted, not shipped or deployed
Owner decisions: 2026-10-11, thread T-01a12024-9f2c-707e-82a4-828c4cff447f

## Outcome and authority

Mac is a temporary import/repair workspace, not the long-term paper archive.
After the server has durably accepted an unpublished paper, the Owner can view
its products online and the task-owned Mac copy can eventually be removed,
without waiting for approval or publication. A later repair starts from the
exact remote version, not from an old computer or a fresh OCR/model run.

The Owner accepted these choices:

- Feedback is discussed in Amp. Repair starts only
  when the Owner asks in Amp; no automatic worker wake-up or repair queue.
- Include the existing M168/M169/M170/M171/M172/M174 batch, paper by paper.
  An incomplete paper is not cleanup-eligible because another paper passed.
- Severe public defects are reported first. Pausing a paper or download needs
  explicit Owner authorization; no automatic unpublishing.
- Default review is the real Screen product. PDFs and listening are optional
  product controls, not required administrative steps.
- Latest Owner correction: the website has one “去 Amp 聊这份卷” button, which
  copies the paper identity/viewed version/link and opens its associated thread.
  The Owner pastes and chats; no message is sent automatically. There is no website
  feedback form, checklist or confirmation button. This supersedes both previous
  feedback forms. No chat-to-Owner credential
  bridge is authorized or implemented; existing approval/publication gates remain.
- Existing review gates remain effective but reports, hashes, checklists,
  version tables and issue-management chores are not the Owner's primary UI.
- Newly created threads for this Goal must use `features: [fast]`. This does
  not change their agent mode or require creating more threads.

The present authorization covers the plan and local reversible implementation.
It does not authorize disk initialization, production migration/configuration,
R2 writes/deletion, local paper deletion, Git push/merge, deployment, approval,
or paper promotion. Prepare exact operations and evidence before requesting
those separately bounded actions. Existing unrelated work is preserved.

## Starting baseline, not current completion claims

Baseline is current `origin/main` at the start of this task, in a separate
`feat/paper-remote-handoff` worktree. Reinspect before implementing later slices.

- `review.mjs hydrate` already restores the latest finalized Candidate, checks
  every downloaded file and rebuilds the projection in a temporary directory.
  It refuses an existing local workspace. It does not select a historical
  revision or certify that deleting other local files is safe.
- Review paper status already includes revision manifests. `/files` reads an
  exact authorized revision. Reuse these rather than add a parallel restore API.
- `server/paper-import/blobStore.mjs` already has private content-addressed
  local/R2 storage and publication archival. Review directories still retain
  their own files; archival alone is not end-to-end deduplication or backup.
- Canonical consumers, four frozen PDF products, Owner approval and single-paper
  promotion already exist. Preserve their exact identities and permissions.
- Scoped-publication UI currently has a separate grant step. Do not remove its
  security requirement, impersonate the Owner or distribute shipping secrets
  merely to simplify the product page. Amp publication must use the existing
  authorized shipping route; unavailable authority is a reported blocker.
- Do not revive the retired automatic source-intake dispatcher, old local
  publish/whole-database upload, or legacy teaching-analysis requirements for
  current public-paper imports.

## Product experience

The Owner receives a small list of paper names or a direct product link. Opening
one shows Screen, not a dashboard or a report. Reuse PaperBrowse/PaperSurface;
do not implement a second paper renderer or a website import UI.

Expose the four current products (`largeComplete`, `largeNoListening`,
`economy8`, `answerOnly`) through a compact PDF control and retain listening
playback. Print remains the existing shared rendering surface, not a second
student/teacher product catalogue. There is no website confirmation or publication
button. Confirmation discussed in Amp must name the exact viewed revision/bundle;
feedback text itself never creates approval. Unfinished or stale content cannot
be approved merely because its product looks acceptable. An authorized technical
approval route is still required; report its absence instead of impersonating
the Owner or asking for routine review-form work again.

The handoff copies the paper name, stable ID, exact viewed revision/publication
and preview link. It never substitutes the latest Candidate or invents a question
or PDF page. Published handoffs distinguish the public URL (which may advance)
from the corresponding publication's exact private Review preview; a missing
mapping is stated rather than substituting latest. Use the explicit per-paper
discussion-thread binding, set by an authorized operator using compare-and-set.
Do not infer it from ambient thread IDs or publication audit fields. Unbound papers
offer copy only. Denied clipboard access exposes manual copy text; a blocked tab
offers an explicit thread link. Clarify intent, feedback and repair scope in Amp.

Re-review opens the changed question/page and gives one short change summary.
No new review-management page and no mandatory issue-by-issue closing routine.
The server still maintains unresolved/fixed-pending-review state. Broader
changes explicitly name the broader product/page range to inspect.

Private preview uses the authenticated website origin, never a Mac localhost
link, public attachment URL or anonymous content-hash URL. Opening products
must not trigger source rasterization, OCR/ASR or whole-paper PDF generation on
the small production host. Frozen PDFs are served as exact bytes. Source-heavy
validation belongs before finalization, not in ordinary product reads.

## Ownership, versions and repair

One paper identity persists through all repairs. Every finalized revision and
publication remains immutable. A repair names its source revision, current
expected base and resolved issue IDs; concurrent advancement blocks submission
until reconciled. Do not blindly use the latest version for historical feedback.

Restore original files, materialization, profile-specific sidecars, pagination
inputs, frozen products and necessary source-correction evidence. Historical
OCR receipts remain evidence; restore must not move an active source claim or
give a new worker another thread's authority. Record the renderer/tool versions
needed for reproduction. Missing material is a blocker, not permission to OCR
again or manufacture receipts.

Fix only the identified responsibility. An audio-only repair does not change
answers; a PDF layout repair does not change source text; a shared renderer fix
must establish its affected-paper range. Reuse unchanged immutable files and
regenerate affected products, then run their required checks. Uploading a repair
never replaces the publicly served version. An uncertain response is reconciled
read-only before any replay.

## Storage and backup

Reuse private content-addressed storage for large immutable files. Preserve
descriptor bytes/digests and authorization while allowing Review and published
versions to refer to the same object. Start with audio, source PDFs, figures and
frozen products; do not build a second object-store framework or deduplicate
small JSON at the cost of complicated migrations.

Store the original audio and normalized full playback as distinct content when
their bytes differ. Revision and publication manifests reference them; a latest
reference must not cause a fresh audio copy. Temporary WAV, raster and model
cache are not durable recovery material. Never delete an object referenced by
any retained revision/publication or an active upload. Garbage collection is
separate from ingestion, uses a fresh reference inventory and a quarantine
period, and does not delete UNKNOWN operations or evidence.

The 50GB disk has only been attached. Read-only host inventory found a 40GB
system disk with about 19GB free, approximately 276MiB of import files, and
approximately 6.18GiB of releases. This Goal does not clean releases.
R2 backup logs contain copy/access errors; neither successful promotion nor an
updated backup log proves a recovery point.

Before live use, inspect and fix the bounded backup failure under appropriate
authorization and restore a consistent DB/file snapshot in isolation. Do not
copy live SQLite files as a consistency strategy. A local blob archive on the
same server is not independent backup. Retain a version-bound verified backup
inventory so local cleanup does not wait for a vague “backup usually runs”.

Proposed host placement keeps databases, code, deployment receipts and release
atomic-renames on their present filesystem. Put private paper files on the new
filesystem and preserve runtime paths through reviewed mounts, not unvalidated
symlink substitutions. Bind mount ordering and device/UUID checks to all
relevant writers and backups; a missing disk must fail closed. Disk identity,
empty-media checks, mount configuration and exact paths are reviewed before
initialization. Copy and verify before switching; retain old files. After writes
reopen, never revert to an old snapshot and discard newly accepted data.

## Remote handoff and local cleanup

Keep these facts separate: uploaded, finalized, product-readable, backed up,
restorable, locally removable, approved, published. They are not eight new UI
steps. Most are machine evidence behind a single clear result to the Owner.

Local cleanup requires an exact paper/revision/bundle inventory, successful
remote byte verification, product-read checks, an independent verified backup,
and a proven reconstruction of a usable repair workspace. The first pilot must
restore from a fresh empty directory without referring to the old workspace.
Later eligibility uses the same maintained restore contract and version-bound
evidence; it must not duplicate a full local copy merely to “save space”.

Initially provide an inspection-only cleanup plan: explicit task-owned paths,
logical/allocated sizes, blockers and preserved paths. Reclaimable bytes remain
unknown where hard links or APFS clones prevent an exact estimate; do not label
logical lengths as disk savings. Exclude personal source
folders, Git-tracked files, unrelated uncommitted work, active tasks and unknown
operations. No generic Downloads scan, shared-cache eviction, worktree deletion
or shell `rm -rf` based only on a paper name. The later deletion command must
revalidate the same scope and state and require the bounded Owner authorization.
Retain a small remote-location/version/result record, not another local archive.

## Delivery slices and acceptance

Implement serially where schemas or validation overlap; do not create an
automatic chain of agent threads. Each ticket delivers a public behavior:

1. [Exact remote repair restore](tickets/01-exact-restore.md): select an immutable
   revision explicitly, never silently substitute latest or overwrite local work.
2. [Unpublished durable handoff](tickets/02-durable-handoff.md): complete remote
   recovery inventory, reuse large files, inspection-only cleanup eligibility.
3. [Product-first review](tickets/03-product-review.md): exact private Screen,
   four PDFs, listening and one thread-handoff button; recheck/confirmation in Amp.
4. [Published repair and recovery](tickets/04-published-repair.md): feedback on an
   exact publication, stale-base protection, authorized single-paper recovery.

Live backup repair, new-disk setup and existing-batch adoption have separate
execution approvals, but remain supporting work of this Goal, not new products.
Pilot one completed paper before batch transfer; incomplete papers stay blocked.

Verification follows current repository cadence. During implementation inspect
the diff and prepare representative rendered states; do not call an untested
candidate verified. At Ship, persistence/auth/publication/shared-renderer changes
need their natural Full/E2E and independent Standards/Spec review. Local-only
acceptance includes missing/corrupt blob, stale revision, unauthorized read,
interrupted upload/restore, absent mount, denied backup, active-reference GC,
and safe cleanup rejection. Product UI gets real desktop/mobile inspection.

Final end-to-end acceptance is one paper whose task-owned Mac working copy can
be removed, still read privately online, restored and repaired, reviewed again,
then published only after a separate explicit Owner instruction. No stage may
claim a disk migration, backup, deletion, approval or publication not performed.

## Current local delivery and remaining boundaries

- Exact historical hydrate includes the bound OCR receipt. Restored repairs carry
  their expected base through create and finalize; a competing revision blocks
  overwrite. No real paper has been restored in this task.
- New local Review binary uploads share immutable SHA objects by hard link.
  Different source/playback bytes remain separate. Historical directories,
  public version/latest copies and dated backups are not deduplicated by this work.
- Screen reads use a finalized, bundle-bound SQLite preview rather than cold
  source projection. Four PDF/edition Print reads serve verified frozen bytes.
  Historical previews require explicit preparation; normal GET never creates one.
- Product controls provide an Amp handoff button, with no feedback or confirmation
  form. Copied context binds the viewed revision/publication even when a newer
  private Candidate exists. No message, approval or publication is automated.
  Real papers still need explicit thread association before remote delivery.
- The optional UUID/mount guard rejects a missing or different filesystem.
  The backup script includes the local private blob root. Neither change proves
  the live mount or independent backup; no backup command has been run here.
- `cleanup-plan --revision` only inventories local files against a remote
  manifest. It always reports `eligibleForDeletion: false`. Actual deletion,
  independent-backup certification and public rollback automation are absent.

The earlier form preview/build passed but was rejected as too complex by the
Owner. Its screenshots are historical, not the current design. The replacement
is an Amp handoff button; synthetic previews are not production acceptance. Formal regressions
are written but not run under the pre-Ship cadence. Owner remote QA is not ready:
the preview is local-only, and no safe remote entry has been deployed.

Follow [the bounded host/pilot plan](host-pilot.md) after code acceptance and
separate authorization for its exact host operations. Do not turn that plan into
an automatic migration, backup prune, cleanup, approval or publication chain.
