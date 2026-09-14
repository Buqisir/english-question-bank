# ADR-0025: GitHub App Check is the sole deployment-CI authority

- Status: Accepted repository protocol; live branch-protection cutover is not asserted
- Owner authorization: 2026-09-06 App-only cutover after failure/success acceptance; no production or Secrets changes
- Supersedes: ADR-0023's Hosted CI authority only; ADR-0023's production and deployment boundaries remain

CI authority and deployment evidence selection are superseded by ADR-0026 upon
its recorded live cutover. This document retains the prior protocol and evidence;
it is not the native Actions Ship procedure.

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
PR external_id: v7-pr:<number>:<headSha>:<baseSha>:<testedSha>:<policyDigest>:<naturalDeliveryId>
```

PR execution still uses the exact fetched test-merge SHA and verifies its
ordered parents. Before either lane runs, complete-history ancestry must prove
base is contained in head, and the tested merge tree must equal the head tree.
Only the Check attachment uses head: GitHub can regenerate a merge commit with
identical parents/tree but a different SHA, stranding a merge-attached Check.
PR run IDs use a separate `v7-pr` namespace, hashing PR number, head, base,
tested tree and versioned policy digest. Equivalent merge rebuilds reuse the
original receipt's tested SHA, delivery and immutable Check ID; different PRs
never coalesce. Old v5/v6 PR receipts and Checks cannot authorize reduced lanes or
be retargeted. Push identity and deployment remain v4.

GitHub stores at most 255 bytes of `external_id`; the observed v6 identity was
truncated, leaving a fail-closed `creating` receipt. v7 omits only the redundant
explicit tree field: the immutable tested commit binds its tree, which is still
verified and recorded in the receipt, run ID and Check output. Every accepted PR
number with a natural delivery UUID fits within 255 bytes. Preserve the truncated
v6 Check and receipt as unresolved historical evidence; do not guess its identity,
retarget it, or publish success. The new namespace prevents its recovery as v7.

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

The App installation also requires **Pull requests: Read-only** for this repository's
live freshness lookup. After accepting an installation permission update, verify
`GET /pulls/<number>` through the controller's existing App reader before enabling
PR risk lanes. A 403 must defer, never bypass freshness or silently substitute a
different credential. If activation cannot proceed, restore the reviewed always-full
code snapshot; changing only policy mode does not remove the PR lookup dependency.

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

### Serialized PR eligibility phase 1 (code protocol; not host activation)

The controller has an opt-in serialized PR eligibility gate for an explicitly
Owner-scoped merge batch. Installing the code alone does not activate it. With
no exact `.scratch/amp-orb-ci/coordination/activated` marker, the controller
does not parse staged coordination files and preserves legacy PR and main
behavior. Host activation is a separate privileged operation and is not
authorized by this ADR text or by merging the implementation.

Once explicitly activated, the private immutable Owner scope fixes this
repository and the allowed PR numbers. A generation-CAS selection fixes one
exact PR number, head SHA and base SHA from that scope. The queue checks this
identity before PR resolution, Check creation, receipt mutation or lane
execution. Other real PR deliveries remain byte-for-byte in the existing queue
as `waiting`; they are not failures, drops, synthetic events or receipts. Push
deliveries retain the existing lexical queue traversal and Fast+Full behavior.
This phase does not supersede old main deliveries, select only the latest main,
or otherwise change main receipt and coverage semantics. That would be a
separate Owner product decision.

The trusted local control surface is intentionally small:

```text
amp-orb-ci.mjs coord-status
amp-orb-ci.mjs coord-activate --pull-request <number> [--pull-request <number> ...]
amp-orb-ci.mjs coord-select --expected-generation <n> --pull-request <number> --head <sha> --base <sha>
amp-orb-ci.mjs coord-pause --expected-generation <n>
amp-orb-ci.mjs coord-resume
```

`coord-status` is a fixed-path reader that projects coordination plus the real
queue; it is not merge authorization. Activate, select, pause, resume and the
ordinary drain all serialize on the existing `runner.lock`. Selection first
durably commits `wakePendingGeneration`, then the same lock holder drains the
existing queue in-process. It never launches a second writer or fabricates a
GitHub event. This closes the queue-before-selection lost-wake race. If the
process dies after selection, `coord-resume` always performs one normal drain,
even if a previous attempt cleared the wake marker. A selected deferred or
unreached queue item retains the marker; terminal selected work clears it. If
the inspected snapshot contains no matching delivery, the marker clears while
the selection stays active for a later natural delivery.

An explicit generation-CAS `coord-pause` is the fail-closed active containment
operation. Because it acquires the same lock, it runs only after any current
drain has settled; it may cancel a still-pending selection while retaining that
delivery byte-for-byte in the queue as waiting. It never removes the activation
marker or restores legacy eligibility.

The gate is defense in depth at both queue admission-to-execution and the
natural authoritative PR job entry. Forced `run --forced` diagnostics remain
writerless and therefore cannot create or satisfy the required App Check. The
existing queue and receipt schemas are unchanged. The read-only Ship watcher
may supply facts to the single human coordinator, but it is neither the
selection authority nor a wake path.

Before each selection, that coordinator must independently establish that the
current exact `main` has its successful App-4835036 Check, the PR is within the
Owner-approved batch, and the selected live PR/head/base identity is current.
Historical-main success is not a substitute. After the selected exact Check
succeeds, ordinary strict branch protection governs merge; after merge, the
new exact main Check must succeed before another selection. GitHub mutations
with unknown outcomes require fact reconciliation rather than blind retry.
Conflicts or PR failures require the explicit Owner policy for skip-versus-stop;
a main failure stops the batch.

Activation compatibility and crash behavior are fail-closed only after opt-in:

| Durable observation | PR behavior | Main behavior | Recovery boundary |
| --- | --- | --- | --- |
| marker absent, including staged/corrupt state files | legacy | unchanged | safe pre-activation code rollback |
| valid marker + paused state | waiting | unchanged | select with exact generation or keep paused |
| valid marker + selected exact identity | only exact match eligible | unchanged | drain/resume, or generation-CAS pause retaining the real queue item |
| marker unreadable/invalid, or active scope/state missing/corrupt | waiting with durable state reason | unchanged | repair from reviewed private snapshot under `runner.lock`; never infer selection |
| crash before activation marker rename | legacy | unchanged | retry activation only after reading fixed state paths |
| crash after marker rename | active paused | unchanged | inspect status; do not assume activation failed |
| crash after selection state commit | selected with pending generation | unchanged | `coord-resume` under the same lock |
| selected resolve/run deferred or drain throws | selected wake remains pending | unchanged items still follow existing semantics | diagnose then `coord-resume`, or explicitly pause; no polling or synthetic delivery |
| selected queue snapshot has no exact match | selection remains, wake acknowledged | unchanged | await a natural delivery; resume remains available |

Because an older controller does not understand the active marker, an active
rollback must not merely restore old binaries while PR queue entries remain.
The future host activation runbook must first quiesce under `runner.lock`, retain
all queue/receipt evidence, reach an explicitly reviewed paused/no-running
boundary, and define marker removal plus installed-byte restoration as one
bounded operation. Phase 1 deliberately provides no daemon, schedule, GitHub
mutation, automatic merge, scope expansion, or host activation procedure.

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
