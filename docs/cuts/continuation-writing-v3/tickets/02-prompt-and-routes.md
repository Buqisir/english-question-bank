# 02 — Prompt and generation routes

Status: ready
Blocked by: 01
Next on PASS: 03
Terminal: no

## What to build

Spec D2, D4.

- `prompts/continuation-writing-model-answer-v3.md`: status CANDIDATE →
  PRODUCTION; body unchanged.
- `prompts/continuation-writing-staged-analysis-v3.md`: new packaging contract,
  wraps the V3 JSON as `{ taskType, modelAnswer, continuationAnalysis }`.
- `prompts/continuation-analysis-v2.md` and
  `continuation-writing-staged-analysis-v2.md`: status SUPERSEDED.
- `server/paper-import-ai/analyzeNarrativeContinuation.mjs`: build the runtime
  prompt as V3 plus the structured task input; no doctrine appended for
  continuation (`analyzerProviderShell.mjs`).
- `scripts/import-pipeline/lecture-redo.mjs`, the agent plugin marker check,
  `server/paper-import/analyzedPackageProducerKit.mjs`: V3 heading and files.
- `scripts/import-pipeline/writing-analysis-driver.mjs`: `<key>.analysis-v3.json`
  plus review; `persist` derives `modelAnswer` from the standard essay.
- `scripts/verify-continuation-analysis-v1.mjs` and
  `scripts/verify-teaching-analysis-style.mjs`: update the expectations that
  pin V2 for new papers; keep the checks for other task types.

## Acceptance criteria

- [ ] The runtime continuation prompt for one trial paper equals V3 plus the
  task input that `../trial/prep.mjs` builds, byte for byte.
- [ ] A dry run of each route on a fixture writes a group that passes ticket
  01's validator; no model call is needed (feed a trial output).
- [ ] Doctrine checks still pass for every other task type.
- [ ] `node scripts/verify-ci.mjs` passes, or every failure also fails on the
  pre-change commit and is listed.

## Out of scope

Regenerating any paper. Display.

## Result

Commit:
Verify:
Notes:
