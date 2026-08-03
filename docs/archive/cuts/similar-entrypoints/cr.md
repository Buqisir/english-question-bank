# CR — similar-entrypoints (E3)

Fresh Opus CR, cold read of `git diff 9433ef7..7c4fb14` (baseline = plan commit,
7c4fb14 = DEV checkpoint). Worktree clean at the checkpoint.

## Recommendation

**APPROVE** — 0 Must Fix, 4 Should Watch. Code is correct, in scope, and the
CI-gated verify surface is green. The one un-automated surface (deep-link
auto-trigger runtime + four-type equivalence) is proven only by the mandated
browser QA, which is the plan's own required next gate — see SW-1/SW-2.

## Changed Scope

- `app/src/App.tsx` — `similar` threaded through `OpenPaperBrowseOptions`,
  boot-read, `openPaperBrowse` push-state, popstate boot-read,
  `paperBrowseOnBackToWorkbench` param-strip, `paperBrowseRoute` state, and the
  new `openPaperBrowseSimilarFromDetail` callback + prop wiring.
- `app/src/features/paper-browse/PaperBrowsePage.tsx` — `similar` prop,
  `similarDeepLinkAppliedRef` one-shot guard, the auto-trigger effect, and the
  replaceState sync effect extended to write/clear `similar=1`.
- `app/src/features/question-detail/QuestionGroupDetailView.tsx` — detail-page
  「配相似」 secondary entry (gated) + `onOpenPaperBrowseSimilar` prop.
- `app/src/concierge/*` — 「找类似」→「配相似」 deep-link re-engine; full
  retirement of `buildSimilarIntent` / `triggerSimilar` / `onSimilar`.
- `app/src/concierge/paperSurfaceHref.ts` — `buildPaperBrowseSimilarHref`.
- `scripts/*` — retirement-direction verify updates + README.

No Forbidden-scope files touched (grep for `server/`, `shared/papersurface`,
`adapters`, `print/export`, `SimilarQuestionsRailView`, `domain/questionBank`
= zero). `domain/questionBank.ts` was read only, not modified.

## Findings

### Must Fix
None.

### Should Watch

