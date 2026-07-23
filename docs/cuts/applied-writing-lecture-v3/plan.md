# applied-writing-lecture-v3 · Plan

**cut size: large; touches schema / data contract / product boundary / teaching
interpretation: yes / yes / no / no.** Large because the cut introduces an
application publishing contract and a paper-local anchor/geometry protocol.
Owner-approved prototype direction lowers direction risk but does not waive
fresh formal PA, verification, fresh CR, browser QA, PO QA, RM, or main CI.

## Goal

Productionize Variant A from the frozen prototype on current `github/main` so a
teacher can point from application-writing judgments and transferable language
to the original model-answer sentences without breaking the essay reading flow.

## Locked decisions

`decisions.md` and `spec.md` are the current contract. In particular:

1. Original essay stays primary; two always-visible annotation views only.
2. `reviewCard` + exactly five literal-line `reviewMarks` power review view.
3. Exactly four nested `highlightExpressions[].lectureAnnotation` objects power
   highlight view; outer long analysis remains untouched.
4. Incomplete application payload is wholly unavailable, never partially shown.
5. Variant A geometry/leader specs are copied, not reinterpreted.
6. Backend authors/persists; website consumes; continuation and exports remain
   unchanged.

## Implementation slices

### P1 — Data contract and publish gate

- Extend `writing-analysis-v1.schema.json` and `paperAsset.ts` with additive
  optional `reviewCard`, `reviewMarks`, and nested `lectureAnnotation` shapes.
- Strengthen `validateWritingAnalysisCandidate` for application only:
  11 review-card fields, 1–5 non-empty points, exactly five review marks, grid
  mapping/cardinality, literal single-line anchor match, exactly four complete
  short highlight annotations, plain-text/trim/single-line/code-point limits.
- Persist those application fields without changing outer highlight values or
  order. Continuation projection must exclude/reject the new nested object.
- Define one shared frontend availability predicate matching the published
  contract; missing/invalid payload becomes `unavailable` before any page mounts.
- Add behavioral assertions to `verify-restart3-teacher-analysis.mjs` for good
  payload and every rejection family, including normalized-only anchors, HTML,
  Markdown, newline, partial nested values, count mismatch, and continuation
  leakage.

### P2 — Two locked pilot payloads and parity harness

- Author short annotations for `paper-2022-i` and `paper-2024-i` only.
- Write them through the real validator + `persistWritingAnalysisGroup`; no
  hand-edited final JSON.
- Add an archived parity harness under this cut's `qa/payload-parity/` that
  consumes post-persist payload and proves `spec.md` parity before renderer
  completion. It is feasibility evidence, not final React QA.
- Run existing vocab gate for any changed model-answer text; the plan does not
  authorize changing model answers or outer long highlight analysis.

### P3 — Production renderer

- Make the application answer box an explicit lecture trigger without changing
  `WritingPaperPage`'s print-facing model or PaperSurface intent protocol.
- Mount a dedicated `WritingReviewAnnotationStage` from the paper-browse host
  only under `lectureOpen && application && available`.
- Port Variant A's DOM measurement, two-dimensional pockets, fair allocation,
  leader rules, font-ready measurement, deterministic seed, and reseed behavior.
  Keep solver internal; do not export scoring internals as product contracts.
- Self-host Xiaolai SC and Shantell Sans with upstream OFL and source/version
  records. No CDN, package, lockfile, or font substitution.
- Replace application right-rail full analysis with the filled review card +
  quiet pointer. Continuation keeps `WritingAnalysisPanel` unchanged.

### P4 — Verification, QA, and closeout

- DP-2 archived browser contract uses real local API, Vite, `qa-local-owner`,
  and real React DOM/geometry. It checks both pilots plus one legacy unpublished
  application and one continuation regression.
- Fresh verification binds narrow commands and `verify:all` to exact DEV head.
- Fresh CR attacks prototype fidelity, contract symmetry, geometry hard
  constraints, continuation/export isolation, and evidence binding.
- Fresh QA coordinator runs real-click browser QA and enters `human-QA`; owner
  runs the five-item PO checklist. Fresh RM then runs artifact gate, merges,
  watches main CI, writes compact STATUS and cut-note closeout, and unlocks
  AWL-V3-02.

## Allowed files

Runtime/data:

- `schemas/paper-import/writing-analysis-v1.schema.json`
- `app/src/domain/paperAsset.ts`
- `server/writing-analysis/writingAnalysisBackfillService.mjs`
- `scripts/verify-restart3-teacher-analysis.mjs`
- `app/public/paper-assets/paper-2022-i/latest/analyses/writing-analysis-v1.json`
- `app/public/paper-assets/paper-2024-i/latest/analyses/writing-analysis-v1.json`
- `app/src/features/paper-browse/PaperBrowsePage.tsx`
- `app/src/features/paper-browse/WritingAnswerBoxReview.tsx` (new)
- `app/src/features/paper-browse/WritingReviewAnnotationStage.tsx` (new)
- `app/src/features/paper-intelligence/WritingPaperPage.tsx`
- `app/src/features/paper-intelligence/writingPaperPage.css`
- `app/public/fonts/applied-writing/**` (two font files, OFLs, source record)

Evidence/artifacts:

- `docs/cuts/applied-writing-lecture-v3/**`

PA may narrow this list. Any additional runtime file requires PM disposition
before DEV.

## Forbidden

- `app/src/shared/papersurface/**`, PaperSurface types/intents, or
  `writingPageModel.mjs` / `PaperBlock` kinds.
- print/PDF/DOCX/export renderers or styles; student-mode behavior.
- routes, server APIs, auth, production config/deploy, database/schema migration.
- continuation schema semantics, continuation assets, or existing continuation
  rendering/CSS.
- remaining 20 application assets and missing-11 production.
- runtime CDN fonts, new geometry/font packages, lockfiles, generic annotation
  abstractions, hard-coded sample copy/coordinates, heuristic truncation/split.
- merging or cherry-picking rejected B2 runtime from the archive branch.

## Verification contract

Pre-DEV / P1-P2:

- `node --check server/writing-analysis/writingAnalysisBackfillService.mjs`
- `node scripts/verify-restart3-teacher-analysis.mjs`
- payload parity harness: two pilots, 5/5 + 4/4 + geometry/anchor invariants.

DEV completion:

- `node scripts/verify-restart3-teacher-analysis.mjs`
- `node scripts/verify-lecture-panel-css.mjs`
- `npm -C app exec tsc -- --noEmit`
- `pnpm -C app run verify:all`
- `node docs/cuts/applied-writing-lecture-v3/qa/dp2-applied-writing-lecture-v3.mjs`
- `git diff --check`

Verification records real exit codes and exact HEAD in `verification.md`.
Missing dependencies are environment evidence, not an implementation verdict.

## Browser / PO QA matrix

1. `paper-2024-i`: open lecture and answer box; review view has 5/5 notes on
   original essay, no overlap/crossing/out-of-paper, correct fonts/direction.
2. Switch to highlight view: exactly 4/4 short annotations; long analysis is not
   dumped on paper; left/right bounds and reseed stability hold.
3. `paper-2022-i`: same behavioral/geometry invariants on a materially different
   letter length; no hard-coded 2024 copy or coordinate.
4. A legacy application without complete contract shows `解析未发布` in paper
   and rail; no partial annotation stage. Continuation remains unchanged.
5. Close lecture and export student/teacher print/PDF/DOCX smoke: no annotation
   DOM/content leaks; Esc returns the original paper flow.

## Stop criteria

- `SPEC CONTRADICTS`: stored fields/length class cannot reproduce the approved
  visible units without forbidden fallback.
- `SCOPE UNCLEAR`: supported narrow layout or answer-box trigger cannot be
  specified from current product behavior.
- `BRANCH CONFLICT`: latest `github/main` cannot be cleanly incorporated before
  DEV starts.
- After two non-converging geometry/implementation loops, return to this
  contract; do not add height, cards, drawers, clicks, truncation, or solver
  complexity.
- Human QA pauses Auto-Next. No production deployment is authorized by this cut.

## Decision points

- [x] DP-0 Wayfinder found first unfinished ticket and its production blocker.
- [x] DP-1 PM compressed approved prototype + real payload into current contract.
- [x] DP-2 fresh formal PA verdict; `pa.md` records
  `APPROVE WITH MUST FIX` (5 unresolved Must Fix, 3 blocking PO decisions).
- [ ] DP-3 DEV exact-head implementation complete.
- [ ] DP-4 fresh verification exact-head PASS.
- [ ] DP-5 fresh CR 0 unresolved Must Fix.
- [ ] DP-6 browser QA + owner PO QA pass.
- [ ] DP-7 fresh RM merge, main CI, STATUS/cut-note, AWL-V3-02 ready.

## PA follow-up decisions

Formal PA result is committed at
`e5d8dec9c76b35d581bc61e96b41681e3c7c7529`. A fresh PM plan-revision must
record one disposition for every item in `pa.md`'s
`Must Fix -> Plan Disposition Checklist`. Current closure is 0/5 and blocking
PO decisions are 3. DEV dispatch remains forbidden.
