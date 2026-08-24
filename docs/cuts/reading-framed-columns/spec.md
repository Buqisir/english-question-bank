# 阅读 `framed_columns`：对开细线框里的真字真表

Status: done  
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

### 栏内排法（2026-08-24 Owner QA，深圳一模收口）

这是共享渲染约定，不是某一道题的局部 CSS。下一份同类 Word 细线框只写 Canonical 块，不为单卷改 PaperSurface / print-renderer。

- 栏框是单实细线（Screen 1px / Print 0.5pt）。不另造虚线、双线或 Word 线型。
- 栏内对照表无格线。按内容收窄，整块稍居中；行距松开，不要挤成一团，也不要拉成满宽格子。
- 表后问句或段落紧跟，只略隔开。短栏底部可留白（两栏等高、右栏更长时这是正常的）。禁止把内容顶到框底去填空。
- 不为单卷测像素仿真 Word。

### 下一卷怎么干

遇到同类 Word 左右细线框、框里只有能打的字和矩形表时，按这一套走，不要再一道题一道题改 CSS。

1. **判定**：能打的字 / 矩形对照表 → Canonical `framed_columns`。示意图、实物图、统计图、台灯、流程图仍走 figures。1 栏、3 栏、栏里挂图、套栏 → 停，不发明第四种格式。
2. **导题**：在该格式 producer 里**写明**两栏（格式②像深圳一模那样显式派生；格式③同样写明，不探测 DOCX 文本框）。栏标题用该栏 `columnHeading`。PNG 可留 `figures/` 作证据；`[图:]` 只留 `groups.json`，不进 Canonical 正文。
3. **渲染**：不要改 `PaperSurface.css` / `print-renderer.mjs`。观感已由 `exam-paper-format-standards.md` §3c 画出。QA 只核正文对不对，不按像素仿真 Word。
4. **权威**：导题契约 `nck1-paper-standard.md` §8；进场 `docs/import/agent-contract.md`。参考实现：`shared/paper-canonical/paperMockSz2026M1ReadingAFramedColumns.mjs`。

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

已落地：票 01 合同、票 02 三面渲染、票 03 深圳一模正文。栏内排法见上节。

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
