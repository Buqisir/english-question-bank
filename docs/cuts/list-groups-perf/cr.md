# CR-lite: list-groups-perf

Reviewer: fresh CR context (reviewer ≠ implementer). Baseline `main` → branch
`claude/list-groups-perf` (commits `bf6c28a` plan, `87e45a7` impl). Level: L2-ish
(isolated runtime perf refactor, no response-shape / schema / UI change).

## Changed Scope

- `server/api.mjs` — extracted `PRINT_READY_AGGREGATE_SQL`, new pure
  `computePrintReadyJudgment(group, paperAssetMatch)`, `isGroupPrintReady` rewritten
  as thin wrapper (signature unchanged), new batch `getPrintReadyByGroupId` +
  helpers `selectPrintReadyAggregateRows` / `buildPaperAssetGroupIndex`;
  `selectQuestionGroupCards` swaps the per-row `isGroupPrintReady(db, id)` for one
  batch call.
- `scripts/verify-list-groups-perf.mjs` — new; registered in `verify-ci.mjs` + `README.md`.
- `scripts/verify-c8-print-ready-gate.mjs` — one moved-line assertion re-expressed as two.

No forbidden-scope touch: no schema, no API response shape/field, no `app/`
frontend, no `draftPaperStore.mjs`, no caching, no Caddy/deploy. Confirmed from the
diff file list, not the report.

## Findings

### Must Fix

None.

### Should Watch (non-blocking)

- **SQL variable ceiling (pre-existing, not introduced).** `getPrintReadyByGroupId`
  builds a `WHERE qg.id IN (?, ?, ...)` list from `rows.map(id)`. At 273 groups this
  is trivial. This is NOT a new risk: `getTopicLabelsForQuestionGroups` (api.mjs
  ~1073) already feeds the same `rows.map(id)` into an identical IN-list query on the
  same code path. node:sqlite's `SQLITE_MAX_VARIABLE_NUMBER` (32766 on modern SQLite)
  is the ceiling for both; the bank would need to 100x before it bites. Record only.
- **Single-path does an eager paper-asset scan.** New `isGroupPrintReady` calls
  `findPaperAssetGroup(groupId)` before `computePrintReadyJudgment`, so for a
  non-existent / non-print-ready group it now does a full dir scan the old code
  short-circuited past. Output is identical; the single path is no longer the hot
  path (cards list uses the batch). Cosmetic perf only.

### Nits

- verify-c8's print-ready assertions remain source-text regex (shape, not behavior)
  — a pre-existing property of that gate. Real behavioral parity is carried by the
  new `verify-list-groups-perf.mjs`, so acceptable.

## Semantic-Equivalence Verification (the un-CI'd judgment items)

1. **Judgment logic, branch-by-branch:** `computePrintReadyJudgment` is a verbatim
   lift of the old inline body — same order (`!group` → group_type gate →
   listening special-case → paperAsset priority → `question_count` →
   `missing_stem_count` → objective `missing_option_count` → writing/continuation
   material fallback `material_text→summary→instruction`), same exported reason
   strings verbatim. Group-type gate reads the DB row's `group_type`, matching old.
2. **"paper-asset hit but no DB row" case:** old and new both return `题组不存在`
   first (the `!group` guard precedes the paperAsset branch in both), because the
   aggregate SQL INNER JOINs `passages` in both single and batch paths. No divergence.
3. **Batch vs single SQL:** identical `PRINT_READY_AGGREGATE_SQL` + identical
   `GROUP BY qg.id, ...`; only the WHERE differs (`= ?` vs `IN (...)`). GROUP BY qg.id
   makes per-group COUNT/SUM identical whether selected singly or in a batch.
   Empty-list guarded (`if (groupIds.length === 0) return new Map()`).
4. **paper-asset index conflict (same groupId in multiple papers):** old
   `findPaperAssetGroup` returned the FIRST directory in `readdirSync` order whose
   asset contains the group. New `buildPaperAssetGroupIndex` iterates the SAME
   `readdirSync` order and guards with `!index.has(groupId)`, so first-dir-wins is
   preserved. `null`/missing → falsy → DB fallback in both.
5. **verify-c8 moved assertion:** old single regex asserted `findPaperAssetGroup` and
   `getPaperAssetPrintReady` within a 120-char window (broke because the two now sit
   in different functions). Re-expressed as two assertions: (a) the lookup exists,
   (b) `if (paperAssetMatch) return getPaperAssetPrintReady` — which preserves the
   original intent (paper-asset match bypasses DB-only option rows). Not a weakened
   gate; arguably a sharper one.

## Self-Review Blind Spots

- Parity is proven only over the 273 groups present in the local DB. The
  `题组不存在` (undefined aggregate row) branch is likely unexercised locally. Risk
  is negligible: single and batch both call `computePrintReadyJudgment(undefined, …)`
  → identical `题组不存在`; they cannot diverge by construction (same function, same
  SQL modulo an equivalent WHERE).
- Did not exercise the multi-paper-same-groupId conflict against a real fixture that
  actually contains a duplicate — judged equivalent by code reading (same iteration
  order + first-wins guard). If such duplicates exist in prod assets, the outcome is
  unchanged from `main`.

## Verification Evidence (re-run by CR, not copied)

- `node scripts/verify-list-groups-perf.mjs` → 6 passed / 0 failed; parity 273/273;
  batch 73ms (<1500ms). Parity assertion compares both `ok` AND `reason`, so it is
  failing-capable (not a "both truthy" tautology).
- `node scripts/verify-c8-print-ready-gate.mjs` → 33 passed / 0 failed.
- New script is registered in `scripts/verify-ci.mjs`, so the real gate runs it.
- Consumers of `isGroupPrintReady` (`draftPaperStore.mjs` x2, mocked in
  verify-c8-draft-paper-render-model) rely only on the unchanged `(db, groupId)`
  signature; `draftPaperStore.mjs` untouched by the diff.
- `verify:all` green claimed by DEV — accepted as CI-证实 per task; not re-run.

## Failure / Attack Angle

- If a future agent grows the bank past ~32k groups, the IN-list would throw — but
  that ceiling already exists on this path via `getTopicLabelsForQuestionGroups`, so
  this cut adds no new failure surface.
- A future edit to `computePrintReadyJudgment` reason strings would break both paths
  identically and be caught by the parity script + verify-c8 string gate — the
  refactor closed the drift risk rather than opening one.
- The only way batch could silently diverge from single is a WHERE-clause aggregation
  bug; GROUP BY qg.id neutralizes it, and the parity script would catch any residue.

## Residual Risk

Low. Pure mechanical extraction with byte-identical response shape, semantic
equivalence confirmed branch-by-branch, and a failing-capable parity gate now wired
into CI.

## Recommendation

APPROVE — mergeable. No Must Fix. Should Watch items are record-only and do not
block this merge.
