# C7 DEV Plan

Status: implementation plan after C7 planning docs merge.

## Goal

Implement a whole-paper import workbench that validates and publishes a
single English paper package, then proves Reading A-D PaperSurface
entries work from search and QA links.

## Checkpoints

### C7-1: Contracts And Offline Validator

- Add JSON Schema files under `schemas/`.
- Add schema validation using `ajv`.
- Add business validation helpers.
- Add fixture package under `test-fixtures/paper-import/`.
- Add static verify for schema/type/prompt drift.
- No UI, no server publish, no DB writes.

### C7-2: Server Validate API

- Add multipart parsing with `busboy`.
- Add `POST /api/paper-import/validate`.
- Enforce file type and size limits.
- Return normalized validation report.
- No persistent writes except temporary upload handling.

### C7-3: Publish Storage Protocol

- Add `POST /api/paper-import/publish`.
- Write versioned files.
- Upsert DB in transaction.
- Swap latest last.
- Write publish report.
- Preserve old latest on failure.

### C7-4: Import Workbench UI

- Add `?view=paper-import`.
- Add upload / file classification / metadata editor.
- Add prompt cards.
- Add validation report and structure preview.
- Add publish confirmation and result links.

### C7-5: Search And PaperSurface Entry Proof

- Ensure published Reading A-D groups derive
  `hasPaperSurfaceAnalysis` and `paperSurfaceHref`.
- Ensure non Reading A-D groups do not show fake analysis entry.
- Keep existing C6b entry behavior.

### C7-6: Smoke, Docs, And Cut Note

- Add Playwright smoke using temp public root + temp DB.
- Add verify scripts for forbidden scopes and published path protocol.
- Update product docs / cut note as needed.

## Self-CR Requirements

Codex CR-lite must check:

- no PaperSurface renderer changes
- no silent PaperAssetV1 migration
- latest remains old if publish fails
- validation blocks Reading A-D bad answer/evidence
- search button is data-derived after publish
- upload rejects invalid file types without clearing valid files

## Browser QA Requirements

Minimum manual / smoke matrix:

- import valid fixture and publish
- missing JSON blocks publish
- answerKey mismatch blocks publish
- unresolved Reading A-D evidence blocks publish
- publish success links open PaperSurface
- Reading A-D search cards show `阅读解析`
- non Reading A-D search cards do not show `阅读解析`
- second publish creates next version
- simulated DB failure leaves latest unchanged
