# PA — I12 Symbol Normalization 2b (fresh-Opus cold-read)

## Verdict

**APPROVE WITH MUST FIX** — direction is correct, blast radius is genuinely
smaller than 2a, and the conservative single-quote decision is well-grounded in
the standard. Two Must Fix items are verifier-completeness / lock-precision
issues that protect the conservative gate and the open/close heuristic; neither
is a direction error. The C1 (parse-time quote contract) and C2 (I10 marker
byte-intactness) claims **verified true by path** for 2b.

## Product Principle

Normalize stored English-content text toward Gaokao typography **only where the
transform cannot change meaning**; where direction is ambiguous, leave the glyph
straight and surface for human review (`exam-paper-format-standards.md` L27).
2b's conservative single-quote rule is the literal application of that line. The
standard mandates curly quotes/apostrophes (L35) and a proper em dash (L37), so
the cut should exist now even though — see below — the current corpus barely
exercises it.

## Exact Architecture Model (verified, not trusted)

- **C1 holds by construction for 2b.** Verified the quote contract is enforced
  in `server/paper-import-ai/analyzeReading.mjs` L133-140 (`assertExactQuote`
  validates `quote` against a `Map` of `paragraph.id → paragraph.text` only) and
  `analyzeSevenChoices.mjs` L150-159 (passage side = `group.paragraphs[].text`;
  option side = `group.optionBank[].text`). Render is plain `indexOf` with no
  fuzzy fallback in `app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts`
  L304-327 (`resolveQuoteInTextMap` → `sentence.text.indexOf(quote)`, returns
  null/skips on miss). Because every quote-targetable field (`paragraph.text`,
  `optionBank.text`) is produced through `normalizePassageText`, 2b living
  inside that function keeps stored-quote ⊆ stored-passage. Confirmed.

- **"`docxSplitter.mjs` needs no change" — verified true, with one caveat
  cleared.** 21 call sites confirmed (`grep` L273-1005). I specifically hunted
  for an English-content text field that bypasses the normalizer:
  - `optionBank` is built RAW at `docxSplitter.mjs` L799 (`text: options[label]`)
    but **re-wrapped** at L846 (`normalizePassageText(item.text)`) — covered.
  - Reading **group title** at L356 (`title: marker.title || ...`) is the one
    English-content field NOT normalized. It is **outside the quote contract**:
    `assertExactQuote` only resolves against `paragraphsById`, and the title is
    not a paragraph; the title-fallback paragraph at L340 *is* normalized. The
    render highlight filters by `paragraphId`, so a title is never a highlight
    target. **No divergence path exists** — but see Should Watch SW-1, this is a
    latent inconsistency to record, not a 2b blocker.
  - Writing English content (L943/993/1003 paragraphs, L995/1005 starters) all
    normalized; writing has no quote contract anyway.

- **C2 byte-intactness holds.** Rules 4/5 match only `"` `'` `-` `—`/`―`.
  I10 markers are underscores/spaces/digits (`_____36_____`, `__41__`,
  `  56  `), grammar parens `(56)`/`(wear)` contain none of the trigger glyphs.
  Append-after-Rule-2 ordering is real (current file ends at Rule 2, L93-95).
  Idempotency reasoning holds: Rule 4/5 inputs are straight glyphs / hyphen-dash
  runs, outputs (curly / single `—`) are not re-matched.

## Empirical corpus check (33 real papers in `~/Desktop/26年3月高三试卷/`)

This is the load-bearing finding for de-risking the heuristics:

| pattern | count | meaning for 2b |
|---|---|---|
| already-curly `"`/`"` | 1583 | Rule 4 never touches these (acts on U+0022 only) |
| already-curly `'`/`'` | 1459 | Rule 4 never touches these (acts on U+0027 only) |
| straight `"` | **10** | tiny; the `,"`-misfire case (see MF-1) produced **0** samples |
| straight `'` | 65, **all** letter-preceded | every one normalizes deterministically → U+2019; **0** elision/opening cases |
| `'90s` / `'cause` / `'apple'` (space-`'`-letter) | **0** | the conservative gate is exercised by **no real input** |
| `---` (3+ hyphens) | **0** | Rule 5a fixes nothing on this corpus |
| `——`/`――` runs | **0** | Rule 5b fixes nothing on this corpus |
| single `—` already correct | 375 | must pass through untouched (Rule 5 "lone `—`" lock) |
| corner brackets `「」『』` | **0** | the deferral (SW-2) is sound — zero real occurrences |

