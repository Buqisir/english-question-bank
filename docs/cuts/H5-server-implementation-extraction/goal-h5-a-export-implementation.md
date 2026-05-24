# H5-A Goal — Export Implementation Extraction

Status: Ready for DEV
Date: 2026-05-24
Source review: `docs/cuts/H5-server-implementation-extraction/claude-review-opus.md`

## Objective

Move only the export implementation helpers out of `server/api.mjs` into
`server/exports/exportImplementation.mjs`, preserving byte-identical export
behaviour.

This is a pilot for server implementation extraction before upcoming AI-parse
work. It is not a broad `server/api.mjs` slimming cut.

## Scope

Move these functions from `server/api.mjs`:

- `exportDocx`
- `exportPdf`
- `exportPrintHtml`
- `exportPrintPdf`
- `sendBinary`
- `sendDocx`
- `sendPdf`

Keep route behaviour and endpoint URLs unchanged. Prefer a factory seam such as
`createExportImplementation({ getQuestionGroupDetail })` if the extracted module
needs question-group detail lookup, so it does not import back from
`server/api.mjs`.

## Non-Negotiables

- H5-A is one PR and one revert boundary.
- Capture byte-identical fixtures before moving implementation code.
- `server/print-renderer.mjs` stays untouched.
- `server/router/index.mjs` stays untouched.
- `server/exports/exportRoutes.mjs` keeps the same `defineRoute` route shape;
  only imports / handler wiring may change.
- No UI, DB schema, prompts, AI parse, paper data, or PaperSurface changes.
- If the diff materially exceeds Claude's expected envelope, stop and re-slice.

## Implementation Plan

1. Capture baseline export outputs.
   - Use one small student paper-set export.
   - Use one small teacher paper-set export.
   - Use one print-html sample.
   - Use one print-pdf sample.
   - Store fixtures under a small H5-A test fixture location chosen by DEV.

2. Extract implementation.
   - Add `server/exports/exportImplementation.mjs`.
   - Move the seven export/send helpers there.
   - Wire `server/exports/exportRoutes.mjs` to imported implementation helpers
     instead of `context.exportDocx` / `context.exportPdf` / related context
     fields.
   - Remove the moved function definitions from `server/api.mjs` and remove
     now-unused route-context fields.

3. Add run-form regression.
   - Add `scripts/verify-h5a-export-implementation.mjs`.
   - Import the extracted implementation and compare output against the
     captured fixtures.
   - Assert the moved function definitions no longer live in `server/api.mjs`.
   - Assert export routes no longer depend on moved `context.*` helpers.
   - Register the script in `scripts/verify-ci.mjs`.
   - Add a one-line index entry in `scripts/README.md`.

4. Record closeout.
   - Write `docs/cuts/H5-server-implementation-extraction/dev-notes-h5-a.md`.
   - Write `docs/cuts/H5-server-implementation-extraction/cr-lite-h5-a.md`.
   - On merge readiness, update or create the cut note.

## Verification

Required before reporting done:

```bash
node scripts/verify-h5a-export-implementation.mjs
node scripts/verify-exam-export.mjs
node scripts/verify-paper-export-flow.mjs
node scripts/verify-paper-export-payload.mjs
node scripts/verify-print-pdf-export-flow.mjs
node scripts/verify-print-renderer.mjs
node scripts/verify-architecture-housekeeping.mjs
npm run verify:all --prefix app
git diff --check
```

Browser QA is not required unless DEV accidentally changes a visible route or UI.

## Allowed Files

- `server/exports/exportImplementation.mjs`
- `server/exports/exportRoutes.mjs`
- `server/api.mjs`
- `scripts/verify-h5a-export-implementation.mjs`
- `scripts/verify-ci.mjs`
- `scripts/README.md`
- `docs/cuts/H5-server-implementation-extraction/*.md`

## Forbidden Files

- `server/print-renderer.mjs`
- `server/router/index.mjs`
- `server/imports/**`
- `server/paper-import/**`
- `server/question-bank/**`
- `server/draft-paper/**`
- `server/my-space/**`
- `server/search/**`
- `app/**`
- `data/sql/schema.sql`
- `schemas/**`
- `prompts/**`
- `server/prompts/**`
- `app/public/paper-assets/**`
- AI-parse paths such as `callDeepSeek*`, `saveReadingParseResult`,
  `saveClozeParseResult`, grammar parse, or seven-choices parse.

## Short Agent Prompt

```text
Read docs/cuts/H5-server-implementation-extraction/agent-entrypoint.md,
docs/cuts/H5-server-implementation-extraction/claude-review-opus.md,
docs/cuts/H5-server-implementation-extraction/decisions.md, and
docs/cuts/H5-server-implementation-extraction/goal-h5-a-export-implementation.md.

Implement H5-A only: extract export implementation helpers from server/api.mjs
into server/exports/exportImplementation.mjs with byte-identical behaviour.
Capture export fixtures before moving code, add a run-form
scripts/verify-h5a-export-implementation.mjs regression, register it in
scripts/verify-ci.mjs, and update scripts/README.md.

Do not touch server/print-renderer.mjs, server/router/index.mjs, app/**, DB
schema, prompts, paper data, PaperSurface, or AI-parse code. Keep H5-A as one
PR and one revert boundary. Run the H5-A verify script, existing export verify
scripts, architecture housekeeping verify, app verify:all, and git diff --check.
Write dev notes and CR-lite under docs/cuts/H5-server-implementation-extraction/.
```
