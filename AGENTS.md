# Agent Instructions

This repository builds the English Question Bank workbench at `eqbank.cc`.
`AGENTS.md` is the operational entrypoint; `CLAUDE.md` only points here.
Historical cuts are evidence, not current instructions.

## Start safely

- Follow the owner's current request and the named spec or ticket. Do not add
  adjacent features or revive historical work. Record unrelated findings as a
  separate future task instead of fixing or refactoring them in the current one.
- Verify any owner-supplied worktree, branch, expected HEAD, fixed point, or
  allowed dirty file before writing. Preserve unrelated changes; do not stash,
  clean, reset, rebase, merge, or delete another task's work.
- Only one task writes a worktree at a time. Explicit parallel work needs
  separate worktrees and non-overlapping write surfaces.
- Before parallelizing, confirm that the tasks share no files/modules,
  schema/API/data-shape change, implementation order, or validation dependency.
  Otherwise serialize them.
- Never store secrets, account data, private student data, or full copyrighted
  passages in reusable memory.

## Work proportionately

- The owner defines the outcome and non-goals. The agent inspects the code and
  chooses the lightest safe implementation and verification path; do not ask
  the owner to choose engineering ceremony or classify technical risk.
- Clear, reversible work stays in the current task: understand, change, run the
  affected checks, review the diff, and commit when requested.
- Treat uncertainty as ordinary, reversible work while establishing the blast
  radius. Unfamiliarity, file count, and historical complexity are not high-risk
  triggers; escalate only for a concrete high-risk seam.
- Use a tracked spec and tickets only when the work genuinely needs more than
  one context.
- Do not create governance-only tasks or automatic task chains. The owner
  starts top-level tasks.
- Use a handoff only when the owner asks or a real work boundary requires it;
  follow `docs/agents/dispatch-protocols.md`.
- Durable product scope and decisions belong in the relevant spec, ticket, or
  ADR. `.scratch/` is same-task scratch only.

## Goal authorization

One explicit Owner Goal authorizes its complete bounded transaction, not one
tool call. Within the stated repository, host/environment and privileges,
continue through diagnosis, same-transaction status/evidence reconciliation,
reviewed entry maintenance, deployment, health checks and the agreed rollback
or recovery when those outcomes are included in the Goal. Do not ask again at
install/finalize/status/deploy boundaries. Implementation or merge alone does
not imply deployment; explicit non-goals still apply.

Ask again only to expand privileges, access/change Secrets beyond the existing
authorized route, change the target repository/host/environment, perform
uncovered destructive DB/schema/data or R2 operations, or accept a new
irreversible risk. An UNKNOWN result requires read-only reconciliation before
any mutation, not fresh permission to inspect or permission to replay. Preserve
evidence and locks; recovery must stay within the reviewed plan and proven state.
Authorization never substitutes for review, CI, exact-target/digest checks or
the production traffic/data recovery boundary.

## Verify the changed risk

Run the narrowest public-seam checks that exercise the changed behavior and its
direct consumers. Inspect the affected code before choosing the verification
weight. Uncertainty does not automatically require the full suite: use focused,
reversible checks while establishing the blast radius. Run the full suite only
for a final high-risk candidate or when the blast radius genuinely remains
unknown after inspection, and state the reason.

| Change | During work | Final gate |
| --- | --- | --- |
| Atomic UI micro-change | `pnpm -C app verify:changed` + exact-page real click | Owner QA when visible; no unrelated backend/Paper suite |
| Known-shape Canonical Paper data | `pnpm -C app verify:changed` strict input/publication canary | no authority bump, deep per-paper tri-surface proof, full suite, or independent review unless a shared shape changes |
| Ordinary local feature | `pnpm -C app verify:changed` + its focused behavioral check | affected build/public seam |
| Shared renderer/Paper contract | `pnpm -C app verify:paper` + affected real Screen/Print/PDF | one final `pnpm -C app verify:all` and one independent Standards/Spec review |
| Auth, isolation, persistence, migration, production config, or irreversible cross-cut | `pnpm -C app verify:changed` security pack + affected public seam | one final `pnpm -C app verify:all` and one independent Standards/Spec review |

`SKIP` is not `PASS`; report its limitation literally. Retain a verifier or
process rule only when it names the failure or independent detection layer it
uniquely supplies; otherwise keep it outside daily packs.

## Ship to main

- Until the Owner separately activates Custom Ship and updates the `main`
  protection settings, keep using the current task-branch PR path for every
  change. This repository contract does not authorize those shared settings
  changes.
