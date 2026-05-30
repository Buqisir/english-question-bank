# I8 Plan — 完形填空 AI 解析生成

## Cut Size

Large.

Touches data contract (`cloze-analysis-v1`), a new analysis facet vocabulary
(`cloze.*`), the user-visible `paper-import-ai` runtime path, and teaching
interpretation. Full gates: PA before DEV, CR before merge.

It does NOT touch the render surface or the entry gate — those are
I9-cloze-analysis-surface.

## Objective

Add the AI 讲评 generation layer for one standard 高考完形填空 section (q41–q55).
When the owner runs the existing one-click analysis action in
`?view=paper-import-ai` on a paper that contains a cloze group, the flow also
generates a `cloze-analysis-v1` object — explaining, per blank, why the correct
option fits (Collocation Fit + optional POS Signature) and what each distractor
means in context, with highlightable evidence — and publish bundles it as
`analyses/cloze-analysis-v1.json` into the same paper asset version.

I8 stops at *generated, validated, real-paper-proven JSON*. It does not render
the analysis and does not expose an entry link.

## Locked Product Decisions

See `decisions.md` for full rationale; the binding spec is
`cloze-analysis-v1.contract.md`. Summary:

- Two-axis teaching model: Collocation Fit (universal, per-option = distractor
  discrimination) + optional POS Signature (verb/noun/adj/adverb/phrase). New
  `cloze.*` facet tree; do not reuse `seven-choices.*`.
- Asymmetric option treatment: correct option → *why it fits*; distractors →
  *meaning in context* only, never "why wrong".
- Logical connectors are evidence signals, not a blank type.
- Evidence is highlightable, ≥1 per blank (the collocation partner);
  passage-side by default, option-internal only for phrase blanks.
- Group analysis is light: `overview` + `affectiveArc` only.
- Blanks keyed by questionId, carry blankId + blankNo; bind to the I3 cloze
  group model (per-question A–D options).
- Generation happens **at import time** (mirror analyze-seven-choices). Keep one
  user action for the whole paper analysis flow. Already-imported cloze papers
  are re-imported to gain analysis.
- **Required-when-present (PA MF-2 / owner decision):** when a cloze group is
  detected, a valid `cloze-analysis-v1` is REQUIRED at publish — a missing or
  invalid analysis blocks publish with a named issue, exactly like seven-choices
  (`seven_choices_analysis_required`). This **supersedes** I3-A's interim
  "missing cloze analysis does not block" stance. It accepts the same coupling
  七选五 already has (an analysis-generation failure blocks the whole paper
  publish). Papers with no cloze group are unaffected.
- No review UI; write `reviewStatus: reviewed`. Field reserved for future.
- Support one standard 完形 section: q41–q55, 15 blanks, A–D options.
- `answer-key.json` stays the answer authority; AI answer conflict blocks.

## Must Do

### Step 1 — Contract + Facet Vocabulary (committed spec)

- `cloze-analysis-v1.contract.md` (in this cut dir) is the binding spec. The
  prompt and validator are built from it.
- The `cloze.*` facet leaves (POS + signatures) are enumerated in the contract's
  "POS Axis" and "Signature Facets" sections. If a separate machine-readable
  facet table is wanted later, it is additive and not required for I8.

Verification standard:

- The contract enumerates: `pos` values, signature leaves, evidence `type`
  closed vocabulary, required vs optional fields, and validation rules.

### Step 2 — Prompt `prompts/cloze-analysis-v1.md`

- Author the prompt from the contract. Follow the prompt-hardening philosophy
  used by seven-choices (inline JSON only, no files, verbatim exact quotes):
  `readApiPrompt()` rewrites the Output Requirement to force a single
  `{`…`}` JSON object as plain text.
- The prompt must teach the two-axis model explicitly: Collocation Fit first
  (and that distractors get a context-meaning gloss, not a refutation), then the
  optional POS Signature, then the evidence layer with exact-substring rules.
