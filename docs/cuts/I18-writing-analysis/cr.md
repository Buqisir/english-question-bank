# I18 CR — 写作解析 v1（应用文 Model Answer + Highlight Expressions）

Reviewer: CR (小川, fresh cold-read). Branch `i18-writing-analysis`. Diff `d900aa8..HEAD` (HEAD `dc7a590`), 5 commits, 25 files, +1395/-4. Tier: large（碰数据契约）.
Method: intrinsic 核实，每条带 file:line。范文教学质量不评（owner 已压测）；只看代码忠实搬运 + 契约加法性 + 边界遵守。

## Verdict

**APPROVE WITH MUST FIX.** 实现忠实于 plan，PA MF-1/2/3 三条全部正确落实，Forbidden 边界全守。竖切 + 回填都跑通：12 个数据文件全部通过硬 gate（JS 校验 12/12 pass、AJV 对 schema 12/12 ok）、57 条亮点表达**全部逐字（exact）命中** modelAnswer、无 audit 泄漏、只存 3 个契约字段。`tsc` 绿、print-ready 门 32/0 绿、写作 schema 未接入发布门。**唯一 Must Fix 是 RM 闭环物：缺 `cut-note.md`（large 必需）**——代码可合，但 large cut closeout 前必须补。

## 核实结论（逐条对 plan / PA）

### 1. 契约加法性 ✅
- `paperAsset.ts:245-262` 加 `WritingAnalysis`/`HighlightExpression`，`GroupAnalysis` 扩 `writing?`（真加法，reading 的 `overview`/`discourseStructure` 与 per-Question 解析不动）。`taskType: 'application'` 单值 union，续写以后扩——与 plan Locked #2 一致。
- schema `writing-analysis-v1.schema.json` envelope（`schemaVersion`/`paperId`/`groups`）与 verb-profile / reading 文件同构，required 含 `schemaVersion` → 满足 PA MF-1。AJV 编译通过、对 12 文件全绿。

### 2. 校验硬 gate（`writingAnalysisBackfillService.mjs:126-180`）✅
- 硬 gate = `taskType==='application'` + `modelAnswer` 非空 + `highlightExpressions` 长度 3–5 + 每条 `text` 非空且 normalize 后是 `modelAnswer` 子串 + 每条 `note` 非空 —— 精确对齐 plan Locked #5 / PA MF-2。
- 词数 = **软警告**（`[60,180]` 带外 console.warn，不 block）——符合 MF-2 降级。实测 12 套 wc 119–138，全在带内，无警告。
- `normalizeForSubstring`（:27-34）统一直/弯引号、en/em-dash→hyphen、折叠空白；**不 lowercase**（避免大小写过宽匹配，正确）。实测 57/57 亮点是 **exact** 子串，normalize 仅作安全网、未掩盖任何"现编"问题。
- audit **被丢弃**：`persistWritingAnalysisGroup:223-227` 只取 `{taskType, modelAnswer, highlightExpressions}`，`highlightExpressions.map(({text,note})=>...)` 显式剥字段。实测 12 文件 0 audit 泄漏、每条 writing 仅 3 键。

### 3. persist 安全性（:198-254）✅
- 走 `resolvePaperAssetReadPaths(paperAssetsDir, paperId)` 取 baseDir（与 verb-profile 先例同 baseDir，ADR-0005 不破）。
- envelope merge 保留其它 groupId（`...existingGroups`）+ 保留 existingMeta；只覆盖目标 groupId 的 `writing`。
- 原子写：temp + `renameSync`，失败清理 temp。
- `listWritingAnalysisWork` 的 skip-when-done（:96）经实测生效：12 套已 persist 后 `driver list` 返回 work=0，重跑 persist 不会重生成。

### 4. 前端 ✅
- writing 分支 fetch `analyses/writing-analysis-v1.json`（harness:448），404/异常优雅降级：`try/catch` 包裹，失败 `resolvedWritingAnalysis=null`，仍 `buildWritingPaperView` 渲染题面 + setReport/setPassageStructures，不 throw（:463-475）。legacy-base 重试（:450-455）镜像其它族 @484-497 的既有模式。
- 渲染链（:1480-1481）`writingModel && writingAnalysisModel` 分支夹在 grammarFill 与 paper-asset 之间，**互斥**：writing 分支把 grammarFill/cloze/sevenChoices/paperAsset model 全 set null（:469-472），其它族分支也历来 setWritingModel(null)。无文件时落到 `source==='paper-asset'` / Legacy，回归路径不破。
- `buildWritingPaperView` / `writingPaperViewAdapter` **未改**（git stat 确认）——PA SW-2/SW-3 守住：新 state（`writingAnalysisModel`）+ 新 render 分支，不走 activeQuestionId 通道、不污染 passageReport。
- `WritingAnalysisPanel.tsx` 纯展示，复用 `pi-*` 容器，无新设计系统——符合 plan #7「朴素能跑通」。

### 5. prompt 忠实搬运（`analyzeWritingAnalysis.mjs`）✅
- SYSTEM 逐字等于 `prompt-v1.md` SYSTEM 段（含目标水平/创作准则/输出 JSON/自检，全部字符级一致）。
- USER 插值题面 + 词数 + 任务类型 + 骨架；对「骨架埋在 instruction」的现实处理得当：`applicationGiven` 全 undefined 时落「（见题面 instruction 中的骨架部分…）」占位（:70-72），符合 Q5② 改向。

### 6. 范围遵守（Forbidden）✅
- 未碰 base 解析类型/文件/渲染；未改发布完整性门（print-ready gate 32/0 绿，未含 writing）；未建 continuation/短文改错；未塞 ADR-0009 DB 库；写作 schema 未接入 `validator.mjs`。
- 禁跨 paperId 复用 modelAnswer（MF-3）：2024-i vs 2024-ii 同题但措辞各异；2025-i（报刊新栏目）≠ 2025-ii（艺术老师跟进邮件）确为两道不同题、内容各异。
- 无 `versions/` / `.sqlite` / `.scratch/` 进 diff；恰好 12 个 `writing-analysis-v1.json`。

### 7. 数据文件抽查 ✅
- 体裁正确：2020-i（越野赛报道）、2021-i（"Youth and Me" 投稿）**无 Dear/Yours**；书信类（2024、2025）有称呼。
- envelope 头齐（schemaVersion/paperId/groups），groupId 命名 `group-<year>-<roman>-writing-application` 正确。

## Must Fix（block merge / closeout）

### MF-1 — `cut-note.md` 缺失（large cut closeout 物）
`node scripts/verify-cut-artifacts.mjs docs/cuts/I18-writing-analysis large` → FAIL：`cut-note.md 存在且非空 (large)`。large cut RM 闭环要求非空 `cut-note.md`。**代码本身可合**，但 large closeout 前 RM 必须补写 cut-note（含本 CR + PO QA 结论）。本 cr.md 落地后 PA/CR 记录齐，仅差 cut-note。

## Should Watch（不 block）

- **SW-1 PO QA 是学生词数唯一兜底**：硬 gate 不管词数、软警告带宽很宽 [60,180]。modelAnswer 含称呼落款的全信词数 119–138，"学生所写 110–120" 这条只能靠 PO 逐篇 QA + prompt 自控——这是 MF-2 设计的有意取舍，记录即可。浏览器 QA 仍需按 plan 抽检 2024-i + 1–2 套 backfill。
- **SW-2 normalize 理论假阳风险未触发**：normalize 后子串匹配理论上可能放过"近似但非逐字"的亮点；实测 57/57 exact，风险未现。若未来续写族重用此校验、模型输出风格更松，留意。
- **SW-3 `key={i}`（Panel:31,43）**：静态只读列表用 index key 无害（无重排/增删）。

## Self-Review Blind Spots（喂后续若有 Big CR）

- 未起 app 做浏览器 QA（CR 不含 PO QA）；面板视觉/A4 布局是否如 owner 预期 = PO 职责，本 CR 只验逻辑挂载与回归不破。
- 范文教学质量（语域/要点覆盖/第五档）未评——owner 已压测验收，超出 CR scope。
- 12 套数据正确性以「逐字命中 + 体裁有无 Dear/Yours + 2025 i≠ii 内容各异」抽证，未逐篇核每个内容要点是否覆盖题面（属 PO 逐篇 QA）。

## 总评

**可合**——代码、契约、数据、边界全过，三条 PA Must Fix 已正确落实，静态/校验全绿。**唯一拦路是 large closeout 需先补 `cut-note.md`**（RM 物，非代码缺陷）；补齐后即可 RM 合并。
