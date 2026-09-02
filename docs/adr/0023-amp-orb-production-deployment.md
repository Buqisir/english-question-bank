# ADR-0023: A separate Amp Orb will deploy website code from verified `main`

- Status: Accepted for repository preflight implementation
- Production activation: blocked on a later direct Owner authorization
- Scope: website code deployment only

## Context

The existing `deploy-remote.sh` is a proven operator convenience script, but it
updates, installs, and builds inside the checkout currently serving production.
It does not provide an exact GitHub status gate, private host-key pinning,
release-directory staging, an atomic `current` switch, a durable receipt, or
automatic rollback.

The dedicated CI Orb now verifies the exact GitHub test merge and reports the
only required status, `Amp Orb Verify`. It deliberately exposes no production,
deployment, database, R2, or paper-publication credential to candidate code.
Giving that Orb an SSH key would collapse the strongest existing isolation
boundary.

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
4. that exact SHA has a successful `Amp Orb Verify` status whose target is the
   current dedicated CI Orb thread from ADR-0022;
5. the three deployment Project Secrets are present only in the Deployment
   Orb environment.

The controller writes the private key and pinned `known_hosts` into a fresh
`0700` temporary directory as `0600` files. SSH uses batch mode,
`IdentitiesOnly`, an empty global host-key file, and
`StrictHostKeyChecking=yes`. It never runs `ssh-keyscan`, accepts a first-use
host key, prints a credential, or puts a key in argv.

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
automatically.

Website deployment never invokes migrations, `pull-run-push`, single-paper
promotion, Review mutation, database transfer, R2 mutation, or production
configuration changes. A release that requires one of those operations stops
for a separate explicit Owner-authorized procedure.

## Repository preflight phase

The first implementation phase intentionally exposes only:

- `plan`, which proves the exact clean `main` and authoritative status without
  connecting to production;
- an explicitly authorized read-only SSH `preflight`, which reports the current
  production SHA, tracked cleanliness, service health, and whether the release
  layout exists;
- a synthetic release state machine that proves atomic switch, idempotency,
  private receipts, shared-data non-mutation, and healthy rollback.

There is no real `deploy` command in this phase. A later PR must add staging,
the one-time `shared/releases/current` bootstrap, the bounded remote command,
and its fake-remote behavioral proof. Production bootstrap and the first real
Orb deployment each require a new direct Owner authorization.

## Consequences

- CI authority and deployment authority remain independent.
- Daily use stays simple: the Owner says `部署最新版`; SHA and status handling
  are machine work.
- A sleeping Deployment Orb costs nothing between explicit deployments.
- The one-time release-layout migration remains a production configuration
  change and cannot be implied by this ADR or by Secret presence.
- Paper Review approval and `上线 <paperId>` remain the separate server-side
  single-paper publication flow from ADR-0020.
