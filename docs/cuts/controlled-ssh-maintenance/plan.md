# Controlled SSH maintenance migration

## Incident repair: single daily deployment command

The Owner superseded the daily transaction-bound protocol below after the
pre-traffic service-stop incident. Its receipts and UNKNOWN evidence remain
historical evidence, not resumable work. The repaired daily route is restricted
SSH → existing exclusive lock → release build/preparation → isolated candidate
startup/health → atomic application pointer → restart → public health, with one
result receipt. TAT, bootstrap, barrier, rebind, UUID status/replay, and separate
maintenance command names are not daily deployment operations.

`deploy --owner-said-deploy-latest` still resolves and rechecks exact current
main against natural Hosted verify/e2e authority. A protected-path difference
is a review trigger, not proof of a database mutation. For a reviewed code-only
delta, add `--reviewed-code-only-digest <protected-path-digest>`; the host
recomputes that digest against its current release before preparation. No SQL
text heuristic is used. Candidate startup runs on disposable online SQLite
copies with a private network and read-only filesystem outside its temporary
directory; those copies are not an offline cross-database recovery point.

Actual schema/data mutation uses the same deploy command with
`--reviewed-migration-digest <protected-path-digest>`, retaining the existing
offline three-database backup/ensure boundary. This is explicit migration scope,
not a declaration that all changes to an API/store file require migration.
No live ensure is moved ahead of traffic shutdown. Before any candidate
persistence, stop/backup failure must attempt old app and Caddy independently;
a second stop failure must never skip service recovery. Receipt failure codes
retain the primary phase and any failed rollback stages. After candidate
persistence, old code is started only with verified restored databases; no
pre-traffic snapshot is replayed after traffic reopening.

The prior incident's outer and inner active files continue to block production
until one separately reviewed, authorized incident closeout installs the repaired
controller/launchers and retires admission while preserving exact evidence.
This code does not clear them, rewrite the old UNKNOWN result, or authorize a
production controller self-upgrade. The deployment target is the reviewed latest
main containing the website changes and this repair, not the older website SHA.

## Historical entry migration

Status: engineering in progress; Owner authorized the bounded migration and
deployment, conditional on exact reviewed main and required CI gates.

Owner superseded the TAT/bootstrap/barrier diagnostic work. PR339 is closed
without merge; its commit and the old UNKNOWN/staging evidence remain retained.
The design review is T-01a072dd-7578-76b1-b8b8-133136a94317. That review approved
the direction, not an already implemented installer or production readiness.

## Bounded outcome

Keep the restricted SSH identity, pinned host key, forced executable and minimal
sudo boundary. Reuse the existing release staging/build, atomic application
pointer, health, persistence snapshots and pre/post-traffic recovery engines.
Do not use deploy-remote.sh, candidate root shell commands, anonymous GitHub HTTP
as a new authority, a new database, a daemon, or a general workflow engine.

The maintained SSH protocol will expose readonly preflight/status and a
transaction-bound ordinary deploy / explicitly reviewed maintenance operation.
One durable private active record under the existing deployment lock admits
mutations. Interrupted/unknown transactions remain blocking and queryable.
An old mutation grammar must not be executable by a delayed old wrapper that
opens the current controller after acquiring the lock. Process/job scans alone
are not the concurrency authority.

Controller installation identity remains distinct from application release SHA.
Validate installed bytes against their root-owned marker and compare the five
target Git blobs to those installed hashes; do not mutate a marker merely to
bind it to a newer application commit. Actual host/controller changes still
require explicitly reviewed maintenance, and persistence changes still require
an exact protected-diff authorization. One authorization may cover the stated
maintenance scope, not unmentioned database or privilege changes.

## One-time entry migration boundary

The old restricted SSH grammar cannot install a changed stable launcher through
its existing host-config operation. Do not disguise this as a self-upgrade or
introduce another intermediate SHA / rebind. Initial installation therefore
uses the existing Tencent TAT RunCommand adapter with Username=root for one
authorized root maintenance invocation. Bind its reviewed payload digest, plan
digest and transaction UUID before dispatch. Historical root execution proves
the channel existed, not fresh installer readiness. Do not add credentials,
permissions or a bootstrap/probe protocol. TAT is only the one-time delivery
channel; everyday deployments use restricted SSH exclusively.

Before any installation, under the existing lock, verify the exact old terminal
evidence, old unit/PID/job inactivity, absence of active legacy transactions and
barrier, current application/host identities, installed bytes and lock metadata.
Preserve all old evidence and the historical UNKNOWN; no root-cause inference.
Prepare root-private rollback bytes and durable transaction state before writes.
Install the reviewed controller and fixed launchers without changing SSH keys,
host keys, authorized_keys, application data, unit/Caddy semantics or application
release during this initial entry migration. A required change to those frozen
surfaces is a stop requiring an explicit enlarged production authorization.

The transaction must locally prove the restricted transport/dispatcher readonly
route without recursively taking the deployment lock. On a known failure restore
the old entry and pointer and prove the old route/health. Incomplete rollback or
crash retains the transaction and evidence; inspection is not re-execution.
External SSH proof after the operation is independent evidence, not permission
to retry or unconditionally roll back after another operation may have run.

## Runtime and acceptance boundaries

- Resolve/recheck exact main and Hosted authority in the trusted Deployment
  client; preserve source main rechecks in the root release engine.
- Isolated build must remain unable to read runtime data or credentials.
- Ordinary deploy cannot silently escalate to schema/data migration.
- Reviewed persistence keeps the trafficReopened durable boundary: no database
  snapshot restoration after public traffic has reopened.
- Every mutation has an identity and durable outcome; duplicate IDs do not
  reactivate a release. Status reads never authorize recovery or deployment.
