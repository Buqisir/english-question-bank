# ADR-0023: A separate Amp Orb will deploy website code from verified `main`

- Status: Accepted; S2 release deployment is active in production
- Scope: website deployment plus separately authorized persistence and host-configuration maintenance

## Context

The existing `deploy-remote.sh` is a proven operator convenience script, but it
updates, installs, and builds inside the checkout currently serving production.
It does not provide an exact GitHub status gate, private host-key pinning,
release-directory staging, an atomic `current` switch, a durable receipt, or
automatic rollback.

During Amp bug `amp_bug_0uiggF5jWG6i6iaB72BATT`, GitHub Actions verifies each
exact PR test merge and post-merge `main` SHA through the required hosted
`verify` and `e2e` checks. The dedicated CI Orb remains separate and exposes no
production, deployment, database, R2, or paper-publication credential to
candidate code. Giving any CI executor an SSH key would collapse the strongest
existing isolation boundary.

## Decision

Website code deployment will belong to a separate private Deployment Orb. It
has no webhook and never deploys automatically after a merge. A current Owner
command `部署最新版` is the complete human instruction; the machine resolves and
pins the current `origin/main` SHA, so the Owner never copies a commit hash.

Before SSH, the trusted controller requires all of the following:

1. its checkout is tracked-clean local `main`;
2. a clean stale checkout fast-forwards to `origin/main`, while a diverged
   checkout fails closed;
3. local `HEAD` equals the official repository's live `refs/heads/main` SHA
   read from an explicitly pinned `github.com` API rather than trusting a
   locally named remote or ambient `GH_HOST`;
4. that exact SHA has completed, successful `verify` and `e2e` check runs from
   the `github-actions` App, both belonging to one workflow run in this
   repository; the separately named manual-dispatch jobs cannot qualify;
5. the three deployment Project Secrets are present only in the Deployment
   Orb environment.

The Orb-side controller writes the private key and pinned `known_hosts` into a fresh
`0700` temporary directory as `0600` files. SSH uses batch mode,
`IdentitiesOnly`, an empty global host-key file, and
`StrictHostKeyChecking=yes`. It never runs `ssh-keyscan`, accepts a first-use
host key, prints a credential, or puts a key in argv. After the one-time
bootstrap, that key can authenticate only to the named non-root SSH transport
account with OpenSSH `restrict` and a forced command. The forced transport
wrapper accepts only `preflight`, `deploy <sha>`,
`deploy-reviewed-persistence <sha> <reviewed-path-digest>`, or
`update-host-config <sha> <reviewed-path-digest>` and crosses the existing root
boundary through one root-owned strict `sudo -n` entrypoint. It cannot open a
shell, forward ports or agents, choose a host executable, or supply other root
arguments.

The forced command has two root-owned layers. Tiny stable transport and root
dispatchers enforce the command grammar and systemd/lock boundary. They are not
updatable by any forced command. The implementation module and release
systemd/Caddy templates live in an immutable, SHA-versioned host-configuration
directory selected by an atomic `current` pointer. Updating that version is a
separate production configuration operation requiring new Owner authorization;
it never grants a candidate permission to replace either stable dispatcher.
Candidate package lifecycle, browser smoke, and app build commands run as the
separate `eqb-build` user with a cleared environment, no production `.env`, and
no access to `shared`. Every command runs in a bounded transient systemd cgroup,
so leftover children are terminated before root touches the candidate tree.
Root then rejects linked privileged ancestors and restores deployment-control
files from its private archive of the exact Git target instead of trusting
candidate-modified copies. The host controller attaches the fixed persistent
paths only after the build succeeds, seals the release as root-owned without
following links, keeps `/opt/eqb` and the release `current` pointer root-owned,
independently fetches `main` again, and only then permits activation. The `eqb`
runtime user cannot replace release directories or either active pointer.

