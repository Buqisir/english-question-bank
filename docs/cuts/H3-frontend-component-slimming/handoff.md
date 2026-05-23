# H3 Handoff

Cut: H3 Frontend Component Slimming
Last updated: 2026-05-23
Branch: `codex/h3-goal-plan`
PR: planning PR

## Current Truth

- H3 is open as the next housekeeping cut after H2.
- H3 is about frontend locality, not visual redesign.
- Recommended first implementation slice is H3-A:
  Draft Paper Preview / Export Locality.
- Do not start by slimming PaperSurface harness unless PO explicitly redirects.

## Completed

- Goal doc written.
- Agent entrypoint written.
- First-slice recommendation recorded.

## Still Open

- H3-A implementation has not started.
- No browser QA has run for H3 because no runtime code has changed.

## Must Not Forget

- Preserve behavior exactly.
- Do not touch `shared/papersurface/**`.
- Do not change print renderer behavior.
- Use `scripts/verify-c8-draft-paper-render-model.mjs` for H3-A.

## Verify / QA State

- Planning docs should pass `git diff --check`.
- Implementation slices must run their narrow verify scripts.

## Next Action

Start H3-A:

```text
Extract Draft Paper A4 preview HTML generation from DraftPaperWorkbench.tsx
into a feature-local module, preserve preview/PDF/print behavior, and run
scripts/verify-c8-draft-paper-render-model.mjs plus git diff --check.
```
