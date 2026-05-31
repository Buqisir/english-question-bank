# CR — I11 Symbol Normalization (slice 2a)

Reviewer: fresh-Opus CR-lite, cold read on branch `i11-symbol-normalization`.
Date: 2026-05-31. Implementation commit `0f8cd68`. Baseline `main`.
Plan: `docs/cuts/I11-symbol-normalization/plan.md`. PA: `docs/cuts/I11-symbol-normalization/pa.md`.

## Verdict

**APPROVE** (static gate). Browser QA may proceed — it is load-bearing and NOT
satisfied by this CR (D4 end-to-end highlight consistency + I10 styled-blank render
are only provable in the browser).

No Must Fix. Two Should Watch (neither blocks merge). The verifier is **NOT a fake
green** — proven by 6 mutations, all caught (table below).

## Changed Scope

Code files (docs/*.md are plan/PA artifacts, ignored for review):
- `server/paper-import-ai/normalizePassageText.mjs` (new, 98 lines) — pure 3-rule normalizer.
- `server/paper-import-ai/docxSplitter.mjs` (+21/−20) — `import` + wraps assembled
  `text:`/stem/option/optionBank/starter values in `normalizePassageText(...)`. The 20
  deletions are benign reflow: old `text,` / `A: options.A,` lines replaced by
  `text: normalizePassageText(...)`. No structural logic removed; `normalizeLine` body
  and all section/marker/question/option/answer-range regexes untouched (confirmed by
  reading the diff — the lone `normalizeLine` token in the diff is unchanged context in
  the seven-choices `.filter`, not an edit).
- `scripts/verify-i11-symbol-normalization.mjs` (new, 332 lines, 45 assertions).
- `scripts/verify-ci.mjs` (+1, appended to `registry.scripts`).
- `scripts/README.md` (+1, CI-column row).

Scope adherence: file list == plan's Allowed Files exactly. `packageBuilder.mjs`
UNCHANGED (D4). No `app/**`, `schemas/**`, other `server/**`, other `scripts/verify-*`,
no render-side, no 2b. `.claude/launch.json` present only as untracked — NOT committed
(correct per Forbidden). Hook is at assembled build sites, NOT inside `normalizeLine`.

## Mutation-Test Results (the load-bearing check)

Each mutation applied to `normalizePassageText.mjs`, verifier re-run, then reverted.
Tree confirmed byte-clean vs HEAD after every revert; final baseline 45/45.

| # | Mutation | Verifier result | Caught? |
|---|----------|-----------------|---------|
| 1 | Rule 1 comma mapping disabled (`'，'`→`'，'`) | 42 pass, 3 FAIL | YES |
| 2 | Rule 2 space-insertion neutered (`$1$2`) | 37 pass, 8 FAIL | YES |
| 3 | Rule 3 spacing (3b/3c) neutered | 42 pass, 3 FAIL | YES |
| 4 | Forbidden space-collapse `/ {2,}/→' '` added (C2 damage) | 43 pass, 2 FAIL — `  56  ` sentinel RED | YES |
| 5 | Rule 2 widened to digits (forbidden) | 43 pass, 2 FAIL — `56.7`/`21.3` RED | YES |
| 6 | Rule 3 CJK-scope removed → fires on any paren | 41 pass, 4 FAIL — `(wear)`/`(56)` RED | YES |

All six caught, including the two highest-risk regressions for this cut: the C2
two-space marker (mutation 4) and the `(wear)`/`(56)` byte-intactness (mutation 6).
**The verifier protects what the plan said it must.**

## Findings

### Must Fix
None.

### Should Watch

- **SW-A — Rule 1 paren-pair asymmetry on ASCII-interior full-width parens at string
  start.** `（DEF）` → `（DEF)`: the closing `）` is ASCII-preceded so Rule 1 converts it,
  but the opening `（` is at string start (not ASCII-preceded) so it stays full-width,
  yielding a mismatched pair `（DEF)`. Reachable only when a full-width paren with a
  pure-ASCII interior begins a paragraph/option (Rule 3 skips it — no CJK interior). Not
  a C2/marker concern, deterministic, idempotent, cosmetic. Does not block; flag for the
  2b polish pass (curly/paren cleanup) if it appears in real papers. (`normalizePassageText.mjs:43-44`.)

- **SW-B — `.map(normalizePassageText)` passes `(element, index, array)`.** At
  `docxSplitter.mjs:995,1005` (starters). `normalizePassageText(text)` ignores the extra
  args, so benign today, but a future signature change (adding a second param) would
  silently receive the array index. Cosmetic robustness note only; the string-array
  contract for `starters` is intact (consumers at `packageBuilder.mjs:626-627`,
  `writingPageModel.mjs:32-33` interpolate `${starters[i]}` as plain strings — verified).

## Self-Review Blind Spots (for any later Big CR)

- **Browser QA is the real gate for D4 and not exercised here.** The static verifier
  proves `normalizePassageText` in isolation + the grammar two-stage compose. It does
  NOT prove that the AI, at `/analyze`, actually receives the normalized paragraph text
  and bakes quotes against it end-to-end (D4's whole point). PA validated this by path
  (parseResult flows identically to analyze + publish, set once at workbench L287, never
  mutated) but no automated test runs the real pipeline. The MF-2 browser highlight check
  (known-normalized quote, Reading AND one of 完形/七选五) remains load-bearing and
  un-discharged by this CR.
- **CJK lookahead range excludes astral CJK (Ext B+, U+20000+).** `[一-鿿㐀-䶿豈-﫿]`
  covers BMP CJK + Ext A + Compatibility Ideographs only. A passage using a rare
  Ext-B ideograph adjacent to English punctuation would not get the CJK guard. Vanishingly
  rare in Gaokao text; I judged it acceptable, not a defect — but a Big CR may want to
  confirm against the actual QA paper's character set.
- **Verifier assertion at lines 200-204 is effectively tautological** for its given input
  (`He 56 (wear)...` already has a space before `(wear)`, so the `||` short-circuits true
  regardless of behavior). It is redundant, not load-bearing — the real `(wear)`/`(56)`
  byte-intactness is locked by the strong exact-equality assertions at L210-220 (mutation 6
  proved those bite). No action needed; noting so a later reviewer does not mistake L200 for
  the protection.

## Verification Evidence

- `node scripts/verify-i11-symbol-normalization.mjs` → 45 assertions, 45 passed, 0 failed.
- `node scripts/verify-ci.mjs` → "CI verify passed". Confirmed `verify-i10-blank-rendering.mjs`
  AND `verify-i11-symbol-normalization.mjs` both appear in the suite run (`==> scripts/verify-i10-…`,
  `==> scripts/verify-i11-…`) — the new script is genuinely registered and the I10 marker
  regression suite is still green.
- Independent edge probes (not in the verifier): adjacent gloss parens `(光)process(合)` and
  `（光）process（合）` both → ` (光) process (合) `, idempotent (blind-spot (a) HOLDS);
  `word，   中文` and `word，\n中文` NOT converted (whitespace-then-CJK guard); 50k-char
  unclosed paren returns instantly (no catastrophic backtracking — `[^)]`/`[^（）]` classes
  are linear); option-text after `compactOptionText` introduces no double-space (blind-spot
  (b) benign).
- Read assertions confirmed to fail on regression: mutations 1-6 above each turned the
  relevant assertions RED.

## Failure / Attack Angle

- **Most plausible silent failure: an evidence highlight that contained a normalized
  character is lost at render.** This is exactly C1/MF-1. Under D4=(e) it cannot occur *if*
  the parseResult-to-analyze-to-publish single-object invariant truly holds at runtime. The
  static gate cannot see this; it is delegated to PA's path proof + browser QA. If a future
  edit re-introduced any post-analyze normalization (e.g. re-adding a hook in
  `packageBuilder.mjs`), divergence returns — but that file is unchanged and the verifier
  would not catch such a regression because it tests the pure function, not the pipeline.
  Browser QA MF-2 is the only gate that would.
- **Future-agent misuse:** someone adds a 4th rule (e.g. quote/dash for 2b) and accidentally
  introduces space-collapse or widens Rule 2/3. Mutations 4/5/6 prove the verifier's C2
  sentinels + digit-guard + CJK-scope cases would go RED — this is well defended.

## Residual Risk

Low for the static surface. The residual risk is entirely in the un-automated browser QA
(D4 end-to-end highlight + I10 styled-blank render on a re-imported real paper). Static
correctness, scope, idempotency, no-backtracking, C2 byte-intactness, and verifier strength
are all confirmed.

## Recommendation

**APPROVE.** No Must Fix. Proceed to browser QA (load-bearing, per plan §Verify and
MF-2): re-import ONE real paper, confirm (1) punctuation/spacing/gloss normalized across
Reading/七选五/完形/语法填空, (2) all I10 styled blanks still render, (3) an evidence
highlight on a known-normalized quote resolves in Reading AND one of 完形/七选五. Do not
commit the asset. Merge only after browser QA passes.
