# 01 — Contract and validator

Status: done (branch), not on main
Blocked by: Owner acceptance of `../spec.md`
Next on PASS: 02
Terminal: no

## What to build

Spec D1, D3, D7.

- `schemas/paper-import/writing-analysis-v1.schema.json`: add the closed
  `applicationAnalysis` object; exactly one of `reviewCard` or
  `applicationAnalysis` for application.
- `app/src/domain/paperAsset.ts`: add the matching type to
  `ApplicationWritingAnalysis`.
- `shared/writing/applicationAnalysisV4.mjs` (+ `.d.ts`): shape check and
  `validateApplicationAnalysisV4({ analysis, writingTask, groupPassage })`
  implementing D3, returning `{ warnings, wordCounts }`.
- `server/import-review/nck1AnalysisProjection.mjs`,
  `server/writing-analysis/writingAnalysisBackfillService.mjs`,
  `server/paper-import/analyzedPackage.mjs`: accept and keep
  `applicationAnalysis`; enforce `modelAnswer === standard.essay`.

Contract files in DEV scope for this ticket: the schema file and
`app/src/domain/paperAsset.ts`. Unlock with `.claude/contract-unlock` only while
editing them; delete it after.

## Acceptance criteria

- [x] Trial outputs for five papers (copied into `../qa/fixtures/`) pass.
- [x] One failing fixture per D3 rule fails with a message naming the rule.
- [x] Legacy and V2-card envelopes validate and project exactly as before.
- [ ] `node scripts/verify-ci.mjs` passes. (See Result: failures in this
  container also fail on the pre-change commit.)

## Out of scope

Prompt routing, display.

## Result

Commit: `7c2610e81` (code), follow-up commit for the verifier index and this result.
Verify: `node scripts/verify-application-analysis-v4.mjs` passes: 5 trial
fixtures pass, 14 D3 failure cases each fail with the field and rule named.
Also pass: `verify-application-review-card-v2`, `verify-continuation-analysis-v1`,
`verify-single-group-analysis`, `verify-application-model-answer-prompt`,
`verify-i5-writing-ai-import`, `verify-i7-application-given`,
`verify-nck1-new-paper-locks`, `verify-architecture-housekeeping`.
Full `verify-ci.mjs` in this container: 174 pass, 37 fail. One was this
ticket's (new verifier missing from `scripts/README.md`); fixed, and
`verify-architecture-housekeeping` now passes. The other 36 fail the same way
on the pre-change commit `2d6d802ff`: no ImageMagick 7 `magick` binary, and no
service on `127.0.0.1:8787` in this container. They need GitHub CI to confirm.
Notes:
- `validateApplicationAnalysisV4` lives in
  `server/paper-import-ai/applicationWritingWorkflow.mjs`, next to
  `expectedGiven`, which derives the given lines. The shared module
  `shared/writing/applicationAnalysisV4.mjs` holds the pure shape and D3 checks.
- "Exactly one of reviewCard or applicationAnalysis": the schema and backfill
  reject both; the staged projection also rejects neither. Backfill and schema
  still accept neither, because older stored groups and the V3 backfill path
  may have no card (D7). New V4 writes always carry `applicationAnalysis`.
- The model's `taskType` and `blocked` are stripped; a non-null `blocked`
  throws and nothing is persisted.
