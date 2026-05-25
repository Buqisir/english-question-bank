# Agent Instructions

This repo builds the local-first English question bank workbench.

`AGENTS.md` is the single source of truth for agent rules in this repo.
Other agent entry files, including `CLAUDE.md`, should point here instead
of duplicating workflow or browser rules.

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
- For product / engineering cuts, follow
  `docs/steering/cut-workflow-protocol.md`: pick small / medium /
  large process by risk, sync first, and avoid turning small fixes into
  process rituals or large cuts into rushed DEV work.
- Medium / large cuts use repo-routed context, not chat-only context:
  create or update `docs/cuts/<CUT>/agent-entrypoint.md`, use
  `docs/cuts/_templates/` when starting a cut, and keep handoff / Cut
  Note records there when the cut pauses or lands.
- Hard rule: substantive multi-agent context must live in repo files,
  not in chat. For new medium / large cuts, use the artifact naming
  rules in `docs/cuts/_templates/README.md`. Chat messages should only
  route agents to those files and state the next action. Do not depend
  on copy/pasted long chat history as the source of truth.
- Use prompt templates for external PA and Big CR instead of rewriting
  boilerplate by hand:
  `docs/cuts/_templates/pa-prompt-template.md` and
  `docs/cuts/_templates/big-cr-prompt-template.md`.
- Cut artifact naming is intentionally simple for new cuts:
  `goal.md` for the DEV execution contract, `pa.md` for formal PA,
  `cr.md` for formal CR / Big CR, optional `pa-prompt.md` /
  `cr-prompt.md` only when a prompt must be archived, and
  `cut-note.md` for large-cut closeout. Do not rename historical cut
  artifacts only to match this convention.
- Small cuts should not create `docs/cuts/<CUT>/` ceremony. Medium cuts
  require a committed `goal.md` before DEV. Large cuts require committed
  `goal.md`, formal PA / CR records as applicable, and `cut-note.md`
  before closeout.
- Cut decision ledgers should expose freshness. New `decisions.md`
  files should include `Last synced` and
  `Open items from external review`, and external PA / Big CR follow-up
  must update those fields before another agent depends on the file.
- Agent entrypoints should split reading into `Must Read` and
  `Background`. Keep Must Read cut-specific and short; Background may
  be skipped when already loaded in the same session.
- External PA / Big CR agents may stop with an escalation signal instead
  of writing a partial report: `CONTEXT INSUFFICIENT`,
  `BRANCH CONFLICT`, `SPEC CONTRADICTS`, or `SCOPE UNCLEAR`.
- For PaperSurface specifically, insight should default to a short
  passage map. Dense diagnostics such as vocabulary load, grammar load,
  evidence difficulty, dot/bar systems, long key-chunk lists, or AI
  difficulty dashboards need a separate task justification and usually
  belong outside the A4 paper page.

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

## Collaboration Workflow

- Before proposing a plan for a task, first state in one line:
  `cut size: small / medium / large / irreversible; touches schema, data contract, product boundary, or teaching interpretation: yes/no`.
- If the cut is small and touches none of those four areas, proceed directly.
- Otherwise ask: "Should we consult Claude first, or proceed to plan?"
  Wait for the owner's answer before proceeding.
- Use risk-based review gates from `docs/agents/review-levels.md`.
- Review strength follows risk, not anxiety. First principles decide **why** to review; razor discipline decides **where review stops**.
- Before assigning a cut, ask: irreversible contract? user-visible? runtime? what evidence proves the risk?
- Default operating model: Codex is the daily PM / DEV / CR-lite / QA /
  RM agent. The owner is PO and does final product QA, not code review.
- External high-reasoning agents are reserved for large-cut PA,
  direction checks, and occasional big CR. Do not route routine small or
  medium implementation work through external DEV agents unless the
  owner explicitly asks for that exception.
- External PA must read and follow `docs/agents/pa-persona.md` before
  reviewing a plan. Its job is to find direction, boundary, data-contract,
  and rework risks before Codex DEV starts.
- Remote GitHub `main` and PR heads are the shared source of truth.
  Codex must fetch and confirm local / remote state before PA, CR, QA,
  and RM. External PA / CR reports are useful input, not truth, until
  Codex verifies the baseline, diff, and pushed commits.
- Default flow:
  - **PM grill before DEV** whenever product behavior is still fuzzy.
  - **PA before DEV** only for architecture, data contracts, future-facing user-visible flows, migrations, export logic, or other large cuts.
  - **Codex CR-lite after DEV** for any PR that will be merged.
  - **QA before RM** only for user-visible or visual / interaction changes.
- Cut tier flows:
  - Small: `Sync -> fix/DEV -> verify -> CR-lite -> RM`.
  - Medium: `Sync -> quick PM grill -> DEV -> CR -> browser QA -> PO QA -> RM`.
  - Large: `Sync -> PM grill -> Canvas/mockups -> Big PA -> PM compression -> Codex DEV -> Codex CR -> Codex browser QA -> PO QA -> RM -> Cut Note`.
- Hard brakes:
  - If 2 mockup rounds do not converge, stop drawing and return to problem definition.
  - If PA leaves more than 3 unresolved PO decisions, do not start DEV.
- Docs-only and type-only cuts do not need browser QA.
- Do not automatically turn `Should Watch` findings into tasks. Only `Must Fix` blocks the current PR; `Follow-up Gate` blocks a named future stage.
- PaperSurface-specific non-blocking watch items live in `docs/paper-surface-watch-ledger.md`; record them there instead of letting them disappear into chat history.
- Historical external-agent handoff rules are no longer the default
  workflow. Only use external DEV prompts when the owner explicitly
  asks. In that exception, put the entire prompt in a repo file or a
  fenced chat block, and require the report shape from
  `docs/agents/dev-completion-report-template.md` and `docs/steering/dev-completion-protocol.md`.
- Do not accept raw terminal logs as a completion report. Require short
  verify summaries, exact changed files, browser QA status, forbidden
  scopes, known risks, and PO QA checklist link when applicable.
- Before choosing verify commands, check `scripts/README.md` for the
  narrowest script that proves the current risk.

## UI Collaboration

- Claude may own UI polish work for CSS, visual styling, interaction
  details, color systems, and small display-layer changes. Codex remains
  owner for server logic, data layers, APIs, adapters, harness state
  contracts, verification scripts, schemas, and medium / large cut
  planning.
- Claude may directly edit CSS and pure display-component code, but must
  not touch `server/**`, `scripts/verify-*`, `app/src/domain/**`,
  `schemas/**`, `app/public/paper-assets/**`, `*Adapter.ts`,
  `shared/papersurface/**`, or print / PDF / export styling unless Codex
  explicitly assigns that scope in a committed goal.
- Grey-zone files such as `SevenChoicesAnalysisPanel.tsx`,
  `DraftPaperWorkbench.tsx`, and
  `PaperIntelligencePaperSurfaceHarness.tsx` may receive display-only UI
  edits, but Claude must not change reducers, state contracts, data
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
- For UI branches, Claude should start from latest `main`, commit and
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
