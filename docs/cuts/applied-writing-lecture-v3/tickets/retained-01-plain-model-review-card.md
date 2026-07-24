# RETAINED-01 · Plain model answer and review card pilot

Status: ready

Spec:
`docs/cuts/applied-writing-lecture-v3/spec.md`

Implementation base:
the exact clean planning HEAD supplied in the task handoff. That HEAD must be a
descendant of
`github/main@773c3b77e5fca12b9407a25d63448f237ce692f7` and must not contain any
historical v3 annotation implementation.

## Goal

Deliver one complete vertical slice for the two retained application-writing
pilots:

- the active lecture-mode answer box shows the complete plain model answer;
- the right rail shows only the complete review card; and
- every old annotation and highlight-display path stays absent.

Do not implement any other ticket or broaden the pilot.

## Required implementation

1. Add the spec's optional `ReviewCard` application payload shape to the
   frontend domain type, JSON schema, validator, and application persistence
   projection.
2. Preserve existing `highlightExpressions` exactly during validation and
   persistence. Do not display them and do not add new highlight semantics.
3. Copy only `reviewCard` into the two current-main pilot assets:
   `paper-2022-i` and `paper-2024-i`. The exact card source is
   `708a5ae18a781679d4ebfe8228a84738252f2c24` at the matching asset paths.
   Do not copy `reviewMarks`, `lectureAnnotation`, font, or geometry data from
   that historical v3 commit.
4. Add one shared frontend availability guard matching the spec's pilot IDs and
   complete-card contract. Backend and frontend malformed-present behavior must
   agree.
5. In lecture mode, replace only the active valid pilot's ordinary application
   answer-box content with the complete plain `modelAnswer`.
6. Render only the four-section review card in the matching right rail. Do not
   route valid pilot applications through the application branch of
   `WritingAnalysisPanel`.
7. For loading, legacy, missing, or malformed card data, preserve the ordinary
   answer box and show `解析加载中…` or `解析未发布` as specified. Never mount
   partial retained content.
8. Restore ordinary answer-box content when lecture closes or panel ownership
   moves to another group. Preserve continuation and every non-writing group.
9. Use a dedicated, collision-free CSS class family for the retained answer
   and card. Before changing or deleting any shared writing CSS, inventory all
   producers of the affected class names.
10. Keep the existing right-side `讲评` handle and make each pilot application
    answer box a whole-box lecture trigger. Do not render a visible button
    inside the box. Reuse existing page state; continuation and non-pilot
    answer boxes remain inert. Ordinary scrolling, directory navigation, and
    `focusGroupId` may position the paper but must not open lecture mode;
    `lecture=1` remains an explicit lecture entry point.

## Allowed writes

- `app/public/paper-assets/paper-2022-i/latest/analyses/writing-analysis-v1.json`
- `app/public/paper-assets/paper-2024-i/latest/analyses/writing-analysis-v1.json`
- `app/src/domain/paperAsset.ts`
- `app/src/features/paper-browse/PaperBrowsePage.tsx`
- `app/src/features/paper-browse/paperBrowsePage.css`
- one optional retained-lecture component under
  `app/src/features/paper-browse/`
- `app/src/features/paper-intelligence/WritingPaperPage.tsx`
- `app/src/features/paper-intelligence/writingPaperPage.css`
- `schemas/paper-import/writing-analysis-v1.schema.json`
- `server/writing-analysis/writingAnalysisBackfillService.mjs`
- the narrowest relevant existing verifier files, or one focused QA verifier
  under `docs/cuts/applied-writing-lecture-v3/qa/`
- this ticket, for a short result section

No other runtime, data, font, package, lockfile, PaperSurface, route, print,
PDF, DOCX, export, continuation, production-configuration, or historical v3
file is authorized.

## TDD seams

Write executable red fixtures before implementation and prove the current-main
behavior fails at public or component seams:

### Payload and persistence

- a complete two-point `reviewCard` validates and round-trips exactly;
- missing, partial, `null`, wrong-type, wrong-point-count, trim-dirty,
  multiline, markup, Markdown, and over-limit card values reject;
- the same write preserves every existing `highlightExpressions` object and
  order exactly;
- continuation output gains no `reviewCard` and does not otherwise drift.

### Frontend behavior

- each pilot's valid active lecture state renders the complete plain answer on
  the left and all review-card fields on the right;
- neither pilot renders highlight-expression text or note content in the
  retained lecture;
