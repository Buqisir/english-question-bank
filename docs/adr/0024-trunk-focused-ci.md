# ADR-0024: Task-branch PR delivery with automated CI authority

- Status: Accepted
- Owner authorization: 2026-09-06 CI authority simplification
- Supersedes: ADR-0022 merge-authority and active-rollout policy only
- Preserves: ADR-0022's historical evidence and ADR-0023 production boundaries

## Decision

Every change uses the current task-branch PR route into `main`. Each task is a
bounded, independently revertible commit based on current `origin/main`; a
rebase, conflict resolution, amendment, or base advance invalidates earlier
verification evidence. The changed-risk classifier and the verification rules
in `AGENTS.md` determine review and local validation. No direct Ship or Custom
Ship route is active.

The automatic dedicated CI controller is the sole CI machine executor. A
natural webhook delivery runs its isolated Fast and Full lanes, stores its
private receipt, and publishes the authoritative `Amp Orb Verify` Check under
ADR-0025. Receipt reporting or diagnosis may inform a developer, but no human
Focused-CI handoff, response, or wait is a merge or deployment gate.

Normal Ship reads GitHub's exact-SHA Check directly. The former High CI thread
is only the infrastructure host for the webhook and controller; no agent turn
is needed to execute or publish a normal run. Low is used only for requested
troubleshooting, not routine per-Ship reports. Neither the High/Low thread nor
private receipt retrieval supplies a second approval.

High-risk PRs retain their required review, `verify:all`, and E2E before merge.
Branch protection and deployment authority are the pinned App Check protocol in
ADR-0025; this ADR does not authorize altering GitHub settings, credentials,
plugins, workflows, or production.

## Retained history

ADR-0022's Sentinel/Discovery and Action-wake paths are retired. Do not
start or drain them, reload their thread/plugin, synthesize webhook events, or
copy an uncommitted workspace into them. Their historical design is not an
alternate authority path.

## Consequences

- PR delivery stays reviewable and independently revertible.
- The pinned GitHub Check, not an agent report or private receipt lookup, is
  the CI authority. Receipts support controller recovery and diagnostics only.
- ADR-0023 retains its deployment safety and production authorization limits.
