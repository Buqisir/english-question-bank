# CR (CR-lite) — I9 完形填空解析 render 面 + 入口 gate

Reviewer: CR (fresh context, did not implement). Branch `i9-cloze-analysis-surface`,
reviewed against `main` (`git diff main...HEAD` + uncommitted). Independent re-run
of verifiers, read assertions, traced the harness integration by hand.

## Recommendation

**APPROVE WITH MUST FIX.**

The adapter, panel, availability gate (PA MF-1), and the fetch→fallback restructure
(PA MF-2 load path) are correct and in scope. But the cloze analysis model is
omitted from the **one** harness effect that sets the initial focused blank and
resolves the URL `questionId` (L639-717). As shipped, opening `完形解析` lands on
an empty card ("点击左侧空格查看解析") instead of the locked "blank 41 focused"
behavior, and a URL `questionId` does not open its blank. Clicking a blank still
works. This is a real product defect against plan Step 3 + the PA browser-QA
matrix; it is invisible to the source-grep verifier and would only surface in
Step 6 browser QA. One Must Fix.

## Changed Scope

In scope, matches the plan's allowed file set exactly:

- `app/src/features/paper-intelligence/clozeAnalysisSurfaceAdapter.ts` (new)
- `app/src/features/paper-intelligence/ClozeAnalysisPanel.tsx` (new)
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
- `server/search/paperSurfaceAvailability.mjs`
- `scripts/verify-i9-cloze-analysis-surface.mjs` (new) + `verify-ci.mjs` + `README.md`
- `scripts/verify-h1d-analysis-availability.mjs` (assertion tracked to refactor)
- docs (plan/pa/agent-entrypoint)

Forbidden scope confirmed UNTOUCHED from the diff: no `shared/papersurface/**`,
no `schemas/**`, no I8 generation/contract (`analyzeCloze.mjs`,
`prompts/cloze-analysis-v1.md`, contract md), no `ConciergeGroupCard.tsx`, no
seven-choices/reading panels. No `app/public/paper-assets/**` committed
(only untracked `.claude/launch.json`, not part of the PR). `kind: 'support'`
reused; no evidence-kind taxonomy extension.

## Findings

### Must Fix

**MF-1 — Cloze analysis model never receives an initial focused blank; URL
`questionId` is not resolved for it.**
`PaperIntelligencePaperSurfaceHarness.tsx:666`

```ts
const activeReadingModel = paperAssetModel ?? clozeModel ?? grammarFillModel ?? writingModel
if (!activeReadingModel) return   // L667
```

When the new analysis path runs, the load branch sets `clozeAnalysisModel` and
nulls `clozeModel/paperAssetModel/grammarFillModel/writingModel`. So in the
initial-focus effect `activeReadingModel` is `null` and the effect returns at
L667 — it never dispatches `request-lecture-focus`, the only action that sets
`activeQuestionId` (`paperSurfaceHostInteraction.ts:67-74`). Result:

- No blank is auto-focused on open. The panel renders group overview + the
  empty state "点击左侧空格查看解析"; no card. Plan Step 3 / PA matrix require
  "blank 41 focused" on open.
- The URL `questionId` path is also dead for cloze analysis: the `source ===
  'paper-asset'` branch returns at L667 before the report-based resolver at
  L687-716 runs. Plan Step 3: "URL `questionId` opens that blank's card."
- `clozeAnalysisModel` is also absent from this effect's dependency array
  (L717), so even a fix that reads it must add it as a dep.

The plain I3 `clozeModel` IS in the L666 list, so the fallback path keeps its
default focus — the regression is specific to the new analysis model. Clicking a
blank works (focus-intent handler L859 is wired), so the defect is "opens empty,
must click" rather than a crash.

Fix: give the initial-focus effect a `clozeAnalysisModel` branch that resolves
`initialQuestionId` against `clozeAnalysisModel.analysisByQuestionId` (or
`surfaceData.questions`), falls back to `clozeAnalysisModel.defaultQuestionId`
when `initialGroupId` is set, and dispatches `request-lecture-focus` with
`optionLabel: null` + the first passage-side `evidenceId` (mirroring the seed /
focus-intent branches already added). Add `clozeAnalysisModel` to the dep array.
Add a harness assertion (even source-level) that the initial-focus effect
references `clozeAnalysisModel`, so the regression cannot silently return.

### Should Watch (non-blocking)

