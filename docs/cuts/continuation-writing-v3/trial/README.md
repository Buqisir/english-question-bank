# Continuation V3 trial, round 1 (2026-11-24)

Status: blind page sent to the Owner; sides not revealed. Per-arm numbers and
the generated essays are committed only after the Owner votes, because word
counts alone would reveal which side is which.

## What is compared

- **V2 (production):** `buildNarrativeContinuationStagedAnalysisContract()`
  plus the structured task input, as the staged worker receives it. Output is
  `{ taskType, modelAnswer, continuationAnalysis }`.
- **V3 (candidate):** `prompts/continuation-writing-model-answer-v3.md` from
  the line starting 你是一名 (the status header is not sent), plus the same
  structured task input. No shared doctrine.
- The blind pair is the V2 `modelAnswer` against the V3 `standard.essay`.
  The V3 teaching page and advanced essay are judged afterwards, not blind.

`prep.mjs` builds both prompt files per paper from the paper assets.

## Papers

- Blind: paper-2022-i, paper-2023-i, paper-zj-2024-jan, paper-mock-sz-2026-m1.
  The reference teacher material for 2024 mentions the 2024.1 浙江 story only
  in one sentence of its preface, with no analysis or model essay, so
  paper-zj-2024-jan stays blind.
- Calibration (V3 only, compared on numbers with the reference teacher
  essays): paper-2024-i, paper-2025-i, paper-2025-ii.
- paper-zj-2026-jan is held out and was not used.

## How it was generated

One Opus medium subagent per paper per prompt, each reading only its own
prompt file and writing only its output file (14 runs in all).

## Checks run

- `check.mjs` with `CW3_RANGES='{"standard":[180,210],"advanced":[250,290]}'`
  on every V3 output, and with `--v2` on every V2 output: no failures and no
  warnings on any of the 11 outputs.
- Every V2 `continuationAnalysis` passes
  `validateNarrativeContinuationAnalysis`, so the production arm is a valid
  production result, not a weakened one.
- Spot check of one V3 teaching page (paper-zj-2024-jan): every source claim
  in the notes was found verbatim in the material.

## Calibration numbers (V3 only)

Reference teacher essays (2024, 2025 Ⅰ, 2025 Ⅱ): new words 268–297, Flesch–Kincaid
grade 3.5–5.8, 8.6–12.0 words per sentence.

| paper | standard new words | advanced new words | advanced FK | advanced words/sentence |
|---|---|---|---|---|
| paper-2024-i | 208 | 287 | 3.6 | 10.4 |
| paper-2025-i | 206 | 283 | 3.0 | 9.2 |
| paper-2025-ii | 205 | 283 | 6.0 | 14.8 |

The advanced essays sit inside the reference length and readability range.
2025 Ⅱ runs longer per sentence than the reference (14.8 against 12.0 at most);
its source is also the hardest of the three (FK 7.8).

# Round 2 (2026-11-24)

Round 1 was not voted: the V2 essays ran about 50 words shorter than the V3
standard essays, and the Owner could not judge quality across that gap.

## What changed

- Owner set the ranges: standard 170–210, advanced 240–280 new words.
- Principle 3 now ties direct speech to the source: mostly reported speech
  when the source mostly reports, one or two short quoted lines at the turn.
  Evidence in `../direct-speech-research.md`. `check.mjs` warns, without
  failing, when an essay's quoted share exceeds twice the source's plus 10
  points.
- Both arms regenerated fresh. The V2 arm is unchanged except
  `wordCountTarget`, set with `CW_V2_TARGET` in `prep.mjs`. V2 counts the
  target over the whole essay including the two starters, so 190 gave 168–186
  new words; the three papers that came out more than 20 words short of the V3
  essay were regenerated at 225.
- Sides re-randomised; votes go to a new collection.

## Checks run

- `check.mjs` with the new ranges on all 7 V3 outputs and 4 V2 outputs: no
  failures. Warnings only on the count of `beyondStandard` items (4, want 2–3)
  for two papers. No direct-speech warnings.
- Every V2 `continuationAnalysis` passes
  `validateNarrativeContinuationAnalysis`.

## Calibration numbers (V3 only)