- legacy/missing/malformed card data keeps the ordinary answer box and renders
  `解析未发布`;
- closing lecture and switching to continuation/another group unmount retained
  content and restore the existing content;
- activating either pilot application answer box opens the matching lecture
  rail, while continuation and non-pilot answer boxes do not gain a trigger;
- ordinary arrival, directory navigation, and a `focusGroupId` deep link do
  not open lecture mode, while `lecture=1` still does; and
- no forbidden annotation, leader, tab, seed, geometry, or custom-font DOM is
  present.

Do not satisfy these contracts with source-regex assertions when a behavioral
seam is available.

## Acceptance criteria

- [ ] Only the two named pilot application groups publish retained lecture
      content.
- [ ] Left side is the complete plain `modelAnswer`; right side is only the
      complete four-section `reviewCard`.
- [ ] No highlight expression is visible, while stored highlight payloads are
      unchanged.
- [ ] Missing/malformed data fails closed, and lecture close/group switch
      restores the ordinary answer box.
- [ ] The right-side `讲评` handle remains, and either pilot application answer
      box opens its matching lecture rail without an inner button.
- [ ] Continuation, student, PaperSurface, print, PDF, DOCX, and export behavior
      is unchanged.

## Required checks

Run the narrowest relevant checks first, then:

```text
node scripts/verify-restart3-teacher-analysis.mjs
pnpm -C app exec tsc --noEmit
pnpm -C app run verify:all
git diff --check
```

Preserve every original exit code. A red full gate remains red and cannot be
reported as release-ready.

## Real-browser and export-isolation QA

Use `qa-local-owner` and keep the checklist to these five checks:

1. Open `paper-2022-i` with lecture closed, click inside the application answer
   box, and verify its matching lecture opens with the full plain answer on the
   left and the complete card—and nothing else—on the right.
2. Repeat for `paper-2024-i`; confirm no highlight, underline, arrow, tab,
   reseed, handwritten note, clipping, or horizontal overflow.
3. Open one non-pilot application and one malformed-card fixture: verify the
   ordinary answer box plus `解析未发布`, with no partial card.
4. Close lecture, switch between application and continuation, and exercise the
   narrow lecture drawer: verify restoration, existing `Esc`, scroll ownership,
   and readable layout.
5. Smoke student plus teacher print/PDF/DOCX/export paths: verify no model
   answer-box replacement or review-card behavior is newly introduced there;
   compare against the fixed-point baseline and verify existing output remains
   unchanged.

## Completion and review

Use `/implement`. It owns TDD, the relevant checks, ordinary Standards + Spec
`/code-review`, all in-scope fixes, and one clean implementation commit.

Because this ticket changes payload semantics and verifies print/export
isolation, its successful implementation commit is not merge authorization.
Return a fresh top-level `/code-review` prompt with:

- this spec and ticket;
- the implementation task's input fixed point;
- the exact implementation HEAD; and
- instructions to review the complete fixed-point diff without repairing it.

## Implementation result

PASS. Both pilot groups publish the complete plain model answer and four-section
review card through one fail-closed availability guard. Legacy, missing, and
malformed data retain the ordinary answer box; continuation and export paths
remain unchanged. Red/green fixtures, TypeScript, focused writing/paper-browse,
restart3, export-isolation checks, and real-browser wide/narrow interaction QA
passed. A fresh fixed-point `/code-review` remains required before owner QA.

UI follow-up PASS. The rejected four-equal-box stack is now one compact white
analysis card with distinct facts, numbered points, reader prompts, and value
emphasis, using the reading panel's neutral border and restrained ink-green accent.
Both pilots passed 1440×900 and 390×844 browser checks with no horizontal
overflow; lecture close and continuation switching restore ordinary content.

Owner interaction amendment PASS. The retained card now uses an all-white
surface, and each pilot application answer box opens its matching lecture rail
as a whole-box target while the existing `讲评` handle remains. The focused
verifier passed 34/34; `verify:all` passed 84 with one documented off-repo
fixture skip. Real-browser checks covered both pilots at 1470×719 and 390×844
without horizontal overflow, plus lecture close and group-switch restoration.

Arrival follow-up PASS. Ordinary scrolling, directory navigation, and a
`focusGroupId` deep link leave lecture closed; only `lecture=1`, the whole-box
pilot entry, and the `讲评` handle open it. The focused verifier passed 35/35;
both pilots passed 1470×719 and 390×844 browser checks without horizontal
overflow.