Implication: on real input 2b is almost a no-op (it normalizes ~10 straight DQ +
~65 letter-`'`, all safe-direction; it must NOT disturb 375 correct em dashes
and ~3000 already-curly quotes). The verifier — not browser QA — is therefore
the real proof surface, because the QA paper will likely contain **no** `'90s`,
no `---`, no `——`. This makes MF-1/MF-2 (verifier precision) the actual risk,
and it reframes browser QA case 1's "if present" as "almost certainly absent".

## Must Fix Before DEV

### MF-1 — Lock the double-quote open/close heuristic against the comma-adjacent misfire, OR document it as accepted.

The proposed open-set is {start, whitespace, `(` `[` `{`, `—` `–`, open-quote}.
A `"` immediately preceded by a comma (or `.`/`:` etc.) is therefore classified
**closing**. So `He said,"Hello"` → both `"` close (wrong; the first is
opening). Rule 2 does not rescue this (`,` is followed by `"`, not a letter, so
no space is inserted). The corpus shows **0** such cases today, so this is
low-probability — but the plan's claim that the double-quote heuristic
"effectively never misfires" is too strong as written and the verifier has no
case pinning this boundary.
**Disposition:** add a verifier case fixing the chosen behavior for
`said,"Hello"` (either: punctuation also counts as opening-context → both add
the comma/period/colon/semicolon to the open-set; OR explicitly accept
close-after-comma and lock it as the documented behavior). DEV must not leave
this boundary unspecified. Record the chosen rule in `plan.md` Rule 4a text.

### MF-2 — The conservative-gate mutation test must red on a case the verifier actually contains, and the `'apple'` lock must assert the EXACT two-glyph outcome.

The plan prescribes "weakening 4b's `[A-Za-z]`-preceded guard to also match
non-letters reddens the `'90s` case." For that mutation to red, the verifier
must contain `'90s` → unchanged AND the weakened rule must visibly change it
(`'` preceded by start-of-string/space, followed by `9`). Confirm the planned
mutation (guard `[A-Za-z]` → `[A-Za-z0-9]` or `.`) actually flips `'90s`; a
guard that widens only to digits flips `'90s` (good), but a guard widened to
"any preceding char" would also need a space-preceded case to red — the plan
should name the exact mutation so CR's mutation test is deterministic, not
improvised. Separately, the `'apple'` lock must assert the **full string**
`'apple’` (first `'` straight U+0027, trailing `'` → U+2019), not just
"first unchanged" — otherwise a bug that also leaves the trailing `'` straight
passes silently.
**Disposition:** in `plan.md` Step 2, (a) name the exact 4b mutation CR applies
and the exact case it must red (`'90s` via digit-preceded `'`), and (b) require
the `'apple'` assertion to be a full-string equality `'apple’`, not a partial
check. Add a digit-preceded straight-`'` lock (`5'10"`) so the "letters only"
guard is pinned on both sides.

## Must Fix → Plan Disposition Checklist

- **MF-1** → `plan.md` Rule 4a text records the chosen comma/period-preceded
  `"` behavior; Step 2 lists a verifier case `He said,"Hello"` → <locked
  output>. CR verifies the case exists and matches.
- **MF-2** → `plan.md` Step 2 names the exact 4b guard mutation and the exact
  case it reddens (`'90s`, digit-preceded), and upgrades the `'apple'` lock to a
  full-string equality plus a `5'10"` digit-preceded lock. CR's mutation test
  follows the named mutation, not an ad-hoc one.

## Should Watch (non-blocking)

