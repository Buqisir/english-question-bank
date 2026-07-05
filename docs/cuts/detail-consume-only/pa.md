# PA Review — detail-consume-only

- Branch: `claude/detail-consume-only` @ `bc75f44`
- Reviewer: PA (cold context, verified against real code)
- Scope reviewed: `plan.md`, `decisions.md`, ADR-0015, `QuestionGroupDetailView.tsx`
  (full 1563 lines), `App.tsx` (openDetail / handlers / render site /
  runAiEnhancementAnswerParse / difficulty+topic state), `EntryModal.tsx`,
  `ConciergeGroupCard.tsx`, `domain/questionBank.ts`, `detailHelpers.ts`,
  verify registry + `verify-classic-retire-2.mjs`, `verify-h12a/h12b`,
  `verify-h5j`, tsconfig, PRODUCT.md.

## Verdict

**APPROVE WITH MUST FIX**

The direction is sound and the READ/WRITE split is genuinely separable — I
verified it line by line. The plan's core boundary claims hold. But the plan
under-specifies two things that will bite a literal DEV: (a) the verify story is
wrong in a way that guarantees a red gate if DEV follows the plan verbatim, and
(b) `noUnusedLocals`/`noUnusedParameters` are on with `tsc -b` in the build, so
every orphaned import the plan waves at ("逐函数核") is a hard build failure, not
a lint nit. Both are fixable with plan text, not rework. No PO decisions needed.

Open PO decisions: 0.

## Focus 1 — READ vs WRITE split integrity: SOUND (verified)

`openDetail` (App.tsx:1127-1204) rehydrates the 5 clusters from
`QuestionGroupDetail` at lines 1163-1199:
- `detail.readingParseResult` → readingParseResult + status + saveStatus
- `detail.readingVerifyResult` → verifyResult
- `detail.clozeParseResult` → clozeParseResult + `buildClozeVerifyResult(...)`
- `detail.sevenChoicesParseResult` → `buildSevenChoicesVerifyResult(...)`
- `detail.grammarParseResult` → `buildGrammarVerifyResult(...)`

None of this touches any `handle*` WRITE handler. The `build*VerifyResult` local
derivations are pure and are also consumed by AI Enhancement (Focus 2), so they
stay regardless. `answerCompareStats` and the verify-list are computed inside the
detail view from `verifyResult` (DetailView:253-261, 1435-1481) — member-visible,
independent of WRITE. **The READ path survives WRITE-handler deletion cleanly.**

One real coupling to record (not blocking): `openDetail` line 1166-1168 sets
`topicLabelStatus('loaded')` when `detail.topicLabels?.length`. The plan (line
113) already flags this: since `topicLabelStatus` state is being deleted, this
line must be deleted too. The already-bound label *display* reads
`selectedDetail.topicLabels` (DetailView:424-437), not the status — so display is
unaffected. Confirmed correct in plan.

## Focus 2 — 5-state KEEP + AI Enhancement coupling: SOUND (verified)

`runAiEnhancementAnswerParse` (App.tsx:1601-1699) writes exactly the KEEP
clusters via its `selectedDetail?.id === detail.id` sync branch:
- reading: setReadingParseResult/Status/SaveStatus + setVerifyResult (1609-1631)
- cloze: setClozeParse* + `buildClozeVerifyResult` (1638-1652)
- seven: setSevenChoicesParse* + `buildSevenChoicesVerifyResult` (1659-1673)
- grammar: setGrammarParse* + `buildGrammarVerifyResult` (1680-1694)

It never calls any detail `handle*` handler and never touches difficulty or
topic-label scratch state. Deleting the detail handlers does **not** orphan or
break AI Enhancement. The 5 state clusters + their setters must stay (they do, in
the plan). `updateAiEnhancedQuestionGroup`, `handleBindAiEnhancementTopicLabels`
are AI-Enhancement-owned and untouched. Confirmed C6 holds.

## Focus 3 — Difficulty data-layer Forbidden holds: SOUND, with one gap

