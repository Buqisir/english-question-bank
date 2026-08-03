# legacy-import-retire Decisions

本刀 = ADR-0016「网站端零导题 UI」**第 3 刀（末刀）**。Cut 1 = C7「整卷导入」
（PR #263）、Cut 2 = 面 A「AI 导题」（PR #264）已合 main@9a0ab14。三刀伞状决策见
`docs/adr/0016-website-zero-import-ui.md`。本文件记 legacy「导入资料」特有的
**grill 执行决策**（owner 黄学伟 2026-07-06 拍板 4 问）。

legacy = 人工导题后台：`server/imports/*`（本地扫描 + 补录 + 答案对齐）+ App.tsx
内嵌 802 行 JSX 模态。它就是 ADR-0016 §背景说的第 3 颗按钮「导入资料」。

## D1（grill Q1）整块退役「多卷闭环状态」看板 —— **scope 扩张，owner 授权**

**裁决：整块退役** AdminWorkbench「数据维护」面板里的「多卷闭环状态」监控视图
（`workflow-view`：资料 → 入库 → 题集 → 成品 生命周期看板）。

**这是 scope 扩张**——超出「退 legacy 导入」本身。侦察挖出隐藏耦合：
`api.mjs listPaperWorkflowStatuses()`（在 api.mjs + `server/paper-sets/routes.mjs`，
**不在** legacy 删除文件里）**调用了** legacy 的 `listImportBundles()` 填「资料」列。
删 legacy 后端逼这个看板做选择。owner 原话（2026-07-06）：「我是想全部退掉这一块
资料有关的，这多卷闭环状态，因为后面不需要了，这个有点像导卷的……那我以后可能会
有专门的管理页面……Owner 也像 Member 一样加题组题。」

**为什么放同一刀（不拆）**：看板是 `listImportBundles` 的**唯一库外消费者**。若只退
legacy、留看板，必须做「降级」手术（斩断 join、留半死看板）——反而更绕、留一个资料
列永远空的残面。整退 = 把耦合子系统一次清干净，git 更干净、无尴尬中间态。

**验证为安全（侦察实证，非承诺）**：
- **member 零影响**：看板 + 「生成整卷题集 / 一键加草稿」按钮全在 `isOwnerView` 门内
  的 AdminWorkbench，member 从不渲染。member 组卷/加草稿是独立一套（`addToBasket`
  → `addGroupsToBasket`，消费侧 ConciergeDesk）。
- **主卷数据零影响**：看板只**读** paper_sets 显示状态；删看板 = 停止读，**不删**任何
  主卷数据/路由。`selectPaperSetSummaries`（组卷用）另有 2 个消费者（api.mjs:2579/2875），
  必留。
- **能力不丢只丢快捷方式**：`addWorkflowGroupsToBasket`/`handleBuildWorkflowPaperSet`
  复用 member 同款核心（`addGroupsToBasket`/`savePaperSet`/`createBasketItem`/`paperDraft`）。
  删掉后 owner 走 member 同款消费流组卷——正是 owner 要的形态。
- **后端干净**：`listPaperWorkflowStatuses` + 3 个仅它自用的 helper
  （`inferPaperTitleFromQuestionGroupTitle`/`buildObjectiveBankStatus`/`workflowStatusFor`）
  一起删；`selectPaperSetSummaries` 留。

**Q4（openWorkflowDraft 第二入口）随此解决**：它是这看板卡片的「继续/生成草稿」按钮
（`App.tsx openWorkflowDraft` → `setImportOpen(true)`），随看板删。

## D2（grill Q2）本地目录扫描 = 死工具，随模态删

`scanImportDirectory` 硬编码 owner 本机路径
`/Users/huangxuewei/Desktop/10_日常工作/真题答案版`（App.tsx `batchDirectoryPath`
useState 默认值）——服务器上此路径不存在，**线上早死**。它是 import 模态的
「扫本地文件夹批量导入」功能，随模态整删。owner 确认不再用，导题全走后台管线。

## D3（grill Q3）答案对齐补录无在途依赖，随模态删

`prepareAnswerAnalysisImport` / `handleGenerateAnswerAlignment` /
`handleApplyAnswerAlignmentGroup`（生成答案对齐 → 应用到题组的运营补录）在 import
模态内。owner 确认「没有在途工作，全删」——补录以后走后台 Agent。

## D4 KEEP 命门（删了砸后台线 / member 看题 / 组卷）

零改动：
- **后端引擎**（ADR-0016 §要害）：`server/paper-import-ai/*` 分析器、
  `server/paper-import/{publisher,validator,storage,multipart}.mjs`、import-pipeline、
  verbProfileBackfill。legacy 用的是 `server/imports/*`，**不碰 `server/paper-import/`**。
- **`selectPaperSetSummaries`**（api.mjs:2541）+ 注入进 legacy 工厂的 helper 中**真有库外
  消费者的 5 个**：`cleanDraftText`/`normalizeDraftText`/`normalizeAnswerValue`/
  `timestampPrefix`/`groupTypeLabels`（→ readingDifficultyNormalizer/synonymDifficulty/
  exports/print-renderer）。
  - **⚠️ 更正（PA MF-3）**：另 4 个注入 helper `sanitizeFileName`/`inferImportFileType`/
    `normalizeExamTitle`/`extractDeclaredExamTitleFromText` **不是 KEEP**——其唯一库外
    消费者是本刀整删的 `importListing.mjs`，删后零 survivor，**本刀一并删**（连 api.mjs
    L3889-3891 那条过时「STAY in api.mjs」注释）。§KEEP 自检对这 4 个豁免。
- **`savedPapers`（App.tsx）不是 KEEP**（PA MF-2）：其全部 reader 在本刀删除的
  import 模态/看板宿主里，删后全孤儿 → 本刀一并删（含 `fetchPaperSets` effect）。member
  组卷用 `paperDraft`，不用 savedPapers。
- **parse 回填**（detail-consume-only KEEP，命名撞车高危）：`clozeParseResult` /
  `sevenChoicesParseResult` / `grammarParseResult` / `readingParseResult` 系列 state +
  `parseClozeGroup`/`parseSevenChoicesGroup`/`parseGrammarGroup`/`parseReadingQuestionGroup`/
  `saveXParseResult` service。**与 import 文件解析**（`parseImportFile`/
  `fetchImportFileParse`/`parseStatusByFileId`/`activeImportParse`）**同用 "parse" 一词，
  语义相反，必须按符号名外科区分**。见 plan §陷阱。
- **member 消费**：`addToBasket`/`addGroupsToBasket`/`savedPapers`/`paperDraft`/
  `paperExports`/EntryModal（编辑非导题）全留。
- **AdminWorkbench「给题库打主题标签」**（`onBackfillTopicLabels`）非 legacy，留。

## D5 未来「专门管理页面」不建、不预留

owner 提「以后可能有专门的管理页面」——记为**将来单独的事**，本刀现在不建、不预留
任何脚手架（承 ADR-0015 §1「不建替代管理页」+「网站只消费」）。owner 运营改数据走
后台。
