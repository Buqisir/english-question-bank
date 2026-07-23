# applied-writing-lecture-v3 · Formal PA

## Verdict

**APPROVE WITH MUST FIX**

Reviewed branch input:
`github/codex/applied-writing-lecture-v3-20260722-01@a824c2cd13c5ee6c7e0e4d493cbd1636b0322117`.
Current production baseline:
`github/main@1deec0fce29852556bb60e0b2fd8a1fb6075f2d4`.
The branch merge-base is that exact `github/main`; no main drift exists.

Immutable evidence reviewed at archive commit `f64038f`:

- `docs/cuts/applied-writing-lecture/prototype-annotate-v3.html`
- `docs/specs/2026-07-21-annotation-whitespace-pockets-design.md`
- `docs/specs/2026-07-21-human-handwritten-leader-design.md`

The current `paper-2022-i` and `paper-2024-i` application payloads were read
from `github/main`. Neither contains `reviewCard`, `reviewMarks`, or
`lectureAnnotation`. The current 2024 model answer is also a different letter
from the model answer used by the approved prototype. The production direction
is sound, but DEV is not authorized to invent the missing teaching payload,
review-mark cardinality, active-group state, or lecture-stage host geometry.

## Product Principle

The teacher task is correctly scoped: while explaining an application-writing
model answer, point review judgments and transferable expressions back to the
original sentences without turning the paper into an AI dashboard.

The paper and the essay remain primary. Backend authoring and publishing own
teaching content; the website consumes only complete, human-confirmed content.
No partial payload, runtime summarization, truncation, or geometry workaround
may redefine the owner-approved prototype.

## Exact UX / Architecture Model

The following model is stable:

1. Outside lecture mode, the application-writing page remains the current exam
   paper with its original blank answer box. Student/print/PDF/DOCX paths never
   receive annotation data or DOM.
2. A complete application payload is authored and persisted by the backend
   pipeline. One frontend availability predicate rejects the whole lecture
   payload unless every review and highlight invariant is satisfied.
3. The active application lecture shows the stored `modelAnswer` as the
   primary reading flow, with exactly two keyboard-reachable views:
   `审题要点` 5/5 and `亮点句式` 4/4.
4. Variant A placement, two-dimensional pockets, fair allocation, literal
   anchors, mixed plain-leader/arrow behavior, source-to-note arrow direction,
   font-ready remeasurement, deterministic seed, and reseed are the visual
   contract. B/C and the rejected B2 runtime are not implementation inputs.
5. The application rail shows the stored four-section review card and a quiet
   pointer. Continuation keeps its current payload, panel, and paper behavior.

The plan does **not** yet lock two required parts of that model:

- stage ownership must include the active writing group, not merely
  `lectureOpen && application && available`; otherwise scrolling the rail to a
  continuation or another group can leave an unrelated application stage
  mounted;
- current application answer-box geometry is approximately 794 × 246 px,
  while the approved annotation stage is 794 × 472 px with a 612 × 458 px
  inner frame. The plan does not say whether lecture mode replaces and enlarges
  the on-screen box, overlays another host, or preserves the 246 px box.

DEV must not choose either behavior implicitly.

## Must Fix Before DEV

### MF-1 — Lock production-shaped pilot content before runtime DEV

The two real pilot payloads lack every new v3 field. The 2024 production letter
is not the prototype letter, so its approved sample notes cannot simply be
copied. P2 currently delegates creation of review judgments, handwritten
notes, labels, and transfer examples to DEV even though these are teaching
interpretation and geometry-shaping content.

Before DEV, add a tracked production-shaped content packet for both pilots
containing the exact proposed `reviewCard`, five `reviewMarks`, and four
`lectureAnnotation` objects, with every anchor resolved against the current
model answer. Record owner confirmation of the teaching content and verify any
student-usable English label/example for grammar, register, relationship,
purpose, and Gaokao vocabulary suitability. DEV may then pass that locked
packet through the real validator/persistence path; DEV may not author or
rewrite it.

The plan header must change
`touches teaching interpretation: no` to `yes`.

### MF-2 — Define the review-mark multiset and point-index contract

`ReviewMark.grid` offers `type | tense | points | cares | wants`,
`reviewCard.points` allows 1–5 items, and publication requires exactly five
marks. The current contract does not say:

- which non-point grids are required or may be omitted;
- whether non-point grids may repeat;
- how many `points` marks are legal for each `points.length`;
- how a `points` mark maps to `points[index]` when marks are interleaved;
- whether every review-card point must appear on paper.

This is not safely derivable from "occurrence order": with two points, the
prototype shows `type + cares + point + tense + point` and omits `wants`; other
point counts produce different unresolved multisets.

