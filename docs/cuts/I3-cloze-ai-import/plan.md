# I3-A Plan — 完形填空 AI 导题接入

## Cut Size

Medium.

Touches schema, data contract, product boundary, or teaching interpretation:
yes.

This cut touches the user-visible `paper-import-ai` runtime path and the paper
asset package shape for an existing question family. It must not change schemas
or add AI cloze analysis fields.

## Objective

When the owner uploads one paper DOCX plus an optional answer-analysis DOCX in
`?view=paper-import-ai`, the existing one-click "解析字段" flow should parse and
publish Reading A-D, 七选五, and one standard 高考完形填空 section together.
Publishing should write 完形 into the same paper asset, include q41-q55 answer
keys from the answer-analysis DOCX, and expose a 完形 QA link that opens a plain
paper view in the current PaperSurface / paper-intelligence route. I3-A stops
at 导题入库可视化; it does not produce cloze teaching analysis.

## Locked Product Decisions

- I3-A only does 完形导题、入库、可视化打通.
- 完形 AI 解析字段、讲评面板、教学质量雕琢 are out of this cut.
- The user still clicks one analysis action for the whole paper import flow.
- Support one standard 高考完形填空 section only: q41-q55, 15 blanks, A-D options.
- The paper DOCX provides passage text, blank/question positions, and A-D options.
- The answer-analysis DOCX is authoritative for q41-q55 final answers.
- Missing any q41-q55 answer blocks publish.
- If paper text / structure contains answers and they conflict with the
  answer-analysis DOCX, publish is blocked.
- If a cloze section is detected but cannot be fully parsed, publish is blocked
  with a clear error.
- If no cloze section is detected, existing Reading / 七选五 import behavior
  continues and cloze absence does not block publish.
- Do not change `paper-asset-v1` schema; use the existing `cloze` group model.
- Search/list optimization is not an I3-A acceptance criterion.
- 完形 QA link means plain paper view: show cloze passage, q41-q55 blanks, and
  A-D options. It does not show a 完形解析 card, evidence lines, or highlights.

## Must Do

### Step 1 — Parse Cloze Section

- Extend the DOCX splitter to return a structured `clozeGroup` or equivalent
  result for one standard 完形填空 section.
- Preserve existing Reading A-D and 七选五 parsing behavior.
- Detect cloze by structure, not by the word "完形": q41-q55 range plus A-D
  option lines is the primary signal. `语言知识运用` / `语言运用` is only a broad
  part heading; within that part, 第一节 with 15 q41-q55 A-D items is cloze and
  第二节 with q56-q65 blanks is grammar-cloze.
- Parse:
  - passage paragraphs / text blocks with q41-q55 blank positions preserved
  - 15 question entries, q41-q55
  - A-D options for every question
  - extracted answer labels from the answer-analysis DOCX
- Cloze option parsing must handle both common formats:
  - tab-separated inline rows such as
    `41. A. ...\tB. ...\tC. ...\tD. ...`
  - multi-line option blocks where A-D markers may be split across lines
- The parser must separate cloze passage text from option rows even when mammoth
  output interleaves passage paragraphs, inline blanks, and the q41-q55 option
  block.
- Return observable blocking errors for detected-but-incomplete cloze structure,
  missing options, missing answers, or answer conflicts.

Verification standard:

- Existing I1 / I2 splitter checks still pass.
- New I3 verifier proves one fixture with Reading + 七选五 + 完形 parses all
  supported families.
- New I3 verifier proves missing q41-q55 answers, missing A-D options, and
  answer conflicts are observable blocking states.
- New I3 verifier proves a paper with no cloze can still follow the existing
  Reading / 七选五 path.
- New I3 verifier proves a `语言知识运用` part with q41-q55 A-D option rows is
  detected as cloze without requiring a "完形" keyword.

### Step 2 — Build One Paper Asset Package

- Extend the paper-import AI package builder so the same paper asset can include
  Reading A-D, 七选五, and 完形 groups.
- Paper asset output must include:
  - one `cloze` group when cloze is present
  - q41-q55 question entries
  - q41-q55 blank/question associations
  - A-D options on each cloze question
  - `answer-key.json` entries for q41-q55
  - layout/content blocks that let PaperSurface render the cloze section
- Do not require or generate `analyses/cloze-*.json`.
- Keep `import-meta.json` within the existing schema and current visualization
  contract.

Verification standard:

- C7 validator accepts the generated package.
- Publish stores the cloze group and q41-q55 answers in the same asset version.
- Missing cloze analysis does not block because cloze analysis is not part of
  I3-A.
- Detected but incomplete cloze data still blocks publish.

### Step 3 — Minimal UI / Service Extension

- Keep one user action for the import analysis flow.
- Show a minimal 完形 status / preview / blocking-error state in
  `?view=paper-import-ai`.
- After publish, include a 完形 QA link together with Reading / 七选五 QA links.
  The target is
  `?view=paper-intelligence&source=paper-asset&surface=paper&groupId=<clozeGroupId>&questionId=<q41Id>`.
