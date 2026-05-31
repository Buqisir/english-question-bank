# I11 — Symbol Normalization (渲染格式 cut · 第二刀「符号归一 2a」)

`cut size: medium; touches schema / data contract / product boundary / teaching interpretation: yes`

Import-side change: it rewrites **stored** passage/stem/option text content (not a
render-time regex). Cross-family (Reading / 七选五 / 完形 / 语法填空 / 写作). Couples to
the C1 evidence-quote exact-match contract and the C2 I10 blank-marker shapes. Medium cut
→ PA before DEV (done, fresh Opus, two passes; `pa.md`), CR before merge, browser QA
load-bearing.

Authority (source of truth, read these not chat):
`docs/product/exam-paper-format-standards.md` §"Import Normalization Principle" +
§"Global Typography"; visual targets `exam-paper-format-reference/images/page-03..10-*.jpeg`.

## Goal (LOCKED — slice 2a only)

A shared, pure, dependency-free `normalizePassageText(text)` applied **at parse time** to
all **English-content** text fields, doing exactly **three deterministic, meaning-safe**
rules:

1. **Half-width punctuation in English context.** Full-width `，。？！；：（）「」` etc. →
   English half-width equivalents — **only when adjacent to English (ASCII letter/digit)
   and NOT adjacent to a CJK character.** Chinese instruction text (`第二部分 阅读`) and
   Chinese gloss interiors keep their full-width Chinese punctuation. (Owner decision D2.)
2. **One space after English punctuation.** `[.,;:!?]` directly followed by a letter →
   insert one space (`21.Next` → `21. Next`, `A.Option` → `A. Option`). Generalizes
   grammar-fill's existing L175 rule cross-family. MUST NOT widen to digits (must not touch
   `56`).
3. **生词括号留空格.** A parenthesis pair whose **interior contains CJK** gets English
   half-width parens + spaces around them: `photosynthesis(光合作用)process` →
   `photosynthesis (光合作用) process` (composes with rule 1 for full-width `（）`). **Scoped
   to CJK-interior parens only** so it never touches grammar-fill prompt parens `(wear)` or
   blank parens `(56)` (those are owned at publish by `normalizeGrammarFillText` L177-178).

**Out of scope — deferred to slice 2b (do NOT implement):** curly quotes (straight/Chinese
→ English curly, needs open/close direction detection) and em dash (`---`/`——` → English
`–`, needs context judgment). The standard's "if normalization may change meaning, stop and
surface for human review" rule bites there. 2a is deterministic only.

## Critical constraints (VERIFIED this session by path — design around these)

### C1 — Normalize UPSTREAM of evidence-quote baking, at PARSE time. (resolved — see D4)

Reading/七选五/cloze analysis bakes AI evidence quotes that must **exactly match the stored
passage text**: `server/paper-import-ai/analyzeReading.mjs:140` —
`if (!paragraphText.includes(quote)) throw … 'quote 必须精确匹配原文。'` (verified verbatim;
seven-choices `analyzeSevenChoices.mjs:162,200,203`, cloze `analyzeCloze.mjs:198-238`).
Render locates evidence by **plain `indexOf`** with **no fuzzy fallback** on the AI-import
path (`paperAssetSurfaceAdapter.ts:312` `sentence.text.indexOf(quote)`,
`adapter/piToPaperEvidence.ts:94`) — first divergent byte → `-1` → highlight silently lost.

The import pipeline is **three separate route calls** (`server/paper-import-ai/routes.mjs`):
`/parse` (L107-ish returns parseResult) → `/analyze*` (validates+bakes quotes) → `/publish`
(L134 → `packageBuilder.mjs:184` stores passage + analysis). **The PA's MF-1 proved that
normalizing at `/publish` is downstream of quote-baking and would diverge stored quote from
stored passage → silent highlight loss.** Resolution (D4): hook the normalizer at **`/parse`**,
upstream of `/analyze`, so the normalized text flows identically into analyze (quotes baked
against normalized text) AND publish (stores the same normalized text). Stored quote ⊆ stored
passage **by construction** — no quote-field walking, no publish re-validation needed.

PA verified the load-bearing assumption by path: `/parse` result is stored immutably in
`PaperImportAiWorkbench.tsx` state (`result`, set once ~L287, never mutated); `/analyze` reads
`group.paragraphs[].text` from `result`, `/publish` reads the same `parseResult: result`. Both
see identical text. There is no editable text surface in the workbench (only file pickers +
provider select), so no teacher-edit divergence path.

**Existing-asset policy (owner decision D1):** new imports normalize from now on. Of the 3
on-disk assets, **re-import exactly ONE for browser QA**, leave the other two as-is. No bulk
migration script. Never commit `app/public/paper-assets/**`.

### C2 — MUST NOT regress I10's blank markers (byte-intact).

I10's styled blanks (render regex `paperBlankPattern` `PaperSurface.tsx:62`) depend on
literal markers surviving in stored text: 七选五 `_____36_____` (3+ underscores, raw at
parse), 完形 `__41__` (2 underscores, raw at parse), 语法填空 `  56  ` (2 **regular** spaces,
minted by `normalizeGrammarFillText` at publish `packageBuilder.mjs:165-182,525`). 2a's three
rules must leave all three shapes **byte-identical**:

- `normalizePassageText` MUST NOT contain any "collapse multiple spaces" rule.
- Underscores are untouched by all 3 rules (rules act on punctuation / CJK-interior parens).
- The `  56  ` marker does **not exist at parse** — `normalizePassageText` only ever sees raw
  grammar text (`56.` / `(56)`). Rule 2 adding a space after `56.` actually *helps* L169 fire
  (it needs `(?=\s)`); rule 3 is CJK-only so it never touches `(56)`. Compose order is
  **parse:`normalizePassageText` → publish:`normalizeGrammarFillText`** — the shared
  normalizer never sees the two-space marker.
- The verifier MUST lock all of this with byte-intact sentinels + a grammar compose-order
  idempotency case (a future rule edit could silently re-break I10).

## Implementation contract (DEV scope — `server/**` is a forbidden zone; this assigns it)

This cut explicitly assigns DEV scope inside `server/paper-import-ai/**` (new module +
`docxSplitter.mjs` hook) and `scripts/` (new verifier + its registration). DEV touches
**nothing else** — and in particular `packageBuilder.mjs` is **NOT modified** (D4 moved the
hook to parse; its existing `normalizeGrammarFillText(p.text)` at L525 stays and runs second).

### Step 1 — new pure module `server/paper-import-ai/normalizePassageText.mjs`

Export `normalizePassageText(text)`. Pure, dependency-free (no imports), idempotent
(`f(f(x)) === f(x)`). Implements exactly the 3 rules above (rule 3 CJK-interior-parens-only).
No space-collapsing. No curly-quote / em-dash logic.

### Step 2 — apply at the PARSE-time assembled-paragraph build sites in `docxSplitter.mjs`

Apply `normalizePassageText` to the **assembled** English-content `text:` values at each
paragraph/stem/option build site — **NOT inside `normalizeLine`**. `normalizeLine`
(`docxSplitter.mjs:13-19`) runs on every raw line *before* the structural parsers
(`questionStart` keys on `[.．、]`, answer-range, cloze/grammar option regexes); changing
punctuation there would shift parse classification. Wrap the final `text:` value after all
line parsing/filtering instead. Build sites (PA-verified landmarks — DEV maps by structure):
- Reading paragraphs `buildParagraphs` ~L313-316; reading stem + option text at their build
  sites.
- Cloze paragraphs ~L542-545; cloze stem ~L413-area, option text.
- 七选五 paragraphs ~L826-829; stem ~L329-area, optionBank text.
- 语法填空 paragraphs ~L707-710 (stem too). `normalizeGrammarFillText` still runs at publish
  on this already-normalized text — confirm no conflict (C2).
- 写作 English passage paragraphs ~L940-943 / ~L990-993 / ~L1000-1003; English starter text.

**Do NOT apply it to Chinese heading / instruction blocks** (these live in `packageBuilder.mjs`
as literal `text:` strings, `第二部分 阅读` etc., and are not touched anyway since the hook is in
`docxSplitter`). Rule 1's CJK-awareness is a second safety layer regardless.

### Step 3 — verifier `scripts/verify-i11-symbol-normalization.mjs`, registered in CI

Importable table-driven verifier over the real exported `normalizePassageText` (owner D3 —
pure-function + table cases, NOT I10-style source extraction). Register in
`scripts/verify-ci.mjs` `registry.scripts` (append; verified L14-46). Cases:

- **Rule 1:** `Hello，world` → `Hello, world`; Chinese-run `他说，你好世界` → **unchanged**.
- **Rule 1 mixed English/CJK seam** (SW-4): a punctuation char with English on one side and
  CJK on the other (`word，中文`) — DEV defines which side wins; the case locks it
  deterministically. If DEV cannot make it deterministic, escalate to PO.
- **Rule 2:** `21.Next` → `21. Next`; `A.Option` → `A. Option`; already-spaced → unchanged.
- **Rule 3:** `photosynthesis(光合作用)process` → `photosynthesis (光合作用) process`;
  full-width `（光合作用）` → same (rule 1 + 3 compose); prompt paren `(wear)` and `(56)` →
  **unchanged** (CJK-only scope).
- **Grammar compose-order idempotency** (the real (e) tripwire): a grammar paragraph string
  through `normalizePassageText` then (conceptually) `normalizeGrammarFillText` yields the
  expected `  56  ` markers, and the shared normalizer alone leaves raw grammar parens intact.
- **C2 byte-intact sentinels (load-bearing tripwire):** `_____36_____` → identical;
  `__41__` → identical; `  56  ` → identical.
- **Idempotency:** for every "after" string, `f(after) === after`.
- **2b NOT done:** straight-quote / `---` input passes through unchanged.

CR must **mutation-test** this verifier (I10 CR lesson): disable one rule → verifier must go
red. A verifier that can't catch a planted regression is a fake green.

## Forbidden / out-of-scope

