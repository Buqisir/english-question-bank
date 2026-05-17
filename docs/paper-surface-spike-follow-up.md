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

## Gate 2 — CSS relationship with `server/print-renderer.mjs`: RESOLVED FOR B1 (A-thin)

**Decision (Issue #21-B1):** The team picked the **A-thin** CSS
strategy.

What that means in this cut:

- B1 introduces `shared/papersurface/tokens.mjs` (paired with a
  `tokens.d.ts` for type consumers). The module exports PRIMITIVE
  values only — font stack, ink / muted / rule colors, passage and
  question line heights, paragraph indent, and the four-options grid
  descriptors.
- The React prototype (`PaperSurfacePrototype.tsx`) imports those
  primitives and injects them as CSS custom properties on the surface
  root. `paperSurfacePrototype.css` consumes them via
  `var(--pi-paper-...)` instead of hardcoding the same values.
- `paperSurfacePrototype.css` is still **prototype-only visual
  reference**. It is **not** shared with `server/print-renderer.mjs`.
  No CSS text, HTML, JSX, or markup crosses the boundary.
- `server/print-renderer.mjs` is **intentionally unchanged in B1**.
  It still emits its own inlined CSS with its own — slightly different
  — font stack. The current divergence is captured in the design-note
  export `paperSurfaceServerCurrent` inside the shared tokens module
  so a future contributor can see, in one place, what the server is
  doing today.

What this resolution does **not** claim:

- It does **not** claim the CSS is now fully shared, identical, or
  aligned between the React surface and the server. Only the value
  layer is shared, and only on the React side. The CSS texts remain
  independent.
- It does **not** retire the prototype CSS as production-ready. The
  CSS file is still prototype-only and still carries the
  prototype-only banner.

### B2 follow-up (still owed)

- Decide whether `server/print-renderer.mjs` should adopt
  `paperSurfaceTokens` directly, or keep its own slightly-different
  stack with the divergence explicitly re-justified.
- If the server adopts shared tokens, rerun the print visual QA
  (the existing Vivliostyle / `print-visual-qa-guangdong` pipeline)
  to confirm no regression in PDF output.
- Update `paperSurfaceServerCurrent` (or remove it) once B2 lands so
  the design note no longer drifts from reality.

The A-thin choice was a deliberate trade. Sharing CSS text or markup
in B1 would have required touching `server/print-renderer.mjs`,
running visual QA, and risking a print regression — none of which fit
inside a CSS-strategy spike. Sharing only PRIMITIVE values keeps the
spike small, reversible, and verifiable on the cloud sandbox without
running a build, a Vite dev server, or a Vivliostyle render.

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
