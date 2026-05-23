# H2 Handoff

Cut: H2 Workflow / Verify / CI Discipline
Last updated: 2026-05-23
Branch: `codex/h2-closeout`
PR: closeout PR

## Current Truth

- H2 is closed at H2-C.
- H2 means "Workflow / Verify / CI Discipline" in this repo's history.
- Do not create H2-D.
- The stable local / future CI entrypoint is `npm run verify:all` from `app/`,
  which delegates to `scripts/verify-ci.mjs`.
- `scripts/README.md` is the verify index. Its `Runs in CI?` yes/no values for
  three-column tables are checked against `scripts/verify-ci.mjs`.
- The GitHub Actions workflow template exists at
  `docs/ci/verify-workflow-template.yml`.
- The real workflow is not installed at `.github/workflows/verify.yml` because
  the available token lacks `workflow` scope. See
  `docs/ci/verify-workflow-install.md`.

## Completed

- H2 goal and entrypoint were written into repo files.
- H2-A added workflow templates and CR-lite / watch-ledger rules.
- H2-B aligned verify index, stable verify entrypoint, and CI install state.
- H2-C added this handoff and the Cut Note.

## Still Open

- Real GitHub Actions installation remains open until a token with `workflow`
  scope is available.
- H2 intentionally did not slim frontend components, broaden design-token
  adoption, or extract server implementation functions.

## Must Not Forget

- A CI template is not active CI.
- Do not claim PR checks are enforced by GitHub Actions until
  `.github/workflows/verify.yml` exists and a PR proves the workflow starts.
- H2 process templates are guardrails, not ceremony. Small cuts should remain
  small.
- Should Watch items from PA / CR must land in a Cut Note or watch ledger.

## Verify / QA State

- H2-A verification:
  - `node scripts/verify-architecture-housekeeping.mjs` — 32 passed.
  - `npm run verify:all` from `app/` — passed.
- H2-B verification:
  - `node scripts/verify-architecture-housekeeping.mjs` — 39 passed.
  - `npm run verify:all` from `app/` — passed.
- H2-C verification:
  - `node scripts/verify-architecture-housekeeping.mjs` — 44 passed.
  - `npm run verify:all` from `app/` — passed.
  - `git diff --check` — clean.
- Browser QA was not needed for H2 because no user-visible UI changed.

## If The User Says "Continue Housekeeping"

Route the request to one of these cuts:

1. **H3 Frontend Component Slimming**
   - Use when the request is about `PaperSurfaceHarness`,
     `DraftPaperWorkbench`, panels, hooks, scroll sync, or frontend module
     size.

2. **H4 Design Tokens / UI Consistency**
   - Use when the request is about colors, spacing, typography, shared UI
     tokens, or visual consistency.

3. **H5 Server Implementation Extraction**
   - Use only when a product cut needs deeper server implementation locality.
   - Do not start H5 just to reduce line count.

4. **CI workflow installation**
   - Use only after a token with `workflow` scope is available.
   - Follow `docs/ci/verify-workflow-install.md`.

## Next Action

Return to product work unless the owner explicitly asks for H3, H4, H5, or CI
workflow installation.
