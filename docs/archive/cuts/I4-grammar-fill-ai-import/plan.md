# I4-A Plan — 语法填空 AI 导题接入

## Cut Size

Medium.

Touches schema, data contract, product boundary, or teaching interpretation:
yes.

This cut touches the user-visible `paper-import-ai` runtime path, publish
blocking rules, paper asset packaging, and A4 paper display for grammar-fill. It
must not change schemas or add AI grammar analysis fields.

## Objective

Extend `?view=paper-import-ai` so the one-click whole-paper import parses,
normalizes, packages, publishes, and opens a QA link for one standard 高考语法填空
section. From I4-A onward, publishing a standard objective paper requires all
four objective families to be present and complete: Reading A-D, 七选五, 完形填空,
and 语法填空. I4-A stops at 导题入库可视化; it does not produce grammar analysis,
语法点讲解, or writing-task import.

## Locked Product Decisions

- I4-A only does 语法填空导题、入库、可视化打通.
- Do not add AI grammar analysis fields, grammar-point diagnosis, explanation
  cards, highlights, or `analyses/grammar-fill-*.json`.
- The user still clicks one analysis action for the whole paper import flow.
- Support one standard 高考语法填空 section only: q56-q65, 10 blanks.
- Prompt words in parentheses are structured as `blank.prompt` when present.
- Blanks without prompt words are allowed.
- The answer-analysis DOCX is authoritative for q56-q65 final answers.
- Missing or conflicting q56-q65 answers block publish.
- From I4-A onward, publish requires Reading A-D, 七选五, 完形填空, and 语法填空.
  Missing any one of those four objective families blocks publish.
- Four-family completeness is enforced in the `paper-import-ai` package builder
  before publish. This blocks new standard AI-import packages only; existing
  paper assets with three objective families remain readable and are not
  retroactively migrated by I4-A.
- Missing-family errors use stable codes:
  `reading_group_missing`, `seven_choices_group_missing`,
  `cloze_group_missing`, and `grammar_fill_group_missing`. Grammar-fill
  structural / answer errors use stable codes such as
  `grammar_fill_blank_count_invalid`, `grammar_fill_answer_missing`, and
  `grammar_fill_answer_conflict`.
- Writing tasks are out of I4-A and will be handled by a future I5 cut.
- Do not change `paper-asset-v1` schema; use the existing `grammarFill` group
  model.
- Search/list optimization is not an I4-A acceptance criterion.
- 语法填空 QA link means plain paper view: show the passage, q56-q65 blanks, and
  prompt words. It does not show answers, analysis cards, evidence lines, or
  highlights.
- Imported real papers are not formatting authority. Preserve semantic content
  while normalizing formatting toward `docs/product/exam-paper-format-standards.md`
  and `docs/product/exam-paper-format-reference/`.
- Grammar-fill populates both `group.blankIds` and `content.blanks` for q56-q65.
  Each question has `blankId`; each blank entry has `blankId`, `groupId`,
  `questionId`, and optional `prompt`. `prompt` is the raw source prompt word
  after trimming outer parentheses and normalizing whitespace; preserve spelling
  and case. Do not invent character offsets in I4-A; omit `position` unless a
  safe existing schema-compatible value is already available.

## Must Do

### Step 1 — Parse Grammar-Fill Section

- Extend the DOCX splitter to return a structured `grammarFillGroup` or
  equivalent result for one standard 语法填空 section.
- Preserve existing Reading A-D, 七选五, and 完形 parsing behavior.
- Detect grammar-fill by structure:
  - q56-q65 range
  - 10 inline blanks
  - optional prompt words in parentheses
  - usually under the second section of `语言知识运用` / `语言运用`
- Parse:
  - passage paragraphs / text blocks with q56-q65 blank positions preserved
  - 10 blank entries, q56-q65
  - `blank.prompt` when a prompt word exists
  - extracted answer labels / answer strings from the answer-analysis DOCX
- Add a grammar-fill answer parser for actual-word answers. Do not reuse the
  A-G answer-range parser as the only parser for q56-q65. Supported answer key
  shapes include individual lines (`56. was`), compact continuous lines, and
  answers with spaces (`57. has given`, `63. looking`). Strip trailing Chinese
  explanation text, but preserve meaningful English answer text.
- Real answer-analysis example observed in
  `/Users/huangxuewei/Desktop/26年3月高三试卷/26.3四川成都七中高三二诊英语答案解析.docx`:
  `56. were worn 57. has given 58. over 59. what 60. attractions 61. adapted
  62. gently 63. looking 64. a 65. where`.
