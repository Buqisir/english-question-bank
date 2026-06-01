# I14 Plan — 语法填空解析 render 面 + 入口 gate

cut size: **medium**; touches schema / data contract / product boundary /
teaching interpretation: **product boundary + teaching interpretation = yes**
(renders PO 的静态考点框架 IP on a teacher surface); schema / contract / 生成 =
**no** (consume-only). Full gates: 小川 PA before DEV, CR-lite before merge,
**browser QA (real visual output)**, PO QA, RM.

## Objective

Render the `grammar-fill-analysis-v1` per-blank analysis (shipped I13 slice 1)
inside PaperSurface as a teacher-facing 讲评, **focus-per-blank**, reusing the
existing right analysis pad + clue-highlight machinery; and expose a
completeness-gated `语法解析` entry on the grammar-fill group card. Mirror
target = **I9 完形解析** (`clozeAnalysisSurfaceAdapter.ts` + `ClozeAnalysisPanel.tsx`
+ the harness `groupType === 'cloze'` branch).

I14 consumes the stable I13 JSON; it adds no new analysis fields and changes no
generation / contract / schema code.

## What is already in place (verified, don't re-derive)

- Grammar-fill **plain view** adapter + harness branch already exist (I4/I10):
  `grammarFillPaperViewAdapter.ts` (`buildGrammarFillPaperView`), harness
  `group.groupType === 'grammarFill'` branch at
  `PaperIntelligencePaperSurfaceHarness.tsx:374-387` (currently plain-only).
- The availability **`entryMapKey`** mechanism is already general (I9 MF-1):
  `server/search/paperSurfaceAvailability.mjs` has reading/sevenChoices(`questions`)
  + cloze(`blanks`) configs and checks `analysis?.[entryMapKey]?.[questionId]`.
  This slice **adds one config entry**, no mechanism change.
- I13 generation registry `server/paper-import-ai/grammar-fill-facets-v1.json`
  holds only `{facet_key, blank_type}` (validation membership). Render needs the
  framework bodies — see GATE-2.
- Analyze-module enums (the render must accept these verbatim):
  - `role` ∈ subject / predicative / object / attributive / adverbial /
    object-complement / subject-complement (non-finite only).
  - `path` ∈ fast / slow (non-finite only).
  - evidence `type` ∈ subject / time-marker / antecedent / modified-word /
    governing-word / collocation / comparison / parallel / connector /
    clause-frame / of-phrase / determiner.
  - `blankType` ∈ given / no-hint; `signalSide` ∈ passage / stem
    (**grammar-fill has NO option side** — simpler than cloze: no in-card `<mark>`).

## Locked Decisions (owner 黄学伟, 2026-05-31)

- **GATE-1 → 渲染端空白容差匹配 (whitespace-tolerant match at render).**
  The new grammar-fill adapter locates `signalText` against the **stored**
  passage with a match that treats any run of whitespace as equivalent, and
  returns correct `{sentenceId, start, end}` offsets into the stored sentence
  text. Rationale: stored passage gets an extra `normalizeGrammarFillText` pass
  at publish (`packageBuilder.mjs:165`) whose **net divergence from parse-time
  bytes in trigger-word regions is whitespace** (double-spacing around blank
  numbers + 3+space collapse; the space-after-punctuation rule already runs at
  parse time too). Consume-only: does NOT touch generation/contract. Makes the
  highlight actually resolve instead of silently failing (the I11 plain-`indexOf`
  no-fallback failure mode). **A verifier fixture whose passage actually changes
  under `normalizeGrammarFillText` is mandatory** (e.g. a blank marker `  56  `
  adjacent to a trigger word, and a 3+space run that collapses).
- **GATE-2 → 完整静态框架 + AI 代入 reason.** Per focused blank the right pad
  shows the考点's **full static framework** (the PO IP: 一找二判三 / 框架123
  快路·慢路 / 三类特指 …) resolved from `facetKey`, plus the AI's **代入** (`reason`),
  evidence, role/path (non-finite), teachingNote. The framework is **static, NOT
  AI-emitted** (anti-hallucination, locked I13). Decision: ship a **client-side
  facet framework registry** transcribed faithfully from the KB
  (`docs/cuts/I13-grammar-fill-analysis/grammar-fill-facets-v1.md`) — see Step 0.

## Locked render decisions (PM)

- **Focus-per-blank** (reuse the interactive surface, like I9).
- **Evidence highlight uniform kind = `support`** (same constraint as I9: the
  cross-column `PaperIntelligenceEvidenceLine` prop `activeEvidenceKind` only
  accepts `'support' | 'trap' | null`). The evidence `type` shows as a text
  label in the row only. Do NOT extend the evidence-kind taxonomy; do NOT touch
  `shared/papersurface/**`.
- **Multi-occurrence = highlight ALL occurrences** (grammar-fill evidence carries
  no paragraphId; a short `signalText` may match in unrelated sentences). Same
  deterministic rule as I9. Verifier fixture covers a repeated `signalText`.
- **No option-side evidence** for grammar-fill (no options) → no in-card `<mark>`
  branch; all evidence is passage-side clickable rows.
- **One cut:** render + entry gate together.
- **Entry**: label `语法解析` (final wording is 阿澈 UI call), completeness-gated
  (all 10 blanks q56–q65 have analysis), hide entry when incomplete (no disabled
  state), mirroring `完形解析`.
- No review UI (I13 already writes `reviewStatus: reviewed`).

## Must Do

### Step 0 — Facet framework registry (GATE-2)

- New `app/src/features/paper-intelligence/grammarFillFacetRegistry.ts` exporting
  `FACET_FRAMEWORKS: Record<facetKey, { labelZh: string; framework: FrameworkBody }>`
  for all **16 leaf** facets, transcribed **verbatim** from the KB
  `grammar-fill-facets-v1.md` (PO teaching IP — fidelity is load-bearing; render
  the steps, not a paraphrase).
- `FrameworkBody` shape (minimal, bounded):
  `{ steps: string[]; table?: { caption: string; columns: string[]; rows: string[][] }; notes?: string[] }`.
  Only `grammar-fill.given.verb.non-finite` uses `table` (the 形变表：成分 ×
  主/被动); everyone else is `steps` (+ optional `notes`).
- **Drift guard**: the registry's 16 keys MUST exactly equal the server
  `grammar-fill-facets-v1.json` keys. The verifier asserts this (prevents the
  client framework registry and the server validation registry from drifting).

Verification standard:

- Registry has exactly 16 keys equal to the server JSON; non-finite has a `table`;
  each `framework.steps` is non-empty. (Transcription correctness vs the KB is a
  PO-QA spot-check, not a machine check — flag for PO QA.)

### Step 1 — Grammar-fill analysis surface adapter (GATE-1 lives here)

- New `app/src/features/paper-intelligence/grammarFillAnalysisSurfaceAdapter.ts`
  mirroring `clozeAnalysisSurfaceAdapter.ts`:
  - Define the analysis TS type `ReviewedGrammarFillAnalysisV1` from the I13
    contract (`grammar-fill-analysis-v1.contract.md`): top-level
    `{schemaVersion:'grammar-fill-analysis-v1', paperId, sourceAssetVersion,
    targetGroups, meta?, groups, blanks}`; per-blank
    `{blankId, blankNo, blankType, hint, facetKey, answer, role, path, reason,
    evidence[], teachingNote}`; evidence
    `{type, signalText, signalSide, relation}`.
  - `buildGrammarFillAnalysisSurfaceModel({asset, analysis, groupId})` returns a
    `GrammarFillAnalysisSurfaceModel`:
    `{report, passageStructures, surfaceData, analysisByQuestionId, groupView,
    defaultQuestionId}` (same shape the harness consumes for cloze).
  - Per-blank view keyed by questionId:
    `{questionId, questionNo, blankNo, blankType, hint, facetKey, labelZh,
    framework, answer, role, path, reason, evidenceRows[], teachingNote}` —
    `labelZh` + `framework` resolved from `FACET_FRAMEWORKS[facetKey]`.
  - group view: `{overview}` (grammar-fill has NO `affectiveArc`).
  - Build passage-side evidence ranges via **whitespace-tolerant** location (the
    GATE-1 function — see below). All evidence kind = `support`. `signalSide`
    `'stem'` is rare; treat like passage (locate in passage text); never create
    an option anchor (there are none).
  - Guard: throw on schemaVersion / paperId mismatch / group not grammarFill /
    unknown facetKey (registry miss).
