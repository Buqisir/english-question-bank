# PA Report — I5-A Writing AI Import

Baseline: `3d3250e` on `codex/i5-writing-ai-import-plan`
Reviewed: `docs/cuts/I5-writing-ai-import/plan.md`

## Verdict

**APPROVE WITH MUST FIX**

The direction is correct: extend the existing `paper-import-ai` pipeline to recognize, package, and render plain A4 QA links for 应用文写作 and 读后续写. The plan correctly bounds scope to detection, packaging, publish blocking, and plain paper views without adding writing AI analysis, 范文, or scoring. Four specification gaps must be closed before DEV starts.

## Product Principle

- **Teacher task**: Import a standard Gaokao-style whole paper and confirm all six families (Reading A-D, 七选五, 完形填空, 语法填空, 应用文写作, 读后续写) are present before publish.
- **Boundary**: I5-A stops at 导题入库可视化 — detect, package, block, and show plain A4 writing views. Writing AI analysis, 范文, scoring, and writing teaching workflows are explicitly out.
- **Paper-first**: Writing QA links show the A4 paper surface with answer boxes, not AI dashboards. The golden sample (pages 11-12 of `exam-paper-format-reference`) is the visual authority.
- **Data contract**: The existing `paper-asset-v1` schema (`groupType: 'writing'`, `PaperWritingTask`, `PaperBlockAnswerBox`, `writingTasks` record) appears sufficient for the golden-sample writing model. No schema change needed unless DEV proves otherwise in practice.

## Exact UX / Architecture Model

