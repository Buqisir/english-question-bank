# I9 Cut Note — 完形填空解析 render 面 + 入口 gate

Closed: 2026-05-31. PR #169. Branch `i9-cloze-analysis-surface`.

## What shipped

Renders the I8 `cloze-analysis-v1` JSON inside PaperSurface as a teacher-facing
讲评, focus-per-blank, reusing the right analysis pad + clue-highlight; plus a
completeness-gated `完形解析` entry on the cloze group card (mirroring `七选五解析`).
Consume-only: no schema / I8-contract / `shared/papersurface` change.

## Card (per focused blank)

Group `overview` + `affectiveArc` on top; then header (blank no + `pos` +
optional signature label), correct option + why-it-fits, distractor gloss list
(label + text + meaning, no "why wrong"), evidence rows (click → highlight
`signalText` in passage via the cross-column line), teachingNote.

## Files

- `app/src/features/paper-intelligence/clozeAnalysisSurfaceAdapter.ts` (new) — `cloze-analysis-v1` → surface model; locate passage evidence ranges (all occurrences); `ReviewedClozeAnalysisV1` type.
- `app/src/features/paper-intelligence/ClozeAnalysisPanel.tsx` (new) — the card; evidence rows (`support` kind), option-side `<mark>` for phrase blanks.
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx` — cloze branch fetch→fallback; cloze analysis model taught to the dispatch + activeEvidenceKind + seed + focus-intent + initial-focus + surfaceData branches.
- `server/search/paperSurfaceAvailability.mjs` — config-aware `entryMapKey` (`blanks` for cloze) + cloze config (label `完形解析`).
- `scripts/verify-i9-cloze-analysis-surface.mjs` (new, 64 checks) + `verify-ci.mjs` + `verify-h1d` + `README`.

## Gates

- **PA** (`pa-reviewer`): APPROVE WITH MUST FIX (3), all folded. MF-1: availability keyed `questions[]` → config-aware `entryMapKey` (`blanks`). MF-2: harness cloze branch short-circuited before the analysis fetch → fetch→fallback + 3 paper-asset-shaped branches taught the cloze model. MF-3: locked uniform kind=`support`, option-side in-card `<mark>`, multi-occurrence=all + fixture. `pa.md`.
- **CR** (`cr-reviewer`): APPROVE WITH MUST FIX (1). MF-1: initial-focus effect omitted `clozeAnalysisModel` → 完形解析 opened on an empty card / URL questionId dead → added the branch + dep + regression assertion. `cr.md`.
- **Browser QA** (real staged asset, live-generated cloze analysis): card renders fully, opens at blank 41, evidence highlight + cross-column line draw. **Caught a second grep-invisible integration bug** (same class as CR MF-1): the `surfaceData` memo omitted `clozeAnalysisModel`, firing "报告数据为空"; fixed + regression assertion added.
- **PO QA**: owner accepted. 合 I9.

## Verification

- `node scripts/verify-i9-cloze-analysis-surface.mjs` — 64 checks, green; in `verify-ci`.
- `node scripts/verify-ci.mjs` — green. `npm run build --prefix app` — OK.

## Follow-ups (not in I9)

- **Render format cut** (owner-requested): symbol / underscore / blank-number
  conventions — the cloze passage blanks render as literal `__41__`; spans more
  than I9 (I3 plain view + shared rendering, multiple families). Deferred to a
  dedicated format cut.
- Click-a-blank-to-switch-focus uses the same PaperSurface + `surfaceData.questions`
  mechanism as reading / 七选五; confirmed wired by data, not driven via automation
  in QA — quick to eyeball.
- Colored evidence-type differentiation (uniform `support` highlight in I9).
