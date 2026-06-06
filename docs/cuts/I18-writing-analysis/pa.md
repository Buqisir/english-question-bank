# I18 PA — 写作解析 v1（应用文 Model Answer + Highlight Expressions）

Reviewer: PA (小川, fresh cold-read). Branch `i18-writing-analysis`. Tier: large / 碰数据契约 → 4-session 全门。
Method: intrinsic 核实，每条带 file:line。范文 prompt 教学质量不评（owner 已压测）。

## Verdict

**APPROVE WITH MUST FIX.** 方向、存储决定、回填先例、前端落点都站得住——verb-profile 先例经核实**真成立**（git-tracked `latest/analyses/` 加法、走 `resolvePaperAssetReadPaths` 同 baseDir、不碰 versions/、无 ADR-0005 缺口）。Q5② 改向被 12 套数据全证实。但有 3 个 Must Fix（文件 envelope 形状不一致、词数校验在代码里不可靠、i/ii 配对事实写错）必须先在 plan 里钉死，DEV 才能开工。Open PO decisions = 1（在 3 以内）。

## Product Principle

老师/学生在 PaperSurface 写作组右侧看到一篇「够得着的好」范文 + 3–5 条可迁移句块，讲评/自学直接可用。离线生成、在线只读，不碰运行时 AI。这是补 ADR-0007 留的写作解析坑，不是新建 AI 批改面。守住「展示 ≠ 搜索」（ADR-0010）、「不进发布门」（ADR-0007 六题型门原样）就守住了边界。

## Exact Architecture Model（核实后）

- **契约挂点**：`app/src/domain/paperAsset.ts:245` `GroupAnalysis = { overview?, discourseStructure? }` → 加 `writing?: WritingAnalysis` 是真·加法，现有 reading GroupAnalysis（overview/discourseStructure）与 per-Question 解析不受影响。✅
- **存储先例真成立**：`grammar-fill-verb-profile-v1.json` 经 `git ls-files` 确认在 `app/public/paper-assets/<id>/latest/analyses/` **被 git 跟踪**（10/12 套已有）；`versions/` gitignored（`.gitignore:52`）。写入走 `verbProfileSidecar.mjs:20-23` → `resolvePaperAssetReadPaths` baseDir，**显式注释 MF-1「never a hardcoded latest/」**（`verbProfileSidecar.mjs:12-15`）。12 套都有 `latest/paper-asset.json`（`storage.mjs:32-38`），故 baseDir = `latest/`、提交物落 tracked 区。**ADR-0005 一致性无缺口**：sidecar 刻意读「index 同一 baseDir」。
- **驱动模板**：`vp-driver.mjs` 写中间产物到 `.scratch/import-pilot/vp`（gitignored scratch），persist 才落 tracked 解析文件——写作驱动镜像即可，scratch 中间产物天然不入库。✅
- **前端落点**：harness `PaperIntelligencePaperSurfaceHarness.tsx:433-446` writing 分支现只 `buildWritingPaperView` 渲染题面、无 fetch（注释 `no analysis file`）。其余族按文件名 fetch（@448-452）。加一个 `analyses/writing-analysis-v1.json` fetch 是纯加法。⚠️ 但见 MF-3 子项：面板落点不是「喂现有 aside」。

## Must Fix Before DEV

### MF-1 — 文件 envelope 形状与既有先例/校验约定不一致（数据契约）

plan Locked #1（`plan.md:39`）定文件 = 裸 partial PaperAnalysis：`{ groups: { "<groupId>": { writing: WritingAnalysis } } }`，**无 `schemaVersion`/`paperId` 顶层**。但它引为先例的 verb-profile 文件**是自描述的**：顶层 `schemaVersion: "grammar-fill-verb-profile-v1"` + `paperId`（实测 `grammar-fill-verb-profile-v1.json` 头部）。且全仓 analysis 文件靠 `schemaVersion` 识别（`server/paper-import/validator.mjs:145-148 detectJsonSchemaVersion`），reading-choice schema 顶层 required 含 `schemaVersion/paperId/sourceAssetVersion`（`reading-choice-analysis-v1.schema.json:7`）。

**风险**：裸形状没有自描述头，未来「这是哪版解析」无法机检；与房子里两个先例（verb-profile sidecar、reading-choice analysis）都不一致；schema 文件 `$id`/`const schemaVersion` 无处落（plan 称要镜像 reading schema，但 reading schema 第一条就 require `schemaVersion`，裸形状镜像不出来）。这是「short-lived/ambiguous data contract」风险。

**Disposition**：plan 必须二选一并钉死——
(a) 推荐：加 envelope，文件 = `{ schemaVersion: "writing-analysis-v1", paperId, groups: { "<groupId>": { writing: WritingAnalysis } } }`，前端读 `.groups[groupId].writing`（envelope 不影响读路径），与 verb-profile 完全同构；或
(b) 显式 ADR/plan 记「写作解析文件刻意不带 envelope、理由 X」，并说明 schema 文件如何不靠 `schemaVersion` 区分。
不可把这留给 DEV 即兴。

