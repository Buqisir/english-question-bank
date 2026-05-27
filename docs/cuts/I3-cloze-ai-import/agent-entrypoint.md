# Agent Entrypoint — I3-A Cloze AI Import

Cut: I3-cloze-ai-import
Stage: PM grill locked; waiting for PA
Owner: 阿澈 PM / plan compression; 小川 PA then DEV / CR-lite / RM
Date: 2026-05-27

## Current Objective

Route the next agent to review the I3-A plan for 完形填空 AI 导题接入. The cut is
limited to parsing, packaging, publishing, and visual QA access for standard
q41-q55 cloze sections in the existing `paper-import-ai` flow. It does not add
cloze teaching analysis.

## Prerequisites (check before acting)

Run these checks before reading or writing the next artifact:

- `docs/cuts/I3-cloze-ai-import/plan.md` must exist and be non-empty.
- Before DEV starts, `docs/cuts/I3-cloze-ai-import/plan.md` must already be
  committed to the repo.
- Before DEV starts, search project Kratos from the repo root with 2-3 relevant
  keywords, for example `kratos-memory search "I3 cloze paper-import-ai 完形"`.
  Record only useful hits in the DEV report. If no relevant hits appear, say
  `Kratos: no relevant hits`.
- Kratos is context, not truth. Current repo files, `main`, PR diff, and cut
  artifacts remain authoritative.
- PA must write `docs/cuts/I3-cloze-ai-import/pa.md` before DEV starts.
- After PA, 阿澈 must compress accepted PA findings back into
  `docs/cuts/I3-cloze-ai-import/plan.md` before DEV starts.

If a required prerequisite is missing, stop and reply:

```text
ESCALATION: CONTEXT INSUFFICIENT — required prerequisite missing or empty: <path>
```

## Must Read

Keep this list cut-specific and at most 5 files.

- `docs/cuts/I3-cloze-ai-import/plan.md`
- `docs/product/paper-asset-v1.md`
- `server/paper-import-ai/docxSplitter.mjs`
- `server/paper-import-ai/packageBuilder.mjs`
- `server/paper-import/publisher.mjs`

## Background

Skim only if unfamiliar or not already loaded in this session.

- `AGENTS.md`
- `docs/steering/cut-workflow-protocol.md`
- `docs/steering/product-scope-discipline.md`
- `docs/agents/review-levels.md`
- `docs/agents/pa-persona.md` when the next stage is PA
- `scripts/README.md`

## Source Of Truth

- Branch: `codex/i3-cloze-ai-import-plan`
- Base commit: `f89bda1 docs(workflow): split PM and PA ownership (#145)`
- PR: TBD
- Latest accepted artifact: `docs/cuts/I3-cloze-ai-import/plan.md`

## Goal / PR Split

- Goal: complete I3-A PM artifact so 小川 can PA the cloze import plan.
- Current PR slice: docs-only PM plan and agent entrypoint.
- Explicitly not in this PR: runtime DEV, cloze AI analysis, grammar-cloze,
  schema changes, PaperSurface redesign, search/list optimization.

## Allowed Scope

- `docs/cuts/I3-cloze-ai-import/plan.md`
- `docs/cuts/I3-cloze-ai-import/agent-entrypoint.md`
- `docs/cuts/I3-cloze-ai-import/pa.md` for the PA stage
- Runtime files listed in `plan.md` only after PA and PM compression finish

## Forbidden Scope

- `schemas/**`
- Cloze AI analysis prompt / schema / contract / panel
- Grammar-cloze / 语法填空 import
- `shared/papersurface/**` unless PA proves existing renderer cannot display
  existing cloze group data
- Search/list metadata expansion
- Generated `app/public/paper-assets/**` runtime outputs

## Output Required

Write the next artifact to:

```text
docs/cuts/I3-cloze-ai-import/pa.md
```

Standard artifact paths:

- PM plan / PM compression: `docs/cuts/I3-cloze-ai-import/plan.md`
- PA report: `docs/cuts/I3-cloze-ai-import/pa.md`
- Formal CR / Big CR report: `docs/cuts/I3-cloze-ai-import/cr.md`
- Cross-session handoff: `docs/cuts/I3-cloze-ai-import/handoff.md`

Worktree check for external agents:

- Target repo root: `/Users/huangxuewei/Projects/english-question-bank`
- Target branch / PR: `codex/i3-cloze-ai-import-plan`
- Target absolute path:
  `/Users/huangxuewei/Projects/english-question-bank/docs/cuts/I3-cloze-ai-import/pa.md`
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

Chat reply format after writing the repo file:

- report path
- verdict / status
- Must Fix count, if any
- Open PO Decisions count, if any
