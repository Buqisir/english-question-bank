# H7 Agent Entrypoint

Cut: H7 Source Truth + Verify Gate
Stage: DEV in progress
Owner: Codex by default
Date: 2026-05-23

## Current Objective

Accept the latest external critique where the fix is low-risk process /
quality infrastructure: remove duplicated agent rules, clarify local
scratch issue tracking, and make the stable verify gate run app
build/typecheck. This cut does not split `server/api.mjs` or add runtime
schemas; those are larger follow-up engineering cuts.

## Must Read

- `AGENTS.md`
- `CLAUDE.md`
- `docs/agents/issue-tracker.md`
- `scripts/verify-ci.mjs`
- `docs/ci/verify-workflow-template.yml`

## Background

Skim only if unfamiliar or not already loaded in this session.

- `CONTEXT.md`
- `docs/adr/0002-local-first-sqlite-v0.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `scripts/README.md`
- `docs/cuts/H6-collaboration-template-hardening/cut-note.md`

## Source Of Truth

- Base branch: `github/main`
- Base commit: `63be1e9`
- Current branch: `codex/h7-source-truth-verify-gate`
- Latest accepted artifact: this entrypoint

## Goal / PR Split

- Goal: reduce process contradiction and make build/typecheck part of
  the stable local / future CI gate.
- Current PR slice: one docs / verify PR.
- Explicitly not in this PR: `server/api.mjs` route splitting,
  runtime JSON schema validation, replacing grep-style cut scripts,
  frontend component slimming, product UI behavior.

## Allowed Scope

- `AGENTS.md`
- `CLAUDE.md`
- `docs/agents/issue-tracker.md`
- `docs/code-style.md`
- `docs/ci/verify-workflow-template.yml`
- `docs/cuts/H7-source-truth-verify-gate/**`
- `scripts/README.md`
- `scripts/verify-ci.mjs`
- `scripts/verify-architecture-housekeeping.mjs`

## Forbidden Scope

- `app/src/**`
- `server/**`
- `data/**`
- `schemas/**`
- paper assets / analysis JSON
- PaperSurface renderer
- Draft Paper runtime behavior
- import / export behavior

## Output Required

Write H7 artifacts to:

```text
docs/cuts/H7-source-truth-verify-gate/
```

Expected files:

- `agent-entrypoint.md`
- `decisions.md`
- `dev-notes-h7.md`
- `cr-lite-h7.md`
- `cut-note.md`
- `handoff.md`

## Verify

Minimum:

```bash
node scripts/verify-architecture-housekeeping.mjs
npm run verify:all --prefix app
git diff --check
```

Clean worktree prerequisite:

```bash
pnpm install --frozen-lockfile
npm ci --prefix server
```

Browser QA is not applicable because this cut changes docs / process /
verify only.
