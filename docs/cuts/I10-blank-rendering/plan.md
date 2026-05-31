# I10 — Blank Rendering (渲染格式 cut · 第一刀「空格渲染」)

`cut size: medium; touches schema / data contract / product boundary / teaching interpretation: no`

Touches the user-visible shared renderer `PaperSurface` (frozen zone
`app/src/shared-ui/papersurface/**` + `shared/papersurface/**`), with regression
risk to 七选五 / 阅读. Medium cut → PA before DEV, CR before merge, browser QA is
load-bearing (render cut).

## Goal (LOCKED)

Make 完形填空 + 语法填空 passage blanks render as the styled underline + centered-number
blank (the way 七选五 already does), instead of literal `__41__` / `  56  `. Display-only.

## Root cause (VERIFIED this session — by path, not prose)

`app/src/shared-ui/papersurface/PaperSurface.tsx`:
- L62 `sevenChoicesBlankPattern = /(?:_{3,}| {3,})\s*(\d{1,3})\s*(?:_{3,}| {3,})/g`
- `renderTextWithSevenChoicesBlanks` (L436) wraps the matched number in
  `<span class="ps-seven-choice-blank">` (fixed width via `--ps-seven-choice-blank-width`,
  token `shared/papersurface/tokens.mjs:63 sevenChoiceBlankWidth: '72px'`).
- It runs on ALL passage sentence text (L381/389/391/394), not gated to 七选五.

The three families store **different** marker shapes, and only 七选五 currently matches:

| Family | Stored marker | Origin | Matches current regex? |
| --- | --- | --- | --- |
| 七选五 | `_____36_____` (5 underscores) | raw | ✅ `_{3,}` |
| 完形 | `__41__` (2 underscores) | raw `p.text`, no normalization (`packageBuilder.mjs:440`) | ❌ needs `_{2,}` |
| 语法填空 | `  56  ` (2 **regular** spaces, often `  56  (keep)`) | `normalizeGrammarFillText` collapses to 2 spaces (`packageBuilder.mjs:165-181`) | ❌ regex space branch is ` ` (nbsp), 3+ |

Evidence: on-disk assets `app/public/paper-assets/paper-960d0f8d/.../paper-asset.json`
(cloze `__41__`, 七选五 `_____36_____`) and `paper-2024-jslk-english/paper-asset.json`
(grammar `for  56   (keyb...`, byte-confirmed regular space `0x20`, not nbsp).

**This corrects the handoff's F1 framing**: the "1-line `_{3,}`→`_{2,}`" change fixes
完形 ONLY. 语法填空 uses regular spaces, so the space branch must also be relaxed
(regular space added + count 3→2).

## Decisions (owner-confirmed 2026-05-31)

- **F1 = (A) relax the render regex.** Match both 2+ underscores and 2+ regular/nbsp
  spaces. Fixes existing on-disk assets + future, no re-import. Display-only.
  Owner accepts the documented false-match consideration (see PA-Lite below).
- **F2 = rename `ps-seven-choice-blank` → `ps-paper-blank`** (family-neutral; now serves
  3 families). Rename the CSS class, the CSS var/token, and the render function name.
- **F3 = scope is 完形 + 语法填空** (七选五 already works; 阅读/写作 have no such blanks). Settled.

## PA Follow-Up Decisions (PM compression of `pa.md`, 2026-05-31)

PA verdict: APPROVE WITH MUST FIX. Three Must Fix, all resolved below. `pa.md` committed.

- **MF-1 (token parity) → DONE in §3.** Added `shared/papersurface/tokens.d.mts` to the
  rename step, Allowed Files, and the straggler grep. Without it the in-CI parity verifier
  goes red.
- **MF-2 (stale module-v1 verifier) → option (a), §4.** Update
  `verify-paper-surface-module-v1.mjs` to new names + relaxed pattern (keeps the historical
  contract live; not in CI so it does not gate this PR). Added to Allowed Files.
- **MF-3 (space-branch false match) → owner decision: ACCEPT `\d{1,3}` as-is (2026-05-31).**
  Rationale: the space branch exists only for 语法填空, whose text is normalized to exactly
  2 spaces (`normalizeGrammarFillText`), so deliberate markers are the only double-spaced
  numbers in grammar passages; cloze uses underscores; a double-spaced 1–3 digit number in
  reading body prose is out-of-distribution for imported exam text (both committed assets:
  zero false matches). This is a KNOWN, accepted, documented false-match — NOT hidden.
  Required wiring (see Verifier + Browser QA): the I10 verifier asserts the
  `She scored  9  out of 10.` case as a documented ACCEPTED match (records the behavior),
  and Browser QA includes a reading passage with an incidental number to confirm the
  real-asset path stays clean.

