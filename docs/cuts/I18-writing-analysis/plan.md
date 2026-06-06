# I18 Plan — 写作解析 v1（应用文范文 + 亮点表达，竖切 2024-i 后回填）

## Cut Size

**large**。Touches **data contract**（新增 `WritingAnalysis` 契约 + 扩 `GroupAnalysis` + 新 schema 文件）、新增一族**展示型解析**的存储/生成/前端面，立 **ADR-0010**（基于 0007/0008/0009）。
全门：`Sync → plan.md → fresh PA(pa.md) → PM 压缩 → Sonnet DEV → fresh CR(cr.md) → PO QA(在 app 里看 2024-i 范文) → RM`。
**有 UI 改动** → 需浏览器 QA。**契约 hook 会弹确认**：本刀改 `app/src/domain/paperAsset.ts` 与 `schemas/`，二者都在 `.claude/hooks/guard-contract-files.mjs` 守护范围内。

## Objective

点亮 ADR-0007 留的「future writing analysis」坑：给写作组一块**只读展示的写作解析面板**。v1 范围 = **应用文** 一个题型、内容 = **范文（Model Answer）+ 亮点表达（Highlight Expressions）**，离线用 Claude 生成、落成 paper-asset 文件、前端只读展示。先在 **2024-i** 一套上把「schema → 生成 → 校验 → 落库 → 前端看见」整条竖切打通，PO QA 抽检通过后再 backfill 其余 11 套的应用文组。

读后续写、短文改错、评分标准、失分点、交互式 AI 批改 —— **全部不在本刀**。

## Why（owner-locked，2026-06-05 grill）

- **形态 = 静态展示**（owner 选）：离线生成、在线只读，不碰运行时 AI。淘汰了「交互式 AI 批改」（那是产品级大功能）。
- **题型 = 应用文先竖切**（owner「应用文先收敛」）：应用文收敛、有近乎标准的范文，60 分容易做到位；读后续写发散，复用本刀地基后再上。
- **内容 = 范文 + 亮点表达**（owner「范文加高分句块」）：审题要点砍（题面已列要点，冗余）；评分标准/失分点 defer。
- **范文定调 = 普适·够得着的好**（owner「面向 ~90 分的孩子，谁都能写出来又好」）：高频词、可靠句式、命中词数目标；不堆生僻、不母语炫技；一篇，不分层样本。**这是生成 prompt 的硬约束。**
- **亮点表达 = 从范文里挑的可迁移句块 + 中文 note**（owner 认可）：≈3–5 条；每条 `{text, note}`，note 一句中文讲「作用/为什么高分/怎么改用」。
- **存哪 = Option A（owner「认可A」）→ ADR-0010**：paper-asset 文件型展示解析、可回填、不进发布门。理由见 ADR-0010（展示 vs 搜索；输入已保全）。
- **前端分工 = A（owner「认可」）**：DEV 做 schema + 驱动 + 数据 + 一个**朴素能跑通**的面板；owner 接手打磨视觉。
- **受众**：老师/学生都覆盖，不专门裁剪（owner「受众不用考虑太清楚，都要写」）。

## Code Reality（本会话 intrinsic 核实 — 围着它设计）

- **契约挂点已就位**：`app/src/domain/paperAsset.ts`
  - `PaperAnalysis = { meta?, groups?, questions? }` @229；`GroupAnalysis = { overview?, discourseStructure? }` @245-248。→ 写作解析挂 `groups[groupId].writing`，**加法扩 GroupAnalysis**。
  - `PaperWritingTask` @198-211：`{ writingTaskId, groupId, taskType:'application'|'continuation', title, instruction, wordCountTarget?, continuationStarters?, materialText?, applicationGiven?:{top[],bottom[]} }`。存于 `PaperContent.writingTasks: Record<id, PaperWritingTask>`。