- Develop in a local task branch based on the latest `origin/main`; do not make
  task commits on local `main`. A same-Goal PR may contain multiple commits;
  do not rewrite published history merely to consolidate them. Squash merge
  produces one independent main commit that can be safely reverted.
- Classify the complete changed-path set, and each path when investigating the
  route, with
  `node scripts/verify-ci.mjs --plan-json --changed-file <path>` (repeat the
  flag for multiple paths). Treat its `risk` as the primary machine result and
  apply the explicit high-risk overrides below.
- All classified changes use the task-branch PR route. A
  `shared-renderer-contract` still requires the shared-renderer final gate
  above, including affected real Screen/Print/PDF verification.
- `auth-persistence-migration`, `mixed-high-risk-fallback`,
  `unknown-fallback`, and `git-diff-fallback` require the stronger PR review
  and final gates. So do changes to
  `.github/workflows/`, `scripts/verify-ci.mjs`, `.agents/setup`,
  `.agents/ship.md`, these `AGENTS.md` Ship/verification rules, paths in
  `EQB_PERSISTENCE_AUTHORITY_PATHS` or `EQB_HOST_CONFIGURATION_PATHS`,
  destructive migrations, authentication/authorization, user-data deletion or
  bulk mutation, breaking public schema/API changes, changes that cannot be
  safely reverted as one commit, and any change the agent judges clearly high
  risk. High-risk PRs require the relevant review, `verify:all`, and E2E; never
  push them directly to `main`.
- Immediately before Ship, run `git fetch origin`, rebase the task branch onto
  `origin/main`, require `git status --porcelain` to be empty, and verify the
  affected behavior on that candidate. Its natural Actions Full/E2E run may
  satisfy the corresponding final checks; do not duplicate that Full locally.
  Local-only and visual checks still apply. A rebase, conflict resolution, or newly advanced
  `origin/main` invalidates all earlier results. Resolve conflicts only within
  the Goal while preserving unrelated behavior; apply the authorization boundary
  above if a conflict requires broader scope.
- Push the task branch and open its PR only when the Goal includes Ship. Merge
  only after the reviewed candidate has successful GitHub Actions `verify` and `e2e`
  checks from `.github/workflows/verify.yml` for its current natural PR run.
  During cutover retain the existing required check until the replacement
  checks are green and the Owner atomically saves the new required-check set;
  follow `docs/agents/github-actions-cutover.md` rather than assuming a code
  merge changed protection.
  Do not bypass branch protection or force-push `main`; Custom Ship remains
  inactive.
- After Ship, report the exact 40-hex `main` SHA and parent, machine risk,
  changed files, one-paragraph summary, and every command as `PASS` or `SKIP`
  with the limitation. Link the exact Actions run and both job checks; no Focused/Low report,
  private-receipt retrieval, human CI handoff or reply is a daily Ship gate.

## GitHub Actions CI authority

- `.github/workflows/verify.yml` runs on natural `pull_request` and `push` to
  `main`. Stable jobs `verify` and `e2e` partition the Agent-selected existing
  pack across isolated runners within trusted-base boundaries; Full remains
  required for paper/security/shared/high/unknown risks, invalid or missing
  exact-head/base advice, and main. `e2e` also runs all six browser seams.
  Both jobs must succeed; their disjoint lanes must cover the complete selected
  pack. Local `verify:all` remains unpartitioned. No path filter, skipped job,
  local report, manual run or Amp Check substitutes for either job.
  See ADR-0026 and the cutover runbook.
  Ship records `head/base/pack/reason` in the PR body per `.agents/ship.md`;
  Actions uses its natural event snapshot, never a live mutable comment.
- Read GitHub Actions run and job evidence directly. Bind the repository,
  workflow path, event, current PR head/base (or exact live main SHA), latest
  run attempt, GitHub Actions App identity and both successful job conclusions.
  PRs test GitHub's merge ref; preserve strict/up-to-date branch protection,
  require the head to contain current main, and reject stale results.
- CI runs independently of Amp threads. The native Actions watcher provides
  best-effort terminal notification to the originating Ship thread; register it
  as described in `.agents/ship.md`. Its failure cannot affect CI or protection,
  and no private queue, notification or agent acknowledgment supplies authority.
  An existing Ship Goal covers fresh verification and ordinary protected merge
  after a green notice; diagnose failures before rerunning and retain attempts.
- Deployment accepts only the exact-main natural Actions run and its two
  successful jobs through the deployment reader. Pending, failed, missing,
  wrong-SHA, wrong-workflow or ambiguous evidence fails closed.
