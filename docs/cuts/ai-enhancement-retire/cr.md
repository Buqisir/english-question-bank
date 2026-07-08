# ai-enhancement-retire — CR Review

Reviewer: CR (fresh Opus, cold-read independent context). Code diff = `git diff dcee0f5..51f1959`
(App.tsx / App.css / verify-classic-retire-2.mjs). All file:line + grep independently
re-run against HEAD@51f1959; DEV/PA reports NOT trusted.

## Verdict: APPROVE

Pure-deletion cut: `-686 / +2` across exactly 3 expected files. Every hard contract
C1–C5 verified against the tree. Build green (`tsc -b` + vite), `verify:all` = 67 pass /
1 skip (pre-existing off-repo verify-i16a) / 0 fail. **0 Must Fix.** MF-1 + MF-2 both landed.
Blind spot #2 (`mergeQuestionGroupCardsById`) confirmed a safe B-only orphan.

---

## 核心核点结论（逐条 + 证据）

### 1. member READ 命脉未断 (C2) — SOUND
- 5-state declarations all survive: `verifyResult`(App.tsx:624), `clozeParseResult`(627),
  `sevenChoicesParseResult`(632), `grammarParseResult`(637), `readingParseResult`(642).
- `openDetail`(App.tsx:982) independently populates all 5 states from `detail.*` +
  `build*VerifyResult`派生 (reading verify 1020; cloze 1027; seven 1034; grammar 1041) —
  verified by reading the body (lines 1010–1046). No dependency on any deleted B symbol.
- `buildClozeVerifyResult`(458) / `buildSevenChoicesVerifyResult`(505) /
  `buildGrammarVerifyResult`(411) all retained.
- Only B's WRITE path (the `runAiEnhancementAnswerParse` sync-into-open-detail branch)
  was removed. READ命脉 driven purely by `openDetail` + local派生 → intact.

### 2. BLIND SPOT #2 — `mergeQuestionGroupCardsById` deletion is SAFE
DEV self-flagged this as a collateral B-only orphan not enumerated in plan. Independently
confirmed:
- Repo-wide grep (`app scripts server`): **0 hits** after deletion — no surviving caller.
- Its only pre-deletion caller was `showAiEnhancementPanel` (visible in diff: the
  `setAiEnhancementTargets((currentTargets) => mergeQuestionGroupCardsById(...))` line),
  which is itself part of B and deleted.
- Its logic (dedupe QuestionGroupCard[] by id) was pure/local to the AI-enhancement
  targets list; no other module imported or depended on it. `setQuestionGroups` list
  refresh in the commit handlers does its own filter (`groups.filter(item => item.id !== saved.id)`
  at 1382), never relied on this helper.
- **Verdict: safe to delete, no side effect.** Correct judgment-call orphan removal.

### 3. 导题入库自洽 (C1/C3) — SOUND
- `handleCommitDraftGroup`(context 1378–1388): only the `showAiEnhancementPanel([saved],'append')`
  line removed; `createQuestionGroup` → `setQuestionGroups` → `setDataStatus('sqlite')` →
  `refreshPaperWorkflows()` all retained. Self-consistent.
- `handleBatchCommitObjectiveDraftGroups`(context 1443–1452): only
  `showAiEnhancementPanel(savedGroups,'replace')` removed; `setQuestionGroups` +
  `refreshQuestionGroups()` + `refreshPaperWorkflows()` retained. Self-consistent.

### 4. 无漏删无误删 (C1) — SOUND
- `grep -in aiEnhancement app/src/App.tsx` → **0 hits** (exit 1). Case-insensitive
  `AiEnhancement` across `app/src` → 0 hits. B render block, state (9), useEffect,
  types/factories, handlers (incl. MF-1 toggles) all gone.
- `ai-enhancement` in App.css → 0 hits (both main block ~2554 AND `@media` block removed —
  SW-2 honored, confirmed in diff).
- All 12 removed service imports → **0 remaining callers** in App.tsx (grep count each = 0).
- Removed icons/types: `Save` 0, `Sparkles` 0, `TopicLabel` 0 remaining refs. Correctly pruned.
- KEEP shared symbols survive: `aiApiKey`(3), `aiModel`(2), `aiThinkingMode`(3),
  `handleBackfillTopicLabels`(1315, distinct from removed `bindTopicLabels`; uses kept
  `backfillTopicLabels` service at 1322). `setQuestionGroups`/`setSelectedDetail` intact.

### 5. MF-1 / MF-2 落实 — DONE
- MF-1: `toggleAiEnhancementTask` + `toggleAiEnhancementTopicLabelSelection` both removed
  (visible in diff, 0 grep hits). Proven by clean `tsc -b` (would fail on `noUnusedLocals`
  if orphaned).
- MF-2: `verify-classic-retire-2.mjs` diff — the `runAiEnhancementAnswerParse ... kept`
  assertion (L201-204) **deleted**; comment L192-193 fixed (removed "+ AI Enhancement sync
  branch"); 5-state assertions + `handleBackfillTopicLabels` assertion **retained**; script
  stays in registry. Ran directly: 61 passed / 0 failed.

### 6. Forbidden 守住 — SOUND
- `git diff --name-only` = exactly `App.css` / `App.tsx` / `verify-classic-retire-2.mjs`.
- 0 hits for `server/` / `data/sql/` / `paper-import-ai` / `paperImportAi` in touched files.
  A page, backend routes, normal import workbench body, global AI config all untouched.

### 7. verify / build — GREEN
- `pnpm -C app build`: `tsc -b` + vite both pass, `✓ built in 493ms`. No orphan import /
  unused local (proves MF-1 + import pruning complete).
- `pnpm -C app run verify:all`: **PASS 67 / SKIP 1 / FAIL 0**. The 1 skip =
  `verify-i16a-teaching-dimension-search.mjs` (off-repo fixture absent — pre-existing,
  NOT introduced by this cut). Matches plan C5 exactly.

---

## Must Fix
None.

## Should Watch (non-blocking)
- SW-A (product, not code): Browser QA on eqbank.cc still owed per plan Verification C1–C3
  (draft commit no longer pops panel; member detail still shows stored解析/答案对比/AI验证/
  topic labels). Code path is sound but real-machine confirmation lives with owner QA —
  记忆反复应验「真库QA不可让渡」。 Non-blocking for merge given pure-deletion + green verify,
  but flag it as the last mile.
- SW-B: A (`features/paper-import-ai`) 独立 AI 导题页 remains live per D1 — 挂账, correctly
  out of scope. Not a defect.

## Self-Review Blind Spots (for any later Big CR)
- I verified the WRITE→READ decoupling by reading `openDetail` and confirming the 5 states
  are populated from `detail.*`, but did not exercise the app at runtime — a stored-detail
  with malformed parse payload path is only covered by static reading, not execution.
- `verify:all` proves the deleted symbols are gone and kept symbols present via regex; it
  does not assert the member detail view *renders* the sync-branch-removed states. That
  behavioral guarantee rests on the unchanged `openDetail` + QuestionGroupDetailView, which
  detail-consume-only already shipped — inherited, not re-proven here.
