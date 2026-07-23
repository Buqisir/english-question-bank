# applied-writing-lecture-v3 · Plan

**cut size: large; touches schema / data contract / product boundary / teaching
interpretation: yes / yes / no / yes.** Large because the cut introduces an
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
2. Only two-point prompts publish: `reviewCard.points` is exactly two and the
   five literal-line grids are exactly
   `type -> cares -> points[0] -> tense -> points[1]`.
3. Exactly four nested `highlightExpressions[].lectureAnnotation` objects power
   highlight view; all four outer expression texts are literal logical-line
   anchors and outer long analysis remains untouched.
4. Incomplete application payload is wholly unavailable, never partially shown.
5. Variant A geometry/leader specs are copied, not reinterpreted.
6. The essay keeps Times New Roman; Xiaolai is Chinese annotation ink and
   Shantell Sans is only English annotation/transfer ink.
7. The lecture-only host replaces 246 px with the fixed 794 × 472 stage
   (612 × 458 frame) for the active available group; teardown restores 246 px.
8. V3 mounts only when the real `.paper-browse-content` canvas measures its
   full 794 CSS px; the viewport number is evidence, not the product contract.
9. Backend authors/persists; website consumes; continuation and exports remain
   unchanged.

## Implementation slices

### P1 — Data contract and publish gate

- Extend `writing-analysis-v1.schema.json` and `paperAsset.ts` with additive
  optional `reviewCard`, `reviewMarks`, and nested `lectureAnnotation` shapes.
- Strengthen `validateWritingAnalysisCandidate` for application only:
  11 review-card fields, exactly two non-empty points, exactly five review marks
  in `[type, cares, points, tense, points]`, occurrence-to-index mapping, literal
  logical-line matches for all five review and all four annotated highlight
  anchors, exactly four complete short highlight annotations, and
  plain-text/trim/single-line/code-point limits.
- Persist those application fields without changing outer highlight values or
  order. Continuation projection must exclude/reject the new nested object.
- Export one frontend availability predicate from
  `WritingAnswerBoxReview.tsx` and consume it in `PaperBrowsePage.tsx` and
  `WritingReviewAnnotationStage.tsx`; missing or malformed-present payload
  becomes `unavailable` before any stage mounts.
- Add behavioral assertions to `verify-restart3-teacher-analysis.mjs` for good
  payload plus normalized-only review/highlight anchors, partial nested values,
  wrong point/mark/annotation counts, invalid grid order/duplicates/indexing,
  trim/HTML/Markdown/newline/code-point failures, legacy missing fields, and
  continuation leakage.

### P2 — Two locked pilot payloads and parity harness

- Owner must first inspect both exact candidates in the interactive
  `prototype-pilot-review.html` (both tabs for 2022 and 2024) and explicitly
  say the prototype passes. The linked JSON objects remain bound to SHA-256
  `5618d515…b65037` (2022) and `39fd2fcd…bea35af` (2024). This visual owner
  verdict is the hard DEV gate; teaching copy is not delegated to DEV.
- After confirmation, DEV writes those exact objects for `paper-2022-i` and
  `paper-2024-i` through the real validator +
  `persistWritingAnalysisGroup`; no hand-edited final JSON and no copy changes.
- Add an archived parity harness under this cut's `qa/payload-parity/` that
  consumes post-persist payload and proves `spec.md` parity before renderer
  completion. It is feasibility evidence, not final React QA.
- Run existing vocab gate for any changed model-answer text; the plan does not
  authorize changing model answers or outer long highlight analysis.

### P3 — Production renderer

- Give `WritingPaperPage` optional lecture-only answer-box props. Clicking the
  available/loading application box in `PaperBrowsePage` sets
  `activeWritingLectureGroupId = groupId` and opens lecture without changing the
  print-facing page model or PaperSurface intent protocol.
- Mount `WritingReviewAnnotationStage` only under
  `lectureOpen && activeWritingLectureGroupId === groupId && application &&
  available && panelGroupId === groupId`. Loading/unavailable/narrow-unsupported
  keeps the original answer box and zero partial stage DOM.
- Esc/close and any scroll/selection transition to continuation/another group
  clear the active writing id, current tab, seed, and stage DOM before the new
  panel takes ownership.
- Replace the on-screen 246 px answer-box region with a fixed 794 × 472 stage
  and 612 × 458 frame while active. The stage may use the paper's 91 px gutters
  but may never grow taller. Closing restores 246 px; print/export/student DOM
  never sees the replacement.
- Measure the real `.paper-browse-content` canvas after the existing lecture
  shell reflow. Mount only when that canvas is 794 CSS px (its production cap);
  the nested writing content/answer width is then 612 px. When the live canvas
  is narrower, keep its current responsive 246 px answer box and do not mount,
  scale, overflow, or invent a mobile stage. Local real-page evidence at
  1470 × 719 was `canvas 794 / answer 612 / rail 380`; at 1200 × 719 it was
  `canvas 628 / answer 446 / rail 380`, with no overlap in either state.
- Port Variant A's DOM measurement, two-dimensional pockets, fair allocation,
  leader rules, font-ready measurement, deterministic seed, and reseed behavior.
  The real-packet prototype adds one exact feasibility rule: a narrower note
  candidate may enter when it unlocks a left/right lane; it does not also need
  the connector's `near` classification. This produced 2022 `5/5` without
  changing copy, height, coordinates, or annotation typography.
  Keep solver internal; do not export scoring internals as product contracts.
