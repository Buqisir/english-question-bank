# ADR-0023: A separate Amp Orb will deploy website code from verified `main`

- Status: Accepted; repository controller implementation ready for review
- Production activation: blocked on a later direct Owner authorization
- Scope: website code deployment only

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
bootstrap, that key can authenticate only as root with OpenSSH `restrict` and
a forced command. It cannot open a shell, forward ports or agents, choose a
host executable, or supply anything except `preflight` or `deploy <sha>`.

The forced command is a root-owned, non-release host controller. Ordinary
website releases cannot update it or import deployment logic into it. A
controller update is a separate production configuration operation requiring
new Owner authorization. Candidate package lifecycle, browser smoke, and app
build commands run as the separate `eqb-build` user with a cleared environment,
no production `.env`, and no access to `shared`. Every command runs in a bounded
transient systemd cgroup, so leftover children are terminated before root
touches the candidate tree. Root then rejects linked privileged ancestors and
restores deployment-control files from its private archive of the exact Git
target instead of trusting candidate-modified copies. The host controller
attaches the fixed persistent paths only after the build succeeds, seals the
release as root-owned without following links, keeps `/opt/eqb` and the
`current` pointer root-owned, independently fetches `main` again, and only then
permits activation. The `eqb` runtime user cannot replace release directories
or the active pointer.

Before staging, the fixed controller compares the current release SHA to the
target tree without executing candidate code. Changes to the host controller,
release systemd/Caddy configuration, or the named startup/recovery and
high-authority persistence owners stop with a distinct terminal failure before
build or restart. Established idempotent startup shape/recovery code may run
only when that protected surface is unchanged. A separately authorized
migration or host configuration procedure must establish a new safe baseline;
candidate-provided manifests and SQL-keyword heuristics cannot waive this gate.
This is intentionally not a ban on ordinary reviewed server code: deployment
does not itself invoke later authenticated request-time writes, paper
promotion, or Review actions.

OpenSSH starts the fixed controller inside a host-owned transient systemd
service, with the exclusive deployment lock inside that service. Loss of the
Deployment Orb or SSH connection therefore does not abandon an in-flight host
build, health check, or rollback, and a second request still fails closed.
Candidate command output is written to a private host log, so a disconnected
output pipe cannot interrupt package installation or the build.

The target production layout is:

```text
/opt/eqb/
  current -> releases/<sha>
  releases/<sha>/       immutable website code and build output
  shared/               databases, Review bytes, paper assets, user files,
                        environment, logs, and other persistent runtime state
  deployments/receipts/ private deployment receipts
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

Website deployment itself never invokes migrations, `pull-run-push`,
single-paper promotion, Review mutation, database transfer, R2 mutation, or
production configuration changes. A release that requires one of those
operations stops for a separate explicit Owner-authorized procedure.

## Repository implementation and production hold

The repository implementation exposes:

- `plan`, which proves the exact clean `main` and authoritative status without
  connecting to production;
- a transition-only, explicitly authorized read-only `bootstrap-preflight` for
  the legacy host before its unrestricted bootstrap key is retired;
- an explicitly authorized `preflight` through the fixed forced-command host
  controller after bootstrap;
- `deploy --owner-said-deploy-latest`, which sends only the automatically
  resolved exact SHA to that fixed controller;
- a one-time bootstrap script that prepares the first release before outage,
  refuses a target whose persistence authority differs from legacy production,
  migrates persistent paths while `eqb` is stopped, installs the release-only
  systemd/Caddy templates and forced controller key, health-checks, and restores
  the legacy configuration and paths if cutover fails;
- fake-host state-machine proof for staging, exact-main recheck, isolated build,
  atomic switch, idempotency, private receipts, shared-data non-mutation, and
  healthy rollback.

Code presence is not production authorization. The bootstrap remains blocked
until the Owner directly authorizes that one-time production configuration
change after a fresh read-only preflight. The first real daily deployment after
bootstrap requires another direct Owner authorization. The Deployment Orb must
also be a separate private Amp project; its forced-key secret must not remain in
ordinary development or CI projects.

## Consequences

- CI authority and deployment authority remain independent.
- Daily use stays simple: the Owner says `部署最新版`; SHA and status handling
  are machine work.
- A sleeping Deployment Orb costs nothing between explicit deployments.
- The one-time release-layout migration and every controller upgrade remain
  production configuration changes and cannot be implied by this ADR or by
  Secret presence.
- Paper Review approval and `上线 <paperId>` remain the separate server-side
  single-paper publication flow from ADR-0020.
- Restoring Amp Orb merge authority also requires an explicit, tested update to
  this deployment gate; it never silently accepts whichever CI happens to
  report first.