Lock one general rule, rejection cases, and label derivation for all 1–5 point
counts. If the product only supports a narrower point-count class, narrow the
schema and decisions now instead of publishing a wider false contract.

### MF-3 — Make literal-anchor and availability symmetry executable

The current backend validator accepts normalized-only
`highlightExpressions[].text`. The stage can render only literal anchors.
`decisions.md` explicitly makes review anchors literal, but it does not
explicitly apply the same publish rule to the four annotated highlight
expressions.

Lock that every rendered review anchor **and each of the exactly four annotated
highlight anchors** is a non-empty literal substring of one logical
`modelAnswer` line, with no normalization-only fallback. The backend validator,
persistence projection, frontend availability predicate, parity harness, and
browser-unavailable behavior must use the same rule.

Add executable proof for malformed-but-present payloads, not only the legacy
all-fields-missing case: normalized-only anchor, partial nested object,
wrong counts, invalid grid/point mapping, whitespace/markup/newline/length
failure, and continuation leakage must all become wholly unavailable.

### MF-4 — Lock active-group transitions and the 246 px / 472 px host boundary

The production page has a global `lectureOpen`, a scroll/selection-driven
`panelGroupId`, one application group, and one continuation group. The current
mount condition omits active-group ownership. The plan also asks DEV to port
472 px geometry into a 246 px answer-box surface without recording the
approved on-screen transformation.

Before DEV, lock:

- the exact answer-box action that opens lecture and makes this application
  group active;
- the stage mount predicate, including active group identity;
- teardown when Esc closes lecture or the active panel moves to continuation /
  another group;
- unavailable/loading behavior without a partial stage;
- the wide-screen stage host and exact geometry;
- the supported narrow viewport/minimum width and whether it preserves the
  794 px stage, scrolls, or stops as unsupported;
- that lecture-only geometry cannot alter the exam-format 246 px answer box in
  student/print/export output.

Add the cross-group transition and narrow-layout cases to browser QA.

### MF-5 — Close the single-PR size gate explicitly

The allowed list contains 11 named runtime/data files. The font glob promises
two font files, separate OFL records, and a source/version record, bringing the
planned application/server/schema/script surface above the 15-runtime-file
target when those required assets are counted.

The plan must either:

- split the work into ordered mergeable PRs with explicit baselines and
  verification ownership; or
- record the size-gate exception, exact file count, rollback boundary, and why
  one PR is safer.

Do not let DEV discover this after implementation. Any file needed beyond the
final counted list requires PM disposition before write.

## Must Fix -> Plan Disposition Checklist

- [ ] **MF-1 -> Locked product decision + P2 precondition + PO gate:** add the
  two exact production-shaped pilot content packets, record owner teaching
  confirmation, make teaching interpretation `yes`, and forbid DEV-authored
  teaching copy.
- [ ] **MF-2 -> Locked data-contract decision + P1 validation table:** define
  the legal five-mark grid multiset, duplicates, point indexing/cardinality,
  label derivation, and rejection matrix for every supported point count.
- [ ] **MF-3 -> Must Do + Verification + Browser QA:** apply literal-anchor and
  whole-payload availability rules symmetrically to review and annotated
  highlight anchors; prove malformed-present payload rejection in backend,
  frontend, parity, and browser paths.
- [ ] **MF-4 -> Locked UX/state decision + P3 Must Do + Browser QA:** define
  trigger, active-group predicate, teardown, unavailable/loading state,
  246/472 host geometry, supported narrow boundary, and cross-group tests.
- [ ] **MF-5 -> Plan header / implementation slicing:** record ordered PRs or a
  counted size-gate exception with rollback and verification boundaries.

## Should Watch

- **Font metrics and provenance:** Xiaolai SC and Shantell Sans determine note
  measurement. Pin exact upstream version/file/weight, preserve each OFL, and
  record sources. This does not block once MF-4 fixes the geometry contract
  because font-ready measurement plus browser geometry QA observes the risk.
- **Solver complexity:** copy the approved hard constraints and fairness order,
  but keep scoring internals private and bounded. This is an implementation/CR
  watch because the stop rule already forbids using more solver complexity to
  hide payload mismatch.
- **Other writing host:** `WritingPaperPage` also serves question detail.
  Application lecture props must be optional and supplied only by
  `PaperBrowsePage`; question detail must remain unchanged. This is
  straightforward isolation, so it does not require product redesign.
- **Continuation panel debt:** the cut must not absorb styling or feature work
  for continuation merely because the shared writing types change. Existing
  continuation behavior remains a regression target, not a v3 surface.

## Allowed Files

Subject to MF-5's final counted disposition, the current runtime families are
appropriate:

- schema/types:
  `schemas/paper-import/writing-analysis-v1.schema.json`,
  `app/src/domain/paperAsset.ts`;
