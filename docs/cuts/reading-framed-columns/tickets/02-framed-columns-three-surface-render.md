# 02 — 浏览 / 打印 / PDF 画两栏细线框

Status: ready
Blocked by: `docs/cuts/reading-framed-columns/tickets/01-framed-columns-data-contract.md`
Next on PASS: `docs/cuts/reading-framed-columns/tickets/03-sz-reading-a-framed-columns.md`
Terminal: no

Spec: `docs/cuts/reading-framed-columns/spec.md`

## What to build

PaperSurface、打印 HTML、PDF 从同一份投影画出 `framed_columns`：两栏等宽细线框，栏内真段落和真表。`column_heading` 居中加粗，像原卷框题，但不是篇章 A/B/C/D 标题。整块打印不可拆页。

渲染面不得把 figure 翻译成两栏，也不得靠「第一段」猜标题。

## Acceptance criteria

- [ ] 合成夹具在 Screen / Print HTML / PDF 都出现两栏框、栏内表和段落。
- [ ] 有 `column_heading` 的段落按栏标题渲染；没标的第一段当普通段。
- [ ] 打印 v1：块内不分页；一页放不下则整块翻页。
- [ ] 三面语义身份与投影一致，不出现 `[图:]`，不回退整图。
- [ ] 无 `framed_columns` 的阅读卷三面无回归。

## Out of scope

- 深圳一模换正文（票 03）
- 栏内分页、1/3 栏、套栏、栏里挂图
- 给全部 inline 加粗体标记

## Result

Commit:
Verify:
Notes:
