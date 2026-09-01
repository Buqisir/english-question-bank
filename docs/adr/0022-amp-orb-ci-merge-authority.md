# ADR-0022: Amp Orb dual-lane CI is the merge authority

- Status: Accepted; live authority since 2026-08-31
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
A `synchronize` proof then showed that GitHub may also send the previous merge SHA
as a non-null value, so every PR delivery now treats the payload merge SHA as
advisory and resolves the current ref from the signed base/head/PR identity.

The corrected runner completed a real PR merge-ref run and a post-merge main run:

- PR #298: Amp Orb `verify:all + e2e` passed in 744 seconds; hosted `verify` passed
  in 1,138 seconds.
- main `fed317c357a2484d38283bf821cc8c5b55883d2e`: Amp Orb passed in 753 seconds;
  hosted `verify` passed in 1,360 seconds.

Both exact-SHA runs reached durable reported receipts and GitHub success statuses.
The Owner approved a proof PR followed by an atomic required-check cutover, with no
production deployment.

The dual-lane rollout then exposed two concurrency-only faults without weakening the
gate: Fast initially reused one fixed port across concurrent E2E commands, and one
Full verifier launched Chromium through an imported fixture without declaring the
shared render resource. Distinct Fast ports and an explicit transitive render marker
closed those gaps. PR #300's exact test merge passed Fast in 120 seconds and the
aggregate in 716 seconds with `PASS 161 / SKIP 4 / FAIL 0`. Its post-merge `main`
commit `d1de0ab1cc003eb547dd3dd11c1db631943c1652` passed naturally in 713 seconds with
the same counts and an explicit OCR verifier pass. The pinned Orb then advanced
fast-forward-only to that exact clean commit and loaded its byte-exact plugin.

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

## Authority cutover record

The live cutover completed in this order:

1. PR #299 proved both Orb contexts pending then successful while hosted `verify`
   and `e2e` also succeeded.
2. PR #300 proved the transitive render-resource correction on its exact test merge.
3. GitHub Pro branch protection was created for `main` with strict up-to-date PRs,
   no administrator bypass, and only aggregate `Amp Orb Verify` required. Fast and
   the hosted contexts remain informational.
4. PR #300 merged through that enforced gate. Its exact merge push passed naturally,
   after which the pinned Orb advanced fast-forward-only and loaded clean exact-main
   runtime files.
5. The hosted workflow moved to manual fallback in a separate Orb-gated PR.

Rollback first restores hosted pull-request triggers in an Orb-gated PR and proves
their exact-merge contexts. A later atomic protection update may then add hosted
required checks before removing the Orb context. Webhook, status-token,
branch-protection, and workflow changes stay independent; no CI authority change
grants deployment authority.

## Consequences

- E2E feedback arrives before the full suite while successful merge latency is the
  slower of the two lanes rather than their sum.
- The Full gate remains at least as strong as ADR-0021 because it aggregates the
  same `verify:all` and E2E work.
- Two candidate dependency checkouts trade some cached setup I/O for safe filesystem
  and port isolation.
- GitHub remains the status and branch-protection authority; compute moves to the
  private Orb. The hosted workflow remains an explicit rollback path.
