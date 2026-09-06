# ADR-0025: GitHub App Check is the sole deployment-CI authority

- Status: Accepted repository protocol; live branch-protection cutover is not asserted
- Owner authorization: 2026-09-06 App-only cutover after failure/success acceptance; no production or Secrets changes
- Supersedes: ADR-0023's Hosted CI authority only; ADR-0023's production and deployment boundaries remain

## Decision

The automatic route is GitHub webhook → CI controller → isolated Fast/Full →
GitHub Check. The original High thread only hosts this infrastructure; Low is
invoked on demand for troubleshooting. Neither is a routine reporter, approver,
or per-Ship dependency. Developers read GitHub directly: PR Checks are attached
to the stable head SHA while their identity records the exact tested merge.
Private receipts are for recovery
and diagnosis, not a normal Ship lookup or a second gate.

The sole CI authority for deployment is one natural GitHub webhook delivery to
the dedicated CI Orb, which runs Fast E2E and Full `verify:all` in isolated,
credential-free `eqb-ci` checkouts and writes one GitHub Check Run:

```text
name: Amp Orb Verify
creating App: 4835036 (eqb-amp-ci-authoritative-checks)
push external_id: v4:<testedSha>:<naturalDeliveryId>
PR external_id: v6-pr:<number>:<headSha>:<baseSha>:<testedSha>:<testedTree>:<policyDigest>:<naturalDeliveryId>
```

PR execution still uses the exact fetched test-merge SHA and verifies its
ordered parents. Before either lane runs, complete-history ancestry must prove
base is contained in head, and the tested merge tree must equal the head tree.
Only the Check attachment uses head: GitHub can regenerate a merge commit with
identical parents/tree but a different SHA, stranding a merge-attached Check.
PR run IDs use a separate `v6-pr` namespace, hashing PR number, head, base,
tested tree and versioned policy digest. Equivalent merge rebuilds reuse the
original receipt's tested SHA, delivery and immutable Check ID; different PRs
never coalesce. Old v5 PR receipts and Checks cannot authorize reduced lanes or
be retargeted. Push identity and deployment remain v4.

This requires strict/up-to-date main protection, the required Check pinned to
App 4835036, and no bypass. Owner confirmed those settings via GitHub UI on
2026-09-06 (including no bypass exceptions and empty rulesets); this is Owner UI
evidence, not API readback. If base advances outside the tested head, strict
protection blocks merging until an updated head passes. A base already contained
in the tested head adds no untested tree changes. This is tree compatibility,
not a claim that the recorded base always equals a later current base.

Only a non-forced, HMAC-authenticated natural Pull request or Push delivery
may create that Check. Before either lane begins, the controller creates the
run as `in_progress`, stores its immutable ID in the private receipt, and after
the required lanes settle PATCHes that same ID to `success` or `failure`. A lost create
response is reconciled only with one exact external ID, attachment SHA, and pinned
App ID; a lost completion resumes the same receipt-bound PATCH without rerunning
tests. Diagnostics, discovery, rerequest, and manual work cannot write the
authoritative Check. Candidate code receives neither CI App nor deployment
credentials.

Main always requires successful Fast and Full results, zero Fast E2E failures,
Full `FAIL 0`, and clean exact-SHA checkouts. PR requirements are selected by
the installed trusted policy below, never by candidate code. Check text and the private receipt
are operational evidence, not a signature or a second authority. There is no
Commit Status, Hosted workflow, human report, mode, fallback, nightly, or
event-count policy that can substitute for this Check.

The plugin remains isolated from ordinary development by
`QUESTION_BANK_AMP_CI_PLUGIN_ENABLED=1`. Its dedicated CI project alone holds
the webhook HMAC secret and the App ID, installation ID, and PEM. It has no
status-token or `QUESTION_BANK_AMP_CI_GITHUB_CHECKS_ENABLED` fallback.

## Trusted PR risk lanes and freshness

The installed `ampOrbCIPolicy.mjs` computes the complete exact base-to-head
raw NUL-delimited Git diff after trusted ancestry/ordered-parent/tree checks.
Rename endpoints, deletes and type changes are included. It records files,
files digest, `pr-risk-v1`, risk, override, required lanes and a digest binding
that policy decision. Candidate `verify-ci.mjs` cannot select its own lanes.
Diff failure after established identity requires Full; uncertain identity defers.

Only explicit regular-file allowlists may omit Full: the existing token CSS,
the three repository/app/server READMEs, and known-shape paper data extensions
under the existing data roots. Governance, verification dependencies, both
deployment authority path sets, destructive/type changes, ordinary features,
imports, unknown paths and mixed changes require Full. This is deliberately
narrower than treating every Markdown file or feature as low risk.

Every reduced PR Fast lane runs the six existing E2Es plus
`pnpm -C app verify:changed -- --base-ref <exactBaseSha>`; changed exit/counts
are separate from E2E failures. A docs-only changed pack may select zero checks
but still must execute successfully and emit its counts. Omitted Full is
`not-required/by-policy`, never PASS or SKIP. Required Full must actually run,
pass checks with legal counts and zero failures, and finish clean. Full-required
PRs and main keep six-E2E Fast plus Full, avoiding a duplicate Full pack inside
Fast; old push v4 receipt recovery remains compatible.

Live PR API state (open, repository/ref, head/base) and fetched merge
parents/tree are checked at selection, before Check creation/execution,
completion and PATCH, and on cached/verified recovery. Unknown API responses
and absent/lagging merge refs defer without deleting evidence or publishing a
result. `superseded` is durable and terminal: stale results cannot become
success after restart; only their original immutable Check ID may be completed
as failure. Already running processes may finish before the next serial task.
Prepared versus creating intent separates a pre-POST deferral from an UNKNOWN
POST; UNKNOWN creation reconciles, never blindly repeats POST. Queue records
retain resolved identities so stale recovery can finish the original Check.
The residual GET/PATCH race still requires strict protection without bypass.

### Bounded enable / rollback (not an assertion of live acceptance)

This migration is high risk: use always-full validation, affected E2Es,
independent review and the exact App Check before installation. The dedicated
CI host alone owns installation. Confirm no running controller or lock waiters,
take the existing `runner.lock` exclusively, and snapshot **actual installed
bytes**, including prior intentional dirty files, and configuration. Keep the
webhook receiving durable deliveries; do not reload it or create a second writer.
Install only the reviewed controller/library/sandbox/policy dependency closure
at the fixed candidate digest. Preserve old queues, receipts and logs; historic
queued items are not proof of active execution and must not be cleared.

The installed controller reads its private non-Secret
`.scratch/amp-orb-ci/pr-policy.json` while holding the single-writer lock:

```json
{"schemaVersion":"amp-orb-ci-pr-policy-v1","mode":"risk-lanes"}
```

Missing, unreadable, malformed or unknown values select **always-full**.
Under the same lock, atomic replacement with `mode: "always-full"` disables
reduction; its different policy digest prevents reuse of reduced evidence.
The file is not candidate/queue/webhook configuration, is never sent to a
sandbox, and requires no Secrets or plugin-environment refresh. Keep it private
(0600 in the existing private state directory). A code rollback restores the
reviewed snapshot only after processes settle and under that same lock; never
erase new v6 receipts or revive a superseded receipt.

Release the lock and accept only natural webhook samples for low-risk success,
changed/E2E failure, required-Full failure, stale interleavings and main's two
lanes. A synthetic test, redelivery, manual drain or manual Check is not natural
acceptance. Do not merge this migration before those results and the current
Ship gates; do not change branch protection or deploy the website.

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
