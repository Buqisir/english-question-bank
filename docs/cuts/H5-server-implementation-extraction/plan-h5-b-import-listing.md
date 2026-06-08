# H5-B Plan — Import file/bundle/batch listing + dir-scan extraction

Status: Implemented (DEV done; CR + RM follow)
Date: 2026-06-08
Roadmap: `docs/architecture/refactor-roadmap-2026-06.md` (cut H5-B, P3)
Cut size: medium · touches schema/data-contract/product-boundary/teaching-interpretation: **no**
(server-internal read/scan concern; behavior-preserving; run-form verifiable → mergeable solo)

## Objective

Move the import-file / bundle / batch **listing + directory-scan** concern out of `server/api.mjs`
into `server/imports/importListing.mjs` behind a factory seam, so the listing logic lives next to
its route owner (`server/imports/legacyImportRoutes.mjs`) and api.mjs shrinks.

## Move-set (17 functions → `createImportListingImplementation(deps)`)

`rowToImportFile`, `rowToImportFileParse`, `listImportFiles`, `deriveImportBundleReadiness`,
`buildImportBundleQualityWarnings`, `buildImportBundle`, `listImportBundles`, `rowToImportBatchItem`,
`rowToImportBatch`, `listImportBatches`, `expandLocalPath`, `inferBatchBundleTitle`,
`inferBatchContentRole`, `collectImportBatchFiles`, `updateImportBatchStats`, `getImportBatch`,
`scanImportDirectory`.

Moved verbatim (byte-identical bodies; only re-indented +2 into the factory closure — leading
whitespace added inside SQL template literals is semantically inert).

## Stay-behind in api.mjs (deliberately NOT moved — they sit interleaved in the region)

- `normalizeTags` — generic question-group tag helper, not import-listing.
- `normalizeExamTitle`, `extractDeclaredExamTitleFromText` — shared title helpers. Used by BOTH
  `buildImportBundleQualityWarnings` (moves) AND `buildDraftSourceQualityWarnings` (stays). Kept in
  api.mjs as the single source and **injected** into the factory, rather than moved + re-imported.
- `buildDraftSourceQualityWarnings` — belongs to the import-DRAFT pipeline (future H5-F), not listing.

## Factory seam

`createImportListingImplementation({ openDatabase, requiredString, optionalString, requiredEnum,
randomUUID, sanitizeFileName, inferImportFileType, normalizeExamTitle, extractDeclaredExamTitleFromText })`.
Node builtins (`existsSync`/`readdirSync`/`statSync`/`path`) imported directly by the module.
Module imports nothing from api.mjs (no cycle).

**Re-import surface** (7, destructured in api.mjs before `serverContext` to avoid TDZ):
`listImportFiles`, `listImportBundles`, `listImportBatches`, `scanImportDirectory` (→ serverContext +
`listPaperWorkflowStatuses`), `getImportBatch`, `updateImportBatchStats` (→ `runImportBatch`, stays),
`rowToImportFileParse` (→ `getImportFileParse` / `parseImportFile`, stay).

Instantiation placed right after the `createExportImplementation` block, before `serverContext` — all
injected deps are hoisted `function` declarations, available at that point.

## Result

`server/api.mjs`: 10,482 → 10,035 lines (−447). New `server/imports/importListing.mjs` (501 lines).

## Verify

`scripts/verify-h5b-import-listing.mjs` (registered in verify-ci + README): constructs the factory with
injected deps against a temp DB seeded from the real `data/sql/schema.sql`, and exercises
listImportFiles/Bundles/Batches + getImportBatch + updateImportBatchStats + scanImportDirectory
(real dir walk). 54 checks. Byte-identity of all 17 bodies proven by diff vs `main`. `verify:all` green.

## CR focus (fresh session)

1. Byte-identical move of all 17 (modulo +2 indent; SQL whitespace inert)?
2. Correct stay-behind set (normalizeTags / the 2 title helpers / buildDraftSourceQualityWarnings)?
3. Injected-not-moved title helpers — single source preserved, draft-warnings still works?
4. Re-import surface exactly the 7 outside-callers; serverContext + runImportBatch + parse fns resolve?
5. Factory instantiation before serverContext (no TDZ); module has no api.mjs import (no cycle)?
