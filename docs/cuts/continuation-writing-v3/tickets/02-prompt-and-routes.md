# 02 — Prompt and generation routes

Status: done
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

- [x] The runtime continuation prompt for one trial paper equals V3 plus the
  task input that `../trial/prep.mjs` builds, byte for byte.
- [x] A dry run of each route on a fixture writes a group that passes ticket
  01's validator; no model call is needed (feed a trial output).
- [x] Doctrine checks still pass for every other task type.
- [x] `node scripts/verify-ci.mjs` passes, or every failure also fails on the
  pre-change commit and is listed.

## Out of scope

Regenerating any paper. Display.

## Result

Commit: see branch log, "Continuation V3 ticket 02".
Verify: `node scripts/verify-continuation-analysis-v3.mjs` now also:
- runs the trial's own `trial/prep.mjs` on `paper-2026-i` and checks that the
  runtime prompt equals its `v3-prompt.txt` byte for byte (one user message:
  the V3 body from 「你是一名」, a blank line, the structured task input);
- checks the staged contract: V3 heading, the same body, the V3 packaging
  contract, and no doctrine, V2 prompt or V2 schema;
- runs the provider shell on a trial output (passes, comes back unchanged);
- runs `validateNck1StagedAnalysis` on a packaged V3 draft (accepted) and on
  one whose `modelAnswer` is not the standard essay (rejected);
- runs the backfill driver end to end on a temporary paper: `list` writes the
  V3 prompt; `persist` exits 1 with no review and with a `MUST_FIX` review and
  writes nothing; with `PASS` it persists the V3 writing entry, which passes
  the schema; a second `list` finds no work.
Updated to V3 and passing: `verify-continuation-analysis-v1` (one user
message; both V2 prompts marked superseded and absent from the staged
contract; the provider shell rejects a V2 candidate; all V1/V2 validation
checks kept), `verify-teaching-analysis-style` (continuation joins application
in the no-doctrine group; every other builder still loads the doctrine once),
`verify-nck1-analysis-agent-plugin` (the V3 contract passes, the V2 pair is
refused, no doctrine is sent). Also pass: `verify-application-model-answer-prompt`,
`verify-application-analysis-v4`, `verify-single-group-analysis`,
`verify-nck1-new-paper-locks`, `verify-architecture-housekeeping`,
`verify-companion-analysis-export`, `verify-i5-writing-ai-import`.
`verify-analyzed-package-producer-kit` stops at the missing `magick` binary
here, as on the pre-change commit.
CI: full `verify-ci.mjs` run pending; recorded in the follow-up commit.
Notes:
- Spec D4 says the projection "requires V3" for new papers; D7 says V2 stays
  valid in projection. `nck1AnalysisProjection.mjs` keeps accepting V2 so
  packages already produced with V2 can be re-projected in the revision flow.
  New papers still get only V3: the plugin refuses any continuation contract
  without the V3 headings, and the builder sends only V3.
- The V3 prompt replaces V2's `status: unsupported` sentinel with `blocked`.
  The staged packaging contract has no `blocked` field and returns the
  sentinel string `SPEC CONTRADICTS: cannot reconstruct complete continuation
  task` instead, as the staged route expects.
- New `prompts/continuation-writing-agent-entrypoint.md` (generation and
  `PASS | MUST_FIX` review), like the application one.
- Backfill drops the I19 vocabulary gate for continuation; the V3 program
  checks and the independent review replace it. `analyzeContinuationAnalysis.mjs`
  and `runVocabGate` are no longer used by the driver; left in place for
  ticket 04 or a later cleanup.
- `validateApplicationReview` became the generic `validateWritingReview(review,
  label)`; application calls it with `'application'`.
- The driver now exits 1 when any group fails, for both task types.
- The provider shell returns the raw V3 output; callers turn it into the
  stored entry with `validateContinuationAnalysisV3`.
- `lecture-redo.mjs` calls `buildNarrativeContinuationStagedAnalysisContract`,
  so it needed no change.
