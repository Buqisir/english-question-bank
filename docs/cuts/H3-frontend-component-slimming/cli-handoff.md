# H3 CLI Handoff — Frontend Component Slimming

Date: 2026-05-23
Prepared for: CLI agent
Current repo head: `0b5b199`

Status: historical. H3 is now closed; use `cut-note.md` and `handoff.md` for
current truth.

## Current State

H3 was the active housekeeping cut for frontend component slimming.

Already merged:

- PR #112 — H3 goal / agent entrypoint / handoff docs.
- PR #113 — H3-A Draft Paper Preview / Export Locality.
- PR #114 — H3 CLI handoff.
- PR #118 — H3-B Draft Paper Outline Locality.
- PR #119 — H3-C PaperSurface Analysis Panel Locality.

H3-A extracted `buildA4PreviewHtml(printHtml)` from:

```text
app/src/features/draft-paper/DraftPaperWorkbench.tsx
```

into:

```text
app/src/features/draft-paper/draftPaperPreviewHtml.ts
```

No product behavior changed.

## Required Reading

Start here:

```text
docs/cuts/H3-frontend-component-slimming/agent-entrypoint.md
docs/cuts/H3-frontend-component-slimming/goal-h3-frontend-component-slimming.md
docs/cuts/H3-frontend-component-slimming/handoff.md
docs/cuts/H3-frontend-component-slimming/dev-notes-h3-a.md
docs/cuts/H3-frontend-component-slimming/cr-lite-h3-a.md
```

Then read:

```text
docs/adr/0006-draft-paper-as-distinct-entity.md
scripts/README.md
```

## Next Recommended Work

Historical instruction. Do not start H3-B from this file.

H3-B and H3-C have landed. H3-B-2 and H3-D were skipped because their seams were
not deep enough.

Original next work was:

```text
Draft Paper Outline / My Space Dialog Locality
```

Recommended first target inside H3-B:

```text
Extract the right-side Draft Paper outline / reorder / page-break controls from
DraftPaperWorkbench.tsx into a feature-local component.
```

Suggested new module:

```text
app/src/features/draft-paper/DraftPaperOutline.tsx
```

Keep the first H3-B slice focused on the outline only:

- item list;
- source metadata display;
- page-break marker;
- page-break toggle / cancel button;
- up / down buttons;
- drag handle and drag/drop callbacks;
- delete button;
- active / dragged row class behavior.

Do not include My Space dialog extraction in the same first H3-B slice unless
the outline extraction is already tiny and the interface remains clearly
smaller than the implementation.

## Important Constraints

Preserve behavior exactly.

Do not change:

- product semantics;
- route behavior;
- server API behavior;
- database schema;
- print renderer behavior;
- PDF output behavior;
- PaperSurface renderer;
- `shared/papersurface/**`;
- paper assets or analysis JSON.

Keep existing CSS class names unless the slice explicitly updates CSS verify.

## Verification For H3-B

Minimum commands:

```bash
node scripts/verify-c8-draft-paper-render-model.mjs
npm run build --prefix app
git diff --check
```

If the outline extraction changes any stable verify script or shared behavior,
also run:

```bash
npm run verify:all --prefix app
```

Browser QA is recommended for H3-B because the right outline is interactive.
Minimum manual/browser checks:

- draft page opens;
- right outline still renders all selected groups;
- up/down reorder still works;
- drag reorder still works if available in the browser;
- page-break toggle / cancel still works;
- delete and undo still work;
- A4 preview still reflects order and page breaks.

## Expected Output Files

Write implementation notes into:

```text
docs/cuts/H3-frontend-component-slimming/dev-notes-h3-b.md
docs/cuts/H3-frontend-component-slimming/cr-lite-h3-b.md
```

Update:

```text
docs/cuts/H3-frontend-component-slimming/handoff.md
```

## Short CLI Prompt

Historical prompt. Do not use after H3 closeout.

```text
Read docs/cuts/H3-frontend-component-slimming/cli-handoff.md.
Start H3-B by extracting the Draft Paper right-side outline/reorder/page-break
UI from DraftPaperWorkbench.tsx into a feature-local component. Preserve
behavior exactly. Do not touch server API, DB, print renderer, PDF behavior,
PaperSurface renderer, shared/papersurface, or data. Run
node scripts/verify-c8-draft-paper-render-model.mjs, npm run build --prefix app,
and git diff --check. Write dev-notes-h3-b.md and cr-lite-h3-b.md before
reporting.
```
