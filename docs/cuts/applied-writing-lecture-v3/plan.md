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
- Strengthen `validateWritingAnalysisCandidate` for application only and keep
  its rejection matrix exactly symmetric with `isPublishedWritingLecture`:
  all 10 scalar `reviewCard` strings plus both `points` strings are non-empty,
  trim-clean, plain, single-line, and at most 80 Unicode code points; exactly
  five `reviewMarks` use `[type, cares, points, tense, points]`, with literal,
  trim-clean, plain, single-line anchors of at most 240 code points and notes
  of at most 72 code points; point occurrences map to indices 0 and 1; exactly
  four complete highlight annotations keep the existing `24 / 28 / 52`
  code-point limits. Missing, partial, wrong-typed, trim-dirty, markup,
  Markdown, newline, empty, over-limit, normalized-only, or cardinality/order
  failures make the whole application lecture unavailable.
- Persist those application fields without changing outer highlight values or
  order. Continuation projection must exclude/reject the new nested object.
- Export one frontend availability predicate from
  `WritingAnswerBoxReview.tsx` and consume it in `PaperBrowsePage.tsx` and
  `WritingReviewAnnotationStage.tsx`; it must inspect every field named above,
  not only `points`, mark notes, and nested highlight values. Missing or
  malformed-present payload becomes `unavailable` before any stage mounts.
- Add behavioral assertions to `verify-restart3-teacher-analysis.mjs` for good
  payload plus normalized-only review/highlight anchors, partial nested values,
  wrong point/mark/annotation counts, invalid grid order/duplicates/indexing,
  trim/HTML/Markdown/newline/code-point failures, legacy missing fields, and
  continuation leakage.

### P2 — Two locked pilot payloads and parity harness

- Owner must first inspect both exact candidates temporarily injected into the
  real local `PaperBrowsePage` (both paper-local views for 2022 and 2024) and
  explicitly say the prototype passes. `prototype-pilot-review.html?embedded=1`
  supplies only the selected Variant A stage; the real site supplies the
  canvas, navigation, scroll, and lecture rail. The linked JSON objects remain
  bound to SHA-256
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

- Give `WritingPaperPage` application-only lecture props that preserve and
  render the ordinary `answerBox` given-top/given-bottom content unless the
  fixed stage is actually active. The trigger/status is an adjunct to that
  ordinary content, never a replacement for it. `PaperBrowsePage` derives
  application versus continuation from the source writing task, not from a
  fetched analysis. Clicking the application affordance sets
  `activeWritingLectureGroupId = groupId` and opens lecture without changing the
  print-facing page model or PaperSurface intent protocol. Continuation never
  receives an AWL trigger, status, or `answerBoxContent` override.
- Mount `WritingReviewAnnotationStage` only under
  `lectureOpen && activeWritingLectureGroupId === groupId && application &&
  available && panelGroupId === groupId`. Loading/unavailable/narrow-unsupported
  and inactive states keep the complete original answer box and zero partial
  stage DOM.
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
  Preserve review grid/index metadata through placement so the fifth
  `points[1]` mark can apply its locked lower-left preference only when the
  connector is `<= 72 px`. Route candidates and every fallback sample leaders
  against essay-text obstacles and already accepted leaders; unsafe crossings
  or text traversal reject the candidate. Adjacent review anchors use the
  approved micro-leader that begins inside the matching underline and ends
  with an arrowhead at the note. If no complete safe layout exists, report an
  explicit no-layout result to the host, render no partial notes/leaders, and
  restore the ordinary answer box; never emit an unsafe fallback.
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
  quiet pointer. The card must render the four approved sections:
  `基础五定` (`form`, `topic`, `reader`, `person`, `tense`, `type`),
  `圈要点、编号` (numbered `points[0..1]`), `读者三问`
  (`readerWho`, `readerCares`, `readerWants`), and `价值落点` (`value`),
  followed by the exact quiet pointer `批注已落在左侧原范文中`. Add real
  `.awl-review-card` styling. The two stage tabs support bounded Left/Right
  switching and focus. Mixed annotation labels/notes use Shantell Sans first
  for covered Latin glyphs and Xiaolai as the CJK fallback; the essay remains
  Times New Roman and stored text remains byte-for-byte unchanged.
  Continuation keeps `WritingAnalysisPanel` unchanged.

### P4 — Verification, QA, and closeout

- DP-2 archived browser contract uses real local API, Vite, `qa-local-owner`,
  and real React DOM/geometry. It checks both pilots, direct measured-canvas
  794/793 behavior, every principal geometry/leader/font/keyboard/rail
  invariant, the whole malformed-present mutation matrix, one legacy
  unpublished application, and one continuation regression.
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