- **前端 writing 分支已存在**：`app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx` @433-446 —— `if (group.groupType==='writing')` 现在只 `buildWritingPaperView` 渲染题面、注释明写「no analysis file」。**本刀在此分支加 fetch `analyses/writing-analysis-v1.json` + 渲染面板。** 其余族是按文件名逐个 fetch（@448-452 `analyses/<family>-analysis-v1.json`）—— 加一个文件是纯加法。
- **回填先例 = verb-profile（#189）**：`grammar-fill-verb-profile-v1.json` 已经是「`latest/analyses/` 里加法、git 跟踪、导后 Claude 回填」的文件。**`scripts/import-pipeline/vp-driver.mjs` 是本刀驱动的直接模板**（list 写 combined.txt+manifest；persist 读 agent 的 `.out.json` → validate → persist 写文件）。它复用 `server/grammar-verb-profile/verbProfileBackfillService.mjs`（persist）+ `server/paper-import-ai/analyzeGrammarFillVerbProfile.mjs`（buildMessages）—— **写作这边无现成服务，要新建对应件。**
- **存储事实**：`app/public/paper-assets/<id>/latest/` **git 跟踪**（`versions/` 才 gitignored，`.gitignore:52`）→ 本刀提交物含 **12 个 `writing-analysis-v1.json`**（v1 只填 application 项）。
- **2024-i 应用文实测**（`paper-2024-i/latest/paper-asset.json`，taskId `wt-2024-i-application`）：`wordCountTarget: 80` ✅；**`applicationGiven: undefined`** ⚠️ —— 称呼骨架「Dear Chris,…」埋在 `instruction` 文本里，未被解析成结构字段。→ **驱动 Q5② 决定改向（见 Locked Decisions #3）。**
- 12 套 paperId（ALLOWED，沿用 vp-driver @13）：`paper-{2020..2025}-{i,ii}`。每套各 1 个 application 写作组：`group-<year>-<roman>-writing-application`。
- **i/ii 配对（PA MF-3 修正，实测）**：**12 套 = 7 道不同题**——2020/2021/2022/2023/2024 各 i=ii 同题（5 对）；**2025-i（栏目征稿·观点）≠ 2025-ii（介绍加拿大体育·邀请/催稿）是两道不同题**。故 backfill **逐卷独立生成（12 次），绝不跨 paperId 复制 `modelAnswer`**（否则 2025 错配）。会话内 7 道已各压测一遍（全第五档 14–15）。

## Locked Decisions

1. **存储（ADR-0010）**：`app/public/paper-assets/<id>/latest/analyses/writing-analysis-v1.json`，**自描述 envelope**（PA MF-1：全仓靠 `schemaVersion` 识别解析文件 `validator.mjs:145-148`、reading schema 首条即 require；与 verb-profile/reading 文件同构）：`{ "schemaVersion":"writing-analysis-v1", "paperId":"…", "meta"?:AnalysisMeta, "groups": { "<groupId>": { "writing": WritingAnalysis } } }`。前端 fetch 后读 `.groups[groupId].writing`。**不进发布完整性门**；无它的卷照常发布/渲染。
2. **契约形状（加法）**，`app/src/domain/paperAsset.ts`：
   ```ts
   export type GroupAnalysis = { overview?: string; discourseStructure?: DiscourseStructure; writing?: WritingAnalysis }
   export type WritingAnalysis = { taskType: 'application'; modelAnswer: string; highlightExpressions: HighlightExpression[] }
   export type HighlightExpression = { text: string; note: string }
   ```
   `taskType` v1 仅 `'application'`（续写以后扩 union）。+ 新 `schemas/paper-import/writing-analysis-v1.schema.json`，镜像 `reading-choice-analysis-v1.schema.json` 的约定。
