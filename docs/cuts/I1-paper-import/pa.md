# PA Report — I1 paper-import

Reviewed baseline: local `main` at `0784213 chore(infra): strip claude-mem hook pollution via git clean filter`.

Sync caveat: this checkout has remote `github`, not `origin`. After `git fetch --all --prune`,
local `main` contains `0784213`, `50d107c`, and `b1a9c65`, but `github/main` still points at
`03158a8`. I used local `main@0784213` because it contains the requested I1 files. Before DEV is
assigned, confirm the shared remote main actually contains this baseline.

## Verdict

`APPROVE WITH MUST FIX`

The owner-only I1 direction is valid: DOCX in, deterministic split, AI reviewed-analysis preview,
then explicit save into `paper-assets`. DEV must not start from the current `plan.md` as-is. The
plan currently mixes three incompatible layers:

- C7 package import / publish (`server/paper-import/**`, `?view=paper-import`, latest/versions).
- Existing server reading-parse (`DEEPSEEK_READING_PARSE_PROMPT`) for question-bank difficulty
  parsing.
- PaperSurface reviewed-analysis JSON (`reading-choice-analysis-v1.json` and
  `seven-choices-analysis-v1.json`).

Resolve the Must Fix items below in `plan.md` before Step 1 DEV.

## Product Principle

I1 should be an owner-only bridge from full DOCX paper to reviewed PaperSurface analysis files.
It should reduce manual copy/paste work without becoming C7 teacher self-service, a package
publisher, or a generic AI dashboard.

The product task is: "I have one exam DOCX; help me split the target sections, generate reviewed
analysis JSON candidates, inspect them, and save only after confirmation."

## Exact UX / Architecture Model

- Use server-side DOCX parsing. Upload one DOCX to the server as multipart bytes, parse in memory
  with a Node DOCX library such as `mammoth`, and do not persist the raw DOCX until the owner
  explicitly saves/publishes an artifact.
- Keep the browser as a workbench only: upload/drop DOCX, show split sections, trigger analysis,
  preview JSON, and request save. Do not parse DOCX in frontend code.
- Do not reuse the current C7 `?view=paper-import` package-publish surface silently. Use a distinct
  owner-only view key such as `?view=paper-import-ai`, or explicitly rename/split the existing C7
  package UI before implementation.
- Step 1 should output normalized import candidates, not only `rawText`. The server should return
  enough structure for prompts and save:
  - paper candidate: `paperId`, source filename/hash, section markers.
  - reading groups: `groupId`, title/order, paragraph IDs/text, question IDs, stems, A-D options,
    and answerKey entries.
  - seven-choices groups: `groupId`, title/order, paragraph IDs/text with blank IDs, question IDs,
    A-G option bank, and answerKey entries.
  - skipped items: raw snippet plus deterministic reason.
- Step 3 should call reviewed-analysis prompt builders, not the existing question-bank
  `reading-parse` route. Reading choice should target `reading-choice-analysis-v1.json`; seven
  choices should target `seven-choices-analysis-v1.json`.
- Step 4 should save/merge analysis JSON into the active PaperSurface asset base:
  - if `app/public/paper-assets/<paperId>/latest/paper-asset.json` exists, write under
    `latest/analyses/`;
  - otherwise write under `app/public/paper-assets/<paperId>/analyses/`.
  Save must refuse overwrite/merge conflicts unless the UI passes an explicit confirmation flag.

## Must Fix Before DEV

### MF-1 — Fix prompt reuse: current server reading-parse is the wrong target for PaperSurface analysis

Evidence:

- `server/api.mjs` builds `DEEPSEEK_READING_PARSE_PROMPT` and sends:
  `passageTitle`, sliced `passageText`, and existing `detail.questions` from a stored question group.
- Its output is normalized into `questions`, `articleAnalysis`, `passageSummary`, `difficultyProfile`,
  and `synonymDifficulty`; it is not `reading-choice-analysis-v1.json`.
- `prompts/reading-choice-analysis-v1.md` is the prompt that produces the PaperSurface analysis
  file shape with `schemaVersion`, `paperId`, `sourceAssetVersion`, `targetGroups`, `groups`, and
  `questions`.

Required plan change:

- Replace "阅读理解 reuses the existing reading-parse prompt currently used by the project" with:
  "阅读理解 uses `prompts/reading-choice-analysis-v1.md` through an I1 API prompt builder. The
  splitter must first normalize raw DOCX section text into paper-asset-like group content:
  paragraph IDs/text, question IDs, stems, options, and answerKey. The existing
  `POST /api/question-groups/:id/reading-parse` flow is not reused for I1 reviewed-analysis files."

### MF-2 — Fix seven-choices prompt API contradiction

Evidence:

- `prompts/seven-choices-analysis-v1.md` explicitly requires a downloadable JSON file and says not
  to output JSON in chat; the fallback is exactly `UNABLE_TO_CREATE_FILE`.
- I1 Step 3 requires a server API call that displays parsed JSON inline. A normal server chat
  completion needs JSON text, not a downloadable UI attachment.
- Existing server seven-choices parsing in `server/api.mjs` uses `server/prompts/seven-choices-parse-prompt.txt`
  and returns a simpler legacy parse shape, not `seven-choices-analysis-v1.json`.

Required plan change:

- Add an I1 API-safe wrapper or prompt variant for seven choices that preserves the
  `seven-choices-analysis-v1` schema but replaces the file-download instruction with strict JSON
  text output. This is a prompt contract change and must be named in the plan. If prompt edits are
  forbidden for I1, then seven-choices API analysis is not DEV-ready.

### MF-3 — Fix provider/secrets contract for `deepseek-pro` and `gpt-5.5`

Evidence:

- Existing server AI code supports only DeepSeek plus local Qwen. DeepSeek reads
  `DEEPSEEK_API_KEY`, calls `https://api.deepseek.com/chat/completions`, and normalizes only
  `deepseek-v4-flash` / `deepseek-v4-pro`.
- There is no OpenAI provider client, no `OPENAI_API_KEY` path, and no existing `gpt-5.5` route in
  repo code.
- The plan says not to invent a new secrets path, but `gpt-5.5` necessarily requires one unless it
  is deferred out of I1.

Required plan change:

- Rename UI/provider values to real implementation values:
  `deepseek-v4-pro` and `gpt-5.5`.
- State explicitly:
  - `deepseek-v4-pro` uses existing `DEEPSEEK_API_KEY` and the existing DeepSeek request helper.
  - `gpt-5.5` requires a new server-owned OpenAI provider adapter and `OPENAI_API_KEY` env path,
    owned by the I1 analyze module or a small shared `server/ai-providers/` module.
- If adding that new provider path is too much for Step 3, defer `gpt-5.5` and remove provider
  switch/browser QA from I1.

### MF-4 — Fix save contract to match the real paper-assets layout and merge semantics

Evidence:

- The live committed fixture is:
  `app/public/paper-assets/paper-2024-jslk-english/paper-asset.json`,
  `analyses/reading-choice-analysis-v1.json`, and
  `analyses/seven-choices-analysis-v1.json`.
- C7 versioned publish additionally writes:
  `app/public/paper-assets/<paperId>/versions/vN/...` and
  `app/public/paper-assets/<paperId>/latest/...`.
- `resolvePaperAssetReadPaths()` prefers `latest/` when present, then latest version, then root.
- `server/paper-import/storage.mjs` currently hard-codes `analysisPath` to
  `reading-choice-analysis-v1.json`; seven-choices save cannot use that blindly.
- Reading analysis is one aggregate file for Reading A-D. A per-group save must merge one group's
  `groups[groupId]` and `questions[questionIds]` into the aggregate file without deleting other
  groups. Seven choices is a separate analysis file.

Required plan change:

- Define Step 4 exact targets:
  - reading: `analyses/reading-choice-analysis-v1.json`
  - seven choices: `analyses/seven-choices-analysis-v1.json`
- Define active base resolution:
  `latest/` if present, otherwise root fixture path. Do not mutate `versions/vN` directly from a
  per-group owner-only save.
- Define merge behavior:
  - refuse to overwrite an existing group unless `confirmOverwrite: true`;
  - preserve unrelated groups/questions in the same aggregate analysis file;
  - validate `analysis.paperId`, `sourceAssetVersion`, `targetGroups`, group IDs, question IDs,
    paragraph IDs, blank IDs, and answer-key coverage before writing.
- Extend or avoid `resolvePaperAssetReadPaths()` so seven-choices analysis file lookup is not
  forced through the reading-only `analysisPath`.

