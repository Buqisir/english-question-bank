# Local import shared-contract repair

Owner authorized implementation on 2026-10-15 after reviewing the five-part
proposal in Amp thread T-01a12024-9f2c-707e-82a4-828c4cff447f. This is local
repair and acceptance preparation, not Ship, deployment, paper approval or
production submission. The six restored paper worktrees remain separate inputs;
do not mutate their sealed evidence, credentials, backups or revisions.

## Scope and decisions

1. Accept directional double quotes at the interior edges of inline blanks,
   without normalizing signed text or accepting ambiguous apostrophes/hyphens.
2. Add preprocessing report v4 for the four current PDF products, natural
   pagination for answerOnly and strictly loopback HTTP preview URLs. Preserve
   v1-v3 meanings, exact revision/digest checks and evidence requirements.
3. Extend versioned OCR confirmation beyond furniture. Semantic tables must
   retain cells and source observations; images must retain source crops and
   question-group association. Answer-source tables remain answer references,
   not student content. Missing/duplicate/wrong-page bindings still fail closed.
4. Carry source instructions and listening example presence/content through
   validated, version-bound data consumed identically by Screen/Print/PDF.
   Do not fabricate an example for a source that has none, or silently change
   historical published rendering. Existing source evidence remains immutable.
5. Diagnose the local browser capture failure separately from application
   behavior, then inspect affected rendered states. Audio playback is not
   semantic audio review.

## Acceptance

Each changed public seam needs a reproducer and an adversarial regression
control. Keep immutable old candidates/reports replayable. For OCR cover a
question table, a content image, and an answer scoring table, plus omitted,
duplicate and foreign-region/observation bindings. For source presentation
cover source example present/absent, non-C example answers, source instructions
and historical fallback. Inspect actual Screen/Print/PDF for changed rendering.
Shared-contract delivery requires independent Standards/Spec review and the
repository's Ship gates if Owner later authorizes Ship. No six-paper import
completion claim follows from these shared checks alone.

## Pre-Ship implementation and review

- Inline boundary reproducer failed before the fix and passed after it,
  including reversed quotes, apostrophes, word collisions and immutability.
- Report v4 implemented; targeted actual-pdfinfo probe passed for v1-v4,
  natural 13-page answerOnly, incomplete delivery, evidence omission and URL
  rejection. The enclosing materialization Candidate verifier also passed.
- OCR v3 confirmation/v8 producer preserves rectangular tables from confirmed
  items and replayable PDF crops. The existing OCR verifier passed including
  actual producer -> Candidate -> preview, tampered/missing visual controls,
  answer-carrier tables and historical authority replay. Tables require separate
  question/answer sources; images require a separate PDF question source.
  Merged/nested or emphasized cells remain explicitly blocked.
- Materialization v4/v62 carries source directions and explicit example
  presence/content, with old authorities retained. Public Candidate, compiler,
  Review projection and consumer checks passed for absence, a non-C answer,
  wrong-source/missing evidence and historical v61 replay.
  Default Screen v46/Print-PDF v47 preserve the new field; older consumers
  reject sourcePresentation-bearing publications while historical input still
  loads. The public admission/consumption compatibility check passed.
- Ego screenshot timeout did not reproduce in this run. The actual PaperSurface
  and Print HTML were inspected for absent/provided/legacy examples. The shared
  pagination renderer produced three one-page PDFs; extracted text retained all
  five Questions and the correct example state. This is synthetic contract QA,
  not acceptance of any of the six real papers.
- Local only: no commits, push, production submission or deployment. Six-paper
  data upgrades and renewed evidence binding remain with their import tasks.
  Full/E2E remain Ship gates, not claimed here. Answer scoring references still require the existing explicit sidecar
  capture against answer-source locations; classification does not infer them.
- Owner-requested advisor review found missing OCR visual group ownership,
  stale Screen-revision binding, and cache/inspection disagreement. Wrong-group
  acceptance and a stale report link were reproduced. Visual inventory now
  binds the source parser's group and neighboring anchors; v4 Screen reports
  resolve authenticated Review status; cache hits reuse inspection validation.
  The real report CLI passed against an isolated local mock Review service for
  both stale rejection (no output) and current acceptance.
- Follow-up review closed those three findings and identified table edge
  whitespace divergence. Expected cells now come from the regenerated producer
  groups, retaining complete content nodes without a second trim policy. The
  final narrow advisor review found no remaining blocker in that fix; the
  regression explicitly covers leading tab/trailing newline source text.

## Ship CI correction

- The first natural PR 507 run failed: shared fixture assertions still expected
  Candidate61/Screen45, and the new consumers selected raw-import62's older
  presentation policy. Keep the failed run as evidence; no checks were waived.
- Presentation63 extends presentation60 with core/group-v3 support only.
  Screen46/Print47 now bind it, preserving continuation justification and
  proportional cloze columns. Candidate62 and all historical authorities remain
  byte-identical. Regression coverage checks both old and new consumer geometry.
- The resolver failed before this correction and passed after; fixture-only
  publication replay and materialization Candidate verification passed. Scoped
  advisor review found no blocker in the presentation-branch correction.
- Actual continuation Screen and Print HTML passed the original alignment
  assertion. The local browser verifier later failed its macOS PDF glyph-ink
  ratio assertion (1.7809142178648145). A control using the unchanged Print46
  contract failed at the same assertion with identical measurements. Neither
  run is a suite PASS; retain this local limitation and require fresh natural
  CI on the corrected head. The first control also timed out because its old
  Screen contract did not match the current client; the print-only control
  kept the current Screen contract and reached the PDF assertion.