### MF-2 — 词数校验「仅学生所写、排除已给骨架」在代码里没有可靠实现路径（不可验证的校验）

plan Locked #5①（`plan.md:49`）：`modelAnswer` 词数落 `wordCountTarget ±30%`，"target 缺失则用 instruction 解析或跳过"。但 Code Reality 已记 `applicationGiven: undefined`，且 Q5② 又把 `modelAnswer` 定为**自包含完整范文（含称呼/落款骨架）**。实测 12 套 instruction 里骨架（"Dear Chris, … Yours, Li Hua"）+ 中文要求行混在一起（`paper-2024-i` instruction 实测）。于是校验要比的是「学生实写词数」，但 `modelAnswer` 含骨架、`wordCountTarget:80` 指的是学生所写——**两者口径不一致**，且「从 modelAnswer 里减去骨架词数」在代码里靠什么减？`applicationGiven` 为空，骨架只埋在 instruction 自由文本里，没有结构字段可依。

**风险**：①校验要么把骨架算进词数→范文被迫写短以过线（伤质量），要么无法可靠扣骨架→校验形同虚设（PA-persona 点名「verify plan 不能证明风险」）。②全 12 套 `target:80`、全 `applicationGiven: undefined`（实测），所以这不是个例外，是**每一套都踩**。

**Disposition**：plan 必须明确「学生所写词数」的可计算定义。建议：DEV 不去 instruction 里扣骨架（不可靠），改为 **modelAnswer 总词数对 `wordCountTarget` 放宽到 +骨架冗余的区间**（如 `[target*0.7, target*1.3 + 称呼落款固定~8词]`），或更简单——**词数校验降级为「软警告 log，不 block persist」**，硬 gate 只保留「≥3 亮点 + 每条 text 是 modelAnswer 子串 + note 非空」这三条可机检项 + PO QA 抽检兜词数。plan 要钉死选哪条，别让 DEV 自己发明扣骨架算法。

### MF-3 — i/ii 配对事实写错，会误导 backfill（边界/范围）

plan Code Reality / 任务背景默认「12 套 = 7 道不同题，i/ii 同题」。实测：2020–2024 的 i/ii 确为同题（5 对），**但 2025-i 与 2025-ii 是两道不同题**（2025-i「英语报增设栏目/Fun at…」 vs 2025-ii「介绍加拿大体育运动」）。所以是 **5 对 + 2 个单题 = 7 distinct**，不是 6 对。

**风险**：若 backfill 时按「i 生成后 ii 复制」省 token，2025 会把 i 的范文错配到 ii（完全不同题面）。这是会进 12 个提交文件的内容正确性错误。

**Disposition**：plan 必须改写该事实为「5 对同题 + 2025-i/ii 两道不同题；backfill **每套独立生成**（Step 6 已是 11 个 agent 各自生成，保持，不做 i→ii 复制优化）」。并在 Forbidden 或 Must Do 里写一句「禁止跨 paperId 复用 modelAnswer」。

## Must Fix → Plan Disposition Checklist

| Must Fix | plan.md 须记录的处置 |
| --- | --- |
| MF-1 envelope 形状 | Locked Decisions：钉死 (a) 加 `{schemaVersion, paperId, groups:{...}}` envelope（推荐，与 verb-profile 同构）或 (b) 显式记「刻意无 envelope + 理由 + schema 如何区分」。schema 文件 Must Do 据此写。 |
| MF-2 词数校验 | Locked #5① 改写为可计算定义：要么放宽区间含骨架冗余，要么词数降为软警告 / PO QA 兜底；硬 gate 只留「≥3 亮点 + text 子串 + note 非空」。Verification 段同步。 |
| MF-3 i/ii 配对 | Code Reality 改「5 对同题 + 2025 两道不同题 = 7 distinct」；Forbidden 加「禁跨 paperId 复用 modelAnswer」；Step 6 明确每套独立生成。 |

## Should Watch（不 block DEV）

- **SW-1 子串匹配的 normalize（plan Locked #5③ 已提，但要钉具体规则）**：范文里的引号/破折号/空白 vs 亮点 text 可能因弯引号（`'` U+2019，instruction 实测就是弯引号）、em-dash、NBSP 不匹配。plan 已说「normalize 后子串匹配」——DEV 须至少 normalize：统一直/弯引号、统一 dash、collapse 空白、统一大小写边界由 PO 定。这是实现细节但若漏会让合法亮点被误判「现编」。记入 DEV 实现注意，不单独 block。
- **SW-2 面板落点不是「喂现有 aside」**：harness 右 rail（`PaperIntelligencePaperSurfaceHarness.tsx:1306-1374`）渲染 `report.passages` 的篇章结构，writing 分支这些字段全 ZERO（`writingPaperViewAdapter.ts:62-72`）。plan 说「新 `WritingAnalysisPanel.tsx` + harness 接线」是对的——必须是**新 state + 新 render 分支**，不是复用 aside。plan #7 已圈「朴素能跑通、视觉 owner 后续打磨」，落点（左/右/题面下）属视觉、归 PO；DEV 只需挂一个可见、不破现有布局的面板。提醒 DEV：别往 ZERO 的 passageReport 里塞数据（那会污染 reading 渲染路径）。
- **SW-3 `writingModel.analysisByQuestionId` 是 `Record<string, null>`（adapter:22,99）**：写作无 Question，面板数据**不能走 activeQuestionId 通道**（harness:833 那套），必须独立 state。DEV 留意，避免误接到 per-question 解析机制。
- **SW-4 生成模型 = Opus（plan #4）**：成本意识——12 套各一次 Opus 范文是可接受的一次性离线开销，不在运行时。OK，记录即可。
- **SW-5 ADR 间无冲突**：核实 ADR-0007（六题型门，`verify-c8-print-ready-gate.mjs:33` 含 writing 但只校「缺材料」，不校解析）、0008/0009（DB 属性库——plan Forbidden 明禁写作进 DB，正确）、0005（baseDir 一致性——先例已守）。无打架。

