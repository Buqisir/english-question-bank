# applied-writing-lecture-v3 · Product and Payload Spec

Revision: `AWL-V3-SPEC-1` (2026-07-22)

## Stable source set

| Source | Revision | Role |
| --- | --- | --- |
| Owner-approved prototype | `f64038f:docs/cuts/applied-writing-lecture/prototype-annotate-v3.html` | visual / interaction contract |
| Whitespace placement spec | `f64038f:docs/specs/2026-07-21-annotation-whitespace-pockets-design.md` | geometry contract |
| Handwritten leader spec | `f64038f:docs/specs/2026-07-21-human-handwritten-leader-design.md` | leader rendering contract |
| Current decisions | this branch `decisions.md` | production data mapping and scope |
| Current production baseline | `github/main@1deec0f` | runtime truth |

The three `f64038f` files are available on
`github/codex/applied-writing-lecture-prototype-archive-20260722`. Historical
B2 implementation and removed post-handoff worktrees are not sources.

## Before / after

Before: application writing analysis is fetched only when lecture mode opens
and rendered as a full `WritingAnalysisPanel` in the right rail. The answer box
is inert. Current assets have only model answer + long highlight analysis.

After: clicking the application answer box or its lecture entry opens a
paper-local, two-view annotation stage over the original model answer. View 1
shows five review annotations; view 2 shows four short highlight annotations.
The right rail keeps the filled review card. Closing lecture mode removes all
annotation DOM and does not affect print/student output.

## Visible-unit traceability

| Visible unit | Approved size / shape | Production source | Allowed transformation |
| --- | --- | --- | --- |
| English essay | full letter, original reading order | `modelAnswer` | split into visual lines/paragraphs only; no rewriting |
| Review English anchor | literal source phrase | `reviewMarks[].text` | locate only; no normalization-only render path |
| Review handwritten title | one short teaching label | `reviewMarks[].grid` + `reviewCard` mapping in decisions D3 | deterministic formatting only |
| Review handwritten note | one short Chinese explanation | `reviewMarks[].note` | escape + typography only; no truncation |
| Highlight English anchor | literal source phrase | `highlightExpressions[].text` | locate only |
| Highlight handwritten title | short manual label | `.lectureAnnotation.label` | escape + Chinese/English typography only |
| Highlight handwritten note | short manual explanation | `.lectureAnnotation.note` | escape + typography only |
| Optional transfer line | one short example | `.lectureAnnotation.transferExample` | omit when absent; never invent |
| Leader / arrow | one light handwritten connector | DOM geometry + deterministic session seed | Variant A algorithm only |
| Review rail | filled four-section card | `reviewCard` | narrow two-column formatting only |

## Production-shaped parity gate

Before renderer work, two locked pilots (`paper-2022-i`, `paper-2024-i`) must
pass the real validator + persistence projection and then feed an equivalent
794 px annotation harness. Required result:

- review view `5/5`, highlight view `4/4`;
- every anchor resolves literally in a single rendered answer line;
- every note stays inside paper; note-note and note-text do not overlap;
- leaders exist, do not cross or traverse text; arrows point source -> note;
- same seed reproduces placement; reseed changes only placement/leader mix;
- persisted outer model answer, review card/marks, highlight text/long note, and
  array order do not drift.

If parity needs a taller paper, cards, drawers, click-to-expand, copy
truncation, heuristic string splitting, hard-coded positions, or more solver
complexity, stop with `SPEC CONTRADICTS`.

## Accessibility and responsive boundary

- Tabs/segmented control are keyboard reachable and expose the active two-view
  state; left/right keys never escape `0..1`.
- `重新寻位` has a real button label. Reduced-motion disables nonessential
  animated movement without changing final geometry.
- At the approved desktop QA viewport (1470 x 719) the exact prototype
  acceptance applies. At the product's supported narrower lecture layout,
  annotations must remain readable and inside paper; if 794 px cannot be
  preserved without redesign, PA/DEV must stop rather than invent a mobile
  variant.

## Explicit non-goals

- No continuation rendering.
- No regeneration of the remaining 22 application analyses in this cut.
- No missing-11 first production.
- No PaperSurface, export, print, PDF, DOCX, student-view, route, or production
  deployment changes.
- No generic annotation engine or geometry dependency.
