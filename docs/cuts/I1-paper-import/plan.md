# I1 Plan — Paper Import Workbench (DOCX → Reading Analysis Preview → Save)

## Cut Size

Medium.

Touches data contract (new DOCX-to-normalized-import-candidates shape between
server parser and the I1 UI), product boundary (new owner-only route alongside
existing C7 paper-import), and external API boundary (new outbound calls to
DeepSeek `deepseek-v4-pro` and OpenAI `gpt-5.5`). Does not change existing
analysis JSON contracts, existing prompts, PaperSurface UI, or the C7 package
validate/publish/revalidate workflow.

## Objective

Replace the current "copy passage out of DOCX → paste into chat → save JSON by
hand" workflow with an owner-only local workbench that takes a full test paper
DOCX, picks out the **阅读理解 (Reading A-D)** sections, runs the existing
`reading-choice-analysis-v1` prompt via an external LLM API, previews the
resulting JSON candidate, and lets the owner save/merge it into the active
PaperSurface paper-asset base.

V0 audience is the owner alone. Not a teacher self-service product (that
would be the C7 / 层二 cut, which already owns a separate package import
workflow at `?view=paper-import` and `/api/paper-import/*`).

**七选五 is explicitly deferred to a future I2 cut** because the current
`prompts/seven-choices-analysis-v1.md` is contractually a file-download
prompt and cannot be driven from a server API call without prompt edits PM
does not want to make in I1.

## Locked Product Decisions (post-PA)

- Scope: **阅读理解 only** (Reading A-D). 七选五 explicitly deferred.
- Input: a full test paper DOCX (one file = one paper). No PDF, no plain
  text, no image input in I1.
- Parsing location: **server-side**. Browser uploads one DOCX as multipart
  bytes; server parses in memory with `mammoth` (Node) and never persists
  the raw DOCX. Frontend does not run a DOCX parser.
- Parser strategy: local rules only (heading match, numbering match, section
  markers). No LLM fallback for splitting. Sections the parser cannot
  classify go into `skipped` with a deterministic `reason`; the owner
  inspects them manually.
- Step 1 output shape (normalized import candidates, not raw text only):
  - paper candidate: `paperId`, source filename/hash, section markers.
  - reading groups: `groupId`, title/order, paragraph IDs/text, question
    IDs, stems, A-D options, `answerKey` entries.
  - skipped items: raw snippet plus deterministic reason.
- Save semantics: preview first; nothing lands on disk until the owner
  clicks save per group.
- UI entry: new **owner-only** route `?view=paper-import-ai`. Server API
  prefix `/api/paper-import-ai/*`. Distinct from the existing C7 package
  workflow.
- External API providers: **DeepSeek `deepseek-v4-pro`** and **OpenAI
  `gpt-5.5`**. Default is `deepseek-v4-pro` (reuses existing
  `DEEPSEEK_API_KEY` and request helper). `gpt-5.5` requires a new
  server-owned OpenAI adapter and `OPENAI_API_KEY` env path, owned by the
  I1 analyze module or a small shared `server/ai-providers/` module.
- Prompt reuse: 阅读理解 uses `prompts/reading-choice-analysis-v1.md`
  through an I1 API prompt builder. The splitter must first normalize raw
  DOCX section text into paper-asset-like group content (paragraph
  IDs/text, question IDs, stems, options, `answerKey`) so the prompt has
  the structured input it expects. The existing
  `POST /api/question-groups/:id/reading-parse` flow and
  `DEEPSEEK_READING_PARSE_PROMPT` are for difficulty parsing and are NOT
  reused for I1 reviewed-analysis files.
- Save target & merge:
  - file: `analyses/reading-choice-analysis-v1.json`.
  - active base resolution: `app/public/paper-assets/<paperId>/latest/`
    if present, otherwise `app/public/paper-assets/<paperId>/`. Never
    mutate `versions/vN/` from per-group save.
  - merge behavior: refuse to overwrite an existing `groups[groupId]`
    unless `confirmOverwrite: true`; preserve all unrelated
    groups/questions in the same aggregate file; validate `paperId`,
    `sourceAssetVersion`, `targetGroups`, group IDs, question IDs,
    paragraph IDs, and answer-key coverage before writing.
- Out of scope for I1: 七选五 analysis, directory watching, batch queues,
  background daemons, re-runs / retries, version diffing, multi-user, auth,
  deploy, any change to C7 paper-import.

## Must Do (Step-by-Step)

Sequential. Do not start Step N+1 until Step N's verification passes for at
least 3 representative owner-supplied DOCX papers.

### Step 1 — Reading Splitter (local, no LLM)