- Test delayed legacy callers, real flock contention, interruption, invalid
  state/permissions, UID != GID, healthy rollback and rollback-unknown, exact SHA
  and digest drift, unchanged host bytes across application SHAs, and restricted
  transport grammar. Keep the existing release/security regressions.
- Run risk classification, focused/security and final Full/E2E; obtain an
  independent High review of the exact candidate. Use one revertible task PR.

Before production, report the final exact one-time command/payload bindings,
required root launch authority, state/rollback locations and acceptance checks.
Code merge does not authorize running that transaction or deploying the app.

## Exact one-time execution proposal (not authorized by this document)

After exact-main natural Hosted `verify`/`e2e` and dedicated CI succeed, the
Deployment coordinator records and reports one exact execution plan. It contains the fresh
installation UUID, target SHA, current application and installed-controller
SHAs, existing transport user, old transaction UUID, a private retained terminal
export path/digest, and the four old dispatch-file digests. The terminal export
is trusted authenticated Deployment evidence, not a provider signature; Owner
review must bind it to that exact old dispatch. No new historical attribution is
claimed. If that binding or current idle state cannot be proved, stop.

The `eqb-controlled-entry-plan-v1` JSON has exactly these fields:

```text
schemaVersion, transactionId, targetSha, productionSha, hostConfigurationSha,
transportUser, priorTransactionId, priorTerminalFile, priorTerminalDigest,
priorFiles
```

`priorFiles` contains SHA-256 values for `payload.json`, `readiness.json`,
`eqb-barrier-bootstrap.mjs`, and `eqb-deploy-barrier.mjs` in the retained
`/opt/eqb/deployments/barrier-dispatch-OLD_UUID/` directory. Do not alter those
files. Inputs and the reviewed payload must be root-owned, non-writable by other
accounts, beneath `/opt/eqb`; the plan and terminal export are mode 0600. Verify
the exact Git file payload and its digest before executing its code.
The payload includes the five existing deployment files plus
`deploy/install-eqb-controlled-ssh`; extract only this reviewed exact file set
into a new root-private directory, never over the installed entry.

The trusted Deployment client performs the single delivery with:

```sh
node scripts/amp-orb-deploy.mjs install-controlled-ssh \
  --owner-said-install-controlled-ssh --plan PRIVATE_PLAN --prior-terminal PRIVATE_TERMINAL
```

The plan's `priorTerminalFile` must be
`/opt/eqb/deployments/controlled-entry-UUID/terminal.json`. The builder embeds
only the six exact Git files, original plan and terminal in a digest-bound gzip
bundle with fixed filenames, not an archive or downloaded executable. Complete
command base64 must fit the existing 65536-byte TAT limit. The client exclusively
creates `~/.eqb-controlled-entry-UUID` and retains inputs, command and bindings
before dispatch, available dispatch IDs before polling, and the returned terminal
before strict receipt parsing. Missing terminal is UNKNOWN, never fabricated.

The single root invocation delivered by the existing TAT adapter is:

```sh
/bin/bash /opt/eqb/deployments/controlled-entry-UUID/deploy/install-eqb-controlled-ssh \
  /opt/eqb/deployments/controlled-entry-UUID/plan.json PLAN_SHA256
```

The actual SHA, plan digest and reviewed payload digest must be verified and
reported before replacing these placeholders under the Owner's bounded Goal
authorization. Do not dispatch again on a lost response: reconcile the same
transaction and durable receipt first. This command takes the existing
0600 `deploy.lock` by inherited FD, checks its inode, and retains it through
installation or rollback. It verifies the old task's retained failed terminal
record, exact old unit PID/job inactivity, no active EQB jobs/units/maintenance,
unchanged P/M identities, fixed host files, health, and fetched exact main.
Only the root wrapper, transport wrapper and selected controller version change.
There is no SSH identity/key/host-key/sudoers edit, unit/Caddy replacement,
application switch, database operation, nested TAT call or old-transaction replay.
Readonly status reuses the existing `-- deploy *` sudo scope with a fixed
non-SHA `status` sentinel; the root parser dispatches that solely as readonly.

State and backup locations are `/opt/eqb/deployments/controlled-ssh/active.json`,
`UUID.json`, and `backup/`. Admission precedes privileged writes. Successful
installation requires installed hash validation, unchanged application health,
and the local unprivileged transport→sudo→root preflight route while the same
lock remains held. On a caught failure after entry writes, restore both old
launcher bytes and the old controller pointer, then prove the old module and
application health. A crash/incomplete rollback remains unknown with admission
retained; never rerun the installer or clear evidence. The original UNKNOWN
remains UNKNOWN even after successful entry migration or healthy rollback.

The existing TAT hard limit is 300 seconds, not a completion or rollback budget.
Automatic rollback covers catchable errors only. A hard kill/timeout may interrupt
any phase, including between launcher replacements, and does not prove processes
dead or the lock free. Timeout, loss or invalid receipt stops deployment and any
new installation attempt. Reconcile actual process/lock, pointer, both launchers,
active/record and backup before an explicit minimum recovery decision. In
particular, an old selected entry does not understand the new admission file;
its mere existence is not proof of global isolation. No automatic retry, background
task, cleanup or extra recovery protocol is introduced.

After success, separately authorized pinned SSH preflight must show the reviewed
controller SHA and unchanged application SHA; readonly `status` must match the
installation UUID. External connection loss is not permission to repeat the
operation or roll back after subsequent work. An ordinary website deployment is
then the existing one-command `deploy --owner-said-deploy-latest`; actual
persistence or host-file changes retain their explicit reviewed commands. No
generic recovery command or multi-stage bootstrap activation is introduced.