- Return observable blocking errors for missing grammar-fill section,
  detected-but-incomplete grammar-fill structure, missing prompts only when the
  prompt is required by source shape, missing answers, or answer conflicts.

Verification standard:

- Existing I1 / I2 / I3 parser checks still pass.
- New I4 verifier proves one fixture with Reading + 七选五 + 完形 + 语法填空 parses
  all four objective families.
- New I4 verifier proves a missing grammar-fill section blocks publish.
- New I4 verifier proves missing q56-q65 answers, wrong blank count, and answer
  conflicts are observable blocking states.
- New I4 verifier proves grammar-fill answer extraction from answer-analysis
  DOCX with actual-word answers, not only single-letter objective answers.

### Step 2 — Deterministic Formatting Normalization

- Add grammar-fill normalization after structural split and before package build.
- Normalize only deterministic, low-risk formatting:
  - q56-q65 blank style with two spaces before and after the number
  - prompt-word parentheses and spacing
  - basic English punctuation spacing
  - question / blank number formatting
- Do not use AI to rewrite grammar-fill passage text in I4-A.
- Do not change semantic punctuation or word content.
- If normalization may change meaning, block or surface a warning for human
  review instead of silently changing content.

Verification standard:

- New I4 verifier includes deterministic normalization cases for blank spacing,
  prompt spacing, and punctuation spacing.
- The normalized package still preserves source text meaning and answer mapping.

### Step 3 — Build One Complete Objective Paper Asset

- Extend the paper-import AI package builder so the same paper asset includes:
  - Reading A-D groups
  - one 七选五 group
  - one 完形 group
  - one `grammarFill` group
  - q56-q65 blank/question entries
  - prompt words on blanks when present
  - `answer-key.json` entries for q56-q65
- Enforce publish blocking for any missing objective family:
  Reading A-D, 七选五, 完形填空, or 语法填空.
- Build and verify `content.blanks` entries for every q56-q65 blank, matching
  `group.blankIds` order and each question's `blankId`.
- Do not require or generate grammar-fill analysis files.
- Keep `import-meta.json` within the existing schema and current visualization
  contract.

Verification standard:

- C7 validator accepts the generated package.
- Publish stores the grammar-fill group and q56-q65 answers in the same asset
  version.
- Missing grammar-fill analysis does not block because grammar analysis is not
  part of I4-A.
- Missing any required objective family blocks publish.
- Existing three-family assets remain readable; I4-A blocking applies to new
  standard `paper-import-ai` publish attempts.

### Step 4 — Minimal UI / Service Extension

- Keep one user action for the import analysis flow.
- Show a minimal 语法填空 status / preview / blocking-error state in
  `?view=paper-import-ai`.
- Preview should show:
  - detected q56-q65
  - `10 / 10` blanks
  - `10 / 10` answers
  - prompt count and no-prompt count
  - deterministic normalization status
- After publish, include a 语法填空 QA link together with Reading / 七选五 / 完形
  QA links.
- In `publisher.mjs`, add a `getGrammarFillGroups` helper equivalent to
  `getClozeGroups`, and wire grammar-fill groups into `buildQaLinks` with both
  latest and version hrefs.
- The target is:
  `?view=paper-intelligence&source=paper-asset&surface=paper&groupId=<grammarFillGroupId>&questionId=<q56Id>`.
- The QA link opens a plain paper view. Expected visible content:
  - grammar-fill passage text
  - q56-q65 blanks
  - prompt words
  - no answers, no analysis card, no evidence lines, no AI explanation
- Add a minimal display-only `grammarFillPaperViewAdapter.ts` and route
  `grammarFill` groups to it from the harness. This is required, not
  conditional: grammar-fill has no analysis JSON in I4-A. Do not create a
  grammar analysis model.

Verification standard:

- Route/service verifier proves the import flow returns grammar-fill status and
  publish links without regressing existing responses.
- Targeted verifier proves the 语法填空 QA link is routable and does not depend on
  `analyses/grammar-fill-*.json`.
- Targeted verifier proves publisher QA links include the grammar-fill group.
- Browser QA proves the owner can upload, parse, publish, and open the
  grammar-fill QA route from the published result.

### Step 5 — Real Paper QA

- Use one real paper from `/Users/huangxuewei/Desktop/26年3月高三试卷` as the deep
  sample.
- Use 2-3 additional real papers as smoke samples.
- Record summary evidence in the PR.
- Do not commit generated `app/public/paper-assets/**` unless the owner
  explicitly promotes a fixture.

Verification standard:

- Deep sample: parse, publish, and open the grammar-fill plain paper route with
  passage, blanks, and prompts visible.
- Smoke samples: objective-family completeness, splitter, normalization, and
  answer extraction do not regress.