- New server endpoint: `POST /api/paper-import-ai/parse`.
- Input: multipart DOCX upload, in-memory parsing with `mammoth`.
- Output JSON shape:
  ```
  {
    "paper": { "paperId": "...", "sourceFilename": "...", "sourceHash": "..." },
    "readingGroups": [
      {
        "groupId": "...",
        "title": "...",
        "order": 0,
        "paragraphs": [{ "id": "...", "text": "..." }],
        "questions": [
          { "id": "...", "stem": "...",
            "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
            "answerKey": "A" }
        ]
      }
    ],
    "skipped": [{ "rawText": "...", "reason": "..." }]
  }
  ```
- No LLM call. Pure heading / numbering / regex rules. False positives
  (calling non-Reading content Reading) are blocking; false negatives that
  land in `skipped` are acceptable.

### Step 2 — `?view=paper-import-ai` Page Skeleton (no LLM)

- New route / view: `?view=paper-import-ai`. Drag a DOCX → POST to Step 1
  endpoint → display returned reading groups grouped by group title with
  paragraph + question preview; show `skipped` panel separately.
- No `Analyze` button yet, no API calls beyond Step 1.
- Page is visibly distinct from the existing C7 `?view=paper-import`
  package import UI (different heading, owner-only label, separate styles).

### Step 3 — External API Call + JSON Preview

- Per identified reading group, add an `Analyze` button.
- Server endpoint: `POST /api/paper-import-ai/analyze` accepts the
  normalized group content + provider id, dispatches to a provider adapter,
  returns parsed JSON matching `reading-choice-analysis-v1` top-level
  shape (`schemaVersion`, `paperId`, `sourceAssetVersion`, `targetGroups`,
  `groups`, `questions`).
- Provider adapters:
  - `deepseek-v4-pro` — reuses existing `DEEPSEEK_API_KEY` and request
    helper in `server/api.mjs` or its successor.
  - `gpt-5.5` — new server-owned OpenAI adapter reading `OPENAI_API_KEY`.
    Place under `server/ai-providers/openai.mjs` (or beside the existing
    DeepSeek code if cleaner). Adapter must be testable with stub key.
- Provider selection: page-level radio/dropdown, default `deepseek-v4-pro`.
- No save yet.

### Step 4 — Save / Merge into paper-assets

- Each previewed group has a `Save` button → `POST
  /api/paper-import-ai/save` writes/merges the group analysis into the
  active reading-choice analysis file (see "Save target & merge" above).
- Server uses or extends `resolvePaperAssetReadPaths()` so the I1 save path
  is not forced through the reading-only hard-coded `analysisPath` in the
  current C7 storage module. If extending it is risky, write a small I1
  resolver instead.
- Save endpoint refuses overwrite unless `confirmOverwrite: true`.

## Forbidden

- Do not modify `prompts/reading-choice-analysis-v1.md` or any other
  reviewed prompt.
- Do not change `seven-choices-analysis-v1` JSON contract or prompt (七选五
  is deferred to I2, not touched here).
- Do not change `reading-choice-analysis-v1` JSON contract or any analysis
  JSON shape consumed by PaperSurface.
- Do not modify `shared/papersurface/**`, `app/src/domain/**`,
  `schemas/**`, or any `*Adapter.ts`.
- Do not touch existing C7 paper-import behavior:
  - do not remove or modify `/api/paper-import/validate`,
    `/api/paper-import/publish`, or `/api/paper-import/revalidate-latest`.
  - do not break `?view=paper-import` package validation/publish.
  - do not splice I1 controls into `PaperImportWorkbench.tsx`.
- Do not call Sonnet 4.6 from this cut.
- Do not introduce batch / directory-watch / queue infrastructure.
- Do not introduce 七选五 analyze/save paths in I1 (deferred to I2).
- Do not commit copyrighted full passages or raw external model output
  into fixtures.
- Do not store API keys in repo or fixtures.

## Suggested Files (adjust during DEV)

- `server/paper-import-ai/docxSplitter.mjs` (new): Step 1.
- `server/paper-import-ai/analyzeReading.mjs` (new): Step 3 dispatcher.
- `server/paper-import-ai/saveReading.mjs` (new): Step 4 file writer.
- `server/paper-import-ai/routes.mjs` (new) wired in `server/api.mjs`:
  `/api/paper-import-ai/parse`, `/analyze`, `/save`.
- `server/ai-providers/openai.mjs` (new): GPT-5.5 adapter.
- `server/ai-providers/deepseek.mjs` (extracted or new): cleaner reuse of
  existing DeepSeek call. Only if extraction is cheap; otherwise inline.
- `server/package.json` / `server/package-lock.json`: add `mammoth` and any
  OpenAI SDK dependency.
- `app/src/features/paper-import-ai/` (new directory): route view, drop
  zone, group list, preview, provider picker.
