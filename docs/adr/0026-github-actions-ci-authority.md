# ADR-0026: Restore native GitHub Actions CI authority

- Status: implementation candidate; live cutover requires the evidence record below
- Supersedes: ADR-0024/0025 CI authority and deployment CI-evidence selection only
- Does not change: protected PR merges, controlled SSH deployment, production data boundaries

## Decision

Use `.github/workflows/verify.yml` on natural PR and main push events. GitHub
Actions owns execution, logs, attempts and the `verify`/`e2e` checks. `verify`
runs the complete registry; `e2e` runs the six existing browser seams. There is
no Amp webhook, queue, serialized selection, watcher or agent prerequisite.
PRs still need current-main ancestry and strict/up-to-date protection.

The Deployment reader validates the fixed repository/workflow, native App,
natural main push, exact current main SHA, latest attempt and both successful
jobs. It rechecks main before dispatch. A manual diagnostic, same-name foreign
workflow, old success, skipped job or pending attempt is not authority.

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
