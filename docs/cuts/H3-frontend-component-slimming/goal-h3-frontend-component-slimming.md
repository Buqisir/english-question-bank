# H3 Goal — Frontend Component Slimming

Status: Goal in progress. H3-A and H3-B complete; H3-C panel locality implemented.
Date: 2026-05-24

## Objective

Slim the large frontend workbench / harness files by extracting deeper modules
with small interfaces, while preserving product behavior exactly.

H3 is one **Goal**. It does not have to be one PR.

## Why H3 Exists

H1 closed server route ownership. H2 closed workflow / verify / CI discipline.
H3 now targets frontend locality:

- `DraftPaperWorkbench.tsx` is about 700 lines and mixes data loading, A4
  preview HTML generation, export actions, outline controls, drag/drop,
  deletion / undo, and My Space save dialog state.
- `PaperIntelligencePaperSurfaceHarness.tsx` is about 1,400 lines and mixes
  data loading, viewport effects, focus state, scroll sync, right-panel
  analysis rendering, evidence selection, and rail / insight rendering.

The goal is not to make files smaller for vanity. The goal is to improve:

- **locality** — bugs in preview, outline, panel, or focus sync should live
  near the relevant module;
- **leverage** — callers should get meaningful behavior through a small
  interface;
- **AI navigability** — future PA / CR should review smaller owned surfaces.

## Current Baseline

Relevant files:

- `app/src/features/draft-paper/DraftPaperWorkbench.tsx`
- `app/src/features/draft-paper/DraftPaperWorkbench.css`
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
- `app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css`
- `app/src/features/paper-intelligence/paperSurfaceHostInteraction.ts`
- `docs/adr/0006-draft-paper-as-distinct-entity.md`
- `docs/adr/0003-paper-surface-interaction-model.md`

Relevant verify:

- `scripts/verify-c8-draft-paper-render-model.mjs`
- `scripts/verify-c8-draft-paper-contracts.mjs`
- `scripts/verify-paper-draft.mjs`
- `scripts/verify-paper-intelligence-paper-surface-harness.mjs`
- `scripts/verify-paper-surface-host-interaction.mjs`
- `scripts/verify-paper-intelligence-paper-surface-evidence.mjs`
- `npm run verify:all` from `app/`

## In Scope

- Extracting owned frontend modules from large `.tsx` files.
- Moving pure render helpers or local hooks into feature-local files.
- Preserving behavior, props, routes, API calls, CSS class names, and test
  expectations unless a specific PR says otherwise.
- Adding focused verify checks that prove the extraction did not change behavior
  or reintroduce stale local state.

## Out Of Scope

H3 must not do the following:

- product feature changes;
- visual redesign;
- PaperSurface renderer or `shared/papersurface/**` changes;
- server API behavior changes;
- database schema changes;
- print renderer behavior changes;
- Draft Paper domain semantics changes;
- PaperSurface interaction model redesign.

If implementation requires any of the above, stop and open a product cut, H4,
or H5 instead.

## Recommended PR Plan

### H3-A — Draft Paper Preview / Export Locality

Recommended first slice.

Why first:

- Draft Paper is the current active product line.
- The file is smaller and safer than the PaperSurface harness.
- Recent C8 QA made the desired A4 preview behavior clear.

Target:

- Move A4 preview HTML generation out of `DraftPaperWorkbench.tsx` into a
  feature-local module.
- Keep the public behavior identical: long-scroll A4 preview, no second mat
  color, PDF download, and browser print behavior remain unchanged.
- Optionally move export-action state into a small hook only if the interface is
  clearly smaller than the implementation.

Likely files:

- `app/src/features/draft-paper/DraftPaperWorkbench.tsx`
- `app/src/features/draft-paper/draftPaperPreviewHtml.ts`
- maybe `app/src/features/draft-paper/useDraftPaperExportActions.ts`
- `scripts/verify-c8-draft-paper-render-model.mjs`

### H3-B — Draft Paper Outline / My Space Dialog Locality

Target:

- Extract the right-side outline list / reorder / page-break controls into an
  owned component.
- Extract My Space save dialog state only if it becomes a real module with
  useful locality, not a pass-through.

Likely files:

- `app/src/features/draft-paper/DraftPaperWorkbench.tsx`
- `app/src/features/draft-paper/DraftPaperOutline.tsx`
- maybe `app/src/features/draft-paper/SaveToMySpaceDialog.tsx`
- existing Draft Paper CSS, unless a separate CSS file is clearly better.

### H3-C — PaperSurface Analysis Panel Locality

Target:

- Move `PaperAssetAnalysisPanel`, `AnalysisPanel`, `SupportEvidenceRow`, and
  `DistractorRow` out of
  `PaperIntelligencePaperSurfaceHarness.tsx` into feature-local panel files.
- Keep host-owned focus state in the harness / reducer.
- Do not touch `shared/papersurface/**`.

Likely files:

- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
- `app/src/features/paper-intelligence/PaperAssetAnalysisPanel.tsx`
- `app/src/features/paper-intelligence/LegacyAnalysisPanel.tsx`

Status: implemented in H3-C. The harness now imports feature-local
paper-asset and legacy analysis panel components while retaining host-owned
focus, evidence, line, loading, and PaperSurface props.

### H3-D — PaperSurface Data / Focus Hook Locality

Only after H3-C lands.

Target:

- Extract data fetching and focus / scroll sync hooks if the seams are deep
  enough.
- Avoid creating pass-through hooks that merely move lines around.

Likely files:

- `app/src/features/paper-intelligence/usePaperSurfaceData.ts`
- `app/src/features/paper-intelligence/usePaperSurfaceFocusSync.ts`
- harness verify scripts.

Status: optional. Current judgment after H3-C is to skip unless a future pass
finds a deeper hook seam than the current host orchestration boundary.

## Gates

For every H3 implementation PR:

- start from latest `main`;
- name the exact extraction target before editing;
- do not change product behavior;
- keep old CSS class names unless there is a specific visual-change PR;
- run `git diff --check`;
- run the narrow verify script for the touched surface;
- run `npm run verify:all` from `app/` if stable verify scripts or shared
  behavior changed;
- run browser QA only if the touched behavior is user-visible and static verify
  cannot prove it.

Big PA is not required for H3-A if it stays behavior-preserving. Use Big PA if:

- PaperSurface renderer / shared protocol becomes tempting;
- a slice starts changing product behavior;
- a PR exceeds the H2 size gate;
- the extraction interface is unclear after one PM pass.

## Completion Standard

H3 is complete when:

- Draft Paper workbench has clear owned modules for preview/export and outline
  concerns;
- PaperSurface harness no longer owns both data/focus orchestration and
  right-panel rendering in one file;
- no product behavior changed without an explicit product cut;
- H3 has a Cut Note and handoff that route remaining visual-token work to H4 and
  server implementation work to H5.

## Short Agent Prompt

Use this when starting H3:

```text
Read docs/cuts/H3-frontend-component-slimming/agent-entrypoint.md.
Start H3 from repo docs only. Treat H3 as one Goal, not necessarily one PR.
Begin with H3-A unless the entrypoint says another phase is active. Preserve
behavior exactly. Do not touch product features, server API behavior, database
schema, print renderer behavior, PaperSurface renderer, or shared/papersurface.
Run the narrow verify for the touched surface and git diff --check before
reporting.
```
