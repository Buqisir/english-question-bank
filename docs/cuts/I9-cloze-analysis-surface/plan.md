# I9 Plan — 完形填空解析 render 面 + 入口 gate

## Cut Size

Medium-Large.

Touches a user-visible render surface and the analysis-availability entry gate
(product boundary). Does NOT change any schema, the I8 `cloze-analysis-v1`
contract/prompt/analyze module, or the shared PaperSurface core. Full gates: PA
before DEV, CR before merge, browser QA (this cut has real visual output).

## Objective

Render the `cloze-analysis-v1` analysis (shipped in I8) inside PaperSurface as a
teacher-facing 讲评, **focus-per-blank**, reusing the existing right analysis pad
+ clue-highlight machinery; and expose a completeness-gated `完形解析` entry on
the cloze group card (mirroring `七选五解析`).

I9 consumes the stable I8 JSON; it adds no new analysis fields and changes no
generation code.

## Locked Decisions (from grill + I8 decisions.md)

- **Focus-per-blank** (reuse the interactive surface, not a continuous list).
- **Reuse** the harness right-pad dispatch + `data-paper-evidence-id` /
  `data-pi-evidence-id` highlight + cross-column evidence line. Build on the I3
  `clozePaperViewAdapter` (plain view) — upgrade it to load analysis.
- **Cloze analysis card** (right pad, per focused blank):
  - header: blank number + `pos` tag + optional signature label
  - correct option + `correctFit.reason` (why it fits)
  - distractor gloss list (each non-answer option: label + text + meaning)
  - evidence rows (clickable → highlight `signalText` in passage)
  - `teachingNote`
  - group `overview` + `affectiveArc` at the top (pad header or left rail)
- **Evidence highlight is uniform color (Fork 1).** Map all 5 evidence types to
  a single highlight kind; the evidence TYPE shows as a text label in the row
  only. Do NOT extend the `support/trap/context` kind taxonomy and do NOT change
  `shared/papersurface/**`. Colored type-differentiation is deferred polish.
- **One cut (Fork 2):** render + entry gate together.
- **Entry**: `完形解析` label, completeness-gated (all 15 blanks have analysis),
  mirroring the seven-choices availability config. Hide entry when incomplete
  (no disabled state).
- No review UI (I8 already writes `reviewStatus: reviewed`).

## Must Do

### Step 1 — Cloze analysis surface adapter

- Upgrade `app/src/features/paper-intelligence/clozePaperViewAdapter.ts` (or add
  `clozeAnalysisSurfaceAdapter.ts` alongside it, mirroring
  `sevenChoicesSurfaceAdapter.ts` / `paperAssetSurfaceAdapter.ts`) to accept the
  `cloze-analysis-v1` analysis and build a surface model:
  - per-blank view keyed by questionId: `pos`, optional signature label,
    `correctFit` (optionLabel + reason), `distractorGlosses[]`, `evidence[]`,
    `teachingNote`.
  - group view: `overview`, `affectiveArc`.
  - map each passage-side evidence (`signalSide` context-before/after/stem) to a
    `data-paper-evidence-id` range located by exact `signalText` substring (reuse
    `segmentPaperText` / the same locate-range approach the other adapters use).
    All evidence uses a single uniform kind (e.g. `context` or `support`).
  - **Option-side evidence** (phrase blanks): highlight within the rendered
    option text in the card, NOT the passage (the passage has no such span).
    Decide one consistent treatment; document it.
- Define the analysis TS type (`ReviewedClozeAnalysisV1`) from the I8 contract.

Verification standard:

- Node/unit: adapter maps a fixture `cloze-analysis-v1` into the model with all
  15 blanks, correct evidence ranges located, group overview present, and blank
  markers (`__41__`) never inside an evidence range.

### Step 2 — Cloze analysis panel (right pad)

- New `app/src/features/paper-intelligence/ClozeAnalysisPanel.tsx` rendering the
  card above. Evidence rows are `<button data-pi-evidence-id=... data-pi-question-id=...>`
  with a single highlight kind; selection drives the existing focus/highlight.
- Distractor glosses render as a compact label+text+meaning list (not evidence
  buttons).

Verification standard:

- The panel renders correctFit, every distractor gloss, every evidence row, the
  pos/signature header, and teachingNote; evidence buttons carry the required
  `data-pi-*` anchors.

### Step 3 — Harness wiring (fetch + dispatch + focus)

- In `PaperIntelligencePaperSurfaceHarness.tsx`: for a cloze group, fetch
  `/paper-assets/<paperId>/latest/analyses/cloze-analysis-v1.json`. If present +
  valid, build the analysis model and dispatch `ClozeAnalysisPanel`; if absent,
  fall back to the existing I3 plain cloze view (do not break it).
- Focus-per-blank: the URL `questionId` opens that blank's card; clicking a blank
  opens it. Reuse the existing evidence highlight + cross-column line + auto-scroll
  (derive `activeEvidenceKind` for the uniform kind).