Every write path still supplies a valid `difficulty`:
- **EntryModal create default**: `initialForm.difficulty: 'medium'`
  (EntryModal.tsx:68) is the form seed and survives select removal — submit
  payload keeps `difficulty`. ✔
- **Import-draft → create-group**: `App.tsx:474` and `App.tsx:487` set
  `difficulty: 'medium'` inside a `CreateQuestionGroupInput` builder (function at
  ~455). These are data-field defaults, NOT difficulty UI. The plan (line 125-127)
  correctly says KEEP — I confirmed the consumer is `CreateQuestionGroupInput`,
  not any difficulty widget. ✔
- `publisher.mjs` / schema / seed untouched (Forbidden). ✔
- `saveQuestionDifficultyRating` **server route** stays (only the client caller
  `handleSaveQuestionDifficulty` is deleted; the client fn
  `saveQuestionDifficultyRatingRequest` then has zero callers — safe to drop per
  C6, backend route untouched). ✔

Gap (folded into MF): the EntryModal `<select>` removal (lines 362-372) must keep
the `difficulty` field in `entryForm` and its submit payload. The plan says this
("保留一个默认值写入") but does not name that `initialForm.difficulty` (line 68)
and `deriveFormFromDetail`'s `difficulty: detail.difficulty` (line 109) are the two
seeds that must survive. DEV must not delete `difficulty` from the form
state/type (EntryModal.tsx:28 `difficulty: Difficulty`) — only the visible
control. Otherwise the create/edit payload drops `difficulty` and hits `NOT NULL`.

## Focus 4 — Edit/Delete retention vs principle: COHERENT (no contradiction)