## Fresh-CR remediation dispositions

Authority: fresh CR `AWL-V3-CR-20260723-01` at live handoff
`e49316b1d638c281bd189c85039d74f7f481a24e`. All MF-1 through MF-6 remain
blocking and must close in one remediation head. The original
`AWL-V3-VERIFY-20260723-01` ledger remains **RELEASE GATE NON-GREEN**; neither
DEV nor PM may edit its recorded exit codes or describe it as green.

### MF-1 — Preserve every inactive answer box

- Exact fix: derive application/continuation from the source writing task;
  continuation never receives the AWL override. Render the ordinary
  given-top/given-bottom answer-box content first for application too, and
  replace it only while the exact application stage mount predicate is true.
  Non-lecture, inactive, loading, unavailable, 793 px, explicit no-layout, and
  continuation states keep their real exam content and 246 px box. An
  application trigger/status may coexist with that content but may not replace
  or hide it.
- Allowed implementation files:
  `app/src/features/paper-browse/PaperBrowsePage.tsx`,
  `app/src/features/paper-browse/WritingAnswerBoxReview.tsx`,
  `app/src/features/paper-intelligence/WritingPaperPage.tsx`, and
  `app/src/features/paper-intelligence/writingPaperPage.css`.
- Executable acceptance:
  `qa/dp2-applied-writing-lecture-v3.mjs` must group-scope every locator and
  prove (a) the application salutation/signature survives each inactive state,
  (b) both continuation starter paragraphs survive before and after an
  application-stage visit, (c) continuation has no AWL trigger/status, and
  (d) only an available active application on a measured 794 px canvas replaces
  246 px with the stage. At least the continuation-content assertion must fail
  against reviewed runtime/data head `017164d`.

### MF-2 — One whole-payload rule, backend through browser

- Exact fix: apply P1's complete field/type/trim/plain/single-line/code-point,
  literal-anchor, count/order, and point-index rules identically in backend
  validation and frontend availability. No `reviewCard` scalar, `points`
  member, `reviewMarks` member, or nested annotation member may escape the
  rule. A malformed-present value rejects persistence or makes the complete
  application lecture unavailable; no partial rail or stage publishes.
- Allowed implementation files:
  `server/writing-analysis/writingAnalysisBackfillService.mjs`,
  `scripts/verify-restart3-teacher-analysis.mjs`,
  `app/src/features/paper-browse/WritingAnswerBoxReview.tsx`, and, only if the
  declared shape itself must be tightened,
  `schemas/paper-import/writing-analysis-v1.schema.json` /
  `app/src/domain/paperAsset.ts`. Allowed evidence files:
  `qa/payload-parity/verify.mjs` and
  `qa/dp2-applied-writing-lecture-v3.mjs`.
- Executable acceptance:
  `verify-restart3-teacher-analysis.mjs` must table-drive deletion, null/wrong
  type, trim, markup, Markdown, newline, empty, over-limit, normalized-only,
  count/order, duplicate-grid, and point-index mutations across every field
  family and prove backend rejection plus unchanged continuation projection.
  DP-2 must route each representative malformed packet into the application
  group, click that exact group's affordance when present, and assert its
  ordinary answer box remains while that group has zero `.awl-stage`,
  `.awl-note`, and leader DOM. The trim-dirty `reviewMarks[].note` and partial
  `reviewCard` cases must demonstrably fail against `017164d`; an unrelated
  continuation `解析未发布` element is never accepted as evidence.

### MF-3 — Port Variant A geometry, including safe failure

- Exact fix: port the frozen prototype's two-dimensional candidate generation,
  fair allocation, route sampling, fifth-mark grid/index rule, injected
  underline micro-leader, font-ready measurement, deterministic seed, and
  reseed behavior. Every accepted route must avoid essay-text obstacles and
  other accepted leaders. Fallbacks obey the same tests; if no complete safe
  layout exists, the host restores the ordinary answer box with no partial
  annotation DOM. Do not add height, copy changes, hard-coded pilot
  coordinates, cards/drawers, truncation, or a different solver.
- Allowed implementation files:
  `app/src/features/paper-browse/WritingReviewAnnotationStage.tsx`,
  `app/src/features/paper-browse/PaperBrowsePage.tsx`,
  `app/src/features/paper-intelligence/WritingPaperPage.tsx`, and
  `app/src/features/paper-intelligence/writingPaperPage.css`. Allowed evidence
  file: `qa/dp2-applied-writing-lecture-v3.mjs`.
