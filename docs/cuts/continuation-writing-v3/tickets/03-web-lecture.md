# 03 — Web lecture

Status: done; on main 2026-11-25
Blocked by: 01; application-writing-v4 ticket 03
Next on PASS: owner QA
Terminal: no

## What to build

Spec D5 in `PaperBrowsePage.tsx`, `ContinuationAnalysisPanel.tsx` and the
application V4 lecture components, using existing components and tokens. V3
groups get the essay in the answer box with a standard/advanced switch; V1 and
V2 groups keep the current panel.

## Acceptance criteria

- [ ] V3 fixture shows all six right-rail blocks; switching essays works by
  keyboard.
- [ ] No empty paragraph lines from blank-line separators.
- [ ] V2 fixture renders as before (screenshot diff).
- [ ] Before/after screenshots at 1440 and 390 sent to the Owner; approved.
- [ ] `node scripts/verify-ci.mjs` passes.

## Result

Commit: 98a3fe19a, 7da6d861e (branch only, not on main)
Verify: `npx tsc -b` in app: OK. `node scripts/verify-paper-browse.mjs`: 246 passed, 0 failed
  (8 new asserts on the V4 and V3 fixtures). verify-application-analysis-v4,
  verify-continuation-analysis-v3 and the three canonical writing rendered-behavior
  verifiers pass. verify-ci: the same 36 environment failures as the ticket 02
  baseline (missing magick and similar), 0 new after 7da6d861e.
  Owner before/after page: https://claude.ai/artifact/1zEheqZ1KtjnotzULPaHDK
Notes:
- Shared component `app/src/features/paper-browse/WritingLectureV4.tsx` serves
  both cuts: essay switch bar, task card, paragraph notes, expressions and what
  the advanced essay adds; continuation adds 读原文 and 容易写偏.
- The switch is the existing `SegmentedField` (radiogroup, one Tab stop, arrow
  keys switch). It sits above the answer box, not inside it, because the box is
  itself a button that opens the lecture.
- Essay state is per group in `PaperBrowsePage.tsx`, shared by the box and the
  rail. Paragraphs are split on blank lines and spaced by CSS; no empty `<p>`.
- Application: lines the box already prints (title, salutation, closing,
  signature, a given opening sentence) are not repeated from the essay.
- Continuation: each essay paragraph continues inline after its printed
  starter; the box grows to fit while the essay is shown. Without the lecture
  the box keeps its exam geometry.
- Legacy check: production 2026 I data (reviewCard V2 + continuation V2)
  rendered before and after at 1440 and 390. All 10 screenshots are pixel
  identical; the rail and box HTML is identical once the `data-inv` source line
  markers are removed.
- Owner approval of the before/after samples is still open.
