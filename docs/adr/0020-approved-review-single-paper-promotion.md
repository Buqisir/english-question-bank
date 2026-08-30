# ADR-0020: 已认可 Review 只通过服务端单卷原子 promotion 上线

- Status: Accepted for repository implementation (2026-08-30 task scope)
- Production use: requires a later direct Owner “上线 <paperId>” command
- Upstream: ADR-0017, `docs/cuts/import-agent-closed-loop/spec.md`

## Context

The universal NCK1 publisher already commits formal question-bank rows,
Canonical current ref, five analysis sidecars, immutable `versions/vN`, and
`latest` through one SQLite/filesystem journal with rollback and crash recovery.
The old production ship path does not use that capability on the server: it
replaces the complete `question-bank.sqlite` from an operator machine and then
adds paper assets. That can include unrelated local content and has no atomic
remote rollback for assets.

Import Review already stores the complete immutable Candidate revision and an
Owner approval receipt bound to source, Candidate, visible structure, analysis,
and bundle digests. It also has a distinct shipping token and a guard that
freezes revision, issue, and approval mutation.

## Decision

Production publication of an imported paper is one server-side promotion from
the latest exact approved Candidate revision. There remain two human decisions:

1. Owner approves content in Import Review.
2. Later, Owner explicitly tells the Agent `上线 <paperId>`.

Approval alone never invokes promotion and no web button is added.

The high-authority promotion request must include the exact approval identity
and use the existing distinct shipping credential. Before the first formal
question-bank or public-asset write, the Import Review DB atomically freezes
that identity and records `publishing`. The server then rebuilds only the
deterministic Canonical request and compatibility projection from the immutable
revision and calls the existing universal atomic publisher. It does not upload,
download, or replace a whole database.

The existing publisher remains the content commit authority. On success the
Review DB records a digest-bound `published` receipt and releases the guard in
one transaction. A crash after content commit but before receipt completion
leaves `publishing` and the guard in place; an exact retry invokes publisher
recovery, obtains the same version, records the receipt, and does not create a
second version. Known admission rejection before content writes records
`failed` and releases the guard. Unknown failures stay locked and fail closed.

The ordinary import-agent token can read promotion state but cannot begin,
complete, retry, abort, or otherwise mutate promotion. The shipping credential
must not be installed as the routine project-worker secret.

## Visibility and durability

- Before successful promotion there are no formal bank rows, Canonical current
  ref, or public paper-assets for the Candidate.
- Formal DB rows, Canonical current ref, all five analyses, `versions/vN`,
  `latest`, and publisher-owned figures/media are one recoverable publisher
  unit.
- The Review receipt records approval/revision/bundle identities, asset version,
  Canonical publication digest, timestamps, and the prior version when present.
- Existing immutable versions and publisher rollback remain the per-paper
  recovery boundary. The production online R2 job remains an independent,
  additive disaster-recovery boundary and includes the bank DB, paper assets,
  Import Ops DB, and private files on its next scheduled snapshot. Promotion
  does not synchronously mutate R2 or claim an off-site backup completed.

## Legacy path

`pull-run-push push <paperId>` is retired for Review-backed paper publication.
Its `pull` and manifest/maintenance seams remain available. During rollout the
new server advertises single-paper promotion in Review status; updated clients
must refuse whole-DB paper shipping and direct the operator to the promotion
command. Historical deployments remain recoverable, but no new paper should
enter the old transport after this ADR is deployed.

## Rejected alternatives

- **Approve and automatically publish:** collapses two distinct Owner decisions.
- **Upload a local SQLite file from an Orb:** grants excessive authority and can
  ship unrelated rows.
- **Rebuild Canonical meaning in a promotion service:** creates a second model
  and can diverge from the reviewed Screen/Print/PDF projection.
- **DB commit followed by best-effort asset copy:** publicly exposes mixed
  versions after a failure.
- **Give the import-agent token publish scope:** makes a compromised worker a
  production writer.