## Out of scope (later slices — do NOT pull in)

符号归一 (quotes/dashes/punct/生词括号); 选项布局 (4-col Tab / 2-col aligned); 标题居中加粗 /
书名斜体 / 下划线短语; per-family source spacing (display is fixed-width, spacing does not
affect display). Keep this slice display-only.

## The change (exact, self-contained)

All edits confined to 3 files. No `server/**`, no adapters, no schema, no data contract.

1. **`app/src/shared-ui/papersurface/PaperSurface.tsx`**
   - Relax the pattern (L62). Write the space class in source with an EXPLICIT
     nbsp escape: the class must be `[\u0020\u00A0]` (regular space U+0020 +
     non-breaking space U+00A0). Do NOT paste a literal space. Target pattern:
     ```
     /(?:_{2,}|[\u0020\u00A0]{2,})\s*(\d{1,3})\s*(?:_{2,}|[\u0020\u00A0]{2,})/g
     ```
     (underscore branch 3->2; space branch = regular space + nbsp, count 3->2.)
   - Rename `sevenChoicesBlankPattern` → `paperBlankPattern`.
   - Rename `renderTextWithSevenChoicesBlanks` → `renderTextWithPaperBlanks`
     (update all 4 callers L381/389/391/394 + def L436/437/438/443).
   - Rename the CSS var key (L59) `--ps-seven-choice-blank-width` →
     `--ps-paper-blank-width`, sourced from the renamed token.
   - Rename the `<span className="ps-seven-choice-blank">` (L448) → `ps-paper-blank`.

2. **`app/src/shared-ui/papersurface/PaperSurface.css`** (L146, L150)
   - `.ps-seven-choice-blank` → `.ps-paper-blank`; `--ps-seven-choice-blank-width`
     → `--ps-paper-blank-width`. No visual-value change — keep `width: 72px` behavior.

3. **`shared/papersurface/tokens.mjs` (L63) + `tokens.d.ts` (L20) + `tokens.d.mts` (L18)**
   — ALL THREE token files (MF-1).
   - `sevenChoiceBlankWidth` → `paperBlankWidth` (value unchanged `'72px'`). Update the
     `.mjs` value AND both type declarations `.d.ts` + `.d.mts`. The in-CI parity verifier
     `verify-paper-surface-mjs-declaration-parity.mjs` asserts `.d.ts ≡ .d.mts` — renaming
     one without the other breaks CI.

