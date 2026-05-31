# I10 Cut Note — Blank Rendering (渲染格式 cut · 第一刀「空格渲染」)

Closed: 2026-05-31. Branch `i10-blank-rendering`. PO 黄学伟.

## What shipped

完形填空 + 语法填空 passage blanks now render as the styled underline + centered
number (the way 七选五 already did), instead of literal `__41__` / `  56  `.
Display-only: no schema / data-contract / import-side change. The shared
`PaperSurface` blank renderer was relaxed + made family-neutral.

## The change

- **Relaxed the blank pattern** `PaperSurface.tsx`:
  `/(?:_{3,}| {3,})…/` → `/(?:_{2,}|[  ]{2,})\s*(\d{1,3})\s*(?:_{2,}|[  ]{2,})/g`.
  Underscore branch 3→2 (matches cloze `__41__`); space branch adds regular space
  + count 3→2 (matches 语法填空 `  56  `, which `normalizeGrammarFillText` emits).
- **Family-neutral rename** (F2): `ps-seven-choice-blank`→`ps-paper-blank`,
  `--ps-seven-choice-blank-width`→`--ps-paper-blank-width`,
  `sevenChoiceBlankWidth`→`paperBlankWidth` (all THREE token files),
  `sevenChoicesBlankPattern`→`paperBlankPattern`,
  `renderTextWithSevenChoicesBlanks`→`renderTextWithPaperBlanks`. 72px unchanged.

## Decisions (PO-confirmed 2026-05-31)

- **F1 = relax render regex** (vs import-side normalize): fixes existing on-disk
  assets + future, no re-import.
- **F2 = rename to family-neutral** `ps-paper-blank` (serves 3 families now).
- **MF-3 = accept `\d{1,3}`**: a double-spaced 1–3 digit number in body prose
  (`She scored  9  out of 10.`) is a documented, accepted, rare false-match;
  recorded in the verifier, browser-QA-backstopped.

## Files

- `app/src/shared-ui/papersurface/PaperSurface.tsx` — relaxed pattern, rename, 4 callers.
- `app/src/shared-ui/papersurface/PaperSurface.css` — class + var rename.
- `shared/papersurface/tokens.mjs` + `tokens.d.ts` + `tokens.d.mts` — token rename (parity).
- `scripts/verify-i10-blank-rendering.mjs` (new) + `verify-ci.mjs` (register) + `README.md`.
- `scripts/verify-paper-surface-module-v1.mjs` — updated to new names + relaxed pattern (MF-2).

## Gates

- **PA** (`pa-reviewer`): APPROVE WITH MUST FIX (3), all folded. MF-1: `tokens.d.mts`
  omitted from rename → would break the in-CI parity verifier; added. MF-2: stale
  `verify-paper-surface-module-v1.mjs` pinned old names → updated. MF-3: space-branch
  false-match → locked owner ACCEPT. `pa.md`.
- **CR** (`cr-reviewer`): APPROVE WITH MUST FIX (1). MF-CR-1: the new verifier was a
  **fake green** — behavioral tests ran a hardcoded regex copy, so a source mutation
  (`\d{1,3}`→`\d{1,4}`) passed 38/38. Fixed: reconstruct the RegExp from the extracted
  source literal AND add discriminating no-match sentinels (`  2020  `, `__2020__`) that
  only `\d{1,3}` rejects; proven by re-running the mutation (now exits 1). `cr.md`.

## Browser QA (load-bearing — render cut)

On-disk `paper-960d0f8d` (cloze `__41__` + 七选五 `_____36_____` + reading) and a
QA-only 2-space grammar variant (synthetic, reverted; on-disk grammar assets use
non-canonical legacy shapes):

- ✅ 完形: 15/15 blanks styled; zero literal `__41__`.
- ✅ 语法填空 (canonical `  56  `): mid-sentence blanks styled, prompts `(absorb)`/`(be)`
  attached correctly; **sentence-initial blanks unstyled** — see Known Limitation.
- ✅ 七选五: 5/5 styled, unregressed.
- ✅ 阅读: 0 false matches across 15+ incidental numbers (99/100/800/333…) — MF-3
  backstop empirically clean. Incidental 4-digit years (`2026`, `2018`) stay inline.
- ✅ No old `ps-seven-choice-blank` class anywhere; no console errors.

## Known Limitation → next slice

**Sentence-initial 语法填空 blanks are not styled** (render as plain number). The
space-marker loses its leading delimiter when sentence segmentation splits at the
period before it. 语法填空 only (underscore-marker families are immune). NOT a
regression (pre-I10 grammar styled zero blanks). PO decided ship-now, fix-next-slice.
Recorded in `docs/paper-surface-watch-ledger.md` with the preferred future fix.

## Verify

`node scripts/verify-ci.mjs` green (incl. new I10 verifier + in-CI parity verifier);
`npm run build --prefix app` green.