- Executable acceptance:
  for both locked pilots and both tabs, DP-2 must sample every SVG leader
  against rendered essay rectangles, detect pairwise leader intersections,
  prove source-to-note arrow direction, exact 5/5 and 4/4 completion, no
  note/text or note/note collision, and no out-of-paper note. It must prove the
  fifth 2022 `points[1]` lower-left placement has a connector `<= 72 px`, the
  rejected 2024 long lower-left route is not forced, and an approved adjacent
  review mark uses a visible micro-leader that starts inside its underline and
  ends at its note. Reopening with the same seed must reproduce note positions
  and path data; `重新寻位` may change only positions/path mix, not essay,
  packet copy, counts, rail, or view. These assertions must fail the simplified
  solver at `017164d`.

### MF-4 — Restore approved rail, typography, and tab semantics

- Exact fix: render every stored value in the four-section review card and the
  exact quiet pointer named in P3; add `.awl-review-card` styling without
  turning the rail into a second essay or AI dashboard. Apply Shantell-first /
  Xiaolai-fallback annotation typography so mixed strings such as
  `On behalf of... 正式开篇` and notes containing `could` use the approved
  English face while Chinese remains Xiaolai. Add bounded Left/Right tab
  handling with correct focus and `aria-selected`.
- Allowed implementation files:
  `app/src/features/paper-browse/PaperBrowsePage.tsx`,
  `app/src/features/paper-browse/WritingReviewAnnotationStage.tsx`, and
  `app/src/features/paper-intelligence/writingPaperPage.css`. Allowed evidence
  file: `qa/dp2-applied-writing-lecture-v3.mjs`.
- Executable acceptance:
  DP-2 compares all rail headings and values to each locked JSON packet, finds
  the quiet pointer, and confirms computed `.awl-review-card` layout is present.
  It checks the font-family order on mixed label/note and transfer text while
  the essay remains Times New Roman. From each tab, repeated ArrowLeft /
  ArrowRight presses stay inside indices `0..1`, update `aria-selected`, and
  move focus to the selected tab. The current sparse rail, Xiaolai-only mixed
  note, and keyboard-inert tabs at `017164d` must fail these assertions.

### MF-5 — Make DP-2 and font evidence attack the contract

- Exact fix: strengthen the archived DP-2 beyond count/containment with all
  MF-1/MF-3/MF-4 assertions above. Test the product boundary by directly
  measuring/forcing the real `.paper-browse-content` canvas to 794 then 793 CSS
  px after lecture reflow; a viewport size alone is not evidence. Add a
  package-free executable WOFF2 cmap assertion to the existing parity harness:
  read both generated cmap tables, derive responsible Chinese and English
  code-point sets from the two locked packet annotation fields, and prove
  Xiaolai covers every Chinese annotation code point and Shantell covers every
  English annotation/transfer code point. The prose `173/173` and `33/33`
  statement is not executable evidence.
- Allowed implementation/evidence files:
  `app/src/features/paper-browse/WritingReviewAnnotationStage.tsx`,
  `app/src/features/paper-browse/PaperBrowsePage.tsx`,
  `app/src/features/paper-intelligence/writingPaperPage.css`,
  `qa/dp2-applied-writing-lecture-v3.mjs`, and
  `qa/payload-parity/verify.mjs`. The two WOFF2 files are read-only locked
  inputs; no package, lockfile, or seventeenth runtime helper is authorized.
- Executable acceptance:
  DP-2 records actual canvas width `794` with mounted stage and actual width
  `793` with zero stage plus preserved 246 px content; geometry, seed/reseed,
  rail, keyboard, mixed-font, and inactive-content checks all pass. The parity
  harness reports the exact responsible/covered cmap sets for both faces and
  exits non-zero for a fixture that removes one required mapping. A
  source-text grep, hash-only check, browser fallback, or viewport proxy does
  not satisfy this MF.

### MF-6 — Produce a genuinely green new release proof

- Exact fix: remove only the tracked trailing horizontal whitespace at
  `app/public/fonts/applied-writing/OFL-Shantell-Sans.txt:21` and
  `app/public/fonts/applied-writing/OFL-Xiaolai.txt:22`; license wording and
  line order remain unchanged. Use the working project typecheck command. Set
  up the fresh worktree with the repository script so full-suite database
  checks see current prepared data, or rely on clean CI when it provides the
  exact-head proof. Do not waive `git diff --check`, TypeScript, any full-suite
  failure, or the fresh verification role.
- Allowed implementation files: the two OFL files above. Allowed routing/result
  artifacts: `agent-entrypoint.md` and `dev-result.md`. `verification.md` is
  read-only to fix DEV; only the later fresh verification role may append a new
  exact-head section, and its historical non-green block remains verbatim.