- 2b (curly quotes, em dash). Render-side anything. Hooking into `normalizeLine` (breaks parse
  classification). Modifying `packageBuilder.mjs` (D4 keeps it unchanged). Touching `app/**`,
  `app/public/paper-assets/**` commits, `schemas/**`, other `server/**` dirs, any
  `scripts/verify-*` besides the new one + its registration. Adding a space-collapsing rule.
  Widening rule 2 to digits. Bulk migration scripts. Re-importing more than the one QA paper.
  Committing `.claude/launch.json`.

## Verify

- `node scripts/verify-i11-symbol-normalization.mjs` green (all cases above incl. C2
  sentinels, mixed-seam, grammar compose-order, idempotency).
- `node scripts/verify-ci.mjs` green — the new script registered; **`verify-i10-blank-rendering.mjs`
  still green** (suite-level proof of no marker regression).
- **Browser QA (load-bearing)** — re-import ONE real paper from
  `/Users/huangxuewei/Desktop/26年3月高三试卷/`, open Reading / 七选五 / 完形 / 语法填空:
  1. English punctuation / spacing / gloss normalized on all surfaces.
  2. All I10 styled blanks still render (C2) across 七选五 / 完形 / 语法填空.
  3. **(MF-2)** An evidence highlight on a quote **known to contain a normalized character**
     (full-width-comma English clause or glossed word) still resolves — in **Reading AND at
     least one of 完形/七选五** — proving D4's parse-time consistency holds end-to-end.
  Clean up; never commit the asset.

## Browser QA Result (2026-05-31 — PASS, load-bearing gate discharged)

Re-imported ONE real paper (石室中学高三二诊, real `gpt-5.5` analysis, 6 sections) to a
throwaway asset `paper-qa-i11` (never committed; cleaned up after QA). Verified on the live
PaperSurface across Reading / 完形 / 七选五:

- **① Normalization visible:** half-width punctuation + spacing throughout; CJK gloss renders
  spaced half-width parens — Reading `(休眠的)`, 完形 `(悲痛)`/`(份额)`, 七选五 `(双一流)`/`(数字游民)`.
  Chinese instruction text kept full-width (`…A、B、C、D…`).
- **② C2 — I10 blanks still styled:** 完形 `__41__`…`__54__` and 七选五 `_____36_____`…
  render as the styled underline+number blank. No regression.
- **③ MF-2 / D4 end-to-end — evidence highlight on a normalized-char quote resolves:**
  Reading highlight on `"Located in the Chiriqui Highlands, the dormant (休眠的) volcano…"`
  (spans BOTH a normalized comma AND a spaced gloss) resolves and renders. Data-level proof:
  **109/109** real-AI-baked evidence quotes `includes()`-match the stored normalized passage
  (51 of them contain a normalized character) — zero silent highlight loss. This is exactly
  the failure mode the publish-time hook would have caused; the parse-time hook (D4) fixes it.

Next: PO QA (owner) → RM merge.

## PA Follow-Up Decisions (PM compression of `pa.md`, 2026-05-31)

PA verdict: APPROVE WITH MUST FIX (2 MF), then re-validated D4=(e) as SOUND with no new MF.

- **MF-1 (quote/passage divergence) → RESOLVED by D4 = option (e), parse-time hook.** PA's (a)
  (normalize stored quote fields at publish) is superseded: normalizing at `/parse` makes
  stored quote ⊆ stored passage by construction, so no quote-field walking and no publish
  re-validation are needed. `packageBuilder.mjs` reverts to unchanged. The wrong "analysis &
  storage share normalized text" hand-wave in the old C1 / old PA-Lite item 5 is corrected
  above: analysis now genuinely reads normalized text because the hook is upstream of it.
- **MF-2 (fake-green risk) → folded into Step 3 + Browser QA.** Verifier gains the grammar
  compose-order idempotency case (the real (e) tripwire); browser QA must check a highlight on
  a known-normalized quote across Reading AND one of 完形/七选五. CR mutation-tests the verifier.
- **SW-1..SW-5** (line drift, `compact()` overlap, C2-by-construction, rule-1 seam, rule-1×3
  gloss) → addressed by the verified build-site landmarks (Step 2), the idempotency + mixed-seam
  + prompt-paren verifier cases (Step 3), and the rule-3 CJK-only scope.

## Decisions (owner-confirmed 2026-05-31)

- **D1** existing assets: re-import ONE for QA, leave the other two; new imports normalize
  henceforth; no bulk migration script.
- **D2** half-width boundary: English-adjacent only; all CJK-run punctuation preserved.
- **D3** verifier: pure-function + table-driven cases, registered in `scripts/verify-ci.mjs`;
  CR mutation-tests it.
- **D4** normalize at **parse time** (`docxSplitter.mjs` assembled build sites), upstream of
  evidence-quote baking — root-cause fix for MF-1. `packageBuilder.mjs` unchanged.

## Process

Flow: PM plan.md (this) → fresh-Opus `pa-reviewer` `pa.md` (done, 2 passes) → PM compression
(this section) → Sonnet DEV (scope assigned above) → CR-lite (fresh Opus, mutation-test
verifier) `cr.md` → browser QA → PO QA → RM merge. Remote is **`github`**, base `main`. Stage
explicitly — never `git add -A`.
