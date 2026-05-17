# Paper Surface Spike — Follow-up Gates

This file records the gates from [Issue #30][issue-30] that block any
B-level PaperSurface work on top of the PR #29 visual spike. It is not a
plan; it is the running checklist of "what must be resolved before
treating the spike as production direction".

[issue-30]: https://github.com/Buqisir/english-question-bank/issues/30

## Status of the spike

- Mounted at `?view=paper-intelligence&paperId=...&surface=paper`.
- Default PI route (no `surface=` param, or any unknown value) is
  unchanged.
- The retired `surface=print` value collapses to `'default'`. There is
  no compat branch.

## Gate 1 — `print` → `paper` rename: DONE in this cut

- Route param: `surface=paper` is the only active value.
- Route type: `PaperIntelligenceSurface = 'default' | 'paper'`.
- Folder: `app/src/features/paper-intelligence/paperSurfacePrototype/`.
- Component: `PaperSurfacePrototype`.
- CSS file: `paperSurfacePrototype.css`.
- CSS prefixes: `pi-paper-*`, `--pi-paper-*`, `data-pi-paper-*`.
- Verify script: `scripts/verify-paper-surface-prototype.mjs` (replaces
  the old `verify-paper-intelligence-print-surface-spike.mjs`).

The "print" namespace is now reserved for the real PDF/HTML export
pipeline (`server/print-renderer.mjs`).

## Gate 2 — CSS relationship with `server/print-renderer.mjs`: NOT decided

`paperSurfacePrototype.css` is **prototype-only visual reference**. It
is **not** shared with `server/print-renderer.mjs`. The print renderer
keeps its own emit logic and its own CSS path, unchanged.

Before any production PaperSurface module promotes this CSS, the team
must pick one of:

1. Extract shared paper-surface tokens / styles between the React
   surface and `server/print-renderer.mjs`, and replace the prototype
   CSS with consumers of the shared module.
2. Discard the prototype CSS and rebuild B-level styles from
   renderer-aligned styles instead.

This cut intentionally does not pick. The same warning is duplicated
at the top of `paperSurfacePrototype.css` so a future contributor sees
it without having to find this file.

## Gate 3 — Plant no-op evidence anchors: DONE in this cut

The prototype DOM emits real evidence anchors for every support quote
that resolves verbatim against `passageBody`:

- Visible anchor: a NEUTRAL `<mark class="pi-paper-evidence-anchor">`
  wrapping the verbatim quote in the passage body. It carries
  `data-pi-evidence-id`, `data-pi-evidence-kind`, `data-pi-question-id`.
  No highlight class, no hover, no connection to `activeEvidenceId`.
  The CSS resets the user-agent `<mark>` background to keep it visually
  invisible.
- Hidden placeholder anchor: for questions whose support quote does NOT
  resolve verbatim against `passageBody`, the prototype emits a
  zero-size `<span class="pi-paper-evidence-placeholder">` next to the
  question stem. It carries the same data attributes plus
  `data-pi-evidence-placeholder="true"`.

Important caveats for downstream wiring:

- Only the visible `<mark>` anchors are geometry-valid. Future evidence
  line / painter dry-runs must skip placeholders.
- Trap (distractor) anchors are NOT painted by this prototype. Only
  support quotes are surfaced.
- The pure evidence adapter (`features/paper-intelligence/evidence`) is
  the single source of truth for evidence ids. The prototype calls
  `toEvidenceModel(...)` at view-build time and does not duplicate id
  construction.

## Non-blocker recorded from review

`computeQuestionNumbers` is not a blocker for A1 — existing PI surfaces
already trust fixture `questionNo`. Future PaperSurface design notes
should reaffirm this so the question stops resurfacing.

## What this cut intentionally does NOT do

- No formal `PaperSurface` Module.
- No new production entry point.
- No reach into draft basket, Paper Set, or export.
- No changes to server, DB, or API.
- No changes to `server/print-renderer.mjs` emit logic.
- No new dependencies, no `package.json` / lockfile edits.
- No live build / lint / Playwright run on the cloud sandbox (no
  `node_modules`, registry blocked).