- The 完形 QA link opens a plain paper view. Expected visible content:
  - cloze passage text with q41-q55 blanks
  - q41-q55 question numbers
  - A-D options for every cloze question
  - no right-side cloze analysis card, no evidence lines, no AI explanation
- If current paper-intelligence paper-asset adapters reject cloze groups, add a
  minimal cloze paper-asset surface adapter / branch in the harness. Keep it
  display-only and do not create a cloze analysis model.
- Do not add a cloze AI analysis button.
- Do not redesign PaperSurface or paper-intelligence.

Verification standard:

- Route/service verifier proves the import flow returns cloze status and publish
  links without regressing existing responses.
- Browser QA proves the owner can upload, parse, publish, and open a 完形 QA
  route from the published result.
- Targeted verifier proves the 完形 QA link is routable and does not depend on
  `analyses/cloze-*.json`.

### Step 4 — Real Paper QA

- Use one real paper from `/Users/huangxuewei/Desktop/26年3月高三试卷` as the deep
  sample.
- Use 1-2 additional real papers as smoke samples if the first sample exposes no
  parser edge.
- Record summary evidence in the PR.
- Do not commit generated `app/public/paper-assets/**` unless the owner
  explicitly promotes a fixture.

Verification standard:

- Deep sample: parse, publish, PaperSurface / paper-intelligence 完形 plain paper
  route opens with passage, blanks, and A-D options visible.
- Smoke samples: splitter and answer extraction do not regress.
- Local generated paper assets stay out of the PR by default.

## Forbidden

- Do not change `schemas/**`.
- Do not add a cloze AI analysis prompt, schema, contract, verifier, or panel.
- Do not implement grammar-cloze / 语法填空 import in this cut.
- Do not change `shared/papersurface/**` unless the minimal cloze paper-asset
  adapter proves the shared renderer cannot display existing cloze group data.
- Do not redesign PaperSurface, print / PDF layout, or search/list UI.
- Do not add topic-label, search metadata, or teaching-analysis expansion.
- Do not commit generated `app/public/paper-assets/**` runtime outputs.
- Do not silently publish a paper asset that omits cloze after detecting it.

## Suggested Files

- `server/paper-import-ai/docxSplitter.mjs`
- `server/paper-import-ai/packageBuilder.mjs`
- `server/paper-import-ai/routes.mjs`
- `server/paper-import/publisher.mjs`
- `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx`
- `app/src/features/paper-import-ai/paperImportAiWorkbench.css`
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
- `app/src/features/paper-intelligence/*cloze*Adapter.ts`
- `app/src/features/paper-intelligence/paperIntelligenceRoute.ts`
- `app/src/services/paperImportAi.ts`
- `server/search/paperSurfaceAvailability.mjs`
- `scripts/verify-i3-cloze-ai-import.mjs`
- `scripts/README.md`

## Verification

- Targeted:
  - `node scripts/verify-i3-cloze-ai-import.mjs`
  - `node scripts/verify-i1-paper-import-splitter.mjs`
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
  - confirm Reading / 七选五 / 完形 statuses
  - publish
  - open the 完形 QA link in PaperSurface / paper-intelligence
  - confirm the cloze page is a plain paper view with no 完形解析 card

## Browser QA Matrix

| Case | Expected result |
| --- | --- |
| Paper with Reading A-D + 七选五 + 完形 + answer-analysis DOCX | One analysis action produces all supported previews; publish succeeds; QA links include 完形 |
| Paper with detected 完形 but missing q41-q55 answers | Preview or publish blocks with a clear missing-answer message |
| Paper with cloze but answer DOCX has only q41-q45 | Publish blocks with missing-answer message for q46-q55 |
| Paper with detected 完形 but missing A-D options | Preview or publish blocks with a clear structure message |
| Paper with answer conflict between structure and answer-analysis DOCX | Publish blocks with answer-conflict message |
| Paper with Reading / 七选五 but no 完形 | Existing import path still works; no cloze block |

## DEV Readiness

- This plan must be committed before PA or DEV starts.
- 小川 writes PA to `docs/cuts/I3-cloze-ai-import/pa.md`.
- 阿澈 compresses PA findings back into this `plan.md` before DEV.
- DEV can start only after PA Must Fix items are either resolved in `plan.md` or
  explicitly accepted by the owner.

## PA Follow-Up Decisions

Every PA Must Fix must map back to the checklist in `pa.md`. Big CR verifies
this table before treating the PA loop as closed.

| PA item | `pa.md` required disposition | `plan.md` handling | Status |
| --- | --- | --- | --- |
| `MF-1` | Step 1 must define cloze detection without relying on the "完形" keyword. | Step 1 now requires q41-q55 range plus A-D option-line detection, and distinguishes 第一节 cloze from 第二节 grammar-cloze under `语言知识运用`. | Closed |
| `MF-2` | Step 1 must define cloze option parsing for tab-separated inline rows and multi-line option blocks. | Step 1 now requires both option formats and passage/option separation when DOCX output interleaves them. | Closed |
| `MF-3` | Step 3 must define what the 完形 QA link opens and how cloze renders. | Step 3 now defines a paper-intelligence paper-asset plain paper view, allows only a minimal display-only cloze adapter if needed, and forbids cloze analysis UI. | Closed |