- The prompt must instruct: ≥1 `collocation-partner` evidence per blank; mark a
  `signatureFacet` only when one genuinely applies; never overwrite the
  authoritative answer.
- The prompt must instruct that `signalText` quotes surrounding words, **never a
  blank marker** (`__41__`), and that `pos: "other"` carries no signature (PA
  Should-Watch).
- Resolve the prompt-philosophy seam consciously: the seven-choices prompt has a
  no-file-download stance; reuse `readApiPrompt()`'s inline-JSON hardening and
  keep the cloze prompt consistent with it (PA Should-Watch).

Verification standard:

- A prompt-contract verifier asserts the prompt names every `pos` value, every
  signature leaf, every evidence `type`, the asymmetric distractor rule, and the
  exact-substring requirement (static string checks, mirroring the seven-choices
  prompt verifier).

### Step 3 — `server/paper-import-ai/analyzeCloze.mjs`

- Mirror `analyzeSevenChoices.mjs`. Export `buildClozeAnalysisMessages({ paper,
  group })` and `analyzeClozeImportCandidate(input, options)`.
- Build a structured prompt input from the cloze group (passage paragraphs with
  inline blanks, the 15 questions with A–D options, answer keys, blankIds).
- Provider call + retry via the shared `gptRelay` / `deepseek` callers and
  `extractFirstJsonObject` (reuse infra; do not duplicate). Honor injected
  `providerCallers` for tests.
