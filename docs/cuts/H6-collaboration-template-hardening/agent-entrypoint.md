# H6 Agent Entrypoint

Cut: H6 Collaboration Template Hardening
Stage: DEV in progress
Owner: Codex by default
Date: 2026-05-23

## Current Objective

Accept the external collaboration-system critique by turning repeated
PA / Big CR / decision / handoff process into repo templates and
verifiable guardrails. This is a docs / process / verify cut, not a
product or runtime cut.

## Must Read

- `AGENTS.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `docs/agents/pa-persona.md`
- `docs/cuts/_templates/agent-entrypoint.md`
- `scripts/verify-architecture-housekeeping.mjs`

## Background

Skim only if unfamiliar or not already loaded in this session.

- `.kiro/steering/README.md`
- `docs/agents/review-levels.md`
- `docs/cuts/H2-workflow-verify-ci-discipline/cut-note.md`

## Source Of Truth

- Base branch: `github/main`
- Base commit: `cdc13c9`
- Current branch: `codex/h6-collaboration-template-hardening`
- Latest accepted artifact: this entrypoint

## Goal / PR Split

- Goal: harden collaboration templates and process rules.
- Current PR slice: one docs / templates / verifier PR.
- Explicitly not in this PR: H3-B Draft Paper extraction, app runtime,
  server runtime, schema, CI workflow installation.

## Allowed Scope

- `AGENTS.md`
- `.kiro/steering/README.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `docs/agents/pa-persona.md`
- `docs/cuts/_templates/**`
- `docs/cuts/H6-collaboration-template-hardening/**`
- `scripts/verify-architecture-housekeeping.mjs`

## Forbidden Scope

- `app/**`
- `server/**`
- `data/**`
- `schemas/**`
- paper assets / analysis JSON
- print renderer / PDF behavior
- PaperSurface renderer
- product UI behavior

## Output Required

Write H6 artifacts to:

```text
docs/cuts/H6-collaboration-template-hardening/
```

Expected files:

- `agent-entrypoint.md`
- `dev-notes-h6.md`
- `cr-lite-h6.md`

## Verify

Minimum:

```bash
node scripts/verify-architecture-housekeeping.mjs
git diff --check
```

`npm run verify:all --prefix app` is useful if the architecture verify
changes need stable-suite confirmation. Browser QA is not applicable;
this cut changes docs / process / verify only.
