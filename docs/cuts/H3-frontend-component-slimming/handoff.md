# H3 Handoff

Cut: H3 Frontend Component Slimming
Last updated: 2026-05-24
Branch: `codex/h3-b-draft-outline`
PR: H3-B implementation PR

## Current Truth

- H3 is open as the next housekeeping cut after H2.
- H3 is about frontend locality, not visual redesign.
- H3-A Draft Paper Preview / Export Locality has been implemented.
- H3-B Draft Paper Outline Locality has been implemented.
- My Space dialog extraction is not included in H3-B unless a later pass finds
  a real module boundary instead of pass-through state.

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

## Still Open

- H3-B-2 My Space dialog extraction remains optional. Skip it unless the
  interface is clearly smaller than the implementation it moves.
- H3-C PaperSurface Analysis Panel Locality has not started.
- H3-D PaperSurface Data / Focus Hook Locality has not started.

## Must Not Forget

- Preserve behavior exactly.
- Do not touch `shared/papersurface/**`.
- Do not change print renderer behavior.
- Use `scripts/verify-c8-draft-paper-render-model.mjs` for Draft Paper slices.
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

## Verify / QA State

- `node scripts/verify-c8-draft-paper-render-model.mjs` passed for H3-A.
- `npm run build` from `app/` passed for H3-A.
- `git diff --check` passed for H3-A.
- `node scripts/verify-c8-draft-paper-render-model.mjs` passed for H3-B.
- `npm run build --prefix app` passed for H3-B.
- `npm run verify:all --prefix app` passed for H3-B.
- `git diff --check` passed for H3-B.
- Browser QA passed for H3-B outline interactions.

## Next Action

Evaluate H3-B-2 quickly:

```text
Extract My Space dialog only if it creates real locality. If it would only pass
workbench state through a child component, skip it and move to H3-C PaperSurface
Analysis Panel Locality.
```
