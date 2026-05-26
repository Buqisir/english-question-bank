# Agent Entrypoint — I2 Seven Choices AI Import

Cut: I2-seven-choices-ai-import
Stage: PM locked; plan ready for DEV after commit
Owner: 阿澈 PM / PA; 小川 DEV by default, 阿澈 may cover DEV if needed
Date: 2026-05-27

## Current Objective

Extend the existing `paper-import-ai` flow so one click can analyze Reading A-D
and one standard 高考七选五 section together, then publish them into the same
paper asset with existing PaperSurface 七选五 availability. This is a chain
completion cut, not a 七选五 schema, prompt-quality, or UI redesign cut.

## Prerequisites

- `docs/cuts/I2-seven-choices-ai-import/plan.md` must exist and be committed
  before DEV starts.
- Before DEV starts, search project Kratos from the repo root with:
  `kratos-memory search "I2 seven choices AI import paper-import-ai"`.
- Kratos is context, not truth. Current repo files, `main`, PR diff, and this
  cut plan remain authoritative.

## Must Read

- `docs/cuts/I2-seven-choices-ai-import/plan.md`
- `docs/cuts/I0-seven-choices-analysis-prompt/handoff.md`
- `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md`
- `prompts/seven-choices-analysis-v1.md`
- `server/paper-import-ai/packageBuilder.mjs`

## Background

Skim only if unfamiliar or not already loaded in this session.

- `AGENTS.md`
- `docs/steering/cut-workflow-protocol.md`
- `docs/steering/product-scope-discipline.md`
- `docs/agents/review-levels.md`
- `scripts/README.md`

## Source Of Truth

- Branch: `codex/i2-seven-choices-ai-import-plan`
- Base commit: `218a81e`
- PR: not opened yet
- Latest accepted artifact: `docs/cuts/I2-seven-choices-ai-import/plan.md`

## Goal / PR Split

- Goal: one AI import action can handle Reading A-D plus one 七选五 group.
- Current PR slice: plan-only PM / PA artifact.
- DEV PR slice: runtime implementation and verifier for I2.
- Explicitly not in this PR: schema redesign, prompt-quality re-review,
  PaperSurface redesign, cloze import, grammar-cloze import.

## Allowed Scope

- `docs/cuts/I2-seven-choices-ai-import/**`
- `server/paper-import-ai/docxSplitter.mjs`
- `server/paper-import-ai/analyzeReading.mjs`
- `server/paper-import-ai/analyzeSevenChoices.mjs`
- `server/paper-import-ai/packageBuilder.mjs`
- `server/paper-import-ai/routes.mjs`
- `app/src/features/paper-import-ai/**`
- `app/src/services/paperImportAi.ts`
- `scripts/verify-i2-seven-choices-ai-import.mjs`
- existing I1 verifier scripts when only adding I2 assertions
- `scripts/README.md`

## Forbidden Scope

- Do not change `schemas/**`.
- Do not change `shared/papersurface/**`.
- Do not change the seven-choices analysis contract.
- Do not change `prompts/seven-choices-analysis-v1.md` unless a real sample
  exposes a hard generation failure that cannot be solved in the builder.
- Do not implement cloze or grammar-cloze import.
- Do not redesign PaperSurface 七选五 UI or A-G option interaction.
- Do not add search / topic-label storage expansion.

## Output Required

For DEV, open a PR whose description includes:

- exact changed files
- verify commands and pass/fail counts
- browser QA status for `?view=paper-import-ai`
- real-paper QA sample used
- forbidden-scope confirmation
- PO QA checklist link or route

Routine CR-lite may live in the PR description or final summary. Formal Big CR
uses `docs/cuts/I2-seven-choices-ai-import/cr.md` only if triggered by risk.

