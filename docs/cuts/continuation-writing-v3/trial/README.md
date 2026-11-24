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
