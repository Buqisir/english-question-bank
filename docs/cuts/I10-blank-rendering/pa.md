# PA Review — I10 Blank Rendering

Reviewer: 小川 (PA hat), fresh cold-read. Branch `i10-blank-rendering`,
plan committed at 9a72510. All claims below verified by path, not prose.

## Verdict

**APPROVE WITH MUST FIX**

Direction is right, slice is correctly display-only, scope discipline holds.
But the plan's file list is incomplete in the frozen zone in a way that will
break an in-CI verifier (`tokens.d.mts`), leaves a stale verifier asserting the
deleted symbols, and defers the one genuine product risk (space-branch false
match) to a hand-wave instead of a locked decision. Three Must Fix items, all
small and concrete. No rescope.

## Product Principle

The teacher reads 完形/语法填空 on the A4 surface the same way they read 七选五:
a number sits on a fixed-width underline, not as literal `__41__` / `  56  `
noise. This reduces visual parsing work and makes the three blank families
consistent. It serves the paper, does not add an AI panel, and is reversible
(display-only, no data touched). The cut should exist now.

## Exact UX / Architecture Model

- Before: `renderTextWithSevenChoicesBlanks` runs on ALL passage sentence text
  (PaperSurface.tsx L381/389/391/394) but only matches `_{3,}` / ` {3,}`,
  so only 七选五 (`_____36_____`) styles. 完形 (`__41__`) and 语法填空 (`  56  `,
  regular-space U+0020) fall through to literal text.
- After: relaxed pattern matches `_{2,}` and `[  ]{2,}` around a
  1–3 digit number, so all three families style. Pure rename of
  `seven-choice` → `paper-blank` across class / CSS var / token / fn (now
  family-neutral). No width/visual change.
- Verified the operative regex on disk is
  `/(?:_{3,}| {3,})\s*(\d{1,3})\s*(?:_{3,}| {3,})/g`
  (PaperSurface.tsx L62) — space branch is **nbsp-only** today, which is why
  语法填空 (regular space) does not match. The plan's table (§Root cause row 3)
  states this correctly; the plan's L18 transcription writes ` {3,}` (regular
  space) which is a harmless prose typo — DEV must edit against the real L62
  literal, not the L18 quote.

## Must Fix Before DEV

### MF-1 — `tokens.d.mts` is missing from the rename file list (breaks in-CI verifier)

The plan's "exact change" (§3) renames `sevenChoiceBlankWidth` only in
`tokens.mjs` and `tokens.d.ts`. There is a **third** declaration file,
`shared/papersurface/tokens.d.mts` (L18: `readonly sevenChoiceBlankWidth: string`).

`scripts/verify-paper-surface-mjs-declaration-parity.mjs` IS in the CI registry
(`verify-ci.mjs` L16) and asserts `normalizeDeclarations(.d.ts) ===
normalizeDeclarations(.d.mts)`. If DEV renames `.d.ts` but not `.d.mts`, parity
fails and CI goes red. Risk: guaranteed CI break on a frozen-zone file.

**Required disposition:** add `shared/papersurface/tokens.d.mts` to the Allowed
Files and to the §3 rename step (`sevenChoiceBlankWidth` → `paperBlankWidth` in
all THREE token files). Add to the straggler-grep targets.

### MF-2 — stale `verify-paper-surface-module-v1.mjs` asserts the OLD names + exact OLD regex literal

`scripts/verify-paper-surface-module-v1.mjs` hard-asserts every symbol this cut
renames, plus pins the exact pre-relax pattern at L518:
`/const\s+sevenChoicesBlankPattern\s*=\s*\/\(\?:_\{3,\}\|\\u00A0\{3,\}\)\.\.\./`
and asserts `.ps-seven-choice-blank`, `--ps-seven-choice-blank-width`,
`sevenChoiceBlankWidth` (L498, L502, L507, L513, L518, L523, L532).

Mitigating fact I verified: this verifier is **NOT** in the CI registry
(`verify-ci.mjs` has no entry; `scripts/README.md` marks its "in CI" column
`no`; the evidence/insight verifiers only list it in allow-lists, they do not
spawn it). So it will NOT turn this PR red. **But** it now permanently asserts
deleted symbols: if anyone ever runs it or re-adds it to CI, it fails loudly and
falsely implicates I10. Leaving it is silent rot in the frozen zone, exactly the
kind of fake-signal the plan's §PA-Lite blind-spot 3 warns about.

**Required disposition:** the plan must make an explicit decision and record it:
either (a) update `verify-paper-surface-module-v1.mjs` to the new names + relaxed
pattern (preferred — keeps the historical contract live and correct), or
(b) explicitly document it as a known-stale non-CI verifier with a one-line
follow-up note. Do NOT leave it silently contradicting the code. Add the file to
Allowed Files if option (a).

### MF-3 — space-branch false-match: lock a decision, do not defer to "owner accepts"

§PA-Lite blind-spot 1 is the right concern and I pressure-tested it. The relaxed
space branch `[  ]{2,}` around `\d{1,3}` runs over un-normalized text:
cloze passage is stored raw (`packageBuilder.mjs` ~L438 `text: p.text`, no
space pass) and reading prose has no double-space collapse on the render path.

Pressure-test results (relaxed pattern) against realistic prose:

| Input | Matches? |
| --- | --- |
| `In 1998 the population grew to 200 people.` | no (single spaces) |
| `from 5 to 12 years old` / `page 12 of` | no (single spaces) |
| `around   1850   the city` / `the year   2020` | no (4 digits > `\d{1,3}`) |
| **`She scored  9  out of 10.`** | **YES — falsely styled "9" as a blank** |

So the guard is "1–3 digit number with 2+ spaces on BOTH sides." In normalized
reading prose this is rare, and the two committed assets
(`paper-960d0f8d`, `paper-2024-jslk-english`) produce ZERO false matches — only
the three intended blank shapes match. The risk is low-frequency but real on
un-normalized cloze/reading text, and the on-disk evidence is only 2 papers.

This is a PO/product decision the plan currently leaves open ("owner accepts the
documented false-match consideration") without recording WHICH way it was
resolved. Per PA rules, a product behavior decision cannot ship as a vibe.

**Required disposition:** the plan must record one of:
- (a) **Accept as-is** with the explicit rationale that double-spaced 1–3 digit
  numbers in body prose are out-of-distribution for imported exam text, AND make
  the verifier (MF-2 / I10 verifier) assert the `She scored  9  out of 10` style
  case as a KNOWN accepted false-match (documented, not hidden), AND make this a
  load-bearing browser-QA check (reading passage with an incidental number is
  not turned into a blank); or
- (b) **Tighten the space branch** to reduce false matches — e.g. require the
  number to be a standalone token via word-boundary / anchor, or only relax the
  space branch when paired with the underscore branch is insufficient. (PA does
  not prescribe the exact regex — that is DEV's craft — but the plan must say
  "tighten" vs "accept" so DEV is not guessing.)

I recommend (a): the underscore families are unambiguous; the grammar-fill space
shape is the only reason the space branch exists, and grammar text IS normalized
(`normalizeGrammarFillText` collapses to exactly 2 spaces). The residual prose
false-match is rare and the browser-QA reading-unregressed check is the real
backstop. But the plan must SAY (a) and wire the verifier + QA to it.

## Must Fix → Plan Disposition Checklist

- [ ] **MF-1** → `plan.md` §3 and Allowed Files add
  `shared/papersurface/tokens.d.mts`; rename step covers all three token files;
  straggler-grep includes it. (Must Do step + Allowed File.)
- [ ] **MF-2** → `plan.md` records a decision for
  `verify-paper-surface-module-v1.mjs`: update it (add to Allowed Files + Must Do)
  OR document-as-stale with a follow-up line. (Locked decision + Must Do or
  Forbidden note.)
- [ ] **MF-3** → `plan.md` records the false-match resolution (accept vs tighten)
  as a locked decision; the I10 verifier asserts the chosen behavior incl. the
  `She scored  9  out of 10` case; Browser QA matrix includes a reading passage
  with an incidental double-spaced 1–3 digit number staying un-styled.
  (Locked PO decision + Verification entry + Browser QA case.)

## Should Watch

- **SW-1 — verifier credibility (source-text extraction).** The recommended
  approach reads the regex literal out of `PaperSurface.tsx` source and
  `new RegExp`s it. This is a real behavioral signal (it executes the actual
  pattern against match/no-match strings), strictly better than grep. The brittle
  part is the source-EXTRACTION step (a regex that finds the regex). Acceptable
  for this cut, but keep the extraction anchored to `paperBlankPattern =` and
  fail loudly if it cannot find the literal — a silently-empty extraction is the
  failure mode. Browser QA remains the load-bearing proof; the verifier is a
  guard, not the proof. Does not block DEV.
- **SW-2 — `key` prefix string.** The render fn builds keys as
  `${keyPrefix}-seven-blank-${index}` (L448). Cosmetic, inside the renamed fn;
  renaming it to `-paper-blank-` is tidy but the plan does not list it and React
  keys are not user-visible. DEV may rename for consistency; not required, not a
  straggler that breaks anything. Does not block.
- **SW-3 — evidence breadth.** False-match clearance rests on 2 committed
  assets. Fine for a display cut, but note in QA that future imports with
  irregular spacing could surface the MF-3 edge. Belongs to import-side
  normalization (explicitly out of scope here), not this cut.

## Allowed Files

- `app/src/shared-ui/papersurface/PaperSurface.tsx`
- `app/src/shared-ui/papersurface/PaperSurface.css`
- `shared/papersurface/tokens.mjs`
- `shared/papersurface/tokens.d.ts`
- `shared/papersurface/tokens.d.mts`  ← **added per MF-1**
- `scripts/verify-i10-blank-rendering.mjs` (new)
- `scripts/verify-ci.mjs` (register the new verifier)
- `scripts/verify-paper-surface-module-v1.mjs`  ← **only if MF-2 option (a)**
- `docs/cuts/I10-blank-rendering/plan.md` (PM follow-up dispositions)

## Forbidden Files

- `server/**`, any `*Adapter.ts`, `schemas/**`
- `app/public/paper-assets/**` (never commit assets)
- print / PDF / export styling
- import-side normalization (`normalizeGrammarFillText`, `packageBuilder.mjs`)
- No visual-value change to the blank (width/underline stays 72px)
- No new per-family gating of the renderer; no behavior change to 七选五/阅读
  beyond the relaxed match

## Static Verify Requirements

- `node scripts/verify-ci.mjs` green (incl. the registered I10 verifier and the
  in-CI parity verifier — MF-1 is what keeps parity green).
- `npm run build --prefix app` (tsc) green.
- I10 verifier MUST assert behaviorally (executing the extracted pattern):
  - match → captured number only: `__41__`, `_____36_____`, `  56  `,
    `  56  (keep)` (prompt outside the capture), nbsp variant built from U+00A0.
  - no-match guards: `from 5 to`, `page 12 of` (single spaces), `__word__`.
  - per MF-3: assert the chosen disposition for the
    `She scored  9  out of 10` double-space body case.
  - renamed strings present: `ps-paper-blank`, `paperBlankWidth`,
    `--ps-paper-blank-width`, `paperBlankPattern`,
    `renderTextWithPaperBlanks`; old names ABSENT (catch partial rename).
- Straggler grep over `app/` + `shared/` + `scripts/`:
  `seven-choice-blank|sevenChoiceBlankWidth|SevenChoicesBlanks|sevenChoicesBlankPattern`
  returns zero (or only the documented-stale module-v1 if MF-2 option (b)).

## Browser QA Matrix (LOAD-BEARING — render cut)

Use on-disk `paper-960d0f8d` (cloze `__41__` + 七选五 `_____36_____`) and
`paper-2024-jslk-english` (grammar `  56  `):

1. 完形填空 group: blanks render as styled underline + centered number (not
   literal `__41__`). Screenshot.
2. 语法填空 group: blanks styled; `(keep)` prompt stays attached/visible next to
   the styled blank. Screenshot.
3. 七选五 UNREGRESSED: still styled identically. Screenshot.
4. 阅读 UNREGRESSED: reading prose with incidental numbers is NOT turned into
   blanks. Per MF-3, explicitly include a passage view containing a 1–3 digit
   number; confirm it stays inline text. Screenshot.

Static-verify-passed does NOT substitute for these screenshots (AGENTS.md
Browser Verification rule).

## DEV Readiness

- Teacher action improved: reading 完形/语法填空 on the A4 surface without literal
  blank-marker noise. ✔ stated
- Before/after: ✔ stated
- Current boundary: relax regex + rename, display-only. ✔
- Future boundary: 符号归一 / 选项布局 / 标题斜体下划线 / per-family source spacing —
  out of scope, correctly listed. ✔
- Allowed/Forbidden files: ✔ (after MF-1 adds `tokens.d.mts`)
- Verify scripts/assertions: ✔ (after MF-3 wires the chosen false-match case)
- Browser QA matrix: ✔ (after MF-3 adds the reading-number case)
- Open PO decisions: 1 (MF-3 accept-vs-tighten). Under the limit of 3.

DEV may start once PM compresses MF-1 / MF-2 / MF-3 dispositions into `plan.md`.

## Open PO Decisions

1. MF-3: accept the rare double-spaced-number false match (recommended), or
   tighten the space branch? One decision, must be recorded before DEV.

## Scope Confirmation

Confirmed display-only. Does NOT pull in 符号归一, 选项布局, 标题/斜体/下划线, or
per-family source spacing. Forbidden-scope list is correct and complete except
for the `tokens.d.mts` and module-v1 verifier gaps captured in MF-1 / MF-2.
