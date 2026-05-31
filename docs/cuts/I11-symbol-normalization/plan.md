# I11 — Symbol Normalization (渲染格式 cut · 第二刀「符号归一 2a」)

`cut size: medium; touches schema / data contract / product boundary / teaching interpretation: yes`

Import-side change: it rewrites **stored** passage/stem/option text content (not a
render-time regex). Cross-family (Reading / 七选五 / 完形 / 语法填空 / 写作). Couples to
the C1 evidence-quote exact-match contract and the C2 I10 blank-marker shapes. Medium cut
→ PA before DEV (fresh Opus `pa-reviewer`), CR before merge, browser QA load-bearing.

Authority (source of truth, read these not chat):
`docs/product/exam-paper-format-standards.md` §"Import Normalization Principle" +
§"Global Typography"; visual targets `exam-paper-format-reference/images/page-03..10-*.jpeg`.

## Goal (LOCKED — slice 2a only)

A shared, pure, dependency-free `normalizePassageText(text)` applied at import to all
**English-content** text fields, doing exactly **three deterministic, meaning-safe** rules:

1. **Half-width punctuation in English context.** Full-width `，。？！；：（）「」` etc. →
   English half-width equivalents — **only when adjacent to English (ASCII letter/digit)
   and NOT adjacent to a CJK character.** Chinese instruction text (`第二部分 阅读`) and
   Chinese gloss interiors keep their full-width Chinese punctuation. (Owner decision D2.)
2. **One space after English punctuation.** `[.,;:!?]` directly followed by a letter →
   insert one space. Includes question-number dots and option-label dots (`21.Next` →
   `21. Next`, `A.Option` → `A. Option`). Generalizes grammar-fill's existing L175 rule
   cross-family.
3. **生词括号留空格.** Chinese gloss in English parentheses gets spaces around the parens so
   they don't stick to neighboring English words: `photosynthesis(光合作用)process` →
   `photosynthesis (光合作用) process`. This composes with rule 1 (full-width gloss parens
   `（）` first convert to half-width, then get surrounding spaces).

**Out of scope — deferred to slice 2b (do NOT implement):** curly quotes (straight/Chinese
→ English curly, needs open/close direction detection) and em dash (`---`/`——` → English
`–`, needs context judgment). These are where the standard's "if normalization may change
meaning, stop and surface for human review" rule bites. 2a is deterministic only.

## Critical constraints (VERIFIED this session by path — design around these)

### C1 — MUST be import-side, NOT render-side.

Reading analysis requires evidence quotes to **exactly match the stored passage text**:
`server/paper-import-ai/analyzeReading.mjs:140` —
`if (!paragraphText.includes(quote)) throw … 'quote 必须精确匹配原文。'` (verified verbatim).
Render-time normalization would diverge displayed text from stored text and break evidence
highlighting. So normalization happens at import, on the stored text, before/at package
build — there is no render-side shortcut.

**Existing-asset policy (owner decision D1):** new imports normalize from now on. Of the 3
on-disk assets (`paper-2024-jslk-english`, `paper-960d0f8d`, `paper-fe8e7a65`), **re-import
exactly ONE for browser QA**, leave the other two as-is. No bulk migration script (a script
that normalized stored passage text but not the stored evidence quotes would itself break
C1; re-import regenerates both consistently). Never commit `app/public/paper-assets/**`.

### C2 — MUST NOT regress I10's blank markers (byte-intact).

I10's styled blanks depend on literal marker shapes surviving in stored text:
七选五 `_____36_____` (3+ underscores), 完形 `__41__` (2 underscores), 语法填空 `  56  `
(2 **regular** spaces, from `normalizeGrammarFillText`, `packageBuilder.mjs:165-182`).
2a's three rules must leave all three marker shapes **byte-identical**. In particular:

- `normalizePassageText` MUST NOT contain any "collapse multiple spaces" rule. (The existing
  `normalizeGrammarFillText` L173 `[ ]{3,}→'  '` and `docxSplitter.normalizeLine` L17
  `[ ]{2,}→' '` already exist and are out of this cut's scope — do not add another.) A
  space-collapsing rule would destroy `  56  ` and `_____36_____`.
- None of the 3 rules touch underscores; rules 1/3 act on punctuation/parens; rule 2 acts on
  `[.,;:!?]`+letter. The markers contain none of these triggers, so they are safe — but the
  verifier MUST lock this with byte-intact sentinel cases (see §Verifier), because a future
  rule edit could silently re-break I10.

## Implementation contract (DEV scope — `server/**` is a forbidden zone; this assigns it)

This cut explicitly assigns DEV scope inside `server/paper-import-ai/**`. DEV does NOT touch
anything else under `server/**`, `scripts/verify-*` (except the new verifier + its
registration), `app/**`, `schemas/**`, or `app/public/paper-assets/**`.

### Step 1 — new pure module `server/paper-import-ai/normalizePassageText.mjs`

Export `normalizePassageText(text)`. Pure, dependency-free (no imports), idempotent
(`normalizePassageText(normalizePassageText(x)) === normalizePassageText(x)`). Implements
exactly the 3 rules above. No space-collapsing. No curly-quote / em-dash logic. DEV works out
the exact regexes; PA scrutinizes the context-boundary regex (rule 1) and the rule-1/rule-3
interaction (see PA-Lite focus list).

### Step 2 — apply at the English-content hook points in `packageBuilder.mjs`

Apply `normalizePassageText` to the **English-content** `text:` fields only:
- Reading: stem, option text, passage paragraphs (option text ~L241, paragraphs ~L260).
- 七选五: stem, option text (~L349), passage paragraphs (~L354).
- 完形: stem, option text (~L419), passage paragraphs (~L440).
- 语法填空: stem, and passage text **by composition** — `normalizeGrammarFillText` already
  runs at L525. COMPOSE so the shared normalizer runs on the raw text FIRST, then grammar
  inserts its `  56  ` markers: `normalizeGrammarFillText(normalizePassageText(p.text))`.
  Do NOT apply the shared normalizer after the markers exist; do not double-apply or add a
  conflicting space rule.
- 写作: English passage paragraphs (~L620) and the English starter text (~L668).

**Do NOT apply it to the Chinese heading / instruction blocks** (`第二部分 阅读` etc. at
~L224/225, L367/368, L460-462, L553/554, L601-604, L660-668). These are Chinese and out of
scope. (Rule 1's context-awareness makes the function safe on CJK text as a second layer of
protection, but apply it only at English-content fields to keep intent explicit.)

Line numbers are landmarks from this session; DEV maps by structure, not by trusting the
exact line. Verify each hook is a passage/stem/option/starter English-content field.

### Step 3 — verifier `scripts/verify-i11-symbol-normalization.mjs`, registered in CI

Importable table-driven verifier over the real exported `normalizePassageText` (owner
decision D3 — pure-function + table cases, NOT I10-style source extraction; the function is
directly importable). Register in `scripts/verify-ci.mjs` `registry.scripts`. Cases:

- **Rule 1:** `Hello，world` → `Hello, world`; `它（the cell）` English-adjacent paren
  converts; Chinese-run `他说，你好世界` → **unchanged** (CJK-adjacent comma stays full-width).
- **Rule 2:** `21.Next` → `21. Next`; `A.Option` → `A. Option`; already-spaced `A. Option`
  → unchanged (idempotent).
- **Rule 3:** `photosynthesis(光合作用)process` → `photosynthesis (光合作用) process`;
  full-width `photosynthesis（光合作用）process` → same (rule 1 + 3 compose).
- **C2 byte-intact sentinels (load-bearing — these are the regression tripwire):**
  `_____36_____` → identical; `__41__` → identical; `  56  ` (two regular spaces) → identical.
- **Idempotency:** for every "after" string, `f(after) === after`.
- **2b NOT done:** a straight-quote / `---` input passes through unchanged (proves 2b wasn't
  smuggled in).

CR must **mutation-test** this verifier (I10 CR lesson, watch-ledger): deliberately disable
one rule and confirm the verifier goes red. A verifier that can't catch a planted regression
is a fake green.

## Forbidden / out-of-scope

- 2b (curly quotes, em dash). Render-side anything. Touching `app/**`,
  `app/public/paper-assets/**` commits, `schemas/**`, other `server/**` dirs, any
  `scripts/verify-*` besides the new one + its registration. Adding a space-collapsing rule.
  Bulk migration scripts. Re-importing more than the one QA paper.

## Verify

- `node scripts/verify-i11-symbol-normalization.mjs` green (incl. C2 sentinels + idempotency).
- `node scripts/verify-ci.mjs` green (the new script registered; I10 verifier still green —
  proves no marker regression at the suite level too).
- Browser QA (load-bearing): re-import ONE real paper from
  `/Users/huangxuewei/Desktop/26年3月高三试卷/`, open Reading / 七选五 / 完形 / 语法填空
  surfaces. Confirm: (a) English punctuation/spacing/gloss normalized; (b) all I10 styled
  blanks still render (C2); (c) a Reading evidence highlight still matches the passage (C1 —
  normalized text didn't break quote-exact-match). Clean up; never commit the asset.

## PA-Lite focus list (what the fresh-Opus PA must scrutinize first)

1. **C2 byte-intactness** — does any of the 3 regexes, on the 3 marker shapes, alter a single
   byte? Especially the rule-3 close-paren `') '` insertion and rule-2 punct+letter.
2. **Rule 1 context boundary** — is "English-adjacent, not CJK-adjacent" expressible as a
   deterministic regex with no meaning-change risk? Watch the seam where an English clause
   ends and a Chinese clause begins in the same paragraph.
3. **Rule 1 × Rule 3 interaction** on full-width gloss parens `（中文）` inside English.
4. **Compose order** for grammar-fill (shared-then-grammar) — confirm markers are created
   after the shared normalizer runs, never seen by it.
5. **C1** — does normalizing stored passage text risk diverging from stored Reading evidence
   quotes for newly-imported papers? (Both come from the same normalized text at import, so
   they should stay consistent — PA confirm the analyze step reads post-normalization text.)
6. **Idempotency** of the full pipeline.

PA may escalate with `CONTEXT INSUFFICIENT` / `SPEC CONTRADICTS` / `SCOPE UNCLEAR` instead of
a partial report. When PA returns Must Fix, `pa.md` must map each Must Fix → required
`plan.md` disposition; PM compresses into a `PA Follow-Up Decisions` section here before DEV.

## Decisions (owner-confirmed 2026-05-31)

- **D1** existing assets: re-import ONE for QA, leave the other two as-is; new imports
  normalize from now on; no bulk migration script.
- **D2** half-width boundary: English-adjacent only; all CJK-run punctuation preserved.
- **D3** verifier: pure-function + table-driven before/after cases, registered in
  `scripts/verify-ci.mjs`; CR mutation-tests it.

## Process

Flow: PM plan.md (this) → fresh-Opus `pa-reviewer` writes `pa.md` → PM compresses PA
Follow-Up Decisions → Sonnet DEV (scope assigned above) → CR-lite (fresh Opus, mutation-test
verifier) writes `cr.md` → browser QA → PO QA → RM merge. Remote is **`github`**, base
`main`. Stage explicitly — never `git add -A` (untracked `.claude/launch.json` must NOT be
committed; never commit `app/public/paper-assets/**`).
