# PA Review — I15 grammar-fill blank focus

Reviewer: 小川 (PA, fresh context). Source of truth verified against live code +
the real QA asset `paper-960d0f8d`, not against the plan's claims.

## Verdict

**APPROVE WITH MUST FIX**

The direction is right and the scoping is honest. The single highest-feared
rework risk — that retiring the rail breaks the harness's seed/focus effects or
the evidence cross-column line because those depend on rail / question-list DOM —
**does not materialize**: I verified the harness reads no rail DOM. The pattern,
blankNo→questionId, and isolation claims all hold on real data. Two Must Fix
items remain; both fold into `plan.md` and neither reopens a product decision.

## Product Principle

The teacher's gesture for grammar fill is "point at the blank in the sentence and
explain it" — not "scan a column of naked numbers." The rail (`56 57 58 …` with no
stem, no options) is dead chrome on this surface. Making the in-passage blank the
focus target reduces teacher work and keeps the paper primary. Scope is correctly
locked to grammar-fill-only; reading / 七选五 / cloze rails carry real question
content and must stay. This is a PaperSurface-appropriate change, not an AI
dashboard addition.

## Exact UX / Architecture Model

- New prop `blankFocusMode?: 'rail' | 'in-passage'` on `PaperSurfaceProps`,
  default `'rail'`. Default path is byte-identical to today for the other three
  surfaces (verified: PaperSurface has exactly ONE production caller — the harness
  at `PaperIntelligencePaperSurfaceHarness.tsx:1252`; the prototype component is
  separate and untouched).
- `'in-passage'`: the rail (`PaperSurfaceQuestionList`) is not rendered; in-passage
  grammar-fill blanks (`56._____`, `57._____(absorb)`) become `<button>` focus
  targets firing the SAME `request-lecture-focus` intent via `handleQuestionClick`.
- Resolution: parsed blank number (string) → `PaperQuestion.questionNo` equality →
  `question.id`. Verified on the real asset: grammar-fill `questionNo` = "56".."65"
  matches the in-passage marker numbers exactly; ids are unique; all live in one
  section (`GRAMMAR_FILL_SECTION`) so there is no cross-section number collision.
- Pattern isolation is genuinely sufficient: on the real grammar-fill text, the
  existing `paperBlankPattern` (`PaperSurface.tsx:62`, requires a delimiter run on
  BOTH sides of the number) matches NOTHING, and a number+dot+underscore-run
  pattern matches all 10 blanks and none of the numeric hazards.

## Must Fix Before DEV

### MF-1 — Plumb focus context down to the in-passage blank renderer (architecture; the real work, currently under-specified)

`renderTextWithPaperBlanks` (`PaperSurface.tsx:436`) is a **module-level function
that receives only `(text, keyPrefix)`**. It is called from `PaperSurfaceSentence`
(`:381/389/391/394`), which itself does NOT receive `questions`, `lectureFocus`, or
`onQuestionClick`. The call chain is:

`PaperSurface` → `PaperSurfaceSection` → `PaperSurfaceParagraph` → `PaperSurfaceSentence`
→ `renderTextWithPaperBlanks`.

To emit a wired `<button>` (with blankNo→questionId, `aria-pressed` from
`lectureFocus.questionId`, and the `handleQuestionClick` callback), DEV must thread
`blankFocusMode`, a `questionNo→questionId` lookup (or the `questions` slice +
`lectureFocus.questionId` + `onQuestionClick`) through Paragraph → Sentence → the
renderer. The plan's "Suggested Files" and Must Do Step 2 hide this 3-level prop
push behind "or a sibling renderer." Risk: DEV underestimates the change, hacks a
shortcut (module-level mutable, or a second DOM pass), or — worst — leaks a click
handler into the `'rail'` path and regresses the other surfaces.

**Required disposition:** `plan.md` Must Do Step 2 must state explicitly that the
focus context (`blankFocusMode`, the `questionNo→questionId` map, active
`questionId`, `onQuestionClick`) is threaded as props through
`PaperSurfaceSection` → `PaperSurfaceParagraph` → `PaperSurfaceSentence` →
`renderTextWithPaperBlanks` (renamed/parameterized), and that when
`blankFocusMode === 'rail'` (or omitted) the renderer takes the existing
text/span path with ZERO new props consumed and ZERO behavior change. Add a
Forbidden line: no module-level mutable state and no extra post-render DOM pass to
locate blanks.

