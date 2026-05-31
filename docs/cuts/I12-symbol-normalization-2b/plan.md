# I12 — Symbol Normalization 2b (渲染格式 cut · 第三刀「符号归一 2b」: curly quotes + em dash)

`cut size: medium; touches schema / data contract / product boundary / teaching interpretation: yes`

Import-side change: extends the **stored**-text normalizer with two more meaning-sensitive
rules (curly quotes + em dash). Cross-family (Reading / 七选五 / 完形 / 语法填空 / 写作).
Couples to the C1 evidence-quote exact-match contract and the C2 I10 blank-marker shapes —
same risk surface as 2a. Medium cut → PA before DEV (this plan + `pa.md`), CR before merge,
browser QA load-bearing.

Authority (source of truth, read these not chat):
`docs/product/exam-paper-format-standards.md` §"Import Normalization Principle" +
§"Global Typography" (curly-quote + dash rules verified verbatim L35-38); 2a shape inherited
from `docs/cuts/I11-symbol-normalization/{plan,pa,cr}.md`; visual targets
`exam-paper-format-reference/images/page-03..10-*.jpeg`.

## Why 2b is now tractable (the architecture 2a paid for)

2a's D4 placed the normalizer at **parse time** (`docxSplitter.mjs` assembled build sites,
upstream of `/analyze` quote-baking). 2b adds rules to the **same pure function**
`normalizePassageText` — so the C1 contract (stored quote ⊆ stored passage) holds **by
construction**, identically to 2a. **`docxSplitter.mjs` is NOT modified** — all 21 English-content
build sites already call `normalizePassageText` (verified L273-1005). 2b's entire DEV surface is
the pure function + its verifier. This is a strictly smaller blast radius than 2a.

## Goal (LOCKED — slice 2b only)

Extend `normalizePassageText(text)` with **two more rules**, conservative-where-ambiguous per
the owner decision below. Existing 3 rules and all 45 2a verifier assertions stay green
(except the 3 "2b not done" placeholders, which are **replaced** with real 2b assertions).

### Rule 4 — Curly quotes (open/close direction)

**4a — Straight double quote `"` (U+0022) → directional curly.**
- OPENING `"` (U+201C) when at string start OR immediately preceded by: whitespace, `(`, `[`,
  `{`, `—` (U+2014), `–` (U+2013), or another opening quote `"`/`'`.
- else CLOSING `"` (U+201D). **This explicitly includes a `"` preceded by sentence
  punctuation `,.;:!?` → CLOSING** (MF-1 resolution). Rationale: the dominant real pattern is
  American-style comma-inside-quote `"Hello," she said.` — there the closing `"` follows the
  comma and MUST be closing; this is rendered correctly. The inverse `said,"Hello"`
  (punctuation directly before an *opening* quote, no space) is sloppy input with **0
  occurrences across 33 real papers** and is locally indistinguishable from the dominant
  pattern, so it yields a cosmetic wrong-facing quote — **accepted and locked**, not fixed.
  Do NOT add punctuation to the open-set (that would break the dominant `"Hello,"` closing).

**4b — Straight single quote `'` (U+0027) → conservative.**
- If immediately preceded by an ASCII letter `[A-Za-z]` → `'` (U+2019). This single target
  glyph is **simultaneously correct** for contraction (`don't`), possessive (`students'`,
  `o'clock`), AND closing single-quote (`go'`) — so a letter-preceded `'` is deterministic and
  meaning-safe.
- **Otherwise LEAVE the straight `'` unchanged.** A standalone single `'` not preceded by a
  letter is irreducibly ambiguous between an opening quotation (`'apple'`) and an elision
  (`'90s`, `'cause`, `'n'`); the standard's "if normalization may change meaning, stop and
  surface for human review" rule forbids guessing. A straight apostrophe rendered is
  acceptable; a wrong-facing curly quote is not. (Owner decision **D-2b-1 = conservative**.)

**Out of scope — corner brackets `「」『』`:** 2b does NOT special-case them. They are rare in
real English Gaokao text, and adding glyph→curly handling would touch 2a's locked Rule 1
reachability. 2a Rule 1 already maps ASCII-adjacent `「」『』` → straight quotes (then Rule 4
direction-derives them); the residual `word「q」`→direction-loss edge is logged as a known
limitation (watch ledger), NOT fixed here.

