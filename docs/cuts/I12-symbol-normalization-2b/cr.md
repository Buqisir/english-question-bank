# CR — I12 Symbol Normalization 2b (fresh-Opus cold-read, CR-lite)

## Recommendation

**APPROVE** — 0 Must Fix. The two new rules match the locked spec, the C1/C2
contracts hold by construction, idempotency holds on adversarial input, and the
verifier is mutation-proven (all 3 named mutations red the expected cases). Scope
is exactly the 2 allowed files; no forbidden surface touched.

## Changed Scope

`git diff main...i12-symbol-normalization-2b --name-only` (verified, not trusted):

- `server/paper-import-ai/normalizePassageText.mjs` — header doc comment updated
  (3→5 rules); Rule 5 (em dash) then Rule 4 (4a double + 4b single) appended
  after Rule 2. **Pure additions** — no `-/+` lines fall inside the Rule 1/2/3
  regex bodies; 2a rules byte-untouched.
- `scripts/verify-i11-symbol-normalization.mjs` — 3 "2b NOT done" placeholders
  replaced with real before/after assertions; Rule 4a/4b/5 + conservative-gate
  locks + idempotency entries added in place. No new file, no new CI registration.

Forbidden surface (`docxSplitter.mjs`, `packageBuilder.mjs`, `analyze*.mjs`,
`*Adapter.ts`, render-side): **none touched** (grep on diff file list, clean).
The branch carries only the single code commit `3baece1`; the doc commits cited
in the prompt are not present on this branch vs main (no impact on review).

## Findings

### Must Fix
None.

### Should Watch (non-blocking — inherited from pa.md, not introduced by this diff)
- **SW-1** Reading group title (`docxSplitter.mjs` L356) is unnormalized English
  content — pre-existing since 2a, outside the quote contract, never a highlight
  target. Watch-ledger item, not a 2b regression.
- **SW-2** corner-bracket `「」『』` deferral (0-corpus). Watch-ledger limitation.
- **SW-3** cosmetic `5'10"`→`5'10”` (prime→close-double) and `rock 'n’ roll`
  asymmetry — locked as intentional by full-string verifier cases. Accepted.
- **SW-4** browser QA will likely find no live `'90s`/`---`/`——` token; the
  verifier (not QA) is the authoritative proof of the conservative gate. Confirmed
  by pa.md's corpus scan (0 occurrences). Browser QA still load-bearing for
  already-curly content unharmed + I10 blanks + evidence highlight end-to-end.

## Verification Evidence (re-run this session, not copied)

- `node scripts/verify-i11-symbol-normalization.mjs` → **81 assertions, 81 passed,
  0 failed**, exit 0.
- `node scripts/verify-ci.mjs` → green ("CI verify passed"); `verify-i10-blank-
  rendering.mjs` (L44) and `verify-i11-symbol-normalization.mjs` (L46) both
  registered and run.
- Assert helpers read: `eq` and `unchanged` both call the real
  `normalizePassageText` and compare with `===`; `process.exit(1)` on any fail.
  These exercise behavior, not string shape. `unchanged === eq(label, x, x)`.

### Correctness vs locked spec
- **Rule 5**: `/-{3,}/g→—` then `/[—―]{2,}/g→—`. Verified empirically:
  `---`→`—`, `——`→`—`, lone `—`/`--`/`-`/`well-known`/`1990-2000` untouched.
  Single hyphen and `--` never matched. Correct.
- **Rule 4a**: `/(^|[\s(\[{—–“‘])"(?=[^])/g → $1“` then `/"/g → ”`. Opening set =
  start, whitespace, `([{`, U+2014, U+2013, `“`, `‘` — matches plan. `(?=[^])`
  end-of-string guard verified: trailing `"` (e.g. `x"`, lone `"`, `5'10"`) →
  closing, not opening. Punctuation-preceded `"`→closing (MF-1 accepted) locked
  by `He said,"Hello."`→`He said,”Hello.”`. `“`/`‘` in the lookbehind class makes
  4a idempotent (curly outputs not re-matched).