- **SW-1 — Reading group title (`docxSplitter.mjs` L356) is unnormalized
  English content.** Not a 2b regression (outside quote contract, never a
  highlight target — verified). But it is a latent inconsistency: a title with a
  straight quote/dash will render un-normalized while its passage is normalized.
  Pre-existing since 2a. Record in the watch ledger; do not fix in 2b (out of
  the locked 2-file scope).
- **SW-2 — Corner-bracket `「」『』` deferral is sound.** Corpus shows 0
  occurrences across 33 papers; the `word「q」` direction-loss edge is theoretical
  on this input. Log as a watch-ledger limitation per plan. Do not pull into 2b.
- **SW-3 — `5'10"` and `rock 'n' roll` cosmetic asymmetries.** `"` after a digit
  → U+201D is typographically a prime, but not meaning-changing; `rock 'n’ roll`
  leaves a mismatched-looking pair. Both are vanishingly rare (corpus: 0). Accept
  as documented; the verifier locks them so behavior is intentional.
- **SW-4 — Browser QA case 1 ("conservative gate visible") will likely find no
  `'90s`/`---`/`——` token** in any real QA paper. Treat the verifier as the
  authoritative proof of the conservative gate; do not block QA on finding a
  live straight-elision token. Browser QA still proves (a) already-curly content
  unharmed, (b) I10 blanks intact, (c) evidence highlight resolves end-to-end.

## Allowed Files

- `server/paper-import-ai/normalizePassageText.mjs` (append Rule 5 then Rule 4)
- `scripts/verify-i11-symbol-normalization.mjs` (extend in place; replace the 3
  "2b not done" placeholders at L311-324)
- `docs/cuts/I12-symbol-normalization-2b/plan.md` (PM compression only)
- `docs/paper-surface-watch-ledger.md` (SW-1/SW-2 entries, if PM chooses)

## Forbidden Files

- `server/paper-import-ai/docxSplitter.mjs` (already wired; verified no change
  needed)
- `server/paper-import-ai/packageBuilder.mjs`, any analyze*.mjs
- 2a Rules 1/2/3 inside `normalizePassageText.mjs`
- A new verifier file or second CI registration (the function is one unit)
- Any render-side / `*Adapter.ts` file
- `app/public/paper-assets/**`, `.claude/launch.json`

## Static Verify Requirements

- `node scripts/verify-i11-symbol-normalization.mjs` green — all 42 surviving 2a
  cases + new Rule 4a/4b/5 cases + conservative-gate locks + idempotency for
  every new "after" string. Current baseline: 45 pass (3 are the placeholders to
  be replaced).
- `node scripts/verify-ci.mjs` green — includes `verify-i10-blank-rendering.mjs`
  (suite-level I10 marker proof). Both already CI-registered (verify-ci.mjs
  L44, L46).
- CR mutation test (named in MF-2): disable Rule 4 → quote cases red; disable
  Rule 5 → dash cases red; widen 4b guard to digit-preceded → `'90s` reds.

## Browser QA Matrix

Re-import ONE real paper (recipe inherited from 2a):
1. Already-curly quotes + correct em dashes render unharmed on Reading / 完形 /
   七选五 (the common case — corpus is ~3000 already-curly + 375 correct dashes).
2. All I10 styled blanks render across 七选五 / 完形 / 语法填空 (C2).
3. An evidence highlight on a quote/dash-bearing sentence resolves in Reading
   AND one of 完形/七选五 (D4 end-to-end). Data proof: every baked
   `quote`/`targetText`/`sourceQuote` `includes()`-matches its stored passage.
4. (Best-effort) a straight-elision token staying straight — accept absence per
   SW-4; do not block on it. Clean up the asset; never commit it.

## DEV Readiness

Ready after MF-1/MF-2 are compressed into `plan.md`. Scope is a 2-file pure
change with a verified-stable contract; before/after is precise; allowed/
forbidden files are exact; verify + QA prove the risk.

## Open PO Decisions

0 unresolved. D-2b-1 (conservative single-quote) is owner-locked and
spec-consistent. MF-1's "punctuation-preceded `"` = opening or closing" is a
heuristic-precision choice that PM can lock without a new PO question, but if PM
prefers, it is the single candidate to surface to PO — still ≤ 1, well under the
3-decision gate.
