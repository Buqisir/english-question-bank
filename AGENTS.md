# Agent Instructions

This repo builds the local-first English question bank workbench.

`AGENTS.md` is the single source of truth for agent rules in this repo.
Other agent entry files, including `CLAUDE.md`, should point here instead
of duplicating workflow or browser rules.

## Current Operating Reality

This section overrides any conflicting role or process text below and in
the steering notes. It reflects how the project runs today. Historical docs
(cut records, ADRs) may still name `阿澈` or external agents — read each such
reference as 小川 wearing the matching hat (PM / UI-direction / CR / RM); do
not mass-rename history.

### Roles (rewritten 2026-07-02, owner-authorized)

- Orchestrator: **小川** as the main agent (Fable tier), first responsible
  person with full change authority over the project (owner grant,
  2026-07-02). The main agent does direction, decomposition, dispatch, and
  final acceptance — not bulk implementation.
- Execution runs in subagents / workflow agents. **Every spawned agent pins
  its model explicitly; never inherit the main-agent tier** (quota
  discipline). Mechanical work = Sonnet; judgment-heavy review = Opus.
- **Independence comes from a fresh, un-anchored context + the role persona.**
  A subagent with a fresh context is equivalent to the old "fresh session".
  PA, DEV, and CR stay separate contexts; review gates never downgrade.
- UI direction / 审美 is **delegated to 小川** (owner decision, 2026-07-02):
  小川 sets visual direction per `PRODUCT.md` brand personality and ships UI
  decisions directly. The owner (PO) keeps product QA and can veto / redo
  any shipped visual decision after the fact.

### Dispatch map (scales with cut size)

- small: main agent fixes directly, or one Sonnet DEV subagent. CR-lite by
  the main agent; no ceremony files.
- medium: main agent writes a lean DEV contract (`plan.md`, short is fine)
  → Sonnet DEV subagent → fresh Opus CR subagent (cold-read of the diff)
  → main agent verify + acceptance + merge.
- large, or touches data contract / schema / export / migration /
  architecture / irreversible: add a fresh Opus PA subagent before DEV;
  committed `plan.md`; `cut-note.md` at closeout.
- Workflows (deterministic multi-agent fan-out) are allowed for parallel
  work; each `agent()` call sets `model` explicitly per the tier table.

### Tier / effort defaults

| Role | Tier | Effort |
| --- | --- | --- |
| Orchestrator (PM + acceptance) | main agent | — (dispatch & verify only) |
| PA | Opus | high (xhigh only for large / contract / irreversible cuts) |
| DEV | Sonnet | medium (high only when the implementation is gnarly) |
| CR + RM | Opus | high |

`high` is the default ceiling; `max` / `xhigh` is by exception, not
standing. Do not run DEV on Opus-max, or PA / CR on Sonnet-low, and never
let a subagent default to the main-agent model.

### RM gate

Medium / large merges run the RM artifact gate in the CR + RM session:
required artifacts exist (`node scripts/verify-cut-artifacts.mjs`) and the
relevant `verify-i*.mjs` pass before merge.

Before any merge to `main`, the full suite must be proven green — either
`pnpm -C app run verify:all` locally or the PR's CI run — not just the
cut's neighboring scripts. New verify scripts marked `yes` in
`scripts/README.md` must be added to `scripts/verify-ci.mjs` in the same
cut (the housekeeping guard enforces this). After merging, confirm the
`main` CI run is green before reporting the cut closed.
(2026-07-03 incident: 11 consecutive red CI runs from a narrow verify
list + unwatched Actions.)

### kratos scope

Write project memory only to the repo-root project (root = this repo). Do
not `kratos create` / `switch` to a per-cut or per-worktree scope (e.g.
`eqb-c7-dev`).

> TODO (one-off — delete when done): some extra scopes already exist; they
> need a cleanup pass but must not be blind-deleted.

### Session reading contract

Every session reads this section plus the core rules (Product Posture,
Project Steering hard rules, Context / Output Economy, Super Teacher
Boundary, Persistent Working Memory). The rest of this file and the steering
notes are reference — load a section only when the task names it.

## Persistent Working Memory

- Use `kratos-memory` as the project-scoped working memory for this repo.
- At the start of non-trivial question-bank tasks, search relevant Kratos memory from this repo root, for example `kratos-memory search "reading difficulty reviewer"`.
- Save durable workflow decisions, recurring pitfalls, reviewer invocation preferences, and stable product rules to Kratos at the end of a task.
- Do not save API keys, secrets, full copyrighted passages, private student/person data, or large raw model outputs to Kratos.
- Keep Kratos project scope anchored to `/Users/huangxuewei/Projects/english-question-bank`; do not mix it with `Local Vaults` memory.

## Product Posture

