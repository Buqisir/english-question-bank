# Plan: add-to-draft-feel

Tier: medium (client optimistic UI + server perf batching, no schema / API
response-shape change).

## Background (owner 实测报障 2026-07-08)

加题后按钮要 1-2 秒才显示"进草稿卷"，体感严重。Two independently diagnosed
causes, both already-known hotspots this cut collects:

1. Client — `app/src/App.tsx` `addGroupsToBasket` (previously ~:406-428): after
   adding each group, `await refreshQuestionGroups()` — a full
   `/api/question-groups` refetch (~504KB) — before the button's
   `draftPaperButtonState` ever updates. On the production network path this
   refetch alone is the 1-2s.
2. Server — `server/draft-paper/draftPaperStore.mjs` `getDraftPaperItems`
   (the plan's "listItems") called `selectQuestionGroupCards(bankDb, 'WHERE
   id = ?', [groupId])` + `isGroupPrintReady(bankDb, groupId)` once **per
   draft item**. Each call re-scans the whole `app/public/paper-assets`
   directory (34 dirs, ~9-11MB JSON) from scratch — an N-item draft did up to
   2N full scans. `docs/cuts/list-groups-perf/plan.md` already fixed the
   equivalent N+1 in `GET /api/question-groups` via a batch function
   (`getPrintReadyByGroupId`) but explicitly left `draftPaperStore.mjs` out of
   scope — this cut collects that debt.
3. Related: E2E cut #276 reported the detail-page add button not refreshing
   in place after adding, same root cause (button state lived on a component
   never touched by the blocking refresh).

## Locked Product Decisions

- Optimistic client state may only touch `draftPaperButtonState` /
  `currentDraftPaperId` on `QuestionGroupCard` — no other field is patched
  optimistically, and no new enum value is added to
  `draftPaperButtonState` (stays `'add' | 'in_current_draft' | 'disabled'` —
  `app/src/domain/questionBank.ts` is out of this cut's scope; the plan's
  "加入中" framing is implemented as an immediate flip to `'in_current_draft'`
  followed by confirm/rollback, not a third UI state).
- Server print-ready judgment semantics for draft items are unchanged
  (`printReady`/`printUnavailableReason` per item are byte-identical to what
  the old per-item calls produced) — only the fetch shape changes from N+1 to
  batch.
- `addGroupToDraftPaper` (the single-item add write path) keeps its existing
  2-call (1 card fetch + 1 print-ready check) shape — it is inherently a
  1-item operation, not worth widening the diff for.

## Must Do

1. Client (`app/src/App.tsx`):
   - `addGroupsToBasket` patches `draftPaperButtonState`/`currentDraftPaperId`
     to `'in_current_draft'` immediately (before the add request resolves),
     via a new `patchDraftButtonState` helper that updates both
     `questionGroups` and `selectedDetail` (so the detail-page button — #276
     — reflects the change too, since it renders from `selectedDetail`, a
     separate piece of state from the list).
   - Each group's add request runs independently (`Promise.all`); on success
     the group's `currentDraftPaperId` is confirmed from the response
     (`addGroupToCurrentDraftPaper` already returns the full `DraftPaper`
     with `id` — no server response-shape change needed); on failure the
     group is rolled back to its pre-click state and the existing
     `window.alert(...)` error path fires.
   - `refreshQuestionGroups()` is called unawaited (fire-and-forget) after
     the above, as background reconciliation only — it must never block the
     button feedback.
2. Server (`server/draft-paper/draftPaperStore.mjs` + `server/api.mjs`):
   - `createDraftPaperStore` gains an injected `getPrintReadyByGroupId`
     (optional — falls back to per-id `isGroupPrintReady` calls if omitted,
     so existing test doubles that don't provide it keep working).
   - `getDraftPaperItems` now does one `selectQuestionGroupCards(bankDb,
     'WHERE id IN (...)', groupIds)` call + one `getPrintReadyByGroupId(bankDb,
     groupIds)` call for the whole draft, then looks up each row from the
     resulting maps — zero per-item calls in the loop.
   - `server/api.mjs` injects its exported `getPrintReadyByGroupId` (already
     built by `list-groups-perf`) into the `createDraftPaperStore(...)` call.

## Forbidden

- No touch to PaperSurface / `features/paper-intelligence/**` (another cut in
  flight there).
- No schema change, no export/print-path change.
- No unrelated `App.tsx` refactor (950+ line debt stays out of this cut's
  scope).
- No new `draftPaperButtonState` enum value / no `app/src/domain/**` edit.

## Verify

- `scripts/verify-add-to-draft-feel.mjs` (new, registered in
  `scripts/verify-ci.mjs` + `scripts/README.md`):
  - source: `addGroupsToBasket` no longer contains `await
    refreshQuestionGroups(`, does contain `void refreshQuestionGroups(`, and
    calls `patchDraftButtonState(` before the add requests are awaited.
  - behavioral: a real `createDraftPaperStore` + a real
    `ensureUserDatabaseShape`-built user DB with a 5-item draft — calling
    `store.getDraftPaper(...)` invokes the injected
    `selectQuestionGroupCards`/`getPrintReadyByGroupId` exactly ONCE each
    (was once per item before), with a `WHERE id IN (...)` clause carrying
    all 5 ids, and returns the same per-item `questionGroup`/`printReady`
    shape as the old per-item path.
- Existing suites that mock `isGroupPrintReady`/`selectQuestionGroupCards` on
  `createDraftPaperStore` (`verify-c8-draft-paper-render-model.mjs`,
  `verify-user-scope.mjs`) re-run unchanged and green — the new injected
  param is optional, so their mocks did not need updating.
- `verify-restart3-teacher-analysis.mjs`'s
  `createDraftPaperStore({...paperAssetsDir,...})` source-regex assertion
  re-verified green (the new `getPrintReadyByGroupId` param insertion had to
  keep `paperAssetsDir` within the regex's 200-char window — comment was kept
  short and moved above the function signature for this reason).
- `pnpm -C app run verify:all`: 67 passed / 1 skipped (pre-existing, off-repo
  fixture) / 0 failed.
- `pnpm -C app run build`: clean.

## Measured before / after (local, 5-item draft, real
`data/question-bank.sqlite` + real `app/public/paper-assets`, ids spread
across different papers — not all short-circuiting on the same
early-found paper-asset directory)

| Path | Time (avg of 10 trials, warm) |
| --- | --- |
| before (5× sequential `isGroupPrintReady` calls) | 81.48ms |
| after (1× batched `getPrintReadyByGroupId` call) | 26.51ms |

~3.1x speedup for a 5-item draft; the gap widens with more items (each old
call still incurs its own paper-asset scan while the new path stays at one
scan regardless of N). Timing script was a temporary local-only script (not
committed).

Client-side: the blocking `refreshQuestionGroups()` (504KB payload) is
removed from the button's critical path entirely — QA confirmed the button
flips before that fetch even starts, including under a simulated slow
network (fetch delayed 2.5s in devtools).