| paper | source quoted | standard new words | standard quoted | advanced new words | advanced quoted | advanced FK | advanced words/sentence |
|---|---|---|---|---|---|---|---|
| paper-2024-i | 2% | 195 | 4% | 270 | 2% | 5.7 | 15.5 |
| paper-2025-i | 1% | 207 | 4% | 277 | 7% | 4.2 | 13.0 |
| paper-2025-ii | 3% | 202 | 4% | 274 | 5% | 6.0 | 14.3 |

Direct speech fell from 15–32% in round 1 to single figures. The advanced
essays now run longer per sentence than the reference teacher essays (13.0–15.5
against 8.6–12.0), likely because reported speech folds lines into longer
sentences. Not a failure; worth watching in the Owner's read.

## Round 2 result (Owner voted 2026-11-24)

Outputs are in `round2/` (`key.json` holds the A/B mapping). All four pairs
happened to draw V2 as A.

| paper | source quoted | V2 new words | V3 standard new words | V2 quoted | V3 quoted | Owner's pick |
|---|---|---|---|---|---|---|
| paper-2022-i | 8% | 186 | 193 | 13% | 5% | V3 |
| paper-2023-i | 8% | 205 | 208 | 9% | 2% | V3 |
| paper-zj-2024-jan | 4% | 197 | 198 | 1% | 4% | V2 |
| paper-mock-sz-2026-m1 | 10% | 209 | 201 | 0% | 8% | V2 |

2 to 2. No dimension boxes or notes were filled in, so the reasons are not
recorded. The advanced essay was judged worth its extra words on all five
papers where that question was answered (2024-i and 2025-i left blank). The
direct-speech question was not answered.

# Round 3 (2026-11-24)

Round 2 tied 2 to 2 with no reasons recorded. Round 3 adds two prompt rules
the Owner approved and blind-tests them on four papers not used before.

## What changed

- Principle 4 limits new characters: only people the source already has; the
  people the source or starters imply may appear unnamed as background, never
  driving the turn. New objects only if they belong in the scene and do work.
  Evidence in `../new-characters-objects-research.md`.
- The reading section asks exactly three questions, each with one job: where
  the source stops, what the character wants and is like, how the source is
  written (and so how the continuation should be written).
- `check.mjs` requires exactly 3 reading questions and warns on capitalised
  words the source never uses. Days, months, holidays, languages, family forms
  of address, plurals or possessives of known names and parts of known names
  are skipped. The round 2 "Emma" is still flagged.

## Papers

Blind: paper-2026-i, paper-zj-2025-jan, paper-2020-i, paper-mock-gd-2026-m1.
Rule check only (V3, not voted): paper-zj-2024-jan and paper-2025-ii, the two
papers whose round 2 essays brought in a helping new student and a named Emma.
paper-zj-2026-jan stays held out.

## Checks run

- `check.mjs` on 6 V3 and 4 V2 outputs: no failures. One warning: V2 on
  mock-gd puts 20% of words in direct speech against 7% in the source (under
  the warning line after the rematch below; the 225 run had 31%).
- Every V2 `continuationAnalysis` passes
  `validateNarrativeContinuationAnalysis`.
- All 6 V3 outputs ask the three fixed questions. Neither rule-check paper
  brings in a plot-driving or named new person: zj-2024-jan ends with Eva
  learning the building herself; 2025-ii has one unnamed classmate reacting.
- V2 was generated at target 225. mock-gd came out 213 against the V3 186
  and was regenerated at 200, giving 195.

| paper | source quoted | V2 new words | V3 standard new words | V3 advanced new words |
|---|---|---|---|---|
| paper-2026-i | 0% | 213 | 205 | 272 |
| paper-zj-2025-jan | 11% | 202 | 208 | 278 |
| paper-2020-i | 36% | 195 | 201 | 276 |
| paper-mock-gd-2026-m1 | 7% | 195 | 186 | 276 |

## Known weakness, not changed in this round

paper-2020-i's source carries 36% of its words in direct speech, yet the V3
third reading answer calls it a few short quoted lines and both V3 essays
quote 2–3%. The principle 3 wording leads with "mostly reported speech" and
the model applied that default. To fix after the vote by making the third
question decide the amount from the source first.