- **Verifier proven-ness for Steps 1–3 is source-grep, not behavioral.** The
  multi-occurrence / blank-marker tests exercise an INLINE reimplementation of
  `findAllTextRanges` (`verify-i9...mjs:103-117`), not the shipped adapter
  export; Step 2/3 are `*.includes(...)` string checks. This is why MF-1 passed
  green. Only Step 4 (availability) runs the real module. Acceptable given a
  `.mjs` script can't import the TS adapter without a build step, and the app
  build (`npm run build --prefix app`) does type-check the real wiring — but the
  harness integration behavior (focus/dispatch) is proven only by Step 6 browser
  QA. Do not treat the green Step 3 asserts as covering runtime behavior.
- **Unlocatable passage signalText → silent no-highlight.** If a context/stem
  `signalText` is not found verbatim in any segmented sentence (sentence-boundary
  split, punctuation normalization in `segmentPaperText`), `findAllTextRanges`
  returns `[]`; the panel still renders the evidence button, but clicking it
  highlights nothing (no `data-paper-evidence-id` exists). No crash; the I8
  validator's exact-substring rule makes this rare. Watch in QA that every
  evidence row actually lights the passage.
- **Multi-occurrence cross-column line anchors to the first DOM match.** Per the
  locked decision ("highlight all occurrences"), the adapter emits one
  `PaperEvidence` per occurrence sharing the same `id`; PaperSurface highlights
  all, the line draws to the first. Acceptable per the lock, not a defect.
- **`verify-h1d` OR-assertion is not a meaningful weakening.** Post-refactor the
  code contains only `analysis?.[entryMapKey]?.[questionId]` (the old literal
  `analysis?.questions?.[questionId]` is gone), so the OR is required for h1d to
  keep passing; it still asserts the completeness logic keys off a per-question
  map. The behavioral guarantee (reading keyed on `questions`, cloze on `blanks`)
  is proven in the i9 verifier's real-module Step 4. Fine.

## Self-Review Blind Spots

- I did not run the app in a browser (owner runs Step 6); MF-1 is derived from
  reading the dispatch graph, not from observing an empty card. High confidence
  (`activeQuestionId` has exactly one writer and the effect provably returns
  early), but a second auto-focus path I missed would downgrade it.
- I did not verify the cross-column `PaperIntelligenceEvidenceLine` actually
  renders for `kind: 'support'` with cloze's neutral shell report (`loads` all
  zero, `questions: []`). The line machinery is reused unchanged and the highlight
  attribute linkage checks out, but the shell report is deliberately minimal —
  Step 6 should confirm the line draws.
- `optionTextByLabel` / `getOptionTextForSignal` fallback: if an option-side
  `signalText` is not a substring of any option (contract says it must be), the
  panel renders the raw signal with no `<mark>`. Not exercised by any test.

## Verification Evidence

Re-run on this branch (my numbers, not the report's):

- `node scripts/verify-i9-cloze-analysis-surface.mjs` → 61 passed, 0 failed.
- `node scripts/verify-ci.mjs` → CI verify passed (i9 registered in the registry,
  confirmed at `verify-ci.mjs:43`).
- `npm run build --prefix app` → built clean (TS type-check of the real harness
  wiring passes).
- Read the new Step 4 fixtures: complete→entry, incomplete (one blank deleted)→no
  entry, reading-on-`questions`→entry. These would fail if the `entryMapKey`
  config-awareness regressed — genuine, not tautological.

## Failure / Attack Angle

- **The shipped MF-1 defect:** a teacher clicks `完形解析`, lands on a card-less
  pad showing only the overview + "点击左侧空格查看解析", and concludes the
  feature is broken — the most visible promise (blank 41 ready) is unmet, yet
  every verifier is green because Step 3 only greps source strings.
- **A future agent trusting the green Step 3 asserts** could refactor the load
  branch and re-break the dispatch wiring without any test failing; the harness
  is proven only by browser QA.
- **Stale fallback risk: none found** — `setClozeAnalysisModel(null)` is set on
  the fallback path and on every other model's load, and the parse-failure
  `try/catch` falls through to `buildClozePaperView`. I3 fallback intact.

## Residual Risk

Low after MF-1. The data-contract surface (availability gate) is behaviorally
proven and correctly config-aware; the consume-only boundary is respected; no
forbidden scope touched. The remaining risk is the harness focus integration,
which is a UI-state defect (not data/persistence), fixable in the same file with
the branch pattern already established three times in this diff.
