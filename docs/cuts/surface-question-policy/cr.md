# CR — surface-question-policy (fresh Opus CR-lite, cold read)

Branch `github/claude/surface-question-policy` @ `24ec75f`; baseline `main`.
Reviewer context did not implement this cut. Verifies re-run in a detached
worktree at the branch tip; `tsc -b` run against the main tree's toolchain.

## Recommendation

**APPROVE WITH MUST FIX** — the runtime change is correct and in scope, but a
plan-required guard (`verify-paper-surface-module-v1`) is RED on the branch and
the committed plan does not record the third (grammar prompt-option) change.
Both must close before merge.

## Changed Scope (from the diff, not the report)

- `app/src/shared-ui/papersurface/PaperSurface.tsx` / `.css` — empty-stem policy
  (one place, `PaperSurfaceQuestionItem`). Confirmed: no touch to the interaction
  reducer, textMap, blank rendering, or focus/anchor plumbing. The `questionId`
  and `optionLabel` anchor attrs are preserved on the rendered nodes.
- `writingPageModel.mjs` — new `extractApplicationScaffold` + read-time routing
  of Dear…/Yours… into `givenTop`/`givenBottom`; application-taskType only.
- `writingPaperViewAdapter.ts` — strips scaffold paragraphs before textMap /
  passageStructure; `buildWritingTextMap` re-signatured (asset,group → paragraphs,
  paperId). Local function, single caller, tsc green.
- `grammarFillPaperViewAdapter.ts` (follow-up 24ec75f) — synthetic `label:'prompt'`
  option retired; `options` always `[]`.
- `scripts/verify-paper-browse.mjs` (+behavioral assertions), guard allowlist
  edits in `verify-paper-surface-module-v1.mjs` and
  `verify-paper-surface-host-interaction.mjs`.

## Findings

### Must Fix

**MF1 — `verify-paper-surface-module-v1.mjs` FAILS on the branch (plan requires it
green).** `scripts/verify-paper-surface-module-v1.mjs`
The follow-up commit edited `app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts`,
which sits under the forbidden `^app/src/features/paper-intelligence/` prefix, but
it was NOT added to `ALLOWED_DOWNSTREAM_PAPER_INTELLIGENCE_FILES` (only the writing
files were). Re-run result:
`112 passed, 1 failed — offenders: app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts`.
The plan's acceptance line requires "PaperSurface 系 verify 全绿（module-v1/…）". The
edit is legitimate (owner-feedback item 3, same read-time-adapter class as
`writingPaperViewAdapter.ts` — no import-pipeline / stored-asset touch), so the fix
is to add that one file to the allowlist set with a comment, then re-run module-v1
to green. Do not loosen the prefix.

**MF2 — Committed `plan.md` does not record the grammar prompt-option retirement.**
`docs/cuts/surface-question-policy/plan.md`
The plan lists only items 1 (empty-stem policy) and 2 (scaffold). The `grammarFillPaperViewAdapter`
`options: []` change (commit 24ec75f) is a real runtime edit with no contract entry.
Add it to the plan (item 3) so the authorized scope is on the record and MF1's
allowlist entry is traceable to a written decision, not just to a follow-up commit
message.

### Should Watch

**SW1 — PaperSurface guards are not in `verify-ci`; `verify:all` would not catch MF1.**
`verify-paper-surface-module-v1.mjs` and `verify-paper-surface-host-interaction.mjs`
are absent from `scripts/verify-ci.mjs`'s registry (only `verify-paper-browse` and
the i13/i14 analysis verifies are). So the branch's `verify:all` is green while the
module-v1 scope guard is red — the forbidden-scope protection the plan leans on runs
by hand only. Pre-existing registry gap, not introduced here, but it is why "verify:all
green" does NOT prove scope for this cut. Non-blocking; worth a follow-up to register
the two guards.

**SW2 — Empty-stem render behavior is proven at source-string + adapter-data-shape
level, not by a rendered DOM snapshot.** `scripts/verify-paper-browse.mjs` asserts the
adapters emit the triggering shapes (cloze `{stem:'', options:[…]}`; grammar `{stem:'',
options:[]}`) and regexes the `.tsx` for the two branches, but nothing renders the
`return null` / one-line DOM. That the row actually collapses / options actually sit on
one line is closed only by the plan-mandated browser QA (960d0f8d + 2026-i). Acceptable
given QA is required; do not merge without that QA.

