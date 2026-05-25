# Agent Entrypoint — I0-D Seven Choices PaperSurface Experience

Cut: I0-D 七选五 PaperSurface experience
Stage: PM grill captured; pending Claude lite PA
Owner: PO + Codex PM
Date: 2026-05-25

## Current Objective

Review and prepare the first UI cut for 七选五解析: reuse the PaperSurface
left-article / right-panel frame, render the original passage with blank-chain
highlight overlays, and render A-G as an option pool where correct options
highlight in sync with their active blank chains.

## Must Read

- `docs/cuts/I0-seven-choices-surface/decisions.md`
- `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md`
- `app/public/paper-assets/paper-2024-jslk-english/paper-asset.json`
- `app/public/paper-assets/paper-2024-jslk-english/analyses/seven-choices-analysis-v1.json`
- `docs/cuts/I0-seven-choices-analysis-prompt/decisions.md`

## Background

Skim only if unfamiliar or not already loaded in this session.

- `AGENTS.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `.kiro/steering/product-scope-discipline.md`
- `docs/agents/review-levels.md`
- `docs/agents/pa-persona.md` for external PA only
- `scripts/README.md`

## Source Of Truth

- Branch: `codex/h5-a-post-merge-audit`
- Base: `github/main`
- Latest accepted artifacts:
  - `docs/cuts/I0-facet-taxonomy-foundation/decisions.md`
  - `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md`
  - `prompts/seven-choices-analysis-v1.md`
  - `app/public/paper-assets/paper-2024-jslk-english/analyses/seven-choices-analysis-v1.json`

## Goal / PR Split

- Goal: design and implement the first teacher-facing 七选五 PaperSurface
  experience.
- Current next step: Claude lite PA on I0-D decisions before runtime work.
- Explicitly not in this step: implementation, browser QA, search entry, import
  validation, database schema, PaperSurface shared renderer rewrite.

## Allowed Scope For First DEV Slice

Pending PA, likely allowed:

- `app/src/features/paper-intelligence/**`
- Seven-choices adapter / right panel / host state files, if created.
- CSS local to paper-intelligence / seven-choices surface.
- Verify script for fixture / host contract, if needed.
- Cut docs under `docs/cuts/I0-seven-choices-surface/**`.

## Forbidden Scope For First DEV Slice

- `shared/papersurface/**`, unless PA explicitly approves a narrow exception.
- `app/src/shared-ui/papersurface/PaperSurface.tsx`, unless PA proves host-level
  implementation is impossible.
- Server routes.
- Database schema.
- Import pipeline.
- Search / concierge entry, unless explicitly added as a separate slice.
- Reading-choice behavior changes.

## Output Required For PA

Write the PA report to:

```text
docs/cuts/I0-seven-choices-surface/claude-lite-pa.md
```

Worktree check for external agents:

- Target repo root: `/private/tmp/eqb-i0c-plus`
- Target branch: `codex/h5-a-post-merge-audit`
- Target absolute path:
  `/private/tmp/eqb-i0c-plus/docs/cuts/I0-seven-choices-surface/claude-lite-pa.md`
- Before writing, confirm `pwd`, `git rev-parse --show-toplevel`, and branch.
  If they do not match, stop with `ESCALATION: BRANCH CONFLICT`.
- After writing, confirm the absolute artifact path and `git status --short`
  entry for the file.

Repo-file handoff rule:

- Put substantive PA / CR / DEV / QA / RM context in repo files, not chat.
- Chat should only route agents to this entrypoint and the expected output path.
- If a material decision was made in chat, copy it into `decisions.md`,
  `pm-spec.md`, `handoff.md`, or this entrypoint before the next agent acts.