- backend validation/persistence and its existing CI behavioral verifier:
  `server/writing-analysis/writingAnalysisBackfillService.mjs`,
  `scripts/verify-restart3-teacher-analysis.mjs`;
- exactly two pilot analysis assets;
- paper-browse host, the two dedicated application-review components,
  `WritingPaperPage.tsx`, and `writingPaperPage.css`;
- exact self-hosted font/license/source assets;
- this cut's tracked evidence and QA files.

The PM revision may narrow this list. It may not silently add runtime files.

## Forbidden Files

- `app/src/shared/papersurface/**`, PaperSurface types/intents,
  `writingPageModel.mjs`, or new `PaperBlock` kinds;
- print/PDF/DOCX/export renderers or styles and student-mode behavior;
- routes, server APIs, auth, production config/deploy, DB/schema migration;
- continuation assets, continuation semantics, or continuation-specific CSS;
- the remaining application analyses or missing-11 production;
- packages, lockfiles, CDN fonts, generic annotation engines, hard-coded
  payload copy/coordinates, heuristic truncation/splitting;
- any rejected B2 runtime, old handoff, old CR, removed-worktree history, or
  post-`f64038f` archive history as implementation input.

## Static Verify Requirements

After the Must Fix dispositions, verification must prove:

1. real application candidate validation and persistence preserve the exact
   locked pilot fields, outer model answer, long highlight text/note, and array
   order;
2. the five-mark multiset/index rule and all review-card fields;
3. exactly four complete short annotations out of 3–5 highlights;
4. literal logical-line anchors for all nine rendered anchors, with
   normalized-only matches rejected;
5. trim, plain-text, single-line, code-point, partial-object, markup, newline,
   and count rejection families;
6. continuation projection cannot persist the nested lecture object and
   continuation output is byte/semantic equivalent apart from intentional
   serializer formatting;
7. the real frontend availability predicate rejects malformed-present and
   legacy-incomplete payloads before stage mount;
8. both locked payloads pass the 794 × 472 parity harness at 5/5 and 4/4 with
   no overlap/crossing/text traversal and deterministic seed behavior;
9. `node --check`, the named behavioral verifier, TypeScript, existing lecture
   CSS gate, `verify:all`, archived DP-2, and `git diff --check` all pass with
   real exit codes at the exact DEV head.

## Browser QA Matrix

1. At 1470 × 719 and 100% zoom, `paper-2024-i` opens from the application
   answer box into the active-group lecture stage; review is 5/5 and highlight
   is 4/4, with approved fonts, direction, bounds, leaders, and no long-analysis
   dump.
2. Repeat both views at 90% zoom and reseed twice: same seed is stable; reseed
   changes only valid placement/leader mix; keyboard tabs stay within 0..1 and
   reduced motion preserves final geometry.
3. Run the same contracts on materially different `paper-2022-i`; no 2024
   copy, anchor, or coordinate is hard-coded.
4. While its stage is open, scroll/select continuation and another group:
   application annotation DOM is removed, rail/paper agree on the active
   group, continuation remains unchanged, and returning does not restore stale
   seed/state from the wrong group.
5. A legacy application and a malformed-present fixture both show
   `解析未发布` in paper and rail with zero partial annotation DOM.
6. At the PM-locked narrow boundary, prove the specified 794 px behavior
   without overlap or an invented mobile variant.
7. Esc/close restores the original paper flow. Student/teacher
   print/PDF/DOCX smoke contains no annotation text, font, or DOM leakage.

## DEV Readiness

**Not ready.**

DEV may start only after one fresh PM plan-revision task records all five
dispositions in `plan.md`, updates the linked decisions/spec where necessary,
closes the three PO decisions below, and leaves:

- zero unresolved Must Fix;
- zero blocking PO decisions;
- one exact counted implementation route;
- one exact released head for the fresh DEV.

A new PA round is not required if the PM revision makes only the dispositions
listed here without changing the teacher task, selected prototype, or product
boundary. Any rescope, new field family, different stage host, or inability to
fit the locked production-shaped payload requires fresh PA.

## Open PO Decisions

1. Approve the exact two-pilot teaching-content packets, including the
   review-card judgments, five review notes, four short highlight annotations,
   and any student-usable transfer examples.
2. Choose the lecture-only host contract: recommended is to replace/enlarge the
   on-screen application answer-box region to the approved 794 × 472 stage
   while leaving the 246 px exam answer box untouched outside lecture and in
   every export. If on-screen paper height also may not change, the current
   prototype geometry does not fit and the cut must be rescoped.
3. Approve the general five-mark selection rule across varying point counts;
   do not let each paper or DEV choose ad hoc which of `cares` / `wants` /
   `points` appears.
