# I5-A Plan — 写作 AI 导题接入

## Cut Size

Medium.

Touches schema, data contract, product boundary, or teaching interpretation:
yes.

This cut touches the user-visible `paper-import-ai` runtime path, standard
whole-paper publish blocking, writing task data packaging, and A4 PaperSurface
display. It must not add writing AI analysis,范文,评分, or writing search/list
features.

## Objective

Extend `?view=paper-import-ai` so the one-click whole-paper import recognizes,
packages, publishes, and opens QA links for the two standard writing tasks:
应用文写作 and 读后续写. I5-A completes standard full-paper import after I1-I4:
Reading A-D, 七选五, 完形填空, 语法填空, 应用文写作, and 读后续写 must all be present
before a standard whole paper can publish. I5-A stops at 导题入库可视化.

## Locked Product Decisions

- I5-A only does writing task detection, packaging, publish blocking, and A4
  paper-view QA.
- Do not parse 范文, scoring standards, writing analysis, plot analysis, or AI
  writing feedback.
- Do not generate writing analysis JSON, writing prompt contracts, score cards,
  model comments, or teacher explanation panels.
- Write two independent writing tasks:
  - `application` for 应用文写作.
  - `continuation` for 读后续写.
- From I5-A onward, standard `paper-import-ai` publish requires six families:
  Reading A-D, 七选五, 完形填空, 语法填空, 应用文写作, and 读后续写.
- Missing either writing task blocks publish in both UI preflight and server
  package builder.
- Application and continuation QA links are plain paper views only. They show
  the writing task surface and answer boxes; no answers, no范文, no评分标准, no
  analysis card.
- Writing layout must imitate the golden sample, especially
  `docs/product/exam-paper-format-reference/images/page-11-writing-start.jpeg`
  and `docs/product/exam-paper-format-reference/images/page-12-continuation-box.jpeg`.
- Imported real papers are not formatting authority. Extract source-specific
  writing task content, but standard wording, score line, word-count line,
  notes, spacing, and answer boxes follow the golden sample.
- Application writing uses the golden-sample first-section shape: standard
  heading / score / instruction / content requirements / notes / one answer box.
- Continuation writing uses the golden-sample second-section shape: material
  text, standard continuation requirements, two paragraph starters, and one
  large answer box.
- If a source clearly deviates from the standard 15-point / 80-word application
  and 25-point / 150-word continuation structure, surface a warning or block for
  human review. Do not silently normalize a different task into a standard one.
- Deterministic splitter first. AI does not decide writing task type in I5-A.
- Non-standard but semantically clear writing structure may parse with warning.
  Structure that affects meaning blocks publish.
- Search/list optimization is out of I5-A.
- Default approach: do not change `shared/papersurface/**`. First add a writing
  paper-view adapter / harness branch. Only allow minimal shared PaperSurface
  changes if existing blocks cannot render answer boxes close to the golden
  sample, and PA must review that exception.

## Must Do

### Step 1 — Parse Writing Section

- Extend DOCX splitter to return a structured writing result containing:
  - one application writing task
  - one continuation writing task
  - observable writing parse warnings / errors
- Detect writing by golden-sample structure:
  - `第四部分 写作`
  - `第一节`
  - `第二节`
  - 15-point / 80-word application cue
  - 25-point / 150-word continuation cue
  - continuation material plus two paragraph starters
- Extract source-specific content:
  - application task scenario and content requirements
  - continuation material paragraphs
  - continuation paragraph starters
- Generate standard golden-sample套话 for score, word count, notes, and answer
  box placement instead of copying sloppy source formatting.
- Do not extract answer-analysis DOCX writing范文 or scoring standards.

Verification standard:

- New I5 verifier proves one fixture parses both writing tasks.
- Missing application blocks standard publish.
- Missing continuation blocks standard publish.
- Missing continuation starters blocks standard publish.
- No writing范文 /评分标准 text appears in packaged writing tasks.

### Step 2 — Build Writing Tasks Into Paper Asset

- Extend `paper-import-ai` package builder so the same paper asset includes:
  - application writing group / writing task
  - continuation writing group / writing task
  - `content.writingTasks` entries
  - `content.blocks` writing part, section headings, instructions, and answerBox
    blocks
  - QA-link-compatible group IDs and writing task IDs
- Use existing `paper-asset-v1` writing model if sufficient:
  `groupType: 'writing'`, `writingTaskId`, `writingTasks`, and `answerBox`.
- Do not change schema unless PA proves existing model cannot represent the
  golden sample.
- Enforce six-family publish completeness in package builder:
  `reading_group_missing`, `seven_choices_group_missing`,
  `cloze_group_missing`, `grammar_fill_group_missing`,
  `application_writing_missing`, `continuation_writing_missing`.

Verification standard:

- C7 validator accepts generated package.
- `paper-asset.json` contains two writing groups and two `writingTasks`.
- `content.blocks` includes writing answerBox blocks for both tasks.
- Existing I1-I4 objective-family behavior does not regress.

### Step 3 — Plain Paper Writing QA View

- Add minimal writing paper-view adapter / harness branch for `writing` groups.
- Application QA link opens the A4 writing surface for application writing.
- Continuation QA link opens the A4 writing surface for continuation writing.
- Display follows golden sample:
  - application box position, width, height, border, and spacing approximate
    page 11
  - continuation material and large answer box approximate pages 11-12
  - paragraph starters appear inside the continuation answer box
