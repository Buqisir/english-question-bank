# H1 Agent Entrypoint

Cut: H1 Architecture Housekeeping / server surface extraction
Stage: PM spec + small external PA complete; READY FOR DEV after planning PR merge
Owner: Codex PM / DEV / CR-lite / QA / RM; PO does final approval
Date: 2026-05-23

## Current Objective

H1 reduces the review and maintenance cost of `server/api.mjs` by extracting
large server surfaces into owned modules behind a minimal route registry. H1 is
not a product cut. It must preserve API behavior while making future PRs easier
to review.

## Required Reading

- `AGENTS.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `.kiro/steering/product-scope-discipline.md`
- `docs/agents/review-levels.md`
- `docs/agents/pa-persona.md` for external PA
- `docs/cuts/H1-architecture-housekeeping/pm-spec.md`
- `docs/cuts/H1-architecture-housekeeping/decisions.md`
- `docs/cuts/H1-architecture-housekeeping/pa-review-opus.md`
- `docs/code-style.md`
- `scripts/README.md`

## Source Of Truth

- Branch: `codex/h1-architecture-housekeeping-planning`
- Base commit: `github/main` at `44026d9` after C8 PR #97
- Current artifact: H1 PM spec + decisions ledger + Opus small PA review
- External PA verdict: READY FOR DEV, 2 Must Fix, 0 Open PO Decisions

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

External PA must write the next artifact to:

```text
docs/cuts/H1-architecture-housekeeping/pa-review-opus.md
```

Repo-file handoff rule:

- Put substantive PA / CR / DEV / QA / RM context in repo files, not chat.
- Chat should only route agents to this entrypoint and the expected output path.
- If a material decision was made in chat, copy it into `decisions.md`,
  `pm-spec.md`, `handoff.md`, or this entrypoint before the next agent acts.

Reply with only:

- report path
- verdict
- Must Fix count
- Open PO Decisions count
