# 02 — Prompt and generation routes

Status: done; on main 2026-11-25
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
      contract starts with the V4 heading. (Not run: prepare downloads a sealed
      candidate from the live review service, which this container cannot
      reach. Covered offline instead; see Result.)
- [x] `writing-analysis-driver persist` accepts a trial fixture and writes
      `applicationAnalysis` plus `modelAnswer`.
- [x] No test is skipped or weakened; every changed assertion names V4.
- [ ] `node scripts/verify-ci.mjs` passes. (See Result.)

## Out of scope

Running generation on any paper.

## Result

Commit: this commit.
Verify:
- `verify-application-analysis-v4` now also builds the staged request with
  `buildApplicationStagedAnalysisContract()` (the builder `lecture-redo`
  uses), asserts it starts with the V4 heading followed by the V2 packaging
  contract, and passes a packaged V4 draft through `validateNck1StagedAnalysis`
  (the gate `validate-analysis.mjs` runs).
- Driver end to end on a temporary paper asset built from the 2026 Ⅱ fixture:
  `list application` wrote `<key>.analysis-v4.prompt.txt` starting with the V4
  heading and without the doctrine; `persist application` refused a
  `MUST_FIX` review and, with `PASS`, wrote `taskType`, `modelAnswer` (equal
  to `standard.essay`) and `applicationAnalysis` (`application-analysis-v4`).
- Pass: `verify-application-model-answer-prompt`,
  `verify-teaching-analysis-style`, `verify-nck1-analysis-agent-plugin`,
  `verify-single-group-analysis`, `verify-nck1-new-paper-locks`,
  `verify-application-review-card-v2`, `verify-i5-writing-ai-import`,
  `verify-i7-application-given`, `lecture-redo.test.mjs` (3/3).
- Environment-blocked here, as on the pre-change commit:
  `verify-analyzed-package-producer-kit` (no ImageMagick 7; with a local shim
  the kit builds with the new file list, then stops at its Node 24 check, this
  container has Node 22) and `verify-universal-nck1-publish` (no `magick`;
  with the shim it stops at the file-watcher limit).
Notes:
- The plugin still requires `teachingDoctrine` in its input, so callers are
  unchanged; it drops the doctrine from the message for `application` only.
- `verify-single-group-analysis`, `verify-nck1-new-paper-locks`,
  `verify-universal-nck1-publish` and `lecture-redo.test.mjs` needed no change:
  they exercise the V2-card envelope, which stays valid for older groups (D7).
- Producer kit ships the V4 prompt, the V2 packaging contract and
  `shared/writing/applicationAnalysisV4.d.ts`; the V2-card declaration stays.
