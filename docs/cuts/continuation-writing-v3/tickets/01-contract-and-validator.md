# 01 — Contract and validator

Status: in progress
Blocked by: Owner acceptance of `../spec.md`
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

- [ ] V3 trial outputs from `../trial/round2/` and `../trial/round3/`, copied
  into `../qa/fixtures/`, pass. `paper-zj-2026-jan` is not used.
- [ ] One failing fixture per D3 rule fails with a message naming the rule.
- [ ] The round 2 2025-ii output raises the new-name warning; the round 3
  outputs raise none.
- [ ] V1, V2 and I19 envelopes validate and project exactly as before.
- [ ] `node scripts/verify-ci.mjs` passes, or every failure also fails on the
  pre-change commit and is listed.

## Out of scope

Prompt routing, display.

## Result

Commit:
Verify:
Notes:
