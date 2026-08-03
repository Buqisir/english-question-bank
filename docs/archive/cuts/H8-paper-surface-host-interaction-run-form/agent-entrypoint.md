# H8 Agent Entrypoint

Cut: H8 PaperSurface Host Interaction Run-Form
Stage: PR open
Owner: Codex by default
Date: 2026-05-24

## Current Objective

Turn the PaperSurface host-interaction verify from regex-heavy shape
checks into a run-form reducer behavior check. Keep the reducer pure,
keep the harness as the DOM adapter, and keep the scope limited to the
host-interaction seam.

## Must Read

- `AGENTS.md`
- `CONTEXT.md`
- `docs/adr/0003-paper-surface-interaction-model.md`
- `scripts/verify-paper-surface-host-interaction.mjs`
- `app/src/features/paper-intelligence/paperSurfaceHostInteraction.ts`

## Background

Skim only if unfamiliar or not already loaded in this session.

- `scripts/README.md`
- `docs/agents/review-levels.md`
- `docs/cuts/H7-source-truth-verify-gate/cut-note.md`

## Source Of Truth

- Base branch: `github/main`
- Base commit: `1c2626e`
- Current branch: `codex/h8-run-form-verify`
- PR: #117
- Latest accepted artifact: this entrypoint

## Goal / PR Split

- Goal: deepen the host-interaction verify by running reducer behavior
  instead of only regexing switch branches.
- Current PR slice: one scripts / docs / verify PR.
- Explicitly not in this PR: harness UI redesign, PaperSurface runtime
  edits, new shared UI modules, broader test framework migration.

## Allowed Scope

- `scripts/verify-paper-surface-host-interaction.mjs`
- `scripts/README.md`
- `scripts/verify-architecture-housekeeping.mjs`
- `docs/cuts/H8-paper-surface-host-interaction-run-form/**`

## Forbidden Scope

- `app/src/shared-ui/papersurface/**`
- `shared/papersurface/**`
- `server/**`
- `data/**`
- `schemas/**`
- PaperSurface visual behavior
- export / import runtime behavior

## Output Required

Write H8 artifacts to:

```text
docs/cuts/H8-paper-surface-host-interaction-run-form/
```

Expected files:

- `agent-entrypoint.md`
- `decisions.md`
- `dev-notes-h8.md`
- `cr-lite-h8.md`
- `cut-note.md`
- `handoff.md`

## Verify

Minimum:

```bash
node scripts/verify-paper-surface-host-interaction.mjs
node scripts/verify-architecture-housekeeping.mjs
git diff --check
```

If the stable suite is already warmed up in this worktree, run:

```bash
npm run verify:all --prefix app
```

Browser QA is not applicable because this cut changes a verify script
and docs only.