- Treat this as a formal product project, not a note vault.
- Keep `Local Vaults` out of the application code path. The vault may provide ideas later, but V0 data and code live in this repo.
- Preserve the core model: `Source -> Passage -> Question Group -> Question -> Paper Set -> Export`.
- Prefer teacher-operable workflows over abstract completeness.
- V0 is local-first, single-user, no login, no cloud sync.
- Open Design is for visual prototyping only. Production code belongs under `app/`.

## Project Steering

- For product, UI, PM, PA, CR, QA, RM, or DEV-prompt work, read
  `docs/steering/README.md` and the relevant steering note before
  giving advice or assigning implementation.
- Product-scope discipline is mandatory. Before adding or preserving
  visible AI-derived information, ask which teacher task it serves.
  Do not accept "we have the data" as a reason to show the data.
- Push back directly when a feature risks turning a focused teacher
  workbench into an AI dashboard. A useful feature may still belong in
  a different workflow, backlog, or future cut.
- All paper authoring, PaperSurface, print/export, and import display work
  must respect the hard exam-paper formatting rules in
  `docs/product/exam-paper-format-standards.md`.
- For product / engineering cuts, follow
  `docs/steering/cut-workflow-protocol.md`: pick small / medium /
  large process by risk, sync first, and avoid turning small fixes into
  process rituals or large cuts into rushed DEV work.
- Medium / large cuts use repo-routed context, not chat-only context:
  substantive multi-agent context must live in repo files. Create / update
  `docs/cuts/<CUT>/agent-entrypoint.md`, use `docs/cuts/_templates/` (naming
  rules in its `README.md`) when starting a cut, and keep handoff / Cut Note
  records there. Chat only routes agents to those files and states the next
  action — never depend on copy-pasted chat history as the source of truth.
- Use review prompt templates when a PA / Big CR handoff needs a durable
  repo-routed instruction:
  `docs/cuts/_templates/pa-prompt-template.md` and
  `docs/cuts/_templates/big-cr-prompt-template.md`.
- Cut artifact naming is intentionally simple for new cuts:
  `plan.md` for the DEV execution contract, `pa.md` for formal PA,
  `cr.md` for formal CR / Big CR, optional `pa-prompt.md` /
  `cr-prompt.md` only when a prompt must be archived, and
  `cut-note.md` for large-cut closeout. Historical cuts may use the
  legacy `goal.md` name; do not rename historical artifacts only to match
  this convention. The names `goal` and `loop` are reserved for run-mode
  commands and must not be used as document names in new cuts.
- Small cuts should not create `docs/cuts/<CUT>/` ceremony. Medium cuts
  require a committed `plan.md` before DEV. Large cuts require committed
  `plan.md`, formal PA / CR records as applicable, and `cut-note.md`
  before closeout.
- Before RM merge for medium / large cuts, run the artifact gate:
  `node scripts/verify-cut-artifacts.mjs <cut-dir> <tier>`. It checks the
  DEV-contract artifact exists non-empty (`plan.md` / `pm-spec.md` /
  `goal*.md`), large additionally needs non-empty `cut-note.md`, and it
  flags whether PA / CR records are present; non-zero exit stops the merge.
  The RM hat still owns the gate judgment — the script just makes the
  existence check mechanical instead of manual.
- Cut decision ledgers should expose freshness. New `decisions.md`
  files should include `Last synced` and
  `Open review items`, and PA / Big CR follow-up must update those fields
  before another agent depends on the file.
- When PA returns Must Fix items, `pa.md` must include a checklist that
  maps each Must Fix to the required `plan.md` disposition, and
  `plan.md` must record the matching PM / PO handling under
  `PA Follow-Up Decisions`. Big CR must verify this mapping before
  treating the PA loop as closed.
- Agent entrypoints should split reading into `Must Read` and
  `Background`. Keep Must Read cut-specific and short; Background may
  be skipped when already loaded in the same session.
- PA / Big CR agents may stop with an escalation signal instead of
  writing a partial report: `CONTEXT INSUFFICIENT`,
  `BRANCH CONFLICT`, `SPEC CONTRADICTS`, or `SCOPE UNCLEAR`.
- For PaperSurface specifically, insight should default to a short
  passage map. Dense diagnostics such as vocabulary load, grammar load,
  evidence difficulty, dot/bar systems, long key-chunk lists, or AI
  difficulty dashboards need a separate task justification and usually
  belong outside the A4 paper page.

## Context / Output Economy

- Prefer narrow reads before broad scans. Start from the current PR,
  current cut `plan.md`, failing CI / error files, and necessary diffs;
  stop once the evidence is enough to act.
- Keep chat output short by default: state whether it can proceed, what
  blocks it, and who does the next step. Expand only when the owner asks
  or the risk needs explanation.
