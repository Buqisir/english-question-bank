# PA Review — I11 Symbol Normalization (slice 2a)

Reviewer: fresh-Opus PA (小川 PA hat), cold read on branch `i11-symbol-normalization`.
Date: 2026-05-30. Plan under review: `docs/cuts/I11-symbol-normalization/plan.md`
(commit `05b8903`).

## MF-1 RESOLUTION — D4 = option (e) parse-time normalization. VALIDATED SOUND. (2026-05-31)

PM follow-up: PO chose a new option (e) — move `normalizePassageText` UPSTREAM to the
`/parse` stage (inside `docxSplitter.mjs`) instead of my recommended (a) (walk-and-normalize
the stored analysis quotes at `/publish`). I re-reviewed cold, by path, with intent to break
it. **Verdict: (e) is sound and strictly better than (a). No new Must Fix. The original MF-1
(quote/passage divergence) is fully resolved by construction. Plan must move the hook from
`packageBuilder.mjs` to `docxSplitter.mjs` and re-scope Allowed/Forbidden accordingly.**

### Q1 — Does parseResult flow IDENTICALLY to both `/analyze` and `/publish`? YES (verified).

This is the load-bearing assumption and it holds without exception:

- `/parse` (`routes.mjs:97-102`) returns the parse result object to the client; client stores
  it in React state `result` (`PaperImportAiWorkbench.tsx:231`, `setResult(parsed)` at L287),
  and it is **never mutated after parse** (see Q4).
- `/analyze` is called with `group` taken straight from `result.readingGroups`
  (`PaperImportAiWorkbench.tsx:750` → `handleAnalyze(group)`; the call body L366-370 sends
  `paper: result.paper, group`). Server validates evidence quotes against
  `group.paragraphs[].text` — `analyzeReading.mjs:133` builds `paragraphsById` from
  `group.paragraphs`, and L138-140 `if (!paragraphText.includes(quote)) throw …`. Cloze does
  the same against `passageText`/option text (`analyzeCloze.mjs:252` and L245-248);
  seven-choices likewise.
- `/publish` is called with `parseResult: result` (`PaperImportAiWorkbench.tsx:460`); server
  reads passage text from the SAME `group.paragraphs[].text` (`packageBuilder.mjs:258-261`
  reading, `:523-525` grammar-fill, etc.).

So `/analyze` and `/publish` read the **same string object** `result.<group>.paragraphs[].text`.
If `normalizePassageText` runs at `/parse` (before `result` is ever produced), then BOTH the
AI quote-validation (quotes get matched/baked against normalized text) AND the stored passage
are normalized from the identical source bytes. Stored quote ⊆ stored passage **by
construction** — `indexOf` on the render side (`paperAssetSurfaceAdapter.ts:312`,
`piToPaperEvidence.ts:94`) cannot miss, because the quote the AI returned was validated against
the already-normalized paragraph. This is why (e) needs NO quote-field walking (my option (a))
and NO publish-time re-validation (option (b)). It is the cleaner fix.

### Q2 — Exact hook location at parse. Must run on ASSEMBLED paragraph text, NOT inside `normalizeLine`. (verified)

`normalizeLine` (`docxSplitter.mjs:13-19`) is line-level and runs on **every** raw line before
section classification, marker detection, question-start regexes, option splitting, answer-range
parsing, etc. Hooking `normalizePassageText` inside `normalizeLine` is UNSAFE for two reasons:

1. It would feed normalized punctuation into the structural parsers (`questionStart` L154 keys on
   `[\.．、]`, `classifySectionLine`, `parseAnswerRanges` L109, cloze/grammar option regexes
   that match on `．`/full-width forms). Changing punctuation before parsing risks shifting which
   lines are classified as headings/options/answers — a parse-behavior change well outside this
   cut's intent. **Forbidden.**
2. A gloss `（中文）` or a punctuation run is not split across lines in this pipeline (mammoth
   gives paragraph-granular lines and `toLines` splits only on `\n`), but rule 1's
   "not-CJK-adjacent" lookaround and rule 3's gloss-paren spacing are only meaning-safe when they
   see the whole paragraph, not a fragment.

