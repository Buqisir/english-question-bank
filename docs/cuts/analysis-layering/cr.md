# CR-lite — 刀A analysis-layering

- Reviewer: fresh Opus CR (cold read), branch `github/claude/analysis-layering` @ `21483cd`, baseline `main`.
- Verdict: **APPROVE**
- Review level: L2 (contained presentational / information-architecture change; no schema, server, persistence, export, or gate surface touched).

## Changed Scope

7 files, all inside the plan's allowed set:

- `app/src/features/question-detail/AnalysisDisclosure.tsx` (new child component, self-owned useState)
- `app/src/features/question-detail/QuestionGroupDetailView.tsx` (wrap-only, no useState added)
- `app/src/App.css` (new `.analysis-disclosure*` + `.question-ai-answer-line` rules)
- `scripts/verify-analysis-layering.mjs` (new), `scripts/verify-ci.mjs` (registered), `scripts/README.md` (paired row)
- `docs/cuts/analysis-layering/plan.md`

No server / API / data-shape change. PaperSurface, search-results page, and the member/owner boundary (verify-list / compareBox / confidence) are untouched — confirmed from the diff, not the report: `git diff main...branch` on the detail view contains **zero** lines matching `verify-list|compareBox|confidence|isOwnerView|onEdit|onDelete|加入草稿`. Forbidden list respected.

## Verification Evidence (re-run by CR on the branch via `git worktree`)

- `verify-analysis-layering.mjs`: **19 passed / 0 failed** (exit 0).
- `verify-classic-retire-2.mjs` (the zero-useState guardrail owner): **63 passed / 0 failed** (exit 0). Guardrail genuinely green on branch files, not relaxed.
- `tsc --noEmit` (app, real local compiler): **exit 0**, no errors.
- Field-count audit of the final `QuestionGroupDetailView.tsx`: `AI 推荐答案` ×4, `question-ai-answer-line` ×4, `<AnalysisDisclosure` ×8 (4 per-question + 4 group-level), and every analysis label present exactly once (题目翻译/题型策略/定位句/答案句/语言特征/同义替换/选项翻译/位置与上下文/提示词意思/挖空句翻译 ×1; 干扰项分析 ×2 = reading+cloze, correct). **No field dropped, duplicated, or reordered** vs. the plan's per-type field lists.

### Correctness of the wrapping (focus #1, #2)

Per-type answer-line tier is exactly what the plan specifies and nothing more:
- reading = `answer` only, still null-guarded (`{readingParseItem.answer && …}` preserved from origin);
- cloze = `answer + answerText + answerMeaning` (identical to the pre-cut answer line — answerMeaning was already there, not newly added);
- seven = `answer + optionText`; grammar = `answer`.

All other fields moved *inside* the disclosure with original order and original per-field null-guards intact. Group-level guards preserved: reading `articleAnalysis &&` still wraps 脉络+重要词块 (keyChunks still `length > 0` guarded inside); cloze outer guard correctly widened to `(storySummary || condensedStory)` so the disclosure only appears when it has content; seven `articleSummary &&`; grammar `fullTranslation &&`. No conditional-rendering change hides data that previously showed, and no disclosure can render empty (each collapsed body always contains at least an `未返回`-fallback field or is guarded away entirely).

### Guardrails / gates (focus #3)

Zero internal useState in the parent confirmed by two independent scripts (retire-2 line 62 + the new script's re-assertion). New state lives only in the child. Owner/member gates byte-untouched (see Changed Scope).

### Verify-script anchoring (focus #4)

Meaningfully anchored, not a rubber stamp:
- default-collapsed is pinned by `/\buseState\(\s*false\s*\)/` — flipping to `useState(true)` fails the run;
- answer-line-outside-disclosure is pinned by per-type ordered regexes requiring `…answer…question-ai-answer-line…<AnalysisDisclosure>…<field>` — moving the answer line back inside the collapsed body fails;
- disclosure removal caught by `usageCount >= 8` plus each type's ordering regex.
Registered in `verify-ci.mjs` registry and documented in the README table (paired). It will run in CI, not only by hand.

### A11y / CSS (focus #5, #6)

- `aria-expanded` + `aria-pressed` both on the toggle is **consistent with the established repo precedent** — `PaperAssetAnalysisPanel.tsx` uses exactly `aria-expanded={isActive}` + `aria-pressed={isActive}` on its `<button type="button">`. The plan directed following that precedent; this matches. Native `<button>` gives free Enter/Space + focus.
- CSS is token-reusing: `--ink / --muted / --line / --line-strong / --surface-strong / --ink-strong` are the app's existing tokens (defined in tokens.css/index.css, used 36× for `--ink` alone). The focus ring `0 0 0 3px rgba(44,110,86,0.2)` is the repo-wide convention (24 identical occurrences in App.css), not a new color. Chevron rotate is driven off `[aria-expanded='true']`, keying visual state to the a11y attribute.

## Findings

### Must Fix
None.

### Should Watch (non-blocking)
1. **Behavioral hiding is not machine-proven.** The verify is source-shape only (no jsdom/testing-library harness exists — the repo convention, and the script says so). It proves the *structure* that collapses content, not the *runtime* that collapsed content is absent from the DOM. Mitigant: `AnalysisDisclosure` renders body via `{expanded && …}` (content truly out of DOM when collapsed), and the plan's acceptance requires member+owner browser QA screenshots (four types, default + expanded). Blocking would exceed CR-lite tier for a presentational change. Leave to owner QA per plan.
2. **`aria-pressed` on a disclosure is mildly redundant** (a pure disclosure needs only `aria-expanded`; SRs will announce both "expanded" and "pressed"). Not harmful and matches repo precedent, so intentionally consistent rather than fixed. Flag only if a future a11y pass standardizes the pattern.
3. **Reading answer tier can be empty** when `readingParseItem.answer` is absent (guard preserved from origin) — user then sees only the "展开解析" toggle with no always-visible answer. This mirrors pre-cut behavior (reading answer was always guarded), so not a regression; note for owner if the empty-always-tier reads oddly.

## Self-Review Blind Spots
- I did not mount the component in a browser; visual regressions from the new `display: grid` wrapper on `.question-ai-block` / `.parse-mapping` spacing are unverified by me and rest on the plan's screenshot QA.
- `tsc` ran against a symlinked copy of main's `node_modules` (worktree had none); type set is main's, but the two changed files typecheck clean there and add no new deps, so risk is negligible.

## Failure / Attack Angle
The realistic way this merges wrong: a future edit re-adds a field *outside* any disclosure, or flips a disclosure open by default, and the source-regex verify still passes because it only asserts the ≥8 wrappers and the current field ordering — it does not assert that *no* analysis field except the answer line sits outside a disclosure. The `usageCount >= 8` is a floor, not an exact fence, so adding a 9th always-open field would not trip it. This is a monotonic-loosening risk, not a defect in the current diff. Acceptable for this cut; if the two-tier contract hardens, the verify should gain an "only the answer line is outside a disclosure" upper-bound assertion.

## Residual Risk
Low. Pure client presentation; no data, persistence, export, or gate path. Guardrails green on branch, fields conserved, scope clean.

## Recommendation
**APPROVE.** No Must Fix. Merge after the plan's member+owner browser QA screenshots (Should Watch #1) are captured for owner sign-off — that is the acceptance step, not a code blocker.
