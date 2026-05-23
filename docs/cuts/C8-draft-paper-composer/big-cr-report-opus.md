# C8 PR A Big CR Report — Opus

Reviewer: external Opus Big CR, acting under `docs/agents/pa-persona.md`.
Cut: C8 — Draft Paper Composer / 草稿卷组卷与个人空间 V1 (PR A).
PR: #93 (`codex/c8-pra-draft-paper-composer-clean`).
Base reviewed against: `main` at `e286a22` (post-PR #94 process
hardening, post-PR #92 C8 planning).
Head reviewed: `0bf471a` (`fix: prevent leading draft page breaks`).
Mode: code review only; no edits to runtime, tests, or product docs.
This is the single artifact produced by this review.

Files read end-to-end:

- `docs/cuts/C8-draft-paper-composer/{agent-entrypoint,pm-spec,decisions,pa-review-opus,handoff}.md`
- `docs/agents/{pa-persona,review-levels}.md`
- `data/sql/schema.sql` (delta)
- `server/api.mjs` (delta + draft-paper section read in full)
- `app/src/features/draft-paper/DraftPaperWorkbench.{tsx,css}`
- `app/src/services/draftPapers.ts`
- `app/src/domain/questionBank.ts` (delta)
- `app/src/concierge/ConciergeGroupCard.tsx` (delta)
- `app/src/App.tsx` (delta in `addGroupsToBasket`, draft route hook-up)
- `app/src/paperAssembly/{basketPersistence,usePaperDraft}.ts`
- `app/src/data/sampleQuestionGroups.ts` (delta)
- `scripts/verify-c8-{draft-paper-contracts,draft-paper-render-model,print-ready-gate,forbidden-scope}.mjs`
- `scripts/smoke-c8-draft-paper-composer.mjs`
- Leading-page-break fix commit `0bf471a` in full

---

## 1. Verdict

**APPROVE WITH CHANGES.**

PR A implements the full search → 加入草稿卷 → A4 preview → reorder /
page break / delete-with-undo → PDF/print loop, end-to-end, with all
six Must Fix items from the PA review (MF1–MF6) honoured:

- MF1 (Draft Paper as distinct entity): `draft_papers` /
  `draft_paper_items` tables added; `paper_sets` untouched.
- MF2 (print-ready gate as a single function): `isGroupPrintReady(db,
  groupId)` exported, used by both search derivation and add-to-draft
  insertion. Verify script asserts every reason path.
- MF3 (server-side page-break heuristic locked): three deterministic
  rules in `buildPageBreakSuggestions`, mirrored in
  `decisions.md`, asserted in `verify-c8-print-ready-gate.mjs`.
- MF4 (Assembly Basket retirement + one-time migration):
  `saveAssemblyBasket` is a no-op; `loadAssemblyBasket` retained for
  read-only migration; `clearLegacyBasket` runs after server-side
  `POST /api/draft-papers/migrate-assembly-basket` succeeds.
- MF5 (preview = PDF parity): both `GET .../print-html` and
  `POST .../print-pdf` consume the same `buildDraftPrintHtml`, which
  calls `buildPrintHtml` from `server/print-renderer.mjs` without
  modification. Verify asserts byte-equal print-renderer body vs
  `main`.
- MF6 (Apply-scope guard): `verify-c8-forbidden-scope.mjs` enforces
  no PaperSurface / reading-analysis / paper-intelligence /
  paper-assets / My Space changes in this PR.

The headline must-fix from the prompt — preventing a leading page
break / blank first page — is correctly resolved in three places
(renderer block builder, suggestions builder, UI page-break toggle
+ marker visibility), with two new render-model assertions and one
new smoke assertion guarding regression.

Blocking issues: **none**.

Non-blocking issues that should be fixed in this PR if quick (MF*),
otherwise tracked: **4 Must Fix**, **8 Should Watch**.

The cut is at L3 (user-visible UI / route / interaction). Browser
smoke covers the visible loop; verify scripts cover the contract.
Reviewability is acceptable: ~2750-line diff against a clean base, no
schema deletes, no breaking migration, no forbidden-scope touches.

---

## 2. Must Fix (blocking on this PR)

### MF-CR-1 — `GET /api/draft-papers/:id` writes via `markCurrentDraftPaper`. Read paths must not mutate global state.

`server/api.mjs` ~11430:

```
if (request.method === 'GET' && draftPaperMatch) {
  const db = openDatabase({ readOnly: false })
  ...
  markCurrentDraftPaper(db, id)        // ← side-effect on GET
  sendJson(...)
}
```

A `GET` request flips the global `current_marker` for the entire DB.
Concrete failure modes:

1. The "最近草稿卷" `<select>` in the workbench calls
   `fetchDraftPaper(id)` whenever the teacher switches drafts. That
   call silently demotes whichever draft was "current" before. If the
   teacher meant only to *peek* at an old draft, the current draft
   they had been adding to is no longer current. Next time they hit
   `加入草稿卷` from a search card, the group lands in the *peeked*
   draft.
2. The workbench's initial load goes through `fetchDraftPaper(id)`
   when `draftPaperId` is present in the URL. Bookmark links to old
   drafts become "set current" links — opening a bookmark from a week
   ago resets the current draft pointer.
3. Browser smoke does not exercise multi-draft switching, so this
   regression sails through CI today.

**Fix:** remove the `markCurrentDraftPaper(db, id)` line from the
`GET` handler. Promoting "current" should only happen on explicit
write actions (add group, patch item, delete item, update title) —
each of which already calls `markCurrentDraftPaper`. The decisions
ledger says "Adding a group defaults to the current draft"; it does
not say "reading a draft makes it current."

If product wants "open old draft = make it current," that needs to
be an explicit POST/PATCH and stated in `decisions.md`. Today the
implementation does it implicitly on every read, which is the worst
of both worlds.

### MF-CR-2 — `addGroupToCurrentDraftPaper` has a TOCTOU race on the create-if-missing branch.

`server/api.mjs` ~702:

```
function addGroupToCurrentDraftPaper(groupId) {
  ...
  db.exec('BEGIN')
  try {
    let current = getCurrentDraftPaperRow(db)
    if (!current) {
      createDraftPaper(db)                // ← internally UPDATEs
      current = getCurrentDraftPaperRow(db)
    }
    ...
```

`createDraftPaper` runs:

```
db.prepare('UPDATE draft_papers SET current_marker = 0 WHERE current_marker = 1').run()
db.prepare('INSERT INTO draft_papers ... current_marker = 1 ...').run(...)
```

There is no DB-level uniqueness constraint on `current_marker = 1`.
Two near-simultaneous `POST /api/draft-papers/current/items` calls
on a clean database — e.g. teacher rapidly clicks 加入草稿卷 twice in
the same second — can both pass the `if (!current)` check, both
attempt `createDraftPaper`, and end up with two `current_marker = 1`
rows. `getCurrentDraftPaperRow` then resolves by
`ORDER BY updated_at DESC LIMIT 1`, masking the duplicate state but
leaving stale `current_marker = 1` rows in the table.

V0 single-user local makes the window narrow, but Node's HTTP server
does not serialize request handling. The smoke test happens to use
sequential awaits, so it does not exercise this.

**Fix:** add `CREATE UNIQUE INDEX idx_draft_papers_current_one ON
draft_papers(current_marker) WHERE current_marker = 1` (SQLite
supports partial unique indexes). Or, simpler: hold a JS-level mutex
in `addGroupToCurrentDraftPaper` and `getOrCreateCurrentDraftPaper`
that serializes the "create if missing" step. The first option is
more honest; the constraint then makes any future bug in the manual
current-marker juggling fail loudly instead of silently.

### MF-CR-3 — Migration endpoint takes unvalidated `groupIds` and runs them through `addGroupToDraftPaper` inside one transaction, but errors are silently swallowed.

`server/api.mjs::migrateAssemblyBasketToDraftPaper` ~849:

```
for (const groupId of groupIds) {
  try {
    addGroupToDraftPaper(db, draft.id, groupId)
    migratedCount += 1
  } catch {
    skippedCount += 1
  }
}
```

`addGroupToDraftPaper` throws `printReady.reason` on a non-print-ready
group. The teacher's localStorage basket from the pre-C8 days will
include groups that fail the C8 print-ready gate — e.g. listening
groups, groups with empty stems left over from old imports. The
migration succeeds (no error visible to the user) but `skippedCount`
is never surfaced back to the workbench.

The workbench client receives `{ migratedCount, skippedCount, draftPaper }`
and uses only `draftPaper`. The teacher is told nothing. They open
the workbench, see fewer groups than they expected, and have no
explanation.

**Fix:** at minimum, when `skippedCount > 0`, show a status row in
the workbench (or a toast on first load) like
"已迁移 N 个题组到草稿卷；M 个题组因不可打印被跳过". The data is already
in the migration response; surface it.

A stronger fix: include the list of skipped `(groupId, reason)`
pairs so the teacher knows which groups were dropped. The client
already has the basket in localStorage at migration time; cross-ref
is trivial.

### MF-CR-4 — Smoke "Search add" assertion locator is too loose for the second similar-named group.

`scripts/smoke-c8-draft-paper-composer.mjs` ~180 seeds two groups
both with passage title `'分页建议压力测试'` (the cloze fixture and
the reading group that overrides the passage_id to `passage-c8-smoke-cloze`):

```
INSERT OR REPLACE INTO question_groups (id, passage_id, group_type, title, ...)
VALUES ('g-c8-smoke-pagebreak', 'passage-c8-smoke-cloze', 'cloze', '分页建议压力测试', ...);
INSERT OR REPLACE INTO question_groups (id, passage_id, group_type, title, ...)
VALUES ('g-c8-smoke-reading', 'passage-c8-smoke-cloze', 'reading', 'C8 第二题组', ...);
```

Both groups end up rendered under the same `passageTitle = '分页建议压力测试'`
because they share `passage_id`. The smoke filters by:

```
const pageBreakCard = page
  .locator('.concierge-group-card')
  .filter({ hasText: '分页建议压力测试' })
  .filter({ hasText: '5 题' })
  .first()
```

The second filter `.filter({ hasText: '5 题' })` is the only thing
distinguishing the two cards. If the rendering of "5 题" ever
changes (e.g. localisation, or "5道题"), the filter matches zero
cards and the test fails for a reason unrelated to product
regression. Worse — if the *reading* group ever gets 5 questions,
both cards match and `.first()` picks one ambiguously.

This is brittle but not currently broken. The deeper problem is
that the smoke fixture seeds an artificial scenario where two
question_groups share a passage, which the production code does not
prohibit but the search UI does not expect. The smoke isn't proving
the search UX; it's proving "I can find one specific row."

**Fix:** seed the two groups with distinct passages so card filtering
is unambiguous, then assert `'5 题'` once explicitly to prove the
right card. Or filter by a `data-question-group-id` attribute if the
concierge card carries one (it does — `[data-ra-group-id]` exists for
the analysis link; add `data-group-id` to the card root and the
smoke becomes deterministic).

---

## 3. Should Watch (non-blocking)

### SW-CR-1 — `findPaperAssetGroup` is O(papers × groups) per `/api/question-groups` request.

`isGroupPrintReady` is called once per group in `selectQuestionGroupCards`'s
loop, and `findPaperAssetGroup` walks every paper-asset directory and
reads `paper-asset.json` until it finds a match. For N groups × M papers
that is N × M filesystem reads + N JSON parses per search-list response.

Today M = 1 (only the 九省联考 paper). When M = 10, the question-groups
list endpoint will slow noticeably.

Recommendation: cache `groupId → paperAssetMatch` once per server boot,
or build it lazily and reuse across `isGroupPrintReady` calls within a
single request. The pattern already exists for
`paperSurfaceAnalysisAvailabilityByGroupIdCache`. Not blocking C8 PR A,
but flag in the cut note so the next paper import doesn't quietly
regress search latency.

### SW-CR-2 — `getDraftPaper(includePrintHtml=true)` rebuilds `buildPrintHtml` on every read.

`GET /api/draft-papers/current` and `GET /api/draft-papers/:id` both
synchronously rebuild `buildPrintHtml` (which loads each group's full
detail via `getQuestionGroupDetail` per item) before responding. The
workbench's auto-save round-trip therefore touches the entire question
bank detail layer for every reorder, page-break toggle, or title edit.

For a 6-group draft this is a few hundred ms; for a future 30-group
draft (well within the spec's "max output unit is paper") it could be
seconds. Auto-save will visibly lag.

Recommendation: defer print-HTML rebuild to a separate
`GET .../print-html` request (which already exists), or cache the HTML
keyed by `(items hash, title)`. The workbench can request the preview
HTML when the iframe mounts and skip it on auto-save round-trips.
Acceptable to defer to PR B follow-up.

### SW-CR-3 — `buildPrintHtml` does not understand `data-source-*` suppression.

Verify asserts the print HTML does not leak the "答案版" / "解析版"
strings, which is correct. It does **not** assert source metadata
(`year / region / paperName / section`) is absent from the print HTML.
PM spec / decisions explicitly say "Source metadata is retained for
teacher-side editing, but it is not printed and not shown inside the
A4 preview."

I traced `buildPrintHtml` (unchanged in this PR) and `buildDraftPaperBlocks` —
neither emits source metadata into HTML. So in practice the rule is
honoured. But the verify scripts do not actually assert this. If a
future cut adds `data-source` attributes or breadcrumb chrome to the
shared `buildPrintHtml`, C8 will silently leak.

Recommendation: add one assertion to `verify-c8-draft-paper-render-model.mjs`:
"draft render HTML does not contain `year`, `region`, or
`paperName` substrings from the fixture." This is a 2-line addition
and locks the rule.

### SW-CR-4 — `printHtml` in the workbench iframe relies on browser print emulation, not Vivliostyle, for the preview-vs-PDF parity.

The iframe `srcDoc={draftPaper.printHtml}` renders the same HTML the
PDF endpoint feeds Vivliostyle. The visual result is **not byte-equal**
— Chrome's iframe rendering and Vivliostyle's print pagination engine
differ on font metrics, page-break placement, and `@page` footer
positioning.

This is acceptable for V1 ("share one rendering model as much as
possible") but should be a watch item: when teachers see preview ≠
final PDF on the page break boundaries, they will report it as a bug.

Recommendation: record in `handoff.md` that PR B (or a follow-up) may
need to either:
- ship a CSS print-stylesheet variant for the iframe that matches
  Vivliostyle's `@page` interpretation more closely, or
- accept a documented "preview is approximate; PDF is canonical"
  caveat in the toolbar.

Not blocking PR A.

### SW-CR-5 — `restoreDraftPaperItem` accepts `pageBreakBefore` from client input but does not re-validate.

On undo, the client sends back `{ groupId, orderIndex, pageBreakBefore }`
that it captured before delete. The server inserts via
`addGroupToDraftPaper`, which respects `pageBreakBefore`. There is no
re-check that the resulting `orderIndex === 1` case wouldn't violate
the new "no leading page break" rule.

I checked: if the deleted item was at position 2 and held a page break,
then undo re-inserts it at position 2 with the break preserved. Good.
But: if the user deletes the *first* item (where the renderer already
ignores its `pageBreakBefore`), and then *also* deletes the new first
item before undo, the undo restores at orderIndex 2 — fine. The only
concerning case is undo restoring at orderIndex 1 with
`pageBreakBefore = true`. This cannot happen today because the UI
hides the page-break toggle for index 0, so a deleted first item
always has `pageBreakBefore = false`. But there's no server-side guard.

Recommendation: in `restoreDraftPaperItem` (or `addGroupToDraftPaper`),
if `insertIndex === 0 && pageBreakBefore === true`, silently drop the
page break. Two lines of defensive code, eliminates one future
foot-gun. Tracked as Should Watch, not Must Fix, because the UI
currently prevents the bad input.

### SW-CR-6 — Auto-save status pill flickers `saving → saved → saving` on rapid title edits.

`updateTitle` uses a 450 ms debounce; `persistItems` does not debounce
at all. Rapid reorder clicks (button-mash testing) will trigger
sequential PATCHes. The latter response can overwrite the former's
`draftPaper` state if they arrive out of order — even though the
server orders them.

Not a correctness bug (server is consistent), but the workbench may
briefly show stale `draftPaper.items` if response B arrives before
response A. The smoke test does not exercise this because each click
is `await`-ed.

Recommendation: add a `requestId` cursor in the client so only the
latest in-flight PATCH applies. Or debounce `persistItems` by 100 ms.
Either is fine. Acceptable to defer.

### SW-CR-7 — `printHtml` in the `DraftPaper` API response is unconditionally serialised over JSON.

Every `GET /api/draft-papers/current` returns the full print HTML as
a JSON string field. For a 6-group draft that's tens of KB of HTML
inside a JSON string, with every quote escaped. Network traffic and
JSON parse time both pay for it.

Recommendation: move `printHtml` to its own endpoint
(`GET /api/draft-papers/:id/print-html` already exists and returns
`text/html`). The workbench can use the dedicated endpoint for the
iframe's `srcDoc`, and the JSON `draftPaper` response drops the field.
Same idea as SW-CR-2, smaller scope. Defer to PR B.

### SW-CR-8 — Sample fixture `sampleQuestionGroups.ts` now ships `draftPaperButtonState: 'disabled'` everywhere.

Teachers running the V0 in pure-frontend mode (no server) see every
card disabled with reason "样例数据未连接本地草稿卷". This is correct
behaviour — without the server, draft state can't exist — but the
disabled label "暂不可组卷" is the same as the print-not-ready label.
A teacher with sample data sees "暂不可组卷" everywhere and assumes
the product is broken.

Recommendation: when `printUnavailableReason === '样例数据未连接本地草稿卷'`,
the card should show a distinct label like "示例数据 · 不可组卷" or
a tooltip explanation. Not blocking, but record so PR B's My Space
work doesn't compound the impression of a half-broken app.

---

## 4. Forbidden-scope audit

`verify-c8-forbidden-scope.mjs` enforces:

- No PaperSurface (`app/src/shared-ui/papersurface/`, `shared/papersurface/`) changes — **confirmed**.
- No reading-analysis changes — **confirmed**.
- No paper-intelligence harness or adapter changes — **confirmed**.
- No paper-asset fixtures changes — **confirmed**.
- No My Space / user-space code — **confirmed** (no files matching pattern; no `view=my-space`; no `/user-space` path).
- No "答案版" / "解析版" labels in DraftPaperWorkbench — **confirmed**.
- `server/print-renderer.mjs` byte-untouched — **confirmed by both forbidden-scope and render-model verify scripts**.

Two boundary touches that the verify scripts permit and that I
endorse as correct:

- `app/src/concierge/ConciergeGroupCard.tsx`: small UI change to
  consume the new `draftPaperButtonState` enum. Correct scope.
- `app/src/concierge/useConciergeDesk.ts` + `app/src/App.tsx`:
  wiring `addGroupToCurrentDraftPaperRequest` into the existing
  add-flow. Correct scope.

No leakage observed.

---

## 5. PR A success-path coverage

Required path: `search → 加入草稿卷 → A4 preview → reorder/分页/删除/撤销 → PDF/print`.

| Step | Implementation | Verify | Smoke |
|---|---|---|---|
| Search shows print-ready group | `selectQuestionGroupCards` derives `canAddToDraftPaper` per row | `verify-c8-print-ready-gate.mjs` | ✓ |
| Click 加入草稿卷 | `POST /api/draft-papers/current/items` → `addGroupToCurrentDraftPaper` | `verify-c8-draft-paper-contracts.mjs` | ✓ |
| Card becomes 已在草稿卷中 | `draftPaperButtonState === 'in_current_draft'` | contracts verify | ✓ |
| Open `?view=draft-paper` | App.tsx route dispatch | contracts verify | ✓ |
| A4 preview renders | iframe `srcDoc={draftPaper.printHtml}` | render-model verify | ✓ |
| Reorder via buttons | `moveItem` → `persistItems` → `PATCH /api/draft-papers/:id` | smoke asserts mutation OK | ✓ |
| Reorder via drag | `handleDrop` → `persistItems` | not asserted | ✗ (gap, see below) |
| Manual page break | `togglePageBreak` → `PATCH .../items/:id` | render-model + smoke | ✓ |
| Page-break suggestion | `buildPageBreakSuggestions` heuristic | print-ready verify mirrors decisions | ✓ |
| Delete with undo | `deleteItem` then `undoDelete` → `POST .../items/restore` | smoke asserts both | ✓ |
| Download PDF | `downloadDraftPaperPdf` → `exportDraftPaperPdf` (Vivliostyle) | smoke asserts download event fires | ✓ |
| Browser print | `browserPrint()` opens popup with `printHtml` | smoke asserts popup opens | ✓ |
| First group cannot create leading page break | UI hides toggle; renderer skips first item; suggestions skip index 0 | render-model verify (2 assertions) | ✓ (smoke asserts no `前置分页` button on first outline item) |

Drag-and-drop reorder is implemented but not exercised by smoke. Not
a blocker — button reorder is the primary path and is tested. Worth
adding one drag assertion to PR B's smoke.

---

## 6. Merge recommendation

**Ready to merge after MF-CR-1 through MF-CR-4 are addressed.** Of
those:

- MF-CR-1 (GET handler mutating current_marker): one-line fix, ~5 minutes.
- MF-CR-2 (TOCTOU on create-if-missing): partial-unique-index SQL, ~15 minutes including migration test.
- MF-CR-3 (silent migration skip): surface `skippedCount` in the workbench load path, ~15 minutes.
- MF-CR-4 (brittle smoke locator): seed distinct passages or add `data-group-id` attribute, ~15 minutes.

Total work to ship: ~1 hour including verify runs.

The product loop is real, the data model is honest, the forbidden
scope is respected, the leading-page-break headline bug is correctly
killed, and the C7 lessons (test the rollback / atomicity edges) are
applied here (delete-with-undo, transaction-wrapped writes, normalised
order index). The remaining issues are edge corrections, not direction
problems.

**Post-merge follow-ups for PR B:**

- Resolve SW-CR-1 (paper-asset lookup caching) before adding more
  papers.
- Resolve SW-CR-2 / SW-CR-7 (printHtml deferred / dedicated endpoint)
  before drafts grow past ~10 groups.
- Add SW-CR-3 assertion (source-metadata absent from print HTML) when
  PR B touches the print path for My Space artifact generation.
- Address SW-CR-4 (preview ≈ PDF parity) when teachers report visual
  drift.
- Defensive guard in SW-CR-5 (`restoreDraftPaperItem` rejecting
  `index 0 + pageBreakBefore`) as a 2-line hardening.
- SW-CR-6 (auto-save request ordering) when reorder UX feels janky.
- SW-CR-8 (distinct disabled-reason label for sample-mode) bundled
  with My Space onboarding polish.

End of report.
