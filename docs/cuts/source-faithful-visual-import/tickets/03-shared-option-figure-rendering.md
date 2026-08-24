# 03 — Render one Figure Option set across Screen, Print, and PDF

Status: implemented
Blocked by: `02 — Compile confirmed Figure Options through the shared projection`

Spec: `docs/cuts/source-faithful-visual-import/spec.md`

## What to build

Render the generic projected Figure Option set through the shared PaperSurface
and Print/PDF seams. The question stem and A–D labels remain real renderer text;
only the meaning-bearing illustration occupies each image box. Screen, Student
Print, Teacher Print, and PDF must consume the same resolved media identities
and one versioned physical layout intent rather than interpreting candidate
pixels independently.

The new visual mode must remain isolated from ordinary text Options. Student
surfaces continue to hide answer identity, while Teacher surfaces keep their
existing answer and Analysis behavior without changing the chosen image bytes
or placement.

## Acceptance criteria

- [x] The frozen generic Figure Option fixture renders exactly four real A–D
      labels and four resolved images in Screen, Student Print HTML, Teacher
      Print HTML, and PDF from the same shared projection.
- [x] Option-to-media association, A–D order, media digests, and selected bytes
      are identical across all four surfaces; no surface performs manifest
      lookup, marker parsing, source fallback, model invocation, or semantic
      repair.
- [x] Figure Options use four equal tracks, consistent label placement, one
      candidate-independent image box, preserved aspect ratio, centered
      content, and no crop or stretch.
- [x] Physical layout intent is versioned once for the option set and does not
      map raw pixel dimensions directly to CSS pixels or PDF points.
- [x] Natural internal whitespace is preserved when source-backed; the
      renderer does not normalize away a meaning-bearing difference between
      Options.
- [x] The question stem, labels, and four figures form one atomic print unit.
      When the unit cannot fit in the remaining space, it moves together and is
      never split across pages.
- [x] Accessibility text identifies the Option neutrally without describing a
      likely answer or copying answer authority into student output.
- [x] Student output exposes no answer identity. Teacher output retains the
      existing answer/Analysis behavior while using the same Figure bytes and
      placement.
- [x] No surface contains `[Fig.]`, duplicates the question stem, or renders a
      detached whole-strip Figure for the generic fixture.
- [x] Existing literal-text Reading Options retain their current A–D layout,
      geometry, anchors, and rendered behavior.

## Verification

- Run focused shared rendered-behavior checks for Screen, Student/Teacher Print
  HTML, PDF, aspect ratio, equal tracks, accessibility, and atomic pagination.
- Smoke-check the exact generic fixture in a real browser and render its Print
  and PDF outputs for visual inspection.
- Run `pnpm -C app verify:paper`; report every `SKIP` literally.

## Out of scope

- Candidate generation, teacher selection, or import workflow changes beyond
  consuming Ticket 02's projection.
- Per-paper CSS or geometry tuned for Shenzhen Question 33.
- Public SVG, animation, interactive diagrams, captions, or mixed Option modes.
- Production publication, deployment, R2 mutation, or repository push.

## Result

Implemented on `codex/sfvi-ticket-03` in this one-line implementation commit.

- Added scoped manifest v47 with the versioned
  `reading-option-figure-layout-v1` renderer authority while leaving current
  v36 and Figure projection/admission v46 immutable. One translator admits
  only exact v46 Figure Option consumption and produces the shared 438.2pt
  comparison row, four equal 109.55pt tracks, real 10.5pt labels, invisible
  96×60pt `contain` boxes, neutral Option alts, responsive fit-down to 48pt
  tracks, and horizontal overflow only below that floor.
- The same translator now drives normalized consumption → PaperSurface and
  projected consumption → Student/Teacher Print HTML → PDF. Literal text
  Options remain on the existing A-D translator and renderer branches. Student
  output has no answer identity; Teacher output preserves its existing answer
  and Analysis rows while using the same four source data URLs and placement.
- Extended the generic fixture mechanically to landscape, portrait, square,
  and wider-landscape PNGs (160×80, 80×160, 120×120, 200×100). It contains no
  Shenzhen geometry, asset, or production migration.
- Focused verifier:
  `node scripts/verify-paper-canonical-reading-option-figure-rendered-behavior.mjs`
  — PASS. Real Playwright geometry proves desktop 438.2pt / four equal
  109.55pt tracks / four 96×60pt contain boxes, 640px fit-down without
  collapse, and 260px horizontal overflow only at the 48pt floor. Screen and
  Student/Teacher Print HTML retain the same four data URLs, media digests,
  Option order, visible A-D labels, and neutral `Option A`…`Option D` alts.
- Actual artifacts:
  `node scripts/verify-paper-canonical-reading-option-figure-rendered-behavior.mjs --actual-artifacts`
  — PASS. Evidence is under
  `.scratch/source-faithful-visual-import-ticket-03/1d12fc40b31734feb16bdf89034989d821f37d28/`.
  It includes desktop/fit-down/extreme Screen screenshots, Student/Teacher
  Print HTML and screenshots, forced-boundary HTML/PDF, `pdfinfo`,
  `pdftotext -bbox-layout`, `pdfimages -list`, and 120dpi page rasters. The
  forced A4 marker is on page 2; Question 32 stem plus A-D bank move together
  to page 3. PDF contains exactly four images in A-D order at the projected
  intrinsic dimensions. First-round visual QA passed; no second round was
  required.
- PDF evidence is deliberately bounded: Chromium may re-encode PDF image
  streams, so exact source PNG byte identity is asserted across Screen and
  Student/Teacher Print HTML data URLs, not across the PDF container. PDF
  evidence asserts four projected identities/dimensions, geometry, text order,
  A4 pagination, and rendered appearance.
- Compatibility checks — PASS: Ticket 02 Figure contract, existing text
  Reading and Passage Figure rendered behavior, `framed_columns` contract and
  rendered behavior, adapter/consumer/layout declaration parity (16/16),
  PaperSurface declaration parity (25/25), and app build. The Reading verifier
  logs its intentional missing-companion error during a fail-closed negative
  case and then reports PASS.
- Impeccable detector was run exactly once after the UI implementation. It
  exited 2 with this sole finding, verbatim:

  ```json
  [
    {
      "antipattern": "broken-image",
      "name": "Broken or placeholder image",
      "description": "<img> tags with empty src, missing src, or placeholder values ship as broken-image boxes. Use real images, generated assets, or remove the tag.",
      "severity": "warning",
      "category": "quality",
      "file": "/Users/huangxuewei/Projects/wt-sfvi-ticket-03-20260824/app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts",
      "line": 148,
      "snippet": "<img>"
    }
  ]
  ```

  The match was a documentation comment's literal `<img>`, not a rendered
  element. The comment now says `figure image`; the detector was not rerun.
- `pnpm -C app verify:paper` — overall FAIL with
  `PASS 78 / SKIP 0 / FAIL 1`. The sole failure is the unrelated local-data
  coverage failure in `scripts/verify-genre-truth.mjs`: 18 current database
  passages are absent from its decisions artifact (the output begins with
  `passage-mock-gd-2026-m1-cloze`,
  `passage-mock-gd-2026-m1-grammar-fill`, and Reading A-C). Ticket 03 changes
  no database or genre-truth artifact. The new focused verifier and every
  Canonical Paper/renderer check in the pack passed. Literal SKIP count:
  `SKIP 0`.
- App build — PASS, with the existing unresolved-at-build-time Hengshui font
  and large-chunk warnings. `git diff --check` — PASS.
- Remaining work is intentionally outside this ticket: Shenzhen Q33 candidate
  assets/canary belong to Ticket 04; candidate confirmation, production
  publication, deployment, R2 mutation, push, and merge were not performed.
