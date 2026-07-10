# draft-numbering-style — QA notes (2026-07-10, DEV self-QA)

Local qa-local-owner flow (worktree's own sqlite copy, isolated ports
8797/5183, not the shared 8787/5173 dev instance other agents were using).
Draft paper `0709 英语草稿卷` assembled from real paper-2026-i groups:
`group-2026-i-grammar-fill`（语法填空 10题）, `group-2026-i-cloze`（完形填空
15题）, `group-2026-i-seven-choices`（七选五 5题）, `group-2026-i-reading-a`
（阅读理解 3题）.

## Five-face check

1. **工作台 A4 预览** — screenshot-verified in-browser (Chrome via
   claude-in-chrome). 大题头 `1、语法填空（每题 1.5 分）` →
   `2、完形填空（每题 1 分）` → `3、七选五（每题 2.5 分）` →
   `4、阅读理解（每题 2.5 分）`（continuous 1-4，未按组重置，符合 plan）。
   每组小题号从 `(1)` 起计；文中挖空号同步显示为 `(1)(2)…`，与小题列表对得上
   （肉眼核对了语法填空、完形填空、七选五三组）。
2. **print 预览 / PDF** — fetched `GET /api/draft-papers/:id/print-html`
   (student + teacher) and `POST /api/draft-papers/:id/print-pdf` (student
   204999 bytes / teacher 450897 bytes, both start with `%PDF`). Parsed the
   HTML programmatically — see 断言表格 below.
3. **DOCX 学生版/教师版** — draft-paper workbench itself only exposes PDF
   download (`downloadDraftPaperPdf` in `app/src/services/draftPapers.ts`;
   `buildExamDocumentXml` has no draft-paper-specific UI route). Exercised
   the SAME renderer function (`docxRenderer.mjs`'s `buildExamDocumentXml`,
   `printStyle: 'exam'`, the only style draft papers use) via the generic
   `POST /api/exports/docx` route with the identical 4-group payload —
   this is the real, production-reachable entry point for that function
   (paper-assembly / 组卷 feature). Unzipped both `.docx` (PK header
   confirmed, `word/document.xml` present) and parsed the XML — see below.

## Programmatic assertion table (numbers extracted straight from the real
export bytes, not eyeballed)

| Group | print-html qnums | print-html blank-nums | docx qnums | docx blank-nums (padded) |
| --- | --- | --- | --- | --- |
| 语法填空 (10题) | 1..10 | 1..10 | 1..10 | 1..10 (2-space pad) |
| 完形填空 (15题) | 1..15 | 1..15 | 1..15 | 1..15 (2-space pad) |
| 七选五 (5题) | 1..5 | 1..5 | 1..5 | 1..5 (3-space pad) |
| Reading A (3题) | 1..3 | (none — reading has no in-text blanks, correct) | 1..3 | (none) |

- 大题头 sequence in both print HTML and DOCX: `1、语法填空` → `2、完形填空`
  → `3、七选五` → `4、阅读理解` (continuous, unaffected by 小题号 per-group
  reset).
- Teacher DOCX `【答案】` count: 33 = 10+15+5+3 (answers stay 1:1 with the
  new per-group numbering, no orphaned/missing answer rows).
- Old dot-format (`N.`) numbering: absent everywhere checked (`class="qnum">\d+\.<`
  never matches in the print HTML; DOCX has no bare `N.  ` question-number
  run for these 4 groups).
- 七选五 A-G option pool: all 7 option texts present verbatim in both
  print HTML and DOCX (Forbidden requirement — option letters untouched).
- `.passage-letter` (retired by draft-depassage-letter): absent from
  rendered output. (One raw-string false-positive during a naive substring
  check turned out to be inside the `draft-depassage-letter` code COMMENT
  itself — `de**passage-letter**` — not real markup; confirmed via
  `grep -c 'class="passage-letter"'` = 0.)

## Known-issue confirmation (pre-existing, NOT introduced by this cut —
see Completion Report Known Risks for full detail)

