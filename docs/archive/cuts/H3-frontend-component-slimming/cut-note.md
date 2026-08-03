# H3 Cut Note — Frontend Component Slimming

Cut: H3 Frontend Component Slimming
Start date: 2026-05-23
Merge date: 2026-05-24
PA rounds: 0
Big CR rounds: 0
Must Fix count: 0
Token / cost notes: Codex-only goal; no external PA / Big CR cost.

## Shipped

- PR #112: H3 goal / agent entrypoint / initial handoff.
- PR #113: H3-A extracted Draft Paper A4 preview HTML generation from
  `DraftPaperWorkbench.tsx` into `draftPaperPreviewHtml.ts`.
- PR #114: H3 CLI handoff for continuing the goal from a fresh agent.
- PR #118: H3-B extracted Draft Paper right-side outline / reorder /
  page-break / delete UI into `DraftPaperOutline.tsx`.
- PR #119: H3-C extracted PaperSurface route analysis panels into
  `PaperAssetAnalysisPanel.tsx` and `LegacyAnalysisPanel.tsx`.
- H3 closeout:
  - this Cut Note;
  - closed `handoff.md`;
  - closed `agent-entrypoint.md`;
  - closed `goal-h3-frontend-component-slimming.md`;
  - marked the older CLI handoff as historical.

## Cut Or Moved

- H3-B-2 My Space dialog extraction was skipped. The dialog is still coupled to
  workbench-owned export/save state, so extracting it now would be pass-through
  component churn.
- H3-D hook extraction was skipped. After H3-C, the remaining
  `PaperIntelligencePaperSurfaceHarness.tsx` responsibilities are host
  orchestration: data loading, focus state, scroll synchronization, rail state,
  PaperSurface props, and evidence-line ownership.
- CI workflow installation, server implementation migration, global run-form
  verify expansion, product behavior changes, visual redesign, server APIs, DB
  schema, print renderer, PaperSurface renderer, and `shared/papersurface/**`
  were all intentionally excluded from H3.

## Wrong Assumptions Found

- Smaller file size is not enough justification. The My Space dialog and
  PaperSurface hooks both looked tempting, but neither had a smaller interface
  than the state they would move.
- Browser QA was still needed for extraction-only work when callbacks moved.
  H3-B and H3-C both had type-safe extractions that still required interaction
  checks.
- The PaperSurface harness can be improved without touching PaperSurface. H3-C
  moved right-panel rendering while preserving the PaperSurface renderer and
  neutral `shared/papersurface/**` boundary.

## Rules That Prevented Rework

- One Goal did not mean one PR. H3 stayed as a single objective while landing
  small PRs.
- Preserve behavior exactly. Existing CSS classes, callbacks, data attributes,
  route behavior, and PaperSurface contracts were kept stable.
- Keep side effects in the owner unless extraction creates a deeper module.
  Draft persistence and PaperSurface focus / line state stayed in their owner
  components.
- Skip optional slices when the seam is shallow. H3-B-2 and H3-D were not
  forced for process completeness.

## Verify And QA

- Static verify:
  - H3-A: `node scripts/verify-c8-draft-paper-render-model.mjs` — passed.
  - H3-A: `npm run build` from `app/` — passed.
  - H3-A: `git diff --check` — clean.
  - H3-B: `node scripts/verify-c8-draft-paper-render-model.mjs` — passed.
  - H3-B: `npm run build --prefix app` — passed.
  - H3-B: `npm run verify:all --prefix app` — passed.
  - H3-B: `git diff --check` — clean.
  - H3-C: `node scripts/verify-paper-intelligence-paper-surface-harness.mjs`
    — passed, 86 passed / 0 failed.
  - H3-C: `npm run build --prefix app` — passed.
  - H3-C: `npm run verify:all --prefix app` — passed.
  - H3-C: `git diff --check` — clean.
  - H3 closeout: `node scripts/verify-architecture-housekeeping.mjs` —
    passed, 78 passed / 0 failed.
  - H3 closeout: `npm run verify:all --prefix app` — passed.
  - H3 closeout: `git diff --check` — clean.
- Browser QA:
  - H3-A: not required; pure preview helper extraction protected by
    render-model verify.
  - H3-B: passed for draft outline render, up/down reorder, drag reorder,
    page-break toggle / cancel, delete / undo, and A4 preview synchronization.
  - H3-C: passed for paper-asset wrong-option accordion, trap evidence
    selection / left quote highlight, and legacy report Q21 analysis rendering.
- PO QA:
  - Not separately required; no product behavior or visual redesign shipped.

## Watch / Follow-Up

- Watch ledger: not needed. H3 produced no new PaperSurface Should Watch item.
- Follow-up gates:
  - Do not reopen H3 just to move more lines out of the harness.
  - If future PaperSurface data/focus hook extraction is proposed, require a
    named contract and a smaller interface than the implementation it moves.
  - Keep Claude-feedback work outside H3. Candidate next items are CI workflow
    installation, H1 server implementation migration, and targeted run-form
    verify expansion.

## Handoff

- Next-cut handoff: `docs/cuts/H3-frontend-component-slimming/handoff.md`

## Next Cut

- H4 — Design Tokens / UI Consistency, when the next need is color, spacing,
  typography, or shared UI token adoption.
- H5 — Server Implementation Extraction, when the next need is moving route
  bodies out of `server/api.mjs` into the H1 route modules.
- Claude feedback follow-up — if the owner wants process / infrastructure work
  next, start with GitHub Actions workflow installation or a focused run-form
  verify expansion. Do not mix that into H3.

Do not add H3-E.
