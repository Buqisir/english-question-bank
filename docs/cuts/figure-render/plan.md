# figure-render — 卷面图表渲染（fig-token P0 销账）

- Cut size: **medium**（多渲染面一致性）；touches **PaperSurface +
  adapter + server print/DOCX 导出面 = 契约面**。Formal PA 已跑
  （`pa.md`，fresh Opus，2026-07-10）：verdict DEV NOT READY → 本版
  plan 已按 MF-1~4 重构，PA Follow-Up Decisions 见下。
- Touches schema / data contract: **no**（数据侧只读）。
- 契约解锁：DEV 开工时 `touch .claude/contract-unlock`（主树+worktree
  各一份），收官删除。
- 时序：**串行于 similar-entrypoints (E3) 之后**——E3 已合并 main
  （5de239e），PA 的 Wave 拆分坍缩为单刀；原「与 E3 零交集」的并行
  声明作废（PA MF-1 判定其为假，事实成立）。DEV 基线 = 含 5de239e
  的 main。

## 问题（审计唯一 P0）

卷面直出内部 token `[表: fig-paper-2026-i-reading-a-table-1]`；print/
DOCX 同源，学生卷子上会印内部 token。违反 PRODUCT 原则 5、
「所见即所印」、标准 §8 保真分级。

## 渲染面清单（PA 实证修订版——四条真实渲染路径）

| # | 用户可见面 | 真实载体 | token 载体 |
|---|---|---|---|
| 1 | 整卷卷面 (browse) + 讲评 harness | `app/src/shared-ui/papersurface/PaperSurface.tsx`（共享组件，两 mount 同吃） | `textMap.paragraphs[].text`，经 `paperAssetSurfaceAdapter.ts:171` |
| 2 | 详情页语篇卡 | `QuestionGroupDetailView.tsx:275` 裸 `<pre>{materialText}</pre>` | materialText（`\n\n` 连接） |
| 3 | print/PDF + 工作台 A4 预览 + 草稿卷预览（三面同源） | `server/print-renderer.mjs`（materialText 按 `\n` split）；`draftPaperPreviewHtml.ts` 只是其 CSS/分页包装（`buildA4PreviewHtml(printHtml)`），**不需要也不许加图逻辑** | materialText 行 |
| 4 | DOCX 导出 | `server/exports/docxRenderer.mjs`——**4 个语篇发射点 L618/L688/L775/L843**（学生试卷+教师解析双文档），全部在范围内；现无任何图片能力（ImageRun 从零建） | normalizeDocxLines(materialText) |

修 #1 同时覆盖 browse 与讲评 harness；修 #3 一处同时覆盖 print/PDF/
A4 预览/草稿卷预览。

## 行为规则（PA MF-4 定稿：段落/行粒度，绝不子串截断）

1. **替换粒度**：客户端=段落、print/docx=行。一个段落/行 trim 后
   **以 manifest 的 placeholderMarker 开头** → 整段/整行替换为图；
   **禁止**「同一混合段内隐藏 marker 之后的文本」这种子串规则——
   未来数据若在 marker 段混入正文，子串规则会静默吞正文。
2. **图渲染**：客户端 `<img src="{assetBase}/figures/<file>">`；
   print HTML 服务端读磁盘路径；DOCX 嵌 PNG（见降级红线）。
   caption 是运维元数据（含 "source paper.pdf p.4"），**任何学生/
   试卷面都不渲染**（PA SW-4 确认为定案）。
3. **兜底**：`[表:` / `[图:` 模式无 manifest 命中 → 占位卡
   「〔表格：见原卷〕」，**绝不静默隐藏、绝不裸 token**。
4. **详情页拍平文本**（PA PO-2，PM 采纳 PA 建议）：图渲染后拍平文本
   **保留**显示在图下（§8 网站面=语义完整；owner QA 时可否）。
   试卷面（print/PDF/DOCX/A4）按 §8 真题观感：只出图，marker 行
   整行替换后拍平文本自然不重复（同一行内）。
