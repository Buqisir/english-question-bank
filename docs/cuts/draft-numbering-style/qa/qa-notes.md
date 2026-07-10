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

## Round 2 (2026-07-10, owner QA verdict B — 三号 DEV) — B形态改号 + 两处同款事务残留修复

Owner QA 二轮证伪一轮的 (1)(2) 组内重计形态（空线上印括号观感怪 +
组内重计=一张卷多个 (1) 变相撞号）。改判为 **B 案**：大题头汉字连续
（一、二、三…）+ 小题号阿拉伯全卷连续无括号（回归 draft-depassage 形态）+
文内空号重映射到全卷连续号（无括号）。同一轮授权修复两处 d51eab2 报告
但未修的 ROLLBACK-after-COMMIT 残留（POST 路由 + migrateAssemblyBasket）。

### 环境

Worktree 自己的 sqlite 副本（`data/question-bank.sqlite` +
`data/user-data.sqlite`，与共享 8787/5173 实例隔离），服务起在隔离端口
8797。`qa-owner`（既有账号）通过
`USER_DATA_DB=$(pwd)/data/user-data.sqlite node scripts/create-user.mjs
--reset-password --username qa-owner --password ...` 重置密码后登录（本
worktree DB 里该账号密码与 .env.qa 记录的生产密码不同，随即改用新密码，
未改动 .env.qa / 生产密码）。复用该账号既有的空草稿卷
`draft-paper-34efa37b-e1a8-4947-87ca-502447cf5d64`（`0710 英语草稿卷`），
通过 `POST /api/draft-papers/current/items` 依次加入真实
paper-2026-i 四组：`group-2026-i-seven-choices`（七选五 5题）、
`group-2026-i-grammar-fill`（语法填空 10题）、`group-2026-i-cloze`
（完形填空 15题）、`group-2026-i-reading-a`（阅读理解 3题）——
`itemCount:4, totalQuestions:33`。

### 真草稿卷五面复检

1. **A4 预览 / print HTML**（`GET /api/draft-papers/:id?versionType=student|teacher`
   的 `printHtml` 字段，等价于工作台 A4 预览与浏览器打印用的同一份 HTML）——
   落盘为 `v2-draft-student-print.html` / `v2-draft-teacher-print.html`，并用
   claude-in-chrome 打开本地静态服务截图（三屏滚动）肉眼核对：
   - 大题头：`一、七选五（每题 2.5 分）` → `二、语法填空（每题 1.5 分）` →
     `三、完形填空（每题 1 分）` → `四、阅读理解（每题 2.5 分）` — 汉字连续，
     无阿拉伯数字残留。
   - 小题号：脚本核对 `<span class="qnum">N.</span>` 序列为 `1..33` 连续
     （`node` 脚本正则提取，见下），全卷无一处 `(n)` 括号形态。
   - 完形填空文中空号：脚本按 section 切片核对 `print-blank-num` 序列与
     该组 `qnum` 序列逐空一致 —— 七选五 `1,2,3,4,5` == 列表 `1-5`；语法填空
     `6..15` == 列表 `6-15`；完形填空 `16..30` == 列表 `16-30`；阅读理解组
     无文内空号（reading 非 BLANK_BEARING_GROUP_TYPES，符合预期）。
   - A-G 选项池：七选五 5 道小题每题下方原样重复完整 A-G 七项（本刀未触碰
     此逻辑，回归确认无变化）。
   - 教师版答案随号：`grep -c '【答案】'` == 33（每小题一个答案块，紧跟在
     对应 `N.` 题干之后，同一循环内天然一致）。
2. **PDF**（`POST /api/draft-papers/:id/print-pdf`，body `{versionType}`——
   注意该路由的 versionType 是 JSON body 字段，不是 query string，首次误用
   query string 时两份 PDF 字节数完全相同（501 KB student 复用了默认
   student 渲染两次），改用 body 字段后 student 204790 字节 / teacher
   451676 字节（含答案更大，符合预期）——落盘为 `v2-draft-student.pdf` /
   `v2-draft-teacher.pdf`。`pdftotext` 抽取文本核对：`一、七选五（每题 2.5
   分）` 与文内空号 `1 2 3 4 5`、列表 `1. 36` `2. 37`... 均出现，与 HTML 一致。
3. **DOCX**（草稿卷本身无 DOCX 导出入口——`app/src/features/draft-paper/`
   全目录 grep 零 docx 引用；改用通用 `POST /api/exports/docx`，同样驱动
   `server/exports/docxRenderer.mjs`，用同一组真实 paper-2026-i 四组构造
   等价 `items`+`blocks`）——落盘为 `v2-draft-student.docx` /
   `v2-draft-teacher.docx`。Python `zipfile` 解包 `word/document.xml`
   抽取 `<w:t>` 文本核对：
   - 大题头正则 `[一二三四五六七八九十]+、...（每题...）` 命中 4 处，
     依次为一/二/三/四。
   - `qnum` 正则 `(\d+)\.  ` 命中 33 处，序列 `1..33` 连续。
   - teacher 版 `【答案】` 出现 33 次。

### 路由残留修复回归（`POST /api/draft-papers/:id/items`）

用同一台隔离服务，对既有草稿卷加入已知会触发一致性断言的坏组
`group-960d0f8d-grammar-fill`（语法填空，文中 0 个真实挖空标记 vs 10 道
小题，是 d51eab2 QA 记录里 5 个已知问题组之一）：

1. `POST /api/draft-papers/draft-paper-34efa37b.../items { groupId:
   "group-960d0f8d-grammar-fill" }` → **400**，body 是真实的一致性断言
   消息（`"...in-text blank count (0) does not match question count
   (10)..."`），不是被吞掉的 "cannot rollback - no transaction is active"。
2. 直接读 worktree sqlite 的 `draft_paper_items` 表：坏 item
   （`draft-item-4fef869f-...`）**确实已提交**（写入生效，符合修复意图——
   写操作本身成功，不该因为后续渲染失败被回滚）。
3. 服务器 stdout/stderr（`/tmp/eqb-draft-numbering-server.log`）全程
   `grep -i "cannot rollback"` → 零命中。
4. `DELETE /api/draft-papers/:id/items/:itemId`（坏 item）→ **200**，
   `GET /api/draft-papers/current` 之后 `itemCount` 回到 4（自愈，纯 API
   操作，未借助任何裸 SQL）。

### verify（本轮，真实 exit code）

- `node scripts/verify-print-renderer.mjs` → 75 passed, 0 failed, exit 0
- `node scripts/verify-h5g-docx-renderer.mjs` → 110 checks passed, exit 0
- `node scripts/verify-c8-draft-paper-render-model.mjs` → 34 passed, 0
  failed, exit 0
- `node scripts/verify-figure-render.mjs` → 81 passed, 0 failed, exit 0
- `node scripts/verify-c8-draft-paper-contracts.mjs` → 50 passed, 0
  failed, exit 0
- `node scripts/verify-paper-surface-module-v1.mjs` → 113 passed, 0
  failed, exit 0
- `pnpm -C app run verify:all` → `PASS 73 / SKIP 1 / FAIL 0`（SKIP 是既有
  离仓 fixture 缺失项 `verify-i16a-teaching-dimension-search.mjs`，与本刀
  无关）exit 0