3. **Q5② 改向（intrinsic 倒逼，owner 已知会 + PA 数据证实）**：`modelAnswer` = **自包含的完整范文**（称呼→正文→落款，整封信），**不**靠 `applicationGiven` 拼骨架——PA 核实 **12 套 `applicationGiven` 全 undefined**、骨架埋在 instruction 自由文本，改向正确无需回退。解析面板与答题框是两个 surface，给完整范文更好读，无重复问题。
4. **生成模型 = Opus**：范文是公开门面、「够得着的好」语域微妙，Sonnet 易写平。
5. **校验（PA MF-2 修正：词数代码不可靠 → 降软警告）**：**硬 gate（不过即拒）**＝ `taskType==='application'` + `modelAnswer` 非空 + `highlightExpressions` 长度 3–5 + 每条 `text` 非空且**经 normalize（折叠空白、统一直/弯引号与连字符）后是 `modelAnswer` 子串** + 每条 `note` 非空。**软 warning（提示不拒）**＝ `modelAnswer` 总词数落荒谬带外（<60 或 >180）。**精确「学生 110–120 词」不做硬 gate**——骨架埋在 instruction 自由文本、`applicationGiven` 全空（12 套实测），代码无法可靠扣骨架；该口径由生成 prompt 自控（模型自数、emit `audit.studentWordCount`，audit 不入库）+ **PO QA 逐篇兜底**（沿用 topic-label pilot 纪律）。
6. **驱动** `scripts/import-pipeline/writing-analysis-driver.mjs`（list/persist），镜像 vp-driver；scope 到 12 ALLOWED、v1 仅 application 组。解析扇出 = ad-hoc Workflow，**一组一 Opus agent**（agent 自跑 build + 自写 `.out.json`，不让大 prose 经 orchestrator 回传）。
7. **前端 = 朴素能跑通**（DEV）：harness writing 分支 fetch 文件 + 新 `WritingAnalysisPanel.tsx`（范文块 + 亮点表达列表）；视觉打磨是 owner 的后续活，不在本刀 DEV 验收线。

## Must Do（步骤 + 验收）

**Step 1 — 契约（DEV，契约级，hook 会弹确认）**：加 #2 的 TS 类型 + 扩 `GroupAnalysis` + 写 `writing-analysis-v1.schema.json`。验收：`tsc` 过、schema 自洽、现有阅读解析类型/测试不动。
**Step 2 — 生成件（server）**：新 `server/paper-import-ai/analyzeWritingAnalysis.mjs` 导出 `buildWritingAnalysisMessages(writingTask)`（含范文定调硬约束）；新 `server/writing-analysis/writingAnalysisBackfillService.mjs` 导出 `listWritingAnalysisWork({paperAssetsDir})` / `validateWritingAnalysisCandidate(candidate, writingTask)` / `persistWritingAnalysisGroup({paperAssetsDir}, work, analysis)`（写带 envelope 的 `writing-analysis-v1.json`，存在则 merge 该 groupId 项）。**模块布局 PA 已过（无异议）。**
**Step 3 — 驱动**：`writing-analysis-driver.mjs`（list/persist）。验收：`node ... list` 产出 2024-i 的 combined.txt + manifest。
**Step 4 — 竖切生成 2024-i**：Workflow 扇出 1 个 Opus agent 生成 `wt-2024-i-application` → persist → 校验过 → **交 owner QA**。
**Step 5 — 前端**：`WritingAnalysisPanel.tsx` + harness 接线。验收：起 app（`./scripts/dev.sh`），打开 2024-i 应用文组，右侧显示范文 + 亮点表达。
**Step 6 — 回填其余 11 卷（owner QA 通过后）**：**逐卷独立生成**（扇出 11 个 Opus agent，2025-i/ii 各自生成、绝不跨卷复制）→ persist → 校验全过 → owner 逐篇 QA → commit 12 个 `writing-analysis-v1.json`。

## Forbidden（边界）

- **禁跨 paperId 复用 `modelAnswer`**（PA MF-3：i/ii 非全同题，2025 i≠ii；逐卷独立生成 12 篇）。
- 不动 base 解析 / per-Question analysis（阅读/完形/语法/七选五）的类型、文件、渲染。
- **不把 writing 加进发布完整性门**（ADR-0007 六题型门保持原样）。
- 不建模 continuation（读后续写）、短文改错；不做评分标准/失分点；不做交互式 AI 批改。
- 不把任何写作解析数据塞进 ADR-0009 的 DB 属性库（它是展示解析、走文件）。
- 不碰全国甲乙卷导入（那是另一刀，已暂缓）。
- stage 显式、禁 `git add -A`；不提交 `data/*.sqlite` / `.scratch/**` / `versions/`。

## Verification / RM

- `node scripts/verify-cut-artifacts.mjs docs/cuts/I18-writing-analysis large`（plan.md / pa.md / cr.md 齐）。
- 相关 `verify-i*.mjs`（若有 paper-asset / analysis 契约校验）绿。
- 浏览器 QA：2024-i + 抽 1–2 套 backfill 后的卷，范文 + 亮点表达正确渲染。
- CI 是 `on: pull_request`，开 PR 才跑。
