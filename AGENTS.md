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
- Clear, reversible work stays in the current task: understand, change, review
  the diff, follow the verification cadence below, and commit when requested.
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
install/finalize/status/deploy boundaries. Tasks include direct push to main and
deployment under standing Owner authority (Owner 2026-11-16, BUB-218); explicit
non-goals still apply. Trunk-based is the default: do not open a PR by habit;
only the CI/deployment toolchain below uses a PR.
“先别推” or “先别上” keeps that task out of main unless the Owner explicitly
allows it to ship with other commits. “停自动部署” pauses all Agents' automatic
deployments. Migration, schema, DB/R2 data operations and host configuration
still require separate Owner authorization.

Ask again only to expand privileges, access/change Secrets beyond the existing
authorized route, change the target repository/host/environment, perform
uncovered destructive DB/schema/data or R2 operations, or accept a new
irreversible risk. An UNKNOWN result requires read-only reconciliation before
any mutation, not fresh permission to inspect or permission to replay. Preserve
evidence and locks; recovery must stay within the reviewed plan and proven state.
Authorization never substitutes for review, CI, exact-target/digest checks or
the production traffic/data recovery boundary.

## Verify the changed risk

Before pushing, synchronize with `origin/main` and freeze the candidate.
L1 uses the existing commands below; inspect changed behavior and direct consumers:

- 前端 / UI：`node scripts/verify-ci.mjs --pack ui`（构建、类型检查，以及 motion、radius、emoji 等守卫）
- 工作台组件：再加 `node scripts/verify-similar-workbench-swap.mjs`（裸 fetch 守卫）
- 其他：`node scripts/verify-ci.mjs --changed --base-ref origin/main`（必须显式写基线）。先加 `--plan-json` 看选出哪一档；选出 `all` 时不在本地跑 Full，只跑直接受影响的脚本，Full 交给 main CI
- 统一：`git diff --check origin/main...HEAD`，并实际操作一次受影响的行为
- 高风险（鉴权、答案隔离、持久化、题号和答案对应、准入、共享 Paper 契约）：另加一次独立审查（Astra），审查结论绑定候选 SHA，但不开 PR
- 检查清单（`scripts/verify-ci.mjs`、`scripts/lib/verificationShards.mjs` 里登记的检查增删）：不开 PR，由另一个 Agent 独立审查有没有删掉或放松不该动的检查，审完直推
- **CI 和部署工具链**（`.github/workflows/`、`scripts/ci-pr-plan.mjs`、`.agents/setup`、`verify-ci.mjs` 的分档/规划逻辑、部署脚本、控制器和主机配置）：继续走 PR，PR 完整 CI 绿、Astra 审过再合。这类改动改的是裁判本身，推上 main 以后它自己那次绿灯证明不了它没被改松

Complete missing affected local-only acceptance once; reuse natural main Full/E2E
for covered checks. Do not stack packs or duplicate hosted Full locally.
Inspect rendered changes before claiming UI completion; visible changes get
online Owner QA after deployment. Expand checks only for unbounded impact.

| Change | Local-only acceptance before push | Final gate (reuse natural main CI) |
| --- | --- | --- |
| Atomic UI micro-change | exact-page real click | Owner QA when visible; no unrelated backend/Paper suite |
| Known-shape Canonical Paper data | strict input/publication canary not covered by CI | no authority bump, deep per-paper tri-surface proof, full suite, or independent review unless a shared shape changes |
| Ordinary local feature | affected build/public seam not covered by CI | natural main Full/E2E |
| Shared renderer/Paper contract | affected real Screen/Print/PDF | required Full/E2E and one independent Standards/Spec review |
| Auth, isolation, persistence, migration, production config, or irreversible cross-cut | affected public seam not covered by CI | required Full/E2E and one independent Standards/Spec review |

`SKIP` is not `PASS`; report its limitation literally. Retain a verifier or
process rule only when it names the failure or independent detection layer it
uniquely supplies; otherwise keep it outside acceptance packs.

## Ship to main

- Tasks default to direct push and deployment; do not wait for another Ship.
  Keep one understandable, verifiable change per commit, completed within hours.
  Every push ships with latest main, so keep unfinished features unreachable from
  user entry points until done. While main is red keep developing locally; once
  green, synchronize, rerun affected L1, then push.
  Develop on a local task branch based on latest `origin/main`; preserve unrelated
  work and never rewrite published history merely to consolidate commits.