5. **DOCX 降级红线**（PA MF-3 / PO-1）：学生试卷 DOCX **必须嵌 PNG**；
   若 DEV 实证嵌图不可行/成本失控 → **停下上报，owner 拍板**，
   降级文案不是 DEV 可自选的 fallback（§8 保真分级，试卷面降级即
   违标）。教师解析文档可同嵌图或占位卡，但绝不裸 token。

## Allowed / Forbidden

Allowed：`server/print-renderer.mjs`、`server/exports/docxRenderer.mjs`
（+抽出的嵌图 helper）、`PaperSurface.tsx`、
`paperAssetSurfaceAdapter.ts`、`PaperBrowsePage.tsx`（穿 manifest/
assetBase 进 adapter/mount，L282/L432 已有 assetBase）、
`QuestionGroupDetailView.tsx`（`<pre>` 面）、相关 CSS、新
`scripts/verify-figure-render.mjs`、`scripts/import-pipeline/
verify-nck1-standard.mjs`（MF-4 不变量，确认与导题刀无撞后）。

Forbidden：
- 数据侧只读（paper-asset.json / figures/** / manifest）。
- `draftPaperPreviewHtml.ts` 不加 token 逻辑（非图面，PA 实证）。
- 不做表格结构化长期解、不改 adapters 输入输出契约语义（加可选
  figures 入参 OK，见下）、不实现「含图不可入草稿卷」ban。
- PaperSurface 新入参必须**可选/带默认**，无图段落输出字节级不变
  （PA SW-3，对齐 I15 blankFocusMode 的 gating 纪律）——既有 mount、
  verify 快照零漂移。

## Verify（PA 定稿）

- 新 `scripts/verify-figure-render.mjs`，manifest 驱动零 hardcode：
  - 对每个含 figures/manifest.json 的卷：四条渲染路径输出均含图引用
    （print HTML/PaperSurface=`<img>`；DOCX=ImageRun/media part）且
    零 placeholderMarker 裸 token；**必须真跑详情页 `<pre>` 路径与
    DOCX 全部 4 个发射点**，不许只测 PaperSurface+print。
  - 全库反模式：任何渲染输出不含 `[表: fig-` / `[图: fig-`。
  - 零图卷零断言零失败。
- MF-4 不变量断言：每个 manifest placeholderMarker 必须段首出现且
  该段除拍平文本外无正文（违反=硬失败，宁可导入期红也不让渲染期
  吞字）。
- verify:all 全绿；tsc 干净。

## QA 矩阵（DEV Playwright + 主代理复核 + owner）

paper-2026-i 阅读 A：表格图在场、无 token、试卷面无拍平文本重复、
版式不破——八处：详情页语篇卡 / 整卷卷面 / 讲评 harness / 工作台 A4
预览 / print 预览 / 导出 PDF（查页界不跨页断图，SW-2：宽 ≤版心
162mm，`break-inside: avoid`）/ 导出 DOCX 学生版 / 教师版。
SW-1：草稿卷 A4 预览高图不被 `overflow:hidden` 静默裁剪（本图为
横宽表，预计矮，仍须目检）。

## PA Follow-Up Decisions（MF → 处置映射）

| PA MF | 处置 |
|---|---|
| MF-1 Wave 拆分/边界冲突 | E3 已先行合并 → 单刀串行，E3 文件解锁，基线含 5de239e。本表即记录。 |
| MF-2 详情页漏渲染面 | 渲染面清单 #2 收编，`QuestionGroupDetailView.tsx` 移入 Allowed。 |
| MF-3 DOCX 4 发射点+降级红线 | 清单 #4 全列；「学生 DOCX 必嵌 PNG，嵌图不可行→停下上报 owner」写死。 |
| MF-4 隐藏规则吞正文风险 | 行为规则 1（段落/行粒度）+ verify 不变量断言。 |
| PO-1 | 条件性，保持 escalate 规则，不预拍板。 |
| PO-2 | PM 采纳 PA 建议：详情页图下保留拍平文本，owner QA 可否。 |