Before staging, the fixed controller compares the current release SHA to the
target tree without executing candidate code. Changes to the host controller,
release systemd/Caddy configuration, or the named startup/recovery and
high-authority persistence owners stop with a distinct terminal failure before
build or restart. Established idempotent startup shape/recovery code may run
only when that protected surface is unchanged. A separately authorized
migration or host configuration procedure is required for the corresponding
protected diff; candidate-provided manifests and SQL-keyword heuristics cannot
waive either gate. Changes to the two stable launchers remain a root-only
operation.
This is intentionally not a ban on ordinary reviewed server code: deployment
does not itself invoke later authenticated request-time writes, paper
promotion, or Review actions.

OpenSSH starts the fixed controller inside a host-owned transient systemd
service without binding its standard streams to SSH, with the exclusive
deployment lock inside that service. Loss of the Deployment Orb or SSH
connection therefore does not abandon an in-flight host build, health check,
or rollback, and a second request still fails closed. The connected path reads
only manager-owned journal evidence after completion. Candidate command output
is written to a private host log, so a disconnected output pipe cannot
interrupt package installation or the build.

The target production layout is:

```text
/opt/eqb/
  current -> releases/<sha>
  releases/<sha>/       immutable website code and build output
  shared/               databases, Review bytes, paper assets, user files,
                        environment, logs, and other persistent runtime state
  deployments/receipts/ private deployment receipts
  deployments/host-configuration/
    current -> versions/<sha>
    versions/<sha>/     immutable controller module and systemd/Caddy templates
```

A prepared release is installed, built, and smoked before activation. The
controller rechecks that live `main` still equals the pinned SHA, then acquires
one non-blocking exclusive host deployment lock. If `main` changed, the run
stops and asks the Owner to repeat `部署最新版`; concurrent deployment attempts
fail rather than overlap. The `current` symlink changes by one same-directory
atomic rename. The controller
then restarts only `eqb` and checks the local API, Caddy, the public health
endpoint, `/`, `/ops/`, and `/ops/?view=review`. Failure switches `current`
back to the previous release, restarts, rechecks health, and reports failure.
An already-current healthy SHA is an idempotent no-op. Releases are not deleted
automatically; new staging fails before build when less than 5 GiB remains, so
old non-current releases can be reviewed and pruned as a separate operation
rather than risking a full production filesystem.

Ordinary website deployment itself never invokes migrations, `pull-run-push`,
single-paper promotion, Review mutation, database transfer, R2 mutation, or
production configuration changes. A release that requires a protected
persistence or host-configuration change stops for the corresponding explicit
Owner-authorized maintenance command. Paper/R2 operations remain outside all
three deployment commands.

### Protected maintenance channels

`deploy-reviewed-persistence` is the only forced route allowed to activate a
candidate whose fixed persistence-authority diff is non-empty. The Orb binds an
authoritative current `main`, the current production SHA, the exact changed-path
list, and its canonical SHA-256 digest. The host independently repeats that
comparison and builds the release before outage. It then closes Caddy and the
app, takes and verifies private snapshots of all three SQLite databases,
activates the target with traffic still closed, runs the explicit import-ops
shape owners, starts the app twice, and checks database integrity and foreign
keys after both starts. The durable `trafficReopened` boundary is written before
Caddy can start. Before that boundary, failure restores all snapshots and the
previous release and must prove strict rollback health. At or after that
boundary, no automatic path may replay a snapshot or run old code against a
possibly advanced schema. Unsafe or unhealthy recovery retains the exact
root-private active transaction for a later, newly authorized recovery attempt.

`update-host-config` is the only forced route allowed to advance the three
versioned host files: the controller module, release unit, and release Caddy
configuration. It binds the same authoritative SHA and canonical protected-path
digest, extracts those exact files from a trusted Git archive, checks the Node,
systemd, and Caddy syntax, writes an immutable version marker with file and
stable-launcher hashes, takes a private backup, installs files atomically, and
switches the host-configuration pointer. Reload or health failure restores the
previous files and pointer. An unhealthy rollback retains active recovery.
While an update is active, the stable root dispatcher uses the retained
previous controller module for recovery rather than trusting a newly selected
module to recover its own interrupted installation.
Ordinary release activation remains separate and is still required afterward.

