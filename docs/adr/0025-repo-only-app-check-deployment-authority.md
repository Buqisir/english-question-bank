# ADR-0025: GitHub App Check is the sole deployment-CI authority

- Status: Accepted repository protocol; live branch-protection cutover is not asserted
- Owner authorization: 2026-09-06 App-only cutover after failure/success acceptance; no production or Secrets changes
- Supersedes: ADR-0023's Hosted CI authority only; ADR-0023's production and deployment boundaries remain

## Decision

The automatic route is GitHub webhook → CI controller → isolated Fast/Full →
GitHub Check. The original High thread only hosts this infrastructure; Low is
invoked on demand for troubleshooting. Neither is a routine reporter, approver,
or per-Ship dependency. Developers read GitHub directly, including the current
PR test-merge SHA rather than only its head. Private receipts are for recovery
and diagnosis, not a normal Ship lookup or a second gate.

The sole CI authority for deployment is one natural GitHub webhook delivery to
the dedicated CI Orb, which runs Fast E2E and Full `verify:all` in isolated,
credential-free `eqb-ci` checkouts and writes one GitHub Check Run:

```text
name: Amp Orb Verify
creating App: 4835036 (eqb-amp-ci-authoritative-checks)
external_id: v4:<testedSha>:<naturalDeliveryId>
```

Only a non-forced, HMAC-authenticated natural Pull request or Push delivery
may create that Check. Before either lane begins, the controller creates the
run as `in_progress`, stores its immutable ID in the private receipt, and after
both lanes settle PATCHes that same ID to `success` or `failure`. A lost create
response is reconciled only with one exact external ID, tested SHA, and pinned
App ID; a lost completion resumes the same receipt-bound PATCH without rerunning
tests. Diagnostics, discovery, rerequest, and manual work cannot write the
authoritative Check. Candidate code receives neither CI App nor deployment
credentials.

`success` requires successful Fast and Full results, zero Fast E2E failures,
Full `FAIL 0`, and clean exact-SHA checkouts. Check text and the private receipt
are operational evidence, not a signature or a second authority. There is no
Commit Status, Hosted workflow, human report, mode, fallback, nightly, or
event-count policy that can substitute for this Check.

The plugin remains isolated from ordinary development by
`QUESTION_BANK_AMP_CI_PLUGIN_ENABLED=1`. Its dedicated CI project alone holds
the webhook HMAC secret and the App ID, installation ID, and PEM. It has no
status-token or `QUESTION_BANK_AMP_CI_GITHUB_CHECKS_ENABLED` fallback.

## Deployment reader

The Deployment Orb requires `QUESTION_BANK_DEPLOY_AMP_CHECK_APP_ID=4835036`
and reads only the latest exact-name `Amp Orb Verify` Check from that numeric
App. It fails closed for missing, pending, non-success, wrong-SHA, malformed,
or ambiguous evidence, and re-reads the selected Check and live `main`
immediately before production action. A legacy
`QUESTION_BANK_DEPLOY_CI_AUTHORITY_MODE` setting is rejected rather than
interpreted. Hosted `verify` and `e2e` are no longer deployment authority.

Daily deployment remains limited to `plan`, authorized `preflight`, and
authorized `deploy`; the existing code-only versus reviewed-persistence/
migration classification is unchanged. ADR-0023 retains the production,
recovery, and host safety boundaries.

## Cutover boundary

This ADR does not claim that the GitHub branch-protection cutover has occurred.
The coordinator-owned executable runbook and evidence are
[`docs/agents/app-ci-cutover.md`](../agents/app-ci-cutover.md). Keep Hosted
workflow and current requirements until the real failure/success acceptance
and App-bound policy readback are complete. At initial inspection, REST
`branches/main/protection` and GraphQL `branchProtectionRules` returned 403
despite repository admin permission; ordinary main/Check queries succeeded.
See the runbook for current evidence. This ADR does not grant production,
credential, or plugin-reload authority.

## Consequences

- The pinned App Check alone supplies CI authority; no Focused/Low report,
  private-receipt lookup, human handoff or wait is a deployment gate.
- The App identity is the provenance boundary; Check output is never treated as
  cryptographic proof.
- Old staged-authority, Shadow/Dual, nightly, and count-based rollout policy is
  superseded rather than retained as an alternate path.
