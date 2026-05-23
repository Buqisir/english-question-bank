# H3 Handoff

Cut: H3 Frontend Component Slimming
Last updated: 2026-05-23
Branch: `codex/h3-a-draft-preview-locality`
PR: H3-A implementation PR

## Current Truth

- H3 is open as the next housekeeping cut after H2.
- H3 is about frontend locality, not visual redesign.
- H3-A Draft Paper Preview / Export Locality has been implemented.
- Do not start by slimming PaperSurface harness unless PO explicitly redirects
  after the Draft Paper slices are complete.

## Completed

- Goal doc written.
- Agent entrypoint written.
- First-slice recommendation recorded.
- H3-A extracted A4 preview HTML generation from
  `DraftPaperWorkbench.tsx` into `draftPaperPreviewHtml.ts`.
- H3-A dev notes and CR-lite written.

## Still Open

- H3-B Draft Paper Outline / My Space Dialog Locality has not started.
- No browser QA has run for H3-A because the slice is a pure extraction and the
  render-model verify protects the behavior.

## Must Not Forget

- Preserve behavior exactly.
- Do not touch `shared/papersurface/**`.
- Do not change print renderer behavior.
- Use `scripts/verify-c8-draft-paper-render-model.mjs` for H3-A.

## Verify / QA State

- `node scripts/verify-c8-draft-paper-render-model.mjs` passed for H3-A.
- `npm run build` from `app/` passed for H3-A.
- `git diff --check` passed for H3-A.

## Next Action

Start H3-B:

```text
Extract Draft Paper outline / page-break / reorder UI from
DraftPaperWorkbench.tsx into a feature-local component while preserving behavior
exactly.
```