- Hide or empty analysis panel; no fake analysis state.
- Do not redesign PaperSurface or print / PDF layout.

Verification standard:

- Targeted verifier proves writing QA links are routable without writing
  analysis JSON.
- Browser QA proves both writing QA links open plain paper views.
- Visual QA compares against page 11 / page 12 golden sample.

### Step 4 — Workbench Preflight / Publish UI

- Keep one user action for whole-paper import analysis.
- Show writing status / preview in `?view=paper-import-ai`:
  - application detected / missing
  - continuation detected / missing
  - continuation starters detected / missing
  - warning for non-standard score / word-count structure
- Add publish checks and warnings for both writing tasks.
- Include two writing QA links after publish.

Verification standard:

- UI preflight blocks save when application or continuation is missing.
- Server still blocks missing writing even if UI is bypassed.
- Publish response includes writing QA links.

### Step 5 — Real Paper QA

- Use the golden sample writing pages as visual standard:
  - `docs/product/exam-paper-format-reference/images/page-11-writing-start.jpeg`
  - `docs/product/exam-paper-format-reference/images/page-12-continuation-box.jpeg`
- Use one real paper from `/Users/huangxuewei/Desktop/26年3月高三试卷` as the deep
  sample.
- Use 2-3 additional real papers as smoke samples if time permits.
- Do not commit generated `app/public/paper-assets/**` runtime outputs.

Verification standard:

- Deep sample: parse, publish, and open both writing QA links.
- Application / continuation pages look like formal exam paper writing pages,
  not web cards.
- No范文,评分标准, answers, or AI analysis leaks into student-facing paper view.

## Forbidden

- Do not add writing AI analysis,范文 generation, scoring, rubric parsing, or
  continuation plot analysis.
- Do not implement search/list optimization.
- Do not change `schemas/**` unless PA explicitly approves a model gap.
- Do not change `shared/papersurface/**` unless answerBox rendering is impossible
  through existing adapter/harness paths and PA approves minimal shared change.
- Do not redesign PaperSurface, print / PDF layout, or unrelated A4 surfaces.
- Do not commit generated `app/public/paper-assets/**`.
- Do not parse or publish answer-analysis DOCX范文 /评分标准 in I5-A.
- Do not silently publish a standard whole paper missing either writing task.

## Suggested Files

- `server/paper-import-ai/docxSplitter.mjs`
- `server/paper-import-ai/packageBuilder.mjs`
- `server/paper-import-ai/routes.mjs`
- `server/paper-import/publisher.mjs`
- `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx`
- `app/src/features/paper-import-ai/paperImportAiWorkbench.css`
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
- `app/src/features/paper-intelligence/writingPaperViewAdapter.ts`
- `app/src/services/paperImportAi.ts`
- `scripts/verify-i5-writing-ai-import.mjs`
- `scripts/README.md`

## Verification

- Targeted:
  - `node scripts/verify-i5-writing-ai-import.mjs`
  - `node scripts/verify-i4-grammar-fill-ai-import.mjs`
  - `node scripts/verify-i3-cloze-ai-import.mjs`
  - `node scripts/verify-c7-paper-import-contracts.mjs`
  - `node scripts/verify-c7-paper-import-publish.mjs`
  - `git diff --check`
- Full gate before PR ready:
  - `node scripts/verify-ci.mjs`
- Browser QA:
  - open `http://127.0.0.1:5173/?view=paper-import-ai`
  - upload one paper DOCX plus answer-analysis DOCX
  - confirm Reading / 七选五 / 完形 / 语法填空 / 应用文 / 读后续写 statuses
  - publish
  - open application writing QA link
  - open continuation writing QA link
  - compare page shape with golden sample writing pages

## Browser QA Matrix

| Case | Expected result |
| --- | --- |
| Standard full paper with both writing tasks | Publish succeeds; QA links include 应用文 and 读后续写 |
| Missing application writing | UI and server block publish with clear missing-writing message |
| Missing continuation writing | UI and server block publish with clear missing-writing message |
| Continuation missing paragraph starters | Publish blocks; preview names missing starters |
| Answer-analysis DOCX contains范文 /评分标准 | Packaged writing surface does not include范文 /评分标准 |
| Application QA link | A4 plain paper view with golden-sample answer box, no analysis card |
| Continuation QA link | Material + notes + two starters in box, golden-sample-like large answer box |
| Non-standard score / word count | Warning or human-review block; no silent semantic rewrite |

## DEV Readiness

- This plan must be committed before PA or DEV starts.
- 小川 writes PA to `docs/cuts/I5-writing-ai-import/pa.md`.
- 阿澈 compresses PA findings back into this `plan.md` before DEV.
- DEV can start only after PA Must Fix items are closed in `plan.md` or the
  owner explicitly accepts the risk in repo context.

## PA Follow-Up Decisions

Every PA Must Fix must map back to the checklist in `pa.md`. Big CR verifies
this table before treating the PA loop as closed.

| PA item | `pa.md` required disposition | `plan.md` handling | Status |
| --- | --- | --- | --- |
