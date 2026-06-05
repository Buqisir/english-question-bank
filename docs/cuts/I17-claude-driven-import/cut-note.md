# I17 Cut Note — Claude-driven whole-paper import (12 新课标 papers)

## Outcome

Imported **12 新课标 真题** (新课标 Ⅰ + Ⅱ, 2020–2025) into the bank using Claude
(not DeepSeek) for both splitting and analysis. Each paper: 7 published groups
(reading A–D + 七选五 + 完形 + 语法填空 + 应用文 + 读后续写), 45 questions →
**540 questions total**, standard exam numbering (21–35 / 36–40 / 41–55 / 56–65),
official answers, real_exam provenance (全国新课标Ⅰ/Ⅱ).

paperIds: paper-{2020,2021,2022,2023,2024,2025}-{i,ii}.

## How (pipeline, all driver code in `.scratch/import-pilot/`, gitignored)

1. **Split (deterministic, no AI)** — `lib.mjs` detects sections format-agnostically
   (handles both the simplified `一、二、三` layout AND the official `第X部分/第X节`
   layout), strips score annotations `(N分)`, renumbers to standard exam numbers,
   renders blanks as `__NN__`, applies `normalizePassageText`. `01-split.mjs` runs it +
   shape-gates via the shipped `build*AnalysisMessages`.
2. **Analyze (Claude, answer-guided)** — Opus per group via the SHIPPED prompts
   (`prompts/*-analysis-v1.md`). Reading is fed the official answer (driver un-blanks
   what the shipped code blanks); cloze/grammar/seven already pass the real answer.
   Run as a background **Workflow** (84 groups, ~10 concurrent, each self-validated
   against the shipped `analyze*ImportCandidate` validators with retry).
3. **Publish (serial)** — `02-publish.mjs` validates every analysis, builds the package
   via the shipped `buildPaperImportAiPackageFiles`, **overrides import-meta provenance**
   (sourceType/region/paperName/year/tags) post-build, and publishes directly via the
   shipped `publishPaperImportPackage`. No contract code changed.

## What is committed

Only the published paper-assets snapshots: `app/public/paper-assets/<paperId>/latest/**`
(7 tracked files × 12 = 84 JSON files: paper-asset / answer-key / import-meta + 4 analyses).
`versions/` (raw DOCX) stay gitignored; the driver + prompts stay in `.scratch/`.

## Verification

- Split: 12/12 papers pass shape gates; answers spot-checked against source `【答案】`
  (independent re-run, e.g. 2024-ii reading DADCBADCBDACBCA + seven BCEAG matched).
- Analysis: 84/84 groups pass the shipped per-type validators (schema + official-answer
  match + verbatim-quote). 4 needed a corrective retry (3 were workflow reply-string
  false negatives; 1 — 2020-i reading-b — genuinely re-run).
- DB: 12 papers × 7 groups × 45 q = 540; all real_exam; region 全国新课标Ⅰ/Ⅱ; 0 mis-typed.
- Render: 2024-i (Format A reading), 2025-i (reading), 2022-i (Format B grammar w/ I16c
  verb axes) all render correctly with full Claude analysis; no console errors.

## Known follow-ups (not in this cut)

- **Backfill via Claude**: verb-profile + topic-label backfills still hit DeepSeek-flash;
  owner asked to move them to Claude. Deferred — derived, zero-reimport.
- **Promote the driver**: `.scratch/import-pilot/{lib,01-split,02-publish,validate-one}.mjs`
  is a working pilot; promoting to `scripts/` + committed split-prompt provenance is a
  separate cut (would then get a proper code CR).
- **Data-quality watch**: 2020-i reading-b passage is a single paragraph (source DOCX has
  no paragraph breaks); a few skill-tags are approximate. All derived → re-runnable.

## ADR alignment

ADR-0008 (derived dimensions backfillable) is what made model/provider choice non-locked;
ADR-0007 six-family completeness gate kept whole-paper publish honest (not weakened).