**SW3 — Scaffold strip also affects the PI harness writing surface, not only browse.**
`buildWritingPaperView` has two consumers: `PaperBrowsePage.tsx:196` (this cut's target)
and `PaperIntelligencePaperSurfaceHarness.tsx:451`. The passage-strip therefore also
applies to the harness writing render for application letters. It is the same, intended,
reversible presentation (scaffold in box, not duplicated in passage) and touches no
export / persistence / detail-page path (those two are the only consumers), but it is
un-QA'd on the harness. Read-time only; non-blocking.

## Verification Evidence (re-run by CR)

- `verify-paper-surface-module-v1` → **112 passed, 1 FAILED** (grammarFillPaperViewAdapter offender). ← MF1
- `verify-paper-browse` → 87 passed, 0 failed
- `verify-i9-cloze-analysis-surface` → passed
- `verify-i15-grammar-fill-blank-focus` → passed
- `verify-i0e-seven-choices-entry` → 48 passed, 0 failed
- `verify-i10-blank-rendering` → 41 passed, 0 failed
- `verify-paper-surface-tokens` → 150 passed, 0 failed
- `verify-paper-surface-host-interaction` → 72 passed, 0 failed
- `verify-i6-writing-render` → 19 checks passed
- `verify-analysis-layering` → 19 passed, 0 failed
- `tsc -b` (app) → exit 0

Assertions read for fail-if-regressed: the browse-verify scaffold assertions exercise
the real 960d0f8d/2026-i assets through the actual adapters (extract Dear Chris/Yours →
givenTop/givenBottom, strip from passage textMap, 2026-i null scaffold + empty box
preserved) — they fail if the extraction or strip regresses. The cloze/grammar shape
assertions run the real adapters and would fail if the normalization changed.

## Failure / Attack Angle (checked)

- **Does the empty-stem policy leak into analysis surfaces?** No. Stored cloze/grammar
  `q.stem` is `"41"`/`"56"` (=== questionNo). Browse adapters (`clozePaperViewAdapter:61`,
  `grammarFillPaperViewAdapter`) normalize that to `''` → policy triggers. Analysis
  adapters (`clozeAnalysisSurfaceAdapter:239`, `grammarFillAnalysisSurfaceAdapter:284`)
  pass raw `"41"`/`"56"` (non-empty) → policy is a no-op. `sevenChoicesSurfaceAdapter`
  passes `chain.questionNo` (non-empty). Plan's claim verified in code, not prose.
- **Did retiring the prompt option break another consumer?** No. The only remaining
  `label:'prompt'` producer is `grammarFillAnalysisSurfaceAdapter` (intentional, its
  stem stays non-empty so the row renders normally). No reader keys off `opt.label ===
  'prompt'`.
- **Scaffold regex misfire on non-letter passages?** Guarded by `taskType==='application'`;
  2026-i (opinion column, no "Dear" paragraph) returns null and keeps empty-box behavior
  (asserted). Missing "Yours" → whole scaffold to top, empty bottom (graceful).
- **Anchor/keyboard navigation after row suppression?** Grammar rail rows all vanish, but
  grammar navigation lives on in-passage blank anchors (`verify-i15` green). Cloze rows are
  NOT suppressed (options → one-line, `questionId` anchor retained). No orphaned-anchor path.

## Self-Review Blind Spots

- I did not render PaperSurface in a browser/DOM harness; the one-line layout and the
  `return null` collapse are inferred from source + adapter data (see SW2). Big CR / QA
  should visually confirm the inline options don't wrap badly and that suppressed grammar
  rows leave no empty container.
- I did not exhaustively trace every host-interaction reducer path against the new inline
  option DOM (options now `<span>` inside the stem `<button>` rather than `<li>` in
  `<ol class=ps-option-list>`); `verify-paper-surface-host-interaction` is source-level and
  passed, but a runtime focus-delegate difference on the inline branch is the place I'm least
  able to prove cold.

## Residual Risk

Low once MF1/MF2 close. The runtime logic is correct and scope-confined; the blocker is a
guard/plan-hygiene gap, not a code defect. The genuine residual is visual (SW2) and the
un-QA'd harness writing surface (SW3), both closed by the plan-required browser QA.