### MF-2 — Correct the type-source file path (Allowed Files error)

The plan's Suggested Files names `app/src/shared-ui/papersurface/types.ts`. **That
file does not exist.** `PaperSurfaceProps` / `PaperQuestion` live in
`shared/papersurface/types.d.ts` (a `.d.ts` types sketch, imported by
`PaperSurface.tsx:38` as `../../../../shared/papersurface/types`). DEV following
the plan literally would create a stray `types.ts`, or edit the wrong file, and
the prop would never reach the component's type contract.

**Required disposition:** `plan.md` Suggested Files + Allowed Files must replace
`app/src/shared-ui/papersurface/types.ts` with
`shared/papersurface/types.d.ts`. Note that this is a `.d.ts` sketch (not in the
`tsc` build) so editing it is type-doc only; the prop is consumed via the runtime
destructure in `PaperSurface.tsx`. Verifier (Step 4) should assert the
`blankFocusMode` member exists in `shared/papersurface/types.d.ts`.

## Must Fix -> Plan Disposition Checklist

- [ ] **MF-1** → `plan.md` Must Do Step 2: name the explicit prop-threading chain
  Section→Paragraph→Sentence→renderer; require the `'rail'`/omitted path to consume
  zero new props and change nothing. Add Forbidden: no module-level mutable, no
  second DOM pass.
- [ ] **MF-2** → `plan.md` Suggested Files + Allowed Files + Step 4 verifier: fix
  the type path to `shared/papersurface/types.d.ts`; verifier asserts
  `blankFocusMode` present there.

## Should Watch

- **SW-1 — Pattern anchor + dot optionality.** Real blanks are uniformly `NN.____`,
  but the plan allows the dot optional. That is safe ONLY if the anchor is the
  underscore run `_{2,}` (confirmed: `2026`, `25` from `25-30g`, `3` from `3-5g`,
  `30g`, `800g`, `10g` all fail to match because no underscore run follows them).
  Watch that DEV anchors on `_{2,}` and captures the number BEFORE the
  dot+underscores — `Increase intake 64._____ 3-5g` must yield blankNo 64, never
  pick up the trailing `3`. The Step 4 verifier already calls for the
  `56._____ / 57._____(absorb)` positives and cloze/七选五 negatives; ADD an
  explicit negative for a numeric-noise string (e.g. `"trend of 2026 ... 800g a
  day ... 3-5g"`) asserting zero matches. Non-blocking: the data confirms the
  approach works; this just locks the regression guard.
- **SW-2 — Defensive unmatched-blank render.** Plan says a blank whose number has
  no matching question renders as today (no throw). Good. Watch that "as today"
  for an in-passage blank means a styled non-interactive element, not a dead
  `<button>` with no questionId (which would be a broken a11y target). Confirm in
  browser QA that every rendered button resolves to a real questionId.
- **SW-3 — `aria-pressed` source.** Active state derives from
  `lectureFocus.questionId === resolvedQuestionId`. `lectureFocus` is already
  threaded to the rail today; ensure the in-passage path reads the SAME source so
  rail-vs-in-passage active semantics can't drift. (Folds into MF-1's threading.)
- **SW-4 — Focus/Tab order with rail gone.** The rail buttons were the keyboard
  path; in-passage buttons replace them. Tab order now follows document order of
  blanks in the passage, which is natural (56→65). Verify in browser QA (Step 5
  already lists Tab/Enter) that no focus trap or skipped blank appears.

## Allowed Files

- `shared/papersurface/types.d.ts` (add `blankFocusMode` to `PaperSurfaceProps`) —
  **corrects the plan's wrong `app/src/...types.ts` path (MF-2)**
- `app/src/shared-ui/papersurface/PaperSurface.tsx` (prop + rail suppression +
  `grammarFillBlankPattern` + threaded clickable-blank renderer)
