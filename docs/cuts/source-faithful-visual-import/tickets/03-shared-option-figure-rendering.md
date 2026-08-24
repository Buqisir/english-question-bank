# 03 — Render one Figure Option set across Screen, Print, and PDF

Status: ready-for-agent
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

- [ ] The frozen generic Figure Option fixture renders exactly four real A–D
      labels and four resolved images in Screen, Student Print HTML, Teacher
      Print HTML, and PDF from the same shared projection.
- [ ] Option-to-media association, A–D order, media digests, and selected bytes
      are identical across all four surfaces; no surface performs manifest
      lookup, marker parsing, source fallback, model invocation, or semantic
      repair.
- [ ] Figure Options use four equal tracks, consistent label placement, one
      candidate-independent image box, preserved aspect ratio, centered
      content, and no crop or stretch.
- [ ] Physical layout intent is versioned once for the option set and does not
      map raw pixel dimensions directly to CSS pixels or PDF points.
- [ ] Natural internal whitespace is preserved when source-backed; the
      renderer does not normalize away a meaning-bearing difference between
      Options.
- [ ] The question stem, labels, and four figures form one atomic print unit.
      When the unit cannot fit in the remaining space, it moves together and is
      never split across pages.
- [ ] Accessibility text identifies the Option neutrally without describing a
      likely answer or copying answer authority into student output.
- [ ] Student output exposes no answer identity. Teacher output retains the
      existing answer/Analysis behavior while using the same Figure bytes and
      placement.
- [ ] No surface contains `[Fig.]`, duplicates the question stem, or renders a
      detached whole-strip Figure for the generic fixture.
- [ ] Existing literal-text Reading Options retain their current A–D layout,
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

Not started. Record the implementation commit, focused checks, rendered generic
evidence, compatibility result, and remaining limitations here.