- `app/src/App.tsx` (or route registry): register `?view=paper-import-ai`.
- `app/src/services/paperImportAi.ts` (new): client calls.
- `scripts/verify-i1-paper-import-splitter.mjs` (new): Step 1 verifier.
- `scripts/verify-i1-paper-import-route.mjs` (new): Step 2 verifier.
- `scripts/verify-i1-paper-import-analysis.mjs` (new): Step 3 verifier
  with stubbed provider adapters.
- `scripts/verify-i1-paper-import-save.mjs` (new): Step 4 verifier with
  merge semantics.
- `scripts/README.md`: index updates.
- `test-fixtures/paper-import-ai/`: synthetic/owner-cleared fixtures only.
- This cut directory for PA / CR / cut-note files.

## Verification

Required before each step's commit:

- Step 1:
  - `node --check server/api.mjs`
  - `node scripts/verify-i1-paper-import-splitter.mjs`
  - synthetic DOCX fixture + deterministic cases for section headings,
    A-D reading groups, skipped sections, false-positive rejection.
- Step 2:
  - `node scripts/verify-i1-paper-import-route.mjs`
  - `npm run build --prefix app`
- Step 3:
  - `node scripts/verify-i1-paper-import-analysis.mjs`
  - stub both provider adapters; no real API key needed for static tests.
  - assert output matches `reading-choice-analysis-v1` top-level shape.
- Step 4:
  - `node scripts/verify-i1-paper-import-save.mjs`
  - assert active base resolution (`latest/` vs root), overwrite refusal,
    merge-preserve behavior.
  - run cross-checks when final layout is touched:
    `node scripts/verify-c7-paper-import-publish.mjs` (regression),
    `node scripts/verify-paper-asset-v1.mjs`.
- Every step:
  - `git diff --check`
  - no changed files under forbidden scopes.

## Browser QA Matrix

| Case | Expected result |
| --- | --- |
| Open `?view=paper-import-ai` | Visibly distinct from C7 `?view=paper-import`; owner-only label. |
| Drop one DOCX | Reading A-D groups render with paragraph + question preview; skipped panel separate. |
| Skipped section | Shows deterministic reason; no LLM call made for skipped content. |
| Analyze reading group | JSON preview has `schemaVersion: reading-choice-analysis-v1`, correct `paperId`, target group, all question IDs. |
| Provider switch | DeepSeek path uses DeepSeek; GPT path uses OpenAI adapter. Network panel reflects the switch. |
| Save new group analysis | Writes/merges into active `app/public/paper-assets/<paperId>/latest/analyses/reading-choice-analysis-v1.json` (or root if no latest). PaperSurface opens the group correctly. |
| Save existing group without confirm | Refuses overwrite, preserves existing file bytes. |
| Save existing group with `confirmOverwrite: true` | Merges only the selected group; preserves unrelated groups and questions. |
| Existing C7 `?view=paper-import` | Validate/publish/revalidate unaffected. |

## DEV Readiness

Step 1 may begin immediately. Steps 2/3/4 gated by previous step's
verifier + browser smoke check on ≥ 3 owner-supplied DOCX papers.

## PA Follow-Up Decisions

Codex PA returned `APPROVE WITH MUST FIX` on 2026-05-26 with 5 Must Fix
items (MF-1 through MF-5) and 0 Open PO Decisions, but PM elevated MF-2
and MF-3 to PO. PO decided:

- **MF-2 (七选五 prompt API-incompatible)** → **Option B**: defer 七选五 to
  I2 entirely. I1 implements 阅读理解 only. No prompt edits in I1.
- **MF-3 (GPT-5.5 provider)** → **Option B**: keep GPT-5.5 in I1, write a
  new OpenAI adapter under `server/ai-providers/openai.mjs` with
  `OPENAI_API_KEY`.

All five Must Fix items are now reflected in "Locked Product Decisions",
"Must Do", "Forbidden", and "Suggested Files" above:

- MF-1 (wrong prompt): use `prompts/reading-choice-analysis-v1.md` via an
  I1 API prompt builder; `DEEPSEEK_READING_PARSE_PROMPT` is NOT reused.
- MF-2: 七选五 deferred (PO Option B).
- MF-3: provider IDs renamed to `deepseek-v4-pro` / `gpt-5.5`; OpenAI
  adapter added (PO Option B).
- MF-4: save path corrected to `app/public/paper-assets/...` with
  `latest/` resolution and merge semantics including `confirmOverwrite`.
- MF-5: distinct route `?view=paper-import-ai` and API prefix
  `/api/paper-import-ai/*`; C7 paper-import behavior added to Forbidden.

Last synced: 2026-05-26 after Codex PA. Open items from external review: 0.
