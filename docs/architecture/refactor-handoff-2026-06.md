# Refactor Handoff — api.mjs / App.tsx Decomposition (2026-06-08)

Pick-up doc for a fresh session continuing the systematic refactor. Read this + the **roadmap**
(`docs/architecture/refactor-roadmap-2026-06.md`) + the memory file
(`memory/refactor-decomposition-2026-06.md`). Then continue from "Remaining cuts" below.

## TL;DR — do this next

1. **First: land H5-I (it's done but UNMERGED).** Branch `h5-i-steward-service` @ `bad35fb` is committed
   locally, CR-passed (by 小川), `verify:all` 51/0/0, byte-identical — but NOT pushed/merged (owner
   interrupted before the merge). Push it, open a PR, confirm CI green, merge. (Owner may prefer to
   eyeball it first — it's contract-sensitive AI-mode steward.)
2. **Then continue the remaining cuts** in order: **H5-K → H5-L → H5-F → H5-G → H10-B** (all api.mjs,
   strictly sequential — shared file). Plus two deferred PR2s (H10-B-PR2, H12-B-PR2) — see below.
3. Use **THE RECIPE** (below) per cut. Honour the **HARD LESSONS** — they cost real bugs.

## Where we are (main @ `3783767`)

`server/api.mjs`: **11,096 → 8,505 lines (−23%)**; `app/src/App.tsx`: **7,186 → 6,597**. After H5-I lands,
api.mjs → ~8,105.

**Merged (13 cuts + roadmap + CI fix), all behavior-preserving + independently CR'd + verify-green:**
H4-A (dead code #195) · H5-C (jsonExtraction #196) · H5-B (importListing #199) · H5-D (completionRunner
#200) · H5-E (verifyQuestionGroupService #201) · CI hermetic fix (#202) · H6-A (analyzerProviderShell
#197) · H11-B (paperImportAiAnalysisView #198) · H10-A (paper-sets/routes #204) · H11-A PR1 (httpClient
#203) · H12-A (EntryModal #205) · H5-J (readingDifficultyNormalizer #206) · H12-B PR1
(DifficultyProfileGrid #207) · H5-H (semanticSearchService #208).

**Extracted server modules:** `ai-providers/{jsonExtraction,completionRunner}.mjs`,
`ai-verify/verifyQuestionGroupService.mjs`, `imports/importListing.mjs`, `paper-sets/routes.mjs`,
`reading-analysis/readingDifficultyNormalizer.mjs`, `search/{semanticSearchService}.mjs`. Frontend:
`workbench/EntryModal.tsx`, `workbench/detail/DifficultyProfileGrid.tsx`, `services/httpClient.ts`,
`features/paper-import-ai/paperImportAiAnalysisView.ts`.

## In-flight: H5-I (steward) — UNMERGED, ready

- Branch `h5-i-steward-service` @ `bad35fb` (local only, not pushed). api.mjs 8505→8105.
- Moves questionBankStewardSearch + 12 helpers + steward PROMPT → `server/search/questionBankStewardService.mjs`
  (module-level `let` deps, indent-0). Injects semanticSearchQuestionGroups (from H5-H) + callDeepSeekWithFallback.
- CR-passed by 小川: steward prompt + 5/5 sampled fns byte-identical to main; no cycle; eval smoke OK;
  `verify-h5i-steward-service` 60/0; thinking-toggle b1–b5 pointer-updated (not weakened); `verify:all` 51/0/0.
- **Action:** `git push -u github h5-i-steward-service` → PR → CI green → squash-merge → delete branch.

## Remaining cuts (roadmap has full Moves/Seam/Verify/Forbidden per cut)

All touch `server/api.mjs` → **strictly sequential**, each branched off the LATEST main, merged before
the next (avoids api.mjs + verify-ci conflicts). Dependency order:

1. **H5-K** — synonym-difficulty local-Qwen classifier → `server/ai-parse/synonymDifficultyService.mjs`.
   Large (~615 lines). deps H5-D (done). Gated behind `QUESTION_BANK_ENABLE_LOCAL_QWEN`. Exports a
   knowledge-card formatter that H5-L consumes. Has prompt(s) → indent-0.
2. **H5-L** — DeepSeek per-type parse owners (reading/cloze/grammar/seven-choices) →
   `server/ai-parse/questionGroupParseService.mjs`. Large. deps H5-D, H5-J (done), **H5-K**. **INJECT the
   frozen `DEEPSEEK_*_PROMPT` constants — do NOT move them** (highest blast radius). Deepest spine cut; do last of the parse lane.
3. **H5-F** — legacy DOCX import-draft / answer-alignment pipeline → `server/imports/legacyImportImplementation.mjs`.
   LARGE (~2700 lines), zero AI calls (deterministic). Mirrors createExportImplementation. Preserve the
   questionNo===57 hack + shouldUpdateExplanation=false verbatim. No deps.
4. **H5-G** — DOCX OOXML renderer (buildDocumentXml/writeDocxPackage/convertDocxToPdf + helpers) →
   `server/exports/docxRenderer.mjs`, consumed by the existing export implementation (the 3-fn interface
   it already declares as injected deps). user-visible (export bytes) — confirm export verify scripts diff
   .docx BYTES. No deps.
5. **H10-B PR2** — extract the 3 LIVE ai-proxy route blocks (verify-question-group / semantic-search /
   steward) into `server/ai-proxy/routes.mjs`, preserving x-verify-request-id + {error,requestId}.
   **H10-B PR1 (delete dead `/api/ai/parse-reading` + `/api/ai/verify-trace`) — FIRST confirm zero
   script/curl callers** (frontend has none; parse-reading is redundant with POST
   /api/question-groups/:id/reading-parse). If truly dead, delete; else keep.

**Deferred by design (the critic's reslice; do only if cleanly severable):**
- **H12-B PR2** — DifficultyReviewPanel. Its controls are interleaved with calibration mutators
  (`updateDifficultyDraft`/`handleSaveQuestionDifficulty`/`computeCalibrationPreview`) — the dev agent
  confirmed they do NOT sever cleanly. Leave unless you can prop-thread the controls with zero behavior change.
- **H11-A PR2** (::1 host unification — owner-acknowledged behavior change, NOT a dedup) and **PR3** (cssAttr
  dedup, gated on the 3 bodies being byte-identical). PR2 needs owner sign-off (it changes behavior).

**Rejected (do NOT re-propose):** the 20 shallow seams in the roadmap's deferred list (read-hub, CRUD SQL,
type-barrel, App.tsx state-webs, surface-adapter merge, …).

## THE RECIPE (per cut — proven across 13 merges)

1. **Branch off latest main.** Re-derive current line numbers (the file shrinks each cut).
2. **DEV via a fresh Opus agent** (decoupled from CR — see gotcha): `Agent` tool, `subagent_type: dev-hard`,
   `model: opus`, `isolation: worktree`, `run_in_background: true`. Prompt = SETUP (symlink node_modules,
   commit to a named branch, don't push) + the HARD LESSONS + the roadmap cut id + "report free-text:
   committed?/files/seam/byte-identity proof/verify counts/blocker". (Inline `script` workflows also work;
   `scriptPath`+`args` does NOT — see gotcha.)
3. **CR it yourself** (do NOT rely on a workflow CR agent — it can be interrupted): free the agent worktree
   (`git worktree remove … --force`), `git checkout <branch>`, then independently verify:
   - **byte-identity** of every moved fn + every PROMPT vs `git show main:server/api.mjs` (prompt interiors
     must NOT be over-indented);
   - **dep completeness** (no used-but-undefined) + **no cycle** (module ∌ import api.mjs);
   - `node --check` both files + `node -e "import('./server/api.mjs')"` eval smoke (no ReferenceError);
   - the cut's `verify-*.mjs` + `pnpm run verify:all` (from `app/`) green.
4. **Push → PR → CI green → squash-merge → sync main → clean the worktree/branch.**

## HARD LESSONS (each cost a real bug the CR caught)

1. **Prompt template literals break under blanket re-indent.** Nesting fns into a factory (+2 indent) adds
   spaces to multi-line template interiors → changes the AI prompt. SQL whitespace is inert; **prompt is
   NOT**. Fix: extract at **indent 0** (module top-level fns + module-scoped `let` deps the factory assigns).
   And a "de-indent then diff" byte-check MASKS this — assert prompt content directly.
2. **Dep analysis: read + invocation-smoke, not a grep allowlist.** Twice a fixed-list grep missed deps
   (`rowToImportFile`; `maskApiKey`/`elapsedMs`/`groupTypeLabels`/`DEEPSEEK_API_KEY`). Enumerate EVERY free
   identifier (calls, subscripted consts, CONSTANT_CASE). Every verify MUST CALL the extracted code through
   stubs (the only check that catches a missing call-time dep) + a used-but-undefined guard.
3. **Verify scripts MUST be hermetic.** `git show main:…` fails in PR CI (detached merge ref, no local
   `main`) → red on every PR while main stays green (this caused the "verify 不过关" emails; fixed in #202).
   Assert literals / read working-tree files only. Byte-identity belongs in the one-time cut check, not the
   registered script.
4. **Independent fresh-eyes CR is load-bearing** — it caught the rowToImportFile ReferenceError, the H5-E
   prompt corruption, and the git-show-main CI break.

## Env / tooling facts + gotchas

- git remote is **`github`** (not origin). `gh` authed (Buqisir). Squash-merge per PR (delete branch).
- **GitHub CI IS installed**: `.github/workflows/verify.yml` runs `pnpm run verify:all` on every PR +
  push:main. It's the merge gate (hermetic since #202). PR runs use a detached merge ref.
- **Contract-guard hook** (`.claude/hooks/guard-contract-files.mjs`) only `ask`s on `app/src/domain/`,
  `schemas/`, `shared/papersurface/`, `*Adapter.ts`. `server/**` and other `app/src/**` are NOT hooked.
- **Workflow gotchas:** `Workflow({scriptPath, args})` — the `args` global did NOT populate (agents got
  "undefined"); use an **inline `script`** with the cut hardcoded, or the `Agent` tool directly. A workflow
  **CR agent can be interrupted** by a user message arriving mid-run (leaves the run hung) — so **decouple:
  DEV via agent, CR yourself**.
- **verify-ci registration conflict:** every cut appends a row to `scripts/verify-ci.mjs` + `scripts/README.md`.
  Parallel cuts collide there → **union-resolve** (keep all rows). Sequential cuts (each off latest main)
  don't conflict — prefer sequential for the api.mjs lane.
- **`createVerifier.summary()` DOES `process.exit(1)` on failure**, and `verify-ci.mjs` gates on exit code →
  green is trustworthy. Still read the printed PASS/SKIP/FAIL counts. The 1 SKIP (`verify-i16a`) is a
  pre-existing off-repo fixture absence — unrelated.
- **Clean up agent worktrees** after each cut: `git worktree remove .../.claude/worktrees/<id> --force` +
  `git worktree prune` + delete the merged local branch.
- Owner is PO: contract-sensitive (AI parse/search/steward) + user-visible (App.tsx, DOCX export) cuts merit
  his spot-QA in the running app. He directed "complete everything," so merge when CR+verify+CI green and
  give him a spot-QA list; he reverts anything his QA flags.

## Pointers

- Roadmap (source of truth, per-cut detail): `docs/architecture/refactor-roadmap-2026-06.md`
- Per-cut plans committed: `docs/cuts/H5-server-implementation-extraction/plan-h5-{b,c,d,e}-*.md`
- Memory: `memory/refactor-decomposition-2026-06.md` (lessons + lane state)
- Reusable single-cut workflow script (inline-spec pattern, args-free):
  the saved `.../workflows/scripts/cut-h5h-semantic-search-*.js` is a good template to copy + edit the spec.
