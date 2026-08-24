# 02 — 浏览 / 打印 / PDF 画两栏细线框

Status: done
Blocked by: `docs/cuts/reading-framed-columns/tickets/01-framed-columns-data-contract.md`
Next on PASS: `docs/cuts/reading-framed-columns/tickets/03-sz-reading-a-framed-columns.md`
Terminal: no

Spec: `docs/cuts/reading-framed-columns/spec.md`

## What to build

PaperSurface、打印 HTML、PDF 从同一份投影画出 `framed_columns`：两栏等宽细线框，栏内真段落和真表。`column_heading` 居中加粗，像原卷框题，但不是篇章 A/B/C/D 标题。整块打印不可拆页。

渲染面不得把 figure 翻译成两栏，也不得靠「第一段」猜标题。

## Acceptance criteria

- [x] 合成夹具在 Screen / Print HTML / PDF 都出现两栏框、栏内表和段落。
- [x] 有 `column_heading` 的段落按栏标题渲染；没标的第一段当普通段。
- [x] 打印 v1：块内不分页；一页放不下则整块翻页。
- [x] 三面语义身份与投影一致，不出现 `[图:]`，不回退整图。
- [x] 无 `framed_columns` 的阅读卷三面无回归。

## Out of scope

- 深圳一模换正文（票 03）
- 栏内分页、1/3 栏、套栏、栏里挂图
- 给全部 inline 加粗体标记

## Result

Commit:
Verify:
- `node scripts/verify-paper-canonical-framed-columns.mjs` PASS
- `node scripts/verify-paper-canonical-framed-columns-rendered.mjs` PASS
- `node scripts/verify-paper-canonical-reading-rendered-behavior.mjs` PASS
- `node scripts/verify-print-renderer.mjs` PASS（含整块 atomic CSS）
- `node scripts/verify-canonical-paper-group-surface-adapter-declaration-parity.mjs` PASS
- `node scripts/verify-paper-canonical-reading-publication.mjs` PASS
- 真点击：Screen QA 点题后两栏仍在；Print HTML 点题后两栏仍在；PDF `pdftotext` 可见 `A Puzzle` / `The Solution` / 格鲁吉亚文 / Brazil，无 `[图:]`
- 深圳一模浏览回归：Reading A 仍是 figure，0 个 `framed_columns`
- `pnpm -C app verify:paper` 预检失败：厨房里 `RetainedWritingLecture.tsx` 的既有 TS 谓词错误（本票未改该文件）
Notes:
- JSON 字段仍是 `columnHeading`。渲染只认该标记，不靠第一段。
- 未 bump 权威。未知阅读块不再当 figure。
- 打印超高：最小高度超过一页内容区 → `CANONICAL_FRAMED_COLUMNS_EXCEEDS_PAGE`。
- 深圳一模正文未换（票 03）。未 commit。
- Owner QA 2026-08-24：过关。合成夹具格鲁吉亚文三面够用；原卷 Puzzle|Solution 全文归票 03。
