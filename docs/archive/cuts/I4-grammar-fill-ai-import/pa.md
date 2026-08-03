# PA Report — I4-A 语法填空 AI 导题接入

## Verdict

APPROVE WITH MUST FIX

The direction is right: extend the existing paper-import-ai flow to parse, normalize, package, publish, and display one standard 语法填空 section. The plan correctly constrains scope to deterministic parsing + normalization only, with no AI grammar analysis. The data contracts in `paper-asset-v1` already support `grammarFill` groupType. However, five specification gaps would cause rework during DEV and must be resolved before DEV starts.

## Product Principle

The teacher's task is "导入一张完整的客观题试卷". I4-A completes the fourth objective family so the one-click import produces a complete objective paper (Reading + 七选五 + 完形 + 语法填空). The cut stays focused on 导题入库 and plain paper QA, correctly deferring grammar analysis to a future cut. This is the right slice at the right time.

## Exact UX / Architecture Model

### Current Dataflow

```
[Paper DOCX + Answer-Analysis DOCX]
  → POST /api/paper-import-ai/parse
    → parseReadingDocxBuffer (docxSplitter.mjs)
      → parseReadingCandidatesFromText
        → returns: readingGroups, sevenChoicesGroup, clozeGroup, skipped
        → grammar-fill: classified as "grammar_or_language", NOT parsed, appears in skipped
  → POST /api/paper-import-ai/publish
    → buildPaperImportAiPackageFiles (packageBuilder.mjs)
      → consumes: parseResult, sevenChoicesGroup, sevenChoicesAnalysis, clozeGroup
      → produces: paper-asset.json, answer-key.json, import-meta.json, analysis JSONs
    → publishPaperImportPackage (publisher.mjs)
      → buildQaLinks: Reading + 七选五 + 完形 links
      → NO grammar-fill link
```

### I4-A Target Dataflow

```
[Paper DOCX + Answer-Analysis DOCX]
  → POST /api/paper-import-ai/parse
    → parseReadingDocxBuffer
      → parseReadingCandidatesFromText
        → additionally parses grammar-fill section (q56-q65, 10 blanks, optional prompts)
        → returns: grammarFillGroup (new), grammarFillError (new)
  → POST /api/paper-import-ai/publish
    → buildPaperImportAiPackageFiles
      → additionally consumes: grammarFillGroup
      → produces: grammarFill group in content.groups, blanks in content, layout tree entry
      → enforces: missing grammar-fill blocks publish
    → publishPaperImportPackage
      → buildQaLinks: additionally includes grammar-fill QA link
```

### PaperSurface / QA Link Dataflow (existing pattern, to be extended)

The cloze adapter (`clozePaperViewAdapter.ts`) establishes the plain-paper-view pattern that grammar-fill must follow:

```
[PaperSurface Harness]
  → fetch paper-asset.json
  → check groupType:
    - 'reading' / 'sevenChoices': load analysis JSON → build rich surface model
    - 'cloze': buildClozePaperView → plain paper view (textMap + questions, no analysis)
    - 'grammarFill': [MISSING — will error or try to load non-existent analysis JSON]
```

I4-A must add a `grammarFill` branch following the cloze pattern, or the QA link will not render.

### File Map

| File | I4-A Change |
|---|---|
| `server/paper-import-ai/docxSplitter.mjs` | Add grammar-fill section detection and parsing |
| `server/paper-import-ai/packageBuilder.mjs` | Accept `grammarFillGroup`, build content group, enforce family completeness |
| `server/paper-import-ai/routes.mjs` | Pass `grammarFillGroup` to publish payload |
| `server/paper-import/publisher.mjs` | Add `getGrammarFillGroups`, wire into `buildQaLinks` |
| `server/paper-import/validator.mjs` | Upgrade non-Reading objective family checks from warning to blocking (per plan) |
| `app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts` | NEW — plain paper view adapter following cloze pattern |
| `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx` | Route `grammarFill` groups to new adapter |
| `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx` | Show grammar-fill status/preview |
| `app/src/services/paperImportAi.ts` | Include grammar-fill in payload |
| `scripts/verify-i4-grammar-fill-ai-import.mjs` | NEW — I4-specific verifier |

## Must Fix Before DEV

### MF1 — Publish blocking enforcement layer is underspecified

The plan states: "From I4-A onward, publish requires Reading A-D, 七选五, 完形填空, and 语法填空. Missing any one of those four objective families blocks publish." But it does not specify WHERE this check is enforced.

Current state:
- `packageBuilder.mjs`: Enforces Reading A-D completeness (line 170-175 throws `reading_group_missing`). Missing 七选五 or 完形 is optional — the builder simply skips them.
- `validator.mjs` `validateNonReadingCompleteness`: Uses WARNING severity for non-Reading groups (line 431: "非 Reading A-D 暂不阻断发布").

The ambiguity: if `grammarFillGroup` is `null` in the publish payload, should the package builder throw `grammar_fill_group_missing`, or should the validator catch it at publish time? The plan must specify:
- Which layer enforces (package builder pre-check, validator publish-time check, or both)
- Whether existing papers with only 3 families can be republished after I4-A (this is a breaking behavioral change)
- Error code and user-facing message format for each missing family

**Required plan.md disposition**: Add a locked product decision specifying the enforcement layer and error codes for all four missing-family cases.

### MF2 — Grammar-fill answer extraction format from answer-analysis DOCX

The plan says "extracted answer labels / answer strings from the answer-analysis DOCX" but does not specify the format. This is critical because the current `parseAnswerRanges` function only handles single-letter answers (A-G) from ranges like `21-23 BAC`. Grammar-fill answers are English words or word fragments (e.g., "was", "to visit", "-ing", "the", "which"). The answer-analysis DOCX may use:
- Individual answer lines (e.g., `56. was` or `56 was`)
- Parenthesized answers (e.g., `56. was (be)`)
- Ranges with word-length tokens
- A different format entirely

Without a concrete format specification, the splitter implementation will be guesswork.

**Required plan.md disposition**: Add a specification of the expected answer format in the answer-analysis DOCX for q56-q65. Include at least one concrete example from a real answer-analysis DOCX.

### MF3 — PaperSurface harness needs confirmed grammar-fill adapter branch

The plan says "If current paper-intelligence paper-asset adapters reject grammar-fill groups, add a minimal display-only grammar-fill paper view adapter." This is stated as conditional, but the code confirms it IS required: the harness (`PaperIntelligencePaperSurfaceHarness.tsx`, line 306) specifically handles only `cloze` → `buildClozePaperView`. A grammar-fill group with no analysis file will fall through to line 346 (`analysisRes = await fetch(...)`), attempt to load a non-existent analysis JSON, and throw an error.

The new `grammarFillPaperViewAdapter.ts` should follow the exact same pattern as `clozePaperViewAdapter.ts`:
- Build `PaperSurfaceData` with passage text from `group.passage.paragraphs`
- Map q56-q65 as questions with blank positioning
- Return `analysisByQuestionId` as all-null map (no analysis panel)
- Include `group.passage.paragraphs` as passage structure

**Required plan.md disposition**: Promote "add grammar-fill adapter" from conditional to unconditional Must Do step. List the adapter file as a suggested file.

### MF4 — Publisher `buildQaLinks` missing grammar-fill link

The plan specifies the QA link format: `?view=paper-intelligence&source=paper-asset&surface=paper&groupId=<grammarFillGroupId>&questionId=<q56Id>`. But the current `buildQaLinks` in `publisher.mjs` (line 335) only generates links for Reading, 七选五, and 完形. A `getGrammarFillGroups` helper (equivalent to `getClozeGroups` at line 324) is needed to extract grammar-fill groups from the asset and generate QA links.

Without this, grammar-fill QA links will be absent from the publish response.

