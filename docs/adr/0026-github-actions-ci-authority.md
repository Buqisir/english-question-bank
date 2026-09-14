# ADR-0026: Restore native GitHub Actions CI authority

- Status: Actions authority active after PR #460; risk routing and notification refinement retain that authority
- Supersedes: ADR-0024/0025 CI authority and deployment CI-evidence selection only
- Does not change: protected PR merges, controlled SSH deployment, production data boundaries

## Decision

Use `.github/workflows/verify.yml` on natural PR and main push events. GitHub
Actions owns execution, logs, attempts and the `verify`/`e2e` checks. `verify`
runs the base-classified pack on PRs and the complete registry on main; `e2e`
runs the six existing browser seams. There is no Amp CI webhook, queue or
serialized selection prerequisite. A read-only watcher can notify the Ship
thread, but neither a notification nor its absence changes the Checks.
PRs still need current-main ancestry and strict/up-to-date protection.

The Deployment reader validates the fixed repository/workflow, native App,
natural main push, exact current main SHA, latest attempt and both successful
jobs. It rechecks main before dispatch. A manual diagnostic, same-name foreign
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
