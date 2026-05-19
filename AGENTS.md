# Agent Instructions

This repo builds the local-first English question bank workbench.

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
  `.kiro/steering/README.md` and the relevant steering note before
  giving advice or assigning implementation.
- Product-scope discipline is mandatory. Before adding or preserving
  visible AI-derived information, ask which teacher task it serves.
  Do not accept "we have the data" as a reason to show the data.
- Push back directly when a feature risks turning a focused teacher
  workbench into an AI dashboard. A useful feature may still belong in
  a different workflow, backlog, or future cut.
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

- Do not use the Codex in-app browser for this project for now; it has been timing out on local UI checks.
- Use local Chrome/headless Playwright for UI smoke tests and screenshots.

## Collaboration Workflow

- Use risk-based review gates from `docs/agents/review-levels.md`.
- Review strength follows risk, not anxiety. First principles decide **why** to review; razor discipline decides **where review stops**.
- Before assigning a cut, ask: irreversible contract? user-visible? runtime? what evidence proves the risk?
- Default flow:
  - **PA before DEV** for architecture, runtime modules, user-visible flows, data models, migrations, and export logic.
  - **CR after DEV** for any PR that will be merged.
  - **QA before RM** only for user-visible or visual / interaction changes.
- Docs-only and type-only cuts do not need browser QA.
- Do not automatically turn `Should Watch` findings into tasks. Only `Must Fix` blocks the current PR; `Follow-up Gate` blocks a named future stage.
- PaperSurface-specific non-blocking watch items live in `docs/paper-surface-watch-ledger.md`; record them there instead of letting them disappear into chat history.
- Use role-coded Kiro handshakes such as `/kiro DEV1`, `/kiro PA`, and `/kiro CR`.
- When giving the PO a prompt to paste into Kiro, put the entire prompt content in fenced code blocks. Do not put explanatory prose between the prompt code blocks.
- Ask Kiro to wrap the entire completion report or review in exactly one fenced `text` code block, with no prose outside the block.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default local triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context project. Read `CONTEXT.md` and relevant ADRs under `docs/adr/` before changing product structure, domain model, tests, or architecture. See `docs/agents/domain.md`.
