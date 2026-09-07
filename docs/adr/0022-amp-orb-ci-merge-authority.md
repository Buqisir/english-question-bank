# ADR-0022: Amp Orb dual-lane CI authority, hosted rollback, and Action wake

- Status: Historical implementation retained; merge-authority and active-rollout
  policy superseded by ADR-0024
- Owner authorization: 2026-08-31; rollback authorization 2026-09-02; Action-wake phase 1 authorization 2026-09-03
- Supersedes: ADR-0021 rollout and authority sections only
- Current authority: ADR-0024 and ADR-0025; the Sentinel/Discovery and Hosted
  rollback policies below are historical evidence, not daily instructions.
  The old runtime entrypoints are retired. Normal Ship reads the pinned
  `Amp Orb Verify` Check directly on GitHub; no Focused/Low report is required.

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
tracked-clean. Fast is informational; the 2026-08-31 cutover required Full before
the hosted rollback recorded below.

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

## Hosted rollback after Amp webhook ingress failure

On 2026-09-02 the stable Amp-managed webhook began returning HTTP 404
`Webhook unavailable` before plugin handler execution. The owning thread remained
unarchived, the hook URL matched the retained capability exactly, and a fresh
plugin reload completed the same-key `createWebhook` registration successfully,
but public ingress still returned 404. No queue item, receipt, controller, sandbox,
or GitHub status was created. Amp bug report
`amp_bug_0uiggF5jWG6i6iaB72BATT` tracks the platform failure.

Because the failed ingress prevents the Orb from gating its own rollback, the Owner
authorized this narrow bootstrap exception:

1. A dedicated rollback PR restores hosted `pull_request` and `main` push triggers
   while retaining `workflow_dispatch` for explicitly authorized diagnostics.
   Manual jobs use distinct `verify (manual)` / `e2e (manual)` names and can never
   satisfy required PR checks.
2. Naturally triggered hosted `verify` and `e2e` must pass on the rollback PR's
   current test-merge SHA before branch protection changes. Its ordered parents
   must be the unchanged live `main` and exact PR head, and its tree must equal the
   clean direct-child candidate tree.
3. Branch protection atomically adds hosted `verify` and `e2e` requirements before
   removing `Amp Orb Verify`; strict up-to-date and no-bypass settings remain.
4. The rollback PR merges only after both hosted checks are recognized as required
   and successful. Its exact `main` push must also pass both jobs.

During the rollback, hosted `verify` and `e2e` are the merge authority. Both Amp Orb
contexts remain informational and may not substitute for a hosted failure or missing
status. The original recovery condition required the Amp report to be resolved and a
sleeping Orb webhook to accept a natural request. The Action-wake decision below
supersedes that condition without changing the hosted rollback authority.

## Action wake and authoritative discovery

The repository-side webhook handler, durable queue, controller, sandbox, receipts,
and status writer remain sound, but Amp-managed public ingress is not a reliable wake
source while `amp_bug_0uiggF5jWG6i6iaB72BATT` remains open. The approved replacement
separates wake from event identity:

1. A GitHub Action will continue one fixed private CI thread with one byte-exact
   sentinel. The message contains no PR number, SHA, title, actor, ref, payload, or
   other event-derived text.
2. The project plugin accepts only exact sentinel equality in `agent.start`, acquires
   the existing executor keepalive, launches the trusted `discover` controller, and
   cancels the agent turn before inference. Whitespace, case variants, suffixes,
   prefixes, and all other messages remain ordinary agent input.
3. Under the same blocking `flock` as queue drain, the controller reads current GitHub
   state. It takes `main` from the repository commit endpoint and records its first
   parent as the base. It enumerates open PRs whose base is `main`, retaining only PRs
   whose head and base repositories are both `Buqisir/english-question-bank`.
4. A discovered PR queues only its GitHub API base/head/number identity. Immediately
   before execution the trusted controller fetches `refs/pull/<number>/merge` and
   requires ordered parents `^1 == baseSha` and `^2 == headSha`. A mismatch is stale,
   not a license to test the PR head or another merge.
5. Discovery delivery IDs are deterministic over `main` SHA or PR number/base/head.
   Repeated wakes therefore converge through the existing atomic-create/EEXIST queue
   boundary, while the existing `(v3, testedSha)` receipt prevents repeated execution.

The Action wake reuses the existing GitHub status credential for read-only repository
and PR discovery plus its existing commit-status writes. It does not pass that token,
Amp credentials, or event data into the candidate sandbox. Queue permissions, serial
drain, exact-ref fetches, stale checks, two isolated `eqb-ci` lanes, clean-tree checks,
and `Amp Orb Verify (fast)` / `Amp Orb Verify` status behavior are unchanged. The old
HMAC-authenticated webhook remains as a compatible non-authoritative ingress path.
Missing HMAC disables only that legacy ingress; the fixed-sentinel path remains
available. Missing status credentials disable both paths before wake registration.

CI configuration is isolated in the private Amp project `english-question-bank-ci`
(`30e5a6fb-5775-4b8e-8664-25fda6aa67d5`) and its private 16-vCPU thread. No Deployment
Orb secret, SSH identity, production capability, database/R2 credential, or deployment
authority may enter that project. Project isolation limits ordinary development Orbs'
access to the CI credentials; it does not make candidate code trusted.

Phase 1 adds sentinel interception and discover-on-wake support only. It does not add
or enable a GitHub Action, refresh a live plugin, move a webhook, or alter merge
authority. A separately authorized phase 2 may add the fixed-thread wake workflow and
the repository `AMP_API_KEY` secret. That workflow must use no `pull_request_target`,
must expose the secret only to same-repository PR and `main` wake jobs, and must never
construct its message from GitHub event fields.

Both Amp contexts remain informational until 10–20 naturally triggered, paired
PR/test-merge and post-merge `main` observations agree with hosted results on exact
SHAs. The set must include at least one real test failure and at least one
`synchronize` race whose obsolete identity becomes stale. Promotion still requires a
new explicit Owner authorization. The protection change adds aggregate `Amp Orb
Verify` before removing hosted `verify` and `e2e`, preserves strict up-to-date and
no-bypass settings, and leaves Fast informational. No CI decision grants deployment
authority.

## Consequences

- E2E feedback arrives before the full suite while successful merge latency is the
  slower of the two lanes rather than their sum.
- The Full gate remains at least as strong as ADR-0021 because it aggregates the
  same `verify:all` and E2E work.
- Two candidate dependency checkouts trade some cached setup I/O for safe filesystem
  and port isolation.
- GitHub remains the status and branch-protection authority; compute moves to the
  private Orb. The hosted workflow remains an explicit rollback path.
