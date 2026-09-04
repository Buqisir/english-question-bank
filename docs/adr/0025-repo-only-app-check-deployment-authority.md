# ADR-0025: Repo-only GitHub App Check as an optional Deployment authority

- Status: Accepted protocol; repository implementation disabled by default
- Owner authorization: 2026-09-04 repository code and documentation only
- Preserves: ADR-0023 production boundaries and Hosted-only default authority
- Clarifies: ADR-0024 Focused-CI reporting and trusted-controller writes

## Context

The dedicated CI Orb runs Fast E2E and Full `verify:all` in separate
credential-free `eqb-ci` checkouts. Its existing Commit Statuses are useful
feedback, but they cannot be a Deployment trust root: another repository token
with status-write permission can reproduce the same context and creator.

GitHub Check Runs identify their creating GitHub App by immutable numeric App
ID. A dedicated App installed only on `Buqisir/english-question-bank`, with
`Checks: write` and `Metadata: read`, can therefore provide a provenance
boundary comparable to the hosted `github-actions` App. Repository code alone
does not create that App, install it, provision its private key, enable or
reload CI, or change Deployment authority.

An earlier proposal added a same-Orb Ed25519 signer and a signed envelope in
`output.summary`. That does not create an independent trust domain: a key
available to the trusted CI controller fails with the App credential, while a
root-owned key is not isolated from passwordless root access in the Orb.
Deployment also cannot independently prove several proposed signed fields.

## Decision

### CI writer

The trusted automatic `amp-orb-ci` controller is the only dedicated-CI machine
execution policy. A Focused-CI agent turn may report or diagnose its result but
does not run a second Full suite and does not write GitHub status or Check
state.

App publication is enabled only when
`QUESTION_BANK_AMP_CI_GITHUB_CHECKS_ENABLED=1`. When disabled, workflow v4
retains the existing informational Commit Status behavior. When separately
activated, only a non-forced, HMAC-authenticated natural GitHub delivery can
publish the authoritative Check. Discovery, manual, rerequest, and forced
diagnostics remain informational.

The one authoritative Check is named exactly `Amp Orb Verify`. Before either
lane starts, the controller POSTs an `in_progress` run with:

```text
external_id = v4:<testedSha>:<githubDeliveryId>
```

It writes the immutable Check Run ID to the private mode-`0600` run receipt.
If create has an unknown outcome, the controller lists all exact-name runs and
continues only when exact external ID, SHA, and pinned App ID identify one
unique run. It never creates a replacement merely because the response was
lost.

After verification, the controller PATCHes that same ID to `completed` with
`success` or `failure`. Success requires actual successful Fast and Full lane
results, zero Fast E2E failures, Full `FAIL 0`, and both exact-SHA checkouts
tracked-clean. An expired installation token may be refreshed and the same API
operation retried; verified tests are not rerun. A crash after verification
resumes the idempotent PATCH of the receipt's same Check Run ID.

`output.summary` is human-readable only: Fast and Full duration/verdict, the
Full PASS/SKIP/FAIL counts, and tracked-clean state. It is not a signature or
cryptographic proof. `Amp Orb Verify (fast)` remains a distinct informational
Commit Status which Deployment never reads. In App mode no aggregate
same-name Commit Status is written.

### Deployment reader

Deployment supports these explicit modes:

- `hosted-only` (default): hosted `verify` and `e2e`;
- `shadow`: Hosted authorizes; the App result is observed but cannot allow or
  block;
- `dual`: Hosted `verify` and `e2e` plus the App Check;
- `amp+hosted-e2e`: the App Check plus hosted `e2e`;
- `amp`: the App Check only.

Every mode except `hosted-only` also requires a separately configured numeric
App ID. Merely landing this ADR leaves the environment unset and authority at
`hosted-only`. The disabled reader accepts only the explicit
`QUESTION_BANK_DEPLOY_CI_AUTHORITY_MODE` values above and pins the App through
`QUESTION_BANK_DEPLOY_AMP_CHECK_APP_ID`; repository code does not set either
environment value.

The App reader requests all pages using the exact query
`check_name=Amp Orb Verify&filter=all&per_page=100`. It keeps only exact-name
runs from the pinned numeric App ID, rejects duplicate immutable IDs, and
accepts a bounded paginated read only after two consecutive snapshots agree on
all authority-relevant fields. It then selects the greatest Check Run ID. That
latest trusted run alone decides:
pending, failure, neutral, skipped, stale, malformed, wrong-SHA, or ambiguous
evidence fails closed and never falls back to an older success. A success must
be `completed/success`, use an accepted external-ID version, and bind
`external_id.testedSha == head_sha == clean local HEAD == live main`.

Candidate resolution and the boundary immediately before the first TAT, SSH,
or production action both reread live `main` and the complete selected
authority. A changed checkout, dirty checkout, advanced `main`, or changed
latest Check invalidates the action. Existing receipt-bound bootstrap
inspection and recovery retain ADR-0023's separate safety semantics; they do
not authorize a new release.

The Hosted reader is strengthened without changing its default role. It pins
numeric `github-actions` App ID `15368`, workflow ID `282244920`, path
`.github/workflows/verify.yml`, event `push`, attempt `1`, repository, branch,
exact SHA, and one common Check Suite and Workflow Run for the required jobs.
Manual or rerun workflow evidence cannot authorize Deployment.

## Rejected protocol elements

This protocol does not implement an Ed25519 attestor, signed envelope, 72-hour
expiry, cached re-signing rule, policy digest, skip-policy digest, or signature-
bound receipt/delivery metadata. The GitHub App identity and exact Check/SHA
lifecycle are the trust root; text in Check output is never authority.

## Activation and evidence

Activation is a sequence of separately Owner-authorized shared-state changes:

1. create and install one GitHub App on only `english-question-bank` with
   `Checks: write` and `Metadata: read`;
2. provision its numeric App and installation IDs plus PEM only to the dedicated
   CI project, enable publication, and reload the trusted controller/plugin;
3. leave Deployment `hosted-only`, then separately enable `shadow` and collect
   10 natural exact-main runs over at least seven days, at least two natural
   cold wakes after two hours idle, and at least one real paired failure;
4. with a new Owner decision, move to `dual`; after at least five natural
   candidates and one ordinary authorized deployment without unexplained
   disagreement, `amp+hosted-e2e` may be considered;
5. only after 10 natural exact-main runs across at least seven days without an
   unexplained disagreement may low-risk main use `amp`; Hosted remains the
   independent nightly main backstop and the high-risk PR gate.

No stage authorizes App creation, Secret or environment changes, plugin reload,
webhook redelivery, manual drain, branch-protection or workflow changes,
Deployment configuration, or production access without a current direct Owner
instruction for that exact action. Rollback restores fresh Hosted-only evidence
before disabling an App authority; it never falls back automatically after an
App failure.

## Consequences

- A newer trusted App attempt always supersedes older green evidence.
- Candidate code receives neither App nor Deployment credentials.
- Fast feedback stays visible without becoming deploy-authoritative.
- Hosted-only remains safe and unchanged until an explicit staged migration.
- The App private key is still a high-value CI-project Secret; App-only avoids
  a redundant signer but does not pretend that key compromise is harmless.