- Use compact fixed formats for recurring workflow reports. RM artifact
  gate reports should default to:

  ```text
  Gate: PASS / FAIL
  Blocker:
  Scope:
  Verify:
  Next:
  ```

- Keep each stage thread-thin. PM, PA, DEV, CR, QA, and RM context should
  live in repo artifacts; chat should route agents to files and summarize
  conclusions instead of copying long reports.
- Do not duplicate verification. If GitHub CI already proves the current
  risk, do not rerun broad local suites; run only the narrowest missing
  command needed for confidence.

## Super Teacher Boundary

For teaching-domain decisions, preserve the Super Teacher judgment layer:

- Evidence and classroom usability before feature excitement.
- Passage-first, not isolated-question-first.
- AI suggestions require human confirmation.
- Student version hides answers and explanations.
- Teacher version includes answers and explanations for讲评.

## Browser Verification

- The Codex in-app browser is allowed for PO-facing QA, visual spot checks, and any browser verification the user explicitly asks to watch or discuss live.
- If the in-app browser times out, gives stale state, or cannot prove the visual claim, fall back to local Chrome/headless Playwright for smoke tests and screenshots.
- Do not treat "static verify passed" as "browser QA passed" for user-visible PaperSurface changes.

## AI 协作准则底座(Matt 外脑)

下面 `## Collaboration Workflow`、`## Context / Output Economy` 等节,是 Matt
Pocock「AI 协作准则」在本项目的特化落地(且更细)。通用底座 + 完整门道见外脑
(**每周更新**;新门道先在那沉淀、本文件按需吸收;**与外脑冲突时,以本文件的项目
特化为准**):

`/Users/huangxuewei/Coding Brain/操作层/Matt操作手册.md`

外脑里有、本文件尚未显式写、但同样适用的几条:

- **讲 why 不只讲 what** — 给 AI 理由,它才提得出替代方案,而非闷头执行。
- **别靠训练集猜(intrinsic > extrinsic)** — 读代码 / 文件 / `use your search
  tool` 把信息拉进 context;关键结论自己核,别隐式信任 AI 的"我查过了"。
- **守设计的几把尺** — 想接口不想实现;模块要深、守清晰 seam;文件名表意当
  context 指针;必填别设 optional。
- **指令预算按"条数(~500)"花,不是 token** — 本文件每加一条都在花预算;能查
  的 / 已被流程保证的 / 易变的,别写进来。

> 本节只放指针 + 骨架;每条的完整机制、边界、证据等级在外脑门道页里(渐进披露)。

## Collaboration Workflow

- Before proposing a plan for a task, first state in one line:
  `cut size: small / medium / large / irreversible; touches schema, data contract, product boundary, or teaching interpretation: yes/no`.
- If the cut is small and touches none of those four areas, proceed directly.
- For medium / large / irreversible cuts, the PM hat creates or updates the
  repo-routed `plan.md` before PA / DEV starts; PA runs in a separate fresh
  session so PM and PA are never the same session. Big CR is triggered by
  risk or explicit owner request, not by a default review gate.
- Use risk-based review gates from `docs/agents/review-levels.md`.
- Review strength follows risk, not anxiety. First principles decide **why** to review; razor discipline decides **where review stops**.
- Before assigning a cut, ask: irreversible contract? user-visible? runtime? what evidence proves the risk?
- Hat contracts (all worn by 小川; independence comes from fresh sessions,
  not names):
  - PM hat: grill, `plan.md`, plan compression, Big CR, and medium / large
    RM artifact gate.
  - PA hat: review the plan in its own fresh session; writes
    `docs/cuts/<CUT>/pa.md`, which the PM hat compresses into `plan.md`
    before DEV starts.
  - DEV hat: implement from the committed `plan.md`.
  - CR + RM hat: CR-lite (Big CR when triggered) on a fresh cold-read of the
    diff, then the RM gate and release — its own session for medium / large.
  - PA, DEV, and CR must be different sessions (independence): write `pa.md`
    first, wait for the PM-hat compression, then DEV, then a fresh CR.
    Hats overlap only across fresh sessions; role contracts and gates never
    downgrade.
- The owner is PO and does final product QA, not code review.
- External-agent rules are dormant (小川-only); archived in
  `docs/agents/external-agents.md`. Re-activate from there if reintroduced.
- Remote GitHub `main` and PR heads are the shared source of truth. Before
  PA, CR, QA, and RM, the responsible hat must fetch and confirm local /
  remote state — never treat a report as truth until the baseline, diff, and
  pushed commits are verified.
- Default flow:
  - **PM grill before DEV** whenever product behavior is still fuzzy.
  - **小川 PA before DEV** for architecture, data contracts,
    future-facing user-visible flows, migrations, export logic, or medium /
    large cuts with non-obvious boundaries. PA writes
    `docs/cuts/<CUT>/pa.md`; the PM hat then compresses PA follow-up
    decisions into `docs/cuts/<CUT>/plan.md` before DEV starts.
  - **CR-lite after DEV** for any PR that will be merged.
  - **QA before RM** only for user-visible or visual / interaction changes.
