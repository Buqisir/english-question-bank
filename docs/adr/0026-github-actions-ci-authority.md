# ADR-0026: Restore native GitHub Actions CI authority

- Status: Actions authority active after PR #460; risk routing and notification refinement retain that authority
- Supersedes: ADR-0024/0025 CI authority and deployment CI-evidence selection only
- Does not change: protected PR merges, controlled SSH deployment, production data boundaries

## Decision

Use `.github/workflows/verify.yml` on natural PR and main push events. GitHub
Actions owns execution, logs, attempts and the `verify`/`e2e` checks. Together
the workers run the base-classified pack on PRs and the complete registry on
main; `e2e` aggregates the two E2E workers, including all six existing browser
seams. There is no Amp CI webhook,
queue or serialized selection prerequisite. A read-only watcher can notify the Ship
thread, but neither a notification nor its absence changes the Checks.
PRs still need current-main ancestry and strict/up-to-date protection.

The selected pack is partitioned into disjoint `verify` and `e2e` lanes.
Three independent runner workspaces resolve the same immutable event through
the same trusted-base planner; lane selection never changes risk or pack selection.
`verify` retains its lane and `--jobs 2`. `e2e-seams` runs all six fixed browser
seams in their existing order. `e2e-render` runs the selected pack's e2e lane
with `--jobs 2`, retaining render resource locks and script order. Browser seams
install Chromium with its OS dependencies; only a nonempty render lane installs
the broader render toolchain and runs its existing diff/build preflight. The
seams worker does not add another pack preflight. Local Full remains unpartitioned.
The required `e2e` job uses `needs: [e2e-seams, e2e-render]` and `always()`, then
explicitly requires each worker result to be `success`. Failed, cancelled,
skipped or missing worker results fail that check. Both required checks remain
`verify` and `e2e`; no branch-protection change or matrix skip is introduced.

The Deployment reader validates the fixed repository/workflow, native App,
natural main push, exact current main SHA and latest attempt. It accepts only
one exact versioned job topology: v1 `{verify, e2e}` for historical runs, or v2
`{verify, e2e-seams, e2e-render, e2e}`. Every job must complete successfully;
unknown, missing or duplicate jobs fail closed. The reader rechecks main before
dispatch. The read-only Ship watcher recognizes the same exact topologies and
reports unsuccessful workers. A manual diagnostic, same-name foreign
workflow, old success, skipped job or pending attempt is not authority.

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
