# I9 Cloze Analysis Surface — Agent Entrypoint

You are implementing I9 (完形填空解析 render 面 + 入口 gate). Read, in order:

1. `plan.md` (this dir) — scope, Must Do Steps 1–6, Forbidden, verification.
2. `docs/cuts/I8-cloze-analysis/cloze-analysis-v1.contract.md` — the JSON shape
   you render (fixed; do NOT change it).
3. `pa.md` (once PA has run) — honor Must Fix items.

Reuse these (read before writing) — do NOT reinvent:

- `app/src/features/paper-intelligence/clozePaperViewAdapter.ts` — the I3 plain
  cloze view you upgrade to load analysis.
- `app/src/features/paper-intelligence/sevenChoicesSurfaceAdapter.ts` +
  `paperAssetSurfaceAdapter.ts` — the analysis-adapter pattern (locate exact
  `signalText` → `data-paper-evidence-id` range via `segmentPaperText`).
- `app/src/features/paper-intelligence/PaperAssetAnalysisPanel.tsx` — the
  evidence-row pattern (`data-pi-evidence-id` / `data-pi-question-id`).
- `PaperIntelligencePaperSurfaceHarness.tsx` — the right-pad dispatch + fetch
  load effect + cross-column evidence line + `activeEvidenceKind` derive.
- `server/search/paperSurfaceAvailability.mjs` — the `analysisConfigs` array +
  `buildPaperSurfaceHref`; add a `cloze-analysis-v1` config (label `完形解析`).

Hard boundaries (Forbidden):

- Do NOT touch `shared/papersurface/**` core. Cloze chrome = scoped adapter +
  new `ClozeAnalysisPanel.tsx`.
- Do NOT extend the `support/trap/context` evidence-kind taxonomy — uniform
  highlight; evidence TYPE is a text label only.
- Do NOT change I8 generation/contract code or `schemas/**`.
- Do NOT break the I3 plain cloze view fallback (cloze group with no analysis).
- Register `verify-i9-cloze-analysis-surface.mjs` in `scripts/verify-ci.mjs`.
- Never commit `app/public/paper-assets/**`.
