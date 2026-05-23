# H3-C Dev Notes — PaperSurface Analysis Panel Locality

Date: 2026-05-24
Status: implemented

## Scope

H3-C extracts the PaperSurface route's right-side analysis panel rendering out
of `PaperIntelligencePaperSurfaceHarness.tsx`.

This slice covers only feature-local panel components. It does not change
PaperSurface rendering, shared PaperSurface code, server APIs, persisted data,
or visual design.

## Changed

- Added `app/src/features/paper-intelligence/PaperAssetAnalysisPanel.tsx`.
- Added `app/src/features/paper-intelligence/LegacyAnalysisPanel.tsx`.
- Moved reviewed paper-asset option accordion rendering into
  `PaperAssetAnalysisPanel`.
- Moved legacy support evidence and distractor row rendering into
  `LegacyAnalysisPanel`.
- Kept host-owned focus state, reducer dispatch, evidence selection,
  scroll-to-evidence effects, data loading, PaperSurface props, and evidence
  line ownership in `PaperIntelligencePaperSurfaceHarness.tsx`.
- Updated `scripts/verify-paper-intelligence-paper-surface-harness.mjs` so it
  verifies:
  - the extracted panel files exist;
  - the harness imports and renders them;
  - the harness no longer owns right-panel rendering internals;
  - the paper-asset panel still owns reviewed option accordion behavior;
  - the legacy panel still owns support / distractor row rendering;
  - text-only legacy distractors remain non-button rows.

## Behavior

No product behavior changed.

The following remain unchanged:

- paper-asset analysis empty / unpublished states;
- reviewed answer option accordion;
- wrong-option trap details;
- support / trap evidence selection;
- cross-column evidence line ownership;
- legacy analysis answer / evidence / distractor display;
- existing CSS class names and right-panel layout;
- PaperSurface renderer and `shared/papersurface/**`.

## Verification

- `node scripts/verify-paper-intelligence-paper-surface-harness.mjs`
- `npm run build --prefix app`
- `npm run verify:all --prefix app`
- `git diff --check`

## Browser QA

Ran local dev server with `scripts/dev.sh`.

Paper-asset route:

```text
http://127.0.0.1:5173/?view=paper-intelligence&paperId=paper-2024-jslk-english&surface=paper&source=paper-asset&groupId=group-2024-jslk-reading-a&questionId=q-2024-jslk-021
```

Checked:

- page loaded with active Q21 and right panel rendered answer C;
- selecting wrong option B expanded `干扰解析`;
- selecting a trap evidence row moved the active highlight to the matching
  source quote on the PaperSurface side;
- no crash or UI regression during option / evidence changes.

Legacy report route:

```text
http://127.0.0.1:5173/?view=paper-intelligence&paperId=paper-2024-xkb1-reading&surface=paper
```

Checked:

- route loaded with the empty right panel prompt;
- selecting Q21 rendered legacy answer / options / support evidence /
  distractor analysis;
- support evidence highlighted the expected source quote on the PaperSurface
  side.

The paper-asset route still logs existing fallback 404s for attempted
`/paper-assets/<paperId>/latest/...` URLs before loading the legacy fixture
path. The page renders correctly after fallback; H3-C did not change that
fetch behavior.

## Not Done

H3-D hook extraction was not included in this implementation slice. After the
panel extraction, the remaining harness responsibilities are host orchestration
concerns: loading, focus, rail, scroll synchronization, and PaperSurface props.
Extracting them now would need a separate seam decision rather than a line-count
move.
