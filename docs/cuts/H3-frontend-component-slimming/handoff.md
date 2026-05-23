# H3 Handoff

Cut: H3 Frontend Component Slimming
Last updated: 2026-05-24
Branch: `codex/h3-closeout`
PR: H3 closeout PR

## Current Truth

- H3 is closed.
- H3 is about frontend locality, not visual redesign.
- H3-A Draft Paper Preview / Export Locality has been implemented.
- H3-B Draft Paper Outline Locality has been implemented.
- H3-B-2 My Space dialog extraction was skipped because it did not present a
  clearly smaller module boundary than the workbench-owned export state.
- H3-C PaperSurface Analysis Panel Locality has been implemented.
- H3-D hook extraction should be skipped unless a future pass identifies a real
  data/focus seam instead of a pass-through hook.

## Completed

- Goal doc written.
- Agent entrypoint written.
- First-slice recommendation recorded.
- H3-A extracted A4 preview HTML generation from
  `DraftPaperWorkbench.tsx` into `draftPaperPreviewHtml.ts`.
- H3-A dev notes and CR-lite written.
- H3-B extracted right-side outline / reorder / page-break / delete UI from
  `DraftPaperWorkbench.tsx` into `DraftPaperOutline.tsx`.
- H3-B updated the Draft Paper render-model verify script to guard the new
  outline seam.
- H3-B dev notes and CR-lite written.
- H3-C extracted paper-asset and legacy right-side analysis panel rendering
  from `PaperIntelligencePaperSurfaceHarness.tsx` into
  `PaperAssetAnalysisPanel.tsx` and `LegacyAnalysisPanel.tsx`.
- H3-C updated the PaperSurface harness verify script to guard the new panel
  seam.
- H3-C dev notes and CR-lite written.
- H3 cut note written.
- Agent entrypoint and CLI handoff marked closed / historical.

## Still Open

- No H3 implementation work remains.
- H3-D PaperSurface Data / Focus Hook Locality remains intentionally skipped.
  Reopen as a new cut only if a later pass finds a deeper seam than the current
  host orchestration boundary.

## Must Not Forget

- Preserve behavior exactly.
- Do not touch `shared/papersurface/**`.
- Do not change print renderer behavior.
- Use `scripts/verify-c8-draft-paper-render-model.mjs` for Draft Paper slices.
- Use `scripts/verify-paper-intelligence-paper-surface-harness.mjs` for
  PaperSurface harness slices.
- Browser QA is required for user-visible / interactive extraction slices.

## Things The Next Cut Must Know

1. Pattern: keep side effects in the owner unless extraction creates a deeper
   module.
   - Evidence: H3-B moved outline rendering but kept draft persistence,
     optimistic item updates, delete/undo state, and API calls in
     `DraftPaperWorkbench.tsx`.
   - Rule: component extraction should reduce local UI ownership, not scatter
     API state across shallow children.

2. Pattern: pair visual extraction with browser QA when callbacks move.
   - Evidence: H3-B typecheck and verify passed, but browser QA was still used
     to prove up/down reorder, page-break, delete/undo, drag reorder, and A4
     preview sync.
   - Rule: static verify is not enough for moved interactive JSX.

3. Pattern: right-panel components may render rows, but the harness owns
   PaperSurface focus and line state.
   - Evidence: H3-C moved `PaperAssetAnalysisPanel` and
     `LegacyAnalysisPanel`, while keeping reducer dispatch, selected evidence,
     PaperSurface props, and line geometry in
     `PaperIntelligencePaperSurfaceHarness.tsx`.
   - Rule: extracted analysis panels should emit small callbacks; they should
     not own PaperSurface focus state or data loading.

## Verify / QA State

- `node scripts/verify-c8-draft-paper-render-model.mjs` passed for H3-A.
- `npm run build` from `app/` passed for H3-A.
- `git diff --check` passed for H3-A.
- `node scripts/verify-c8-draft-paper-render-model.mjs` passed for H3-B.
- `npm run build --prefix app` passed for H3-B.
- `npm run verify:all --prefix app` passed for H3-B.
- `git diff --check` passed for H3-B.
- Browser QA passed for H3-B outline interactions.
- `node scripts/verify-paper-intelligence-paper-surface-harness.mjs` passed for
  H3-C.
- `npm run build --prefix app` passed for H3-C.
- `npm run verify:all --prefix app` passed for H3-C.
- `git diff --check` passed for H3-C.
- Browser QA passed for H3-C paper-asset option / evidence interaction and
  legacy report panel rendering.

## Next Action

Start a new cut for follow-up work. Do not add H3-E.

```text
Recommended next options: H4 design-token / UI consistency, H5 server
implementation extraction, or a Claude-feedback infrastructure cut for CI
workflow installation / targeted run-form verify expansion.
```
