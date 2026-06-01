# I15 Plan — 语法填空：点正文空格聚焦 + 退掉数字排

cut size: **medium**; touches schema / data contract = **no**; **product boundary
(teacher focus interaction) = yes**; teaching interpretation = no. Touches the
**shared PaperSurface core** (`shared/papersurface/**` + `PaperSurface.tsx` blank
renderer) — this cut **explicitly assigns** 小川 that scope (overrides the default
UI-scope restriction in AGENTS.md, which is allowed only via a committed plan).
Full gates: 小川 PA before DEV, CR-lite before merge, **browser QA (visual /
interaction change)**, PO QA, RM. 阿澈 owns the click-affordance look.

## Objective

On the **grammar-fill analysis surface only**, make the **in-passage blank**
(`56._____`, `57._____(absorb)`) a **clickable, keyboard-accessible focus
target** that opens that blank's analysis in the right pad, and **retire the
bottom number rail** (`PaperSurfaceQuestionList`) for grammar fill. The other
three analysis surfaces (reading / 七选五 / cloze) are **unchanged** — their rail
shows real question stems / options, not naked numbers.

## Why (owner-locked, 2026-06-01)

PO browser-QA feedback on I14: for grammar fill the bottom rail is just naked
numbers (those "questions" have no stem, no options), and clicking the blank
**in context** is the natural teacher gesture. Scope locked to **grammar-fill
only** — reading / 七选五 / cloze rails display real questions and stay.
(Logged in `docs/paper-surface-watch-ledger.md` §"in-passage blank = focus target".)

## Code reality (verified — design around it)

- Focus today is driven entirely by the **shared** `PaperSurfaceQuestionList` /
  `PaperSurfaceQuestionItem` (`PaperSurface.tsx`), one per section, each item a
  click delegate that fires `request-lecture-focus` via `handleQuestionClick`.
  ALL four surfaces use it.
- In-passage blanks render via `renderTextWithPaperBlanks` (`PaperSurface.tsx:436`)
  as **non-clickable** `<span class="ps-paper-blank">{number}</span>`, matched by
  `paperBlankPattern` (`:62`): `/(?:_{2,}|[  ]{2,})\s*(\d{1,3})\s*(?:_{2,}|[  ]{2,})/g`
  — requires a delimiter on **both** sides of the number.
- The grammar-fill format `56._____` (number FIRST, then underscores, optional
  `(hint)`) does **NOT** match `paperBlankPattern` → today it renders as **plain
  text** (confirmed in I14 QA). So grammar-fill blanks are not even styled, let
  alone clickable.
- `<PaperSurface>` is invoked once in the harness (`PaperIntelligencePaperSurfaceHarness.tsx:1252`)
  with `textMap / evidence / questions / mode / lectureFocus / onFocusIntent`.
  `questions` (questionNo + id) is the blankNo→questionId source.

## Locked design

- **New prop `blankFocusMode?: 'rail' | 'in-passage'`** on `PaperSurfaceProps`
  (`shared/papersurface/types`), **default `'rail'`** so reading / 七选五 / cloze
  are byte-for-byte unchanged. When `'in-passage'`:
  1. The visible `PaperSurfaceQuestionList` (rail) is **not rendered**.
  2. In-passage grammar-fill blanks become **`<button>` focus targets** wired to
     `handleQuestionClick(questionId)` (the SAME `request-lecture-focus` intent
     the rail fired — no new intent type).
- **Grammar-fill blank recognition is ISOLATED**: add a separate
  `grammarFillBlankPattern` used **only** when `blankFocusMode === 'in-passage'`.
  Do **NOT** modify `paperBlankPattern` (cloze `__41__` / 七选五 `_____36_____` /
  the I10-bounded matches depend on it). Pattern recognizes `NN` + optional `.`
  + underscores + optional `(hint)` (e.g. `56._____`, `57._____(absorb)`), capturing
  the blank number. Must not reopen the I10 sentence-initial false-match surface
  (anchor on the underscore run, not bare numbers).