- **SW-1 (auto-trigger runtime is un-automated).** The deep-link auto-trigger
  effect (`similarDeepLinkAppliedRef` one-shot guard, the "wait for
  lectureSelection to land" retry, the two silent-degrade branches) has **no**
  static or behavioral assertion in any CI-gated verify script — `grep
  similarDeepLink|handleSimilarCtaClick|auto-trigger scripts/verify-paper-browse.mjs`
  = zero. verify covers the *URL contract* (options-bag threading, back-strip,
  replaceState deps, `buildPaperBrowseSimilarHref`) and the *retirement*, but not
  the runtime that fires 配相似. I traced the effect by hand and it reads correct
  (one-shot guard set only on fire/terminal-degrade, never on the "still waiting"
  branch; deps exclude `similarView` so 返回解析 cannot re-fire; refs are
  per-mount so Back/Forward remount re-arms cleanly). It is not merge-blocking
  because the plan deliberately routes behavioral proof to Playwright + 主代理
  browser QA, but that QA is the actual proof and must run before merge.

- **SW-2 (DEV Playwright covered reading only; three types unexercised).** Plan
  acceptance item 1 requires 配相似 on **four** group types (reading / cloze /
  seven_choices / grammar_cloze). Code-level equivalence for the three
  non-reading types is sound: the detail/concierge button gate uses domain
  snake_case (`['reading','cloze','seven_choices','grammar_cloze']`, verified
  against `domain/questionBank.ts` `GroupType`), and on arrival the auto-trigger
  re-uses the **identical** pre-existing E2 constant (camelCase
  `['reading','cloze','sevenChoices','grammarFill']`, PaperBrowsePage L252 — not
  in this diff) and the **identical** `handleSimilarCtaClick` the shipped E2 CTA
  calls (prod-QA'd 29/29). So "if the E2 CTA works for a type, the E3 deep-link
  works for it" holds at the code level. The residual is the snake_case↔camelCase
  double-track: it assumes a domain `seven_choices`/`grammar_cloze` group maps to
  a paper-asset `sevenChoices`/`grammarFill` group of the same paper. This is the
  exact landmine the plan flagged — must be confirmed by 主代理/owner QA on all
  four types (esp. seven_choices + grammar_cloze, where the casing differs).

- **SW-3 (button can render for a questionId-less href → degrades to lecture).**
  The detail-page gate renders 配相似 whenever `buildPaperBrowseSimilarHref(...)`
  is truthy, which only requires a `paperId` — not a `questionId`. If a group's
  `paperSurfaceHref` carried no `questionId`, the button would render but the
  auto-trigger (`if (!questionId) return`) would silently degrade to plain
  lecture. In practice the server href for analyzed groups carries the group's
  first questionId (same assumption the shipped 看解析 sibling relies on), so
  this is low risk and mirrors existing behavior — not a defect, just a case QA
  need not chase.

- **SW-4 (constant-name collision across three files).** Three different files
  each define a file-local `SIMILAR_SUPPORTED_GROUP_TYPES` with **different**
  string values (snake_case in detail/concierge, camelCase in PaperBrowsePage).
  Each is correct for its own data source, but a future editor "consolidating"
  them into one shared constant would silently break one side. A one-line note or
  a shared mapper would harden this. Non-blocking; documented in each file's
  header comment already.

## Self-Review Blind Spots

- I did not run the Playwright smokes (`smoke-concierge-stream.mjs`,
  `smoke-golden-path.mjs`) — they need a live server. Their source edits are
  principled (assert `a.concierge-action`「配相似」 visible, no retired 找类似
  button), but I did not confirm they pass at runtime. This overlaps SW-1/SW-2.
- I confirmed the auto-trigger's one-shot + degrade logic by reading, not by
  executing. A subtle timing interaction with 刀3's 沉降期 scrollspy suppression
  is plausible but I judged it aligned (the effect gates on `lectureSelection`
  matching, which is set by the same 刀3 effect). Big CR, if invoked, should
  re-trace this timing.

## Verification Evidence

Re-ran myself (not copied from report):
- `verify-concierge-desk.mjs` → 249 passed, 0 failed (in verify-ci).
- `verify-home-default-feed.mjs` → 60 passed, 0 failed (in verify-ci).
- `verify-paper-browse.mjs` → 184 passed, 0 failed (in verify-ci).
- `verify-similar-questions.mjs` → 29 passed, 0 failed.
- `app` tsc `--noEmit` → exit 0, clean.
- Retirement grep `buildSimilarIntent|triggerSimilar|onSimilar` over `app/src`
  → **zero hits** (收官标准 met).
- Forbidden-scope grep over changed file list → zero.
- Read changed assertions: verify edits assert *absence* of the retired flow
  (`!/onSimilar=/`, `!/triggerSimilar/`, no 找类似 `<button>`) AND *presence* of
  the new deep-link (`配相似 <a>`, `buildPaperBrowseSimilarHref`,
  `SIMILAR_SUPPORTED_GROUP_TYPES` gate, `similar` in options-bag / back-strip /
  replaceState deps). These are strengthened, not weakened — a regression that
  re-added the hack or dropped the URL threading would fail them.

### On the pi-route "pre-existing baseline" claim
`verify-paper-intelligence-route-integration.mjs` currently reports **16**
failed (DEV said 12 — count is off, immaterial to the conclusion). All 16 are in
`currentPiRoute.kind` / `paperAssembly` / `piOnBackToWorkbench` tests that E3
never touches. E3's only edit to this file is Test 13, which now **passes**
(`!/triggerSimilar/`). Critically, this script is **not** registered in
`scripts/verify-ci.mjs`, so it is not a merge gate. E3 neither introduced nor
worsened these failures. DEV's conclusion (pre-existing baseline) holds; the
12-vs-16 miscount is a Should Watch on DEV's own verification rigor, not a code
issue.

## Failure / Attack Angle

- The scariest failure mode is a 配相似 button that renders but does nothing (or
  opens plain lecture) for a non-reading type — hidden behind a green CI because
  no automated test exercises the auto-trigger fire. Mitigated by: identical
  reuse of the E2 CTA path/constant (SW-2) + mandated four-type browser QA.
- A future agent "cleaning up" the three duplicate `SIMILAR_SUPPORTED_GROUP_TYPES`
  constants into one shared set would silently break one data-source's gate
  (SW-4). The header comments guard against this but do not enforce it.
- A hand-crafted `?...&similar=1` without `lecture=1`/`questionId` self-heals:
  `openPaperBrowse` forces `similar = lecture && options.similar`, the
  auto-trigger early-returns, and the replaceState effect strips `similar` on
  first commit. No white-screen, no stale param leak. Verified by reading.

## Residual Risk

Low. FE-only, reversible, server untouched, no persistence/export path. The
entire residual is the four-type behavioral equivalence (SW-1/SW-2), which the
plan already assigns to the browser QA gate that runs next. Approve for merge
contingent on that QA exercising all four types — including the auto-trigger
firing, the one-shot guard (返回解析 must not bounce back to 相似态), and the
写作组-no-button case.
