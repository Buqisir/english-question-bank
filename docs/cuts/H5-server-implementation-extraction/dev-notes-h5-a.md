# H5-A Dev Notes — Export Implementation Extraction

Date: 2026-05-24
Branch: `codex/h5-a-export-implementation`

## What Changed

- Added `server/exports/exportImplementation.mjs` as the owner module for
  export implementation helpers.
- Moved export/send ownership out of `server/api.mjs`:
  - `exportDocx`
  - `exportPdf`
  - `exportPrintHtml`
  - `exportPrintPdf`
  - `sendBinary`
  - `sendDocx`
  - `sendPdf`
- Kept `server/exports/exportRoutes.mjs` as route dispatch. It now receives
  the export implementation from `server/api.mjs` and calls implementation
  helpers directly instead of `context.export*`.
- Kept `getQuestionGroupDetail` as an injected seam via
  `createExportImplementation({ getQuestionGroupDetail })`, avoiding a
  circular import from the export owner module back to `server/api.mjs`.
- Captured deterministic H5-A baseline fixture data in
  `scripts/fixtures/h5a-export-baseline.json`.
- Added `scripts/verify-h5a-export-implementation.mjs` and registered it in
  `scripts/verify-ci.mjs` / `scripts/README.md`.

## Scope Discipline

- `server/print-renderer.mjs` untouched.
- `server/router/index.mjs` untouched.
- No app/UI changes.
- No DB schema, prompt, PaperSurface, paper data, or AI-parse changes.
- H5-A remains one PR / one revert boundary.

## Verification Run

Passed:

- `node scripts/verify-h5a-export-implementation.mjs`
- `node scripts/verify-h1e-export-routes.mjs`
- `node scripts/verify-exam-export.mjs`
- `node scripts/verify-paper-export-flow.mjs`
- `node scripts/verify-paper-export-payload.mjs`
- `node scripts/verify-print-pdf-export-flow.mjs`
- `node scripts/verify-print-renderer.mjs`
- `node scripts/verify-architecture-housekeeping.mjs`
- `npm run verify:all --prefix app`
- `git diff --check`

Environment setup needed in this worktree:

- `npm ci` under `server/` to install Vivliostyle.
- `pnpm install --frozen-lockfile` under `app/` so `tsc` exists for
  `npm run verify:all --prefix app`.

## Notes

The H5-A byte-identical fixture uses deterministic test doubles for DOCX
packaging, PDF conversion, print HTML, and print PDF rendering. The purpose is
to prove the extracted implementation preserves export function semantics and
file naming / output path behaviour without depending on non-deterministic
external renderer metadata. Real print renderer and PDF smoke coverage remains
with the existing export / print verify scripts.
