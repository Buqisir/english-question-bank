# launch-deploy — first-provision runbook

Ordered, one-time manual steps to bring `eqbank.cc` up on a fresh server.
Everything after first provision is `scripts/deploy.sh` (redeploy) and, once
Slices 3/4 land, the R2 backup cron + local pull-run-push scripts (see
pointer at the bottom).

Placeholders: `<SERVER_IP>` (never write the real IP into this file or any
tracked file). Never write real secrets (API keys, R2 credentials, SSH keys)
into this file or any git-tracked file — they live in `.env` / `rclone.conf`
(gitignored) on the server only.

## 1. Create the non-root deploy user

```
sudo adduser eqb
sudo usermod -aG sudo eqb   # only if it needs to run `systemctl restart eqb` itself;
                            # otherwise grant a scoped sudoers rule for that one command
```

The service (`deploy/eqb.service`) runs as `User=eqb`; the repo lives under
`/opt/eqb/english-question-bank`, owned by `eqb`.

## 2. Install Node 24

Via nodesource or nvm (either is fine; nodesource is simpler for a systemd
unit that shells out to `/usr/bin/node`):

```
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # expect v24.x
```

**Verify `node:sqlite` works before relying on it** (FG-1):

```
node -e "require('node:sqlite'); console.log('node:sqlite OK')"
```

If this throws (module not enabled by default on the provisioned Node 24
build), add `--experimental-sqlite` to `ExecStart` in
`deploy/eqb.service` before installing the unit — see the comment already in
that file.

## 3. Install build tooling for argon2 (FG-2)

`server/package-lock.json` includes the native module `argon2`. Either the
target Node 24 linux-x64 has a prebuilt binary available, or it needs to
compile from source:

```
sudo apt-get install -y build-essential python3
```

Run this before `npm ci` in step 7 regardless — cheap insurance if the
prebuilt binary lookup fails.

## 4. Install Caddy