### MF-5 — Fix route/scope collision with existing C7 `paper-import`

Evidence:

- `app/src/features/paper-import/PaperImportWorkbench.tsx` already owns the `?view=paper-import`
  UI for C7 package validation/publish.
- `server/paper-import/paperImportRoutes.mjs` already owns `/api/paper-import/validate`,
  `/api/paper-import/publish`, and `/api/paper-import/revalidate-latest`.
- I1 is explicitly owner-only and should not become C7 teacher self-service.

Required plan change:

- Do not say "new `/paper-import` page" without addressing the existing route.
- Choose one explicit route model before DEV:
  - recommended: new owner-only route/view key and API prefix, e.g. `?view=paper-import-ai` and
    `/api/paper-import-ai/*`;
  - or split the current `paper-import` UI into clearly named modes, with C7 package publish left
    intact.
- Add forbidden scope: do not remove or regress existing C7 validate/publish/revalidate behavior.

## Should Watch

### SW-1 — DOCX splitter false positives are the main Step 1 quality risk

Server-side parsing with `mammoth` is the right location, but DOCX text extraction will lose some
layout cues. The existing `scripts/review/rules/import-splitter.md` failure modes should shape I1
tests: 七选五 misclassified as cloze, writing misclassified as reading, passage title `A...` parsed
as option A, later section headings leaking into a group, and full-width markers being ignored.

This does not block the plan if Step 1 verifier uses at least three owner-supplied DOCX files and
requires false positives to fail.

### SW-2 — I1 should not reuse C7 package validation as the first implementation surface

C7 validators are valuable for final saved shape and future publishing, but the existing package
workflow expects prebuilt JSON files and import metadata. I1 starts from raw DOCX and generates AI
analysis candidates. Reusing too much C7 UI too early will drag in teacher-self-service concerns.

This does not block if I1 keeps its own owner-only route and uses C7 storage/validation helpers only
where they prove final file shape.

### SW-3 — Three-paper verification must not commit copyrighted DOCX/passages

The plan's "≥ 3 owner-supplied DOCX" requirement is correct for manual verification. Automated
fixtures should use one synthetic or owner-cleared paper only. Do not commit copyrighted full
passages or raw external model output.

### SW-4 — Existing remote tracking is stale in this checkout

Before assigning DEV or RM, make sure the shared remote branch contains `0784213` and the PA report.
This is not a product blocker, but it is a multi-agent handoff risk.

## Allowed Files

Recommended allowed scope after Must Fix updates:

- `docs/cuts/I1-paper-import/plan.md` — PM applies PA follow-up decisions before DEV.
- `server/paper-import-ai/**` or a similarly named owner-only module family for I1 splitter/analyze/save.
- `server/paper-import/**` only for narrowly reused storage/validation helpers; do not regress C7 routes.
- `server/api.mjs` / router wiring only to register new I1 routes if current router pattern requires it.
- `server/package.json` and `server/package-lock.json` for the DOCX parser dependency and optional provider SDK.
- `app/src/features/paper-import-ai/**` or equivalent owner-only feature directory.
- Current route registry / `app/src/App.tsx` only for adding the new view key.
- `app/src/services/**` for I1 client calls.
- `scripts/verify-i1-paper-import-*.mjs` for step verifiers.
- `scripts/README.md` for verify index updates.
- `test-fixtures/paper-import-ai/**` for synthetic/owner-cleared fixtures only.

## Forbidden Files

- `shared/papersurface/**`
- `app/src/domain/**`
- `schemas/**` unless PM explicitly accepts a schema addition after this PA.
- `app/public/paper-assets/**` during implementation, except synthetic/test fixture outputs approved by the plan.
- Existing reviewed prompts unless the plan follow-up explicitly permits the seven-choices API-safe prompt change.
- Existing C7 package import behavior:
  - do not remove `/api/paper-import/validate`
  - do not remove `/api/paper-import/publish`
  - do not remove `/api/paper-import/revalidate-latest`
  - do not break `?view=paper-import` package validation/publish if I1 uses a new route.
- `shared/papersurface/**`, print/PDF/export styling, Draft Paper, and Paper Intelligence harness internals.

## Static Verify Requirements

Minimum per step:

- Step 1:
  - `node --check server/api.mjs`
  - `node scripts/verify-i1-paper-import-splitter.mjs`
  - verifier must cover at least one synthetic DOCX fixture and deterministic unit cases for section headings,
    A-D reading groups, 七选五 A-G options, skipped sections, and false-positive rejection.
