# I2 Plan — 七选五 AI 导题接入

## Cut Size

Medium.

Touches schema, data contract, product boundary, or teaching interpretation:
yes.

This cut touches a user-visible AI import runtime path and must preserve the
existing `seven-choices-analysis-v1` teaching contract. It must not change
schema or redesign PaperSurface.

## Objective

When the owner uploads one paper DOCX plus an optional answer-analysis DOCX in
`?view=paper-import-ai`, the existing one-click "解析字段" flow should analyze
Reading A-D and one standard 高考七选五 section together. Publishing should write
Reading and 七选五 into the same paper asset, include the seven-choices analysis
file, and expose the existing PaperSurface 七选五 QA entry. If the source paper
contains 七选五 but its answer key or analysis is missing, publishing must stop
instead of creating a silently incomplete paper asset.

## Locked Product Decisions

- I2 is a chain-completion cut for `paper-import-ai`, not a 七选五 experience
  redesign.
- The user still clicks one analysis button; internally the system may call
  separate Reading and 七选五 analysis builders.
- Reading A-D continues to use `reading-choice-analysis-v1`.
- 七选五 uses existing `seven-choices-analysis-v1`.
- Do not change 七选五 schema, contract, or prompt unless a real sample exposes a
  hard generation failure.
- If a source paper contains 七选五, 七选五 analysis is required before publish.
- 七选五 must use answer-analysis DOCX answers as the authority; AI does not
  independently set final answers.
- If answer-analysis DOCX does not provide the 七选五 answers, publishing is
  blocked.
- If AI output conflicts with the extracted 七选五 answers, publishing is
  blocked.
- I2 supports one standard 高考七选五 section only: 5 blanks, usually q36-q40,
  plus A-G option bank.
- Reading A-D and 七选五 must publish into the same paper asset.
- UI changes are minimal: status / preview / QA links only. No A-G redesign, no
  new PaperSurface interaction model.
- Cloze and grammar-cloze stay out of scope.

## PM Decisions From Grill

- User task: existing AI 导题 should "顺便也把七选五一起给导了".
- UX model: one-click analysis, internally multi-route provider calls.
- Failure model: if detected 七选五 fails, no incomplete publish.
- Answer model: official answer-analysis file constrains 七选五 final answers.
- Test model: 1 deep real-paper QA sample plus 2-3 smoke samples, not a 10-paper
  quality audit.
- Workflow model: 阿澈 owns PM / PA by default; no outside PA for this medium
  cut unless later risk changes.

## Must Do

### Step 1 — Parse 七选五 Section

- Extend the DOCX splitter to return a structured `sevenChoicesGroup` or
  equivalent field instead of only adding `seven_choices_deferred_to_i2` to
  `skipped`.
- Preserve existing Reading A-D parser behavior.
- Parse one standard 七选五 section:
  - 5 blank questions, usually 36-40
  - A-G option bank
  - passage paragraphs with blank positions preserved enough for prompt input
  - extracted answer labels from answer-analysis DOCX
- If a 七选五 section is detected but cannot be structured, return a clear skipped
  / error reason that blocks publish.

Verification standard:

- Existing I1 splitter checks still pass.
- New I2 verifier proves one fixture with Reading A-D plus 七选五 parses both
  families.
- New I2 verifier proves missing A-G option bank or missing 36-40 answers is
  observable and blocks publish.

### Step 2 — Analyze 七选五 Separately

- Add a 七选五 analysis builder, likely `server/paper-import-ai/analyzeSevenChoices.mjs`.
- Reuse current chat-completions provider seam and provider IDs.
- Build prompt input for one 七选五 group using existing
  `prompts/seven-choices-analysis-v1.md`.
- Validate the returned JSON against the existing contract expectations:
  `schemaVersion`, `paperId`, `targetGroups`, group entry, all q36-q40 question
  entries, exact paragraph references where applicable, and final answer
  consistency with extracted answers.
- Keep Reading analysis unchanged except where orchestration must call both
  builders.

Verification standard:

- Stubbed DeepSeek / GPT relay calls can produce valid 七选五 analysis.
- Non-JSON, wrong schema, missing question, wrong group, exact-quote mismatch,
  missing answer, and answer-conflict cases fail before publish.
- Reading retry behavior remains unchanged.

### Step 3 — Build One Paper Asset Package

- Extend `buildPaperImportAiPackageFiles` so it can package Reading A-D plus
  七选五 into the same C7 package.
- Paper asset output must include:
  - Reading A-D groups
  - one `seven_choices` group
  - q36-q40 question entries
  - A-G option bank or the existing paper-asset representation for 七选五 options
  - `answer-key.json` entries for q36-q40
  - `analyses/reading-choice-analysis-v1.json`
  - `analyses/seven-choices-analysis-v1.json`
- Keep `import-meta.json` within the existing schema. Do not add topic label or
  search metadata expansion.
- Publish must reuse the existing C7 validator / publisher path.

Verification standard:

- C7 validator accepts the generated package.
- Publish returns QA links for Reading A-D and 七选五.
- Missing seven-choices analysis blocks package build when the source paper
  detected 七选五.

### Step 4 — Minimal UI / Service Extension

- Keep one user action for analysis.
- Show Reading and 七选五 status in the preview.
- Show clear failure reason when 七选五 is detected but cannot be analyzed.
- After publish, show the 七选五 QA link together with Reading QA links.
- Do not redesign PaperSurface or 七选五 analysis panel.

Verification standard:

- Route verifier proves `paper-import-ai` still calls the same route family.
- Browser QA proves the owner can upload, analyze, publish, and open the
  七选五 QA link.

### Step 5 — Real Paper QA

- Use one real paper from `/Users/huangxuewei/Desktop/26年3月高三试卷` as the deep
  sample.
- Use 2-3 additional papers as smoke samples.
- Record only summary evidence in the PR; do not commit generated paper assets
  unless the owner explicitly asks for a fixture.

Verification standard:

- Deep sample: parse, analyze, publish, PaperSurface 七选五 route opens.
- Smoke samples: splitter and answer extraction do not regress.
- Generated local paper assets stay out of the PR unless intentionally promoted.

## Forbidden

- Do not change `schemas/**`.
- Do not change `shared/papersurface/**`.
- Do not change `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md`.
- Do not re-review q36-q40 fixture quality.
- Do not implement cloze or grammar-cloze import.
- Do not redesign PaperSurface UI, A-G option chips, highlight toggles, or
  seven-choices interaction.
- Do not add search integration, topic-label storage, or new metadata contracts.
- Do not silently publish a paper asset that omits 七选五 after detecting it.

## Suggested Files

- `server/paper-import-ai/docxSplitter.mjs`
- `server/paper-import-ai/analyzeSevenChoices.mjs`
- `server/paper-import-ai/analyzeReading.mjs`
- `server/paper-import-ai/packageBuilder.mjs`
- `server/paper-import-ai/routes.mjs`
- `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx`
- `app/src/features/paper-import-ai/paperImportAiWorkbench.css`
- `app/src/services/paperImportAi.ts`
- `scripts/verify-i2-seven-choices-ai-import.mjs`
- `scripts/README.md`

## Verification

- Targeted static:
  - `node scripts/verify-i2-seven-choices-ai-import.mjs`
  - `node scripts/verify-i1-paper-import-splitter.mjs`
  - `node scripts/verify-i1-paper-import-analysis.mjs`
  - `node scripts/verify-i1-paper-import-route.mjs`
  - `node scripts/verify-c7-paper-import-contracts.mjs`
  - `node scripts/verify-c7-paper-import-publish.mjs`
  - `node scripts/verify-i0e-seven-choices-entry.mjs`
  - `git diff --check`
- Full gate before PR ready:
  - `node scripts/verify-ci.mjs`
- Browser QA:
  - open `http://127.0.0.1:5173/?view=paper-import-ai`
  - upload one paper DOCX plus answer-analysis DOCX
  - click one analysis action
  - confirm Reading and 七选五 preview statuses
  - publish
  - open a 七选五 QA link in PaperSurface

## Browser QA Matrix

| Case | Expected result |
| --- | --- |
| Paper with Reading A-D + 七选五 + answer-analysis DOCX | One analysis action produces Reading and 七选五 preview; publish succeeds; QA links include 七选五 |
| Paper with 七选五 but missing 36-40 answers in answer file | Preview or publish blocks with a clear missing-answer message |
| 七选五 AI answer conflicts with answer file | Publish blocks with answer-conflict message |
| Paper with only Reading A-D | Existing Reading-only I1 flow still works |

## DEV Readiness

- Step 1 can start after this plan is committed.
- Step 2 depends on Step 1 producing stable七选五 parse input.
- Step 3 depends on Step 2 producing validated `seven-choices-analysis-v1`.
- Step 4 depends on route / package result shape being stable.
- Step 5 runs after targeted static verification passes.

## PA Notes

PA owner: 阿澈.

Verdict: ready for DEV after plan commit.

Must Fix before DEV: 0.

Should Watch:

- 七选五 splitter must not weaken Reading A-D parsing. Keep existing I1 splitter
  verifier in the required set.
- Do not put 七选五 into `skipped` after successfully structuring it. A detected
  but failed 七选五 should be a blocking state, not a quiet skip.
- The existing seven-choices prompt was written from a fixture package. If real
  imported paper shape differs, adapt the prompt input builder first; only edit
  the prompt if the prompt itself is demonstrably insufficient.
- `paper-asset-v1` already supports 七选五 fixtures; use existing shape rather
  than inventing a new schema.

Open PO decisions: 0.

Allowed / forbidden files: see sections above.

Static verify requirements: see `Verification`.

Browser QA required: yes, because the route is user-visible.

External PA: not used. This is a medium cut and current workflow makes 阿澈 the
default PA.

## PA Follow-Up Decisions

No PA Must Fix items.
