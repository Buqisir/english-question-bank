# ADR-0024: Lightweight trunk Ship with development and Focused CI layers

- Status: Accepted for the phase-one repository contract
- Owner authorization: 2026-09-04
- Supersedes: ADR-0022 merge-authority and active-rollout policy only
- Preserves: ADR-0022's dormant Sentinel/Discovery design and all ADR-0023
  deployment boundaries

## Context

The repository's default delivery path has used a PR plus GitHub-hosted
`verify` and `e2e` for every change. Those checks remain necessary for risky
changes and, on the exact post-merge `main` SHA, are the machine authority used
by the separate Deployment Orb. Their approximately 19–24 minute hosted
feedback loop is unnecessarily heavy as the only route for small, reversible
work.

The existing changed-risk verifier already distinguishes narrow local work from
shared and high-risk seams. A development Orb can use that classification for a
proportionate first layer, while a credential-isolated Focused CI Orb can check
the exact shipped SHA as a second layer without becoming a writer or deployment
authority.

## Decision

### Task branches and Ship

Development uses a lightweight trunk model: one bounded task is developed on a
local task branch and lands as one independently revertible commit. Immediately
before direct Ship, the branch is fetched, rebased onto the latest
`origin/main`, required clean, and revalidated. Rebase, conflict resolution, or
a newly advanced `main` invalidates earlier evidence. A non-fast-forward push
restarts the whole sequence; `main` is never force-pushed.

`scripts/verify-ci.mjs --plan-json --changed-file <path>` supplies the primary
machine risk classification:

- `ui-micro`, `ordinary-local-feature`, `known-shape-paper-data`, and
  `single-paper-import` may Ship autonomously after proportionate development
  checks.
- `shared-renderer-contract` may Ship only after its stronger existing final
  gate, affected real Screen/Print/PDF checks, and a Focused CI Paper pack.
- `auth-persistence-migration`, `mixed-high-risk-fallback`,
  `unknown-fallback`, and `git-diff-fallback` must use a PR.

Explicit high-risk overrides also require a PR: GitHub workflow or verifier
routing changes; `.agents/setup`; `.agents/ship.md`; Ship/verification rules in
`AGENTS.md`; deployment persistence-authority or host-configuration paths;
destructive migration; authentication or authorization; user-data deletion or
bulk mutation; breaking public schema/API changes; a change that cannot be
safely reverted as one commit; or a clearly high-risk agent judgment. Markdown
classifying as `no-changes` does not weaken these overrides. High-risk PRs run
the relevant review, `verify:all`, and E2E before merge.

Direct Ship additionally requires fixed scope, no known serious defect, all
first-layer and focused user-flow checks passing on the rebased commit, and no
unresolved Focused CI failure on current `main`. After a successful push, the
development Orb hands off the exact SHA, parent, risk, file list, summary, and
literal PASS/SKIP evidence.

### Focused CI

Focused CI is a second verification and reporting layer. It may not edit
tracked files, commit, push, revert, open PRs, write GitHub statuses, consume
Secrets, or deploy. It confirms the handed-off SHA is on `origin/main`, uses a
fresh clean detached worktree, computes risk independently, and compares from
the last verified ancestor or the handed-off parent so a detached checkout
cannot produce an empty changed set.

While a SHA is awaiting Focused CI it may not be deployed, and work dependent
on it may not Ship. Independent task development may continue. A failure pauses
all later Ship, reports decisive evidence and the first bad commit when
identifiable, and recommends a revert rather than editing `main`. Any revert
requires Owner authorization and follows the same Ship rules.

### Hosted and deployment authority

Focused CI PASS is not deployment authority. The ADR-0023 machine gate remains
unchanged: the exact current `main` SHA must have successful, non-manual hosted
`verify` and `e2e` checks produced by the `github-actions` App in this
repository. Manual-dispatch checks cannot qualify. Hosted PR checks remain the
gate for high-risk PR delivery, and hosted `main` checks remain both an
independent full-suite backstop and the current deployment gate.

Replacing that deployment authority with a future trusted Amp state requires a
separate design, reliability observation on exact SHAs and failure cases, and
new explicit Owner authorization. It cannot be inferred from Focused CI
success.

## Transition and retained assets

This phase adds the repository contract through the current high-risk PR path;
hosted `verify` and `e2e` must pass before merge. It does not change Amp project
Ship Behavior, GitHub protection/rulesets, required checks, or Actions. Enabling
Custom Ship and changing branch protection are separate, explicitly authorized
operations after this repository foundation lands. Until those operations are
completed, every change continues through the current task-branch PR path.

ADR-0022's Sentinel, Discovery controller, and dedicated-CI implementation stay
present but dormant. Action-wake phase 2 remains paused: no plugin/thread
reload, wake workflow, webhook event, status write, or `AMP_API_KEY` is enabled
by this decision. Retirement may be considered only after at least three months
without use and a separate Owner authorization.

ADR-0023 and its Deployment trust boundary are unchanged. This decision grants
no deployment, production mutation, migration, Secret, webhook, or host-control
authority.

## Consequences

- Small reversible work can eventually reach trunk without paying the PR wait,
  while machine classification and explicit overrides keep risky seams on PRs.
- Validation before rebase cannot be reused, and one-commit scope makes the
  recommended recovery a reviewable `git revert` rather than history rewrite.
- Focused CI can stop later Ship and deployment procedurally, but cannot modify
  the repository or make a SHA deployable.
- Hosted `main` verification remains intentionally duplicated until a later
  authority decision changes ADR-0023 and its executable gate together.
