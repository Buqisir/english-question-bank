# CR-lite: add-to-draft-feel

Reviewer: fresh CR subagent (did not implement). Base `7dfd55b`, branch
`claude/add-to-draft-feel`, single impl commit `ec63c65`. Tier: medium / L3
(user-visible interaction + server perf). Diff read cold.

## Changed Scope

- `app/src/App.tsx` — new `patchDraftButtonState` helper; `addGroupsToBasket`
  rewritten to optimistic flip + `Promise.all` per-group confirm/rollback +
  fire-and-forget `refreshQuestionGroups`.
- `server/draft-paper/draftPaperStore.mjs` — `createDraftPaperStore` gains
  optional injected `getPrintReadyByGroupId`; `getDraftPaperItems` batched from
  N+1 to 1 card `IN` fetch + 1 print-ready call; empty-rows early return.
- `server/api.mjs` — injects existing `getPrintReadyByGroupId` into the factory.
- `scripts/verify-add-to-draft-feel.mjs` (new) + registered in `verify-ci.mjs`
  and `scripts/README.md`.

Forbidden scope confirmed untouched from the diff file-list: no
`features/paper-intelligence/**`, no PaperSurface, no `app/src/domain/**`, no
schema, no export/print-path. The patched fields `draftPaperButtonState` /
`currentDraftPaperId` already existed on `QuestionGroupCard`
(`questionBank.ts:40-41`) — no enum value added, no domain edit.

## Findings

### Must Fix
None.

### Should Watch (do not block this merge)

1. **Cross-click reconciliation flicker.** Within one `addGroupsToBasket` the
   single fire-and-forget `refreshQuestionGroups()` is issued only after all
   POSTs resolve, so the batch "select-many → add" path is race-free. But two
   *separate* rapid clicks (add A, then add B while A pending) each fire their
   own background GET; if GET-A (issued before POST-B landed, so B absent
   server-side) *arrives after* B's optimistic/confirm patch — or GET
   responses arrive out of order — `setQuestionGroups(serverGroups)` can
   transiently reset B to `'add'`. It self-heals on the next refresh (GET-B,
   route change, any reload) and single-user owner usage makes this unlikely.
   Not a Must Fix; record only. If it ever surfaces in QA, the fix is a
   response-sequence guard on `refreshQuestionGroups` (ignore stale responses).

2. **Optimistic `currentDraftPaperId` may be null on the very first add.** The
   optimistic patch (App.tsx:445) writes the app-level `currentDraftPaperId`
   memo, which is `null` when no active draft exists yet. During the sub-second
   window before the confirm patch supplies `outcome.draftPaperId`, the button
   already reads `'in_current_draft'`; clicking "进草稿卷" in that window would
   call `openDraftPaperWorkbench(null)`. The confirm patch (App.tsx:465) fixes
   it immediately after the POST resolves. Narrow, self-correcting; record only.

3. **Error-path behavior change (intended by plan).** Old code stopped adding
   on the first throw and skipped the refresh; new code attempts all groups in
   parallel, rolls back only failed ones (`rollbackPatches` is keyed off
   `!outcome.ok`), alerts the first error, and still runs the background
   refresh. This is per plan "Must Do 1" and is strictly better; noted so a
   future reader does not mistake it for drift.

## Self-Review Blind Spots

- I did not run a browser to observe the actual button flip timing or the
  cross-click race under a throttled network — that is QA's job, and the DEV
  report claims a 2.5s-delayed-fetch devtools check. The race in Should Watch #1
  is reasoned from the code, not observed.
- Print-ready *value parity* between `getPrintReadyByGroupId` and the old
  per-item `isGroupPrintReady` is inherited from `list-groups-perf`'s parity
  verify over the real DB; I confirmed both paths funnel through the same
  `computePrintReadyJudgment`, but did not re-run a full real-DB parity sweep
  specifically for the draft-item surface.

## Verification Evidence

- `pnpm -C app run verify:all` re-run by me: **PASS 67 / SKIP 1 / FAIL 0**
  (skip = off-repo `verify-i16a` fixture, pre-existing). Matches DEV claim.
- New `verify-add-to-draft-feel.mjs` re-run: 12/0. Behavioral half is real, not
  string-shape: it injects a throwing `isGroupPrintReady` (fires if the batch
  path regresses to per-item) and asserts `selectQuestionGroupCards` /
  `getPrintReadyByGroupId` are each called **exactly once** for a 5-item draft,
  with a `WHERE id IN (...)` clause carrying all 5 ids, and per-item
  `printReady`/`questionGroup` shape preserved — it would fail on regression.
- Existing mock-based suites re-run green with the now-optional param, proving
  the fallback branch stays live: `verify-c8-draft-paper-render-model` 30/0,
  `verify-user-scope` 50/0, `verify-restart3-teacher-analysis` 130/0.
- `verify-restart3` regex `createDraftPaperStore({...{0,200}paperAssetsDir,...}`
  survives: `getPrintReadyByGroupId` was inserted right after `exportDir`, and
  `paperAssetsDir` still sits ~141 chars inside the `{` in both the api.mjs call
  and the factory signature (< 200 window). Comment kept short, above the
  signature — original assertion semantics intact.

## Server equivalence check (batch vs N+1)

- Row order preserved (same `rows.map` over the same ORDER BY query).
- `Array.from(new Set(...))` dedup of group ids is output-neutral (each row
  still looks up its own card/judgment from the map).
- `groupMissing` short-circuit unchanged; the `|| {ok:false,reason:'题组不存在'}`
  tail on the print-ready lookup is effectively dead (map always has every
  requested id) — harmless defensive code, not a semantic change.
- `if (rows.length === 0) return []` early return is **required**, not cosmetic:
  it prevents an empty `WHERE id IN ()` SQL syntax error. Correct.
- Fallback branch (`getPrintReadyByGroupId` omitted) eagerly calls
  `isGroupPrintReady` for missing-group ids too, where the old ternary skipped
  them; output is identical because those results are discarded by the
  `groupMissing` short-circuit, and the mock suites above exercise this path
  without failing.

## Failure / Attack Angle

The most plausible way this bites in production is Should Watch #1: an owner
adding several groups via separate rapid card clicks on a slow network could see
a just-added button briefly revert to "加入草稿卷" if a stale background refetch
lands last. It cannot corrupt persisted state (server is source of truth; the
add POST already committed) and heals on any subsequent refresh — a cosmetic,
self-correcting flicker, not data loss. No fake-green: the behavioral verify
runs the real store and would fail if the batch collapsed back to per-item.

## Residual Risk

Low. Client change is presentation-state only; server change is a proven
output-equivalent perf batching behind an optional param with live fallback
coverage. No persistence/export/schema surface touched.

## Recommendation

**APPROVE.** No Must Fix. Merge as-is; carry the three Should Watch items into
QA (especially the rapid multi-click flicker) but do not expand this cut for
them.