- Local generated paper assets stay out of the PR by default.

## Forbidden

- Do not change `schemas/**`.
- Do not add grammar-fill AI analysis prompt, schema, contract, verifier, or
  panel.
- Do not implement writing task import in I4-A.
- Do not change `shared/papersurface/**` unless the minimal grammar-fill
  paper-asset adapter proves the shared renderer cannot display existing
  grammar-fill group data.
- Do not redesign PaperSurface, print / PDF layout, or search/list UI.
- Do not add topic-label, search metadata, grammar-point metadata, or teaching
  analysis expansion.
- Do not commit generated `app/public/paper-assets/**` runtime outputs.
- Do not silently publish a paper asset missing any of the four objective
  families.

## Suggested Files

- `server/paper-import-ai/docxSplitter.mjs`
- `server/paper-import-ai/packageBuilder.mjs`
- `server/paper-import-ai/routes.mjs`
- `server/paper-import/publisher.mjs`
- `server/paper-import/validator.mjs`
- `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx`
- `app/src/features/paper-import-ai/paperImportAiWorkbench.css`
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
- `app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts`
- `app/src/services/paperImportAi.ts`
- `scripts/verify-i4-grammar-fill-ai-import.mjs`
- `scripts/README.md`

## Verification

- Targeted:
  - `node scripts/verify-i4-grammar-fill-ai-import.mjs`
  - `node scripts/verify-i3-cloze-ai-import.mjs`
  - `node scripts/verify-i2-seven-choices-ai-import.mjs`
  - `node scripts/verify-c7-paper-import-contracts.mjs`
  - `node scripts/verify-c7-paper-import-publish.mjs`
  - `git diff --check`
- Full gate before PR ready:
  - `node scripts/verify-ci.mjs`
- Browser QA:
  - open `http://127.0.0.1:5173/?view=paper-import-ai`
  - upload one paper DOCX plus answer-analysis DOCX
  - click the existing analysis action
  - confirm Reading / 七选五 / 完形 / 语法填空 statuses
  - publish
  - open the 语法填空 QA link in PaperSurface / paper-intelligence
  - confirm the grammar-fill page is a plain paper view with no answers or
    grammar analysis card

## Browser QA Matrix

| Case | Expected result |
| --- | --- |
| Paper with Reading A-D + 七选五 + 完形 + 语法填空 + answer-analysis DOCX | One analysis action produces all supported previews; publish succeeds; QA links include 语法填空 |
| Paper missing 语法填空 | Publish blocks with a clear missing-family message |
| Paper with detected 语法填空 but not q56-q65 / not 10 blanks | Preview or publish blocks with a clear structure message |
| Paper with q56-q65 but missing answers | Publish blocks with missing-answer message for specific questions |
| Paper with answer conflict between structure and answer-analysis DOCX | Publish blocks with answer-conflict message |
| Paper missing Reading / 七选五 / 完形 after I4-A | Publish blocks with a clear missing-family message |
| Grammar-fill QA link opens in PaperSurface | Passage text visible with q56-q65 blanks rendered; no answers, no analysis card, no evidence lines |
| Grammar-fill group has missing / zero passage paragraphs | Harness shows a graceful error or empty state, not a React crash |

## DEV Readiness

- This plan must be committed before PA or DEV starts.
- 小川 writes PA to `docs/cuts/I4-grammar-fill-ai-import/pa.md`.
- 阿澈 compresses PA findings back into this `plan.md` before DEV.
- DEV can start only after PA Must Fix items are either resolved in `plan.md` or
  explicitly accepted by the owner.

## PA Follow-Up Decisions

Every PA Must Fix must map back to the checklist in `pa.md`. Big CR verifies
this table before treating the PA loop as closed.

| PA item | `pa.md` required disposition | `plan.md` handling | Status |
| --- | --- | --- | --- |
| MF1 | Specify publish blocking layer, error codes, and 3-family compatibility | Enforce four-family completeness in `paper-import-ai` package builder with stable missing-family codes; existing 3-family assets remain readable | Closed |
| MF2 | Specify q56-q65 answer-analysis format with real example | Added actual-word answer parser requirement and real 成都七中 answer-analysis example | Closed |
| MF3 | Make grammar-fill PaperSurface adapter unconditional | Step 4 now requires `grammarFillPaperViewAdapter.ts` and harness branch | Closed |
| MF4 | Wire grammar-fill into publisher QA links | Step 4 now requires `getGrammarFillGroups` and `buildQaLinks` wiring | Closed |
| MF5 | Define grammar-fill blanks population contract | Locked `group.blankIds`, question `blankId`, and `content.blanks` field semantics; no invented offsets in I4-A | Closed |
