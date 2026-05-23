# H3 Agent Entrypoint

Cut: H3 Frontend Component Slimming
Stage: Goal ready. Implementation not started.
Owner: Codex by default
Date: 2026-05-23

## Current Objective

Slim large frontend workbench / harness files by extracting deeper
feature-local modules with small interfaces, while preserving behavior exactly.

## Required Reading

- `AGENTS.md`
- `CONTEXT.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `docs/cuts/H2-workflow-verify-ci-discipline/handoff.md`
- `docs/cuts/H3-frontend-component-slimming/goal-h3-frontend-component-slimming.md`
- `docs/adr/0006-draft-paper-as-distinct-entity.md`
- `docs/adr/0003-paper-surface-interaction-model.md`
- `scripts/README.md`

## Source Of Truth

- Base branch: `main`
- Current goal artifact:
  `docs/cuts/H3-frontend-component-slimming/goal-h3-frontend-component-slimming.md`
- H2 closeout:
  `docs/cuts/H2-workflow-verify-ci-discipline/handoff.md`

## Recommended First Slice

Start with H3-A:

```text
Draft Paper Preview / Export Locality
```

Reason:

- Draft Paper is the current active product line.
- `DraftPaperWorkbench.tsx` has a clear extraction target:
  `buildA4PreviewHtml`.
- Recent C8 QA locked the A4 preview behavior, so extraction can be
  behavior-preserving.
- PaperSurface harness slimming is larger and should come after one safer
  Draft Paper slice.

## Allowed Scope

- feature-local frontend files under `app/src/features/draft-paper/`
- feature-local frontend files under `app/src/features/paper-intelligence/`
- narrow verify scripts proving behavior-preserving extraction
- H3 cut docs

## Forbidden Scope

- product feature changes
- visible redesign
- server API behavior
- database schema / migrations
- print renderer behavior
- `shared/papersurface/**`
- PaperSurface renderer internals
- paper data / paper assets / reading analysis data

## Output Required

For each H3 phase, write material artifacts into:

```text
docs/cuts/H3-frontend-component-slimming/
```

Examples:

- `dev-notes-h3-a.md`
- `cr-lite-h3-a.md`
- `handoff.md`
- `cut-note.md`

Repo-file handoff rule:

- Put substantive PM / DEV / CR / QA / RM context in repo files, not chat.
- Chat should only route agents to this entrypoint and the expected output path.
- If a material decision is made in chat, copy it into a repo file before the
  next agent acts.

## Reply Format For External Agents

Reply with only:

- report path
- verdict / status
- Must Fix count, if any
- Open PO Decisions count, if any
