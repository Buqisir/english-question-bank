# 阅读 `framed_columns`：对开细线框里的真字真表

Status: accepted  
Accepted: 2026-08-16 by owner（grilling）  
Date: 2026-08-16  
Planning baseline: `main@bdbfdf0a`  
Tickets: `docs/cuts/reading-framed-columns/tickets/`

## Problem

深圳一模 Reading A 的 Puzzle | Solution 是 Word 画的左右细线框，框里只有能打的字和三行国名对照。今天只能整图塞进 Canonical `figure`。图和周围正文字号不齐，裁切还会切掉右侧 `the`。格子里不能再挂段落或表；嵌套块在现行阅读合同里是 `unsupported`。

## User outcome

能打的字自己打，能做成矩形表的自己做。细线框由阅读合同新块画出来，框里仍是真段落和真表。浏览、打印、PDF 吃同一份正文。示意图、实物图、统计图继续当图。

## User stories

1. As 老师，我要在浏览页看到和周围正文同一套字样的 Puzzle | Solution，以便讲评时不用对着一张「外国照片」。
2. As 老师，我要打印 / PDF 也是同一套两栏真字真表，以便发给学生的卷和屏幕一致。
3. As 导题 agent，我要一份可执行的阅读块合同，以便格式②把这张题写成两栏，而不是再截一张图当正文。

## Accepted decisions

### 总规则

- 能排成字的排成字，能排成矩形表的排成表。
- 示意图、实物图、统计图继续当图。台灯、Q33 四张流程图是图。
- 格鲁吉亚文是 Unicode，当正文打。不为字母截小图。
- 原卷左右对开不是硬条件。框是装饰，不是示意图。

### 新块

阅读 `content.blocks` 在现有 `paragraph` / `table` / `figure` 之外增加 `framed_columns`。

- 恰好两栏。不做 1 栏、3 栏、通用 `panel`。
- 每栏是有序子块；渲染面给每栏画细线框。
- `A Puzzle` / `The Solution` 是栏里的段落，用该栏的 `column_heading` 指向它。渲染面只认这个标记，不靠「第一段」。
- 栏里第一版只许 `paragraph` 和 `table`。不许图、不许再套 `framed_columns`、不许把题目塞进栏里。
- 国名三行是栏里的真表；说明、问句、四条解答是段落。不要把整块焊成「左谜面右解答」一张假大表。

### 三面同一份正文

- Screen / 打印 / PDF 消费同一份 Canonical。哪一面都不能自己把图翻译成表，也不能只在浏览页用 CSS 仿两框。
- 打印 v1：整块不可拆。一页放得下就一起放；放不下整块翻下一页；下一页仍超高则 `unsupported`。不做栏内分页，不按原卷测像素仿真 Word 断页。
- 现有 inline 不加粗体/居中标记。栏标题不是篇章 `title` / `subtitle`（那只许指顶层段落）。

### 格式②

- PDF 看不出 Word 文本框。这张题的两栏是派生时写明的，不是从页面自动认框。
- 换上 `framed_columns` 之后，现有 PNG 留作原料/证据，不再当正文。`[图:]` 仍只留在 `groups.json`，不写进 Canonical 正文。

### Proof

- 第一份真卷：`paper-mock-sz-2026-m1` Reading A。
- 另做一条合成两栏夹具：一栏带表，一栏只有段落。用来卡合法形状，并拒绝嵌套、进图、缺 heading 指向。
- 没有第二份真卷不阻塞 v1。

### 合同落地前（本轮已拍板的过渡）

- 这篇正文暂时仍是现在的 `figure`。只把右侧 `the` 裁完整。
- 不在现有三种块上硬仿左右框。
- `nck1-paper-standard` §8 在本块落地后再改；落地前锁和校验继续认这张 figure。

### 风险与门禁

这是共享阅读 / Paper 合同，不是一张题的局部 CSS。要改已经收口的阅读块表；浏览、打印、PDF 一起认。按 `AGENTS.md`：`pnpm -C app verify:paper`、受影响的真实 Screen / Print / PDF、一次最终 `pnpm -C app verify:all`、一次独立 Standards / Spec 审查。权威版本大概率要动。

## Test seams

- 编译器：`framed_columns` 恰好两栏；子块只许段落/表；`column_heading` 必须指向该栏一个段落；图、套栏、题目进栏 → 失败。
- 投影：阅读投影流出现 `framed_columns`，栏内表/段落身份稳定；合成夹具与真卷投影一致。
- 渲染：PaperSurface、打印 HTML、PDF 都画出两栏细线框和栏内真表；不出现 `[图:]`，不回退成整图正文。
- 过渡：裁完整后的 figure 仍在导语和 Contest Rules 之间；`the` 完整。

## Out of scope

- 1 栏 / 3 栏 / 嵌套栏 / 栏里挂图。
- 给所有阅读 inline 加粗体或居中。
- 栏内分页、像素级 Word 仿真。
- Q33、应用文台灯、应用文 dual-store overlay。
- 从 PDF 自动识别文本框。
- 格式①标题派生 producer、格式③ DOCX 文本框探测。
- 本 spec 落地前改阅读合同代码（owner 已拆开：先裁 `the`，合同另开票）。

## QA

合同落地后：深圳一模 Reading A，浏览 + 打印 + PDF。合成夹具走编译/投影门禁。过渡裁图：同一浏览 URL，只看 figure 右侧 `the` 是否完整。

## Open questions

无。grilling 已收口。
