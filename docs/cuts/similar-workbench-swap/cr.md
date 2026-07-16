# CR — similar-workbench-swap (E7：工作台⇄换篇)

- Reviewer: fresh CR (cold read, independent context), 2026-07-16
- Diff: `git diff main...wt-similar-workbench-swap` (12 files, +958/-8)
- Level: L3 (user-visible interaction) / medium cut · PA-lite
- Verify facts (pipeline, real exit 0, not re-run): build green;
  verify-similar-workbench-swap 34/34; verify:all green; DP-2 37 assertions
  green (scenarios ①–⑥).

## Verdict: APPROVE WITH MUST FIX

One Must Fix (cheap ordering remedy), three Should Watch. Scope, Forbidden,
and the PA-lite downgrade all hold. The two big adjudication points the DEV
flagged both resolve in the implementation's favor — see below.

---

## Adjudication of the two flagged points

**1. persistItems vs `POST /api/draft-papers/:id/items` — LEGITIMATE.**
plan §4 wrote "走 persistItems 落库", but persistItems only ever touches
order/pageBreakBefore on *existing* item ids — it cannot swap a slot's
*content*. Adding a new group to the volume genuinely requires the item-create
endpoint, which **already existed pre-cut** (`draftPaperRoutes.mjs:114`, reads
`insertIndex` + `pageBreakBefore` from body; `draftPaperStore.mjs:779/796`
clamps insertIndex and honors pageBreakBefore). So `services/draftPapers.ts`
`addGroupToDraftPaper` is a thin client wrapper over an existing route, server
untouched (Forbidden respected). This is a correct reading of the plan's
intent, not a bypass. 承位 + pageBreakBefore preservation is real: after the
seed is deleted, inserting at the *original* seedIndex lands the candidate back
in the seed's exact slot (post-delete left-shift makes the indices line up),
with the seed's own pageBreakBefore threaded through. Verified against the
store math.

**2. "中间态会不会落库半截" — YES, and it is the one Must Fix.** See MF-1.

---

## Must Fix

### MF-1 — `applySwapReplace` is a non-atomic delete→add; partial failure silently loses the seed with no recovery
`DraftPaperWorkbench.tsx:424-466` (`applySwapReplace`).

The replace is two sequential server round-trips: `deleteDraftPaperItem(seed)`
then `addGroupToDraftPaper(candidate)`. Local `setDraftPaper` only runs on the
*success* path. If the **delete succeeds but the add fails**:
- Server: the seed item is permanently gone, no replacement added → the
  teacher's paper silently loses a question.
- Local UI: unchanged (still shows the seed) — no undo snapshot is set on the
  catch path (`deleteResult.removed` is discarded), only an error toast.
- Retry is **stuck**: `deleteDraftPaperItem` on the already-deleted seed throws
  "Draft item not found" (`draftPaperStore.mjs:992`), so a second 替换 attempt
  fails in the same way. The loss only surfaces after a page reload, with no
  undo.

This contradicts the plan's whole framing of 替换 as "可撤销"/safe, and the
failure path is uncovered by DP-2 (which never injects a mid-op failure) — so
verify does not prove it safe. Probability is low (localhost sqlite, both calls
hit the same just-answered server), which is why this is a two-line remedy, not
a redesign — but silent loss of persisted work-product with no recovery is
above the bar for this mainline tool.

**Proportionate remedy (pick one):**
- Preferred: **add-before-delete.** Insert the candidate at `seedIndex + 1`
  with the seed's pageBreakBefore, capture its item id, *then* delete the seed
  at `seedIndex`. Final slot + pageBreakBefore are identical (verified), but a
  partial failure now leaves a visible, self-correctable duplicate instead of
  silent loss, and the seed is never at risk. Undo snapshot logic is unchanged.
- Or keep the order and, in the `catch`, when `deleteResult` exists, best-effort
  `restoreDraftPaperItem(deleteResult.removed)` before surfacing the error.

---

## Should Watch

- **SW-1 — stale `swapSeedItemId`/`swapRequest` survive a draft reload.**
  `handleSwapToggle` keys the drawer to an item id; if `draftPaper` reloads
  (e.g. `loadDraft`) while the drawer is open and the seed id no longer
  resolves, `swapSeedItem` becomes null and the drawer correctly falls back to
  the directory (`swapDrawer` needs both `swapSeedItem && swapRequest`), but
  `swapSeedItemId`/`swapRequest` remain set to stale values. Benign today
  (nothing renders off them once the seed is gone), but worth a reset-on-load
  guard if drawer state ever gains a persisted surface.

- **SW-2 — replace's optimistic window vs the undo-toast promise.** On the happy
  path the paper visibly has the seed removed and candidate inserted only after
  *both* awaits resolve (no flicker, good), but for a large draft the two
  serial round-trips mean a perceptible "saving" gap where neither snapshot is
  live. Not a defect — just note the interaction is two network hops, unlike
  the single-hop reorder undo it mirrors.

