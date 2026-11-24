# 02 — Prompt and generation routes

Status: ready
Blocked by: 01
Next on PASS: 03
Terminal: no

## What to build

Spec D2, D4.

- V4 status line to PRODUCTION; V3 status line to SUPERSEDED.
- `applicationWritingWorkflow.mjs`: runtime prompt is V4 plus task text (no
  doctrine); new staged packaging contract
  `prompts/application-writing-staged-analysis-v2.md`.
- `lecture-redo.mjs`, `writing-analysis-driver.mjs`, the agent plugin marker,
  `analyzedPackageProducerKit.mjs` file lists, `prompts/application-writing-agent-entrypoint.md`,
  `docs/import/agent-contract.md`.
- Update the verify scripts that pin V3 text or the V3 shape
  (`verify-application-model-answer-prompt`, `verify-teaching-analysis-style`,
  `verify-nck1-analysis-agent-plugin`, `verify-single-group-analysis`,
  `verify-nck1-new-paper-locks`, `verify-universal-nck1-publish`,
  `lecture-redo.test.mjs`) so they pin V4 and still cover legacy data.

## Acceptance criteria

- [ ] A dry run of `lecture-redo prepare` for one paper writes a request whose
      contract starts with the V4 heading.
- [ ] `writing-analysis-driver persist` accepts a trial fixture and writes
      `applicationAnalysis` plus `modelAnswer`.
- [ ] No test is skipped or weakened; every changed assertion names V4.
- [ ] `node scripts/verify-ci.mjs` passes.

## Out of scope

Running generation on any paper.

## Result

Commit:
Verify:
Notes:
