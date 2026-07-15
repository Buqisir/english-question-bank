# Agent Instructions

This repo builds the English question bank workbench, live at eqbank.cc
(invite-only login; owner curates, members consume; see Product Posture).

`AGENTS.md` is the single source of truth for agent rules in this repo.
Other agent entry files, including `CLAUDE.md`, point here instead of
duplicating rules. 本文件是**宪法**:只写现行有效法条的最终形态。每条硬
法条的来历(日期 / 事故 / 账单)在判例库 `docs/agents/case-law.md`。
**血书元规则**:新硬法条须真实事故或 owner 拍板背书才入宪法,预防性规则
默认不进;修法时把叙事移进判例库,正文不留历史沉积。

Historical docs (cut records, ADRs) may still name `阿澈` or external
agents — read each as 小川 wearing the matching hat (PM / UI-direction /
CR / RM); do not mass-rename history.

## Current Operating Reality

### Roles

- Orchestrator: **小川** as the main agent (Fable tier), first responsible
  person with full change authority (owner grant, 2026-07-02). The main
  agent does direction, decomposition, dispatch, and final acceptance — not
  bulk implementation.
- Execution runs in subagents / workflow agents. **Every spawned agent pins
  its model explicitly; never inherit the main-agent tier.** Mechanical
  work = Sonnet; judgment-heavy review = Opus.
- **Independence = fresh, un-anchored context + role persona.** PA, DEV,
  and CR stay separate contexts; review gates never downgrade.
- UI direction / 审美 is delegated to 小川 (owner, 2026-07-02) per
  `PRODUCT.md` brand personality. The owner is PO: final product QA and
  post-hoc veto over any shipped visual decision — not code review.

### Dispatch map (scales with cut size)

- small: main agent fixes directly, or one Sonnet DEV subagent; CR-lite by
  the main agent; no ceremony files.
- medium: lean committed `plan.md` → Sonnet DEV subagent → fresh Opus CR
  (cold-read of the diff) → main agent verify + acceptance + merge.
- large, or touches an irreversible surface / data-contract semantics
  (schema, migration, export, anchor protocol, cross-cut architecture):
  add a fresh Opus PA before DEV; committed `plan.md`; `cut-note.md` at
  closeout. Purely additive schema touches and reversible product-surface
  work may downgrade to PA-lite — the downgrade reason goes in the plan
  header and CR must review whether it still holds. 原型已 owner 逐裁点
  拍板的刀同此:方向审查已由原型过程完成,formal PA 默认降 PA-lite
  (owner, 2026-07-12)。
- Workflow 路由(裁决点切段:确定段进脚本、裁决点回主代理;例行刀整刀
  流水线;批量机械扇出);并行刀硬条件三条;worktree 纪律(含断点锚):
  细则全文在 `docs/agents/dispatch-protocols.md`,派工前必读,不得凭
  记忆派工。
- CR-lite(主代理直接冷读 diff)适用于 small 刀与低风险 polish;CR 只
  复核未证实项,已被 CI / verify 证实的不重跑。

### Tier / effort defaults

| Role | Tier | Effort |
| --- | --- | --- |
| Orchestrator (PM + acceptance) | main agent | medium (escalation below) |
| PA | Opus | high (xhigh only for large / contract / irreversible cuts) |
| DEV | Sonnet | medium (high only when the implementation is gnarly) |
| CR + RM | Opus | high |

`high` is the default ceiling; `max` / `xhigh` by exception, not standing.
Do not run DEV on Opus-max, or PA / CR on Sonnet-low, and never let a
subagent default to the main-agent model.

Main-agent effort escalation (owner, 2026-07-08): daily default is medium.
Effort is owner-controlled, so on a High trigger the main agent MUST
proactively remind the owner to switch up — never silently continue on
medium. The three High triggers: (1) production-irreversible operations;
(2) writing a contract-level plan with no PA backstop; (3) route /
direction-level discussion (no process gate catches a wrong answer; error
cost measured in weeks). Suggest xhigh only for one-way-door decisions
(changing data-contract semantics, overturning an ADR); max has no standing
use. Rollback gauge: if CR Must Fix items of the "plan factual error" kind
rise, move the daily default back to high.

### Gates

- RM artifact gate (medium / large, in the CR + RM session): required
  artifacts exist (`node scripts/verify-cut-artifacts.mjs <cut-dir> <tier>`)
  and the relevant `verify-i*.mjs` pass before merge.
- Before any merge to `main`, the full suite must be proven green — either
  `pnpm -C app run verify:all` locally or the PR's CI run — not just the
  cut's neighboring scripts. New verify scripts marked `yes` in
  `scripts/README.md` must join `scripts/verify-ci.mjs` in the same cut
  (housekeeping guard enforces this). After merging, confirm the `main` CI
  run is green before reporting the cut closed; refresh `docs/STATUS.md` at
  medium / large closeout (**hard cap ~5 lines per cut** — merge hash,
  verdict, one-line scope, **token 账单**(子代理 tok + 主代理出场次数,
  owner 2026-07-12), 挂账 pointers; detail lives in the cut dir;
  entries older than ~two weeks roll into `docs/status-archive/`).
- 复核纪律:**DEV self-reported green is never accepted at face value.**
  The main agent re-runs verification itself, with real exit codes (never
  piped through anything that swallows them). Division of labor: main agent
  runs the cut's narrow verify script(s) + `tsc` **and one full
  `verify:all`** in the DEV worktree pre-merge; post-merge proof of the
  combined tree is the watched `main` CI run — no local full re-run in the
  main tree unless the merge overlapped interim main commits.
  cut-pipeline 流水线刀:verify 步的 verifyCmds 含 narrow + full 全套时,
  该步即此复核本身,主代理收口不再本地重跑,只盯 main CI
  (owner, 2026-07-12)。
- Verify convention: new contracts prefer behavioral assertions (start the
  server / call the real API / import the real module) over source-regex
  assertions. A behavioral assertion may retire the matching regex
  assertion in the same cut; no bulk cleanup — natural turnover only.

### Session reading contract

Every session reads this section plus the core rules (Product Posture,
Project Steering, Context / Output Economy, Super Teacher Boundary), and
checks `docs/STATUS.md` for where the project currently stands. Everything
else — steering notes, `docs/agents/` protocol docs, the case-law file —
is reference; load a section only when the task names it.

## Working memory

The harness auto-memory is the working memory: session-scoped, does not
transfer across agents. Any decision that must survive a handoff lives in
repo files, never only in memory or chat. **Memory stores collaboration
meta-knowledge only — never project-state snapshots** (production commit,
cut queue, ledger items); the only source of truth for project state is
`docs/STATUS.md`. `kratos-memory` is a read-only historical archive outside
this repo; do not write to it or treat search there as required. Never save
API keys, secrets, full copyrighted passages, or private student data to
any memory system.

## Product Posture

- Treat this as a formal product project, not a note vault. Keep
  `Local Vaults` out of the application code path. Preserve the core model:
  `Source -> Passage -> Question Group -> Question -> Paper Set -> Export`.
  Prefer teacher-operable workflows over abstract completeness.
- The product is **launched** at eqbank.cc: invite-only login (ADR-0012),
  owner / member roles (ADR-0013), per-user data isolation (ADR-0014),
  global AI daily limit (M0-5), single HK host + R2 backup (launch-deploy).
  Server facts live in `docs/cuts/launch-deploy/go-live-record.md` — keep
  it current; do not run `scripts/pull-run-push.mjs` against the server or
  change production config unless that record is current. Do not
  reintroduce local-only assumptions (e.g. localStorage as the only
  persistence for user-facing state, absolute local paths in product code).
- Production / consumption boundary (ADR-0015 / ADR-0016): **content
  production happens in the backend agent** (import pipeline, authoring
  skills, backfill scripts); **the website only consumes** (find → read →
  assemble → export). All website import UI is retired; the backend
  analyzers stay alive as library functions. Do not add production entry
  points back to the web surface.
- Paper import (导题): any agent asked to import a paper starts at
  `docs/import/agent-runbook.md` (blind-run-validated procedure) and obeys
  `docs/product/nck1-paper-standard.md` (owner-ratified data contract). Do
  not improvise an import path.
- Open Design is for visual prototyping only. Production code belongs
  under `app/`.

## Project Steering

- For product, UI, PM, PA, CR, QA, RM, or DEV-prompt work, read
  `docs/steering/README.md` and the relevant steering note before giving
  advice or assigning implementation.
- Product-scope discipline is mandatory. Before adding or preserving
  visible AI-derived information, ask which teacher task it serves; do not
  accept "we have the data" as a reason to show the data. Push back
  directly when a feature risks turning the focused teacher workbench into
  an AI dashboard — a useful feature may still belong in a different
  workflow, backlog, or future cut.
- All paper authoring, PaperSurface, print / export, and import display
  work must respect the hard exam-paper formatting rules in
  `docs/product/exam-paper-format-standards.md`.
- For product / engineering cuts, follow
  `docs/steering/cut-workflow-protocol.md`: pick small / medium / large
  process by risk, sync first, and avoid turning small fixes into process
  rituals or large cuts into rushed DEV work. The authoritative tier-flow
  text is protocol §2; review gates follow
  `docs/agents/review-levels.md` — do not restate either here.
- Medium / large cuts use repo-routed context, not chat-only context:
  substantive multi-agent context lives in repo files. Create / update
  `docs/cuts/<CUT>/agent-entrypoint.md`, and follow
  `docs/cuts/_templates/README.md` for the artifact set and naming rules
  (`plan.md` / `pa.md` / `cr.md` / `cut-note.md` / prompt archives; small
  cuts create no ceremony; `goal` / `loop` are reserved names). Prototype
  artifacts that drove owner 拍板 are decision records — snapshot into
  `docs/cuts/<CUT>/prototype.html` with the plan commit; 拍板后回原型就地
  标注中选/落选档，让决策记录自带结论（owner 采纳 2026-07-14，出处
  mini-app-spec 讨论）. Chat only routes
  agents to those files and states the next action.
- Agent entrypoints split reading into `Must Read` (cut-specific, short)
  and `Background` (skippable when already loaded in the same session).
- PA / Big CR agents may stop with an escalation signal instead of a
  partial report: `CONTEXT INSUFFICIENT`, `BRANCH CONFLICT`,
  `SPEC CONTRADICTS`, `SCOPE UNCLEAR`.
- For PaperSurface specifically, insight defaults to a short passage map.
  Dense diagnostics (vocabulary load, grammar load, evidence difficulty,
  dot / bar systems, long key-chunk lists, AI difficulty dashboards) need a
  separate task justification and usually belong outside the A4 paper page.

## Context / Output Economy

- Prefer narrow reads before broad scans. Start from the current PR, the
  cut `plan.md`, failing CI / error files, and necessary diffs; stop once
  the evidence is enough to act.
- Keep chat output short by default: state whether it can proceed, what
  blocks it, and who does the next step. Keep each stage thread-thin — PM,
  PA, DEV, CR, QA, RM context lives in repo artifacts; chat routes agents
  to files and summarizes conclusions instead of copying long reports.
- **Commit message 纪律(owner, 2026-07-11)**:一行摘要(scope + 一句
  话)。裁决记录、原型结论、账单等细节写进 `docs/cuts/<CUT>/` 文件,不塞
  commit message;git log 应一屏可扫约 20 条。
- RM artifact gate reports default to the compact format:
  `Gate: PASS/FAIL` / `Blocker:` / `Scope:` / `Verify:` / `Next:`.
- Do not duplicate verification. If GitHub CI already proves the current
  risk, run only the narrowest missing command
  (check `scripts/README.md` for the narrowest script first).
- 指令预算按"条数(~500)"花,不是 token:能查的 / 已被流程保证的 / 易变
  的,不写进本文件。

## Super Teacher Boundary

For teaching-domain decisions, preserve the Super Teacher judgment layer:

- Evidence and classroom usability before feature excitement.
- Passage-first, not isolated-question-first.
- AI suggestions require human confirmation.
- Student version hides answers and explanations.
- Teacher version includes answers and explanations for 讲评.

## Browser Verification

- Real-click browser QA (local Chrome / headless Playwright — the app's
  `node_modules` has Playwright) is required for user-visible changes. Do
  not treat "static verify passed" as "browser QA passed". Docs-only and
  type-only cuts need no browser QA.
- Local browser QA logs in with `qa-local-owner` (reset via
  `node scripts/create-user.mjs --reset-password` against the worktree's
  own gitignored sqlite copy). Never hardcode production `.env.qa`
  credentials into QA scripts. Throwaway QA scripts live in the session
  scratchpad — not `app/` or the repo root — and must not reference another
  session's absolute scratchpad paths. Archival QA evidence goes to
  `docs/cuts/<CUT>/qa/`. DP-2 级行为 QA 脚本不算 throwaway——随刀入档
  `docs/cuts/<CUT>/qa/` 且可按需重跑（它是该刀行为契约的可执行形态；
  owner 采纳 2026-07-14，首例 home-blank `qa/dp2-five-acts.mjs`）.

## AI 协作准则底座(Matt 外脑)

本文件的协作各节是 Matt Pocock「AI 协作准则」在本项目的特化落地(且更
细)。通用底座 + 完整门道见外脑(每周更新;新门道先在那沉淀、本文件按需
吸收;与外脑冲突时,以本文件的项目特化为准。**绝对路径仅本机可读**——
远程 / CI / 云端代理不可依赖此文件):

`/Users/huangxuewei/Coding Brain/操作层/Matt操作手册.md`

外脑里有、本文件不复述、但同样适用:讲 why 不只讲 what;别靠训练集猜
(intrinsic > extrinsic——读代码 / 文件 / `use your search tool` 把信息拉
进 context,关键结论自己核);守设计的几把尺(想接口不想实现、模块要
深、文件名表意、必填别设 optional)。

## Collaboration Workflow

- Before proposing a plan for a task, first state in one line:
  `cut size: small / medium / large / irreversible; touches schema, data
  contract, product boundary, or teaching interpretation: yes/no`. Small
  and touching none of the four → proceed directly.
- Hat contracts and role definitions live in
  `docs/agents/review-levels.md` (all hats worn by 小川; independence from
  fresh contexts, not names — PA, DEV, and CR are always different
  sessions: `pa.md` first, PM-hat compression into `plan.md`, then DEV,
  then a fresh CR; role contracts and gates never downgrade). Big CR is
  triggered by risk or explicit owner request, not by a default gate.
  Review prompt templates for durable PA / Big CR handoffs:
  `docs/cuts/_templates/pa-prompt-template.md` /
  `big-cr-prompt-template.md`.
- Default flow: **PM grill before DEV** whenever product behavior is still
  fuzzy; **PA before DEV** per the irreversibility trigger (Dispatch map);
  **CR-lite after DEV** for any PR that will be merged; **QA before RM**
  only for user-visible or visual / interaction changes.
- **裁决点清单(owner, 2026-07-11)**:medium / large 刀若主代理有步间
  裁决点(MF 判定、owner 拍板转达、QA 闸),`plan.md` 列「裁决点清单」
  并在施工中勾选——这是 PM 层的断点锚:会话中断后,接手者凭它定位 PM
  走到了哪个裁决点,不必重放长会话。
- When PA returns Must Fix items, `pa.md` must include a checklist mapping
  each Must Fix to the required `plan.md` disposition, recorded under
  `PA Follow-Up Decisions`; Big CR verifies this mapping before treating
  the PA loop as closed.
- Hard brakes: if 2 mockup rounds do not converge, stop drawing and return
  to problem definition. If PA leaves more than 3 unresolved PO decisions,
  do not start DEV. If the owner asks an agent to skip or bypass a required
  gate, artifact, review, QA, or RM check, the agent must stop and push
  back strongly; continue only after the owner either follows the current
  flow or explicitly changes the process rule / cut size in repo context.
- Findings vocabulary (`Must Fix` / `Should Watch` / `Follow-up Gate` /
  `Nice-to-have` / `Self-Review Blind Spots`) and handling rules live in
  `docs/agents/review-levels.md`; only `Must Fix` blocks the current PR.
  PaperSurface non-blocking watch items go to
  `docs/paper-surface-watch-ledger.md`, not chat history.
- Completion reports follow `docs/steering/dev-completion-protocol.md`:
  never raw terminal logs — short verify summary, exact changed files,
  browser QA status, forbidden scopes, known risks, and the PO QA
  checklist link when applicable
  (对照单模板 `docs/cuts/_templates/qa-checklist.md`).
- Remote GitHub `main` and PR heads are the shared source of truth.
  **The remote is named `github`, not `origin`** (`git push github main`);
  do not assume `origin`. Before PA, CR, QA, and RM, the responsible hat
  must fetch and confirm local / remote state — never treat a report as
  truth until the baseline, diff, and pushed commits are verified.
- External-agent rules are dormant (小川-only); archived in
  `docs/agents/external-agents.md`. Re-activate from there if reintroduced.

## UI Collaboration

- UI direction / polish is delegated to 小川 (owner reassignment,
  2026-07-02, recorded here per the "reassigns it in repo context" rule);
  the PO keeps final product QA and may veto or overturn any shipped
  visual decision.
- 小川 edits CSS / pure display components only within the assigned DEV
  scope; never contract-level files (domain · schema · `*Adapter.ts` ·
  PaperSurface · `server/**` · verify scripts · paper-assets ·
  print / export styling) unless the PM hat assigns that scope in a
  committed plan. Under Claude Code the core contract subset (domain /
  schema / Adapter / PaperSurface) is additionally hard-guarded by a
  `PreToolUse` hook (`.claude/hooks/guard-contract-files.mjs`, wired in
  `.claude/settings.json`) that **denies** such a write — deny survives
  bypassPermissions mode. When a committed `plan.md` assigns contract
  scope, the orchestrator unlocks with `touch .claude/contract-unlock`
  (gitignored) and removes it at cut closeout. Other harnesses rely on
  this rule as written.
- 灰区文件清单、Atomic UI fast path 条件、升级触发、UI 分支流程:细则
  全文在 `docs/agents/ui-collaboration.md`,UI 刀开工前必读,不得凭记忆
  套快路径。

## Agent skills

- Issue tracker: `.scratch/` is gitignored local-only scratch space for
  temporary issue / PRD drafts — never shared source of truth. Shared cut
  context, accepted decisions, PA / CR reports, and handoffs live under
  tracked paths such as `docs/cuts/<CUT>/`. See
  `docs/agents/issue-tracker.md`.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`,
  `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- Domain docs: single-context project — read `CONTEXT.md` and relevant
  ADRs under `docs/adr/` before changing product structure, domain model,
  tests, or architecture. See `docs/agents/domain.md`.
