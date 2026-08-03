# H3-A Dev Notes — Draft Paper Preview Locality

Date: 2026-05-23
Status: implemented

## Scope

H3-A extracts Draft Paper A4 preview HTML generation out of the main
workbench component.

## Changed

- Added `app/src/features/draft-paper/draftPaperPreviewHtml.ts`.
- Moved `buildA4PreviewHtml(printHtml)` from
  `DraftPaperWorkbench.tsx` into the new feature-local module.
- Updated `DraftPaperWorkbench.tsx` to import and call the helper.
- Updated `scripts/verify-c8-draft-paper-render-model.mjs` so it verifies:
  - Workbench no longer owns the preview HTML generator.
  - The preview module still contains A4 dimensions.
  - The preview module still contains pagination script behavior.
  - The no-second-mat-color rule remains protected.

## Behavior

No product behavior changed.

The following remain unchanged:

- long-scroll A4 preview;
- transparent iframe page background;
- subtle outer paper mat;
- PDF download;
- browser print using `draftPaper.printHtml`;
- student-version-only export surface.

## Verification

- `node scripts/verify-c8-draft-paper-render-model.mjs`
- `npm run build` from `app/`
- `git diff --check`

Browser QA was not required for this slice because it is a pure extraction and
the existing render-model verify protects the preview contract.
