# CR-lite — ai-mode-filter-chips

Reviewer: 小川 (CR-lite, fresh cold-read session, did not write this diff)
Baseline: `main` → `cut/ai-mode-filter-chips` (HEAD `dc06624`)
Verdict: **APPROVE**  (Must Fix: 0 · Should Watch: 2)

---

## Changed Scope

Non-doc files (`git diff --name-only main...HEAD`):

- `app/src/concierge/filters.ts` — NEW pure module (C1): `buildFilterOptions`,
  `applyConciergeFilters`, `ConciergeFilters` / `ConciergeFilterOptions` types.
- `app/src/concierge/ConciergeDesk.tsx` — filter state + filter row render;
  STARTER_CHIPS removed; feed/results narrowing wired.
- `app/src/App.css` — `.concierge-filter-row` / `.is-selected` / clear buttons /
  filtered tag (reuses existing hex literals only).
- `scripts/verify-concierge-filters.mjs` — NEW (C8), registered in verify-ci.
- `scripts/verify-concierge-desk.mjs`, `scripts/verify-home-default-feed.mjs` —
  adapted for STARTER_CHIPS retirement.
- `scripts/verify-ci.mjs`, `scripts/README.md` — register the new script.

Docs: `plan.md` (new), `roadmap.md` (decision #6 owner revision, documented).

Server / schema / migration / API / `.sqlite` / `.sql`: **zero files touched**
(confirmed by name-filter over the diff). Forbidden list respected.

## PA-lite Downgrade Review (流程调优② CR duty)

Downgrade holds. The diff is pure client-side: one new pure-function module,
one component, CSS, verify scripts. No schema, no API semantics, no migration,
no server (verified by empty `git diff --stat` on `conciergeSearch.ts`,
`questionBankStewardService.mjs`, `server/**`). Revert cost = one PR. Product
direction is owner-confirmed (roadmap #6 revision, 2026-07-03). No PA artifact
needed; plan → DEV → CR was the right gate. **Accepted.**

## Hard-Contract Trace (file:line)

- **C1** pure module — `filters.ts:25-31` imports only domain types/labels, no
  React, no IO; verify imports it directly. Labels reuse `groupTypeLabel` /
  `sourceTypeLabel` (`filters.ts:113,135`), no new mappings. Fixed orders at
  `filters.ts:55-64`; unknown values appended (not dropped) at `:92-99`. **PASS**
- **C2** dual-source narrowing — feed: `applyConciergeFilters` runs BEFORE
  `buildDefaultFeed` (`ConciergeDesk.tsx:133-140`); results:
  `state.hits` filtered then re-run through the *same* `aggregatePaperResults`
  (`:156-163`), `state.hits` never mutated (derived useMemo). hitCount/hitContext
  stay consistent because they are re-derived from surviving hits, not carried
  stale. useMemo deps `[paperResults, filters, hasActiveFilters, state]` are
  complete (`state` covers `state.hits` changes). **PASS**
- **C3** pipeline zero-diff — `git diff --stat` on `conciergeSearch.ts`,
  `questionBankStewardService.mjs`, `server/**` is empty. No network path in the
  cut; filters are synchronous array ops. **PASS**
- **C4** honest empty set — results-narrowed-to-zero copy at
  `ConciergeDesk.tsx:294-303` ("筛选条件太严格…" + inline 清除筛选); feed-narrowed
  -to-zero at `:331-340`. Distinct from the true "没找到匹配" search-empty message
  (`:286-288`) and empty-corpus message (`:327-330`). No silent blank. **PASS**
- **C5** display timing — filter row gated `!dataLoading && (empty || results)`
  (`:222`); true-vacuum is `results`+0 hits, covered; `loading` / `clarification`
  excluded. reset() clause: see SW-1. **PASS (with watch)**
- **C6** color tokens — CSS adds `.is-selected` reusing #1A1A1A (×62 on main),
  #FFFDF8 (×32), #9A9180 (×10) — all pre-existing literals. No `:root` / no CSS
  custom property added or changed (grep confirmed). **PASS**
- **C7** STARTER_CHIPS removed — `const STARTER_CHIPS` gone from source; the three
  example strings gone; `submit(intentOverride?: string)` signature preserved on
  the hook (`useConciergeDesk.ts:80,266-268`) and now asserted by
  verify-home-default-feed Test 10. **PASS**
- **C8** behavior verify — `verify-concierge-filters.mjs` imports `filters.ts`
  directly; 22 assertions cover all four required areas with concrete numeric
  outcomes (reading=5, 浙江 first, 4-dim AND → exactly g9, impossible AND → [],
  feed composition sort preserved). Registered in `verify-ci.mjs:74`. **PASS**
- **C9** zero regression — `pnpm -C app run verify:all` → 66/66 pass, 0 fail;
  `tsc -b --noEmit` exit 0. **PASS**

## Findings

### Must Fix
None.

### Should Watch

- **SW-1 — C5 "reset() clears filters" is a no-op clause, not a defect.**
  `actions.reset` (`useConciergeDesk.ts:295`) has **zero call sites** app-wide,
  on both `main` and this branch (grep confirmed — no `.reset()` in App.tsx or
  ConciergeDesk). It is pre-existing dead code. So "reset clears filter state"
  cannot be wired to anything today, and DEV correctly did not fabricate a
  caller. This does not block: no user path reaches reset, so filters cannot be
  left stale by it. **Watch:** whenever a future cut wires a "重新开始" button to
  `actions.reset`, that cut must also clear the ConciergeDesk-local `filters`
  state (filters live in the component, not the hook, so reset() alone won't
  touch them). Record this in the cut that revives reset().

- **SW-2 — filter counts are global, not cross-dimension-narrowing.** Each chip
  shows a whole-corpus count (e.g. "浙江 84"); selecting 阅读理解 does not update
  the year/region counts to reflect the intersection. This is by design
  (plan 参考实现: "联动计数是 80 分打磨，不在本刀"). A teacher can pick an AND combo
  whose count badges suggest more results than actually render. C4's honest
  empty-state copy covers the zero case, so this is cosmetic, non-blocking.

## Self-Review Blind Spots

- I confirmed `tsc` compiles and verify:all is green, but I did not run the app
  in a browser. The `as never` cast in `toggleFilter` (`ConciergeDesk.tsx:237`)
  typechecks and the year string↔number round-trip is sound on paper
  (`String(number) === option.value` for selected-state; `Number(option.value)`
  stored; `group.year !== year` number-vs-number), but visual selected-state and
  actual click behavior are unverified by me — owner QA should click a year chip.
- I reasoned about hitCount/hitContext consistency from re-reading
  `aggregatePaperResults`'s contract (re-derives from hits), not from a rendered
  result. If the aggregator ever carried a memoized count outside the hit set,
  the re-run approach would still be correct, but I did not exercise the expanded
  paper-row badge visually.

## Verification Evidence (re-run by CR, not copied from report)

- `node scripts/verify-concierge-filters.mjs` → **22 passed, 0 failed**.
- `node scripts/verify-concierge-desk.mjs` → **246 passed, 0 failed**.
- `node scripts/verify-home-default-feed.mjs` → **38 passed, 0 failed**.
- `pnpm -C app run verify:all` (verify-ci) → **PASS 66 / SKIP 0 / FAIL 0**.
- `npx tsc -b --noEmit` (app) → exit 0.
- New script registered: `verify-ci.mjs:74`.
- Read Test 2/3/4 assertions in verify-concierge-filters: they assert concrete
  numeric outcomes and would fail on a filtering regression (not string-shape).
- Adapted verify scripts (concierge-desk / home-default-feed): the STARTER_CHIPS
  assertions were *replaced*, not deleted-for-green — the new assertions are
  positive (filter row present, gate correct, submit(intentOverride) signature
  preserved) and the C6 hex-literal chip-style assertions are retained unchanged.
  No gate loosened.
- Real corpus (`data/question-bank.sqlite` via `v_question_group_cards`) matches
  plan's stated distribution: 9 regions, years 2020-2026, 2 sourceTypes, 5
  groupTypes; no `未标地区`/empty region in live data, so the option-list
  exclusion of those sentinels hides no real data.

## Failure / Attack Angle

- **Stale-result attack:** if the results-narrowing useMemo dropped `state` from
  its deps, clearing a filter would leave stale filtered rows. Checked — deps are
  complete (`:163`), and `state.hits` is never mutated, so clearing filters
  restores full results without a re-search. Not exploitable.
- **Silent-drop attack:** a group with an unexpected groupType/sourceType could
  vanish from the option list. Checked — `orderedOptions` appends unknown values
  after the fixed order (`filters.ts:92-99`), so nothing silently disappears; only
  the `未标地区`/`未标` region sentinels are intentionally excluded, and those are
  absent from live data.
- **Fake-green attack:** the new verify passes by importing `filters.ts` and
  asserting real counts/AND outcomes, not by regexing source. verify-ci runs it.
  Cannot pass while filtering is broken.
- **Scope-creep / forbidden-touch:** confirmed from the diff file list — no
  server/schema/pipeline/color-token touched. The `.is-selected` state is new but
  reuses only pre-existing hex literals.
- **Misuse by a future agent:** the reset() no-op (SW-1) is the trap — an agent
  wiring a reset button would reasonably assume filters clear too. Flagged.

## Residual Risk

Low. Pure client-side narrowing on an already-loaded corpus; no persistence, no
network, no publish/export path. Worst realistic failure is a cosmetic count/
result mismatch (SW-2), covered by honest empty-state copy. Unverified surface is
purely visual (owner QA: click a year chip, an impossible AND combo, and 清除筛选).

## Recommendation

**APPROVE.** No Must Fix. Two non-blocking Should Watch items (reset() filter-
clear wiring for a future cut; global vs. narrowing counts by design). Mergeable
as-is.