- At startup and before push, fetch origin, resolve current main SHA and inspect
  its latest natural Actions attempt's eight jobs, plus unresolved failures
  still affecting main. Judge by SHA, never by run completion order.
  On Owner Mac also compare production: deploy only if current main is all green
  and not already live; pending/red main never permits an older green deployment.
- Classify the complete changed-path set (and individual paths when investigating)
  with `node scripts/verify-ci.mjs --plan-json --changed-file <path>` (repeat flags).
  Treat `risk` as the primary machine result; high-risk behavior still needs
  Astra review and affected real Screen/Print/PDF checks where applicable.
  Unknown/fallback risk requires Full CI, not a routine local Full run.
- After L1, review the diff and require a clean committed worktree, then
  `git push origin HEAD:refs/heads/main`. If rejected, synchronize and repeat
  affected self-checks before retrying. Never force-push or bypass protection.
- Only CI/deployment toolchain changes use PR + Astra + complete green PR CI:
  `.github/workflows/`, `scripts/ci-pr-plan.mjs`, `.agents/setup`, pack or
  planner logic in `scripts/verify-ci.mjs`, deployment scripts/controllers and
  `EQB_HOST_CONFIGURATION_PATHS`. Adding or removing check entries in the
  `scripts/verify-ci.mjs` / `scripts/lib/verificationShards.mjs` registries does
  not use a PR: another Agent independently reviews that no unrelated check was
  dropped or loosened, then it is pushed directly (Owner 2026-11-16; PR CI runs the
  head's registry, so only review catches a dropped check). Everything else, including high-risk behavior
  (server admission, persistence, import upload tooling), is reviewed on the
  local candidate and pushed directly to main (Owner 2026-11-16). Changing shared
  GitHub settings is not authorized.
- If direct push is unavailable, use the optional PR route in `.agents/ship.md`.
  Synchronize main before triggering PR verification so head contains the event
  base; after complete green PR CI, squash merge. Later main advancement alone
  does not require another PR run. Deployment still waits for latest main CI.
- The pusher follows their exact SHA's natural main run to completion and deploys
  latest green main on Owner Mac. If unable to wait, record “SHA 待确认” in Linear;
  off Mac record “已绿待部署” once green. Startup checks pick up unattended work.
- Red main pauses ordinary pushes; only fixes/reverts may proceed. The pusher of
  the first failing SHA owns a fix/revert pushed within 30 minutes of discovery.
  If absent, the first finder takes over. Before reverting, assess dependent
  commits and data compatibility; do not blindly revert. Registered unrelated
  flakes permit one whole-workflow rerun with a record; a second failure is real.
  See `docs/agents/testing-cadence.md`.
- After delivery report exact 40-hex main SHA and parent, machine risk, changed
  files, summary, commands as PASS/SKIP/FAIL with limitations, review evidence,
  exact Actions run and both aggregate job links, and deployment/health status.
  Update Linear with commit, behavior, verification and whether it is live.

## GitHub Actions CI authority

- `.github/workflows/verify.yml` runs on natural `pull_request` and `push` to
  `main`. Every main push runs Full in its own SHA concurrency group without
  replacing another push; PR runs may replace older runs for that PR. Independent workers
  `verify-1`, `verify-2`, `e2e-seams-1`, `e2e-seams-2`, `e2e-render-1` and
  `e2e-render-2` use isolated runners within trusted-base boundaries; `verify`
  aggregates its two workers and `e2e` its four. Verify and render shards use
  registry-path SHA-256 modulo 2 plus 1 with explicit balance overrides and a
  disjoint/full-union assertion; stale overrides and shard keys other than
  exactly `{1, 2}` fail closed. Full remains required for paper/security/shared/high/unknown
  risks, invalid or missing exact-head/base advice, and main. The seams workers
  always run all six fixed browser seams exactly once (renderer + reorder;
  DOM contract + A3 + grammar-fill + golden path). Render workers partition the
  selected pack's e2e lane; a legitimate empty shard succeeds and records
  `scripts=0`, never a skipped job. Both aggregate jobs and all
  workers must succeed; their disjoint lanes must cover the complete selected
  pack. Local `verify:all` remains unpartitioned. No path filter, skipped job,
  local report, manual run or Amp Check substitutes for either job.
  See ADR-0026 and the cutover runbook.
  Optional PR pack advice follows `.agents/ship.md`; Actions uses its natural
  event snapshot, never a live mutable comment.
- Read GitHub Actions run and job evidence directly. Bind the repository,
  workflow path, event, current PR head/base (or exact live main SHA), latest
  run attempt, GitHub Actions App identity and all eight successful jobs.
  PRs test GitHub's merge ref and must contain their event base; reject stale
  head/attempt evidence. Main CI is the deployment gate, not a pre-push gate.
- CI runs independently of Agent threads. The pusher actively checks main CI;
  optional PR watcher notifications are best effort, never authority. Diagnose
  failures before rerunning and retain attempts; no queue or acknowledgment
  substitutes for direct Actions evidence.
- Deployment accepts only latest main's exact-SHA natural `push` run and its
  latest successful attempt through the deployment reader, which accepts only
  the exact v4 `{verify-1, verify-2, verify, e2e-seams-1, e2e-seams-2,
  e2e-render-1, e2e-render-2, e2e}` job
  set with every job successful. Reader and workflow ship together; historical
  v1/v2/v3 sets are rejected. Deployment resolves latest main, so the new reader
  does not authorize deployments of historical pre-v4 main runs.
  Pending, failed, missing,
  wrong-SHA, wrong-workflow or ambiguous evidence fails closed.
- The old Amp CI webhook/controller, serialized eligibility, Amp-only watcher,
  Sentinel/Discovery and Action-wake are not the new authority. Do not start,
  drain, replay or initialize them. Retire the live registration/services only
  after Actions takeover and exact-main validation passes;
  preserve old receipts and queue evidence. Source removal is not proof that a
  remote webhook or lost Orb has stopped.

## Owner Mac deployment

- Website deployment runs on the Owner Mac through `scripts/local-deploy.sh`.
  The private key lives only in the Owner Mac Keychain; never copy it into a
  repository, worktree, log, Agent prompt, CI, or development Orb.
- Standing Owner `部署最新版` authority includes automatic deployment, diagnosis,
  health and agreed recovery after latest main's eight jobs are green. Only on
  Owner Mac, use clean `~/Projects/eqb-deploy`, fetch origin and fast-forward main,
  then run `scripts/local-deploy.sh deploy --owner-said-deploy-latest`.
  Re-resolve if main advances; never use an old green SHA or ask Owner to copy one.
  For persistence-path code changes, review the complete production-SHA-to-target
  diff and confirm no migration/schema/data operation, then add `--code-only`;
  the script computes its digest. Migration, schema, DB/R2 data operations and
  host configuration require separate authority. “停自动部署” pauses all Agents.
  Off Mac, record “已绿待部署” in Linear for an Owner Mac Agent to pick up.
- The deploy command requires the exact-main successful natural GitHub Actions
  `Verify` workflow with both `verify` and `e2e` jobs, then sends that SHA
  through pinned restricted SSH to the root-owned fixed host controller.
  Missing, pending, malformed, wrong-SHA or ambiguous evidence fails closed.
  Never stream candidate deployment code, bypass the forced command, or use
  legacy in-place deploy.
- Non-secret configuration lives in `~/.config/eqbank/deploy/env` and
  `known_hosts`; the wrapper reads the private key from Keychain and supplies
  it only through the child-process environment. See ADR-0027 for the accepted
  local-user trust boundary and network handling.
- The Deployment Orb retains its old key as a backup. Only when the Owner
  explicitly requests retirement, remove the server's first `authorized_keys`
  entry (`eqb-amp-deployment-v1`) and the Orb's private-key secret; preserve
  the local key entry. Do not retire it as part of an ordinary deployment.
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

Live verification and bug reproduction on eqbank.cc use the Agent accounts, never
`buqisir`: Owner Mac uses `agent-local` in Ego Browser profile `tiger`
(`Profile 6`; password only in macOS Keychain service `eqbank.cc`), cloud sessions
use `agent-cloud` from their own secret store. Both are owner-role for admin and
teacher views; Agents still never approve, publish, or delete others' data.

## Product boundaries

- Preserve `Source -> Passage -> Question Group -> Question -> Paper Set ->
  Export`.
- Prefer teacher-operable, passage-first workflows. AI-derived information must
  serve a named teacher task and require human confirmation.
- Current PDF products are `largeComplete`, `largeNoListening`, `economy8`,
  and `answerOnly`, per `docs/product/paper-pdf-products-v1.md`. The three question
  papers hide answers; answerOnly consumes source-backed answers and references,
  never AI explanations. Student/Teacher remain internal or historical roles,
  not current product choices.
- Screen, internal Print HTML, and PDF consume the same stable Canonical Paper
  and version-bound source references through shared renderer seams; no surface
  reconstructs paper meaning on its own. Historical bindings stay unchanged.
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

- Code deployment uses the standing authority above; migration, schema,
  DB/R2 data operations and host configuration require separate Owner authority. Check
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
