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

The incident closeout and first repaired SSH deployment completed successfully.
The initial closeout stopped before installation because its expected digest
was built from an in-memory status projection rather than the disk record;
status did not mutate evidence. Correcting that input allowed the reviewed
closeout to preserve old UNKNOWN evidence, retire admission and prove health.
Always distinguish disk records, active state and status projections when
reconciling a lost response; UNKNOWN is never permission to replay a mutation.

Apply `AGENTS.md`'s Goal authorization to the complete stated transaction.
Included reviewed entry maintenance, deployment, read-only reconciliation,
health and agreed rollback/recovery do not need separate install/finalize/status
approvals. CLI `--owner-said-*` flags attest that existing authorization, not a
new conversation per flag. Ordinary code-only updates use the single deploy
command above; preflight and retained receipts diagnose loss without reactivating
retired UUID status, TAT or bootstrap commands. New privileges, Secrets, targets,
uncovered destructive data/R2 operations or irreversible risks still require
Owner authorization. Code-only or merge-only Goals never imply those operations.

### Current: one-time controller-only host upgrade v1

`deploy/upgrade-eqb-host-configuration-once{,.mjs}` is a reviewed root-console/TAT
entry, never a daily CLI/SSH/sudo command. Upgrade accepts one full target SHA
and only a controller-module host diff. `T reconcile O` closes operation `O`
using reviewed payload `T`; it never restores files or replays the engine.
Both files stay outside HOST_CONFIGURATION_PATHS/STABLE_LAUNCHER_PATHS, avoiding
installation recursion. Do not change SSH permissions, application data or R2.

**Mac: bind the reviewed merged target and natural CI, then compute payload hashes.**
Run in the dedicated deployment clone after review/merge. `plan` fetches and
fast-forwards this local clone and checks current main's natural `Verify` run,
GitHub Actions identity and both successful `verify`/`e2e` jobs; it sends no SSH
request and does not mutate the server. The wrapper uses the existing Keychain
route without printing the key. Failure/pending/ambiguity stops here.

```bash
set -euo pipefail
cd "$HOME/Projects/eqb-deploy"
[[ $(git branch --show-current) == main && -z $(git status --porcelain) ]]
PLAN="$(scripts/local-deploy.sh plan)"
printf '%s\n' "$PLAN"
T="$(printf '%s\n' "$PLAN" | node --input-type=module -e '
let s=""; for await (const b of process.stdin) s+=b;
const p=JSON.parse(s);
if(p.productionMutationAllowed!==false || !/^[a-f0-9]{40}$/.test(p.sha)) process.exit(1);
process.stdout.write(p.sha)')"
[[ $(git rev-parse HEAD) == "$T" ]]
H_SH="$(git --no-replace-objects show "$T:deploy/upgrade-eqb-host-configuration-once" | shasum -a 256 | awk '{print $1}')"
H_JS="$(git --no-replace-objects show "$T:deploy/upgrade-eqb-host-configuration-once.mjs" | shasum -a 256 | awk '{print $1}')"
printf "T='%s'\nH_SH='%s'\nH_JS='%s'\n" "$T" "$H_SH" "$H_JS"
```

Keep the exact plan/run/job evidence and these independently computed hashes.
If main advances, repeat this Mac-only binding before staging a new payload.

**TAT before installation: read-only, `Username=root`.**
These commands expose identity/hash metadata only. The harness repeats the
authoritative checks under the original deploy.lock; this snapshot is not
permission to skip its checks.