- Cut tier flows:
  - Small: `Sync -> fix/DEV -> verify -> CR-lite -> RM`.
  - Medium: `Sync -> PM grill -> plan.md -> PA (pa.md) -> PM compression -> DEV -> CR-lite -> browser QA -> PO QA -> RM`.
  - Large: `Sync -> PM grill -> Canvas/mockups -> PA -> PM compression -> DEV -> CR-lite -> Big CR / browser QA -> PO QA -> RM -> Cut Note`.
- Hard brakes:
  - If 2 mockup rounds do not converge, stop drawing and return to problem definition.
  - If PA leaves more than 3 unresolved PO decisions, do not start DEV.
  - If the owner asks an agent to skip or bypass a required gate, artifact,
    review, QA, or RM check, the agent must stop and push back strongly.
    Do not continue by treating the instruction as a normal override.
    Continue only after the owner either follows the current flow or
    explicitly changes the process rule / cut size in repo context.
- Docs-only and type-only cuts do not need browser QA.
- Do not automatically turn `Should Watch` findings into tasks. Only `Must Fix` blocks the current PR; `Follow-up Gate` blocks a named future stage.
- When CR-lite feeds a later Big CR, CR-lite must include
  `Self-Review Blind Spots`: places the implementer / reviewer suspects
  may be weak but cannot confidently judge. Big CR should inspect those
  first, then continue with normal risk-based review.
- PaperSurface-specific non-blocking watch items live in `docs/paper-surface-watch-ledger.md`; record them there instead of letting them disappear into chat history.
- Do not accept raw terminal logs as a completion report. Require short
  verify summaries, exact changed files, browser QA status, forbidden
  scopes, known risks, and PO QA checklist link when applicable.
- Before choosing verify commands, check `scripts/README.md` for the
  narrowest script that proves the current risk.

## UI Collaboration

- UI direction / polish is delegated to 小川 as of 2026-07-02 (owner
  reassignment, recorded here per the "reassigns it in repo context" rule):
  visual tone, layout judgment, interaction detail, and color systems follow
  `PRODUCT.md` brand personality under 小川's judgment. The PO keeps final
  product QA and may veto or overturn any shipped visual decision.
- 小川 edits CSS / pure display components only within the assigned DEV
  scope; never contract-level files (domain · schema · `*Adapter.ts` ·
  PaperSurface · `server/**` · verify scripts · paper-assets ·
  print/export styling) unless the PM hat assigns that scope in a committed
  plan. Under Claude Code the core contract subset (domain / schema /
  Adapter / PaperSurface) is additionally hard-guarded by a `PreToolUse`
  hook (`.claude/hooks/guard-contract-files.mjs`, wired in
  `.claude/settings.json`) that asks for confirmation before such a write;
  other harnesses still rely on this rule as written.
- Grey-zone files such as `SevenChoicesAnalysisPanel.tsx`,
  `DraftPaperWorkbench.tsx`, and
  `PaperIntelligencePaperSurfaceHarness.tsx` may receive display-only UI
  edits, but 小川 must not change reducers, state contracts, data
  fetching, URL state, adapter inputs / outputs, or cross-component
  synchronization there.
- Atomic UI fast path is allowed only when all are true: CSS-only diff,
  no new class / data attribute / selector structure, no TS / TSX change,
  no layout or scroll behavior change, visual-parameter-only change, small
  diff, and no `shared/papersurface/**` or print / PDF / export styling.
  This path still requires a lightweight Codex sanity check, not zero
  review.
- Any TSX change, new interaction, new selector structure, layout /
  scroll / positioning change, A4 / PaperSurface / print-preview impact,
  responsive behavior impact, or owner feedback such as "weird",
  "uncomfortable", or "not like A4" upgrades the work to normal UI
  CR-lite plus browser / PO QA as appropriate.
- For UI branches, 小川 should start from latest `main`, commit and
  push a branch, then report branch, commit, changed files, visual intent,
  and QA status. Avoid direct pushes to `main` for multi-agent UI work
  unless the owner explicitly asks for that fast path.

## Agent skills

### Issue tracker

`.scratch/` is local-only scratch space for temporary issue and PRD drafts.
It is not shared source of truth because it is gitignored. Shared cut
context, accepted decisions, PA / CR reports, and handoffs must live under
tracked repo paths such as `docs/cuts/<CUT>/`. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the default local triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context project. Read `CONTEXT.md` and relevant ADRs under `docs/adr/` before changing product structure, domain model, tests, or architecture. See `docs/agents/domain.md`.