- `app/src/shared-ui/papersurface/PaperSurface.css` (blank-button affordance — 阿澈)
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
  (pass `blankFocusMode` at the `:1252` invocation)
- `scripts/verify-i15-grammar-fill-blank-focus.mjs` (new) + `scripts/verify-ci.mjs`
  + `scripts/README.md`

## Forbidden Files

- `analyzeGrammarFill.mjs`, `packageBuilder.mjs`, generation / contract / schema
- `grammarFillAnalysisSurfaceAdapter.ts` and the I14 adapter evidence/textMap
  logic (this cut changes render affordance only, not data shape)
- `paperBlankPattern` literal (`PaperSurface.tsx:62`) — must remain byte-intact
- `app/public/paper-assets/**` (do not commit), `.claude/launch.json`
- The prototype component `paperSurfacePrototype/**` (separate, unaffected)

## Static Verify Requirements

`scripts/verify-i15-grammar-fill-blank-focus.mjs` must assert:

1. `blankFocusMode` default `'rail'`; `shared/papersurface/types.d.ts` declares the
   member (MF-2).
2. `'in-passage'` suppresses `PaperSurfaceQuestionList` and renders blank
   `<button>`s wired to the questionId resolved from `questionNo` equality.
3. `grammarFillBlankPattern` matches `56._____` and `57._____(absorb)`; does NOT
   match cloze `__41__` / 七选五 `_____36_____`; and (SW-1) does NOT match a
   numeric-noise string (`2026`, `800g`, `3-5g`, `25-30g`).
4. `paperBlankPattern` literal unchanged (regression guard — assert the exact
   source string).
5. Harness passes `'in-passage'` only when `grammarFillAnalysisModel` is set;
   `'rail'` otherwise.
6. Do not regress: `verify-i10-blank-rendering.mjs`,
   `verify-i14-grammar-fill-analysis-surface.mjs`,
   `verify-paper-intelligence-paper-surface-harness.mjs`. Register in `verify-ci`.

## Browser QA Matrix

Plan's matrix is adequate; QA must additionally confirm:

| Case | Expected |
| --- | --- |
| 语法解析 surface | no bottom number rail; blanks 56–65 are styled clickable buttons |
| Click a blank | that blank's analysis opens in right pad; evidence highlights |
| Tab / Enter on a blank | focuses + opens; order follows 56→65 (SW-4) |
| Active blank | visible active state from `lectureFocus.questionId`; switching updates (SW-3) |
| Every rendered button | resolves to a real questionId (no dead buttons) (SW-2) |
| cloze / 七选五 / 阅读 | rail + focus + I10 blanks UNCHANGED (the `'rail'` default) |

## DEV Readiness

DEV-ready after MF-1 + MF-2 fold into `plan.md`. The teacher action, before/after,
cut boundary, future boundary, allowed/forbidden files, verify assertions, and
browser QA matrix are all stated. The data contract (questionNo→id, disjoint
patterns) is verified on the real asset, not assumed.

## Open PO Decisions

None blocking. (Click-affordance visual polish is 阿澈's QA call, already locked as
non-blocking in the plan.) Zero unresolved PO decisions.

## Self-Review Blind Spots

- I verified on ONE real asset (`paper-960d0f8d`, blanks 56–65). If a future
  grammar-fill paper used non-numeric or non-contiguous blank labels (e.g. a
  leading-zero `06.` or a non-`NN.` marker), the `questionNo` string-equality map
  could miss. Today's generation appears to always emit numeric `NN.`; SW-2's
  defensive render is the safety net, but I did not audit the generator output
  contract (it's Forbidden scope) to prove `NN.` is invariant. Flagging as a known
  limit, not a current-cut blocker.
- I confirmed the harness DOM reads (`[data-paper-section]`,
  `[data-paper-paragraph-id]`, `[data-paper-evidence-id]`) do not touch the rail,
  and the seed effects key off the model not DOM — so rail removal is safe. I did
  NOT exhaustively run the harness in a browser; the seed/focus conclusion is from
  source reading. Step 5 browser QA is the confirmation gate.
- I did not deeply audit `aria-pressed` SR behavior across browsers; SW-3/SW-4
  defer that to browser QA, which is the correct gate for a11y of a visible change.