- Self-host one payload-codepoint-subset WOFF2 each for Xiaolai and Shantell
  Sans, with separate OFLs and one source/version/build record. Xiaolai source
  is `lxgw/kose-font@v3.121` (`58beef8e...` release asset
  `Xiaolai-Regular.ttf`); Shantell source is
  `google/fonts@00e726a9.../ofl/shantellsans/ShantellSans[BNCE,INFM,SPAC,wght].ttf`.
  The source record stores full source/output SHA-256 values and the exact
  subsetting command; a coverage assertion proves every annotation code point.
  No CDN, package, lockfile, or font substitution.
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
- `app/public/fonts/applied-writing/xiaolai-awl-v3.woff2`
- `app/public/fonts/applied-writing/shantell-sans-awl-v3.woff2`
- `app/public/fonts/applied-writing/OFL-Xiaolai.txt`
- `app/public/fonts/applied-writing/OFL-Shantell-Sans.txt`
- `app/public/fonts/applied-writing/SOURCES.md`

Evidence/artifacts:

- `docs/cuts/applied-writing-lecture-v3/**`

PA may narrow this list. Any additional runtime file requires PM disposition
before DEV.

## Single-PR size-gate exception

The exact implementation route is **one PR, 16 runtime/data files**:

| Family | Count |
| --- | ---: |
| schema/type | 2 |
| backend validator/persistence + behavioral verifier | 2 |
| exact pilot runtime assets | 2 |
| paper-browse / writing host and dedicated components | 5 |
| two subset fonts + two OFLs + one source/build record | 5 |
| **Total** | **16** |

This is a PM-approved one-file exception to the target of 15. One PR is safer
because backend validation/persistence, the two published payloads, frontend
availability, host state, renderer, and exact font metrics form one atomic
whole-payload contract. Splitting would create an intermediate contract head
whose payload and consumer cannot receive the same exact-head verification and
browser QA. Rollback boundary is the single merge commit: revert it to restore
the old three-field application payload consumption and inert 246 px answer
box. Verification boundary is that exact 16-file DEV head: behavioral
validator/persistence + payload parity + TypeScript/CSS/full suite + DP-2 all
bind to it. Any seventeenth runtime/data file is a PM stop before write.

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
- owner visual prototype verdict recorded in `pilot-content/README.md` for both
  exact candidate hashes and all four packet/tab states.

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
4. A legacy application and one malformed-present fixture each preserve the
   246 px answer box, show `解析未发布`, and contain zero partial annotation DOM.
5. With the 2024 stage open, scroll/select continuation and the other writing
   group: the application stage unmounts, active group/rail agree, and returning
   does not restore stale tab/seed state.
6. With the real lecture shell open, a measured 794 px canvas mounts the exact
   794 × 472 stage and 612 × 458 frame. One CSS pixel below the canvas cap does
   not mount v3 and retains the responsive 246 px box. QA records the viewport
   only as reproduction evidence; no fixed viewport breakpoint substitutes for
   the canvas measurement.
7. Close lecture and export student/teacher print/PDF/DOCX smoke: no annotation
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
- [ ] DP-2A owner personally inspects both tabs of both real-packet states in
  `prototype-pilot-review.html` and explicitly says “过关”; this is the only
  remaining blocking PO decision. Machine `5/5` / `4/4` is precheck only.
- [ ] DP-3 DEV exact-head implementation complete.
- [ ] DP-4 fresh verification exact-head PASS.
- [ ] DP-5 fresh CR 0 unresolved Must Fix.
- [ ] DP-6 browser QA + owner PO QA pass.
- [ ] DP-7 fresh RM merge, main CI, STATUS/cut-note, AWL-V3-02 ready.

## PA follow-up decisions

Formal PA result is committed at
`e5d8dec9c76b35d581bc61e96b41681e3c7c7529`. A fresh PM plan-revision must
record one disposition for every item in `pa.md`'s
`Must Fix -> Plan Disposition Checklist`.

- [ ] **MF-1 — packet + teaching gate:** exact production-shaped packets now
  exist under `pilot-content/`, teaching interpretation is `yes`, current outer
  payload fields are byte-for-byte preserved, PM grammar/register/
  relationship/purpose/vocabulary checks pass, and P2 forbids DEV-authored
  teaching copy. The real-packet Variant A prototype and four screenshots exist
  under this cut and machine precheck is 2022 `5/5 + 4/4`, 2024 `5/5 + 4/4`.
  **Open only on the owner's personal visual inspection and explicit “过关”.**
- [x] **MF-2 — fixed mark class:** D3/P1 support exactly two points and the
  prototype-backed grid order
  `[type, cares, points, tense, points]`; all other point counts, grid orders,
  duplicates, and point-index/cardinality mismatches reject the whole payload.
- [x] **MF-3 — literal/availability symmetry:** D4/D5, P1, spec's rejection
  matrix, verification, and browser QA apply one logical-line literal rule and
  whole-payload unavailability to all five review plus four annotated
  highlight anchors, including malformed-present fixtures.
- [x] **MF-4 — active host/state:** D5/D7 and P3 lock the answer-box trigger,
  explicit active writing group, mount predicate, teardown, loading/
  unavailable behavior, 246/472 replacement, 612 × 458 frame, and
  `canvasWidth === 794` / `< 794` boundary. The live site canvas and selected
  prototype—not DEV—settle the host.
- [x] **MF-5 — counted route:** one PM-approved PR contains exactly 16
  runtime/data files, with atomic rollback and exact-head verification
  boundaries above; a seventeenth file stops before write.

Disposition closure is **4/5** and blocking PO decisions are **1**. The other
two formal-PA PO decisions are closed by the already selected prototype: its
fixed 794 × 472 replacement host and exact two-point five-mark order. DEV
dispatch remains forbidden until the owner personally passes the real-packet
prototype, closing MF-1 and making the counts 5/5 and zero.