```bash
set -euo pipefail
[[ $(id -u):$(id -g) == 0:0 ]]
R=/opt/eqb
S=$R/english-question-bank
P="$(readlink -f "$R/current")"
V="$(readlink -f "$R/deployments/host-configuration/current")"
M="${V##*/}"
[[ ${P##*/} =~ ^[0-9a-f]{40}$ && $M =~ ^[0-9a-f]{40}$ ]]
printf 'application=%s\nhost=%s\n' "$P" "$V"
cat "$P/.eqb-release.json" "$V/.eqb-host-configuration.json"
stat -c '%F %u:%g %a %h %d:%i %n' / /opt "$R" "$R/deployments" \
  "$R/deployments/deploy.lock" "$R/deployments/host-configuration" "$V" "$V/deploy"
[[ -f "$R/deployments/deploy.lock" && ! -L "$R/deployments/deploy.lock" \
  && $(stat -c '%u:%g:%a:%h' "$R/deployments/deploy.lock") == 0:0:600:1 ]]
for SPEC in "deploy/Caddyfile.release:/etc/caddy/Caddyfile" \
  "deploy/eqb-release.service:/etc/systemd/system/eqb.service" \
  "deploy/eqb-deploy-controller.mjs:$V/deploy/eqb-deploy-controller.mjs" \
  "deploy/eqb-deploy-controller:/usr/local/libexec/eqb-deploy-controller-v1" \
  "deploy/eqb-deploy-transport:/usr/local/libexec/eqb-deploy-transport-v1"; do
  F="${SPEC%%:*}"; A="${SPEC#*:}"
  EXPECTED="$(git --no-replace-objects -c safe.directory="$S" -C "$S" show "$M:$F" | sha256sum | awk '{print $1}')"
  ACTUAL="$(sha256sum "$A" | awk '{print $1}')"
  printf '%s %s %s\n' "$F" "$EXPECTED" "$ACTUAL"
  [[ "$EXPECTED" == "$ACTUAL" ]]
done
lslocks --output PID,COMMAND,TYPE,MODE,PATH
systemctl is-active eqb caddy
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8787/api/health
curl --fail --silent --show-error --max-time 10 https://eqbank.cc/api/health
for F in root-dispatch-barrier.json reviewed-persistence/active.json \
  host-configuration-update/active.json host-configuration-update/recovery-controller.mjs \
  controlled-ssh/active.json; do
  [[ ! -e "$R/deployments/$F" && ! -L "$R/deployments/$F" ]]
done
if [[ -d "$R/deployments/host-configuration-upgrade-v1" ]]; then
  for D in "$R"/deployments/host-configuration-upgrade-v1/*; do
    [[ -d "$D" ]] || continue
    cat "$D/operation.json"
    if [[ -f "$D/reconciliation.json" ]]; then cat "$D/reconciliation.json"; fi
  done
fi
```

Stop for any unresolved history; use reconciliation below for its original
operation, rather than manually deleting active.json. For reconciliation the
expected own blockade is present: inspect it instead of running the final
absence assertions above. Other maintenance/engine-active state must be absent.

**TAT payload staging: writes source clone/payload only, `Username=root`.**
Paste the three assignments printed by the Mac in place of the placeholders.
Staging is a separate command from upgrade so a recovery payload can be staged
without starting another upgrade. An existing payload directory is never
overwritten; inspect/reuse its matching hashes instead.

```bash
set -euo pipefail
umask 077
T='<reviewed-40-hex-main-SHA>'
H_SH='<reviewed-shell-blob-sha256>'
H_JS='<reviewed-module-blob-sha256>'
[[ $(id -u):$(id -g) == 0:0 && $T =~ ^[0-9a-f]{40}$ \
  && $H_SH =~ ^[0-9a-f]{64}$ && $H_JS =~ ^[0-9a-f]{64}$ ]]
S=/opt/eqb/english-question-bank
B=/opt/eqb/deployments/host-upgrade-payload-$T
/usr/sbin/runuser -u eqb -- /usr/bin/env -i HOME=/home/eqb PATH=/usr/local/bin:/usr/bin:/bin \
  GIT_TERMINAL_PROMPT=0 /usr/bin/git -C "$S" fetch --quiet --no-tags origin main
[[ $(/usr/bin/git -c safe.directory="$S" -C "$S" rev-parse FETCH_HEAD) == "$T" ]]
mkdir "$B"
mkdir "$B/deploy"
for F in upgrade-eqb-host-configuration-once upgrade-eqb-host-configuration-once.mjs; do
  /usr/bin/git --no-replace-objects -c safe.directory="$S" -C "$S" show "$T:deploy/$F" > "$B/deploy/$F"
done
printf '%s  %s\n' "$H_SH" "$B/deploy/upgrade-eqb-host-configuration-once" \
  "$H_JS" "$B/deploy/upgrade-eqb-host-configuration-once.mjs" | /usr/bin/sha256sum --check --strict
```

**TAT upgrade: writes operation evidence/blockade and host configuration.**
Replace `T` with the same Mac-bound value in this new RunCommand; TAT shell
variables do not persist. Submit this manager-owned unit **once**.

```bash
set -euo pipefail
T='<same-reviewed-40-hex-main-SHA>'
B=/opt/eqb/deployments/host-upgrade-payload-$T
/usr/bin/systemd-run --quiet --wait --collect --unit="eqb-host-upgrade-$T" \
  --property=Type=exec --property=UMask=0077 --property=RuntimeMaxSec=1200s \
  --property=KillMode=control-group --property=StandardInput=null \
  --property=StandardOutput=journal --property=StandardError=journal \
  -- /bin/bash "$B/deploy/upgrade-eqb-host-configuration-once" "$T"
```

The entry validates the original 0600 root single-link lock and held FD inode;
after locking it verifies installed host Git bytes/marker/launchers, app SHA,
payload and target content hashes, and recomputes the path digest from installed
host SHA → T. It loads only the verified installed module. A durable
`host-configuration-upgrade-v1/T/operation.json` and
`controlled-ssh/active.json` blockade precede the engine call. Backups retain the
old module/marker and unit/Caddy with SHA-256 hashes. The engine rewrites even
unchanged unit/Caddy and reloads; a complete engine receipt is checked against
disk, followed by new-module preflight, marker/installed hashes, unchanged app
pointer and local/public health. Only verified success removes its own blockade.

**TAT timeout/disconnect: read only; never submit another unit or target.**
The original manager unit can continue after TAT's wait ends. Inspect that unit,
the original PID, lock and retained records. Its RuntimeMaxSec/KillMode, rather
than another submission, govern termination. Even a collected/not-found unit
is not proof that the operation succeeded.

```bash
set -euo pipefail
O='<original-operation-40-hex-SHA>'
D=/opt/eqb/deployments/host-configuration-upgrade-v1/$O
systemctl show "eqb-host-upgrade-$O.service" \
  --property=LoadState,ActiveState,MainPID,ControlPID,ControlGroup || true
journalctl --no-pager -o cat -u "eqb-host-upgrade-$O"
for F in "$D/operation.json" /opt/eqb/deployments/controlled-ssh/active.json \
  "$D/unit" "$D/caddy" "$D/module" "$D/marker"; do
  if [[ ! -e "$F" && ! -L "$F" ]]; then
    printf 'MISSING %s\n' "$F"
  elif [[ ! -f "$F" || -L "$F" ]]; then
    printf 'UNSAFE_TYPE %s\n' "$F"
  else
    printf 'PRESENT %s\n' "$F"
    sha256sum "$F" || printf 'HASH_READ_FAILED %s\n' "$F"
    if [[ "$F" == *.json ]]; then
      cat "$F" || printf 'RECORD_READ_FAILED %s\n' "$F"
    fi
  fi
done
ps -eo pid,ppid,stat,lstart,comm
lslocks --output PID,COMMAND,TYPE,MODE,PATH
readlink /opt/eqb/current /opt/eqb/deployments/host-configuration/current
```

Inspect the receiptPath in operation.json, or the unique matching target's
receipt in deployments/receipts when response loss left engineReceipt null.
Successful completion with a lost response normally has no active.json.
Report every missing record/backup and continue the read-only snapshot;
absence alone never proves success or authorizes replay.
Do not use a different receipt, restart a unit, restore host bytes, invoke
implicit engine recovery, or unlink evidence while investigating UNKNOWN.

**TAT terminal reconciliation: writes only reconciliation.json and removes
this operation's exact blockade; no host restore/reload or engine mutation.**
Use the independently staged reviewed payload `T` (which may differ from `O`).
First complete the read-only investigation above. The original PID must no
longer exist; PID reuse is conservatively rejected. The original unit must be
inactive/failed or collected, with zero MainPID/ControlPID and no populated
remaining unit cgroup. A nonempty ControlGroup requires readable cgroup-v2
events with `populated 0`; unavailable or unexpected layouts refuse closure.
Existing engine active/recovery state is an unresolved
operation, not disposable evidence: this command refuses it and leaves it
untouched. Its disposition requires a separate reviewed engine-state decision.