Verification standard:

- Harness static/unit checks: cloze group with analysis dispatches the cloze
  analysis panel; cloze group without analysis still renders the plain view;
  questionId focus opens the matching blank.

### Step 4 — Availability entry gate

- Add a `cloze-analysis-v1` entry to the `analysisConfigs` array in
  `server/search/paperSurfaceAvailability.mjs`: schemaVersion `cloze-analysis-v1`,
  fileName `cloze-analysis-v1.json`, label `完形解析`, completeness rule = every
  cloze group questionId has an entry under the analysis `blanks` map.
- `buildPaperSurfaceHref` already produces the right URL (source=paper-asset,
  groupId, questionId=firstQuestionId). The card (`ConciergeGroupCard.tsx`)
  consumes the existing `hasPaperSurfaceAnalysis` / `paperSurfaceHref` /
  `paperSurfaceLabel` fields — no card change beyond what already renders.

Verification standard:

- A complete cloze analysis yields a `完形解析` href targeting blank 41; an
  incomplete/missing one hides the entry. Reading / 七选五 availability unchanged.

### Step 5 — Verifier + CI

- Add `scripts/verify-i9-cloze-analysis-surface.mjs` covering Steps 1–4 (adapter
  mapping incl. evidence-range location + blank-marker exclusion; panel required
  parts; harness dispatch/fallback; availability gate complete vs incomplete).
- Register it in `scripts/verify-ci.mjs`. Update `scripts/README.md`.

Verification standard:

- `node scripts/verify-i9-cloze-analysis-surface.mjs` green; in `verify-ci`.

### Step 6 — Browser QA (real paper)

- Generate a cloze analysis for one real paper (I8 flow), publish, then open the
  `完形解析` entry → PaperSurface:
  - blank 41 focused, card shows pos/signature, correctFit, distractor glosses,
    evidence, teachingNote; group overview/affectiveArc visible.
  - clicking an evidence row highlights its `signalText` in the passage (cross-
    column line draws); switching blanks updates the card + highlights.
  - a phrase blank's option-side evidence renders per the chosen treatment.
- Do not commit generated `app/public/paper-assets/**`.

## Forbidden

- Do not change `shared/papersurface/**` core (tokens, anchorKeys, types,
  segmentPaperText, the PaperSurface module). Cloze chrome lives in a scoped
  adapter + panel.
- Do not extend the `support/trap/context` evidence-kind taxonomy (uniform
  highlight in I9).
- Do not change the I8 `cloze-analysis-v1` contract, `prompts/cloze-analysis-v1.md`,
  `analyzeCloze.mjs`, or any generation/publish code.
- Do not change `schemas/**` or any paper-asset shape.
- Do not redesign the reading / seven-choices panels or break the I3 plain cloze
  view fallback.
- Do not commit generated `app/public/paper-assets/**`.

## Suggested Files

- `app/src/features/paper-intelligence/clozePaperViewAdapter.ts` (or new `clozeAnalysisSurfaceAdapter.ts`)
- `app/src/features/paper-intelligence/ClozeAnalysisPanel.tsx` (new)
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
- `server/search/paperSurfaceAvailability.mjs`
- `scripts/verify-i9-cloze-analysis-surface.mjs` (new) + `scripts/verify-ci.mjs` + `scripts/README.md`

Adjust after code inspection; keep edits owner-file-aware.

## Verification

- Targeted: `node scripts/verify-i9-cloze-analysis-surface.mjs`,
  `node scripts/verify-i8-cloze-analysis.mjs`,
  `node scripts/verify-paper-intelligence-paper-surface-harness.mjs` (and other
  paper-surface verifiers the diff touches), `git diff --check`.
- Full gate: `node scripts/verify-ci.mjs`; `npm run build --prefix app`.
- Browser QA: Step 6.

## Browser QA Matrix

| Case | Expected |
| --- | --- |
| Cloze group with complete analysis | `完形解析` entry shows; opens PaperSurface, blank 41 card with correctFit + glosses + evidence + teachingNote; group overview visible |
| Click an evidence row | passage highlights the `signalText`; cross-column line draws |
| Switch focused blank | card + highlights update to the new blank |
| Phrase blank option-side evidence | renders per chosen treatment (option-internal) |
| Cloze group WITHOUT analysis | plain cloze paper view still renders (I3 fallback intact); no `完形解析` entry |
| Reading / 七选五 groups | entries + panels unchanged |

## DEV Readiness

- This plan committed before PA; PA before DEV.
- `pa-reviewer` writes `docs/cuts/I9-cloze-analysis-surface/pa.md`. Fold Must Fix
  into this plan (PA Follow-Up table) before DEV.

## PA Follow-Up Decisions

| PA item | `pa.md` disposition | `plan.md` handling | Status |
| --- | --- | --- | --- |
| _(to be filled after PA)_ | | | |
