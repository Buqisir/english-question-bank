# Plan: list-groups-perf

Tier: medium-small (mechanical perf fix, no schema / response-shape change).

## Background (measured, not re-diagnosed)

`GET /api/question-groups` server-side time: prod 6.0s, local M-series 3.85s.
Profiling:

```
view query:              49ms  (273 rows)
isGroupPrintReady ×273: 4184ms  <- all of it
paper-asset scan (once):  ~10ms
```

Hotspot: `server/api.mjs` `selectQuestionGroupCards()` calls
`isGroupPrintReady(db, row.id)` once per row (N+1). Each call does:
1. A SQL query with JOIN + subquery aggregate, `WHERE qg.id = ?`.
2. `findPaperAssetGroup(groupId)` — reads + parses every paper-asset JSON
   file under `app/public/paper-assets` (34 dirs, ~11MB total) from scratch,
   until it finds a match. 273 rows = ~3GB of JSON parsed per request.

## Locked Product Decisions

- Response JSON must stay byte-identical to the pre-change shape (no field
  changes, no reordering visible to clients).
- No cross-request caching (no invalidation budget for this cut).

## Must Do

1. `getPrintReadyByGroupId(db, groupIds)`: one SQL call (aggregate rows for
   all `groupIds`, `WHERE qg.id IN (...)`) + one paper-asset directory scan
   building `Map<groupId, { asset, group }>`, then the same per-group judgment
   as before.
2. `computePrintReadyJudgment(group, paperAssetMatch)`: pure function holding
   the judgment logic, shared by both the single-row and batch paths (no
   duplicated logic).
3. `isGroupPrintReady(db, groupId)` keeps its exported signature and behavior
   (consumed by `server/draft-paper/draftPaperStore.mjs` and several verify
   scripts, some of which mock it) — becomes a thin wrapper around
   `computePrintReadyJudgment`.
4. `selectQuestionGroupCards` uses the batch function; the per-row
   `isGroupPrintReady(` call is removed from that function.

## Forbidden

- No schema change, no API response shape/field change, no `app/` frontend
  change, no `draftPaperStore.mjs` change, no payload trimming, no caching
  layer, no Caddy/deploy change.

## Verify

- `scripts/verify-list-groups-perf.mjs` (registered in `scripts/verify-ci.mjs`
  and `scripts/README.md`):
  - parity: `getPrintReadyByGroupId(db, ids)` vs. `isGroupPrintReady(db, id)`
    per id, over every question group in the real local
    `data/question-bank.sqlite` (273 groups) — ok + reason deep-equal.
  - source assertion: `selectQuestionGroupCards` body no longer contains a
    per-row `isGroupPrintReady(` call and does call the batch function.
  - perf smoke: batch call over all 273 groups < 1500ms.
- `pnpm -C app run verify:all` green.

## Measured before / after (local, 273 question groups)

| Stage | Before | After |
| --- | --- | --- |
| view query | 20-22ms | 20-22ms (unchanged) |
| print-ready computation (all rows) | 3875ms (N+1: 273 × isGroupPrintReady) | 39-55ms (1 SQL IN-query + 1 paper-asset scan) |
| total | ~3895ms | ~61ms |

Consistent with the diagnosed hotspot; the paper-asset directory scan now
runs once per request instead of once per question group.
