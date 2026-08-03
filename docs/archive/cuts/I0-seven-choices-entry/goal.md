# I0-E Goal — Seven Choices Analysis Entry

## Cut Size

Large.

Touches product boundary and analysis availability gate. Does not change
teaching interpretation, JSON contract, prompt contract, or Surface UI.

## Objective

Make 七选五 analysis reachable from the normal teacher workflow instead of only
from a direct demo URL.

Teacher searches / sees the 七选五题组 card -> clicks `七选五解析` -> lands on
PaperSurface for `group-2024-jslk-seven-choices` -> first blank is selected and
its analysis opens.

## Locked Product Decisions

- Entry label: `七选五解析`.
- Entry placement: only on the 七选五题组 card.
- Entry visibility: strict completeness gate. If analysis is incomplete, hide
  the entry; do not show a disabled state.
- Default target: first blank/question, currently `q-2024-jslk-036`.
- Default open behavior: the `questionId` in the PaperSurface URL is the open
  signal. Do not add `analysisOpen=1`.
- URL model: reuse PaperSurface URL:
  `view=paper-intelligence&source=paper-asset&paperId=...&surface=paper&groupId=...&questionId=...`.
- Single-question hit behavior: if the search/group result already has a
  `questionId`, target that question; otherwise target the first blank.
- Single-question entry also opens by carrying that `questionId`.
- Availability fields: reuse `hasPaperSurfaceAnalysis` and `paperSurfaceHref`.
- Label field: search/API must provide required `paperSurfaceLabel`; card renders
  the label it receives. If href exists but label is missing, verifier should fail.
- Reading A-D: minimally share the same gate idea, but do not change reading UI.

## Must Do

1. Add 七选五 analysis availability to the search/API layer.
2. Derive `paperSurfaceHref`, `hasPaperSurfaceAnalysis`, and
   required `paperSurfaceLabel` for eligible 七选五 group results.
3. The gate must require:
   - `paper-asset.json` exists and contains the group.
   - `analyses/seven-choices-analysis-v1.json` exists.
   - every blank/question in the group has an analysis object.
4. Keep `ConciergeGroupCard` / result card as a consumer only:
   - no JSON fetching in render;
   - no hardcoded 七选五 paper/group allowlist.
5. Preserve Reading A-D entries while adding 七选五.
6. Add static verification for:
   - 七选五 group returns a `七选五解析` href.
   - incomplete/missing 七选五 analysis hides the href.
   - Reading A-D availability still works.
   - no hardcoded fake gate.

## Forbidden

- Do not change 七选五 Surface UI.
- Do not change reading Surface UI.
- Do not change `seven-choices-analysis-v1` JSON contract.
- Do not change `prompts/seven-choices-analysis-v1.md`.
- Do not edit fixture analysis content except if a verifier fixture copy is
  created for incomplete-data testing.
- Do not modify `shared/papersurface/**`.
- Do not add a new route/view for 七选五; reuse PaperSurface.

## Suggested Files

- `server/api.mjs` or the current search route/module owner.
- `app/src/concierge/conciergeSearch.ts`
- `app/src/concierge/ConciergeGroupCard.tsx`
- `app/src/features/paper-intelligence/paperIntelligenceRoute.ts`
- `scripts/verify-i0e-seven-choices-entry*.mjs`
- this cut directory for PA/CR/cut-note files.

Adjust after code inspection; keep edits owner-file-aware.

## Verification

Required before commit:

- New I0-E static verifier.
- Existing relevant PaperSurface / search verifiers if present.
- `npm run build --prefix app`.
- `git diff --check`.

Browser QA:

- Search / group card shows `七选五解析` for the 九省卷七选五 group.
- Click entry -> PaperSurface opens 七选五 group, targets blank 36, analysis open.
- If a result has `questionId`, href targets that blank and opens analysis.
- Reading D entry still works.
- At least one of Reading A/B/C entries still works.
- Missing/incomplete analysis fixture path hides entry in static verifier.

## External Review

Run Claude PA-lite before DEV using `pa-prompt.md`.

## PA Follow-Up Decisions

Claude PA-lite returned `APPROVE WITH MUST FIX` with two open PO decisions.

- MF-1 / OPD-1 resolved as Option A: drop `analysisOpen=1`; `questionId`
  presence is the open-chain signal. No route/harness change is allowed for this.
- MF-2 / OPD-2 resolved as Option A: search/API provides required
  `paperSurfaceLabel`; the card consumes the label and does not infer it from
  `groupType`.

Last synced: 2026-05-26 after Claude PA-lite.
