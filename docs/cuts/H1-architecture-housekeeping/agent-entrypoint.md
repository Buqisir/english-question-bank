# H1 Agent Entrypoint

Cut: H1 Architecture Housekeeping / server surface extraction
Stage: CLOSED at H1-G; do not create H1-H
Owner: Codex PM / DEV / CR-lite / QA / RM; PO does final approval
Date: 2026-05-23

## Current Objective

H1 reduces the review and maintenance cost of `server/api.mjs` by extracting
large server surfaces into owned modules behind a minimal route registry. H1 is
not a product cut. It must preserve API behavior while making future PRs easier
to review.

H1 is now closed. Future housekeeping should be routed through
`handoff.md` rather than adding more H1 implementation slices.

## Required Reading

- `AGENTS.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `.kiro/steering/product-scope-discipline.md`
- `docs/agents/review-levels.md`
- `docs/agents/pa-persona.md` for external PA
- `docs/cuts/H1-architecture-housekeeping/pm-spec.md`
- `docs/cuts/H1-architecture-housekeeping/decisions.md`
- `docs/cuts/H1-architecture-housekeeping/pa-review-opus.md`
- `docs/cuts/H1-architecture-housekeeping/goal-h1-a-b.md` for the H1-A/B
  execution plan
- `docs/cuts/H1-architecture-housekeeping/cut-note.md`
- `docs/cuts/H1-architecture-housekeeping/handoff.md`
- `docs/code-style.md`
- `scripts/README.md`

## Source Of Truth

- H1 implementation ended at PR #106 / H1-G.
- Current artifact: closeout docs.
- H1 should not receive new implementation PRs.

## Allowed Scope

- Planning docs under `docs/cuts/H1-architecture-housekeeping/**`
- For implementation PRs only:
  - `server/api.mjs`
  - `server/router/*.mjs`
  - `server/draft-paper/draftPaperRoutes.mjs`
  - `server/draft-paper/draftPaperStore.mjs`
  - `server/draft-paper/*.mjs`
  - `server/my-space/*.mjs`
  - `server/paper-import/*.mjs`
  - `server/exports/*.mjs`
  - `server/search/*.mjs`
  - relevant verify and smoke scripts

## Forbidden Scope

- UI product behavior changes
- DB schema changes
- API response shape, status code, and error-copy changes
- `app/src/shared-ui/papersurface/**`
- `shared/papersurface/**`
- `app/src/features/reading-analysis/**`
- `app/public/paper-assets/**`
- `app/public/reports/**`
- `server/print-renderer.mjs` body changes; new imports of existing exports
  from extracted modules are allowed

## Output Required

If an external agent is asked about H1, it should read:

```text
docs/cuts/H1-architecture-housekeeping/handoff.md
```

Repo-file handoff rule:

- Put substantive PA / CR / DEV / QA / RM context in repo files, not chat.
- Chat should only route agents to this entrypoint and the expected output path.
- If a material decision was made in chat, copy it into `decisions.md`,
  `pm-spec.md`, `handoff.md`, or this entrypoint before the next agent acts.

The expected response is a short recommendation for which future H-numbered cut
to use, not a new H1 plan.