- **Rule 4b**: `/(?<=[A-Za-z])'/g → ’`. Letter-preceded only; `'90s`, `'apple'`
  first glyph, `rock 'n' roll` first glyph, `5'10"` digit-preceded `'` all left
  straight. Never touches `(56)`/`(wear)`/I10 markers (no `'` inside). Correct.
- **Rule ORDER**: Rule 5 before Rule 4 verified live — `---"x"`→`—“x”` (the
  normalized em dash is in 4a's open-set, so the `"` opens). Block runs after
  Rule 2; Rules 1/2/3 unedited.

### C2 byte-intactness (verified live)
`_____36_____`, `__41__`, `  56  `, `(56)`, `(wear)` → all unchanged (contain
none of `"` `'` `-` `—` `―`).

### Idempotency f(f(x))===f(x) (verified live on adversarial set)
All of: `---`, `——`, `—`, `--`, `x"`, `"`, `""`, `("x")`, `""x`, `---"x"`,
`'apple'`, `'90s`, `rock 'n' roll`, `5'10"` → IDEM-OK. The 4a re-emit-`$1`
pattern and the `(?=[^])` guard introduce no second-pass drift.

### Mutation test (mandatory — fake-green check)

| Mutation | Cases reddened | Result |
|---|---|---|
| (a) disable Rule 4 (comment 4a x2 + 4b) | 12: all R4a (5) + R4b conversions/gate (7) | RED as expected — verifier catches |
| (b) disable Rule 5 (comment both lines) | 3: `wait---no`, `yes——no`, `——` | RED as expected — verifier catches |
| (c) drop 4b `(?<=[A-Za-z])` guard (every `'`→’) | 4: `'90s`, `'apple'` (`’apple’`≠`'apple’`), `rock 'n' roll`, `5'10"` | RED as expected — load-bearing gate proven |

All 3 mutations reddened exactly the expected cases. Under (a)/(b) the
already-normalized idempotency entries correctly stayed green (nothing to convert),
and under (c) the NOT-touched/letter-preceded cases stayed green — i.e. the
verifier reds precisely on the mutated behavior, no over- or under-coverage. No
fake green. The `'apple'` full-string lock (`'apple’` vs mutated `’apple’`) does
catch a leading-glyph regression, satisfying MF-2.

Working tree restored after mutations (`git diff HEAD` on the file is empty; the
scratch copy was deleted). Only pre-existing untracked `.claude/launch.json`
remains, not introduced by this review.

## Failure / Attack Angle

- The only behavioral risk is 4a misfacing a quote after sentence punctuation
  (`said,"Hello"`→`said,”Hello”`). This is **accepted and locked** (MF-1, 0-corpus,
  cosmetic, locally indistinguishable from the dominant `"Hello," she said.`
  pattern). Not a contract break — C1 still holds because stored quote ⊆ stored
  passage by construction (both produced through the same function).
- A future agent could be tempted to "fix" the conservative single-quote gate by
  widening it (e.g. to digits or any char). The mutation-(c) lock and the `'apple'`
  full-string lock now block that path from landing silently.
- The verifier is the true proof surface (corpus is ~no-op); browser QA is unlikely
  to exercise the gate. This is correctly flagged as SW-4, not a defect — the
  mutation tests substitute for the absent live token.

## Self-Review Blind Spots

- I did not run the load-bearing **browser QA** (re-import of a real paper) — that
  is the PO/QA step, out of CR's reach. C1/C2 are proven by path + verifier, but the
  end-to-end evidence-highlight resolution on a normalized quote is unproven by me.
  If Big CR revisits, inspect the D4 parse-time consistency on a real re-imported
  paper first.
- I did not exhaustively fuzz pathological 4a inputs (e.g. many alternating
  `"` interleaved with curly quotes and em dashes); I tested representative
  adversarial cases and idempotency held on all. A targeted fuzz could increase
  confidence but the regex structure (open-set lookbehind + closing sweep, both
  consuming only U+0022) bounds the behavior.

## Residual Risk

Low. Pure-function change, smaller blast radius than 2a, contract preserved by
construction, mutation-proven verifier, scope clean. Merge gated only on the
load-bearing browser QA (PO/QA), which CR does not perform.
