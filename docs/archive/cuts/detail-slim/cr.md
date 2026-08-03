# CR — detail-slim (CR-lite, fresh Opus, cold read)

Reviewed `github/claude/detail-slim` @ `504e7e3` against `main` @ `3d2d4cd`.
Contract: `docs/cuts/detail-slim/plan.md` (on branch).

**Recommendation: APPROVE WITH MUST FIX** — deletion work is clean, in scope, and
well-guarded; the one ADD (看解析 entry) navigates to the wrong surface.

---

## Changed Scope

- `app/src/features/question-detail/QuestionGroupDetailView.tsx` (−169/+, net −103)
  — deleted compare box, compare stats, verify-list section, topic confidence %;
  added the paperSurfaceLabel-driven action-bar button.
- `app/src/features/question-detail/detailHelpers.ts` — removed `getParseSavedAt`
  + its now-unused type imports.
- `app/src/App.css` — removed 190 lines of compare/verify CSS (+ media/theme overrides).
- `scripts/verify-classic-retire-2.mjs` — assertions flipped presence→absence.
- `scripts/verify-paper-browse.mjs` — dropped `answerCompareStats` from a marker loop.
- `docs/cuts/detail-slim/plan.md` — the plan itself.

Forbidden scope (server/**, PaperSurface, search results, draft, analysis data
structures, AnalysisDisclosure/layering) — confirmed untouched from the diff file list.

## Findings

### Must Fix

**MF-1 — 看解析 button navigates to the wrong surface (fails the plan's ADD intent;
mislabeled navigation).**
`QuestionGroupDetailView.tsx:210-221` renders the new button with
`onClick={() => onOpenPaperBrowse(selectedDetail)}` and label
`{selectedDetail.paperSurfaceLabel}` (e.g. 「阅读解析」/「完形解析」/「七选五解析」/「语法解析」,
from `server/search/paperSurfaceAvailability.mjs:10-33`).

- `onOpenPaperBrowse` = `openPaperBrowseFromDetail` (`App.tsx:731`) → parses the
  href, then calls `openPaperBrowse` (`App.tsx:709`) which sets **`view=paper-browse`**
  and `setCurrentPiRoute({kind:'none'})`. That is the whole-paper browse surface —
  the **identical destination as 看整卷** (`QuestionGroupDetailView.tsx:200`, also
  `onOpenPaperBrowse`).
- `paperSurfaceHref` is built as **`view=paper-intelligence&surface=paper&...`**
  (`server/search/paperSurfaceAvailability.mjs:42-56`) — the ANALYSIS surface.
- The reference impl the plan cites (`ConciergeGroupCard.tsx:170-183`) navigates
  its analysis button to `paperSurfaceHref` **directly** via `<a href>`, i.e. to
  paper-intelligence, NOT to paper-browse.

Net effect: the action bar now shows two buttons — 看整卷 and 「阅读解析」— that go to
the **exact same paper-browse route** with different labels. The 「阅读解析」button
never reaches the analysis surface. This violates the plan's 补 requirement
(「看解析」直达解析面) and is mislabeled navigation that will confuse the user.

Fix: navigate the new button to `selectedDetail.paperSurfaceHref` directly (mirror
`ConciergeGroupCard`'s `<a href={paperSurfaceAnalysisHref}>`), not via
`onOpenPaperBrowse`. The detail view is currently handed no analysis-nav handler,
so this needs either an anchor to the href or a new App.tsx handler — DEV's call.

Note the verify does NOT catch this: the new assertion in
`verify-classic-retire-2.mjs` ("看解析 entry … present, gated on …") checks the
button's presence/gating/label only, never its navigation target. So the green
does not prove the plan intent — this is a fake-green-adjacent gap DEV should also
close (assert the button routes to the analysis href, not paper-browse).

### Should Watch

**SW-1 — stale (vacuous) assertion in verify-analysis-layering.mjs:141.**
`'verify-list (AI 答案验证, owner-only) is not touched by AnalysisDisclosure'` now
passes trivially because `verify-list` is deleted entirely. Harmless (still green,
asserts nothing false), and the plan did not scope editing this script — non-blocking.

**SW-2 — `.instruction-summary` base rule (App.css:643) now wraps a single child.**
The compare-summary sibling it was gridded against is gone; the surviving grid rule
lays out one child (effectively single-column). Cosmetically harmless, non-blocking.

## Self-Review Blind Spots

- I did not run the browser QA the plan asks for (owner + member screenshots). I
  verified gating and deletion statically from the diff; visual layout of the slimmed
  action bar / answer box after CSS removal is unverified by me.
- Whether owner actually wants 看解析 as a *second* nav to paper-browse (rather than
  the analysis surface) is a product read — I judged it against the plan's explicit
  「直达解析面」wording. If owner reinterprets the ADD as "just another 看整卷 shortcut",
  MF-1 downgrades to a redundant-button Should Watch. I do not have that authority;
  flagging for adjudication.

## Verification Evidence (re-run by CR, not copied)

- `verify-classic-retire-2.mjs` — 64 passed, 0 failed (branch).
- `verify-analysis-layering.mjs` — 19 passed, 0 failed (branch).
- `verify-paper-browse.mjs` — 71 passed, 0 failed (branch).
- `tsc -b` (app) — clean, exit 0.
- Deletion completeness: all four scaffolding surfaces + `getParseSavedAt` gone;
  grepped every deleted App.css class — none still referenced in TSX (base rules for
  the 4 shared classes `.detail-view/.instruction-summary/.app-shell/.home-mode-ai`
  survive; only compare-box compound/child rules removed). Answer line preserved
  (`答案：{question.answer || '待补'}`). AnalysisDisclosure/showAi conditionals intact.
- Gates: 编辑/删除 still `isOwnerView`-only; deleted surfaces gone for BOTH roles; new
  button gated on `hasPaperSurfaceAnalysis && paperSurfaceHref && paperSurfaceLabel`
  (NOT owner-gated — matches ConciergeGroupCard); nothing newly owner-gated.
- verify rewrite: absence guards are real — each would fail if the deleted symbol
  (`showCompareBox`, `verify-list`/`verify-item`, `answerCompareStats`,
  `topicLabel.confidence`, `getParseSavedAt`) were reintroduced. No over-deletion of
  live member-visible assertions.
- verify-paper-browse marker-drop: **legitimate** — `answerCompareStats` is deleted,
  so asserting its presence would falsely fail; classic-retire-2 now owns the absence
  guard. Not a weakening-to-go-green.
- Conflict awareness (#5): PR #282 (`claude/surface-question-policy`) is **already
  merged into main** and its +151-line edit to `verify-paper-browse.mjs` overlaps
  detail-slim only at the marker loop (line 276). `git merge-tree --write-tree` reports
  NO conflict; I materialized the merged tree and ran both scripts — `verify-paper-browse`
  86 passed / `verify-classic-retire-2` 64 passed, 0 failed. No rebase risk.

## Failure / Attack Angle

The plausible bad merge here is exactly MF-1 landing green: verify passes, tsc passes,
the button renders and is gated correctly — but a teacher clicking 「阅读解析」on the
detail page silently lands on the whole-paper browse view (same as 看整卷) and never
sees the analysis surface. Because the cut deliberately stripped the page's own
analysis-adjacent tooling, this broken entry is the *only* analysis affordance the
slimmed page adds — so the regression is invisible to tests yet defeats the whole ADD.
Future agents reading the verify green would trust the entry works.

## Residual Risk

Low once MF-1 is fixed and re-proven. The deletion half is solid and well-guarded
against regression. No persistence/export/print path touched (render-only, server
payload untouched per plan). Browser QA (owner/member visual) still owed by the plan.