- **GATE-1 locate function** (new, self-contained in this adapter — do NOT change
  the shared renderer or the I9 `findAllTextRanges`): whitespace-insensitive
  substring search returning ALL matches as `{sentenceId, start, end}` ranges in
  the **stored** sentence text. Approach: build a normalized projection of each
  sentence (collapse each run of whitespace to a single space) with an index map
  back to original offsets; search the same-normalized needle; map start/end back
  to real stored offsets. Empty/whitespace-only needle → no ranges. Blank markers
  must never fall inside a returned range (the contract already forbids markers in
  signalText; the fixture proves it).

Verification standard:

- Node/unit: adapter maps a fixture into the model with all 10 blanks; group
  overview present; framework + labelZh resolved for each facetKey; role/path
  present only for non-finite; evidence ranges located by the tolerant match;
  blank markers (`  56  `) never inside a range.
- **GATE-1 fixture**: a passage that changes under `normalizeGrammarFillText`
  (double-space around `  56  `, a 3+space run) where a `signalText` validated at
  parse-time would FAIL plain `indexOf` but the tolerant match locates it. Assert
  the tolerant match finds it and plain `indexOf` would not (mutation-style).

### Step 2 — Grammar-fill analysis panel (right pad)

- New `app/src/features/paper-intelligence/GrammarFillAnalysisPanel.tsx`
  mirroring `ClozeAnalysisPanel.tsx`. Per focused blank:
  - Header: `第 N 题` + blankType tag（有提示词 / 无提示词）+ if `given` show
    `提示词：{hint}` + 考点 label (`labelZh`).
  - 答案：`answer`.
  - **考点框架**：render `framework.steps` as an ordered list; `framework.table`
    (non-finite only) as a compact table; `framework.notes` as muted lines.
  - **代入**：`reason`.
  - non-finite badges：`role`（成分中文）+ `path`（快路 / 慢路）when present.
  - 证据定位：evidence rows as
    `<button data-pi-evidence-id data-pi-evidence-kind="support" data-pi-question-id>`
    → drives the existing focus/highlight; each row shows the evidence `type`
    label + `signalText` quote + `relation`. (No option-side branch.)
  - teachingNote.
  - group `overview` rendered above the card (like I9), no affectiveArc.

Verification standard:

- Panel renders header (blankType + hint + 考点), answer, framework
  (steps/table/notes), 代入 reason, role/path for non-finite, every evidence row
  with required `data-pi-*` anchors, teachingNote, and group overview.

### Step 3 — Harness wiring (fetch → fallback + the cloze touch points)

Upgrade the `group.groupType === 'grammarFill'` branch
(`PaperIntelligencePaperSurfaceHarness.tsx:374-387`) from plain-only to
**fetch → fallback**, mirroring the cloze branch (`:325-372`). Enumerate every
touch point (same set I9 had to fix for cloze):

- **Branch (`:374-387`)**: fetch
  `${resolvedAssetBase}/analyses/grammar-fill-analysis-v1.json`; if present +
  valid → `buildGrammarFillAnalysisSurfaceModel` → set a new
  `grammarFillAnalysisModel` state, clear the others, set report +
  passageStructures; if absent / parse-fail → fall back to the existing
  `buildGrammarFillPaperView` plain view (must not break I10 blank rendering).
- New state `grammarFillAnalysisModel` (mirror `clozeAnalysisModel`, `:222`) +
  import the panel + adapter.
- **surfaceData memo (`:741`)**: include `grammarFillAnalysisModel?.surfaceData`.
- **analysisView memo (`:768-772`)**: a grammar-fill-analysis model should
  return null there (it has its own panel path), like `clozeAnalysisModel`.