- **blankNo → questionId map** built from `questions` (still passed): the button
  for blank `56` fires `handleQuestionClick(<questionId with questionNo 56>)`.
- **a11y**: each in-passage blank is a real `<button type="button">` with
  `aria-label` (e.g. `聚焦第 56 题`) and `aria-pressed` reflecting the active blank
  — it REPLACES the rail's keyboard path (no a11y regression; the rail buttons are
  gone for grammar fill).
- **Harness**: compute `blankFocusMode = grammarFillAnalysisModel ? 'in-passage' : 'rail'`
  and pass it to `<PaperSurface>`. (Plain grammar-fill fallback view keeps `'rail'`
  — it has no analysis to open; out of scope.)
- **Click affordance look** (阿澈 UI): the blank button shows the number + the
  blank line (+ hint if given), `cursor: pointer`, a subtle hover + active state.
  Final visual polish is 阿澈's call in QA; v1 ships a functional, legible target.

## Must Do

### Step 1 — PaperSurface: `blankFocusMode` prop + rail suppression
- Add `blankFocusMode?: 'rail' | 'in-passage'` to `PaperSurfaceProps`
  (`shared/papersurface/types`), default `'rail'`.
- In `PaperSurface.tsx`, when `'in-passage'`, do not render `PaperSurfaceQuestionList`.
- Verification: with `'rail'` (or omitted) the rail renders exactly as today (all
  surfaces unchanged); with `'in-passage'` the rail is absent.

### Step 2 — PaperSurface: clickable in-passage grammar-fill blanks
- Add `grammarFillBlankPattern` (isolated; `paperBlankPattern` untouched).
- **Prop-threading chain (PA MF-1 — this is the real work, not a one-liner).**
  `renderTextWithPaperBlanks` (`PaperSurface.tsx:436`) is a module-level
  `(text, keyPrefix)` function; `PaperSurfaceSentence` (`:381/389/391/394`) does NOT
  receive `questions` / `lectureFocus` / `onQuestionClick`. DEV MUST thread the focus
  context — `blankFocusMode`, a `questionNo→questionId` lookup (built once from
  `questions`), the active `questionId` (from `lectureFocus`), and the
  `onQuestionClick` callback — explicitly as props through
  `PaperSurfaceSection` → `PaperSurfaceParagraph` → `PaperSurfaceSentence` → the
  (renamed/parameterized) blank renderer. When `blankFocusMode === 'rail'` (or
  omitted) the renderer takes the **existing text/span path, consuming ZERO new
  props and changing NOTHING** (the other three surfaces must be byte-for-byte
  unchanged).
