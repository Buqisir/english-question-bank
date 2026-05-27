# Agent Entrypoint — I5-A Writing AI Import

Cut: I5-writing-ai-import
Stage: PA complete; PM compression ready for DEV
Owner: 阿澈 PM / plan compression; 小川 PA then DEV / CR-lite / RM
Date: 2026-05-27

## Current Objective

Route 小川 to DEV the I5-A plan for writing AI import after PA Must Fix items
were compressed back into `plan.md`. The cut is limited to recognizing,
packaging, publishing, and rendering plain A4 QA links for 应用文写作 and
读后续写 in the existing `paper-import-ai` flow. It does not add writing AI
analysis,范文,评分, search/list behavior, or writing teaching workflows.

## Prerequisites (check before acting)

Run these checks before reading or writing the next artifact:

- `docs/cuts/I5-writing-ai-import/plan.md` must exist and be non-empty.
- `docs/cuts/I5-writing-ai-import/pa.md` must exist and be non-empty.
- Before DEV starts, `docs/cuts/I5-writing-ai-import/plan.md` must already be
  committed to the repo.
- Before DEV starts, search project Kratos from the repo root with 2-3 relevant
  keywords, for example `kratos-memory search "writing paper-import-ai answerBox"`.
  Record only useful hits in the DEV report. If no relevant hits appear, say
  `Kratos: no relevant hits`.
- Kratos is context, not truth. Current repo files, `main`, PR diff, and cut
  artifacts remain authoritative.
- PA Must Fix items must be closed in the `PA Follow-Up Decisions` table in
  `plan.md` before DEV starts.

If a required prerequisite is missing, stop and reply:

```text
ESCALATION: CONTEXT INSUFFICIENT — required prerequisite missing or empty: <path>
```

## Must Read

Keep this list cut-specific and at most 5 files.

- `docs/cuts/I5-writing-ai-import/plan.md`
- `docs/cuts/I5-writing-ai-import/pa.md`
- `docs/product/exam-paper-format-standards.md`
- `docs/product/exam-paper-format-reference/README.md`
- `app/src/domain/paperAsset.ts`
- `server/paper-import-ai/packageBuilder.mjs`

## Background

Skim only if unfamiliar or not already loaded in this session.

- `AGENTS.md`
- `docs/steering/cut-workflow-protocol.md`
- `docs/product/paper-asset-v1.md`
- `server/paper-import-ai/docxSplitter.mjs`
- `server/paper-import/publisher.mjs`
- `docs/agents/review-levels.md`
- `docs/agents/pa-persona.md` when the next stage is PA
- `scripts/README.md`

## Source Of Truth

- Branch: `codex/i5-writing-ai-import-plan`
- Base commit: `274c25f Merge pull request #151 from Buqisir/codex/i4-grammar-fill-ai-import`
- PR: https://github.com/Buqisir/english-question-bank/pull/152
- Latest accepted artifacts:
  - `docs/cuts/I5-writing-ai-import/plan.md`
  - `docs/cuts/I5-writing-ai-import/pa.md`

## Goal / PR Split

- Goal: complete I5-A DEV from the PA-compressed plan.
- Current PR slice: docs-only PM plan, PA report, and PM compression.
- Explicitly not in this PR: runtime DEV, writing AI analysis,范文 /评分 parsing,
  search/list optimization, schema changes, and PaperSurface redesign.

## Allowed Scope

- `docs/cuts/I5-writing-ai-import/plan.md`
- `docs/cuts/I5-writing-ai-import/agent-entrypoint.md`
- `docs/cuts/I5-writing-ai-import/pa.md` for the PA stage
- Runtime files listed in `plan.md` only after PA and PM compression finish

## Forbidden Scope

- Writing AI analysis,范文 generation, scoring, rubric parsing, continuation plot
  analysis
- `schemas/**` unless PA explicitly approves a model gap
- `shared/papersurface/**` unless PA approves minimal answerBox support
- Generated `app/public/paper-assets/**`
- Search/list metadata expansion
- Print / PDF redesign

## Output Required

After DEV, write the completion summary in the PR and add a short repo-routed
handoff only if the cut pauses:

```text
docs/cuts/I5-writing-ai-import/handoff.md
```

Standard artifact paths:

- PM plan / PM compression: `docs/cuts/I5-writing-ai-import/plan.md`
- PA report: `docs/cuts/I5-writing-ai-import/pa.md`
- Formal CR / Big CR report: `docs/cuts/I5-writing-ai-import/cr.md`
- Cross-session handoff: `docs/cuts/I5-writing-ai-import/handoff.md`

Worktree check for external agents:

- Target repo root: `/Users/huangxuewei/Projects/english-question-bank`
- Target branch / PR: `codex/i5-writing-ai-import-plan` / PR #152
- Target cut path:
  `/Users/huangxuewei/Projects/english-question-bank/docs/cuts/I5-writing-ai-import/`
- Before writing, confirm `pwd`, `git rev-parse --show-toplevel`, and branch.
  If they do not match the target repo root and target branch / PR, stop with
  `ESCALATION: BRANCH CONFLICT`.
- After writing, confirm the absolute artifact path and `git status --short`
  entry for the file.

Repo-file handoff rule:

- Put substantive PA / CR / DEV / QA / RM context in repo files, not chat.
- Chat should only route agents to this entrypoint and the expected output path.
- If a material decision was made in chat, copy it into `plan.md`, `pa.md`,
  `cr.md`, `handoff.md`, or this entrypoint before the next agent acts.

Escalation signals:

- `CONTEXT INSUFFICIENT` — required reading file missing, empty, or unreadable.
- `BRANCH CONFLICT` — target branch / PR cannot be inspected because of local
  worktree or checkout state.
- `SPEC CONTRADICTS` — PM spec, decisions, ADR, or entrypoint disagree on a key
  point.
- `SCOPE UNCLEAR` — task asks a question the spec does not answer.

Reply with `ESCALATION: <SIGNAL> — <one sentence explanation>` before writing a
partial artifact.

Chat reply format after DEV:

- branch / commit
- changed files
- verify summary
- browser QA status
- known risks / PO QA checklist