- **activeEvidenceKind (`:799-815`)**: add a grammar-fill-analysis branch
  returning `'support'` for the active evidence (mirror the `clozeAnalysisModel`
  branch); ensure the plain `grammarFillModel` still returns null.
- **Seed / default-focus effect (`:666-674`)**: handle the grammar-fill-analysis
  model (resolve URL questionId against `analysisByQuestionId`, fall back to
  `defaultQuestionId`, seed first evidence) like cloze.
- **Focus seed (`:832-854`) + focus-intent handler (`:878-903`)**: handle the
  grammar-fill-analysis model shape (don't cast to the paper-asset view).
- **Panel dispatch (`:1344-1349`)**: add a `grammarFillAnalysisModel ?` branch
  rendering `GrammarFillAnalysisPanel` (before / alongside the cloze branch).
- Update the effect dependency arrays that list `clozeAnalysisModel` to also list
  `grammarFillAnalysisModel`.

Verification standard:

- Harness static/unit: grammarFill group WITH analysis dispatches the grammar-fill
  panel; WITHOUT analysis still renders the plain view (I10 fallback intact);
  questionId focus opens the matching blank; the enumerated branches handle the
  new model without casting to the paper-asset view.

### Step 4 — Availability entry gate

- Add a config to `server/search/paperSurfaceAvailability.mjs` `analysisConfigs`:
  `schemaVersion 'grammar-fill-analysis-v1'`, `fileName
  'grammar-fill-analysis-v1.json'`, `groupType 'grammarFill'`, `label '语法解析'`,
  `entryMapKey 'blanks'`. Completeness = every grammar-fill group questionId
  (q56–q65) has an entry under the analysis `blanks` map. **Mechanism already
  supports `entryMapKey` (I9) — config entry only, no logic change.**

Verification standard:

- A grammar-fill analysis with all 10 blanks yields a `语法解析` href targeting
  blank 56; one missing a blank entry hides the entry. Reading / 七选五 / 完形
  availability unchanged.

### Step 5 — Verifier + CI

- Add `scripts/verify-i14-grammar-fill-analysis-surface.mjs` covering Steps 0–4:
  registry drift guard (16 keys == server JSON) + non-finite table present;
  adapter mapping (10 blanks, framework/labelZh resolved, role/path non-finite
  only, evidence ranges via tolerant match, blank-marker exclusion, repeated-
  `signalText` multi-occurrence, **GATE-1 normalize-divergence fixture**); panel
  required parts; harness dispatch/fallback; availability complete vs incomplete
  on the `blanks` key.
- Register in `scripts/verify-ci.mjs`. Update `scripts/README.md`.

Verification standard:

- `node scripts/verify-i14-grammar-fill-analysis-surface.mjs` green; in `verify-ci`.

### Step 6 — Browser QA (real paper, load-bearing — this IS a visual change)

- Get a real grammar-fill analysis on a published surface (zero-AI-quota render is
  NOT reachable — see kratos `qa-recipe parse-smoke`): either re-import one paper
  with `gpt-5.5`, or hand-build a published asset with a real analysis JSON.
  **GATE-1 must be proven on a paper whose passage actually changes under
  `normalizeGrammarFillText`** (a trigger word adjacent to a blank marker).
- Open the `语法解析` entry → PaperSurface:
  - blank 56 focused; card shows blankType + hint + 考点 framework + 代入 reason +
    evidence + teachingNote; group overview visible; non-finite blank shows
    role/path.
  - clicking an evidence row highlights its `signalText` in the passage
    (cross-column line draws), **including the GATE-1 case adjacent to a blank**;
    switching blanks updates card + highlights.
  - I10 blank styling intact (语法 `  56  ` markers render correctly; not broken
    by the analysis path).
  - **Student version hides the analysis** (Super Teacher boundary); teacher
    version shows it.
- Do NOT commit generated `app/public/paper-assets/**`.

## Forbidden

- Do not change `shared/papersurface/**` core (tokens, anchorKeys, types,
  `segmentPaperText`, the PaperSurface module). Grammar-fill chrome lives in a
  scoped adapter + panel.
- Do not extend the `support / trap / context` evidence-kind taxonomy (uniform
  `support` highlight).
- Do not fork the shared blank renderer (`PaperSurface.tsx paperBlankPattern`) or
  break I10 blank styling (七选五 `_____36_____` / 完形 `__41__` / 语法 `  56  `).
- Do not change the I13 `grammar-fill-analysis-v1` contract,
  `prompts/grammar-fill-analysis-v1.md`, `analyzeGrammarFill.mjs`, or any
  generation / publish / `packageBuilder.mjs` code (incl. `normalizeGrammarFillText`).
- Do not change `schemas/**` or any paper-asset / grammar-fill group shape
  (docxSplitter q56–q65).
- Do not change the I9 `findAllTextRanges` or any cloze / reading / seven-choices
  adapter/panel; do not regress their render.
- Do not commit generated `app/public/paper-assets/**` or `.claude/launch.json`.
- Do not pull in the I10 sentence-initial 语法填空 blank limitation (logged in the
  watch ledger — different concern).

## Suggested Files

- `app/src/features/paper-intelligence/grammarFillFacetRegistry.ts` (new)
- `app/src/features/paper-intelligence/grammarFillAnalysisSurfaceAdapter.ts` (new)
- `app/src/features/paper-intelligence/GrammarFillAnalysisPanel.tsx` (new)
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
- `server/search/paperSurfaceAvailability.mjs`
- `scripts/verify-i14-grammar-fill-analysis-surface.mjs` (new) + `scripts/verify-ci.mjs` + `scripts/README.md`
- (panel CSS — reuse / extend the cloze panel classes; 阿澈 UI call. No
  `shared/papersurface/**` / print / export styling.)

Adjust after code inspection; keep edits owner-file-aware (AGENTS.md UI scope).

## Verification

- Targeted: `node scripts/verify-i14-grammar-fill-analysis-surface.mjs`,
  `node scripts/verify-i13-grammar-fill-analysis.mjs`,
  `node scripts/verify-i9-cloze-analysis-surface.mjs`,
  `node scripts/verify-paper-intelligence-paper-surface-harness.mjs`, `git diff --check`.
- Full gate: `node scripts/verify-ci.mjs`; `npm run build --prefix app`.
- Browser QA: Step 6.

## Browser QA Matrix

| Case | Expected |
| --- | --- |
| Grammar-fill group with complete analysis | `语法解析` entry shows; opens PaperSurface, blank 56 card: blankType + hint + 考点框架 + 代入 reason + evidence + teachingNote; group overview visible |
| Non-finite blank | role（成分）+ path（快路/慢路）shown; 形变表 framework renders |
| Click an evidence row | passage highlights the `signalText`; cross-column line draws |
| **GATE-1 evidence adjacent to a blank** | highlight resolves on the stored (normalize-diverged) passage; does NOT silently fail |
| Switch focused blank | card + highlights update |
| Grammar-fill group WITHOUT analysis | plain view still renders (I10 blanks intact); no `语法解析` entry |
| Student version | analysis hidden (Super Teacher boundary) |
| Reading / 七选五 / 完形 groups | entries + panels unchanged |

## DEV Readiness

- This plan committed before PA; **PA before DEV** (medium cut, teaching IP +
  GATE-1 risk). `pa-reviewer` (fresh Opus) writes
  `docs/cuts/I14-grammar-fill-analysis-surface/pa.md`. Fold Must Fix into this
  plan (PA Follow-Up table) before DEV.
- PA attention asks: (1) the GATE-1 tolerant-match approach + fixture
  (offset-mapping correctness; does any non-finite `table` transcription belong in
  a `dev-hard` chunk?); (2) registry single-source-of-truth choice (client module
  + drift guard vs extending the server JSON) — is the drift guard sufficient?;
  (3) any harness touch point missed vs the enumerated cloze set.

## PA Follow-Up Decisions

_(PA writes `pa.md`; 阿澈 PM compresses Must Fix → this table before DEV.)_