- When `blankFocusMode === 'in-passage'`, the renderer emits each grammar-fill blank
  as a `<button>` carrying the blankNo, resolving blankNo→questionId by
  `PaperQuestion.questionNo` string-equality, firing `handleQuestionClick`. Active
  blank gets `aria-pressed` + an active class from `lectureFocus.questionId` (SW-3:
  read the SAME `lectureFocus` source the rail uses, so active semantics can't drift).
- Blanks whose number has no matching question (defensive) render as a **styled,
  non-interactive** element (NOT a dead `<button>` with no questionId — SW-2), no throw.
- Verification: a grammar-fill paragraph string renders the blank as a button with
  the right `aria-label` + a resolvable questionId; cloze `__41__` / 七选五
  `_____36_____` strings are UNCHANGED (still `paperBlankPattern` spans, no buttons).

### Step 3 — Harness wiring
- Pass `blankFocusMode={grammarFillAnalysisModel ? 'in-passage' : 'rail'}` to
  `<PaperSurface>` (`PaperIntelligencePaperSurfaceHarness.tsx:1252`).
- Verification: grammar-fill analysis surface gets `'in-passage'`; every other
  surface (reading / 七选五 / cloze / plain grammar-fill) gets `'rail'`.

### Step 4 — Verifier + CI
- Add `scripts/verify-i15-grammar-fill-blank-focus.mjs`: `blankFocusMode` default
  is `'rail'`; **`blankFocusMode` member is declared in `shared/papersurface/types.d.ts`
  (PA MF-2)**; `'in-passage'` suppresses the rail + renders blank buttons wired to
  the right questionId; `grammarFillBlankPattern` matches `56._____` /
  `57._____(absorb)`, does NOT match cloze `__41__` / 七选五 `_____36_____`, **and
  does NOT match a numeric-noise string (`trend of 2026 … 800g a day … 3-5g …
  25-30g`) — zero matches (SW-1; anchor on the `_{2,}` run, capture the number
  BEFORE the dot+underscores so `Increase intake 64._____ 3-5g` yields 64, not 3)**;
  `paperBlankPattern` source literal is **byte-unchanged** (regression guard: assert
  the exact pattern source string); harness passes `'in-passage'` only for the
  grammar-fill analysis model.
- Register in `scripts/verify-ci.mjs`; update `scripts/README.md`.
- Verification: `node scripts/verify-i15-grammar-fill-blank-focus.mjs` green; in
  `verify-ci`; do not regress `verify-i10-blank-rendering.mjs`,
  `verify-i14-grammar-fill-analysis-surface.mjs`,
  `verify-paper-intelligence-paper-surface-harness.mjs`.

### Step 5 — Browser QA (real paper, load-bearing — interaction change)
- Reuse the I14 QA asset (重庆巴蜀 `paper-960d0f8d`, grammar-fill analysis already
  on disk). Open the `语法解析` surface:
  - The bottom number rail is **gone**; the passage blanks `56._____` … `65._____`
    are styled, clickable buttons.
  - Clicking a blank opens that blank's analysis in the right pad (考点框架 + 代入
    + evidence + role/path) and highlights its evidence; keyboard Tab/Enter focuses
    a blank.
  - The active blank shows a visible active state; switching blanks updates.
  - **Regression**: open cloze (完形解析) + 七选五 + 阅读 surfaces — their rails +
    focus behavior are unchanged; I10 blank styling intact.
- Do not commit `app/public/paper-assets/**`.

## Forbidden

- Do NOT change the focus / rail behavior of reading / 七选五 / cloze surfaces
  (the `'rail'` default must be byte-for-byte current behavior).
- Do NOT modify `paperBlankPattern` or break any existing match (cloze `__41__`,
  七选五 `_____36_____`, I10-bounded cases). New recognition is a SEPARATE pattern,
  in-passage-mode only.
- Do NOT add a new focus intent type — reuse `request-lecture-focus`.
- Do NOT use module-level mutable state or a second post-render DOM pass to locate
  blanks (PA MF-1) — thread the focus context as props only.
- Do NOT touch generation / contract / schema / `analyzeGrammarFill.mjs` /
  `packageBuilder.mjs`, the I13/I14 analysis data shape, or the I14 adapter's
  evidence/textMap logic (this cut changes only the focus-affordance render).
- Do NOT commit generated `app/public/paper-assets/**` or `.claude/launch.json`.
- Do NOT reopen the I10 sentence-initial blank limitation (logged in the watch
  ledger) — anchor recognition on the underscore run.

## Suggested Files

- `shared/papersurface/types.d.ts` (add `blankFocusMode` to `PaperSurfaceProps`) —
  **PA MF-2: NOT `app/src/shared-ui/papersurface/types.ts` (does not exist)**; this is
  a `.d.ts` types sketch imported by `PaperSurface.tsx:38`, edited as type-doc only
  (the prop is consumed via the runtime destructure in `PaperSurface.tsx`).
- `app/src/shared-ui/papersurface/PaperSurface.tsx` (rail suppression + in-passage
  blank buttons + `grammarFillBlankPattern`)