## Allowed Files

- 契约：`app/src/domain/paperAsset.ts`（仅加 3 类型 + 扩 GroupAnalysis，hook 会弹确认）、新 `schemas/paper-import/writing-analysis-v1.schema.json`。
- server：新 `server/paper-import-ai/analyzeWritingAnalysis.mjs`、新 `server/writing-analysis/writingAnalysisBackfillService.mjs`（+ 若拆 sidecar 写入件，镜像 `verbProfileSidecar.mjs`）。布局合理、与现有 `server/` 不冲突（`server/grammar-verb-profile/` 同构先例在）。
- 驱动：新 `scripts/import-pipeline/writing-analysis-driver.mjs`。
- 前端：新 `app/src/features/paper-intelligence/WritingAnalysisPanel.tsx` + harness writing 分支接线（grey-zone 文件，DEV 限 fetch + 渲染新面板 + 新 state，不动 reducer/URL state/其他族 adapter）。
- 提交物：12 个 `app/public/paper-assets/<id>/latest/analyses/writing-analysis-v1.json`。
- 文档：本 cut 目录、CONTEXT.md 已有词条（无须改）、ADR-0010（已存在）。

## Forbidden Files

- 不动 base 解析 / per-Question analysis（reading/cloze/grammar/sevenChoices）的类型、schema、adapter、渲染。
- 不动六题型发布完整性门、`verify-c8-print-ready-gate.mjs`、`isGroupPrintReady`。
- 不写任何写作数据进 ADR-0009 DB 属性库 / teaching-facets index。
- 不动全国甲乙卷导入。
- 不改 `versions/`、不提交 `data/*.sqlite` / `.scratch/**`。
- 禁 `git add -A`；禁跨 paperId 复用 modelAnswer（MF-3）。

## Static Verify Requirements

- `tsc` 过（契约加法）；现有 reading/cloze/grammar/seven 解析测试不动、绿。
- `node scripts/import-pipeline/writing-analysis-driver.mjs list` 产出 2024-i 的 combined.txt + manifest（Step 3 验收）。
- 校验函数单测/自检：3 条硬 gate（≥3 亮点、每条 text 子串命中、note 非空）对 2024-i 输出过；词数项按 MF-2 处置后的口径。
- `node scripts/verify-cut-artifacts.mjs docs/cuts/I18-writing-analysis large`（plan/pa/cr 齐）。
- schema 自洽（AJV 能 load 新 schema，不破 `validator.mjs` 既有 addSchema 列表）。

## Browser QA Matrix

- 2024-i 应用文组：右侧出现范文块 + 亮点表达列表（≥3 条，每条 text+中文 note），不破现有题面 / A4 布局。
- 抽 1–2 套 backfill 卷（建议含 2025-i 或 2025-ii，验 MF-3 不同题正确）：范文与题面一致、亮点 text 真在范文里。
- 回归：一个**无** writing-analysis 文件的写作组（若有）/ 任一 reading 组照常渲染，无报错（验「无文件照常」与加法不污染）。

## DEV Readiness

- 改进的老师动作：写作组讲评/自学时有现成范文 + 高分句块。✅
- before/after：before 写作组右侧空白；after 显示范文 + 亮点。✅
- 当前刀边界：应用文一题型、范文+亮点、离线生成只读、12 套。✅
- future 边界：续写/短文改错/评分标准/失分点/AI 批改/搜索维度——全 defer。✅
- allowed/forbidden：见上。✅
- verify/QA：见上。✅
- **DEV 不可开工，直到 MF-1/2/3 在 plan 里钉死**（envelope 形状、词数口径、i/ii 事实+禁复用）。三条都是 plan 级决定，不是 DEV 即兴。

## Open PO Decisions（≤3，当前 1）

1. **MF-1 envelope**：写作解析文件要不要带 `schemaVersion/paperId` 自描述头（推荐带，与 verb-profile 同构）？此为契约形状决定，PO/PM 拍。
   （MF-2 词数口径、MF-3 i/ii 事实、Q5② 已属 intrinsic 倒逼 + 工程处置，PM 压缩即可，不必 PO 单独拍——Q5② plan 已记「owner 已口头知会、未否决前按此执行」，本 PA 核实 12 套数据全支持该改向，无需回退。）
