# 01 — Contract and validator

Status: done; on main 2026-11-25
Blocked by: none (spec accepted 2026-11-24)
Next on PASS: 02
Terminal: no

## What to build

Spec D1, D3, D7.

- `schemas/paper-import/writing-analysis-v1.schema.json`: add the closed
  `continuation-analysis-v3` branch; move `storyUnderstanding` and
  `continuationContract` from the shared `required` into the V1 and V2
  branches.
- `schemas/paper-import/continuation-analysis-v3.schema.json`: new, closed.
- `app/src/domain/paperAsset.ts`: add the matching type.
- `shared/writing/continuationAnalysisV3.mjs` (+ `.d.ts`): pure shape and D3
  checks, `validateContinuationAnalysisV3({ analysis, writingTask, source,
  starters })` returning `{ warnings, wordCounts, quoteShares }`. Port the
  rules from `../trial/check.mjs`; do not import the trial script.
- `server/import-review/nck1AnalysisProjection.mjs`,
  `server/writing-analysis/writingAnalysisBackfillService.mjs`,
  `server/paper-import/analyzedPackage.mjs`: accept and keep V3; enforce
  `modelAnswer === standard.essay`; strip `taskType` and `blocked`, throw on a
  non-null `blocked`.

Contract files in DEV scope for this ticket: the two schema files and
`app/src/domain/paperAsset.ts`. Unlock with `.claude/contract-unlock` only while
editing them; delete it after.

## Acceptance criteria

- [x] V3 trial outputs from `../trial/round2/` and `../trial/round3/`, copied
  into `../qa/fixtures/`, pass. `paper-zj-2026-jan` is not used.
- [x] One failing fixture per D3 rule fails with a message naming the rule.
- [x] The round 2 2025-ii output raises the new-name warning; the round 3
  outputs raise none.
- [x] V1, V2 and I19 envelopes validate and project exactly as before.
- [x] `node scripts/verify-ci.mjs` passes, or every failure also fails on the
  pre-change commit and is listed.

## Out of scope

Prompt routing, display.

## Result

Commit: see branch log, "Continuation V3 ticket 01".
Verify: `node scripts/verify-continuation-analysis-v3.mjs` passes: 15 trial
fixtures pass; the two round 2 fixtures that wrote 4 `beyondStandard` entries
(2022 Ⅰ, 2024 Ⅰ) fail D3.9 as they should; 22 failure cases, at least one per
D3 rule, each fail with the field and rule named; the round 2 2025-ii fixture
warns about "Emma" in both essays and the round 3 and fix-check fixtures warn
about nothing; a direct-speech warning fires when the essay quotes far more
than the source. Schema, analyzer entry, staged projection, analyzed-package
intake gate, backfill candidate and persistence are each exercised, and V2 and
I19 envelopes still validate. App `tsc -b` passes. Also pass:
`verify-continuation-analysis-v1`, `verify-application-analysis-v4`,
`verify-single-group-analysis`, `verify-architecture-housekeeping`,
`verify-analyzed-package`.
CI: full `verify-ci.mjs` in this container: 37 scripts failed. 36 also fail
on the pre-change commit `d98e5615f` (rerun there one by one): no ImageMagick 7
`magick` binary, no service on `127.0.0.1:8787`, and the deploy and OCR
fixtures that need them. They need GitHub CI to confirm. The 37th,
`verify-review-build-identity`, failed with "Target file watcher failed" while
files were being edited during the run; it passes when rerun on the committed
tree.
Notes:
- No standalone `continuation-analysis-v3.schema.json`. The V3 shape lives in
  `$defs.continuationAnalysisV3` inside `writing-analysis-v1.schema.json`,
  as application V4 does; a second copy would drift.
- The shared module exports `checkContinuationAnalysisV3(analysis, { material,
  starters, wordCountTarget })` returning `{ problems, warnings, wordCounts,
  directSpeech }`. `validateContinuationAnalysisV3({ analysis, writingTask })`
  lives in `server/paper-import-ai/analyzeNarrativeContinuation.mjs`, strips
  `taskType` and `blocked`, throws on a non-null `blocked` or any problem, and
  returns the stored writing with `modelAnswer` set to the standard essay.
- `nck1AnalysisProjection.mjs` accepts V2 or V3 until ticket 02 switches new
  papers to V3 only.
- `ContinuationAnalysis` in `app/src/domain/continuationAnalysis.ts` stays
  V1 | V2, so the current panel never tries to render V3; `paperAsset.ts`
  widens the stored field to include `ContinuationAnalysisV3`. Display is
  tickets 03 and 04.
- Backfill skips the legacy [120, 200] word-count warning for V3, which has
  its own new-word ranges.
- `analyzedPackage.mjs` needed no rule change (V3 uses no retired or unknown
  root keys); its gate is now exported so the verifier can exercise it.
- `paper-zj-2026-jan` is in no fixture; the verifier asserts this.