```bash
set -euo pipefail
T='<reviewed-staged-payload-40-hex-SHA>'
O='<original-operation-40-hex-SHA>'
B=/opt/eqb/deployments/host-upgrade-payload-$T
/usr/bin/systemd-run --quiet --wait --collect --unit="eqb-host-reconcile-$O" \
  --property=Type=exec --property=UMask=0077 --property=RuntimeMaxSec=300s \
  --property=KillMode=control-group --property=StandardInput=null \
  --property=StandardOutput=journal --property=StandardError=journal \
  -- /bin/bash "$B/deploy/upgrade-eqb-host-configuration-once" "$T" reconcile "$O"
```

Three terminal branches share lock/operation/blockade/backup/Git-byte/app-pointer,
unit/Caddy, service and local/public-health verification:

- Healthy rolled-back `failure`: prove the old host identity, complete receipt
  and backup hashes; record `terminal=rolled-back`. The engine may report its
  own healthy rollback, or a complete failure receipt with `rolledBack=false`
  after preparation/MAIN_CHANGED. The latter requires the original harness
  `failure/host-rollback`, `rollbackHealthy=true`, bound receipt and completion
  timestamp, plus current old-host bytes/app/health and absent engine state.
  It does not extend the UNKNOWN branch.
- `success/verified` persisted before blockade unlink: prove the target host,
  successful disk receipt and new-module preflight; record `terminal=installed`.
- `unknown`: require a complete bound disk receipt (unique if discovered),
  absent engine state and a currently healthy exact old or target identity.
  Prove rolled-back or installed as above; missing/ambiguous/contradictory
  evidence refuses closure. No automatic recovery or engine replay occurs.

operation.json stays byte-identical, including failure/unknown. The independent
0600 reconciliation binds its SHA-256, original result, exact blockade digest,
terminal host/app identities, five hashes, engine receipt digest, PID/unit
checks and timestamp. It is fsynced before unlink. If interrupted between proof
and unlink, repeat **reconciliation only**: it rechecks everything before
finishing; a completed reconciliation is read-only/idempotent. Never resubmit
the upgrade. Every original target directory remains permanently consumed.
Future upgrades accept only success or a matching reconciliation for every
prior operation; corrupt or mismatched reconciliation still blocks them.

After reconciliation, read `reconciliation.json` and
`journalctl --no-pager -o cat -u "eqb-host-reconcile-$O"`, repeat the installed
hash/pointer/health snapshot, then on the Mac run
`scripts/local-deploy.sh preflight --owner-said-preflight`. Daily operation
remains the single `deploy` command.

**Required PR description / Linux and pre-installation evidence:** record
fixture results separately from real Linux checks. On an isolated Linux host
verify actual flock inheritance, fdinfo WRITE/FLOCK and FD inode checks,
concurrent exclusion, and systemd RuntimeMaxSec/SIGKILL retaining the blockade.
Exercise reconcile-after-kill with sufficient and insufficient receipts, live
unit/PID rejection and durable-proof-before-unlink interruption. These are not
proven by macOS dependency fixtures. Natural CI must pass the selected full
pack/E2E; production before installation must freshly bind P/M, bytes, health,
operation/engine-state absence and T/payload hashes. No production action is
authorized merely by this document.

## Historical entry migration

The remainder records the superseded migration design, not current commands or
additional authorization steps. Do not execute its retired install/status route.

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

After success, pinned SSH preflight under the same authorized Goal must show the reviewed
controller SHA and unchanged application SHA; readonly `status` must match the
installation UUID. External connection loss is not permission to repeat the
operation or roll back after subsequent work. An ordinary website deployment is
then the existing one-command `deploy --owner-said-deploy-latest`; actual
persistence or host-file changes retain their explicit reviewed commands. No
generic recovery command or multi-stage bootstrap activation is introduced.
