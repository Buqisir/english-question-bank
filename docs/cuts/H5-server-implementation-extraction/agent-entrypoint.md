# H5 Agent Entrypoint — Server Implementation Extraction

Cut: H5 Server Implementation Extraction
Stage: PA-lite direction review needed before DEV
Owner: Codex PM by default; external Claude Opus as PA-lite reviewer
Date: 2026-05-24

## Current Objective

Decide whether H5 should proceed now, and if yes, which `server/api.mjs`
implementation cluster should be extracted first. H5 is not a router cut.
H1 already created the route shell layer; H5 is about moving implementation
functions out of `server/api.mjs` into owned server modules without changing
runtime behavior.

## Must Read

- `docs/cuts/H1-architecture-housekeeping/handoff.md`
- `docs/cuts/H1-architecture-housekeeping/cut-note.md`
- `docs/cuts/H9-verify-ci-credibility-hardening/handoff.md`
- `server/api.mjs`
- `docs/cuts/H5-server-implementation-extraction/claude-pa-lite-prompt.md`

## Background

Skim only if unfamiliar or not already loaded in this session.

- `AGENTS.md`
- `.kiro/steering/cut-workflow-protocol.md`
- `docs/agents/pa-persona.md`
- `scripts/README.md`

## Current State

H1 is complete. `server/api.mjs` still has about 11k lines, but:

- `server/router/index.mjs` exists with `defineRoute` / `runRoutes`.
- Seven route-owner modules were extracted:
  - `server/question-bank/questionGroupRoutes.mjs`
  - `server/exports/exportRoutes.mjs`
  - `server/imports/legacyImportRoutes.mjs`
  - `server/paper-import/paperImportRoutes.mjs`
  - `server/draft-paper/draftPaperRoutes.mjs`
  - `server/my-space/mySpaceRoutes.mjs`
  - `server/search/paperSurfaceAvailability.mjs`
- These modules are mostly route shells. Many DB queries, business logic,
  export helpers, import helpers, and AI call helpers still live in
  `server/api.mjs` and are called through route context.

H5 goal: move implementations out of `server/api.mjs` into their owner modules.
PA-lite question: which domain should be extracted first, and why?

## Source Of Truth

- Base branch: `github/main`
- Baseline commit when this entrypoint was written: `af5688e`
- Latest accepted artifacts:
  - `docs/cuts/H1-architecture-housekeeping/handoff.md`
  - `docs/cuts/H9-verify-ci-credibility-hardening/handoff.md`

## Candidate First Slices

Ask Claude to compare these candidates rather than inventing a broad rewrite:

1. Legacy import implementation
   - `import_files`, `import_batches`, local file import, DOCX/PDF parse helpers.
2. Export implementation
   - old DOCX/PDF/export helpers behind existing export routes.
3. Question-group AI parse implementation
   - reading/cloze/grammar/seven-choices parse helpers and AI call routing.

Default PM bias before PA-lite:

- Do not pick AI parse as the first slice unless Claude finds a very strong
  reason. It is more likely to touch teaching interpretation or data contracts.
- Prefer a first slice with a clear owner module, stable route shell, and
  behavior-preserving verify boundary.

## Allowed Scope For Planning

- H5 planning docs under `docs/cuts/H5-server-implementation-extraction/`.
- PA-lite report written by Claude to the target path.
- No runtime code changes during PA-lite.

## Forbidden Scope For PA-lite

- Do not implement.
- Do not patch files.
- Do not propose rebuilding the router layer already completed by H1.
- Do not change API behavior, response JSON, DB schema, print renderer,
  PaperSurface, app UI, or AI parsing semantics.
- Do not start a broad `server/api.mjs` rewrite.

## Output Required

Claude should write:

```text
docs/cuts/H5-server-implementation-extraction/claude-review-opus.md
```

Chat reply after writing the repo file must contain only:

- report path
- verdict
- recommended first slice
- Must Fix count
- Open PO Decisions count

Escalation signals:

- `CONTEXT INSUFFICIENT` — required reading file missing, empty, or unreadable.
- `BRANCH CONFLICT` — target branch / PR cannot be inspected because of local
  worktree or checkout state.
- `SPEC CONTRADICTS` — entrypoint, H1 docs, H9 docs, or current server shape
  disagree on a key point.
- `SCOPE UNCLEAR` — review focus cannot be answered from the provided context.