- Executable acceptance at the remediation head:
  `git diff --check 1deec0fce29852556bb60e0b2fd8a1fb6075f2d4..HEAD`,
  `pnpm -C app exec tsc --noEmit`, and
  `pnpm -C app run verify:all` each exit 0. The narrow behavioral, CSS, payload
  parity/cmap, and DP-2 commands also exit 0. Fix DEV self-report is not release
  proof: one fresh non-implementing verification successor must rerun the
  plan-named commands, record real exit codes, and bind them to the exact
  remediation runtime/data head before fresh re-review.

### Size-gate disposition

The **16-file exception remains valid**. Every runtime/data edit above is
inside the existing 16-file baseline diff; the two pilot JSON files and two
WOFF2 files remain byte-identical to their locked hashes, and the new attack
checks stay under the already allowed cut-local QA directory. A required new
runtime helper, package, lockfile, font, payload, or any other seventeenth
runtime/data path is `SCOPE UNCLEAR` and stops before write for a new PM
disposition. Fix DEV may not convert the broad 16-file exception into
permission to touch all 16 files.

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

- `node --check server/writing-analysis/writingAnalysisBackfillService.mjs`
- `node scripts/verify-restart3-teacher-analysis.mjs`
- `node scripts/verify-lecture-panel-css.mjs`
- `pnpm -C app exec tsc --noEmit`
- `node docs/cuts/applied-writing-lecture-v3/qa/payload-parity/verify.mjs`
- `node docs/cuts/applied-writing-lecture-v3/qa/dp2-applied-writing-lecture-v3.mjs`
- `pnpm -C app run verify:all`
- `git diff --check 1deec0fce29852556bb60e0b2fd8a1fb6075f2d4..HEAD`

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
- [x] DP-2A owner personally inspects both views of both real packets injected
  into the real local `PaperBrowsePage` and explicitly says “过关”; this is the only
  remaining blocking PO decision. Machine `5/5` / `4/4` is precheck only.
  Owner passed the final prototype at exact head
  `4208c672373433b1b357228c55af1645f5ccbb7e` on 2026-07-23.
- [x] DP-3 DEV exact-head implementation complete at `9c2a240`; the released
  runtime/data tree is unchanged through `017164d`.
- [x] DP-3R fresh CR returned **NOT MERGEABLE** with six unresolved Must Fix;
  fresh PM remediation disposition preserves Variant A, whole-payload
  unavailability, DP-2, 794/793, executable font coverage, and every release
  gate inside the continuing 16-file exception.
- [ ] DP-3F fresh fix DEV produces one exact remediation head and releases one
  fresh non-implementing verification successor; DEV does not rewrite the
  original verification ledger.
- [ ] DP-4 fresh verification exact-head PASS. Evidence is complete but the
  release gate remains non-green; see `verification.md`.
- [ ] DP-5 fresh CR 0 unresolved Must Fix.
- [ ] DP-6 browser QA + owner PO QA pass.
- [ ] DP-7 fresh RM merge, main CI, STATUS/cut-note, AWL-V3-02 ready.

## PA follow-up decisions

Formal PA result is committed at
`e5d8dec9c76b35d581bc61e96b41681e3c7c7529`. A fresh PM plan-revision must
record one disposition for every item in `pa.md`'s
`Must Fix -> Plan Disposition Checklist`.

- [x] **MF-1 — packet + teaching gate:** exact production-shaped packets now
  exist under `pilot-content/`, teaching interpretation is `yes`, current outer
  payload fields are byte-for-byte preserved, PM grammar/register/
  relationship/purpose/vocabulary checks pass, and P2 forbids DEV-authored
  teaching copy. The real-packet Variant A renderer, runtime-only injection
  harness, and four injected-site screenshots exist under this cut; the real
  host measured `canvas 794 / answer offset 91` for both packets and machine
  precheck is 2022 `5/5 + 4/4`, 2024 `5/5 + 4/4`. Injection correctly refused
  the 628 px narrow canvas.
  Owner personally inspected the final real-site state and explicitly said
  “过关” on 2026-07-23 at exact prototype head
  `4208c672373433b1b357228c55af1645f5ccbb7e`.
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

Disposition closure is **5/5** and blocking PO decisions are **0**. The
selected prototype fixes the 794 × 472 replacement host and exact two-point
five-mark order; the owner passed the two-packet real-site prototype after the
final short directional-leader adjustment. The implementation route is now
authorized for exactly one fresh DEV and remains bounded to the exact 16-file
gate above.