- Step 2:
  - `node scripts/verify-i1-paper-import-route.mjs`
  - `npm run build --prefix app`
- Step 3:
  - `node scripts/verify-i1-paper-import-analysis.mjs`
  - stub both provider adapters; assert no real API key is needed for static tests.
  - assert reading output matches `reading-choice-analysis-v1` top-level shape.
  - assert seven-choices output matches `seven-choices-analysis-v1` top-level shape.
- Step 4:
  - `node scripts/verify-i1-paper-import-save.mjs`
  - assert active base resolution (`latest/` vs root), overwrite refusal, merge-preserve behavior,
    and separate reading/seven-choices filenames.
  - run existing relevant checks:
    `node scripts/verify-c7-paper-import-publish.mjs`,
    `node scripts/verify-i0e-seven-choices-entry.mjs`,
    and `node scripts/verify-paper-asset-v1.mjs` when final file layout is touched.
- Every step:
  - `git diff --check`
  - no changed files under forbidden scopes.

## Browser QA Matrix

Required for Steps 2-4:

| Case | Expected result |
| --- | --- |
| Open I1 route/view | It is visibly distinct from existing C7 package import, or the two modes are clearly separated. |
| Drop one DOCX | Sections render with Reading A-D, 七选五, and skipped panels matching Step 1 verifier output. |
| Skipped section | Shows deterministic reason; no LLM call is made for skipped content. |
| Analyze reading group | JSON preview has `schemaVersion: reading-choice-analysis-v1`, correct `paperId`, target group, and all question IDs. |
| Analyze seven choices group | JSON preview has `schemaVersion: seven-choices-analysis-v1`, correct blank IDs, option labels, and question IDs. |
| Provider selection | DeepSeek Pro path uses DeepSeek; GPT path uses OpenAI adapter if kept in I1. Static stubs should make this observable without exposing keys. |
| Save new analysis | Writes to the active `paper-assets` base and PaperSurface can open the group. |
| Save existing analysis without confirmation | Refuses overwrite and preserves existing file bytes. |
| Save existing analysis with confirmation | Merges only the selected group and preserves unrelated groups/questions. |
| Existing C7 import page | Validate/publish/revalidate still work or are unaffected if I1 uses a separate route. |

## DEV Readiness

Not ready until all Must Fix items are reflected in `plan.md`.

After PM applies the plan patch, DEV can start Step 1 only. Do not start Step 2 until Step 1 verifier
passes on the agreed sample set. Do not start Step 3 until prompt/provider contracts are explicit.
Do not start Step 4 until save path and merge behavior are locked.

Suggested `plan.md` follow-up patch text:

```md
## PA Follow-Up Decisions

- DOCX parsing is server-side. The browser uploads one DOCX; the server parses bytes in memory with
  a Node DOCX parser and returns normalized reading/seven-choices candidates plus skipped sections.
- I1 uses a distinct owner-only route/API namespace from existing C7 package import, e.g.
  `?view=paper-import-ai` and `/api/paper-import-ai/*`. Existing C7 validate/publish/revalidate
  behavior is forbidden scope.
- 阅读理解 analysis uses `prompts/reading-choice-analysis-v1.md` through an I1 prompt builder. The
  existing `POST /api/question-groups/:id/reading-parse` prompt is not reused for PaperSurface
  reviewed-analysis files.
- 七选五 analysis requires an API-safe `seven-choices-analysis-v1` prompt wrapper/variant that returns
  strict JSON text. The current downloadable-file-only instruction is incompatible with the I1 API
  preview path.
- Provider contract: `deepseek-v4-pro` uses existing `DEEPSEEK_API_KEY`; `gpt-5.5` requires an
  explicit OpenAI provider adapter and `OPENAI_API_KEY`, or it must be deferred out of I1.
- Save target: write/merge `analyses/reading-choice-analysis-v1.json` and
  `analyses/seven-choices-analysis-v1.json` under the active PaperSurface asset base (`latest/` if
  present, otherwise root). Refuse overwrite/merge conflicts unless `confirmOverwrite: true`.

Last synced: 2026-05-26 after Codex PA. Open items from external review: 0.
```

## Open PO Decisions

None if PM accepts the exact model above.

