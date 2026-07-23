# applied-writing-lecture-v3 · Product and Payload Spec

Revision: `AWL-V3-SPEC-2` (2026-07-22 formal-PA disposition)

## Stable source set

| Source | Revision | Role |
| --- | --- | --- |
| Owner-approved prototype | `f64038f:docs/cuts/applied-writing-lecture/prototype-annotate-v3.html` | visual / interaction contract |
| Whitespace placement spec | `f64038f:docs/specs/2026-07-21-annotation-whitespace-pockets-design.md` | geometry contract |
| Handwritten leader spec | `f64038f:docs/specs/2026-07-21-human-handwritten-leader-design.md` | leader rendering contract |
| Current decisions | this branch `decisions.md` | production data mapping and scope |
| Current production baseline | `github/main@1deec0fce29852556bb60e0b2fd8a1fb6075f2d4` | runtime and two-pilot payload truth |
| Locked pilot candidates | `pilot-content/paper-2022-i.application.json`, `pilot-content/paper-2024-i.application.json` | exact proposed teaching content |
| Real-packet owner-review prototype | real local `PaperBrowsePage` + `qa/prototype-review/inject-live-site.playwright.mjs` + `prototype-pilot-review.html?embedded=1` | runtime-only injection of Variant A into the actual canvas/rail; owner visual verdict pending |

The three `f64038f` files are available on
`github/codex/applied-writing-lecture-prototype-archive-20260722`. Historical
B2 implementation and removed post-handoff worktrees are not sources.

## Before / after

Before: application writing analysis is fetched only when lecture mode opens
and rendered as a full `WritingAnalysisPanel` in the right rail. The answer box
is inert. Current assets have only model answer + long highlight analysis.

After: at supported desktop width, clicking an application answer box opens
lecture mode, makes that exact group active, and—only after a complete valid
payload is available—replaces its on-screen 246 px answer-box region with the
fixed paper-local 794 × 472 stage. View 1 shows five review annotations; view 2
shows four short highlight annotations. The right rail keeps the filled review
card. Closing lecture or moving the active panel to another group removes all
annotation DOM, clears view/seed state, and restores the 246 px answer box.
Loading, unavailable, narrow-unsupported, print, export, and student paths never
mount the stage.

## Visible-unit traceability

| Visible unit | Approved size / shape | Production source | Allowed transformation |
| --- | --- | --- | --- |
| English essay | full letter, original reading order, existing Times New Roman paper face | `modelAnswer` | split into logical lines/paragraphs only; no rewriting and no Shantell override |
| Review English anchor | literal source phrase | `reviewMarks[].text` | locate only; no normalization-only render path |
| Review handwritten title | one short teaching label | `reviewMarks[].grid` + `reviewCard` mapping in decisions D3 | deterministic formatting only |
| Review handwritten note | one short Chinese explanation | `reviewMarks[].note` | escape + typography only; no truncation |
| Highlight English anchor | literal source phrase in one logical answer line | `highlightExpressions[].text` | locate only; no normalization-only render path |
| Highlight handwritten title | short manual label | `.lectureAnnotation.label` | escape + Chinese/English typography only |
| Highlight handwritten note | short manual explanation | `.lectureAnnotation.note` | escape + typography only |
| Optional transfer line | one short example in Shantell Sans | `.lectureAnnotation.transferExample` | omit when absent; never invent |
| Leader / arrow | one light handwritten connector | DOM geometry + deterministic session seed | Variant A algorithm only |
| Review rail | filled four-section card | `reviewCard` | narrow two-column formatting only |

## Production-shaped parity gate

Before renderer work, two locked pilots (`paper-2022-i`, `paper-2024-i`) must
receive the owner's personal visual “过关” while Variant A is temporarily
injected into their real local `PaperBrowsePage`, pass the real validator +
persistence projection, and then feed an equivalent 794 × 472 annotation
harness. The embedded prototype supplies only the stage; canvas/rail/scroll are
the real site. DEV reads the exact candidates under
`pilot-content/`; it does not author copy. Machine `5/5` / `4/4` is a precheck,
not owner approval. Required result:

- review view `5/5`, highlight view `4/4`;
- every anchor resolves literally in a single rendered answer line;
- every note stays inside paper; note-note and note-text do not overlap;
- leaders exist, do not cross or traverse text; arrows point source -> note;
- same seed reproduces placement; reseed changes only placement/leader mix;
- on review view, the fifth fixed-grid mark (`points[1]` / `要点②`) prefers a
  collision-free lower-left pocket inside the answer frame when one exists,
  while its literal English anchor remains in the essay's original reading
  order; otherwise the global solver remains authoritative;
- persisted outer model answer, review card/marks, highlight text/long note, and
  array order do not drift.
- when a base-width note has no side-lane candidate, a narrower note may enter
  if it unlocks a left/right lane; connector safety still rejects text hits.

If parity needs a taller paper, cards, drawers, click-to-expand, copy
truncation, heuristic string splitting, hard-coded positions, or more solver
complexity, stop with `SPEC CONTRADICTS`.

## Publish / availability symmetry

One backend/frontend contract governs the complete application lecture:

- `reviewCard.points` is exactly two items;
- `reviewMarks.grid` is exactly
  `[type, cares, points, tense, points]`, with point occurrences mapping to
  indices 0 and 1;
- all five review anchors and all four annotated highlight anchors are
  non-empty literal substrings wholly contained in one logical model-answer
  line;
- exactly four of 3–5 highlight expressions carry complete, length-valid,
  trim-clean, single-line, plain-text `lectureAnnotation` objects;
- persistence preserves the complete application object and outer
  model-answer/highlight fields; continuation projection cannot retain any
  v3 nested field.

Backend validation, persistence projection, frontend availability, parity
harness, and browser behavior must reject the whole stage for every row below:

| Malformed-present family | Required result |
| --- | --- |
| normalized-only review or highlight anchor | unavailable; zero stage DOM |
| partial `reviewCard`, `reviewMarks`, or `lectureAnnotation` object | unavailable; zero stage DOM |
| wrong point count, mark count, highlight annotation count, grid order, duplicate non-point grid, or point mapping | unavailable; zero stage DOM |
| leading/trailing whitespace, markup, Markdown, newline, empty or over-limit short value | unavailable; zero stage DOM |
| application v3 nested object entering continuation projection | rejected before persist; unchanged continuation output |
| legacy payload with every v3 field absent | unavailable; original answer box and `解析未发布` |

## Active group, accessibility, and responsive boundary

- The answer-box action sets `activeWritingLectureGroupId = groupId` and opens
  lecture. The stage predicate is exactly
  `lectureOpen && activeWritingLectureGroupId === groupId && application &&
  available && panelGroupId === groupId`.
- Payload loading keeps the ordinary answer box and may show `解析加载中…`;
  unavailable/malformed keeps it and shows `解析未发布`. No partial stage exists.
- Esc, lecture close, another group selection, or scrollspy ownership moving to
  continuation/another group clears the active writing id, both view/seed
  states, and annotation DOM before the new rail body is shown.

- Tabs/segmented control are keyboard reachable and expose the active two-view
  state; left/right keys never escape `0..1`.
- `重新寻位` has a real button label. Reduced-motion disables nonessential
  animated movement without changing final geometry.
- At 1470 × 719 the exact prototype acceptance applies. The fixed host is
  794 × 472 with a 612 × 458 inner frame; the 91 px paper gutters remain
  available to the solver.
- The responsive boundary is the real paper canvas, not a guessed viewport
  number. After the existing lecture shell reflows, mount v3 only when
  `.paper-browse-content` measures its full 794 CSS px; its nested writing
  content and answer box then measure 612 px. If the live canvas is below
  794 px, do not mount the stage and preserve that canvas's current responsive
  246 px answer box. Local reproduction evidence: 1470 × 719 yielded
  `794 / 612 / 380` for canvas / answer / rail; 1200 × 719 yielded
  `628 / 446 / 380`, still side-by-side with no overlap. Do not scale,
  horizontally overflow, or invent a separate mobile annotation variant.

## Explicit non-goals

- No continuation rendering.
- No regeneration of the remaining 22 application analyses in this cut.
- No missing-11 first production.
- No PaperSurface, export, print, PDF, DOCX, student-view, route, or production
  deployment changes.
- No generic annotation engine or geometry dependency.
- No one-, three-, four-, or five-point review-card publishing class in this
  cut.