- **SW-3 — DP-2 coverage is happy-path + snapshot-invalidation only.** Scenario
  ⑥ proves the replace-undo snapshot is invalidated by a later mutation, but no
  scenario exercises the add/delete *failure* paths (MF-1) or the thin/already-
  in-draft disable states beyond the static drawer render. verify-* asserts the
  disable *logic* statically; the runtime disabled-button behavior rides on the
  static assertion, not a click. Acceptable for this cut; note for any future
  hardening pass.

---

## Cleared (checked, no finding)

- **撤销快照互斥**: mutual exclusion is fully wired. Every `setReorderUndoSnapshot`
  creation site (`applyReorderSuggestion:901`) is preceded by `clearReplaceUndo()`,
  and `applySwapReplace` sets `replaceUndoSnapshot` only after `clearReorderUndo()`.
  The five "other mutation" handlers (moveItem/handleDrop/togglePageBreak/
  deleteItem/undoDelete) plus applyReorderSuggestion and both swap actions all
  clear *both* snapshot kinds. No double-snapshot path. verify §3 anchors this.
- **Two anchor updates only realign to landed behavior, no weakening.**
  verify-error-copy-mainline 14→18 describeError sites (+4: load .catch +
  3 try/catch) and catchBlocks 13→16 (+3) — counts match the diff exactly, the
  gate (no catch clears draftPaper/titleDraft) is unchanged.
  verify-draft-workbench-visual-unify whitelist 697→710 is a pure line-number
  shift for a #ffffff hex pin; the new `.draft-swap-drawer` rule has no hex.
  The other 7 authorized anchors were untouched and pass under verify:all —
  evidence they needed no change, not a missed red.
- **App.tsx payload**: `questionGroupById` already built (`App.tsx:298`) and
  already passed to another consumer (`:1094`); the cut threads the same map
  reference to one more consumer (`:979`). Pure reuse, zero new page-load cost.
- **SimilarPassagesPanel not extended**: DEV built a sibling `DraftPaperSwapDrawer`
  in DraftPaperRail.tsx, importing only the existing exported *type*
  `SimilarPassagesRequestState` and function `similarPassagesRecipeSummary`
  (SimilarPassagesPanel.tsx unchanged). E6/detail consumers behavior zero
  change — Forbidden's "backward-compatible optional props only" is satisfied
  by touching nothing at all.
- **Forbidden**: diff touches only App.tsx / DraftPaperRail / Workbench.css /
  Workbench.tsx / services/draftPapers.ts / scripts / qa. No server/**, domain,
  schemas, papersurface, or *Adapter. reorder-suggest 30-assertion mock flow
  untouched; drag handlers only gained an additive `clearReplaceUndo()` call.
- **⇄ gate**: exactly reading/cloze/seven_choices/grammar_cloze; writing hidden
  (隐藏式降级). Button only renders when `item.questionGroup` exists, so the
  recipeSummary/seedTitle fallbacks are never actually exercised.
- **加入 邻插**: insertIndex = seedIndex + 1, drawer stays open, and `draftGroupIds`
  recomputes so the just-added candidate self-disables. Correct per plan §4.

## PA-lite downgrade — holds
No contract/schema/server surface; existing endpoints only; additive +
reversible. MF-1's atomicity concern is an implementation defect, not a
contract-semantics touch, so it does not retroactively require full PA.

## Self-Review Blind Spots (for any later Big CR)
- MF-1 add-before-delete remedy: I verified the index/pageBreakBefore math on
  paper but did not run it — a Big CR should confirm the reordered version still
  passes DP-2 ② (slot + pagination position restored) after the fix lands.
- Undo restore ordering (`undoSwapReplace` deletes added item then restores seed
  at `orderIndex-1`): correctness rides on DP-2 ②'s green result, not on my own
  trace of `restoreDraftPaperItem`'s 1-based orderIndex convention.

## MF/SW 处置（PM，2026-07-16 当场收）

- **MF-1 ✅ 按 CR 方子修**（aa2ec72+933711d）：`applySwapReplace` 改
  **先加后删**——加入失败=卷面零变化可重试；加入成功删除失败=可见相邻
  重复+诚实文案「原篇仍在卷中，可手动移除」（不设撤销快照，如实半截态）。
  连带修正撤销坐标：restore 端点 orderIndex 为 1-based，快照改取
  **操作前** `swapSeedItem.orderIndex`（先加后删序下 removed.orderIndex
  被插入推后一位，按它恢复错一格——DP-2 ② 撤销复原断言当场抓到实证）。
  **回归锚**：DP-2 新增场景⑦（route 拦截 DELETE 强制失败 → items+1 可见
  重复/原篇零丢失/无撤销 toast/手动移除自愈），44/44 绿；error-copy 两
  计数锚正当 +1（19 调用点/17 catch，注释注明出处）。
- SW-1（reload 后 swap 态残留陈值）/SW-2（两跳 saving 空窗提示）/
  SW-3（disable 态运行时未点）挂账不收，见上文。
