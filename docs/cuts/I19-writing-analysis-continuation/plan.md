# I19 读后续写写作解析 — DEV 执行合同（plan.md）

**Cut size：large**（碰数据契约 + schema + 前端 + backfill 数据面）。沿用 I18 应用文写作解析全套地基，换内容形状。
**前置已完成**：三源调研 → grill 锁契约（CONTEXT.md 已更）→ doctrine（`续写准则.md`）→ prompt LOCKED（`continuation-prompt-v1.md`）→ 7 个不同故事范文压测 + 课标-clean + owner QA 过（`.scratch/I19-continuation-research/pilot/*.out.json`）。

## 目标

给 **12 套新课标真题的读后续写组** 点亮只读写作解析：每组一篇 **Model Answer 范文** + **Continuation Design 情节设计思路**（theme + 两段设计）+ 3–5 条 **Highlight Expression 亮点表达**。离线 Claude 生成、落 paper-asset 文件、前端只读展示。复用 ADR-0010 存储（不进发布门、不进 DB 搜索库）。

## Step 1 — 契约（受 PreToolUse guard，改时会弹确认，owner 放行）

**`app/src/domain/paperAsset.ts`**：把 `WritingAnalysis` 从单一 type 改成**按 taskType 判别的联合**（纯加法，不动 application 形状）：
```ts
export type WritingAnalysis = ApplicationWritingAnalysis | ContinuationWritingAnalysis
export type ApplicationWritingAnalysis = {
  taskType: 'application'
  modelAnswer: string
  highlightExpressions: HighlightExpression[]
}
export type ContinuationWritingAnalysis = {
  taskType: 'continuation'
  modelAnswer: string
  continuationDesign: ContinuationDesign   // 必填
  highlightExpressions: HighlightExpression[]
}
export type ContinuationDesign = {
  theme: string
  paragraphs: [string, string]             // 恰 2 条，按 continuationStarters 顺序
}
```
`HighlightExpression`、`GroupAnalysis.writing?`（现为联合类型）不变。**判别联合让 continuation 分支 `continuationDesign` 必填、application 分支没有该字段**（守"必填别设 optional"）。

**`schemas/paper-import/writing-analysis-v1.schema.json`**：加条件校验——`taskType==='continuation'` 时 `required: [continuationDesign]`，`continuationDesign` = `{theme: string非空, paragraphs: array minItems2 maxItems2 各 string非空}`。application 分支不变。envelope（`groups[groupId].writing`）形状不变。**schemaVersion 仍 v1**（向后兼容：现有 application 文件不带 continuationDesign 仍合法）。

## Step 2 — 后端生成件

**`server/paper-import-ai/analyzeContinuationAnalysis.mjs`**（镜像 `analyzeWritingAnalysis.mjs`）：`buildContinuationAnalysisMessages` = `continuation-prompt-v1.md` 的 LOCKED prompt **逐字搬入**（SYSTEM + USER 注入 materialText / 两个 starter / wordCountTarget）。

## Step 3 — 落库件（list / validate / persist）

**`server/writing-analysis/writingAnalysisBackfillService.mjs`** + **`scripts/import-pipeline/writing-analysis-driver.mjs`**：现硬过滤 `taskType==='application'`，**放宽到也处理 continuation**（list 续写组、persist 落 `group-<id>-writing-continuation`，envelope merge 保 application 组不冲突）。原子写 / resolvePaperAssetReadPaths / normalize 子串校验全复用。

**校验（硬 gate）**——continuation 专属：
- 结构：`taskType==='continuation'` + `modelAnswer` 非空 + `continuationDesign.theme` 非空 + `continuationDesign.paragraphs` **恰 2 条且各非空** + `highlightExpressions` 3–5 条 + 每条 `text` normalize 后是 `modelAnswer` 子串（强制从范文挑）+ `note` 非空。
- **词汇 gate（本刀新增硬 gate）**：modelAnswer + 每条 highlight.text 过 `guokao-vocab-checker`，**零未注释超纲**；口径 = 课标 ∪ 库派生 ∪ 本题原文+starters 出现的词 ∪ 专名（gate 逻辑见 `.scratch/I19-continuation-research/gate_check.py`，DEV 固化为校验步骤）。
- **精确学生词数不做硬 gate**（沿用 I18 PA MF-2：骨架埋自由文本扣不出）→ prompt 自控 + PO QA + 软警告 [120,180]（续写门：<120 扣分）。

## Step 4 — 前端

**`app/src/.../WritingAnalysisPanel.tsx`** + harness writing 分支：加 **continuation 分支**渲染——modelAnswer（两段）+ **Continuation Design**（theme 一行 + 两段设计，标注"第1段/第2段"）+ highlightExpressions。application 分支不动。404 优雅降级沿用。**视觉打磨归 owner（约定分工）**；DEV 只搭结构 + 复用现有 `pi-writing-*` 类。

## Step 5 — Backfill 数据（全 12 套）

- 7 个不同故事范文已就绪（`.scratch/.../pilot/*.out.json`，已课标-clean + 过 gate）→ 落 7 个 i-卷 + 2025-ii 对应 paper-asset。
- **缺 5 套 ii-卷**（2020-ii / 2021-ii / 2022-ii / 2023-ii / 2024-ii，各与 i-卷同故事）：**逐卷独立生成**（PA MF-3：禁跨 paperId 复制 modelAnswer），走「LOCKED prompt 生成 → 课标-clean → gate_check 迭代到零超纲」管线。
- persist 全 12 套 → `app/public/paper-assets/paper-*/latest/analyses/writing-analysis-v1.json` 的 `groups['group-<id>-writing-continuation'].writing`（envelope merge，`latest/` git 跟踪）。

## Forbidden（DEV 边界）

- 不碰 base 解析（reading/cloze/grammar/seven）、不动 ADR-0007 六题型发布门、不进 ADR-0009 DB 搜索库。
- 不动 application 写作解析的形状 / 数据。
- 不提交 `versions/`(gitignored) / `data/*.sqlite` / `.scratch/**` / `.claude/launch.json`。
- 写作解析落文件**非 DB**，不需停 API。

## Verify（RM 前）

- `tsc --noEmit` 绿（判别联合收窄、前端分支类型安全）。
- AJV schema 12/12 ok；continuation 硬 gate 12/12 pass（结构 + **词汇 gate 零未注释超纲**）。
- 12/12 完整性：envelope 形状、highlight 全逐字命中、continuationDesign 各 2 段、0 audit 泄漏、每 writing 仅契约字段。
- print-ready 门（ADR-0007 六题型）仍绿——写作解析未接发布 validator（设计如此）。
- 浏览器 QA：owner 逐篇 QA 续写解析在 app 内渲染（深链 `?view=paper-intelligence&source=paper-asset&paperId=<id>&surface=paper&groupId=group-<id>-writing-continuation`）。

## PA Follow-Up Decisions

（待 fresh PA 出 `pa.md` 后，PM 把 Must-Fix 处理折叠进此节）

## 复用地基（I18，换内容形状即可）

存储 ADR-0010 / envelope 一文件多 groupId merge / verb-profile sidecar 先例 / vp-driver 骨架 / 前端 by-name fetch + 404 降级。**续写换的是**：判别联合契约 + Continuation Design 字段 + 续写 doctrine/prompt + 词汇 gate + 前端 continuation 分支。