- `app/src/shared-ui/papersurface/PaperSurface.css` (blank-button affordance — 阿澈)
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx` (pass prop)
- `scripts/verify-i15-grammar-fill-blank-focus.mjs` (new) + `scripts/verify-ci.mjs` + `scripts/README.md`

Adjust after code inspection; keep edits owner-file-aware.

## Verification

- Targeted: `node scripts/verify-i15-grammar-fill-blank-focus.mjs`,
  `node scripts/verify-i10-blank-rendering.mjs`,
  `node scripts/verify-i14-grammar-fill-analysis-surface.mjs`,
  `node scripts/verify-paper-intelligence-paper-surface-harness.mjs`, `git diff --check`.
- Full gate: `node scripts/verify-ci.mjs`; `npm run build --prefix app`.
- Browser QA: Step 5.

## Browser QA Matrix

| Case | Expected |
| --- | --- |
| Grammar-fill 语法解析 surface | no bottom number rail; in-passage blanks are clickable buttons |
| Click an in-passage blank | that blank's analysis opens in the right pad + evidence highlights |
| Keyboard Tab/Enter on a blank | focuses + opens the blank (a11y; replaces the rail) |
| Active blank | visible active state; switching updates card + highlight |
| cloze / 七选五 / 阅读 surfaces | rail + focus behavior UNCHANGED; I10 blanks intact |

## DEV Readiness

- This plan committed before PA; **PA before DEV** (shared-core interaction +
  product boundary). `pa-reviewer` (fresh Opus) writes
  `docs/cuts/I15-grammar-fill-blank-focus/pa.md`. Fold Must Fix into this plan
  (PA Follow-Up table) before DEV.
- PA attention asks: (1) is a separate `grammarFillBlankPattern` + in-passage-mode
  isolation enough to guarantee ZERO change to the other three surfaces and to
  I10? (2) blankNo→questionId resolution from `questions` — any ambiguity (dup
  numbers across sections, missing question)? (3) a11y: are `<button>` blanks a
  complete replacement for the rail's keyboard path (focus order, screen-reader
  labels)? (4) does suppressing the rail break any harness assumption that
  consumes the rail DOM (seed/focus effects, evidence line anchoring)?

## PA Follow-Up Decisions

PA verdict: **APPROVE WITH MUST FIX** (`pa.md`). 2 Must Fix folded; 0 PO
decisions. The highest-feared risk (retiring the rail breaks harness seed/focus
or the evidence line) was **disproven** by PA — the harness reads only
`[data-paper-section]` / `[data-paper-paragraph-id]` / `[data-paper-evidence-id]`,
never the rail; seed effects key off the model, not DOM. DEV may start.

| PA item | `pa.md` disposition | `plan.md` handling | Status |
| --- | --- | --- | --- |
| `MF-1` | `renderTextWithPaperBlanks` is module-level `(text, keyPrefix)`; focus context must be threaded Section→Paragraph→Sentence→renderer. Plan hid this behind "or a sibling renderer" → risk of a shortcut hack leaking into the `'rail'` path. | Step 2 rewritten: explicit prop-threading chain; `'rail'`/omitted path consumes ZERO new props + changes nothing; Forbidden adds no module-level mutable + no second DOM pass. | Closed |
| `MF-2` | Type path wrong: `app/src/shared-ui/papersurface/types.ts` does not exist; `PaperSurfaceProps` lives in `shared/papersurface/types.d.ts`. | Suggested Files path corrected to `shared/papersurface/types.d.ts` (.d.ts sketch; runtime via destructure); Step 4 verifier asserts `blankFocusMode` declared there. | Closed |

Should Watch (DEV keep in view, non-blocking): SW-1 anchor `grammarFillBlankPattern`
on `_{2,}`, capture number before dot+underscores, verifier adds a numeric-noise
negative (folded into Step 4); SW-2 unmatched blank → styled non-interactive, not a
dead button (folded into Step 2); SW-3 read the same `lectureFocus` source as the
rail (folded into Step 2); SW-4 Tab order follows 56→65 — confirm in browser QA.
