# CR-lite — I15 grammar-fill blank focus

Reviewer: 小川 (CR-lite, fresh cold-read context — did NOT write this code).
Baseline: `git diff main...i15-grammar-fill-blank-focus` (committed) + `git diff HEAD`
(uncommitted). Repo root verified; branch `i15-grammar-fill-blank-focus`.

## Recommendation

**APPROVE** — pending the still-open Step 5 browser QA + PO QA gates (which the
plan already lists and which CR does not own). No Must Fix. Two Should Watch items,
both data-shape limits already named in PA's blind spots, neither blocks merge.

## Changed Scope

10 files: 6 code/script + 2 docs (plan, pa) + the verifier. Code surface:

- `shared/papersurface/types.d.ts` — `blankFocusMode?: 'rail' | 'in-passage'` added
  to `PaperSurfaceProps` (MF-2 path: correct `.d.ts`, not the non-existent
  `app/src/...types.ts`).
- `app/src/shared-ui/papersurface/PaperSurface.tsx` — `blankFocus` context threaded
  Section → Paragraph → Sentence → renderer; rail gated by `!blankFocus` (2 sites);
  new `renderTextWithGrammarFillBlanks`.
- `app/src/shared-ui/papersurface/grammarFillBlank.ts` — NEW. `grammarFillBlankPattern`
  + `findGrammarFillBlankNumbers`. (Not in the plan's Suggested Files, see SW-2.)
- `app/src/shared-ui/papersurface/PaperSurface.css` — `.ps-paper-blank-button` /
  `--active` / `.ps-paper-blank-text` affordance.
- `PaperIntelligencePaperSurfaceHarness.tsx` — one-line prop pass.
- `scripts/verify-i15-grammar-fill-blank-focus.mjs` (new) + `verify-ci.mjs` (registered)
  + `README.md` (row added).

Forbidden scope confirmed CLEAN from the diff (not the report): no
`analyzeGrammarFill` / `packageBuilder` / adapter / schema / contract /
`paper-assets/**` / `paperSurfacePrototype/**`. `paperBlankPattern` literal is
**byte-identical** to `main` (verified by direct `git show main:` compare).
`.claude/launch.json` is untracked-local only, NOT committed in the branch.

## Findings

### Must Fix
None.

### Should Watch (non-blocking)

- **SW-A (new-file deviation, accepted).** The plan put `grammarFillBlankPattern`
  inside `PaperSurface.tsx`; DEV instead created
  `app/src/shared-ui/papersurface/grammarFillBlank.ts`. This is a justified
  deviation, not scope drift: a node-based `.mjs` verifier cannot import a `.tsx`,
  so isolating the pure pattern in a `.ts` lets the verifier test the REAL shipped
  regex (the same technique i14/i9 verifiers already use). The pattern is still the
  cut's own surface. No action.

- **SW-B (data-shape dependency on `NN._____` with no inner space).** The pattern
  `/(\d{1,3})\._{2,}(?:\([^)]*\))?/g` requires the dot to be immediately followed by
  the underscore run. Adversarial probe: `56. _____` (a space after the dot) yields
  ZERO matches and would render as plain text. PA verified the real splitter emits
  `NN._____` with no space and SW-2 is the safety net, but the generator output
  contract is Forbidden scope and was not re-audited here. If a future paper emits a
  space, the blank silently loses its focus affordance (degrades to text, no throw).
  Browser QA on the real asset is the gate. Matches PA's own blind spot.

- **SW-C (nested-paren hint cosmetic).** `57._____(a(b))` captures `57` correctly but
  `match[0]` (the button label) truncates at the first `)` → label shows
  `57._____(a(b`. Focus resolution is unaffected (capture group is the number). Hints
  are never nested in real data; cosmetic only.

## Self-Review Blind Spots

- I proved zero-regression by **static diff + 3 verifiers + build**, NOT by rendering
  the other three surfaces in a browser. The `if (blankFocus) return …` guard makes
  the historical span path byte-identical below it (confirmed by function-body diff),
  and `blankFocus` is null for every non-grammar-fill surface (harness passes `'rail'`
  unless `grammarFillAnalysisModel`). I am confident from the diff, but the visual /
  interaction regression is the browser QA gate's job, not mine.
- I did not exercise `aria-pressed` screen-reader behavior or Tab order (SW-4) — those
  require a real browser; defer to Step 5.
- I verified the pattern against constructed adversarial strings, not against the full
  real `paper-960d0f8d` passage text. PA verified all 10 blanks match on the real
  asset; I relied on that for the positive-coverage claim.

## Verification Evidence

- `node scripts/verify-i15-grammar-fill-blank-focus.mjs` → **18 passed, 0 failed**
  (re-run by CR, not copied).
- Regression verifiers re-run, all green: `verify-i10-blank-rendering` (40/40),
  `verify-i14-grammar-fill-analysis-surface`, `verify-paper-intelligence-paper-surface-harness`.
- `npm run build --prefix app` → EXIT 0 (typecheck clean; the 4-level prop threading
  compiles).
- `git diff --check` clean.
- Registered in `verify-ci.mjs`; CI uses node 24 (`.github/workflows/verify.yml`) and
  i14/i9 verifiers already import `.ts` under the same `process.execPath [script]`
  invocation — so the `.ts` import is CI-proven, not a clean-machine-only green.

### Mutation tests (verifier proven load-bearing)

- **(a) loosen pattern dot to optional** (`\.?`) → verifier FAILS: cloze `__41__` and
  七选五 `_____36_____` negative assertions both fire. This is exactly why DEV's SW-1
  refinement (REQUIRED dot, contra the plan's "dot optional") is correct: with an
  optional dot, the underscore-wrapped cloze/七选五 markers false-match. The
  refinement is sound and the verifier guards it.
- **(b) remove a `!blankFocus` rail guard** → verifier FAILS (`both rail render sites
  gated by !blankFocus`).
- **(c) mutate `paperBlankPattern` literal** → verifier FAILS (byte-unchanged guard).

All mutations reverted; working tree confirmed clean.

## Failure / Attack Angle

The one way this lands a regression is a **leak of `blankFocus` into a non-grammar-fill
surface**. Traced and ruled out: `blankFocus` is `useMemo`'d to `null` whenever
`blankFocusMode !== 'in-passage'`, and the harness sets `'in-passage'` only when
`grammarFillAnalysisModel` is truthy. With `blankFocus` null, every renderer call takes
the historical span path (byte-identical body) and both rail sites render. No
module-level mutable, no second DOM pass — focus context is pure props (MF-1 satisfied).
`grammarFillBlankPattern.lastIndex = 0` is reset before each loop in BOTH consumers, so
no global-regex reentrancy bug across sentences. The residual real-world risk is SW-B
(a generator emitting `NN. _____` with a space silently degrading to text) — caught by
browser QA, not by this static gate.

## Residual Risk

Low. Correctness, scope, and proof are solid for a static cut. The remaining risk is
entirely in the interaction/visual layer (a11y Tab order, active-state visibility,
real-passage rendering) which the plan correctly routes to Step 5 browser QA + PO QA.
CR does not block on those.
