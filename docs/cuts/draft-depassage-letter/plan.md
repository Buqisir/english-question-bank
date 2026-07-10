# draft-depassage-letter — 草稿卷去篇章字母（大题号徽标+题型标签）

- Cut size: **medium**；touches schema / data contract: **no**（纯导出面
  展示语义；小题号全卷连续已是现状——print/docx 均有跨组 questionNum
  计数器+questionNumberStart 参数，无需改）。
- 契约面：`server/print-renderer.mjs` + `server/exports/docxRenderer.mjs`
  （print/export styling）。DEV 开工时主代理 touch `.claude/contract-unlock`。
- **PA 降档 PA-lite**，理由：① 可逆展示改动（一刀能整体回退）；②
  渲染面/调用方清单本会话主代理实证（buildPrintHtml 单一入口=
  exportImplementation，消费者全是草稿卷/组卷练习单族；真题仿真 PDF
  由导入管线预建不经此路；屏幕工作台 A4 预览= buildA4PreviewHtml(
  printHtml) 自动继承；DraftPaperOutline/Workbench 零字母代码）；③
  无 schema/编号数据变更。CR 必须复核此降档。

## Owner 拍板（2026-07-09，STATUS 在案）

草稿卷=练习单非仿真卷，A/B/C/D 是**源卷结构属性**不该带走；改
**大题号徽标+题型标签**。编号语义：**大题序号连续 1、2、3…**（小题号
全卷另行连续——已是现状）。**不在范围**：七选五 A-G 选项字母、整卷页
（PaperSurface 屏幕面）居中字母。

## 机制实况（2026-07-10 侦察）

- 字母来源：两渲染器同款——`sectionTitle.match(/([A-D])$/)`，实际由
  `detail.title`（"Reading A"）兜底供字母（paper-passage-letter 刀
  决策 2 原文注释在案）。渲染点共 **4 处**：print-renderer blocks 分支
  （L~290）+ legacy items 分支（L~344 附近，查证是否也渲染字母）；
  docxRenderer 对应两分支（L~764 附近 + legacy）。DEV 逐处确认，
  legacy items 分支若无字母渲染则记录事实即可。
- 现状无大题头：question_group 块直接渲染语篇；仅 !isExam（教师/
  练习注释版）有 group-meta 行（title · 题型 · 每题 N 分）。
- 文内挖空号（完形 41-55、语法 56-65）是 materialText 烤死的源号，
  与列表连续号的张力为**存量现状，本刀不动**（动它=改源文本渲染，
  另立刀议）。

## 做什么

1. **去字母**：print + docx 两渲染器全部 passage-letter 推导与渲染
   退役（`passageLabelMatch` 一族删净）；`.passage-letter` CSS 与
   docx 对应段落样式一并清。paper-passage-letter 刀的 verify 断言
   同刀更新/退役（先 grep 找到它们）。
2. **大题头**：blocks 分支每个 `question_group` 块渲染大题头一行：
   `${n}、${groupTypeLabels[detail.groupType]}`（n=大题序号，全卷
   连续 1、2、3…，Arabic 按拍板；跨 section_header 不重置）。有
   block.score 时后缀 `（每题 ${score} 分）`。学生版/教师版都渲染
   （教师版 group-meta 行保留在大题头之下——detail.title 的源卷
   归属对老师是有用信息，不删）。legacy items 分支同规格（若该
   分支实际无消费者，以行为断言证明后可只做 blocks 分支，plan
   记录事实）。DOCX 同款（加粗段落，样式对齐现有 section-header
   层级但字号低半级）。
3. **视觉**：练习单气质——大题头用与 section-header 区分的字重/
   字号（print CSS + docx run 属性），不夸张不抢卷面。格式细节
   DEV 按 exam-paper-format-standards 字体家族走，owner QA 可否。

## Forbidden

- `app/src/shared-ui/papersurface/**`（整卷页居中字母明确保留）、
  `paperAssetSurfaceAdapter`、domain schema、`app/public/paper-assets/**`。
- 七选五 A-G 选项池、文内挖空号、小题号逻辑（已连续）零触碰。
- `draftPaperPreviewHtml.ts` 零改动（纯包装，figure-render PA 实证）。
- 屏幕工作台/Outline 的组标题（"Reading A"）不动——管理界面的源卷
  归属展示不是卷面。

## Verify / 验收

- 更新/退役 paper-passage-letter 相关断言；新断言（进既有
  verify-print-renderer / verify-h5g-docx-renderer 或新脚本，DEV 按
  scripts/README 惯例定）：草稿卷 print HTML 与 DOCX XML 中零
  `passage-letter`/居中字母段落；含 ≥2 题组的 draft 输出大题头
  1、2、…连续；score 后缀在场。
- verify:all 全绿、tsc 干净（若动 app 侧则跑，否则 server-only 记录）。
- QA（DEV + 主代理复核 + owner）：造一张含 阅读×2 + 完形 + 语法 的
  草稿卷——工作台 A4 预览 / print 预览 / 导出 PDF / DOCX 学生版 /
  教师版五处：无 A/B/C/D 居中字母、大题头 1-4 连续、教师版
  group-meta 仍在、七选五若加入则 A-G 选项池原样。
- DEV 断点锚：`wip(draft-depassage-letter): impl complete, pre-QA`。