The existing Tencent Cloud S2 host predates the versioned controller layout. It
therefore needs exactly one separately authorized root installation using
`deploy/install-eqb-maintenance-controller.sh`. The installer accepts one
digest-bound archive containing the six exact deploy files from one merged
SHA, including `deploy/inspect-eqb-maintenance-host.sh`. Because the old static
controller cannot expose future inspection commands before it is replaced, the
exact inspector is streamed through the separately authorized root/TAT path; it
acquires the production lock read-only and emits one fixed, target- and
payload-bound readiness marker without reading databases or Secrets or writing
host files. The installer then acquires that same lock before any staging,
fetches and binds remote `main`, verifies every archive member against that
commit, and reruns the trusted staged inspector on its inherited lock descriptor
immediately before backup or installation. The inspector accepts only the
root-owned, single-link legacy `0600` or `0644` lock; the installer normalizes
it to `0600` while held (restoring its prior mode on rollback), and the new
stable launcher fixes `umask 077` for future creation. It checks the non-root
transport account's exact sudo command scope, preserves a root-private backup
and success receipt, and rolls back on a handled failure. Before replacing
installed files, it durably publishes the complete versioned layout; a handled
failure before replacement removes that newly created layout. Rollback attempts
every restore step and reports an explicit critical result when any restore,
reload, cleanup, or health proof fails. It does not provision a blank server,
restore data, rotate Secrets, or grant ordinary releases authority over stable
launchers.

### Legacy transition states

The one-time transition has explicit states rather than treating production SHA
equality as a proxy for safety:

```text
S0 Legacy-Unbaselined --baseline (consumed)--> S1 Legacy-Baselined
S1 Legacy-Baselined  --bootstrap(candidate)--> S2 Release
S1 with recovery     --inspect/resume--------> S2 Release
S1 failed/unknown    --inspect/cancel/abandon--> S1 Legacy-Baselined
S2 Release           --deploy(main)----------> S2 Release
S2 Release           --reviewed-persistence--> S2 Release
S2 host config       --update-host-config-----> S2 host config
```

S1 is evidence-bound, not candidate-bound. Bootstrap may target the same SHA or
a descendant SHA when the fixed persistence-authority diff is exactly empty.
Non-ancestry or unavailable Git objects produce `BASELINE_ANCESTRY_UNKNOWN`;
protected changes produce `PERSISTENCE_AUTHORITY_CHANGED`. Neither condition
falls back to baseline or bypasses the host's independent copy of the gate.

## Repository implementation and authorization boundaries

The repository implementation exposes:

- `plan`, which proves the exact clean `main` and authoritative status without
  connecting to production;
- a transition-only, explicitly authorized read-only `bootstrap-preflight` that
  classifies a legacy host as unbaselined or established. Established evidence
  requires exactly one successful receipt bound to production `HEAD`, the
  retained root-private quarantine and default Git identity, no live release
  layout, transport `sudo` scope for the future forced controller, and strict
  local, local-TLS, and public health;
- a transition-only, separately authorized `baseline` command that streams the
  tracked fail-closed legacy operator, creates verified SQLite snapshots,
  establishes the exact healthy `main` as the mutable production baseline, and
  preserves the preexisting nonconforming release tree intact in root-private
  quarantine. This S0-to-S1 transition is consumed: an established baseline is
  rejected with `BASELINE_ALREADY_ESTABLISHED`, not advanced by rerunning the
  historical operator;
- a separately authorized `bootstrap` command that generates a fresh Ed25519
  controller identity and durably records that identity, the old identity,
  target SHA, and host unit in private Deployment Orb state after inert payload
  staging but before the host transaction. An established legacy production may
  move directly to a descendant candidate only when the fixed persistence-
  authority diff is empty; unknown ancestry and a non-empty protected diff fail
  distinctly before host mutation. The host independently repeats those gates,
  snapshots and verifies all three live SQLite databases before maintenance,
  executes the hash-verified tracked bootstrap in a manager-owned transient
  service under a host lock, records exact target-and-unit host acceptance before
  the attempt, and emits uniquely marked receipts. Finalization proves the new
  non-root forced-transport/root-controller route, rotates the
  current Deployment project's private-key Secret through stdin while the old
  recovery route still exists, atomically retires that old privileged identity,
  and then proves the new route and exact old-key rejection again;