**Correct insertion point:** apply `normalizePassageText` to the final assembled **paragraph
`text:` value** at the moment each `paragraphs` array is built — i.e. wrap the `text:` in the
`.map(...)` that produces paragraph objects, AFTER all line-level parsing/filtering is done:

- reading `buildParagraphs` `docxSplitter.mjs:313-316` (`text: line`)
- cloze `parseClozeGroup` `:542-545` (`text: line`)
- grammar-fill `parseGrammarFillGroup` `:707-710` (`text: line`)
- seven-choices `parseSevenChoicesGroup` `:826-829` (`text: line`)
- writing application `extractApplicationParagraphs` `:940-943`; continuation `:990-993`/`:1000-1003`;
  continuation starters `extractContinuationContent` (the `starters` strings)
- reading title fallback `:337-340`

Apply ONLY to English-content paragraph/option/stem/starter `text:` fields, not to the Chinese
instruction/heading lines that `normalizeLine` produces for section detection (rule 1's
CJK-guard makes it safe even if it leaked, but keep intent explicit — same discipline the
original plan demanded). Stems/options for reading/cloze are stored on `question.stem` /
`question.options` produced at parse (`parseQuestionBlock` L270-280, cloze L556-571); normalize
those at their build sites too so the AI sees the same option text it later validates
`signalSide:'option'` evidence against (`analyzeCloze.mjs:245-248`).

Line-level is NOT safe; assembled-paragraph (and assembled-stem/option) level IS the correct hook.

### Q3 — C2 raw markers + grammar compose order at parse time. SAFE, with one DEV guard. (verified)

At `/parse` the markers are in RAW form, and the new compose order is:
**parse:`normalizePassageText` (on raw grammar paragraph text) → publish:`normalizeGrammarFillText`
(`packageBuilder.mjs:525`).** Checked each collision:

- **完形 `__41__` / 七选五 raw underscores:** at parse these are runs of underscores; none of
  rules 1/2/3 touch `_`. Byte-intact. (The styled marker `_____36_____` / `__41__` shapes are
  preserved into stored text exactly as today.)