**Pre-publish** (`?view=paper-import-ai`):
- Upload paper DOCX + answer-analysis DOCX as before.
- Workbench shows six family statuses: Reading A-D, 七选五, 完形填空, 语法填空, 应用文写作, 读后续写.
- Missing writing family → publish blocked in both UI preflight and server.
- Non-standard score/word-count structure → warning surfaced; behavior TBD (see Must Fix #4).

**Post-publish**:
- QA link list includes two new links: 应用文写作 and 读后续写.
- Application QA link → plain A4 paper view: heading, score line, instruction, content requirements, notes, one answer box.
- Continuation QA link → plain A4 paper view: material text, continuation requirements, two paragraph starters, one large answer box.
- No answers, 范文, 评分标准, or analysis card in either view.

**Data flow**:
1. DOCX splitter → `parseResult.writing.applicationGroup` + `parseResult.writing.continuationGroup` (or two top-level group fields)
2. Package builder → two `writing` groups with `writingTaskId`, `writingTasks` entries, `answerBox` blocks
3. Publisher → six-family validation, writing QA links, DB persistence for writing groups
4. PaperSurface harness → `writingPaperViewAdapter` for `groupType === 'writing'`

## Must Fix Before DEV

### MF1 — Writing section splitter extraction rules are underspecified

The plan names structural signals (第四部分 写作, 第一节, 第二节, 15-point/80-word, 25-point/150-word) but does not specify what content the splitter must extract from source DOCX vs. what comes from golden-sample套话.

The plan must answer:
- Which exact lines/sections from the DOCX constitute the "application task scenario" vs. "content requirements"?
- Which lines constitute the "continuation material paragraphs" vs. "paragraph starters"?
- What is the fallback when section markers (第一节/第二节) are not present as extractable text (common in DOCX with inline formatting)?
- How does the splitter distinguish application content requirements from continuation material text when both are free-form prose under the same `第四部分` part?

Compare with I4 grammar-fill: the splitter has concrete position-based detection between cloze options and writing section start, explicit line filtering rules, and prompt extraction patterns. I5 needs equivalent precision.

### MF2 — Golden-sample套话 text is not specified

The plan says "Generate standard golden-sample套话 for score, word count, notes, and answer box placement instead of copying sloppy source formatting." DEV must not guess the exact Chinese text for:
- Application: score line (满分15分), word-count line (词数80左右), standard notes
- Continuation: score line (满分25分), word-count line (词数150左右), continuation instruction (注意：续写词数应为150左右), paragraph starter format

Either (a) commit the exact 套话 strings to the plan, or (b) name a single reference file that DEV can copy them from (e.g., reference golden-sample extracted text under `docs/product/exam-paper-format-reference/`).

### MF3 — Publisher handling of writing groups is unaddressed

The current publisher (`server/paper-import/publisher.mjs`) assumes every group has `questionIds`. Writing groups have `writingTaskId` instead and no traditional questions. The plan must specify:

- How `upsertPaperAssetToDb` handles a writing group (no question rows to create).
- Whether writing tasks need a DB representation in the current schema, or whether writing groups exist only as `question_groups` rows with zero linked questions.
- How `buildQaLinks` constructs writing QA links (no `questionId` parameter — what does the URL look like?).
- How `getWritingGroups` extracts writing groups from the asset for QA link generation (analogous to existing `getReadingChoiceGroups`, `getSevenChoicesGroups`, etc.).

A `question_groups` row with `groupType = 'grammar_cloze'` (the mapped DB type for writing is `writing` in `groupTypeMap`) and zero questions is a valid representation, but this needs an explicit decision before DEV.

### MF4 — Non-standard writing handling is ambiguous

The plan says "surface a warning or block for human review" for non-standard score/word-count structure. This is two different behaviors:

- **Warning**: still allow publish, teacher proceeds at their own risk.
- **Block**: hard stop, no publish.

The plan must pick one for I5-A. Recommend: **block publish** for clearly non-standard structure (unrecognizable section markers, wrong part numbering, missing paragraph starters in continuation), with a specific error message. **Warning only** for minor deviations (slightly different word count like 100 words instead of 80, non-standard but semantically clear 套话). This keeps the gate meaningful without blocking well-formed papers on cosmetic differences.

Also: the plan says "Structure that affects meaning blocks publish." Give at least two concrete examples of "affects meaning" vs. "non-standard but semantically clear."

## Must Fix → Plan Disposition Checklist

| # | Must Fix | Required `plan.md` disposition | Status |
| --- | --- | --- | --- |
| MF1 | Splitter extraction rules underspecified | Add concrete extraction rules under Step 1: which lines are extracted for scenario/content-requirements/material/starters; fallback when section markers are not extractable text. | ✅ Closed in `plan.md` |
| MF2 | Golden-sample套话 text not specified | Commit exact 套话 strings to Step 1 or name a reference file under `docs/product/exam-paper-format-reference/`. | ✅ Closed in `plan.md` |
| MF3 | Publisher writing-group handling unaddressed | Add specification under Step 2/4: DB row strategy for writing groups, QA link URL format for groups without questionId, `getWritingGroups` extraction. | ✅ Closed in `plan.md` |
| MF4 | Non-standard writing handling ambiguous | Decide warning vs. block for non-standard score/word-count; add 2+ concrete examples of "affects meaning." | ✅ Closed in `plan.md` |

## Should Watch

### SW1 — Format standards phrase "two answer boxes"

`exam-paper-format-standards.md` line 80: "应用文写作 and 读后续写 both use two answer boxes." The golden sample and plan describe one answer box per writing task. If the standard means "two writing tasks each have one answer box," reword for clarity. If it means something else, reconcile with the plan.

### SW2 — six-family completeness may need opt-out

The plan mandates all six families for standard publish. Non-standard papers (reading-only practice, writing-only worksheets, test papers without 读后续写) would be permanently blocked. This is correct for I5-A's "standard whole paper" scope, but a future cut may need an opt-out or "partial import" mode. Record in cut-note.

### SW3 — Writing adapter may pressure shared/papersurface

The plan bans `shared/papersurface/**` changes unless answerBox rendering is impossible through adapters. Writing answer boxes are structurally simpler than reading question analysis (no option reasoning, no evidence lines, no trap diagnosis). Risk is low, but if the existing `PaperBlockAnswerBox` renderer cannot produce golden-sample-like boxes, a minimal shared change may be needed. Flag during DEV.

### SW4 — answerBox visual spec is image-based, not dimension-based

The plan references golden sample JPEGs for answer box dimensions. For DEV, consider extracting approximate measurements (box width as percentage of A4 width, box height in lines, border style, spacing from surrounding elements) to reduce guesswork during implementation.

### SW5 — Writing task import-meta and DB record shape

Writing groups in `import-meta` and the publisher DB need tags, difficulty, and summary fields consistent with existing families. The plan doesn't specify these. DEV should follow the existing pattern: tags `['应用文写作']` / `['读后续写']`, difficulty `中`, summary from golden-sample instruction text.

## Allowed Files

```
server/paper-import-ai/docxSplitter.mjs
server/paper-import-ai/packageBuilder.mjs
server/paper-import-ai/routes.mjs
server/paper-import/publisher.mjs
app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx
app/src/features/paper-import-ai/paperImportAiWorkbench.css
app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx
app/src/features/paper-intelligence/writingPaperViewAdapter.ts
app/src/services/paperImportAi.ts
scripts/verify-i5-writing-ai-import.mjs
scripts/README.md
```

## Forbidden Files

```
schemas/**
shared/papersurface/**
app/public/paper-assets/**
app/src/shared-ui/papersurface/**
```

Exception: minimal `shared/papersurface/**` change permitted only if the existing adapter/harness path cannot render answer boxes at golden-sample quality AND PA or PM explicitly approves the specific change.

## Static Verify Requirements

1. **New I5 verifier** (`scripts/verify-i5-writing-ai-import.mjs`):
   - **Fixture test**: One synthetic fixture parses both application and continuation writing tasks.
   - **Missing application blocks publish**: Assert package builder throws `application_writing_missing`.
   - **Missing continuation blocks publish**: Assert package builder throws `continuation_writing_missing`.
   - **Missing continuation starters blocks publish**: Assert package builder throws (or the specific error is named in plan).
   - **No 范文/评分标准 leakage**: Assert packaged writing tasks contain no answer-analysis text matching 范文 or 评分标准 patterns.
   - **Six-family completeness**: Assert package with both writing tasks passes C7 validator.
   - **Non-regression**: I4 grammar-fill, I3 cloze, and C7 contract verifiers all pass.
   - **Allowed/forbidden scope**: `git diff --name-only` check matches allowed files, no forbidden files.

2. **Existing verifier non-regression**:
   - `node scripts/verify-i4-grammar-fill-ai-import.mjs`
   - `node scripts/verify-i3-cloze-ai-import.mjs`
   - `node scripts/verify-c7-paper-import-contracts.mjs`
   - `node scripts/verify-c7-paper-import-publish.mjs`

3. **Git check**: `git diff --check`

## Browser QA Matrix

| # | Case | Expected result |
| --- | --- | --- |
| 1 | Standard full paper with both writing tasks | Publish succeeds; QA links include 应用文 and 读后续写 |
| 2 | Missing application writing | UI preflight blocks save; server blocks publish with `application_writing_missing` |
| 3 | Missing continuation writing | UI preflight blocks save; server blocks publish with `continuation_writing_missing` |
| 4 | Continuation missing paragraph starters | Publish blocked; preview names missing starters |
| 5 | Answer-analysis DOCX contains 范文/评分标准 | Packaged writing surface does not include 范文/评分标准 text |
| 6 | Application QA link | A4 plain paper view with golden-sample answer box, no analysis card, no answers |
| 7 | Continuation QA link | Material + notes + two starters in box, golden-sample-like large answer box |
| 8 | Non-standard score/word count | Behavior per MF4 resolution (warning or block; not silent normalization) |
| 9 | Both writing tasks present, browser zoom 100% | Application and continuation pages render without overflow, clipping, or layout break |
| 10 | Browser zoom 90% | Same as above; answer boxes remain proportional |

## DEV Readiness

| Criterion | Status |
| --- | --- |
| Exact teacher action being improved | Yes — import standard Gaokao whole paper and confirm all six families |
| Exact before/after behavior | Yes — before: writing sections skipped; after: detected, packaged, QA-linked |
| Current cut boundary | Yes — detection, packaging, publish blocking, plain A4 views |
| Future-cut boundary | Yes — writing AI analysis, 范文, scoring, writing teaching workflows |
| Allowed files | Yes |
| Forbidden files | Yes |
| Verify scripts named | Yes (`verify-i5-writing-ai-import.mjs` plus non-regression suite) |
| Browser QA matrix | Yes |
| Open PO decisions ≤ 3 | No — 1 open PO decision (MF4), plus MF1-MF3 specification gaps to close first |
| Must Fix items resolved before DEV | No — 4 Must Fix items open |

DEV must not start until all 4 Must Fix items are resolved in `plan.md` and the `PA Follow-Up Decisions` table is populated.

## Open PO Decisions

1. **Non-standard writing behavior** (MF4): Warning vs. block for non-standard score/word-count. PO must decide the product behavior for papers that deviate from the standard 15-point/80-word and 25-point/150-word structure.

(1 open PO decision — within the ≤3 limit. Other Must Fix items are specification gaps, not PO decisions.)