- Implement `validateClozeShape(analysis, { paper, group })` enforcing every rule
  in the contract's "Validation Rules" section, including:
  - schemaVersion / paperId / sourceAssetVersion / targetGroups checks;
  - `blanks` keys equal the 15 questionIds;
  - required fields per blank; `signatureFacet` POS-prefix match when present;
    `pos: "other"` is allowed with NO signature (must not be rejected);
  - ≥1 evidence with ≥1 `collocation-partner`;
  - exact-substring quote validation per `signalSide` (passage/stem vs the
    blank's own options);
  - `correctFit.optionLabel` (when present) equals the answer key — a mismatch
    is **non-retryable** and blocks (reuse the seven-choices
    `isRetryableAnalysisError` distinction so answer conflicts do not loop).

Verification standard:

- Unit-level (node) tests via injected stub providers prove: a good fixture
  passes; missing required field, wrong schemaVersion, non-substring evidence,
  POS/signature mismatch, missing collocation-partner, and answer conflict each
  throw the right blocking error; answer conflict does not retry.

### Step 4 — Import Wiring + Package + Publish Persistence

The analysis-file machinery is **split across three modules** — it is NOT just
`packageBuilder`. PA MF-1 verified the real seams; follow them exactly:

- **Route + workbench (one action):** Add `POST /api/paper-import-ai/analyze-cloze`
  to `routes.mjs`, mirroring `analyze-seven-choices`, with injectable
  `services.analyzeCloze`. When the parsed paper has a cloze group, the
  workbench's existing one-click analysis also produces the cloze analysis and
  threads it into the publish payload (e.g. `payload.clozeAnalysis`), via
  `app/src/services/paperImportAi.ts` + `PaperImportAiWorkbench.tsx`.
- **packageBuilder (`buildPaperImportAiPackageFiles`):** thread `clozeAnalysis`
  into the normalized package data. Enforce **required-when-present**: if a
  cloze group is detected, a valid `cloze-analysis-v1` is required or block with
  a named issue `cloze_analysis_required` (and paperId / targetGroups checks),
  mirroring `seven_choices_analysis_required` (`packageBuilder.mjs:~294`).
- **validator (`server/paper-import/validator.mjs`):** add `'cloze-analysis-v1'`
  to `PAPER_IMPORT_SCHEMA_VERSIONS` (L17) — otherwise the first cloze publish
  hard-fails with `json.schemaVersionUnknown`. **No `schemas/**` change needed**:
  AJV intentionally skips validation when no schema file exists (L168), so the
  Forbidden boundary stays intact.
- **storage (`server/paper-import/storage.mjs`):** the `analyses/` write is
  hardcoded per analysis type (driven by `packageData.scAnalysis`, NOT by
  packageBuilder `outputFiles`). Add a `clozeAnalysis` pass-through and file
  const (`cloze-analysis-v1.json`) to all three functions:
  `makeVersionedArtifacts` (L~85-90), `writePaperImportVersion` (L~122-124), and
  `swapPaperImportLatest` (L~157-163).

Verification standard:

- Route verifier proves the new route exists, supports an injected analyze
  service, and returns a `cloze-analysis-v1` result without regressing existing
  responses.
- C7 validator accepts a package carrying `cloze-analysis-v1`; a detected cloze
  group with a missing/invalid analysis is a blocking publish state.
- **The published asset on disk actually contains
  `latest/analyses/cloze-analysis-v1.json`** (assert the file, not just that
  packageBuilder emitted it — I9 fetches this exact path).
- Existing I1/I2/I3 and C7 publish/contract verifiers still pass.

### Step 5 — Verifier + CI registration

- Add `scripts/verify-i8-cloze-analysis.mjs` covering Steps 2–4 (prompt
  contract, analyze validator success/blocking cases, route + package wiring).
- **Register it in `scripts/verify-ci.mjs`** (verify:all). Note: I-series
  verifiers previously bit-rotted because they were not in CI — do not repeat
  that. Update `scripts/README.md`.

Verification standard:

- `node scripts/verify-i8-cloze-analysis.mjs` passes.
- `node scripts/verify-ci.mjs` is green and includes verify-i8.

### Step 6 — Real Paper QA (empirical contract validation)

- Generate cloze analysis for one real cloze paper from
  `/Users/huangxuewei/Desktop/26年3月高三试卷` (deep sample), plus 1–2 smoke
  samples if the first exposes no edge.
- The owner reads the generated JSON for teaching quality (collocation reasoning
  reads true; distractor glosses are right; signatures are not forced; evidence
  quotes are exact and useful). Iterate prompt/contract as needed within this
  cut.
- The deep sample MUST exercise at least one **phrase** blank, to prove the
  option-side evidence path (`contextual-composition` + option-internal
  highlight) end to end (PA Should-Watch).
- Record summary evidence in the PR. Do not commit generated
  `app/public/paper-assets/**`.

Verification standard:

- Deep sample generates a fully valid `cloze-analysis-v1.json` for all 15 blanks
  that the owner judges teaching-correct.
- Smoke samples generate without validator regressions.

## Forbidden

- Do not change `schemas/**` or `paper-asset-v1` / the I3 cloze group model.
- Do not build the render surface, the cloze analysis card, evidence highlights,
  or the `完形解析` entry gate (all I9-cloze-analysis-surface).
- Do not add a review UI or a post-hoc "re-analyze existing asset" path.
- Do not implement grammar-cloze / 语法填空 analysis.
- Do not reuse `seven-choices.*` facets for cloze; do not change the
  seven-choices contract, prompt, or analyze module.
- Do not commit generated `app/public/paper-assets/**` runtime outputs.
- Do not write a cloze analysis that overwrites or contradicts the authoritative
  answer key.
- Do not duplicate provider/JSON-extraction infra; reuse
  `server/ai-providers/*` and `extractJson.mjs`.

## Suggested Files

- `prompts/cloze-analysis-v1.md`
- `server/paper-import-ai/analyzeCloze.mjs`
- `server/paper-import-ai/routes.mjs`
- `server/paper-import-ai/packageBuilder.mjs`
- `server/paper-import/validator.mjs` (schema-version allow-list)
- `server/paper-import/storage.mjs` (analyses/ write — three functions)
- `app/src/services/paperImportAi.ts`
- `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx`
- `scripts/verify-i8-cloze-analysis.mjs`
- `scripts/verify-ci.mjs`
- `scripts/README.md`

Adjust after code inspection; keep edits owner-file-aware.

## Verification

- Targeted:
  - `node scripts/verify-i8-cloze-analysis.mjs`
  - `node scripts/verify-i2-seven-choices-ai-import.mjs`
  - `node scripts/verify-i3-cloze-ai-import.mjs`
  - `node scripts/verify-c7-paper-import-contracts.mjs`
  - `node scripts/verify-c7-paper-import-publish.mjs`
  - `git diff --check`
- Full gate before PR ready:
  - `node scripts/verify-ci.mjs` (must include verify-i8)
- Real paper QA: Step 6 above (owner reads generated JSON).

## Browser QA Matrix

I8 is generation-only; QA is via `?view=paper-import-ai` + reading the published
JSON (the rendered 讲评 view is I9).

| Case | Expected result |
| --- | --- |
| Paper with Reading + 七选五 + 完形 + answer DOCX | One analysis action generates cloze analysis for q41–q55; publish writes `analyses/cloze-analysis-v1.json` |
| Generated cloze analysis | Every blank has correctFit + distractor glosses + ≥1 collocation-partner evidence; signatures only where they apply |
| AI answer conflicts with answer key | Analysis blocks with an answer-conflict error; no retry loop; publish does not store a conflicting analysis |
| Paper with Reading / 七选五 but no 完形 | Existing import path unchanged; no cloze analysis attempted; no new blocking |

## DEV Readiness

- This plan + `cloze-analysis-v1.contract.md` + `decisions.md` must be committed
  before PA, and PA before DEV.
- PM writes/curates; `pa-reviewer` writes PA to `docs/cuts/I8-cloze-analysis/pa.md`.
- PA Must Fix items are folded back into this plan (table below) before DEV.
- DEV can start only after PA Must Fix items are resolved here or explicitly
  accepted by the owner.

## PA Follow-Up Decisions

PA verdict: **APPROVE WITH MUST FIX** (`pa.md`). Both Must Fix folded; MF-2
resolved by owner. DEV may start.

| PA item | `pa.md` disposition | `plan.md` handling | Status |
| --- | --- | --- | --- |
| `MF-1` | Publish wiring names the wrong files; analysis persistence is split across validator + storage, not just packageBuilder; first cloze publish would hard-fail on `schemaVersionUnknown`. | Step 4 rewritten to the real seams: add `cloze-analysis-v1` to `validator.mjs` `PAPER_IMPORT_SCHEMA_VERSIONS` (no `schemas/**` change — AJV skips), add `clozeAnalysis` to all three `storage.mjs` functions + file const, thread through packageBuilder. Suggested Files now lists `validator.mjs` + `storage.mjs`. Step 4 verify asserts `latest/analyses/cloze-analysis-v1.json` exists on disk. | Closed |
| `MF-2` | Publish-gate ambiguity ("optional but expected") = fake-availability trap; recommend required-when-present (matches seven-choices) or an explicit PO decision. | Owner decision: **required-when-present**. Locked Decisions + Step 4 require a valid analysis when a cloze group is detected, blocking with `cloze_analysis_required`; supersedes I3's interim non-blocking stance. | Closed |
| `SW-1` | `signalText` should carve out `__nn__` blank markers. | Contract Evidence rule + Step 2 prompt instruction added. | Closed |
| `SW-2` | Validator must allow `pos:"other"` with no signature. | Step 3 validator standard updated. | Closed |
| `SW-3` | Step 6 should exercise ≥1 phrase blank (option-side evidence). | Step 6 now requires a phrase blank in the deep sample. | Closed |
| `SW-4` | Prompt-philosophy consistency vs the seven-choices file-download stance. | Step 2 now requires reusing `readApiPrompt()` hardening consistently. | Closed |
