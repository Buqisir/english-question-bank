# 新课标卷通用导入

Status: accepted
Accepted: 2026-08-27 by owner
Date: 2026-08-27

## Problem

现有离线导题 Agent 已能按格式①/②/③导 NCK1，但源版式仍决定走哪把刀；
PDF 还要给 `CONTENT[paperId]` 加登记，普通表格仍有拍平文本加截图的过渡，
DOCX 图形关联也要按卷声明。正常的新课标版式变化因此仍可能变成共享代码修改。

Owner 要的「任意题」不是任意考试家族，而是：给一整套新课标卷及权威答案，
不论是文本 PDF、扫描 PDF、答案版 DOCX 或试题/答案双 DOCX，Agent 都能导完；
能表达成表格的由 EQB 重画，真正的图从原卷提取或裁剪。正常新卷不得新增格式刀。

## User outcome

Owner 只给源卷、权威答案、`paperId` 和出处。Agent 生成一份有源证据约束的
NCK1 Source Materialization，可信 adapter 确定性派生 Import Candidate，现有
Teacher Confirmation、原子发布和 Owner QA 边界保持不变。导一套未见过的新课标
卷时，只新增该卷目录中的数据和媒体，不修改共享代码或 paper-specific 注册表。

## Scope

- NCK1 固定九题组；源题号可按标准重排。
- 文本 PDF、无文本层扫描 PDF、单 DOCX、试题 DOCX + 答案 DOCX/PDF。
- 听力完整捕获为 inactive source，不在本 cut 激活网站消费。
- 文字、空格、题干、选项、写作 prompt、给定语、表格、图片及权威答案。
- Screen、Student/Teacher Print HTML、PDF 继续消费同一 Canonical Paper。

不在范围：无权威答案时 AI 解题补答案；非 NCK1 结构；网站导题 UI；生产发布；
听力题组激活；为原卷装饰做像素级复刻。

## Accepted decisions

### 一份统一源材料化合同

新增 `nck1-source-materialization-v1`。它是 Source Capture 中的不可变观察文档，
不是 Canonical Paper，也不是调用方可直接提交的 Import Candidate。它包含：

- 原始文档角色、摘要和页数；
- NCK1 槽位与按源顺序的内容块；
- paragraph / table / figure / framed_columns 观察；
- 表格行列、单元格、合并关系及表内媒体引用；
- PDF 页矩形或 DOCX media entry 形式的媒体提取配方；
- 每个答案的权威文档与源定位；
- 听力问题、答案、录音稿，或显式 `not_supplied`；
- 无法确定的 source issue。

AI Analysis、写作范文生成、主题/难度等派生教学数据不进该合同。

### 可信边界不下放给 Agent

通用 adapter 从原始字节和 Source Materialization 重新派生完整 Candidate；调用方
不能提交 Canonical groups、Questions 或答案作为权威 operator choice。相同输入必须
得到相同 digest。任何源摘要、裁剪配方、答案绑定或 Candidate 漂移都 fail closed。
Teacher Confirmation 仍绑定精确 source/candidate digest。

### 表和图的边界

- 行列语义是 `table`，Screen / Print / PDF 自己画。
- 图画、照片、统计图、示意图、图标、条码是源媒体，不由 AI 重画。
- 混合内容表格允许单元格按顺序包含文字和源媒体；重庆五检 Reading A 产品标签
  是首个真实 canary：外框和文字重画，警告/回收/CE/RoHS 图标与条码取原图。
- 整表截图可留作证据，不能作为 Canonical 正文。
- PDF 裁图必须由源页摘要 + 归一化矩形确定性重做；DOCX 位图/SVG 优先直接取
  `word/media`，只有形状绘图才转 PDF 后裁。

### 不再按源版式开刀

材料化 Agent 负责理解视觉版式，通用 validator 和 adapter 只认统一合同。
正常版式差异只产生该卷数据。新增共享代码只允许用于出现了此前 Canonical 无法
表达的真实 NCK1 语义，不允许为一个标题、分页、空格或视觉坐标加 paperId 特例。

### 停点

缺答案、缺页、字迹不可辨、试题答案冲突、槽位归属不确定或无法闭合的表格必须
写 issue 并停。普通排版差异、扫描件、表格和图片不是 `help-needed` 理由。

## Test corpus

- 开发 canary：重庆 2026 届第五次质检，PDF/DOCX 同源；Reading A 混合内容标签。
- 复杂两栏 canary：深圳一模现有 `framed_columns` 与 figures。
- 普通表格 canary：2026 新课标 I 卷。
- 盲测 A：佛山 2026 一检，PDF/DOCX，无听力。
- 盲测 B：滨州 2026 期末，PDF/DOCX，完整听力与录音稿。

Owner 提供的原文件只保存在 gitignored 本地目录，不提交仓库。

## Acceptance criteria

- [x] 一条通用入口接受源文档、答案、`paperId`、出处，不要求格式①/②/③。
- [x] 未见过的新卷导入期间，共享代码与 paper-specific registry 零修改。
- [x] 九题组、答案、写作源内容完整；听力完整捕获或诚实 `not_supplied`。
- [x] 所有语义表格均为 Canonical table；整表截图不进正文。
- [x] 混合内容表格中的图标/条码来自原始媒体并绑定摘要。
- [x] PDF 和 DOCX 载体对同一卷派生相同可见语义。
- [x] 相同输入重复运行得到相同 Materialization/Candidate digest。
- [x] 缺答案、篡改源、裁剪漂移、漏视觉块、错误确认全部 fail closed。
- [x] 重庆 canary 及佛山/滨州盲测通过 Screen、Student/Teacher Print 和 PDF。
- [x] 旧格式入口在通用入口证明后停止新增；删除只在调用方清零后进行。

## Verification

这是共享 adapter / Canonical rich content / renderer 变更。开发中跑受影响的公开缝；
最终跑 `pnpm -C app verify:paper`、一次 `pnpm -C app verify:all`、真实 Screen /
Student Print / Teacher Print / PDF，并做一次独立 Standards / Spec review。单卷数据导入
在共享行为不变时只跑严格输入、publication canary 和受影响真面，不重复全套仪式。

## Tickets

1. `tickets/01-source-materialization-contract.md`
2. `tickets/02-mixed-table-media-contract.md`
3. `tickets/03-universal-candidate-adapter.md`
4. `tickets/04-agent-materializer-and-orchestration.md`
5. `tickets/05-chongqing-development-canary.md`
6. `tickets/06-blind-imports-and-retirement.md`

## Open questions

无。实现中遇到源内容矛盾按停点交 owner；工程形状由本 spec 和现有 Canonical
边界决定。