**Required plan.md disposition**: Add explicit publisher changes to Must Do Step 4, listing the grammar-fill group extraction helper and QA link wiring.

### MF5 — Blanks model population contract

The `paper-asset-v1` schema supports `content.blanks` with `{ blankId, groupId, questionId, position?, prompt? }`. The plan says "prompt words in parentheses are structured as `blank.prompt` when present." But the current package builder never populates `content.blanks` for any group type. The cloze builder sets `blankIds` on the group and `blankId` on questions but does not write `content.blanks` entries.

For grammar-fill, the spec must clarify:
- Does I4-A populate `content.blanks` for q56-q65, or only set `blankIds` on the group?
- If blanks are populated, what is `position` (offset in passage text? paragraph ID + char offset?)
- Is `prompt` the raw prompt word in its original form (e.g., "be") or a normalized form?

This is a data contract decision that affects the adapter (how to render blanks), the builder (what to write), and the splitter (what to extract).

**Required plan.md disposition**: Add a locked product decision specifying the blanks population contract for grammar-fill: whether to populate `content.blanks`, and if so, the exact fields.

## Must Fix -> Plan Disposition Checklist

| # | Must Fix | Required plan.md disposition | Status |
|---|---|---|---|
| MF1 | Publish blocking enforcement layer unspecified | Locked product decision: enforcement layer, error codes, backward-compat rule for 3-family republishing | ✅ Closed in `plan.md` |
| MF2 | Grammar-fill answer extraction format unspecified | Specification or concrete example of q56-q65 answer format in answer-analysis DOCX | ✅ Closed in `plan.md` |
| MF3 | PaperSurface harness needs grammar-fill adapter | Promote to unconditional Must Do step; add adapter file to suggested files | ✅ Closed in `plan.md` |
| MF4 | Publisher `buildQaLinks` missing grammar-fill | Add publisher changes to Must Do Step 4 | ✅ Closed in `plan.md` |
| MF5 | Blanks model population contract | Locked product decision: populate `content.blanks` yes/no, field semantics | ✅ Closed in `plan.md` |

## Should Watch

### SW1 — Structure-based grammar-fill detection robustness

The plan's detection heuristics (q56-q65 range, 10 blanks, optional prompts in parentheses) work for 高考 standard papers but may fail on mock papers with non-standard numbering. Consider surfacing `detected_but_incomplete_grammar_fill` as a distinct error code rather than silently skipping.

### SW2 — Multi-paragraph grammar-fill passages

Some grammar-fill sections span multiple paragraphs (e.g., q56-60 in paragraph 1, q61-65 in paragraph 2). The splitter should build multiple paragraph entries rather than concatenating into one text block. The cloze adapter already handles multi-paragraph passages; the grammar-fill adapter should do the same.

### SW3 — Publishes with partial data after schema upgrade

The plan does not address whether currently-published paper assets (which may have 3 families) need a migration path. If the validator is upgraded to block missing families, re-publishing an existing asset that lacks grammar-fill would fail. Consider adding a `schemaVersion` gate or an explicit `incomplete_objective_families` annotation.

### SW4 — Deep sample file path

The plan references `/Users/huangxuewei/Desktop/26年3月高三试卷` which is a local absolute path not checked into the repo. DEV should confirm this directory exists and contains readable DOCX files before relying on it for the deep sample.

## Allowed Files

```
server/paper-import-ai/docxSplitter.mjs
server/paper-import-ai/packageBuilder.mjs
server/paper-import-ai/routes.mjs
server/paper-import/publisher.mjs
server/paper-import/validator.mjs       ← I4-A requires blocking upgrades here
app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts  ← NEW
app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx
app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx
app/src/features/paper-import-ai/paperImportAiWorkbench.css
app/src/services/paperImportAi.ts
scripts/verify-i4-grammar-fill-ai-import.mjs  ← NEW
scripts/README.md
docs/cuts/I4-grammar-fill-ai-import/plan.md   ← PM compression only
docs/cuts/I4-grammar-fill-ai-import/pa.md
```

## Forbidden Files

Confirmed unchanged — the plan's forbidden scope is complete and correct:

```
schemas/**
shared/papersurface/**
app/public/paper-assets/**  (generated)
```

Note: `schemas/paper-import/paper-asset-v1.schema.json` already supports `grammarFill` in the `groupType` enum (line 59). No schema change needed.

## Static Verify Requirements

The plan lists `node scripts/verify-i4-grammar-fill-ai-import.mjs` as a new targeted verifier. This file must prove:

1. **Parser correctness** (MF2-dependent): One fixture with Reading + 七选五 + 完形 + 语法填空 parses all four families. The verifier should check:
   - `grammarFillGroup` is non-null with groupType `grammarFill`
   - 10 blanks detected (q56-q65)
   - Each blank has a `blankId`, `questionId`, and `prompt` when present
   - Answers are present for all 10 blanks
   - Existing Reading/七选五/完形 parsing is unregressed

2. **Missing grammar-fill blocks publish**: Verify that a parse result with `grammarFillGroup: null` triggers a blocking error at the specified enforcement layer (MF1).

3. **Missing answers block publish**: Verify that a grammar-fill group with < 10 answers triggers a blocking error.

4. **Wrong blank count blocks publish**: Verify that < 10 or > 10 blanks triggers a blocking error.

5. **Answer conflicts block publish**: Verify that answer mismatch between structure and answer-analysis DOCX triggers a blocking error.

6. **Normalization**: Verify blank spacing, prompt spacing, and punctuation normalization on a fixture.

7. **Package output shape**: Verify that the generated `paper-asset.json` includes the grammar-fill group with correct `groupType: 'grammarFill'`, questionIds, blankIds, paragraphs, and layout tree entry.

8. **Existing verifier non-regression**: `verify-i3-cloze-ai-import.mjs`, `verify-i2-seven-choices-ai-import.mjs`, `verify-c7-paper-import-contracts.mjs`, `verify-c7-paper-import-publish.mjs`, `verify-ci.mjs`.

The plan's verification list is thorough. Add to Step 1 verification standard: "New I4 verifier proves grammar-fill answer extraction from answer-analysis DOCX with actual-word answers (not single-letter A-G)."

## Browser QA Matrix

The plan's Browser QA Matrix (lines 225-232) covers the essential cases. Two additions:

| Case | Expected result |
|---|---|
| *(existing rows from plan.md)* | |
| Grammar-fill QA link opens in PaperSurface | Passage text visible with q56-q65 blanks rendered; no answers, no analysis card, no evidence lines |
| PaperSurface with grammar-fill group and missing/zero-paragraph passage | Graceful error or empty state in the harness, not a React crash |

## DEV Readiness

| Criterion | Status |
|---|---|
| Exact teacher action improved | YES — 一键导入完整客观题试卷 |
| Exact before/after behavior | YES — before: grammar-fill silently skipped; after: parsed, published, QA-viewable |
| Current cut boundary | YES — parsing, normalization, packaging, publishing, plain QA view |
| Future-cut boundary | YES — grammar analysis, 语法点讲解, writing task import (I5) |
| Allowed files | YES |
| Forbidden files | YES |
| Verify scripts needed | YES — `verify-i4-grammar-fill-ai-import.mjs` (new) + existing verifier non-regression |
| Browser QA matrix | YES — 6 cases in plan + 2 additions above |
| Open PO Decisions ≤ 3 | YES — 1 (enforcement layer in MF1) |

**DEV is not ready until MF1-MF5 are resolved in `plan.md` and the Must Fix → Plan Disposition Checklist is filled.**

## Open PO Decisions

1. **Publish enforcement layer** (MF1): Should the 4-family completeness check be a package-builder pre-check (rejects before packaging), a validator publish-time check (rejects at publish), or both? Should existing 3-family papers be republishable after I4-A?

Kratos: no relevant hits.