Both `question.stem` (print-renderer) and `docxQuestionStem` (docxRenderer)
render the ORIGINAL literal exam question number for 完形填空/语法填空/七选五
questions whose data-layer `stem` field is just a numeric-string placeholder
(e.g. `"41"`) or has no real stem — this predates this cut (data shape
issue), but is now MORE visually confusing because it sits directly next to
the new `(n)` local number. Confirmed in real exports:
- print HTML (student, 完形填空): `<span class="qnum">(1)</span> 41`
- DOCX (student, 语法填空): `(1)  第 56 空`
Not fixed in this cut (out of scope — touching `docxQuestionStem` /
`question.stem` consumption is a separate, broader change unrelated to
numbering-style; also affects 七选五's pre-existing full-A-G-repeat-per-
question print/DOCX rendering, an unrelated defect discovered as a
byproduct of this QA, not previously covered by any verify script's
per-question real-data assertions).

## Critical finding — draftPaperStore.mjs ROLLBACK-after-COMMIT (blocking)

`server/draft-paper/draftPaperStore.mjs` is OUTSIDE this cut's granted
契约面 (`server/print-renderer.mjs` + `server/exports/docxRenderer.mjs`
only) — not touched. But 5 of its functions (`addGroupToCurrentDraftPaper`,
`updateDraftPaper`, `patchDraftPaperItem`, `deleteDraftPaperItem`,
`restoreDraftPaperItem`) call `getDraftPaper(..., { includePrintHtml: true
/* default */ })` AFTER `userDb.exec('COMMIT')` but still INSIDE the
try-block whose `catch` does `userDb.exec('ROLLBACK')`. Before this cut,
`buildPrintHtml` never threw, so this path was dead. This cut's new hard
consistency assertion is the FIRST thing that can throw from inside
`getDraftPaper`, and it exposes a pre-existing structural bug: the
ROLLBACK-after-COMMIT throws its own "cannot rollback - no transaction is
active" error, masking the real error message.

**Live-reproduced against real data** (not just a test fixture):
`group-960d0f8d-grammar-fill` (a REAL imported paper, 重庆市巴蜀中学 2026.3
月考, `NN._____` blank format that `paperBlankPattern` doesn't capture — 0
blanks vs 10 questions):

```
POST /api/draft-papers/current/items  { groupId: "group-960d0f8d-grammar-fill" }
→ 400 { "error": "cannot rollback - no transaction is active" }
```

Worse: the mutation actually SUCCEEDED before the throw (COMMIT already
ran) — confirmed via direct sqlite read, the group WAS added to the draft
despite the 400 response. Every subsequent `GET /api/draft-papers/current`
then 500s (same bug, same code path) until the bad item is removed —
which itself is not reliably possible through the API, since
`deleteDraftPaperItem` has the identical COMMIT-then-throwable-call
pattern. No self-service recovery path exists through the current UI/API
once this is hit. Recovered locally only via a direct `DELETE FROM
draft_paper_items WHERE ...` SQL statement against the worktree's own
sqlite copy (not production).

Real groups in the current database with this exact mismatch (verified via
a full-library scan, 99 cloze/grammar_cloze/seven_choices groups, 5
affected): `group-960d0f8d-grammar-fill`, `group-2024-ii-seven-choices`,
`group-2025-ii-seven-choices`, `group-zj-2024-jan-seven-choices`,
`group-2024-jia-seven-choices`.

This is a genuine, live, production-reachable severity issue this cut's
required hard assertion exposes. It cannot be fixed within this cut's
granted file scope. See Completion Report for the recommendation.

## BLOCKING fix follow-up (2026-07-10, continuation DEV) — RESOLVED

Fixed in `server/draft-paper/draftPaperStore.mjs` (only file touched — this
cut's granted `server/print-renderer.mjs` + `server/exports/docxRenderer.mjs`
scope is unrelated and untouched by this follow-up; also outside this cut's
own scope on paper, done as an explicitly-assigned blocking-fix continuation).
All 5 named functions (`addGroupToCurrentDraftPaper`, `updateDraftPaper`,
`patchDraftPaperItem`, `deleteDraftPaperItem`, `restoreDraftPaperItem`) now
call `getDraftPaper(...)` (the print-rendering read) AFTER the inner
`BEGIN`/`COMMIT`/`catch{ROLLBACK}` try-block has fully exited, not inside it.
A render failure can therefore never trigger a second `ROLLBACK` on an
already-committed transaction — the mutation's COMMIT stands, the real render
error propagates unmasked to the route layer (existing convention: local
route `catch` maps it to 4xx, or — for routes with no local catch, e.g.
`GET /api/draft-papers/current` — `server/api.mjs`'s top-level request-handler
`catch` turns it into a 500 with the real message, same pattern already used
for every other uncaught store error).