- **语法填空 raw blank `56.` / `56` / `(56)`:** the `  56  ` two-space marker does NOT exist at
  parse — it is minted later by `normalizeGrammarFillText` L171. So at parse `normalizePassageText`
  only ever sees raw digit forms. Interactions:
  - Rule 2 (`[.,;:!?]`+letter→space): on `56.Next` inserts `56. Next`. `normalizeGrammarFillText`
    L169 (`\b(\d{2})[.．、](?=\s)→$1`) REQUIRES whitespace after the dot to strip it — so rule 2
    running first HELPS L169 fire, it does not fight it. On `56.` followed by digit/EOL rule 2
    does not fire (it only fires before a letter), leaving the form for L171's `(^|\s)(\d{2})(\s|$)`
    handling. No conflict.
  - Rule 3 (gloss-paren spacing) MUST be scoped to parens whose interior contains a CJK char
    (the plan's own wording: "Chinese gloss in English parentheses"). Scoped that way it does NOT
    touch `(56)` (digits) or the inline prompt `(wear)` (ASCII) — `normalizeGrammarFillText` L177
    (`(\d{2})[(（]→$1 (`) and L178 (`[)）](?=\S)→) `) own those. **DEV guard (already SW-5):** rule 3
    must require CJK interior; if DEV writes rule 3 to fire on ANY paren it would pre-space `(wear)`,
    but L178's idempotency (`)`-followed-by-non-space) makes even that non-destructive — still,
    scope rule 3 to CJK to keep intent clean. Verifier MUST include a grammar-paragraph idempotency
    case containing both `56.`/`(56)` and an inline `(wear)` prompt proving parse→publish compose is
    byte-stable on the eventual `  56  ` marker (this is the SW-5 + C2 sentinel case, now made
    load-bearing for the compose order, not just for the shared function in isolation).
  - Rule 1 (full-width→half-width when ASCII-adjacent, not CJK-adjacent): a full-width period
    `。` after a digit normalizes to `.`, which L169 then handles. Harmless and intended.

Net: the two functions do not fight; the parse:normalizePassageText → publish:normalizeGrammarFillText
order is correct and the C2 marker bytes survive. The original plan's compose-order analysis
(`normalizeGrammarFillText(normalizePassageText(p.text))` at a single publish site) is REPLACED by
this two-stage order — same net effect, but now the shared normalizer never co-exists in one
expression with grammar's marker insertion, which is if anything cleaner.

### Q4 — Teacher-edit path. NO divergence risk; (e) needs NO extra guard. (verified)

The workbench has NO editable text surface for passage/stem/option content: the only `<input>`
elements are file pickers (`PaperImportAiWorkbench.tsx:515,547`) and the provider `<select>`
(L575). There is no `<textarea>`, no `contentEditable`, no onChange that mutates
`result.<group>.paragraphs[].text`. `result` is set once at parse (L287) and read immutably by
both analyze (L366-370) and publish (L460). So the teacher reviews the normalized text but cannot
edit it; post-parse text fed to analyze and publish is identical by definition. Even in the
hypothetical future where editing is added, as long as the edited text flows through the SAME
`result` object to both analyze and publish (which it would), consistency holds whether or not the
edit re-normalizes — analyze and publish always see the same bytes. (e) is robust to this; no guard
required for 2a.

### Q5 — Net verdict: (e) strictly better than (a). No fatal flaw.

- (a) walks N quote fields across 3 analysis families at publish and re-applies the normalizer to
  each, hoping it produces bytes identical to the normalized passage. It works, but it is a
  *second* normalization site that must stay byte-for-byte in lockstep with the passage
  normalization forever — a latent drift hazard, and it does nothing about the AI having reasoned
  over un-normalized text.
- (e) normalizes ONCE, upstream, so analyze reasons/validates against normalized text and publish
  stores it. Consistency is structural, not maintained-by-discipline. It also sits exactly where
  text normalization already lives (`normalizeLine`), matching the existing whitespace-normalization
  architecture. The only cost (e) carries that (a) does not: the hook now lives inside the parser
  module, so DEV must place it at assembled-paragraph level (Q2) without disturbing the structural
  regexes — a real but bounded constraint, locked by the verifier + the unchanged I10 verifier +
  a re-import QA. No fatal flaw.

**Corrected DEV hook + scope (supersedes the original Allowed/Forbidden + Step 2 below):**
- New module `server/paper-import-ai/normalizePassageText.mjs` — unchanged from original plan.
- HOOK MOVES to `server/paper-import-ai/docxSplitter.mjs`: apply at the assembled paragraph/stem/
  option/starter `text:` build sites listed in Q2 (NOT inside `normalizeLine`).
- `packageBuilder.mjs` NO LONGER needs an I11 change. Its existing
  `normalizeGrammarFillText(p.text)` at L525 stays as-is and now runs second in the compose order.
  (`packageBuilder.mjs` moves from Allowed to "unchanged".) This also resolves the original MF-1's
  Forbidden-list exception — no analysis-quote storage is touched at all.
- Original MF-2 still applies but its disposition simplifies: the verifier passage-vs-quote case
  becomes "a quote containing a normalized char, validated against the normalized passage, still
  `includes()`-matches" — which under (e) is automatic; the load-bearing tripwire is now the
  grammar compose-order idempotency case (Q3) + the browser-QA highlight on a known-normalized
  quote across reading AND cloze/seven-choices.

Checklist update: original **MF-1 checklist item is satisfied by D4=(e)** with the hook relocated
to `docxSplitter.mjs` and `packageBuilder.mjs` reverted to unchanged. **MF-2 remains** (verifier +
browser-QA additions), unchanged in spirit.

---

## Verdict

**APPROVE WITH MUST FIX**

The three rules are the right deterministic subset, 2b is genuinely held out, the
C2 byte-intactness reasoning is sound, and the compose-order for grammar-fill is
correct. But the plan's central C1 claim — "analysis and storage come from the same
normalized text, so quotes stay consistent" — is **false against the actual import
pipeline**. Analysis runs at `/analyze` on RAW passage text and bakes exact-matched
evidence quotes; this cut normalizes the passage only later at `/publish` in
`packageBuilder.mjs`, and there is no re-normalization or re-validation of the stored
quotes. That is a silent, render-visible evidence-highlight regression for exactly the
papers this cut touches. Two Must Fix items below; both are plan/QA dispositions, not
DEV redesign.

**[2026-05-31 UPDATE] MF-1 is now RESOLVED by D4=option (e) (see top section).** Moving
`normalizePassageText` to `/parse` makes analyze + publish read the same normalized text by
construction, so the C1 divergence cannot occur. The "false claim" below is superseded: under (e),
analyze DOES read post-normalization text (because normalization happens before analyze).
MF-2 remains.

## Product Principle

Imported papers should be repaired toward Gaokao typography without changing meaning
(`docs/product/exam-paper-format-standards.md` §"Import Normalization Principle",
§"Global Typography"). The three 2a rules are exactly the deterministic, meaning-safe
subset of that standard; curly quotes + em dash correctly defer to 2b because they
need open/close and context judgment ("if normalization may change meaning, stop and
surface"). No product-boundary objection to the rule set.

## Exact Architecture Model (verified by path)

Import is a three-call pipeline, NOT a single normalize-then-store step
(`server/paper-import-ai/routes.mjs`):

1. `POST /parse` → `parseReadingDocxBuffer` → `parseResult` with raw paragraphs.
   `docxSplitter.normalizeLine` (`docxSplitter.mjs:13-19`) already collapses
   `[ ]{2,}→' '` and strips ` ` at this stage, but does NOT do full-width→half
   conversion, punct-spacing, or gloss-paren spacing. Returned to the client.
   **[D4=(e)] This is now the chosen home for `normalizePassageText` — at the assembled
   paragraph/stem/option build sites, not inside `normalizeLine`.**
2. `POST /analyze` (+ `/analyze-seven-choices`, `/analyze-cloze`) → AI produces
   evidence/trap quotes and **validates them against the RAW paragraph text**:
   - reading: `analyzeReading.mjs:140` `if (!paragraphText.includes(quote)) throw …
     'quote 必须精确匹配原文。'` (verified verbatim).
   - seven-choices: `analyzeSevenChoices.mjs:162,200,203` (signalText / before/afterQuote).
   - cloze: `analyzeCloze.mjs:198-238` (evidence exact-substring).
   These quotes are stored in the analysis JSON.
   **[D4=(e)] Under (e) the paragraph text reaching analyze is ALREADY normalized, so the AI
   validates/bakes quotes against normalized text — divergence eliminated upstream.**
3. `POST /publish` → `buildPaperImportAiPackageFiles` (`packageBuilder.mjs:184`) writes
   the stored passage text AND the stored analysis. **[D4=(e)] No I11 change here; passage
   text arrives already normalized; existing `normalizeGrammarFillText(p.text)` at L525 stays.**

Render-side, evidence is located by **plain `indexOf` of the stored quote inside the
stored passage**:
- AI-import / paper-asset path: `paperAssetSurfaceAdapter.ts:312`
  (`sentence.text.indexOf(quote)`) and `adapter/piToPaperEvidence.ts:94` — **no fuzzy
  fallback**. First divergent character → `indexOf` returns -1 → highlight silently lost.
- Legacy reading-analysis path: `evidenceLinking/quoteAnchors.ts:91,101` has a fuzzy
  fallback, but `normalizeQuoteOnly` (`quoteAnchors.ts:230-235`) only folds curly
  quotes, en/em dash, and whitespace runs. It does **NOT** fold full-width→half-width
  punctuation (rule 1) and does NOT equate zero-space vs one-space (rule 2). So even
  the fuzzy path does not rescue rule-1 / rule-2 divergences.
  **[D4=(e)] With normalization at parse, quote and passage are byte-consistent and `indexOf`
  hits without relying on any fuzzy fallback. The render-side limitation is moot.**

Net: for an AI-imported paper whose passage contained a full-width comma in an English
clause, or a `21.Next`-style run, inside an evidence span, normalizing the stored
passage breaks the highlight silently. The plan's framing (PA-Lite item 5) is wrong.
**[D4=(e)] superseded — (e) makes the highlight resolve by construction.**

## Must Fix Before DEV

### MF-1 — C1 quote/passage divergence is real; the plan's "stays consistent" claim must be replaced.

**[2026-05-31 RESOLVED via D4=option (e). See top section. The dispositions (a)/(b)/(c) below are
retained for the record but are NOT the chosen path; (e) supersedes all three.]**

**Risk.** Analysis (`/analyze`) validates and stores evidence quotes against RAW passage
text; this cut normalizes the STORED passage at `/publish` with no quote
re-normalization and no publish-time re-validation. Render uses
`sentence.text.indexOf(quote)` (`paperAssetSurfaceAdapter.ts:312`,
`piToPaperEvidence.ts:94`) with no normalization fallback on the AI-import path, so any
evidence/trap/locationParaphrase quote that spans a normalized character loses its
highlight silently. The legacy fuzzy fallback (`quoteAnchors.ts:230`) does not cover
rule 1 or rule 2. This is the exact silent breakage C1 was meant to prevent — moving to
import-side does NOT by itself solve it, because "import-side" here means the *publish*
step, downstream of the *analyze* step that produced the quotes.

**Required disposition (PO decision — pick one, record in plan.md):**
- (a) **Normalize the same quote strings the same way.** In `packageBuilder.mjs`, when
  storing analysis evidence, apply `normalizePassageText` to every stored quote field
  (`evidence[].quote`/`signalText`/`before|afterQuote`, `trapEvidence[]`,
  `trap.sourceQuote`, `locationParaphrases[].targetText`) so stored quote and stored
  passage are normalized by the *same* function and `indexOf` still hits. This expands
  DEV scope from "passage/stem/option text fields" to "and the analysis quote fields"
  and must be stated explicitly, with a verifier case (quote containing a full-width
  comma normalizes identically to the passage). OR
- (b) **Re-validate at publish and fail loudly.** After normalization, re-run the
  `includes(quote)` check inside `packageBuilder.mjs` for all three families and throw a
  publish error if any quote no longer matches — converting silent render loss into a
  loud publish failure the teacher sees. (Safe but can block real imports.) OR
- (c) **Explicitly de-scope** by recording that 2a deliberately accepts evidence-highlight
  loss on normalized characters, with a named follow-up cut. (Weakest; contradicts C1's
  own stated purpose.)
- **(e) [CHOSEN 2026-05-31] Normalize at `/parse`, upstream of analyze.** Analyze and publish
  read the same normalized text by construction; no quote walking, no publish re-validation.
  Strictly better than (a). Hook moves to `docxSplitter.mjs`; `packageBuilder.mjs` reverts to
  unchanged. See top section for full path validation.

Whichever is chosen, the plan's PA-Lite item 5 and the C1 section must be rewritten:
the analyze step reads PRE-normalization text, not post. **[D4=(e): under (e), analyze reads
POST-normalization text — PA-Lite item 5's original framing becomes correct again, just for the
right reason.]**

### MF-2 — QA matrix and verifier cannot currently catch the C1 break (fake-green risk).

**Risk.** The QA matrix tests "a Reading evidence highlight still matches" — one
spot-check that passes by luck whenever the chosen quote happens to contain no
normalized character, and it ignores seven-choices and cloze evidence entirely. The
verifier table (D3) tests `normalizePassageText` in isolation and never exercises the
passage-vs-stored-quote relationship. So neither gate would go red on the MF-1
regression. (I10 CR lesson: a verifier that cannot catch the planted regression is a
fake green.)

**Required disposition (record in plan.md Verify + Browser QA):**
- Verifier: add at least one case proving the chosen MF-1 disposition holds —
  **for the chosen option (e):** a grammar-paragraph compose-order case
  (`normalizeGrammarFillText(normalizePassageText(raw))`) whose raw text contains `56.`/`(56)`
  and an inline `(wear)` prompt, proving the eventual `  56  ` marker is byte-stable AND
  idempotent; plus a case where a quote containing a normalized char, taken as a substring of the
  normalized passage, still `includes()`-matches (automatic under (e), but lock it).
- Browser QA: the evidence-highlight check must use a quote that is **known to contain a
  normalized character** (e.g. an English clause that had a full-width comma, or a
  glossed word), and must cover **at least one reading AND one cloze/seven-choices**
  highlight, not a single arbitrary reading quote.

## Must Fix → Plan Disposition Checklist

- [x] **MF-1** → **RESOLVED via D4=option (e) (2026-05-31).** plan.md must: (1) record D4=(e);
  (2) MOVE the Step 2 hook from `packageBuilder.mjs` to `docxSplitter.mjs` assembled
  paragraph/stem/option/starter build sites (NOT `normalizeLine`); (3) revert `packageBuilder.mjs`
  to unchanged (drop it from Allowed); (4) correct the C1 section + PA-Lite item 5 to state
  analyze reads POST-normalization text *because normalization now happens at parse*; (5) state
  the parse→publish compose order `parse:normalizePassageText → publish:normalizeGrammarFillText`.
- [ ] **MF-2** → plan.md **Verify** section adds the grammar compose-order idempotency case and the
  passage-substring-quote case for option (e); **Browser QA** (load-bearing) is rewritten to require
  a highlight on a known-normalized quote and to cover a second family (cloze or
  seven-choices), not one arbitrary reading quote.

## Should Watch

- **SW-1 — line numbers drifted; hook structure differs from the plan.** Verified actual
  shapes in `packageBuilder.mjs`: reading paragraphs `L258-261`, reading option text
  `L239-242` (inline `question.options?.[label]`), reading stem `L240` (`question.stem`);
  seven-choices optionBank `L347-350`, paragraphs `L352-355`, stem `L329`; cloze options
  `L417-420`, paragraphs `L438-441`, stem `L413`; grammar-fill compose point `L525`
  (`normalizeGrammarFillText(p.text)`); writing app paragraphs `L571-574`, continuation
  starters `L626-628`. **[D4=(e): these `packageBuilder.mjs` sites are NO LONGER hook points.
  The hook sites are now in `docxSplitter.mjs` per Q2 above.]**
- **SW-2 — `compact()` and `normalizeGrammarFillText` already do some of this.** Stems and
  options pass through `compact()` (`\s+→' '`) in several validation spots, and
  grammar-fill already inserts one-space-after-punct (`L175`). Generalizing rule 2
  cross-family is intended (plan §rule 2) and harmless given idempotency, but DEV should
  confirm no double-spacing where `compact` already ran. Verifier idempotency case covers
  this; non-blocking.
- **SW-3 — C2 byte-intactness confirmed safe by construction.** The render regex is
  `paperBlankPattern = /(?:_{2,}|[  ]{2,})\s*(\d{1,3})\s*(?:_{2,}|[  ]{2,})/g`
  (`PaperSurface.tsx:62`). Markers `_____36_____` / `__41__` contain only underscores
  (none of rules 1/2/3's triggers). `  56  ` is created by `normalizeGrammarFillText`
  AFTER `normalizePassageText` runs. **[D4=(e): the compose order is now two-stage —
  parse:`normalizePassageText` then publish:`normalizeGrammarFillText` — the shared normalizer
  still never sees the two-space marker because the marker is minted at publish, downstream of
  parse. Same guarantee, different stage. Verified Q3.]** The verifier sentinels
  `f("  56  ")===" 56 "`-identical etc. are the right tripwire; keep them load-bearing. Watch
  only that DEV does not let rule 2's `[.,;:!?]+letter` accidentally widen to digits (it must not
  touch `56`).
- **SW-4 — rule 1 boundary at the English/Chinese seam.** "ASCII-adjacent and not
  CJK-adjacent" is expressible deterministically (lookarounds on `[A-Za-z0-9]` vs
  `[一-鿿]`), but the failure case is a punctuation char with English on one
  side and CJK on the other (`word，中文`). DEV must define which side wins; the verifier
  must include this mixed-seam case explicitly, not just pure-English and pure-CJK runs.
  Flagging as Should Watch because it is a DEV regex detail the verifier can lock, not a
  product decision — but if DEV cannot make it deterministic it escalates to PO.
- **SW-5 — rule 1 × rule 3 on `（中文）` gloss + grammar prompt parens.** Plan's compose order
  (full-width parens → half-width first, then surrounding spaces) is correct; verifier case
  `photosynthesis（光合作用）process` → `photosynthesis (光合作用) process` covers it. **[D4=(e)
  REINFORCED:] rule 3 MUST be scoped to parens whose interior contains a CJK char, so it does NOT
  fire on the inline grammar prompt `(wear)` or the digit `(56)` — those are owned by
  `normalizeGrammarFillText` L177-178 at publish. A grammar-paragraph idempotency case containing
  `(wear)` and `(56)` is now a load-bearing verifier case (also feeds MF-2).**

## Allowed Files

**[D4=(e) — corrected 2026-05-31]**
- `server/paper-import-ai/normalizePassageText.mjs` (new)
- `server/paper-import-ai/docxSplitter.mjs` (HOOK POINTS — assembled paragraph/stem/option/starter
  `text:` build sites only; NOT inside `normalizeLine`; do NOT alter structural parsing/regexes)
- `scripts/verify-i11-symbol-normalization.mjs` (new)
- `scripts/verify-ci.mjs` (registration only — append to `registry.scripts`, verified
  `L14-46`, I10 verifier already present `L44`)

~~`server/paper-import-ai/packageBuilder.mjs`~~ — **NO LONGER an I11 hook under (e); leave unchanged.**

## Forbidden Files

- Everything under `app/**`, `schemas/**`, other `server/**` dirs, any other
  `scripts/verify-*`, `app/public/paper-assets/**` commits. No render-side change. No
  space-collapsing rule. No 2b (curly quote / em dash) logic. No bulk migration script.
  Do not commit `.claude/launch.json`. **[D4=(e):] `packageBuilder.mjs` must NOT be modified for
  I11 — it stays unchanged; the original MF-1 quote-walking exception is moot since (e) touches no
  analysis-quote storage. Inside `docxSplitter.mjs`, DEV must NOT change `normalizeLine`, the
  section/marker/question/option/answer-range parsers, or any structural regex — only wrap the
  final paragraph/stem/option/starter `text:` values.**

## Static Verify Requirements

- `node scripts/verify-i11-symbol-normalization.mjs` green: rule 1/2/3 table cases, the
  mixed English/CJK seam case (SW-4), the grammar prompt-paren idempotency case (SW-5),
  C2 byte-intact sentinels (`_____36_____`, `__41__`, `  56  `), full idempotency, **the
  parse→publish compose-order grammar case (D4=(e), MF-2)**, and the passage-substring-quote case.
- `node scripts/verify-ci.mjs` green incl. unchanged `verify-i10-blank-rendering.mjs`
  (suite-level proof of no marker regression).
- CR must mutation-test the verifier (disable one rule → red).

## Browser QA Matrix

Re-import ONE real paper (D1). On the rendered surfaces confirm:
1. Reading / 七选五 / 完形 / 语法填空: English punctuation/spacing/gloss normalized.
2. All I10 styled blanks still render (C2) across 七选五 / 完形 / 语法填空.
3. **(MF-2)** An evidence highlight on a quote KNOWN to contain a normalized character
   (full-width-comma clause or glossed word) still resolves, in **reading AND at least
   one of cloze/seven-choices** — proving MF-1's chosen disposition (D4=(e)) holds end to end.

## DEV Readiness

Direction is right and the cut is correctly sized. **[2026-05-31] MF-1 is RESOLVED by D4=(e);
DEV may start once plan.md records D4=(e), relocates the hook to `docxSplitter.mjs`, reverts
`packageBuilder.mjs` to unchanged, and adds the MF-2 verifier + QA cases.** Without the MF-2
additions, DEV could still ship a verifier that cannot catch a compose-order regression (fake
green), so MF-2 remains blocking.

## Open PO Decisions

1. **D4 — RESOLVED 2026-05-31:** MF-1 disposition = **option (e), normalize at `/parse`**
   (a NEW option, not among my original (a)/(b)/(c)). I independently validated (e) by path and
   confirm it is **sound and strictly better than my original (a) recommendation** — it eliminates
   the quote/passage divergence by construction with no second normalization site. Hook relocates
   to `docxSplitter.mjs`; `packageBuilder.mjs` stays unchanged. No new Must Fix introduced by (e).

(Zero open PO decisions remaining; D4 resolved.)