4. **`scripts/verify-paper-surface-module-v1.mjs`** (MF-2, option a) — update it to the new
   names + relaxed pattern. It is NOT in `verify-ci.mjs` (won't gate this PR) but currently
   hard-pins the OLD class/var/token/pattern (L464/498/502/507/513/518/523/532) + the 72px
   calibration; leaving it stale = silent rot asserting deleted symbols. Update: old class
   `.ps-seven-choice-blank`→`.ps-paper-blank`, var/token names, and the pinned pattern literal
   (L518) to the relaxed regex. Keep the 72px calibration assertion (width unchanged).

DEV: grep `seven-choice-blank`, `sevenChoiceBlankWidth`, `SevenChoicesBlanks`,
`sevenChoicesBlankPattern`, `ps-seven-choice-blank-width` after editing to confirm ZERO
stragglers across `app/` + `shared/` + `scripts/`.

## Verifier (required — register in `scripts/verify-ci.mjs`)

`scripts/verify-i10-blank-rendering.mjs`, appended to the `registry.scripts` array.

The pattern lives in `PaperSurface.tsx`, which imports React + CSS → a node verifier
cannot import it directly (i9 only imports a *pure* `.ts` adapter). **Recommended
approach (DEV may adopt or propose better, flag to PA):** read `PaperSurface.tsx` source,
extract the `paperBlankPattern` regex literal, `new RegExp` it, and assert behaviorally:
- MUST match (styled span; captured group = bare number): `__41__`, `_____36_____`,
  the 2-regular-space `  NN  ` and `  NN  (keep)` grammar shapes (prompt OUTSIDE the
  capture), and an nbsp variant built from U+00A0 bytes.
- MUST NOT match (guards): single-space `from 5 to`, `page 12 of`, `In 1998 the`;
  `__word__` (no digit); 4-digit `the year 2020` (exceeds \d{1,3}).
- MF-3 DOCUMENTED ACCEPTED false-match: assert that `She scored  9  out of 10.`
  DOES match (styles "9") — encode it as a KNOWN accepted behavior so the verifier
  RECORDS the owner's `\d{1,3}` decision (2026-05-31) instead of hiding it.
- Assert renamed strings present: `ps-paper-blank`, `--ps-paper-blank-width`,
  `paperBlankWidth`, `paperBlankPattern`, `renderTextWithPaperBlanks`; OLD names ABSENT.
- SW-1 robustness: anchor the source-extraction to `paperBlankPattern =` and FAIL LOUDLY
  if the literal cannot be found (a silently-empty extraction is the failure mode).

If DEV finds extracting the regex to a tiny dependency-free module cleaner than
source-parsing, that is acceptable ONLY if the module has no React/CSS import; raise it
in CR. Do not over-refactor the frozen zone for the verifier.

## Browser QA (LOAD-BEARING — render cut)

Per handoff recipe (`/tmp/eqb-handoff-format-blank-rendering.md` §Browser QA). A minimal
hand-built or existing on-disk asset is enough — pure display, no live AI needed. The
on-disk `paper-960d0f8d` (cloze `__41__` + 七选五) and `paper-2024-jslk-english` (grammar
`  56  `) already exercise all three marker shapes.

Open the cloze group AND a 语法填空 group; screenshot; confirm:
- 完形 + 语法填空 blanks render as styled underline + centered number (not literal `__41__` / `  56  `).
- 语法填空 prompt `(keep)` stays attached/visible next to the styled blank.
- 七选五 + 阅读 are UNREGRESSED (七选五 still styled; reading prose with incidental
  numbers not turned into blanks).
- **MF-3 check:** open a 阅读 group whose passage contains an incidental 1-3 digit
  number; confirm it stays inline text (both committed assets have zero false
  matches). Load-bearing backstop for the accepted false-match.

## Allowed Files (per PA `pa.md`)

- `app/src/shared-ui/papersurface/PaperSurface.tsx`
- `app/src/shared-ui/papersurface/PaperSurface.css`
- `shared/papersurface/tokens.mjs`
- `shared/papersurface/tokens.d.ts`
- `shared/papersurface/tokens.d.mts`  (MF-1)
- `scripts/verify-i10-blank-rendering.mjs` (new)
- `scripts/verify-ci.mjs` (register the new verifier)
- `scripts/verify-paper-surface-module-v1.mjs` (MF-2 option a)
- `docs/cuts/I10-blank-rendering/plan.md`

## Forbidden scope

- No `server/**`, no `*Adapter.ts`, no `schemas/**`, no `app/public/paper-assets/**`
  (never commit assets), no print/PDF/export styling changes, no import-side normalization.
- No visual-value change to the blank (width/underline) — F2 is a pure rename.
- No new family gating, no behavior change to 七选五/阅读 rendering beyond the relaxed match.

## PA-Lite (PM inline — to be confirmed/extended by `pa.md`)

Self-review blind spots for PA to inspect first:
1. **False-match risk of the regular-space branch.** `[  ]{2,}` around `\d{1,3}`
   on the shared renderer runs over ALL passage text incl. raw cloze + un-normalized
   reading prose. Risk: a double-spaced 1-3 digit number in body text becomes a blank.
   Judged low (normalized text uses single spaces; 1-3 digit + 2-space-both-sides guard),
   but PA should pressure-test against reading-passage text and decide if the space branch
   needs a tighter guard (e.g. require symmetric delimiter, or anchor).
2. **Rename completeness in the frozen zone** — token mjs↔d.ts parity, all class/var/fn
   references updated, no straggler `seven-choice` left mid-rename.
3. **Verifier credibility** — is source-text regex extraction a real regression signal or
   a grep-style false comfort? (Handoff lesson: grep verifiers miss harness bugs; browser
   QA is the real proof here.)

## Acceptance

- [ ] Regex matches all 3 marker shapes; guards reject false positives (verifier green).
- [ ] `verify-i10-blank-rendering.mjs` registered + `node scripts/verify-ci.mjs` green.
- [ ] `npm run build --prefix app` (typecheck) green.
- [ ] Browser QA: 完形 + 语法填空 styled; 七选五 + 阅读 unregressed; screenshots attached.
- [ ] No straggler `seven-choice` rename references.
