# ADR-0026: Restore native GitHub Actions CI authority

- Status: Actions authority active after PR #460; risk routing and notification refinement retain that authority
- Supersedes: ADR-0024/0025 CI authority and deployment CI-evidence selection only
- Does not change: protected PR merges, controlled SSH deployment, production data boundaries

## Decision

Use `.github/workflows/verify.yml` on natural PR and main push events. GitHub
Actions owns execution, logs, attempts and the `verify`/`e2e` checks. Together
the workers run the base-classified pack on PRs and the complete registry on
main; `verify` and `e2e` each aggregate two workers, including all six
existing browser seams in `e2e-seams`. There is no Amp CI webhook,
queue or serialized selection prerequisite. A read-only watcher can notify the Ship
thread, but neither a notification nor its absence changes the Checks.
PRs still need current-main ancestry and strict/up-to-date protection.

The selected pack is partitioned into disjoint `verify` and `e2e` lanes.
Four independent runner workspaces resolve the same immutable event through
the same trusted-base planner; lane/shard selection never changes risk or pack
selection. `verify-1` and `verify-2` partition the verify lane using the explicit
allocation in `scripts/lib/verificationShards.mjs`. The runner asserts that the
allocation has no duplicates, omissions or stale entries against the entire
verify registry before selecting a pack. Adding a verifier without deliberately
assigning it fails closed. Filtering preserves registry order within each shard.
Both shards retain `--jobs 2`, existing resource locks, setup and diff/build
preflight. Local Full remains unpartitioned.

`e2e-seams` runs all six fixed browser seams in their existing order.
`e2e-render` runs the selected pack's e2e lane with `--jobs 2`, retaining render
resource locks and script order. Browser seams install Chromium with its OS
dependencies; only a nonempty render lane installs the broader render toolchain
and runs its existing diff/build preflight. The seams worker does not add
another pack preflight.

The required `verify` job uses `needs: [verify-1, verify-2]`; `e2e` uses
`needs: [e2e-seams, e2e-render]`. Both use `always()` and explicitly require each
worker result to be `success`. Failed, cancelled, skipped or missing worker
results fail that check. Required names remain `verify` and `e2e`; no
branch-protection change or matrix skip is introduced.

#### Verify shard timing basis

PR #525 [run 39208479703](https://github.com/Buqisir/english-question-bank/actions/runs/39208479703),
verify job 117916387764, used 19.6 minutes total. Its 181 script progress events
sum to 1731.368 seconds; `jobs=2` and resource locks yield 1060.568 seconds of
script wall time. The build preflight adds 12.1 seconds. Step metadata records
checkout 11s, Node setup <1s, trusted selection 4s, pnpm 2s, app install 2s,
server install 9s, system dependencies 55s and Chromium 14s. Installation and
runner setup remain duplicated deliberately; two shards already fit below E2E.

The explicit allocation uses descending measured durations and chooses the bin
with the smaller simulated completion time, using registry order, two slots and
the existing resource keys. Durations are a planning sample, not runtime policy.

| Worker | Scripts | Sum of script seconds | Browser-render lock seconds | Simulated script wall | Estimated full job |
| --- | ---: | ---: | ---: | ---: | ---: |
| verify-1 | 58 | 921.083 | 493.753 | 538.197s | about 11m |
| verify-2 | 123 | 810.285 | 496.442 | 538.156s | about 11m |

The original scheduler replay matches the observed script wall time. Estimates
include approximately 12s build and 103s other job overhead. Hosted runner
variance and duplicated installations require confirmation on the natural PR
run. Existing `e2e-seams`/`e2e-render` observations are 12.6m/13.2m, so the
expected overall wall time is about 13–14m with two verify shards.

The Deployment reader validates the fixed repository/workflow, native App,
natural main push, exact current main SHA and latest attempt. It accepts only
the exact v3 topology `{verify-1, verify-2, verify, e2e-seams, e2e-render, e2e}`.
Every job must complete successfully; unknown, missing or duplicate jobs fail
closed. The reader and workflow ship together; historical v1/v2 compatibility
would permit missing workers. Deployment always resolves latest main, so the
four-job main `bc9a2d9d2a68ec4a76fd5195caf2f110e9697c15` uses its old reader
before v3 lands, and latest main uses the new reader/workflow after merge.
Historical-main deployment is not required. A whole-change revert restores the
matching old reader. The reader rechecks main before dispatch. The read-only
Ship watcher requires the same exact v3 topology and reports unsuccessful
workers. A manual diagnostic, same-name foreign workflow, old success, skipped
job or pending attempt is not authority.

### Risk routing and notification

`ci-pr-plan.mjs` runs from an isolated PR-base checkout. It reuses the existing
raw-diff protected-path policy and `verify-ci.mjs --plan-json` classifier rather
than maintaining another path-to-pack map. It records base/head/tested identity,
reason and the selected scripts. Low/ordinary changes use existing ui, feature,
paper-data or import-paper packs. Shared/high/unknown, protected or unsupported
changes and classification failures use Full. Empty diffs and rollout before
the planner exists on base also use Full. Main always uses Full. Both required
jobs run, and old PR heads are cancelled by workflow concurrency.