- The old Amp CI webhook/controller, serialized eligibility, Amp-only watcher,
  Sentinel/Discovery and Action-wake are not the new authority. Do not start,
  drain, replay or initialize them. Retire the live registration/services only
  after Actions has taken over protection and exact-main validation passes;
  preserve old receipts and queue evidence. Source removal is not proof that a
  remote webhook or lost Orb has stopped.

## Dedicated Deployment Orb

- Website deployment belongs only to the separate private Deployment Orb
  project. Development and CI Orbs must not receive its SSH key.
- A current Owner instruction `部署最新版` authorizes that one website-code
  deployment Goal, including diagnosis, health and agreed recovery; resolve
  current `main` and run
  `node scripts/amp-orb-deploy.mjs deploy --owner-said-deploy-latest`. Never ask
  the Owner to copy a SHA.
- The deploy command requires the exact-main successful natural GitHub Actions
  `Verify` workflow with both `verify` and `e2e` jobs, then sends that SHA
  through pinned restricted SSH to the root-owned fixed host controller.
  Missing, pending, malformed, wrong-SHA or ambiguous evidence fails closed.
  Installing the new reader is a separate controlled cutover step; merging its
  source does not prove the Deployment Orb is updated. Never stream candidate
  deployment code, bypass the forced command, or use legacy in-place deploy.
- A code-only Goal excludes migration, Review/paper promotion, DB/R2 mutation
  and controller/host changes. A Goal that explicitly includes reviewed entry
  maintenance and deployment covers both, without an extra activation approval.
- The controlled SSH route replaces daily TAT/bootstrap/barrier/rebind and
  multi-stage activation. Ordinary code-only deployment is one SSH command;
  retired install/finalize/status commands are not extra steps. Follow the
  current section of `docs/cuts/controlled-ssh-maintenance/plan.md`.
- On response loss, reconcile the same operation through supported read-only
  preflight and retained receipts under the existing Goal. A status projection
  is not a disk record or proof of no mutation. Never replay an UNKNOWN operation,
  clear admission/evidence, or restore pre-traffic data after traffic reopened.
  Recovery outside the reviewed plan requires a new bounded decision only when
  it crosses the Goal authorization boundaries above.

## Owner QA

For visible behavior, prepare and smoke-check the exact service, data/login,
URL, and first state before Owner QA. Use
`docs/agents/owner-qa-handoff-template.md`; the owner does not reconstruct the
test state.

## Product boundaries

- Preserve `Source -> Passage -> Question Group -> Question -> Paper Set ->
  Export`.
- Prefer teacher-operable, passage-first workflows. AI-derived information must
  serve a named teacher task and require human confirmation.
- Student versions hide answers and explanations; teacher versions include
  them.
- Screen, Student/Teacher Print HTML, and PDF consume the same stable Canonical
  Paper and shared renderer seams; no surface reconstructs paper meaning on its
  own.
- Paper authoring, PaperSurface, print/export, and import display follow
  `docs/product/exam-paper-format-standards.md`.
- The backend import pipeline produces canonical paper data; the website
  consumes it. Do not restore website import UI. Paper import starts at
  `docs/import/agent-contract.md` and follows
  `docs/product/nck1-paper-standard.md`.
- Open Design is for prototypes; production UI belongs under `app/`.

Read `docs/steering/README.md` and only the relevant product/UI note before a
product or visual decision. UI direction follows `PRODUCT.md` and
`docs/agents/ui-collaboration.md`. Visual polish must not silently change
domain, schema, adapters, PaperSurface, server behavior, paper assets, or
print/export behavior.

For domain or architecture changes, read `CONTEXT.md` and relevant ADRs, use
their established vocabulary, and flag conflicts before editing.

## Production and repository facts

- Production changes, deploys, database/configuration mutation, and R2 actions
  require explicit current owner authorization. Check
  `docs/cuts/launch-deploy/go-live-record.md` before an authorized production
  action. Never run `scripts/pull-run-push.mjs` against production otherwise.
- Remote: `origin`.
- `app/` uses pnpm; `server/` uses npm.
- Fresh worktree setup: `bash scripts/setup-worktree.sh`.
- `scripts/dev.sh` binds server-side vocabulary PDF rendering to the matching
  local `PORT`; standalone API starts for print QA must set
  `QUESTION_BANK_PUBLIC_ORIGIN` to that app origin explicitly.
- Commit messages are one line: scope plus one clear sentence.

Focused supporting guidance lives in `docs/agents/testing-cadence.md`,
`docs/agents/review-levels.md`, and
`docs/agents/owner-qa-handoff-template.md`. Nested `AGENTS.md` or `CLAUDE.md`
files may add only directory-local deltas.
