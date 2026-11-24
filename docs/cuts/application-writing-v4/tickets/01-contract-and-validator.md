# 01 — Contract and validator

Status: ready
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

- [ ] Trial outputs for five papers (copied into `../qa/fixtures/`) pass.
- [ ] One failing fixture per D3 rule fails with a message naming the rule.
- [ ] Legacy and V2-card envelopes validate and project exactly as before.
- [ ] `node scripts/verify-ci.mjs` passes.

## Out of scope

Prompt routing, display.

## Result

Commit:
Verify:
Notes:
