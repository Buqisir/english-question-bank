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

**`schemas/paper-import/writing-analysis-v1.schema.json`**：改条件校验。**注意这不是纯加法（MF-3）**——现 `taskType` 是 `{const:'application'}`（schema:24），必须改成 `{enum:['application','continuation']}`，再用 `if {properties.taskType.const:'continuation'} then {required:[continuationDesign]}` 条件块。`continuationDesign` = `{required:[theme,paragraphs], theme: string minLength1, paragraphs: {type array, minItems2, maxItems2, items: string minLength1}}`。**公共/顶层 required 绝不加 continuationDesign**（否则旧 12 个 application 文件全部回读校验失败）。envelope（`groups[groupId].writing`）形状不变。**schemaVersion 仍 `writing-analysis-v1`**（向后兼容：旧 application 文件不带 continuationDesign 仍合法 → Verify 加回归项）。

## Step 2 — 后端生成件

**`server/paper-import-ai/analyzeContinuationAnalysis.mjs`**（镜像 `analyzeWritingAnalysis.mjs`）：`buildContinuationAnalysisMessages` = `continuation-prompt-v1.md` 的 LOCKED prompt **逐字搬入**（SYSTEM + USER 注入 materialText / 两个 starter / wordCountTarget）。

## Step 3 — 落库件（list / validate / persist）

**`server/writing-analysis/writingAnalysisBackfillService.mjs`** + **`scripts/import-pipeline/writing-analysis-driver.mjs`**：现硬过滤 `taskType==='application'`，**放宽到也处理 continuation**（list 续写组、persist 落 `group-<id>-writing-continuation`，envelope merge 保 application 组不冲突）。原子写 / resolvePaperAssetReadPaths / normalize 子串校验复用。
**⚠️ MF-1（改现有函数，非新写）**：`persistWritingAnalysisGroup` 现只投影 `{taskType, modelAnswer, highlightExpressions}`（service:222-227），**字面复用会静默丢掉新必填 `continuationDesign`**。必须改投影按 taskType 分支：continuation 时存 `{taskType, modelAnswer, continuationDesign, highlightExpressions}`。`validateWritingAnalysisCandidate` 的 `taskType!=='application'` 硬卡（:132）放宽到接受 application|continuation。

**校验（硬 gate）**——continuation 专属（扩进 `validateWritingAnalysisCandidate`，非另起）：
- 结构：`taskType==='continuation'` + `modelAnswer` 非空 + `continuationDesign.theme` 非空 + `continuationDesign.paragraphs` **恰 2 条且各非空** + `highlightExpressions` 3–5 条 + 每条 `text` normalize 后是 `modelAnswer` 子串（复用现有 `normalizeForSubstring`，强制从范文挑）+ `note` 非空。
- **词汇 gate（本刀新增硬 gate）**：modelAnswer + 每条 highlight.text 过 `guokao-vocab-checker`，**零未注释超纲**。**MF-2 口径钉死**：(a) allowlist 输入源 = **tracked `paper-asset.json` 的 `content.writingTasks[continuation].materialText + continuationStarters`**（实测可取），**不依赖 gitignored `.scratch/.../*.in.json`**；(b) gate 依赖 `~/.claude/skills/guokao-vocab-checker/scripts/check.py` + 其 `data/`（基线 = STATUS 记的 `expand_library.py` 补 72 派生那版），**skill 缺失须 fail-hard 报错、绝不 silent-pass**；(c) 口径锚定 `docs/cuts/I19-writing-analysis-continuation/gate_check.py`（GENUINE_OOV 为空才 pass；SUSPECT 需人工/owner 核）。DEV 固化的是确定性脚本，不重新发明口径。
- **精确学生词数不做硬 gate**（沿用 I18 PA MF-2：骨架埋自由文本扣不出）→ prompt 自控 + PO QA + 软警告。**SW-2：续写软警告下界用 120**（service:175 现 [60,180] 是 application 口径；续写目标 ≈150、<120 扣分），不硬 block。

## Step 4 — 前端

**`app/src/.../WritingAnalysisPanel.tsx`** + harness writing 分支：加 **continuation 分支**渲染——modelAnswer（两段）+ **Continuation Design**（theme 一行 + 两段设计，标注"第1段/第2段"）+ highlightExpressions。application 分支不动。404 优雅降级沿用。**视觉打磨归 owner（约定分工）**；DEV 只搭结构 + 复用现有 `pi-writing-*` 类。

## Step 5 — Backfill 数据（全 12 套）

- 7 个不同故事范文已就绪 → **源用 tracked `docs/cuts/I19-writing-analysis-continuation/pilots/*.out.json`**（SW-5：`.scratch/` 会被清/ignore，别用）→ 落 7 个 i-卷 + 2025-ii 对应 paper-asset。
- **缺 5 套 ii-卷**（2020-ii / 2021-ii / 2022-ii / 2023-ii / 2024-ii，各与 i-卷同故事）：**逐卷独立生成**（PA MF-3：禁跨 paperId 复制 modelAnswer），走「LOCKED prompt 生成 → 课标-clean → gate_check 迭代到零超纲」管线。
- **SW-1（命门）ii-卷质量门**：5 套 ii-卷在 **owner 逐篇 QA 通过前不得 persist 进提交**；硬 gate（结构+词汇）+ owner QA 双兜底。若任一套 gate 反复不过 / 质量不达第五档，**单独记 follow-up、不阻塞已就绪的 7 套**（7 套可先落、先 QA、先用）。
- persist 全 12 套 → `app/public/paper-assets/paper-*/latest/analyses/writing-analysis-v1.json` 的 `groups['group-<id>-writing-continuation'].writing`（envelope merge，**application 组不被 clobber**，`latest/` git 跟踪）。

## Forbidden（DEV 边界）

- 不碰 base 解析（reading/cloze/grammar/seven）、不动 ADR-0007 六题型发布门、不进 ADR-0009 DB 搜索库。
- 不动 application 写作解析的形状 / 数据。
- 不提交 `versions/`(gitignored) / `data/*.sqlite` / `.scratch/**` / `.claude/launch.json`。
- 写作解析落文件**非 DB**，不需停 API。

## Verify（RM 前）

- `tsc --noEmit` 绿（判别联合收窄、前端分支类型安全）。
- AJV schema 12/12 ok；**回归：旧 application-only 文件（不带 continuationDesign）仍 AJV pass**（MF-3 向后兼容）；continuation 硬 gate 12/12 pass（结构 + **词汇 gate 零未注释超纲、可复跑**）。
- 12/12 完整性：envelope 形状、**application 组未被 clobber**、highlight 全逐字命中、continuationDesign 各 2 段、0 audit/studentWordCount 泄漏、每 writing 仅契约字段。
- print-ready 门（ADR-0007 六题型）仍绿——写作解析未接发布 validator（设计如此）。
- 浏览器 QA：owner 逐篇 QA 续写解析在 app 内渲染（深链 `?view=paper-intelligence&source=paper-asset&paperId=<id>&surface=paper&groupId=group-<id>-writing-continuation`）。

## PA Follow-Up Decisions

fresh PA（`pa.md`，2026-06-06，APPROVE WITH MUST FIX）出 3 个 MF，PM 处置如下（已折叠进上方 Step）：

| Must Fix | 处置（已落 plan） |
| --- | --- |
| **MF-1** persist 投影丢 `continuationDesign` | Step 3 ⚠️ 段：`persistWritingAnalysisGroup` 投影按 taskType 分支存 design；`validateWritingAnalysisCandidate` 放宽 taskType 硬卡 + 增校 design（恰 2 段各非空 / theme 非空）。明记"改现有函数非新写"。 |
| **MF-2** 词汇 gate 输入源不可复现 | Step 3 词汇 gate 段：allowlist 取自 tracked `paper-asset.json`(materialText+starters)；声明 skill 依赖路径+基线；skill 缺失 fail-hard；口径锚定 cut 目录 `gate_check.py`（GENUINE_OOV 为空才 pass）。Verify 加"词汇 gate 可复跑"。 |
| **MF-3** schema 改 const 非纯加法 | Step 1 schema 段：`taskType` 改 `enum`、`if/then` 加 continuationDesign required、公共 required 不含 continuationDesign、schemaVersion 仍 v1。Verify 加"旧 application 文件仍 AJV pass"回归。已删"application 分支不变/纯加法"错误措辞。 |

**已吸收的 Should Watch**（非 block，但已落 plan 防 DEV 踩坑）：SW-1（ii-卷 owner QA 前不 persist + 单卷失败记 follow-up 不阻塞 7 套，Step 5）；SW-2（续写软警告下界 120，Step 3）；SW-5（backfill 源用 tracked `pilots/`，Step 5）。SW-3/4（normalize 复用、audit 不泄漏）I18 已守、续写沿用，无新动作。

**Open PO Decision = 1（已隐性拍板，不 block）**：范文取向「课标-clean 优先于母语级生动」——doctrine/prompt 已 LOCKED、7 pilot 已按此 owner 逐篇 QA 过、gate 实跑 CLEAN。维持现取向即可直接 build；仅供 owner 最终知会（若改要母语级生动须回炉重磨 prompt+范文，当前不需要）。

## 复用地基（I18，换内容形状即可）

存储 ADR-0010 / envelope 一文件多 groupId merge / verb-profile sidecar 先例 / vp-driver 骨架 / 前端 by-name fetch + 404 降级。**续写换的是**：判别联合契约 + Continuation Design 字段 + 续写 doctrine/prompt + 词汇 gate + 前端 continuation 分支。