### Rule 5 — Em dash

- `-{3,}` (three or more ASCII hyphens) → `—` (U+2014).
- `[—―]{2,}` (a run of 2+ em dashes / horizontal bars = the Chinese 破折号) → single
  `—` (U+2014).
- **A single hyphen `-` is NEVER touched** (protects `well-known`, number ranges `1990-2000`).
  Two hyphens `--` are NOT touched (conservative; only `-{3,}`). A lone, already-correct `—`
  (U+2014) is left unchanged.

### Rule ordering inside `normalizePassageText`

Existing 2a order is Rule 1 → Rule 3 (3a/3b/3c) → Rule 2. Append **Rule 5 (em dash) → Rule 4
(quotes)** at the end. Em dash before quotes so Rule 4's opening-quote detection can see a
freshly-normalized `—` preceding a `"` (`---"x"` → `—"x"` → opening `"`). Idempotent by
construction: Rule 4/5 inputs are straight quotes / hyphen-or-dash runs; their curly / single-`—`
outputs are not matched by any input pattern.

## Critical constraints (inherited from 2a — verified this session, design around)

### C-2b-1 — Same parse-time hook. (high confidence — VERIFIED)
2b lives **inside `normalizePassageText`**; the 21 `docxSplitter.mjs` call sites (L273-1005)
are unchanged. No publish-side path. C1 contract preserved by construction (identical to 2a's
D4). The 42 surviving 2a verifier cases must stay green.

### C-2b-2 — MUST NOT regress I10 blank markers OR the 3 deterministic 2a rules. (high — flag to PA)
- I10 markers `_____36_____` / `__41__` / `  56  ` are underscores + spaces + digits — Rules 4/5
  act only on `"` `'` `-` `—` `—`, touching none of them. Byte-intact by construction; locked by
  the existing C2 sentinels (which must stay green) + new ones.
- 2a Rules 1/2/3 are unchanged (Rule 4/5 are appended, not edited). The intra-word apostrophe
  rule (4b) must not touch grammar parens `(56)`/`(wear)` (no `'` inside) or the `Jiang'an`-style
  intra-word apostrophe — for `Jiang'an`, 4b correctly produces `Jiang'an` (U+2019), which is the
  proper apostrophe glyph and meaning-preserving.

### C-2b-3 — Meaning-preservation is the product gate. (RESOLVED by D-2b-1)
The conservative-vs-aggressive boundary is settled: **conservative on single quotes** (owner,
this session). The safe default for any token where direction is not deterministic is **leave
it unchanged**. Locked by the `'90s` / `'apple'` / `rock 'n' roll` verifier cases below.

## Implementation contract (DEV scope — `server/**` is a forbidden zone; this assigns it)

DEV touches exactly TWO files:

### Step 1 — extend `server/paper-import-ai/normalizePassageText.mjs`
Append Rule 5 then Rule 4 (per ordering above) after the existing Rule 2. Keep the function
pure, dependency-free, idempotent. Update the file header doc comment to describe Rules 4/5 and
that 2b is no longer deferred. Do NOT edit Rules 1/2/3.

### Step 2 — extend `scripts/verify-i11-symbol-normalization.mjs` (the function's verifier)
This verifier covers `normalizePassageText` and is already CI-registered — **extend it in
place** (do NOT create a new verifier file or a new CI registration; the function is one unit).
- **Replace** the three "2b NOT done" cases (currently L311-324: straight `"`, `---`, `——` pass
  through) with real 2b before/after assertions.
- Add **Rule 4a (double):** `He said, "Hello."` → opening U+201C after space, closing U+201D
  after `.`; `"Start"` at string start → opening + closing; `(quote "x")` paren-preceded →
  opening. **MF-1 boundary lock (full-string equality):** `"Hello," she said.` →
  `“Hello,” she said.` (the comma-preceded closing `"` is correct on the dominant pattern); and
  `He said,"Hello."` → `He said,”Hello.”` (the accepted cosmetic wrong-facing first quote —
  locks the documented punctuation-preceded-`"`→closing behavior so it is intentional, not
  drift).
- Add **Rule 4b (single, conservative):** `don't` → `don't` (U+2019); `students' books`
  → U+2019; `o'clock` → U+2019; `Jiang'an` → U+2019. **Ambiguity LEFT-ALONE locks (load-bearing
  — the conservative gate), assert FULL-STRING equality:** `'90s` → `'90s` unchanged (straight
  U+0027); `'apple'` → `'apple’` (first `'` straight U+0027, trailing `'` after `e` → U+2019 —
  assert the **exact** two-glyph string, not just "first unchanged"); `rock 'n' roll` →
  `rock 'n’ roll` (documented asymmetry); `5'10"` → `5'10”` (digit-preceded `'` stays straight —
  pins the guard on the digit side; trailing `"` after `0` → closing U+201D).
- Add **Rule 5 (em dash):** `wait---no` → `wait—no`; `yes——no` → `yes—no`; `——` → `—`. **NOT
  touched locks:** `well-known` → unchanged; `1990-2000` → unchanged; `--` → unchanged; lone `—`
  → unchanged.
- Add **idempotency** entries for every new "after" string.
- Existing C2 sentinels + grammar compose-order + all Rule 1/2/3 cases stay (must stay green).

CR must **mutation-test** the verifier (2a/I10 lesson), using these **exact named mutations**
so the test is deterministic, not improvised:
- Disable Rule 4 (quote conversion) entirely → the Rule 4a/4b conversion cases red.
- Disable Rule 5 → the em-dash cases red.
- **Remove 4b's `(?<=[A-Za-z])` preceding-letter guard** (convert *every* straight `'` →
  U+2019) → the `'90s` and `'apple'` left-alone locks red. (Note: widening the guard only to
  digits would NOT flip `'90s`, whose `'` is space/start-preceded — the guard must be *dropped*
  to exercise the gate.) A verifier that can't catch these is a fake green.

## Forbidden / out-of-scope
- Modifying `docxSplitter.mjs` (already wired — no change needed) or `packageBuilder.mjs`.
- Editing 2a Rules 1/2/3. Adding a space-collapsing rule. Touching underscores / digit parens.
- Corner-bracket `「」『』` special-casing (deferred; watch-ledger limitation).
- Aggressive single-quote direction (rejected by D-2b-1). Touching single `-` or `--` or `5'`.
- Render-side anything. A new verifier file or second CI registration. Re-importing more than
  the one QA paper. Committing `app/public/paper-assets/**` or `.claude/launch.json`.

## Verify
- `node scripts/verify-i11-symbol-normalization.mjs` green — all 2a cases + new 2b cases +
  conservative-gate locks + idempotency.
- `node scripts/verify-ci.mjs` green — incl. `verify-i10-blank-rendering.mjs` (suite-level proof
  of no I10 marker regression).
- **Browser QA (load-bearing)** — re-import ONE real paper from
  `/Users/huangxuewei/Desktop/26年3月高三试卷/` (recipe inherited from 2a, see handoff):
  1. Curly quotes + em dashes normalized on Reading / 完形 / 七选五 surfaces; a straight `'90s`-style
     token (if present) stays straight (conservative gate visible).
  2. All I10 styled blanks still render (C2) across 七选五 / 完形 / 语法填空.
  3. An evidence highlight on a quote **known to contain a normalized quote/dash** still
     resolves in Reading AND one of 完形/七选五 (D4 parse-time consistency end-to-end). Data-level
     proof: every baked `quote`/`targetText`/`sourceQuote` `includes()`-matches its stored
     normalized passage. Clean up; never commit the asset.

## Browser QA Result (2026-05-31 — parse-only data smoke, owner-chosen lightweight path)

Owner chose the **lightweight parse-only smoke** (not a full AI re-import) after PA reframed 2b
as near-no-op on real input. Discovery: the publish/render path (`buildPaperImportAiPackageFiles`)
**requires AI analysis** (七选五/完形 analysis mandatory, six-family completeness), so a
zero-quota PaperSurface render is not reachable without burning gpt-5.5. Delivered instead a
**zero-AI data-level parse smoke** on a real paper (石室中学高三二诊, 220 text fields) — stronger
than eyeballing because it checks ALL quotes/dashes, not just what's on screen. PASS:

- **Idempotency on real content:** 220/220 parsed fields are no-ops under a second
  `normalizePassageText` pass → the function is stable on real text (it already ran at parse).
- **2b fully applied (all 0):** residual straight `"` = 0, `---` = 0, `——`-runs = 0,
  letter-preceded straight `'` = 0.
- **Already-curly content unharmed:** 27/28 curly `“`/`”`, 42 curly `‘`/`’`, 8 lone `—` — all
  preserved untouched (Rule 4/5 match only straight glyphs; curly is provably untouched).
- **Conservative gate:** standalone straight `'` = 0 on this paper (no `'90s`-type token,
  consistent with the 33-paper corpus scan).
- **C2 — I10 markers byte-intact at parse:** 七选五 `_____NN_____`×5, 完形 `__NN__`×15,
  语法 raw 56-65 nums×21 (two-space marker minted at publish, not parse — correct).

Render-of-text is unchanged by 2b (it is React displaying a string) and the D4 parse-time
end-to-end highlight consistency was already discharged by 2a's full re-import (109/109).
Residual gate: **PO QA (owner) → RM merge.**

## Decisions (owner-confirmed 2026-05-31)
- **D-2b-1** single-quote policy = **conservative**: letter-preceded `'` → U+2019; all other
  standalone single `'` left straight (ambiguity → human review per the standard). Double quotes
  done fully; em dash `-{3,}`/`——` → `—`, single/double hyphen untouched.

## PA Follow-Up Decisions (PM compression of `pa.md`, 2026-05-31)

PA verdict: **APPROVE WITH MUST FIX (2 MF), 0 unresolved PO decisions.** C1 (parse-time quote
contract) and C2 (I10 byte-intactness) verified true by path for 2b. Decisive new evidence: an
empirical scan of all 33 real source papers — ~3000 quotes already curly (Rule 4 won't touch),
all 65 straight single-quotes letter-preceded (deterministic → U+2019), and **0** occurrences
of `'90s` / `---` / `——` / corner brackets. ⇒ 2b is nearly a no-op on real input; **the
verifier, not browser QA, is the true proof surface.** Both MF therefore target verifier
precision.

- **MF-1 (double-quote punctuation boundary unspecified) → RESOLVED, locked in Rule 4a above.**
  A `"` preceded by sentence punctuation `,.;:!?` is CLOSING. Chosen because the dominant real
  pattern is American comma-inside-quote `"Hello," she said.` (rendered correctly); the inverse
  `said,"Hello"` is 0-corpus sloppy input and locally indistinguishable, accepted as a cosmetic
  wrong-facing quote. Verifier gains full-string locks `"Hello," she said.` → `“Hello,” she
  said.` and `He said,"Hello."` → `He said,”Hello.”`.
- **MF-2 (mutation test + `'apple'` lock precision) → RESOLVED in Step 2.** The conservative-gate
  mutation is named exactly: **drop 4b's `(?<=[A-Za-z])` guard** (PA's `[A-Za-z]`→`[A-Za-z0-9]`
  suggestion was imprecise — `'90s`'s apostrophe is space/start-preceded, so widening to digits
  would not flip it). `'apple'` and `5'10"` upgraded to full-string equality so a trailing-glyph
  bug can't pass silently.
- **SW-1 (Reading group title `docxSplitter.mjs` L356 unnormalized) + SW-2 (corner-bracket
  deferral)** → recorded in `docs/paper-surface-watch-ledger.md`; both out of 2b's locked
  2-file scope (pre-existing since 2a / 0-corpus). **SW-3/SW-4** (cosmetic `5'10"`/`rock 'n'`
  asymmetry; QA likely finds no live elision token) → accepted; verifier is authoritative for
  the conservative gate.

## Process
Flow: PM plan.md (this) → fresh-Opus `pa-reviewer` `pa.md` → PM compression (above section) →
Sonnet DEV (2-file scope assigned) → CR-lite (fresh Opus, mutation-test verifier) `cr.md` →
browser QA → PO QA → RM merge. Remote is **`github`**, base `main`. Stage explicitly — never
`git add -A`.