```
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

## 5. Clone the repo

```
sudo mkdir -p /opt/eqb
sudo chown eqb:eqb /opt/eqb
sudo -u eqb git clone <repo-url> /opt/eqb/english-question-bank
```

## 6. First-time data seed (gitignored, not in the clone)

The clone does NOT include the two SQLite databases or paper-asset source
versions (they're gitignored: `data/*`, `app/public/paper-assets/*/versions/`).
Only `app/public/paper-assets/<bundle>/latest/**` (parsed JSON) ships in git.

- Push the owner's local, curated `question-bank.sqlite` up to
  `/opt/eqb/english-question-bank/data/question-bank.sqlite` on the server
  (scp/rsync to a temp path, then move into place — never write directly
  onto a path the running service might read mid-transfer; on first
  provision the service isn't running yet, so this specific concern doesn't
  apply, but form the habit here since Slice 4's `pull-run-push` enforces it
  for every subsequent update).
- Push `app/public/paper-assets/*/versions/` up (source DOCX / safety
  copies) if you want them available on the server; not required for the
  app to run, only `latest/**` (already in git) is read at runtime.
- **Do NOT create or push `user-data.sqlite`.** The server self-creates it
  on first boot via `ensureUserDatabaseShape()` (FG-4) — pushing a local copy
  would risk clobbering that server-native, empty table set with unrelated
  local user/session state.

## 7. Install dependencies and build

Install Chromium's Linux dependencies once with elevated privileges. Run the
repository installs, browser download, smoke, and build as `eqb`, matching the
systemd service account and its user-scoped Playwright browser cache.

```
sudo corepack enable
sudo -iu eqb
cd /opt/eqb/english-question-bank
pnpm -C app install --frozen-lockfile
npm --prefix server ci
exit
cd /opt/eqb/english-question-bank
sudo pnpm -C app exec playwright install-deps chromium
sudo -iu eqb
cd /opt/eqb/english-question-bank
pnpm -C app exec playwright install --no-shell chromium
node scripts/smoke-production-chromium.mjs
pnpm -C app build
exit
```

## 8. Create `.env`

```
sudo -u eqb tee /opt/eqb/english-question-bank/.env >/dev/null <<'EOF'
DEEPSEEK_API_KEY=<real-key-here>
EOF
sudo chmod 600 /opt/eqb/english-question-bank/.env
```

Never commit this file or paste the real key into any tracked file, chat
log, or this runbook.

## 9. Create the owner account

```
cd /opt/eqb/english-question-bank
node scripts/create-user.mjs --username <owner-username> --role owner
```

(Run before or after starting the service — `create-user.mjs` operates
directly on `user-data.sqlite`, creating it via the same
`ensureUserDatabaseShape()` path if it doesn't exist yet.)

## 10. Install the systemd unit and Caddy config

```
sudo cp /opt/eqb/english-question-bank/deploy/eqb.service /etc/systemd/system/eqb.service
sudo cp /opt/eqb/english-question-bank/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
```

## 11. DNS (FG-3) — must be done before Caddy can issue certs

Create A records, pointing at the server's public IP (`<SERVER_IP>`):

```
eqbank.cc.      A   <SERVER_IP>
www.eqbank.cc.  A   <SERVER_IP>
```

Wait for propagation before the next step, or Caddy's ACME challenge will
fail (it will retry automatically, but avoid the churn).

## 12. Start services

```
sudo systemctl enable --now eqb
sudo systemctl status eqb   # confirm active, check for node:sqlite errors
sudo systemctl reload caddy
```

Verify:

```
curl -s https://eqbank.cc/api/health
```

## Redeploys

After first provision, use `scripts/deploy.sh` (fetch/update → install → build →
restart → health smoke) for every subsequent code update. It's idempotent
and safe to re-run.

2026-07-10 追记：on-server `deploy.sh` 整跑会卡 root/git 所有权；日常
重部署从本机跑 `scripts/deploy-remote.sh`（同一分步流程的一键封装：
push 校验 → pull → install → build → restart → health + 公网检查；
host/key 从 gitignored `.env.deploy` 读，真实 IP 不入库）。

### Dedicated Deployment Orb transition

ADR-0023 defines the replacement for the legacy in-place redeploy path: a
separate private Deployment Orb, an Owner command `部署最新版`, automatic exact
`main` resolution, exact-SHA hosted `verify` + `e2e` gating during the Amp
webhook outage, pinned SSH trust, staged immutable releases, atomic activation,
and automatic rollback. Both checks must be successful GitHub Actions checks
from the same workflow run; `verify (manual)` and `e2e (manual)` do not qualify.

The repository exposes:

```bash
node scripts/amp-orb-deploy.mjs plan
node scripts/amp-orb-deploy.mjs bootstrap-preflight --owner-said-preflight
node scripts/amp-orb-deploy.mjs baseline --owner-said-baseline-migration
node scripts/amp-orb-deploy.mjs bootstrap --owner-said-release-bootstrap
node scripts/amp-orb-deploy.mjs bootstrap-inspect --owner-said-preflight
node scripts/amp-orb-deploy.mjs bootstrap-resume --owner-said-release-bootstrap-resume
node scripts/amp-orb-deploy.mjs bootstrap-abandon --owner-said-release-bootstrap-abandon
node scripts/amp-orb-deploy.mjs preflight --owner-said-preflight
node scripts/amp-orb-deploy.mjs deploy --owner-said-deploy-latest
node scripts/amp-orb-deploy.mjs reviewed-persistence --owner-said-reviewed-persistence-deploy
node scripts/amp-orb-deploy.mjs update-host-config --owner-said-update-host-config
```

`plan` does not connect to production. `bootstrap-preflight` is the read-only
legacy-host classifier. `baseline` is only the S0-to-S1 migration from an
unbaselined legacy state to an exact healthy `main`; after one successful
receipt it is consumed and must not be rerun. `bootstrap` moves that established
S1 directly to a descendant candidate only when the fixed persistence-authority
diff is empty. It stages only the inert hash-bound payload first, then writes a
private durable recovery record before invoking the host transaction.
`bootstrap-inspect` classifies an interrupted attempt without mutation or a
second host transaction. `bootstrap-resume` is the separately authorized,
idempotent finalizer for a successful host transaction. `bootstrap-abandon`
first serializes with the bootstrap host lock and installs a root-private
target-and-unit cancellation marker. Lock contention means the transaction is
still active and abandonment stops; a delayed queued transaction is either
rejected by lock contention or must read the marker under that lock and stop
before runtime mutation. Only after cancellation, controller-key rejection, the
still-active old key, and strict healthy S1 have all been proved does it
terminalize private Orb recovery. Unknown dispatch may
be abandoned only when the cancellation receipt proves no durable host acceptance;
an accepted attempt needs retained terminal failure evidence. A retained failure
outside the known pre-mutation stages also requires the host's healthy-rollback
verdict. After cutover, `preflight` goes only through the root-owned forced-
command controller. Daily `deploy` resolves current `main` itself and sends only
that exact SHA—never an Owner-supplied hash—to the host. The two maintenance
commands do the same CI-authoritative resolution, additionally bind the current
production SHA and exact protected changed-path digest, and require their own
current Owner authorization. They are not fallback spellings for an ordinary
deploy.

The baseline operator keeps its root process at umask `077`, but every package
install, Chromium smoke, and app build child explicitly uses umask `022`. It
requires generated `app/dist` directories to be `0755` and files `0644`, and
rechecks types, modes, and hashes immediately before Caddy starts in both the
forward and rollback paths. It snapshots all three SQLite databases, proves
integrity and foreign keys, checks the exact migration invariant, and never
deletes the preexisting unknown release tree: that whole wrapper is atomically
quarantined to the same filesystem and retained intact after success, with an
exact rename-back rollback while rollback remains safe. Before the first Caddy
start attempt, a failure may restore the exact database snapshots and old code;
it reports healthy rollback only after the restored strict public health suite
passes. The first Caddy start attempt is the external-write boundary. At or
after that boundary, the operator does not overwrite possibly changed databases
or run old code against the migrated schema: it preserves the consistent target
code and schema, reports `rolledBack: false`, and fails closed for diagnosis.
Do not retry a failed baseline command without a fresh state classification and
authorization.
Once `bootstrap-preflight` reports an established baseline, do not run baseline
again: the retained success receipt, quarantine, and default identity are inputs
to bootstrap, not material to recreate for every candidate.

The one-time cutover uses `deploy/bootstrap-eqb-deployment.sh` to prepare the
first release, move writable state under `/opt/eqb/shared`, install
`deploy/eqb-release.service` and `deploy/Caddyfile.release`, and install the
fixed controller. Candidate builds run as `eqb-build` without the production
environment or shared data, inside bounded transient systemd cgroups that
terminate leftover children before root seals the tree. Linked privileged
ancestors fail closed, and deployment-control files are restored from the
root-private exact-target Git archive after candidate scripts finish. The
bootstrap payload is first hash-verified and retained root-private, then runs
as a manager-owned transient service so loss of SSH does not create an
ambiguous abandoned transaction. The controller key is installed on the
actual non-root SSH transport account with a forced transport wrapper; that
wrapper accepts only the bounded command grammar and enters the root-owned
controller through `sudo -n`. Ordinary release code cannot change deployment
rules. This transition consumes the existing, explicitly named management
account, its one proven bootstrap key, and its already-working `sudo -n`
boundary; it is not a host-account provisioner and does not create an account or
silently edit sudoers. The bootstrap validates those prerequisites, and both the
new route before retirement and the same route after retirement must execute the
root-owned strict entrypoint successfully. Before maintenance it also proves
the baseline receipt/quarantine/identity state, descendant ancestry, an empty
protected diff, and usable future controller `sudo` scope. It takes private
SQLite `.backup` snapshots of all three live databases, verifies integrity and
foreign keys, and records their SHA-256 digests; these are incident evidence and
are never automatically replayed after traffic may have reopened. Keep the
legacy `deploy/eqb.service`, `deploy/Caddyfile`, and `scripts/deploy-remote.sh`
only for pre-cutover operation and rollback evidence; do not use the legacy
in-place deploy after a successful cutover. Releases are retained for rollback;
the controller refuses new staging below 5 GiB free instead of deleting them.
Prune only reviewed, non-current releases as a separate authorized maintenance
operation.

Ordinary deployment also compares the current and target Git trees before
staging. Any change to the versioned controller/systemd/Caddy files or to the
named startup/recovery and high-authority persistence owners fails before build
and restart. The initial bootstrap applies the same persistence comparison
against the legacy production `HEAD`. Do not bypass it or reuse the consumed
legacy baseline operator as an advancement mechanism. Use the maintenance
decision table below; later authenticated API writes are not actions performed
or authorized by any deployment command.

| Candidate diff | Required sequence after merge and authoritative CI |
| --- | --- |
| no protected path | `preflight`, then ordinary `deploy` |
| only versioned controller/unit/Caddy | `update-host-config`, then ordinary `deploy` |
| persistence authority | `reviewed-persistence` (it builds and activates the release itself) |
| versioned host config + persistence authority | `update-host-config`, then `reviewed-persistence` |
| either stable launcher | separately authorized root maintenance; no forced command may replace it |

`reviewed-persistence` is intentionally an outage transaction, not a broad
"migration allowed" flag. Before asking for authorization, review every changed
protected path and the concrete forward/idempotency behavior. The controller
binds the exact changed-path digest, builds before outage, stops Caddy and `eqb`,
snapshots and verifies `question-bank.sqlite`, `user-data.sqlite`, and
`import-ops.sqlite`, activates the target with traffic closed, explicitly opens
both import-ops shape owners, starts `eqb` twice, and checks integrity/foreign
keys after both starts. It persists `trafficReopened=true` before attempting to
start Caddy. Failure before that marker restores all three snapshots and the old
release; failure at or after it never replays snapshots. A failed rollback or
post-traffic health failure retains `active.json`; do not retry on the old
authorization. Inspect public health/preflight, diagnose, then obtain fresh
Owner authorization for the same exact `main` and changed-path digest so the
controller can enter its bounded recovery path.

`update-host-config` changes only `deploy/eqb-deploy-controller.mjs`,
`deploy/eqb-release.service`, and `deploy/Caddyfile.release`. It validates an
exact Git archive with Node/systemd/Caddy, stages an immutable SHA version,
backs up the installed unit/Caddy file, switches the version pointer, reloads,
and requires strict health. A healthy rollback is terminal; an unhealthy one
retains `active.json` and likewise requires diagnosis plus fresh authorization
for the exact same target/digest. It does not activate the application release,
so follow it with ordinary `deploy`, or with `reviewed-persistence` when that
same candidate also changes persistence authority.
The stable root dispatcher detects this active transaction and runs its private
copy of the previous controller module, so interruption after pointer switch
does not delegate rollback to unproven new controller code.

### One-time Tencent S2 maintenance-controller installation

The current Tencent host was bootstrapped before the versioned controller
layout existed. After this maintenance implementation is merged and its exact
`main` SHA has authoritative CI, migrate that host once. This is a separately
authorized production/root action; repository presence is not authorization.
Do not run the installer from an ordinary Deployment Orb command.

The Deployment project uses the repository-owned TAT client rather than an
ambient `tccli` profile. Configure these exact project environment names before
readiness; changing them is a separate Secret/configuration action:

- `TENCENTCLOUD_SECRET_ID` and `TENCENTCLOUD_SECRET_KEY`: a dedicated CAM
  identity limited to `tat:RunCommand`, `tat:DescribeInvocations`, and
  `tat:DescribeInvocationTasks` for the target host;
- `TENCENTCLOUD_SESSION_TOKEN`: optional temporary-credential token;
- `TENCENTCLOUD_REGION`: the exact Tencent region such as `ap-guangzhou`;
- `QUESTION_BANK_TENCENT_TAT_INSTANCE_ID`: the exact CVM `ins-*` or Lighthouse
  `lhins-*` identity.

The region and instance ID are target configuration, not authority. The client
never reads a user profile or accepts an endpoint override. It signs direct
`tat.tencentcloudapi.com` API v2020-10-28 requests with the official
TC3-HMAC-SHA256 shape. TAT command authority is effectively a root break-glass
path, so do not reuse a general cloud credential or retain this dedicated
credential in the Deployment project after the one-time installation is
complete. Adding, rotating, or removing it remains a separately authorized
Secret action; routine deploys never need it.

For the later installation action, a clean trusted checkout materializes the
installer and six-file payload from the exact merged SHA (never from
working-tree bytes):

```bash
SHA=<exact-merged-main-sha>
git show "$SHA:deploy/install-eqb-maintenance-controller.sh" \
  > /tmp/install-eqb-maintenance-controller.sh
git archive --format=tar --output=/tmp/eqb-maintenance-controller.tar "$SHA" -- \
  deploy/Caddyfile.release \
  deploy/eqb-release.service \
  deploy/eqb-deploy-transport \
  deploy/eqb-deploy-controller \
  deploy/eqb-deploy-controller.mjs \
  deploy/inspect-eqb-maintenance-host.sh
sha256sum /tmp/install-eqb-maintenance-controller.sh \
  /tmp/eqb-maintenance-controller.tar
```

Before authorizing installation, obtain a distinct direct Owner authorization
for read-only maintenance-install readiness and run:

```bash
node scripts/amp-orb-deploy.mjs maintenance-install-readiness \
  --owner-said-maintenance-install-readiness
```

The command resolves and rechecks exact CI-authoritative `main`, computes the
canonical six-file `git archive` digest, and reads the inspector from that exact
commit. It sends one Base64-encoded root `SHELL` command to exactly one configured
CVM or Lighthouse instance with `SaveCommand=false`; the command uses a cleared
environment and streams the inspector to `/bin/bash -s` without persisting a
working-tree copy. It polls the returned exact invocation and task IDs, requires
an untruncated (`Dropped=0`) Base64 output and a consistent remote exit code, and
reports only an opaque region/instance digest. `RunCommand` has no idempotency
token: the client never automatically retries an ambiguous dispatch. Reconcile
the invocation in Tencent before requesting any fresh readiness authorization.

This is a strictly read-only host inspection: it acquires the existing
production lock, requires the versioned host root to be absent, rejects active
maintenance state, checks root metadata and installed-current hashes, native
parsers, all four exact sudo argv forms, trusted remote `main`, free space, and
local/public health. It reads no database or Secret content and writes no host
file. Accept only one
`EQB_MAINTENANCE_INSTALL_READINESS` marker whose strict schema binds the exact
SHA, payload digest, transport user and `state=ready`; any command failure,
missing/duplicate marker, unexpected field, or `state=failed` is a blocker.
The old forced controller does not need to support this one-time inspection.

After that fresh readiness passes and the Owner separately authorizes the root
installation, record both local digests, transfer the installer and payload
through the approved Tencent root/TAT path, and compare them on-host before
execution. With the transport username taken from the pinned Deployment SSH
target, the authorized root invocation is:

```bash
sudo /bin/bash /root/install-eqb-maintenance-controller.sh \
  "$SHA" <payload-sha256> /root/eqb-maintenance-controller.tar <transport-user>
```

Require one `EQB_MAINTENANCE_CONTROLLER_INSTALL` success receipt, then run the
normal Deployment Orb read-only `preflight`. The installer itself checks exact
archive members/types, fetches exact remote `main` as `eqb`, binds every byte to
that commit, and reruns the trusted staged inspector on its inherited production
lock descriptor before creating a backup or changing installed controller and
service files. A root-owned, single-link legacy deployment lock may be `0600`
or `0644`; while holding it,
the installer normalizes it to `0600`, restores the prior mode on handled
rollback, and installs a launcher whose `umask 077` keeps future lock creation
private. It then checks Node/systemd/Caddy syntax and, while retaining that
lock, invokes the active versioned module's read-only preflight directly. It
does not re-enter the lock-taking forced route from inside the installer; the
normal Deployment Orb preflight after the success receipt and lock release is
the full-route proof. It keeps the old files and success receipt in one
root-private backup directory. A handled failure before file replacement
removes the newly created host-configuration layout; after replacement it
attempts every restore/reload/health step and emits an explicit critical result
if rollback is incomplete. It neither changes the Deployment Secret nor touches
databases, R2, papers, users, packages, DNS, or a blank-server setup. If it
fails, stop and inspect the retained root-private backup; never infer retry
authority from its rollback attempt.

### Minimal root dispatch barrier upgrade (separate root authorization)

This repository change installs **no production files**. It adds a durable
admission gate to the root wrapper, not an equivalence-rebind operator. The
wrapper embeds the gate and needs no new module to run ordinary commands. The
management module is separately installed as root:root `0644` at
`/usr/local/libexec/eqb-deploy-barrier-v1.mjs`; all its ancestors must be real,
root-owned directories without group/world write. It is not added to sudo or
SSH grammar. No CI authority, credential, service, database or R2 change is
part of this upgrade.

The shortest bootstrap is a separately authorized, exact-payload **root**
installation through the existing break-glass route, not `update-host-config`
and not a rerun of the consumed maintenance installer. There is no recursion:
root can install the wrapper directly under the already-existing lock. Prepare
and review that exact root invocation after merge/readiness; the steps below
are its required ordering, not permission to execute an improvised command.

1. Resolve fresh authoritative live main `T` through the existing Hosted-only
   gate. Independently inspect actual production `P`, host marker `M`, five
   installed hashes/metadata, both maintenance states, lock and versions. Do not
   assume the historical `f396…` / `17c8…` observations remain current. Require
   no active maintenance and no `versions/T` or existing barrier; unexpected
   entries mean inspect, never overwrite. Recompute target/operator digests
   from exact Git objects; bind a UUID and a canonical payload map containing
   the root wrapper, management module and all five host/stable blobs. This
   payload digest is not the protected changed-path digest.
2. In one root-owned, manager-lived attempt, acquire the existing `0600`
   root:root, regular single-link `deploy.lock` nonblocking without replacing
   it. Repeat identity/main/metadata/health checks while held. Retain a private,
   fsynced copy of the old wrapper and exact `M` pointer. Unit, Caddy and
   transport must equal installed `M` bytes. The reviewed payload may update
   the root wrapper, manager and selected controller module; the module gate
   is necessary for delayed legacy submissions. Other host differences stop.
3. Install/fsync the verified management module and atomically replace/fsync
   the root wrapper, **before creating the barrier or changing the marker**.
   At this intermediate point new requests encounter the new gate and the old
   marker rejects the changed wrapper hash. Inspect wrapper processes and
   `eqb-deploy-*` systemd units/jobs as diagnostics only: empty snapshots do not
   acknowledge in-flight IPC. The selected module checks the barrier before
   every mutation, so delayed legacy requests opening it after acquiring the
   lock are also blocked. No restart, force-kill or long-held lock is allowed.
4. Still under that same lock, use the reviewed module's `createBarrier` with
   the exact identity (do not invoke its lock-taking CLI recursively). Prepare
   and fsync root-owned `versions/T` with the new module, frozen unit/Caddy and a
   marker binding all five target hashes, including the **new** root-wrapper
   hash. Preserve `versions/M`. Atomically switch/fsync the host pointer. This
   explicitly authorized root upgrade is not byte equivalence. Application
   current stays `P`; unit/Caddy/transport bytes stay untouched.
5. Prove target pointer/installed hashes and directly call the selected module's
   readonly preflight plus strict health while locked. Keep the barrier active
   when releasing the lock. Require the independent forced preflight afterward.
   Failure/unknown of that proof leaves the barrier and evidence in place;
   do not roll back or retry automatically. A later explicitly authorized
   `finalize` rereads the exact identity, target binding and health before
   atomically moving the barrier to its private terminal receipt.

Known pre-marker failure may restore the saved wrapper under the same lock
and prove the untouched `M` binding and health. Known post-marker failure may
restore the `M` pointer and old wrapper under the same lock and prove both;
that completes a rollback to the pre-upgrade protocol, **not** continued barrier
protection by the old wrapper. Never release into an ambiguous partial rollback:
retain the new gated wrapper and active barrier when possible, report the exact
state and require new root recovery authorization. Process/transport unknown is
not a handled failure: inspect actual wrapper hash, pointer, barrier, units and
receipts first. No automatic bootstrap replay. A successful root installation
at `T` already binds the host marker to `T`; it does not need an additional
same-`T` equivalence rebind. Application activation remains separately authorized.

The tracked implementation is `deploy/eqb-barrier-bootstrap.mjs` and
`scripts/lib/barrierBootstrapTat.mjs`; never rerun the consumed maintenance
installer. After merge and exact-main Hosted authority, separately authorized
commands are:

```text
node scripts/amp-orb-deploy.mjs root-barrier-readiness --owner-said-root-barrier-readiness
node scripts/amp-orb-deploy.mjs root-barrier-install --owner-said-root-barrier-install --readiness FILE --payload-digest SHA256 --operator-digest SHA256 --transaction UUID
```

Save readiness's exact canonical stdout as `FILE` in the private Deployment Orb.
Inspection streams reviewed source as in-memory imports: no host file writes,
installation or service mutation. It holds the existing lock for a bounded
snapshot/direct proof. It reports M/P, five installed hashes/metadata plus the
optional manager, lock device/inode/owner/mode, pointer/version/marker metadata,
maintenance and recovery entries, barrier value or invalidity, and process/job
diagnostics. Unsafe state or unprovable health fails closed; partial stdout is
not a readiness report. Existing manager, barrier, target version, maintenance
or recovery-controller entries prevent this first-install path.

`buildPayload(T, readExactGitBlob)` defines `eqb-barrier-payload-v1`: recursively
sorted JSON keys, UTF-8, one terminal LF, and the exact six fixed paths with mode,
SHA-256 and canonical base64. SHA-256 binds these serialized bytes; the operator
digest separately binds its exact Git blob. Recompute both after merge, not from
worktree files. Neither is the protected changed-path digest. The CLI rebuilds
from Hosted-authoritative live main and rejects approved digest mismatch before
dispatch. Compressed TAT transport reconstructs and verifies exact payload bytes.

One TAT submission exclusively stages `barrier-dispatch-UUID`, then starts one
null-input, manager-lived `eqb-barrier-install-UUID.service`. A lost acknowledgment,
staging interruption or missing/invalid receipt is UNKNOWN, never replay authority.
The locked installer rejects reused attempts, readiness older than 120 seconds,
changed metadata (including lock inode), frozen-file differences and changed live
main. Hosted CI remains the existing trusted Deployment adapter's authority check
immediately before dispatch; the anonymous root main lookup has no credentials
or fallback. The installer is not an independent CI authority.

`eqb-barrier-install-v1` binds UUID, payload/readiness digests, M/T/P, phase,
timestamps and retained-barrier flag. Private `barrier-install-UUID` keeps payload,
readiness, old wrapper and receipt. `success` means locked target/health proof
passed and the barrier remains active. `known-failure` means handled rollback
proved old M/wrapper/health, not that old callers honor the retained barrier.
`unknown`, failed rollback proof or clock regression requires new inspection and
recovery authorization. Retain evidence; no automatic cleanup/retry/finalize.
Known rollback also leaves the manager and any barrier/target staging as evidence,
so a new UUID cannot silently reopen installation.

After locked success the CLI runs forced preflight outside the lock and emits
strict `eqb-barrier-route-proof-v1` with `forced=passed|unknown`. Failure retains
the active barrier and never triggers rollback. Finalize, root recovery, cleanup
and application activation each require new authorization. No DB/R2, application,
service restart/reload, credential or CI-authority mutation is included.

After installation, root-only management syntax (each action needs its own
current authorization; use a cleared environment) is:

```text
/usr/bin/node --no-addons /usr/local/libexec/eqb-deploy-barrier-v1.mjs inspect
/usr/bin/node --no-addons /usr/local/libexec/eqb-deploy-barrier-v1.mjs create UUID M T P PAYLOAD_SHA256
/usr/bin/node --no-addons /usr/local/libexec/eqb-deploy-barrier-v1.mjs finalize UUID M T P PAYLOAD_SHA256
/usr/bin/node --no-addons /usr/local/libexec/eqb-deploy-barrier-v1.mjs recover UUID M T P PAYLOAD_SHA256
```

`inspect` writes nothing; invalid/unknown state exits nonzero and remains in
place. It does not claim Git/CI readiness. `create` exclusively fsyncs
`deployments/root-dispatch-barrier.json` (root:root `0600`) with schema
`eqb-root-dispatch-barrier-v1`, identity, `phase=active`, `createdAt` and null
`finishedAt`. It rejects existing/consumed transactions and existing maintenance.
`finalize` proves `T`; `recover` proves an **already restored** `M` and performs
no rollback itself. Both require unchanged `P`, the five installed hashes,
no other active maintenance, and direct readonly preflight/strict health.
Successful terminalization writes `phase=finalized|recovered` and `finishedAt`,
then atomically renames the active file to `root-dispatch-UUID.json`. A crash
between phase-write and rename leaves a blocking terminal-phase barrier; only
newly authorized, matching recovery/finalization may finish it after reproof.
A partial temporary file, duplicate receipt, conflicting phase, missing active
state or failed proof stops rather than guessing/retrying. The strict parser
rejects extra/missing/duplicate keys, noncanonical JSON and invalid identities.

The machine guarantee applies to every invocation through the installed root
wrapper, including old Deployment checkouts. It does not constrain arbitrary
root shells. Do not change the barrier, its parent, or the lock manually, and
do not call any other root maintenance operator while it is active. Future
equivalence rebind must prove all five Git blobs/installed bytes, create this
barrier before pointer mutation, and retain it through independent route proof.
It needs its own reviewed operator and exact Owner authorization.

The forced transport entrypoint parses the command before its strict root
entrypoint runs the controller and deployment lock in a transient host systemd
service with null input and journal output. An Orb/SSH disconnect does not
cancel an in-flight build, health check, or rollback; candidate output remains
in a private host log. For an ordinary post-cutover deploy, reconnect and run an
authorized read-only `preflight` to determine whether the lock is still held and
which exact release is healthy. For an interrupted one-time bootstrap, preserve
the private Orb recovery record, classify read-only, and use only the separately
authorized `bootstrap-resume` finalizer; do not launch a second host bootstrap.
Host receipts, attempt logs, and unit journals remain available for root-side
incident diagnostics.

The journal contract uses exactly one schema-selected controller marker:
`EQB_DEPLOY_RECEIPT`, `EQB_REVIEWED_PERSISTENCE_RECEIPT`, or
`EQB_HOST_CONFIGURATION_RECEIPT`, plus the separate bootstrap terminal marker
for bootstrap only. Zero terminal markers is `unknown`, not proof of failure and
never permission to retry; duplicate or contradictory markers fail closed. For
bootstrap, run `bootstrap-inspect` first and resume only a transaction whose
host bootstrap completed. An authorized abandon may convert failure or unknown
dispatch into a terminal state only by installing the exact cancellation marker
under the host lock, then independently proving controller rejection, the old
route, and strict S1 health. Unknown dispatch additionally requires no durable
host-acceptance marker; accepted attempts require retained terminal failure
evidence, and post-mutation failure also needs healthy rollback. Do not run
`amp orb restart-processes` while bootstrap finalization is pending.

Repository readiness still grants no production authority. Before cutover:

1. create a separate private Deployment Orb project;
2. run a fresh read-only bootstrap preflight;
3. only in S0, obtain direct Owner authorization for the protected baseline
   migration, run `baseline --owner-said-baseline-migration`, and require its
   strict success receipt. In S1, require exactly one success receipt bound to
   production `HEAD`, one intact quarantined release wrapper, the valid default
   Git identity, no live release layout, controller-capable `sudo`, and strict
   local, local-TLS, and public health; never invoke baseline again;
4. prove locally and on-host that production is an ancestor of current `main`
   and their fixed persistence-authority diff is empty. Then obtain a new,
   separate direct Owner authorization and run
   `bootstrap --owner-said-release-bootstrap`;
5. require bootstrap to generate the dedicated Ed25519 identity, verify the new
   forced-controller route, rotate only
   `QUESTION_BANK_DEPLOY_SSH_PRIVATE_KEY` in the current Deployment project via
   stdin, atomically retire the exact old privileged key, and then prove the new
   key still works and the old key gets exact public-key rejection. The target
   SHA, host unit, generated controller identity, and old bootstrap identity
   must already exist in the private recovery record. If the caller is
   interrupted after host work starts, stop without rerunning `bootstrap`; use
   authorized read-only `bootstrap-inspect` to classify it. With fresh direct
   Owner authorization, use `bootstrap-resume` with
   `--owner-said-release-bootstrap-resume` only for pending finalization, or use
   `bootstrap-abandon` with `--owner-said-release-bootstrap-abandon` only to
   cancel the exact target/unit under the bootstrap lock and then prove new-key
   rejection, the still-working old key, and strict S1 health. Lock contention
   means stop and inspect again. Unknown dispatch additionally requires the
   cancellation receipt to report no durable host acceptance. An accepted
   attempt requires retained terminal failure evidence, and a failure after the
   known pre-mutation stages also needs the host's healthy-rollback verdict.
   Resume revalidates the
   recorded SHA's hosted checks, proves the new
   route, rotates the Secret, classifies and retires the old identity only when
   needed, and re-proves both routes before terminalizing recovery.
   Terminalization atomically renames the whole recovery directory before
   deleting either private identity; a non-secret private completion receipt is
   retained, and a later resume can finish a partially interrupted identity
   cleanup without repeating host or Secret mutation. Any other old-key result
   fails closed and retains active recovery state;
6. only after successful bootstrap finalization, refresh the Deployment Orb
   environment with `amp orb restart-processes --thread "$AMP_THREAD_ID"`, then
   obtain authorization for and run the forced-controller `preflight`;
7. confirm deployment secrets are absent from development/CI projects and
   record the exact cutover evidence in `go-live-record.md`.

The first real Orb deployment then needs a separate direct Owner authorization.
Thereafter the Owner's normal daily instruction is only `部署最新版`; no Mac or
handwritten SHA is involved.

## Backup + content operations

### Daily backup to R2 (Slice 3)

`scripts/backup-to-r2.sh` takes an online `.backup` snapshot of both
sqlite dbs (`question-bank.sqlite` + `user-data.sqlite` — a backup is a
read-only off-site copy, so user data IS in scope here, unlike
pull-run-push), gates each snapshot on `PRAGMA integrity_check == ok`, and
pushes the snapshots + `app/public/paper-assets/` + `data/user-space/files/`
to R2 with `rclone copy` (never `sync` — copy only adds, so a local
mis-delete can never propagate to the off-site copy). It then prunes old
dated prefixes as a separate, retention-guarded step.

**1. Install rclone** on the server:

```
sudo apt install rclone   # or: curl https://rclone.org/install.sh | sudo bash
```

**2. Create the R2 remote.** Either run `rclone config` interactively and
follow the prompts (`n` new remote → type `s3` → provider `Cloudflare` →
paste the R2 access key / secret / endpoint from the Cloudflare dashboard),
or hand-write `~/.config/rclone/rclone.conf` (or
`/opt/eqb/english-question-bank/rclone.conf`, gitignored — see
`.gitignore`) with this stanza shape (placeholders only, never commit real
values):

```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = PLACEHOLDER_ACCESS_KEY_ID
secret_access_key = PLACEHOLDER_SECRET_ACCESS_KEY
endpoint = https://PLACEHOLDER_ACCOUNT_ID.r2.cloudflarestorage.com
```

The bucket is addressed as `r2:eqb-backup` (remote name `r2`, matching
`EQB_R2_REMOTE`'s default `r2:eqb-backup` — override via env if the bucket
is named differently).

**3. Confirm server timezone**, since the cron schedule below assumes the
server clock and Beijing time may differ:

```
timedatectl
```

If `Time zone` is `UTC` (typical for a fresh cloud VM), Beijing time
(UTC+8) 03:30 is **19:30 UTC the previous day**. Write the crontab in the
server's actual timezone accordingly — do not assume UTC without checking.

**4. Install the cron job** (as the `eqb` user, `crontab -e`). Example for
a UTC server targeting 03:30 Beijing time (= 19:30 UTC previous day):

```
30 19 * * * cd /opt/eqb/english-question-bank && ./scripts/backup-to-r2.sh >> server/logs/backup-to-r2.log 2>&1
```

If the server's local timezone is already set to Asia/Shanghai, use
`30 3 * * *` directly instead.

**5. Manual test** (safe — read-only, no push, works even before rclone is
configured):

```
scripts/backup-to-r2.sh --dry-run
```

### Content promotion and legacy transport

Review-backed paper publication no longer transports a local database. After
online Review approval, the Agent stops. Only after a separate current Owner
`上线 <paperId>` command does the Agent call the production server's
ship-token-only single-paper promotion:

```bash
node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-ship
node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-retry-ship
```

The command reads exact current approval with the low-authority Agent token,
then sends that identity with the separate shipping credential. The server
freezes Review mutation, rebuilds from immutable Review bytes, and invokes the
existing atomic publisher against its own DB/assets. It never stops the service,
uploads SQLite, or syncs a broad asset tree. Daily R2 remains asynchronous.

`scripts/pull-run-push.mjs` remains a maintenance/legacy transport. Its `pull`
and `check-manifest` are unchanged; `push <paperId>` refuses when Review reports
a Candidate paper and points to `review.mjs promote`. Never manually scp a
database onto the running server's live path.

**Required env:**

```
EQB_REMOTE=eqb@<host>              # or ssh://eqb@<host>; real-server mode
EQB_REMOTE_REPO=/opt/eqb/english-question-bank   # default, override only if different
```

(`EQB_REMOTE=local:<abs-dir>` is a TEST-only mode — `<abs-dir>` becomes the
fake "remote" repo root on the local filesystem, no ssh involved. This is
the seam `scripts/verify-launch-deploy.mjs` VA5 uses; never point it at a
real server path.)

**Maintenance/legacy subcommands:**

```
node scripts/pull-run-push.mjs pull
node scripts/pull-run-push.mjs push <paperId> --owner-said-ship
node scripts/pull-run-push.mjs push <paperId> --owner-said-retry-ship
node scripts/pull-run-push.mjs check-manifest <comma,separated,paths>
```

- **`pull`** — takes a remote ONLINE `.backup` snapshot of
  `question-bank.sqlite` (never a live `cp`), transfers that snapshot +
  `app/public/paper-assets/` down to the local repo, backs up the local old
  db (timestamped) before moving the snapshot into place. Never pulls the
  remote `data/` directory wholesale — only the two explicitly-named
  targets.
- **`push`** — legacy non-Review maintenance only. For a Review-backed Candidate
  it fails before remote mutation and points to single-paper promotion. Where
  the historical path is explicitly retained, it requires the paper ID plus the
  current Owner authorization flag. Its locked swap recipe (PA MF-1, do not
  reorder): manifest assertion → verify local db passes `PRAGMA integrity_check`
  → re-run the legacy local ship gate → **stop** the
  remote `eqb` service (`sudo systemctl stop eqb`, requires the deploy user
  to have that sudo rule) → back up the remote OLD db to a timestamped path
  → transfer the local db to a remote TEMP path in the same directory as the
  final path → atomic same-filesystem `mv` temp → final → rsync new
  paper-assets in additively → **start** the remote `eqb` service. The
  stop/start exists to flush the server's startup-time in-memory indexes and
  route cache (same reason the import pipeline's own direct-SQLite writes
  require a stop/restart — see `scripts/import-pipeline/README.md:29-31`),
  NOT to release a long-held db handle (`journal_mode=delete`, handles are
  opened/closed per request — there is no WAL/-shm/-wal sidecar to manage).
  The active `question-bank.sqlite` path is never written to in place; every
  swap goes through a same-disk temp file + atomic rename.
  A Review-backed Candidate is rejected before service stop, backup, transfer,
  or swap; its shipping guard belongs exclusively to server-side promotion.
- **`check-manifest`** — runs only the manifest guard (MF-2) over an
  explicit comma-separated path list: exits non-zero if any path's basename
  matches `/user-data/i` (catches `user-data.sqlite`,
  `user-data.sqlite-journal`, and future renames), exits 0 otherwise. Useful
  as an ops dry-check before trusting a manually-constructed path list.

**Both `pull` and `push` never read, write, or delete `user-data.sqlite` (or
any `*.sqlite-*` sidecar), locally or remotely, anywhere outside the
manifest-abort guard itself** — the transfer set is always exactly
`data/question-bank.sqlite` + `app/public/paper-assets/`, never a `data/`
glob.

**FG-4 warning — before the very first `push` to a freshly-provisioned
server**, confirm the remote `user-data.sqlite` is the one the server itself
created via `ensureUserDatabaseShape()` on first boot (step 6 above), never a
copy pushed up from a local machine. `pull-run-push.mjs` refuses to touch
`user-data.sqlite` by design, but this warning covers the adjacent mistake of
someone else manually `scp`-ing a local `user-data.sqlite` onto the server
before the first import — that would clobber real server-native user/session
state with unrelated local state.
