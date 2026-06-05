# I17 CR-lite — Claude-driven import (12 papers)

Reviewer: 小川 (CR hat). Scope: the committed diff = 84 paper-asset JSON files
(`app/public/paper-assets/<paperId>/latest/**` for 12 papers). NO committed code
(the generating driver lives in `.scratch/`, gitignored — see cut-note follow-ups).

## What was reviewed (data-integrity, since the diff is data)

- **Schema + answer + quote correctness**: every one of the 84 analysis groups passes
  the SHIPPED per-type validator (`analyze*ImportCandidate` → schemaVersion, exactly-one-
  correct, model-choice == official answerKey, verbatim-substring evidence). Re-confirmed
  by `02-publish.mjs` dry-run across all 12 (0 validation failures).
- **Package integrity**: `buildPaperImportAiPackageFiles` builds 8 files for each paper
  (six-family completeness gate satisfied; not weakened).
- **Provenance**: import-meta + DB sources show sourceType=真题(real_exam), region=
  全国新课标Ⅰ/Ⅱ, clean paperName, correct year. 0 mis-typed.
- **Numbering**: DB question_no = standard 21–35 / 36–40 / 41–55 / 56–65 for all 12.
- **No junk committed**: `git add -n` shows only latest/** JSON; raw DOCX (versions/),
  .env, .scratch all excluded. Confirmed.
- **Render**: 2024-i, 2025-i (Format A), 2022-i (Format B) render with full analysis,
  no console errors.

## Findings

- No Must-Fix in the committed data.
- Workflow reported 4/84 "fails" — verified 3 were reply-string false negatives (files
  valid) and 1 (2020-i reading-b) was re-run to PASS. All resolved before publish.

## Self-Review Blind Spots (for any future Big CR / owner QA)

- The generating logic (split detection, score-stripping, metadata override) is NOT in
  this diff — it is in `.scratch/`. If/when promoted to `scripts/`, that code needs its
  own CR (format-detection heuristics, the grammar Format-2 threshold, continuation
  starter strategies are the riskiest parts).
- Teaching-quality of analyses is owner (PO) judgment; programmatic validation only
  guarantees correctness/well-formedness, not pedagogical nuance. Owner QA'd 2024-i;
  the other 11 use the identical pipeline. Analyses are derived → re-runnable with zero
  re-import if quality tuning is wanted later.
- 2020-i reading-b passage is a single paragraph (source DOCX lacks breaks) — cosmetic.

Verdict: data is sound and gated; safe to merge. Code-review debt is explicitly deferred
to the driver-promotion cut.