- an explicitly authorized read-only `bootstrap-inspect` command that reports
  durable recovery, host journal, controller-key, old-key, and legacy health
  classification without repeating bootstrap;
- a separately authorized `bootstrap-resume` command that loads exactly one
  private recovery record, revalidates the recorded SHA's authoritative CI,
  never repeats the host bootstrap transaction, and idempotently continues
  route proof, Secret rotation, old-key retirement or rejection proof, and
  recovery cleanup; cleanup atomically moves the record to a terminal state
  before deleting either private key, retains a non-secret completion receipt,
  and can finish deletion after another interruption;
- a separately authorized `bootstrap-abandon` command for a host transaction
  that failed, definitively rolled back, or lost its dispatch acknowledgement.
  Before discarding local recovery it acquires the same host lock and writes an
  exact target-and-unit-bound root-private cancellation marker. A running
  transaction wins the lock and blocks abandonment; a queued transaction is
  either rejected by lock contention or must observe that marker under the lock
  before its first runtime mutation. The cancellation receipt also reports
  whether durable host acceptance already
  exists: unknown dispatch may be abandoned only when it does not. The command
  then requires exact controller-key rejection, a still-active old identity,
  and a strictly healthy established legacy baseline. An accepted attempt
  requires retained terminal failure evidence, and a post-mutation failure also
  requires the host's healthy-rollback verdict. Cancellation never authorizes a
  bootstrap retry;
- an explicitly authorized `preflight` through the fixed forced-command host
  controller after bootstrap;
- `deploy --owner-said-deploy-latest`, which sends only the automatically
  resolved exact SHA to that fixed controller;
- `reviewed-persistence --owner-said-reviewed-persistence-deploy`, which binds
  the automatically resolved exact SHA and non-empty persistence-authority path
  digest to the offline snapshot/migration/verification transaction;
- `update-host-config --owner-said-update-host-config`, which binds the
  automatically resolved exact SHA and non-empty host-configuration path digest
  to one versioned, rollback-capable host update;
- a one-time Tencent root installer for moving the already-bootstrapped S2 host
  from its static controller module to the stable-dispatcher/versioned-module
  layout, preceded and immediately rechecked under lock by the standalone
  read-only root/TAT inspector; it is not a reusable provisioning or
  stable-launcher update API;
- a one-time bootstrap script that prepares the first release before outage,
  refuses a target whose persistence authority differs from legacy production,
  migrates persistent paths while `eqb` is stopped, installs the release-only
  systemd/Caddy templates and forced controller key, health-checks, and restores
  the legacy configuration and paths if cutover fails;
- fake-host state-machine proof for staging, exact-main recheck, isolated build,
  atomic switch, idempotency, private receipts, shared-data non-mutation, and
  healthy rollback.

Code presence is not production authorization. Release deployment, reviewed
persistence deployment, host-configuration update, one-time root installation,
and every recovery attempt are separate actions and require their stated current
Owner authorization. Recovery is not permission to repeat the original host
transaction automatically. A retained maintenance state can be entered only by
the same exact target and protected-path digest, and a failed command is never
implicit retry authority.
Do not refresh Orb processes between Secret rotation and successful bootstrap
finalization, because the current executor's retained old identity is part of
the recovery boundary. After finalization, the Deployment Orb environment must
refresh and a forced-controller preflight must pass. The first real daily
deployment then requires another direct Owner authorization. The Deployment Orb
must also be a separate private Amp project; its forced-key secret must not
remain in ordinary development or CI projects.

## Consequences

- CI authority and deployment authority remain independent.
- Daily use stays simple: the Owner says `部署最新版`; SHA and status handling
  are machine work.
- A sleeping Deployment Orb costs nothing between explicit deployments.
- The one-time release-layout migration, the Tencent versioned-controller
  installation, and stable-launcher changes remain root production
  configuration changes and cannot be implied by this ADR or by Secret presence.
- Paper Review approval and `上线 <paperId>` remain the separate server-side
  single-paper publication flow from ADR-0020.
- Restoring Amp Orb merge authority also requires an explicit, tested update to
  this deployment gate; it never silently accepts whichever CI happens to
  report first.