The base planner is a trust boundary for classification, not a sandbox for an
arbitrarily rewritten PR workflow. Changes to workflow/policy/verification code
require Full and independent review under the existing protected PR contract.
No candidate or notification receives a Checks writer or merge bypass.

The #424 registration/claim-before-append protocol is reused for native Actions
notifications. A fixed PR/head and latest run/attempt must yield both jobs from
App 15368; stale results do not authorize a merge. The invoking Ship thread alone
receives a best-effort terminal hint and rechecks before an already-authorized
ordinary merge. Read/append failure cannot fail CI or trigger another execution.
Transport remains best-effort across process loss; it is not a durable CI queue.

### Agent selects within the trusted Full boundaries

The existing Ship Agent writes one `eqb-risk-plan` JSON block in the PR body
with exact `head`, `base`, existing `pack` and a bounded single-line `reason`.
The base planner reads only the natural event file and first applies the existing
classifier's hard boundaries. A classified Full cannot be reduced by advice.
Otherwise valid advice selects one existing pack; missing, invalid, duplicate,
stale or unreadable advice selects Full. Scripts come from the base registry,
not from PR body text. No LLM runs in Actions. All six E2Es remain mandatory;
main always runs Full. No labels, queues, services, Secrets or new writer exist.
The Agent cannot override paper/security, auth/isolation/persistence/schema,
shared rendering/pagination, CI/dependencies/setup/deploy, protected or unknown
changes. Client auth/domain contracts also belong to the security boundary.
An old base without the parser retains its earlier policy during rollout;
this high-risk implementation PR still requires Full.
See `.agents/ship.md` for the exact format and job-summary location.

This is direct selection, not shadow. The trust decision is explicit: existing
PR writers/reviewers may choose coverage outside the hard boundaries. Binding
head/base prevents stale advice, not mistaken semantic judgment. Body edits do
not rewrite a natural event snapshot. Selected test failure remains failure;
do not switch packs to hide it. Summaries are untrusted data and stay out of
runner stdout to prevent Actions command interpretation.

Seed analysis below is retrospective, not evidence that those event snapshots
contained advice. No body was backfilled and no CI was triggered for analysis.

| Sample | Exact reviewed head / base | Current route and Agent recommendation | Evidence and reasoning |
| --- | --- | --- | --- |
| [#462](https://github.com/Buqisir/english-question-bank/pull/462) | `b8acb4cc50aa8c9656c8c1e2c143c28e32036263` / `39b45af651541b9dbde46558267767136c5458ce` | actual `all`; recommend `all` | [Natural run 34843405616](https://github.com/Buqisir/english-question-bank/actions/runs/34843405616) recorded `protected-path`, 178 PASS / 2 SKIP / 0 FAIL. This was not isolated CSS: product/design rules, draft/Paper views, directory metadata and `server/api.mjs` changed. Shared behavior and policy keep Full. Verify 30m14s + E2E 6m10s = 36m24s job time, not billed dollars. |
| [#465](https://github.com/Buqisir/english-question-bank/pull/465) | `427351f6d6f7e50c6184f1ad0bd116755914857d` / `fbd08b8782d73af7a633739197be2f5031ef37ad` | protected-path requires `all`; recommend `all` | Model/effort and no-fallback changes include both staged-analysis and webhook-created coordinator plugins plus their tests. Although semantically narrow, plugin/coordination and agent rules remain protected. [Natural run 34929688844](https://github.com/Buqisir/english-question-bank/actions/runs/34929688844) was still running at analysis; no final result or savings inferred. |

Observe five subsequent real PRs without extra test executions. Compare exact
identities, actual/advised packs, reasons, failures and existing job durations.
These two high-risk seeds do not demonstrate reduced-path savings or prove the
Agent cannot omit coverage. Expanding the hard boundaries or weakening checks
still requires a separate reviewed Owner decision.

## Why

The dedicated Orb lost its private execution state after executor replacement.
The prior terminal-receipt protocol also provided no ordinary same-SHA rerun
route. Native Actions removes those operational dependencies without inventing
another queue or redefining successful test execution. GitHub retains failed
attempts and supports explicit reruns after diagnosis.

## Cutover, not an immediate rule change

Follow [the cutover runbook](../agents/github-actions-cutover.md). First publish
the additive workflow through a normal PR and observe natural checks. Keep the
old required Check until the replacement pair is green. The Owner edits the
required-check set in one save while preserving strictness and bypass rules.
Then merge normally and require natural exact-main checks before retiring the
old CI registration or activating the new Deployment reader.

If the old Orb cannot execute, report that dual execution is unavailable; never
fabricate an old Check or claim a double-run acceptance that did not occur.
The overlap is protection plus native shadow checks until Owner cutover.

## Boundaries

No website deployment, DB/R2 operation, SSH privilege change or release is
implied. Old queue/receipts are forensic evidence, not input for Actions. Do not
delete them to recover CI. If the old Orb is inaccessible, retain its identity
and mark archival/termination unverified until the platform confirms it.

Historical ADRs and old verifier implementations remain evidence, not active
Ship instructions. Live activation, protection readback and retirement receipts
belong in the cutover record; this ADR does not claim they have happened.