### Live re-repro against the SAME real data (worktree's own sqlite copy,
isolated port 8797, `qa-owner` re-created via `scripts/create-user.mjs`
against the worktree DB — not the shared 8787 instance)

1. `POST /api/draft-papers/current/items { groupId: "group-960d0f8d-grammar-fill" }`
   → **400** with the REAL assertion message (`"...in-text blank count (0)
   does not match question count (10)..."`) — no more "cannot rollback - no
   transaction is active" masking it.
2. Direct sqlite read (`draft_paper_items`) confirms the mutation **did**
   commit — the item is present in the table, exactly as before (this is
   correct: the write succeeded, the write must not be rolled back just
   because the read-time render afterward failed).
3. `GET /api/draft-papers/current` (twice, to confirm it's stable, not a
   one-off) → **500** with the SAME real assertion message both times — a
   clear, honest, repeatable error, not a crash-loop and not a silent 200
   with corrupted data. (500 here is because this specific route has no
   local `try/catch`, so it falls through to `server/api.mjs`'s top-level
   handler — same behavior every other uncaught store error already gets on
   this route; still a "明确错误", not a stuck 502/hang.)
4. `DELETE /api/draft-papers/:draftPaperId/items/:itemId` on the bad item →
   **200**, item removed, draft returns to `itemCount: 0`. This is the
   self-service recovery path the QA notes above said did NOT exist before
   this fix (deleteDraftPaperItem itself had the same COMMIT-then-throw
   pattern — removing the bad item used to 400 with the same masked
   "cannot rollback" error, closing off recovery without a raw SQL
   statement). Confirmed fixed: no raw SQL was used for this recovery.
5. `GET /api/draft-papers/current` after the delete → **200**, healthy empty
   draft, printHtml `""`. Draft fully recovered through the API alone.
6. Server stdout/stderr log across the whole sequence: zero occurrences of
   "cannot rollback" (`grep -i "cannot rollback" <log>` → no match).

### Same-pattern scan (report-only, NOT fixed — outside this follow-up's
5-named-function scope)

`grep -rn "exec('COMMIT')" server/ --include="*.mjs"` plus manual read of
each call site found two more occurrences of the identical
COMMIT-then-throwable-post-commit-call-inside-catch(ROLLBACK) shape:

- `server/draft-paper/draftPaperStore.mjs`, `migrateAssemblyBasketToDraftPaper`
  — TWO instances inside the same function: the early-return branch
  (`if (current) { userDb.exec('COMMIT'); return { draftPaper:
  getDraftPaper(...), ... } }`) and the main-path return
  (`userDb.exec('COMMIT'); return { draftPaper: getDraftPaper(...), ... }`).
  Both call `getDraftPaper` (print render) after `COMMIT`, still inside the
  try whose `catch` does `userDb.exec('ROLLBACK')`.
- `server/draft-paper/draftPaperRoutes.mjs`, the
  `POST /api/draft-papers/:id/items` route handler (not the store) —
  `userDb.exec('COMMIT')` immediately followed by
  `context.draftPaperStore.getDraftPaper({ userDb, bankDb }, ...)` (print
  render) still inside the route's own `try { ... } catch (error) {
  userDb.exec('ROLLBACK'); ... }` block.

Everything else found by the same grep (6 spots in `server/api.mjs`, 1 in
`server/paper-import/publisher.mjs`) does NOT match the bug shape: each
either has no throwable call after its `COMMIT` (just returns an
already-computed plain value), or — `publisher.mjs`'s `swapPaperImportLatest`
call after `COMMIT` — already wraps its own post-commit `ROLLBACK` attempt
in a nested `try { db.exec('ROLLBACK') } catch { /* may already be rolled
back */ }` that swallows the rollback failure without overwriting the real
error, so it does not exhibit this masking bug.

### verify

- `node scripts/verify-c8-draft-paper-render-model.mjs` — pass
- `node scripts/verify-print-renderer.mjs` — pass
- `node scripts/verify-h5g-docx-renderer.mjs` — pass
- `pnpm -C app run verify:all` — pass (full run, real exit code 0)