ADR-0015 §1 explicitly carves out 低频纠错运维 (edit字/答案, delete导错题组) as
NOT "现场生产", and PRODUCT.md lines 32-33 say the same in the same words. This is
a deliberate, documented boundary, not a contradiction. A future reader hitting
"网站只消费" + an edit button will find the carve-out in both ADR-0015 §1 and
PRODUCT.md. No action needed. (The `<EntryModal>` render + `openEditEntry` +
`handleEntrySaved` chain must be KEPT — plan line 120-124 already inverts the
scout's "delete" note correctly. Verified those are the edit path.)

## Focus 5 — Verify completeness: INCOMPLETE (Must Fix)

Backend difficulty verifies stay green (data layer untouched): `verify-h5j`
(pure reading-difficulty normalizer, no UI/DB), `h5k`, `h5h`, `h5i`, `h1g`,
`owner-gate` — none assert front-end difficulty UI. ✔ Confirmed h5j is a
golden-output normalizer test with "NO provider, NO DB".

But the front-end verify story in the plan is materially wrong:

1. **`verify-classic-retire-2.mjs` will FAIL, not just "need updating".** It
   currently *asserts the PRESENCE* of the very things this cut deletes
   (registry line 69, runs under `verify:all`):
   - line 61: `verify/AI解析 button (non-reading)` — DELETED
   - line 62: `onGenerateTopicLabels` button — DELETED
   - line 63: topic-label candidates + bind block — DELETED
   - line 64: `teacher-difficulty-card` gated by isOwnerView — DELETED
   - lines 74-83: all 5 AI ops-trace sections — DELETED
   - line 98: asserts `formatSavedAt` still defined in detailHelpers — see (3)

   The plan says "update verify-classic-retire-2" but does not state the
   assertions must **invert** (assert *absence* of production controls + traces,
   keep the 编辑-button / passage / 加入草稿卷 / onOpenDetail-threading
   assertions). Left as "update", a DEV may tweak cosmetically and ship red.

2. **`verify-calibration-preview.mjs` is NOT in the verify-ci registry** (only in
   `scripts/README.md:162`). The plan's "verify-ci 注册表同步" for it is a no-op —
   deleting the file needs a README line removed, not a registry entry. Only
   `verify-h12b-difficulty-profile-grid.mjs` (registry line 70) actually needs a
   **registry removal**, else `verify-ci` spawns a missing file and fails. Plan
   must be precise about which is registry vs README-only.

3. **`verify-classic-retire-2.mjs:98` asserts `formatSavedAt` is still defined.**
   `formatSavedAt` survives in detailHelpers.ts, but ALL its call sites
   (DetailView:511/607/669/1500) are inside the deleted save blocks. If DEV
   "cleans up" `formatSavedAt` as newly-dead, this assertion breaks too. Plan
   must say: keep `formatSavedAt` in detailHelpers even though it goes call-less
   (or drop the assertion) — pick one and record it.

No difficulty-pill assertion exists in `verify-concierge-desk.mjs` or
`verify-h12a-entry-modal.mjs` — those stay green (verified). `verify-classic-
retire-3.mjs` has no difficulty/trace assertions — green.

## Focus 6 — Rework / miss risk: real, and build-hard

`app/tsconfig.app.json` has `noUnusedLocals: true` + `noUnusedParameters: true`,
and `build` = `tsc -b && vite build`. **Every orphaned import/local/param after
deletion is a hard build failure**, so the plan's "逐函数核 / 每步 tsc" is
load-bearing, not advisory. Concrete orphans DEV must trim (enumerate in plan so
DEV doesn't thrash):

- **DetailView imports (line 40-50)**: after deletion, `compactPreview` (only use
  was line 804, deleted), `formatSavedAt` (all uses deleted),
  `getDisplayDifficulty` / `mapAiDifficultyScoreToFive` / `requiresDifficultyReason`
  / `getDifficultyDraftForQuestion` / `DifficultyRatingDraft` all go unused. Note
  `compactGroupMeta` (line 280) and `getParseSavedAt` (line 983, drives the
  member compare box) STAY. So the plan's "keep compactPreview/formatSavedAt/
  compactGroupMeta" is right *for detailHelpers.ts the file*, but their *imports
  in the detail view* still must be removed — the plan conflates "function
  survives" with "import survives". Call this out.
- **DetailView line 39**: `mainBlockerLabel` (used only at deleted line 932)
  becomes an unused import; `labelOf` STAYS (kept distractor block, line 1328).
  Trim `mainBlockerLabel` only. `readingProfileLabels.ts` file must NOT be deleted
  (still exports `labelOf`). Plan doesn't mention this file — fine to leave, but
  don't let DEV delete it.
- **App.tsx line 107**: after deleting `updateDifficultyDraft`,
  `handleSaveQuestionDifficulty`, and the difficulty rehydration `useEffect`
  (1021-1036), `getDifficultyDraftForQuestion` + `DifficultyRatingDraft` go
  unused; `compactPreview` STAYS (line 3554). Trim the import to `compactPreview`
  only.
- **`difficultyLabel`**: removing the export (domain:612) requires deleting BOTH
  callers first — DetailView:35+287 (hero badge, deleted) and
  ConciergeGroupCard:12+67 (deleted). Order matters or `tsc` reddens. The
  `Difficulty` *type* stays (used by EntryModal:28, ConciergeGroupCard:14,
  domain). Only the `difficultyLabel` const export goes.
- **`applyReadingAiDifficultyScores`** (App.tsx:310): sole caller is
  `handleSaveReadingParseResult` (line 2056), which is deleted.
  `runAiEnhancementAnswerParse`'s reading branch does NOT call it (uses
  `saved.questionGroup` directly, 1609-1631). Safe to delete with the handler —
  confirmed, plan line 130-131's "DEV 核实副作用" resolves to: delete it, no READ
  dependency.

One dev-hard chunk is the right call — the deletions are interlocked (delete a
handler → orphan a state → orphan an import → break a verify assertion), and
`tsc -b` forces atomicity. Splitting would ship intermediate red builds. Keep
dev-hard, single context, no sub-agents (plan already forbids).

## Data-contract notes

- No schema / data-contract change. `difficulty` stays `NOT NULL`; both write
  paths (EntryModal submit, import→create-group) keep supplying `'medium'`.
  Verified the two literal defaults are data-field seeds, not UI state.
- `saveQuestionDifficultyRating` **server route** and DB columns untouched; only
  the now-caller-less client wrapper is removed. Backend contract intact.
- `readingParseResult.difficultyProfile` / `synonymDifficulty` fields on the
  `QuestionGroupDetail` type are KEPT (live reading-parse writes them; the
  detail view simply stops rendering the difficulty cards). No type-field
  removal — only the `difficultyLabel` UI const.

## Must Fix → Plan Disposition Checklist

| # | Must Fix | Concrete risk | Required disposition | Where in plan.md |
| --- | --- | --- | --- | --- |
| MF-1 | Spell out `verify-classic-retire-2` assertion **inversion** | Plan says "update"; the script asserts PRESENCE of deleted production controls + 5 trace sections (lines 61-64, 74-83) → guaranteed red under `verify:all` | Plan must state: invert those assertions to assert *absence* of 现场生产 buttons / difficulty cards / trace sections; keep the 编辑-button + passage + 加入草稿卷 + onOpenDetail-threading assertions | §硬契约 C7 + §Suggested Files verify bullet |
| MF-2 | Correct the verify-ci registry vs README claim | `verify-calibration-preview` is README-only (not registered) → "registry sync" is a no-op; only `verify-h12b` is registered (line 70) and must be removed or verify-ci spawns a missing file | Plan must say: remove `verify-h12b-difficulty-profile-grid.mjs` from `verify-ci.mjs` registry; delete both files; drop both from `scripts/README.md` | §Suggested Files verify bullets + §Verification C7 |
| MF-3 | Resolve the `formatSavedAt` assertion conflict | `verify-classic-retire-2:98` asserts `formatSavedAt` defined; its call sites are all deleted. If DEV also removes the assertion's target the gate breaks | Plan must choose: keep `formatSavedAt` in detailHelpers even though call-less, OR drop line-98's `formatSavedAt` from the asserted set — record which | §硬契约 C7 |
| MF-4 | Enumerate the `noUnusedLocals` hard-fail orphans | tsconfig `noUnusedLocals`+`noUnusedParameters` on + `tsc -b` in build → each orphaned import is a build failure, not a nit | Plan must list, as build-blocking: trim DetailView imports (drop `compactPreview`/`formatSavedAt`/`mainBlockerLabel`/difficulty helpers, KEEP `compactGroupMeta`/`getParseSavedAt`/`labelOf`); trim App.tsx:107 to `compactPreview` only; delete both `difficultyLabel` call sites before the export; do NOT delete `readingProfileLabels.ts` | §参考实现 detailHelpers bullet + §DEV Readiness tsc note |
| MF-5 | Name the EntryModal difficulty-field survivors | Plan says "keep a default write" but doesn't name the seeds; if DEV strips `difficulty` from `entryForm`/type, submit drops it → `NOT NULL` violation | Plan must state: delete only the `<select>` (EntryModal 362-372); KEEP `EntryFormState.difficulty` (line 28), `initialForm.difficulty` (68), and `deriveFormFromDetail`'s `difficulty: detail.difficulty` (109) | §参考实现 EntryModal bullet |

## Should Watch (non-blocking)

- SW-1: `openDetail` line 1166-1168 `setTopicLabelStatus('loaded')` must be
  deleted with the topic-label scratch state (plan already flags at line 113);
  the bound-label *display* reads `selectedDetail.topicLabels` and is unaffected.
- SW-2: `getParseSavedAt` (DetailView:983) drives `hasSavedParse` /
  `showCompareBox` for the member answer-compare box — it is READ display, keep
  it. Don't let it get swept up as "parse plumbing".
- SW-3: `difficultyCalibration.ts` and its exports (`computeCalibrationPreview`,
  `getReasonLabel`, `CalibrationInput`) have only detail-view callers — safe file
  delete once the difficulty blocks go.
- SW-4: `readingProfileLabels.ts` keeps a live consumer via `labelOf` (kept
  distractor block). Do not delete the file; only drop the `mainBlockerLabel`
  import from the detail view.
