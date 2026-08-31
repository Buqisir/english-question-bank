# ADR-0022: Amp Orb dual-lane CI becomes the merge authority

- Status: Accepted; live authority cutover requires the recorded proof below
- Owner authorization: 2026-08-31
- Supersedes: ADR-0021 rollout and authority sections only

## Context

ADR-0021 established a credential-isolated, durable, exact-merge CI runner on one
private 16-core Amp Orb. Activation then exposed and corrected three startup and
transport faults without weakening the sandbox: the plugin runtime executable was
Amp rather than Node, the keepalive API path differed from the first assumption,
and a shallow trusted checkout produced an incomplete merge bundle. A later GitHub
`pull_request.opened` payload carried a null merge SHA; the controller now resolves
the exact `refs/pull/<number>/merge` commit and verifies both ordered signed parents.

The corrected runner completed a real PR merge-ref run and a post-merge main run:

- PR #298: Amp Orb `verify:all + e2e` passed in 744 seconds; hosted `verify` passed
  in 1,138 seconds.
- main `fed317c357a2484d38283bf821cc8c5b55883d2e`: Amp Orb passed in 753 seconds;
  hosted `verify` passed in 1,360 seconds.

Both exact-SHA runs reached durable reported receipts and GitHub success statuses.
The Owner approved a proof PR followed by an atomic required-check cutover, with no
production deployment.

## Decision

Workflow v3 keeps the ADR-0021 queue, lock, receipt, exact-ref, Unix-user, secret,
and one-run-per-tested-SHA boundaries. Inside one serial run it starts two isolated
candidate checkouts concurrently:

- **Fast** runs the six existing browser/PDF golden-path E2E commands. Its fixed
  API/Vite routes use dedicated Fast-lane ports so they cannot collide with Full.
- **Full** runs `verify:all` with the existing resource-aware eight-job scheduler.

Each lane gets its own one-use read-only bundle and dependency checkout. Both run as
`eqb-ci` under the same empty allowlisted environment; neither receives GitHub,
Amp, deployment, production, database, or R2 credentials. The trusted controller
alone owns status writes.

`Amp Orb Verify (fast)` reports Fast independently for early feedback. `Amp Orb
Verify` is the aggregate authority: it remains pending until both lanes settle and
succeeds only when both exit successfully and both exact tested-SHA checkouts stay
tracked-clean. Fast is informational; branch protection requires Full.

Fast settlement is recorded atomically in the private receipt before its GitHub
status write. A status outage is retried from the receipt without rerunning a
completed full suite. The workflow version bump prevents an old shadow receipt from
suppressing the first dual-lane run.

## Authority cutover

The change reaches authority in this order:

1. A real PR must show both new contexts pending and then successful while hosted
   `verify` and `e2e` also succeed.
2. The merge push must complete on the exact new main SHA, after which the pinned
   Orb updates fast-forward-only and loads the byte-exact clean main plugin.
3. In one branch-protection update, add required `Amp Orb Verify` and remove hosted
   `verify`/`e2e`. Never save an intermediate configuration with no required CI.
4. Only after that cutover, change the hosted workflow to manual fallback in a
   separate Orb-gated PR.

Rollback reverses step 3 atomically: restore hosted required checks before removing
the Orb context. Webhook, status-token, branch-protection, and workflow changes stay
independent; no CI authority change grants deployment authority.

## Consequences

- E2E feedback arrives before the full suite while successful merge latency is the
  slower of the two lanes rather than their sum.
- The Full gate remains at least as strong as ADR-0021 because it aggregates the
  same `verify:all` and E2E work.
- Two candidate dependency checkouts trade some cached setup I/O for safe filesystem
  and port isolation.
- GitHub remains the status and branch-protection authority; compute moves to the
  private Orb. The hosted workflow remains an explicit rollback path.
