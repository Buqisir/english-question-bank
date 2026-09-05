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
  task commits on local `main`. Keep each task within scope and produce one
  independent commit that can be safely reverted.
- Classify the complete changed-path set, and each path when investigating the
  route, with
  `node scripts/verify-ci.mjs --plan-json --changed-file <path>` (repeat the
  flag for multiple paths). Treat its `risk` as the primary machine result and
  apply the explicit high-risk overrides below.
- `ui-micro`, `ordinary-local-feature`, `known-shape-paper-data`, and
  `single-paper-import` are eligible for autonomous Ship after their
  proportionate checks pass. `shared-renderer-contract` may Ship only after the
  shared-renderer final gate above, including affected real Screen/Print/PDF
  verification.
- `auth-persistence-migration`, `mixed-high-risk-fallback`,
  `unknown-fallback`, and `git-diff-fallback` require a PR. So do changes to
  `.github/workflows/`, `scripts/verify-ci.mjs`, `.agents/setup`,
  `.agents/ship.md`, these `AGENTS.md` Ship/verification rules, paths in
  `EQB_PERSISTENCE_AUTHORITY_PATHS` or `EQB_HOST_CONFIGURATION_PATHS`,
  destructive migrations, authentication/authorization, user-data deletion or
  bulk mutation, breaking public schema/API changes, changes that cannot be
  safely reverted as one commit, and any change the agent judges clearly high
  risk. High-risk PRs require the relevant review, `verify:all`, and E2E; never
  push them directly to `main`.
- Autonomous Ship is allowed only when scope stayed fixed, the commit is
  independently revertible, all first-layer and focused user-flow checks pass,
  no serious defect is known, the commit has been revalidated on the latest
  `origin/main`, its risk is eligible, and Focused CI has not reported a current
  `main` failure.
- Immediately before Ship, run `git fetch origin`, rebase the task branch onto
  `origin/main`, require `git status --porcelain` to be empty, then rerun
  `pnpm -C app verify:changed -- --base-ref origin/main` and the affected
  behavioral/user-flow checks. A rebase, conflict resolution, or newly advanced
  `origin/main` invalidates all earlier results. Stop and ask before resolving a
  conflict that changes behavior.
- Push only with `git push origin HEAD:main`. If it is not a fast-forward,
  restart from fetch/rebase and repeat every validation; never force-push
  `main`.
- After Ship, report the exact 40-hex `main` SHA and parent, machine risk,
  changed files, one-paragraph summary, and every command as `PASS` or `SKIP`
  with the limitation. Hand that exact SHA to Focused CI and keep the
  development thread available until it replies.

## Focused CI

- Focused CI is a reporting and diagnostic layer over automatic dedicated-CI
  execution. Its agent turn must not edit tracked files, commit, push, revert,
  open a PR, write GitHub status or Check state, access Secrets, deploy, or run
  a second Full suite. The automatic `amp-orb-ci` controller is the sole
  dedicated machine execution policy: it verifies the exact SHA in isolated
  Fast and Full lanes and records private receipts. The Focused thread reads
  that evidence, reports PASS/FAIL, and may diagnose a failure without
  repeating Full.
- A separately activated trusted webhook controller may write only the
  ADR-0025 `Amp Orb Verify` Check. This exception never applies to the Focused
  agent turn, manual/discovery/rerequest diagnostics, or candidate code.
- A SHA awaiting Focused CI may not be deployed. Independent development may
  continue, but a task that depends on that SHA may not Ship before it passes.
- On Focused CI failure, pause every subsequent Ship, report decisive evidence
  and the first bad commit when identifiable, and recommend the smallest safe
  revert. Focused CI only recommends; it never reverts. A revert requires Owner
  authorization and follows the same Ship process.
- A Focused CI pass is not deployment authority. The deployment machine gate
  remains `hosted-only`: successful, non-manual hosted `verify` and `e2e` from
  numeric `github-actions` App ID `15368`, workflow ID `282244920`, attempt 1,
  on the exact current `main` SHA and one suite; `workflow_dispatch` and rerun
  diagnostics cannot satisfy it. ADR-0025's other modes remain disabled until
  separately authorized.
- The legacy dedicated-CI Sentinel/Discovery and Action-wake paths remain
  dormant. Do not start or drain them, reload their thread/plugin, synthesize or
  retry wake/webhook events, or copy an uncommitted workspace snapshot into
  them. This does not authorize enabling the disabled App writer. See ADR-0024
  for coordination, ADR-0022 for retained history, and ADR-0025 for the App
  protocol and staged activation boundary.

## Dedicated Deployment Orb

- Website deployment belongs only to the separate private Deployment Orb
  project. Development and CI Orbs must not receive its SSH key.
- A current Owner instruction `部署最新版` authorizes that one website-code
  deployment attempt; the agent resolves current `main` itself and runs
  `node scripts/amp-orb-deploy.mjs deploy --owner-said-deploy-latest`. Never ask
  the Owner to copy a SHA.
- The deploy command requires exact-main successful non-manual hosted `verify`
  and `e2e` from the `github-actions` App, then sends only that SHA through
  pinned SSH to the root-owned fixed host controller. Never stream candidate
  deployment code, bypass the forced command, or use the legacy in-place deploy
  after cutover.
- Website deployment never authorizes migration, Review/paper promotion,
  database or R2 mutation, production configuration changes, or controller
  upgrades. Each needs its own explicit current Owner authorization.
- The S0-to-S1 `baseline --owner-said-baseline-migration` is consumed after one
  successful receipt. An established S1 can bootstrap a descendant candidate
  only when the fixed persistence-authority diff is empty; never rerun baseline
  merely to advance its SHA.
- `bootstrap --owner-said-release-bootstrap`, recovery mutation, Orb refresh,
  forced-controller preflight, and first real `deploy` are separate actions with
  their own stated current Owner authorization. Bootstrap must prove the new
  forced-controller route, rotate only the current Deployment project's private-
  key Secret through stdin, retire and reject the old privileged identity, and
  re-prove the new route before terminalizing recovery. On interruption inspect
  first; never retry host bootstrap. Abandonment must cancel the exact host unit
  under the bootstrap lock before strict S1 reproof and local cleanup. Do not
  refresh Orb processes until finalization succeeds. Follow ADR-0023 and the
  launch-deploy runbook; do not infer authorization from merged code or
  available secrets.

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
