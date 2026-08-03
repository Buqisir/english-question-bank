# legacy-import-retire Plan

**ADR-0016 第 3 刀（末刀）** — 退役 legacy「导入资料」网站界面（人工导题后台）+
**顺带整退「多卷闭环状态」看板**（grill D1，隐藏耦合逼退，owner 授权）。纯删刀。

- 分支：`claude/legacy-import-retire`（从 `github/main@9a0ab14`）。
- 决策见 `decisions.md`（grill 4 问）；伞状 ADR-0016。
- 规模：后端 3 文件 ~2915 行 + App.tsx（802 行 JSX 模态 + ~40 state + ~19 handler +
  看板）+ AdminWorkbench + questionGroups.ts 手术 + App.css ~211 选择器 + verify 3 删。

## 执行纪律（dev-hard，禁 spawn 子代理）

1. **行号全部标 @9a0ab14，仅供快速定位。编辑前必对每个符号 `grep -n` 重定位**——
   本刀 App.tsx 6600 行，删一段后所有下游行号漂移。按**符号名**删，不按行段盲删。
2. **禁整读 App.tsx**（6600 行，watchdog 风险 + 无必要）。用 `grep -n` + `sed -n`
   抽段 + 定点 Edit。
3. 删完跑 `pnpm -C app build`（tsc）——它会精确点出所有孤儿 import / 未用符号 /
   断引用。**以 tsc 为准反复收敛**，比人工找孤儿可靠。
4. 再跑 `node scripts/verify-ci.mjs`（= verify:all）。
5. 自证 KEEP 零改动：`git diff --stat` 里**不得出现** `server/paper-import*/`、
   `server/paper-sets/*.mjs`（除 routes.mjs 删 1 路由）、`scripts/import-pipeline/`、
   `verbProfileBackfill`。
6. residue grep（见 §验收）应全空。

---

## §A 后端删除

### A1 整删 3 文件
- `server/imports/legacyImportRoutes.mjs`（161，12 条 `/api/import-*` 路由，全
  `ownerOnly`，全 UI-only）
- `server/imports/legacyImportImplementation.mjs`（2252，~78 fns，zero AI）
- `server/imports/importListing.mjs`（502）

### A2 `server/api.mjs` 手术
- 删 3 import：`createLegacyImportRoutes`（L25）、`createImportListingImplementation`
  （L41）、`createLegacyImportImplementation`（L50）。
- 删 importListing 工厂调用 + destructure（L74-94：`const importListing =
  createImportListingImplementation({...})` + 8 项解构 listImportFiles/
  listImportBundles/listImportBatches/scanImportDirectory/getImportBatch/
  updateImportBatchStats/rowToImportFile/rowToImportFileParse）。
- 删 serverContext 里 13 条 legacy 属性 shorthand（L95-490 内，按名 grep 定位）：
  `applyAnswerAlignment` `createImportFile` `deleteImportFile`
  `generateAnswerAlignmentDraft` `generateImportBundleDraft` `getImportFileParse`
  `listImportBatches` `listImportBundles` `listImportFiles`
  **`listPaperWorkflowStatuses`** `parseImportFile` `runImportBatch`
  `scanImportDirectory`。
- 删路由注册 `...createLegacyImportRoutes(),`（L487）。
- 删看板后端（D1）：`inferPaperTitleFromQuestionGroupTitle`（L2629）、
  `buildObjectiveBankStatus`（L2663）、`workflowStatusFor`（L2715）、
  `listPaperWorkflowStatuses`（L2779-2869）——**四者仅 listPaperWorkflowStatuses
  互相调用，无外部消费者**（已 grep 实证）。
- 删 legacyImportImplementation 注释块 + 工厂 + destructure（L3885-3922）+ **8 个
  hoisted forwarding wrapper**（L3923 注释起 → 至 `deleteImportFile` 函数结束，约
  L3951；下一个 `formatQuestionGroupForTopicLabel` 是 KEEP，别越界）。
- **KEEP（勿删，已 grep 实证有真库外消费者）**：`cleanDraftText`/`normalizeDraftText`/
  `normalizeAnswerValue`（→ readingDifficultyNormalizer/synonymDifficulty）、
  `timestampPrefix`（→ exports）、`groupTypeLabels`（→ print-renderer）、`openDatabase`、
  `rootDir`。
- **删（MF-3，唯一库外消费者是本刀整删的 `importListing.mjs`，删后零 survivor）**：
  `sanitizeFileName`（L2049）、`inferImportFileType`（L2040）、`normalizeExamTitle`（L2000）、
  `extractDeclaredExamTitleFromText`（L2011）——连同 L3889-3891 那条「…STAY in api.mjs
  (consumed by other modules)」**过时注释**一起删（该断言对这 4 个是假的：真消费者是
  legacy importListing）。**§KEEP 自检对这 4 个豁免。**
- **`importDir`（L57 def）删（SW-3）**：仅 L99 serverContext + L3895 legacy 工厂注入引用，
  两者本刀均删 → 连 L57 def + L99 serverContext 条目一起删。

### A3 `server/paper-sets/routes.mjs` 删 1 路由
- 删 `GET /^\/api\/paper-workflows$/`（L13-15，`context.listPaperWorkflowStatuses()`）。
  **文件保留**（其余 paper-set 路由是 member 组卷命脉）。

---

## §B 前端 `app/src/App.tsx` 删除

> 全部按符号名删。**KEEP 与 DELETE 的 state 交错**（parse 回填夹在中间），逐符号定位。

### B1 imports（L17-67 区）
删 legacy-import 相关 **9 type + 12 fn**：
- type：`ApplyAnswerAlignmentResult` `ImportAnswerAlignmentDraft` `ImportBatch`
  `ImportBundle` `ImportBundleDraft` `ImportDraftGroup` `ImportContentRole`
  `ImportFileParseResult` `ImportFileRecord`
- fn：`applyImportAnswerAlignment` `deleteImportFile as deleteImportFileRequest`
  `fetchImportBatches` `fetchImportBundles` `fetchImportFiles` `fetchImportFileParse`
  `generateImportAnswerAlignment` `generateImportBundleDraft` `runImportBatch`
  `scanImportDirectory` `uploadImportFile` `parseImportFile as parseImportFileRequest`
- 顺带清任何仅 import 模态/看板用的 lucide icon import（tsc 报 unused 即删）。

### B2 state（删）
- `isImportOpen`（L606）
- **看板**（L659-661）：`paperWorkflows` `paperWorkflowsStatus` `paperWorkflowsError`
- **import 模态**（L662-720 区，按名删）：`importBundles*` `importBatches*`
  `batchDirectoryPath` `batchTitle` `batchRecursive` `batchContentRole`
  `batchImportLimit` `batchScan*` `batchRun*ById` `importFiles*` `selectedImportFiles`
  `importContentRole` `importBundleId` `importBundleTitle` `importNote` `importStatus`
  `importError` `parseStatusByFileId` `parseErrorByFileId` `activeImportParse`
  `draft*ByBundleId` `activeImportDraft` `draftReviewConfirmed` `commit*ByDraftGroupId`
  `batchCommit*` `paperBuild*`（Status/Error/Result，仅看板+模态用，已实证）
  `answerAlignment*ByBundleId` `activeAnswerAlignment` `answerWriteback*ByGroupId`

### B3 helper / handler（删）
- 看板 helper（模块级 fn，仅看板用）：`sortedWorkflowBankGroups`（L299）、
  `workflowProgress`（L309）、`formatWorkflowExport`（L289）、`workflowSectionLabel`（L294）
  ——**SW-1 补：plan 初版只列了第 1 个，后 3 个漏**。
- 看板 handler：`addWorkflowGroupsToBasket`（L919）`handleBuildWorkflowPaperSet`（L926）
  `refreshPaperWorkflows`（L1320）`openWorkflowDraft`（L1493）
- 看板 mount effect：`fetchPaperWorkflows()` useEffect（L839-847）+ `fetchPaperWorkflows`
  import（L56）——随 `paperWorkflows` state 删。
- import handler（L1057-1493 区，按名）：`openImportPanel` `refreshImportBundles`
  `refreshImportFiles` `handleScanImportDirectory` `handleRunImportBatch`
  `handleImportSubmit` `prepareAnswerAnalysisImport` `handleParseImportFile`
  `handleShowImportParse` `handleDeleteImportFile` `handleGenerateImportDraft`
  `handleGenerateAnswerAlignment` `handleApplyAnswerAlignmentGroup`
  `handleCommitDraftGroup` `handleBatchCommitObjectiveDraftGroups`
  **`handleBuildObjectivePaperSet`（L1444，模态内 onClick@L2590，MF-2 savedPapers 孤儿链
  的一环——plan 初版漏，必删）**

### B4 computed 派生值 + savedPapers（删）
- L1521-1559：全部 `activeImportDraft` 派生（`objectiveDraftGroups`
  `importableObjectiveDraftGroups` `draftGroupsWithQuestions` `committedDraftGroupCount`
  `objectivePaperGroups` `objectivePaperTitle` `draftQuality`
  `canBatchCommitObjectiveDraft` `existingObjectivePaperSet` `singleIntakeSteps`）。
- L1560-1567：`workflowSummary`（看板）。
- **`savedPapers` 全删（MF-2，本刀全孤儿——plan 初版错标 KEEP）**：state
  `savedPapers`+`setSavedPapers`（L658）+ L822-837 `fetchPaperSets()` useEffect +
  `fetchPaperSets` import（L55）。5 个 reader（952/960 handleBuildWorkflowPaperSet、
  1463/1482 handleBuildObjectivePaperSet、1531 existingObjectivePaperSet）**全在删除宿主**；
  L828-831 注释自白「savedPapers 只为喂 handleBuildObjectivePaperSet 才留」——本刀该宿主
  也删 → savedPapers 零 reader。删 L828-831 陈旧注释。**member 组卷用 `paperDraft`，不用
  `savedPapers`**（savedPapers 的展示 UI 早在 classic-retire-3 已死）。

### B5 JSX 模态（整删）
- `{isImportOpen && ( … )}`：**L1983 → L2784**（~801 行）。整块删。

### B6 SEVER 须子（MF-1 修正：**3 条**在 KEEP 宿主，只删调用行、**禁删宿主函数**）
`refreshPaperWorkflows()` 有 3 处在 **KEEP 宿主**内（plan 初版只列 1 条，错）：
- **L731** `onDocxOrPdfExported: () => { refreshPaperWorkflows() }`（`paperExports` 配置，
  KEEP）→ 删调用，回调改空 `() => {}` 或按 tsc 删该属性（hook 本体不动）。
- **L1051** 在 **`handleDeleteQuestionGroup`（L1043，KEEP，member/owner 删题组，
  `onDelete`@L1954）** 内 → **只删这行 `await refreshPaperWorkflows()`，函数体保留**。
- **L1083** 在 **`handleEntrySaved`（L1068，KEEP，EntryModal 存题，`onSaved`@L1979，
  ADR-0016 §排除项保留的编辑入口）** 内 → **只删这行，函数体保留**。
- 其余 `refreshPaperWorkflows()` 调用（L963/1140/1181/1228/1346/1373/1435/1486）都在
  **要删的 import/看板 handler 内**，随宿主消失。删完 grep `refreshPaperWorkflows` 应为 0。
- ⚠️ **DEV 回归点**：删完必测 member 删题组 + EntryModal 存题不崩（见 §验收 QA）。

### B7 AdminWorkbench 挂载 props（删）
- L1862-1881 区传给 `<AdminWorkbench>` 的 **~18 props**（SW-1：实际 ~18 非 12）——
  **删看板后 AdminWorkbench 接口只留「主题标签四件套」**（`onBackfillTopicLabels`/
  `backfillStatus`/`backfillResult`/`backfillError`），其余导入/看板 props 全删：
  `onOpenImportPanel` `paperWorkflows` `paperWorkflowsStatus` `paperWorkflowsError`
  `paperWorkflowStatusHint` `workflowSummary` `sortedWorkflowBankGroups`
  `onRefreshPaperWorkflows` `onAddWorkflowGroupsToBasket` `paperBuildStatus`
  `paperBuildResult` `onBuildWorkflowPaperSet` `onOpenWorkflowDraft` `basket`
  `questionGroupById` 等——**逐 prop 按 tsc 清**（接口 §C 同步删）。
- `paperWorkflowStatusHint`（L258 const 定义）随之删（仅此处用）。
- ⚠️ **`questionGroupById`（L881 memo）是 KEEP（SW-2）**：除看板外还喂
  `paperDraftAddGroups`（L1593/1597，member 组卷命脉）→ **只删传给 AdminWorkbench 的
  prop（L1873），memo 本体保留**。tsc 不会误删（L1593 保命），列此防手滑。
- **`basket`（App.tsx state）是 member 命脉，留**；只删传给 AdminWorkbench 的 prop。

---

## §C `app/src/features/admin/AdminWorkbench.tsx`（346 行）

- **删「导入」section**（L67-81，`aria-label="导入"`）——Cut1/Cut2 已清掉「整卷导入」
  「AI 导题」两钮，现只剩「导入资料」按钮（`onOpenImportPanel`），整个 section 删。
- **数据维护 section（L82+）**：KEEP header + 「给题库打主题标签」按钮；**删
  `workflow-view`**（L120 起的整个 `<div className="workflow-view">…</div>` 多卷闭环
  看板）。
- **删 props 接口 + 解构**（L13-60 区）：`onOpenImportPanel` + 看板 12 props（同 B7 名单）
  + `basket`（若确认无其他用）。KEEP：`onBackfillTopicLabels`/`backfillStatus`/
  `backfillResult`/`backfillError`。
- 清 tsc 报的 unused import（lucide icon `RefreshCw`/`Plus`/`Tag`? — 逐个按 tsc）。

---

## §D `app/src/services/questionGroups.ts`（824 行）+ domain 类型

- **删 12 fn**（L121-349）：`fetchImportFiles`(121) `fetchImportBundles`(132)
  `fetchImportBatches`(143) `scanImportDirectory`(154) `runImportBatch`(171)
  `generateImportBundleDraft`(201) `generateImportAnswerAlignment`(205)
  `applyImportAnswerAlignment`(218) `fetchImportFileParse`(241) `uploadImportFile`(319)
  `parseImportFile`(336) `deleteImportFile`(349)。
- **删内部 Response 类型**（仅上述 fn 用）：`ImportFilesResponse`(67)
  `ImportBundlesResponse`(71) `ImportBatchesResponse`(75) `ImportBatchResponse`(79)
  `ImportBundleDraftResponse`(83) `ImportAnswerAlignmentResponse`(87)
  `ApplyAnswerAlignmentResponse`(91) `ImportFileParseResponse`(95)
  `CreateImportFileResponse`(315) + input 类型 `CreateImportBatchInput`
  `RunImportBatchInput` `CreateImportFileInput`（grep 定位，仅 import 用）。
- **⚠️ KEEP（命名撞车，勿删）**：`verifyQuestionGroup`(451) `parseGrammarGroup`(470)
  `parseClozeGroup`(482) `parseSevenChoicesGroup`(494) `saveClozeParseResultRequest`(506)
  `saveSevenChoicesParseResultRequest`(518) `saveGrammarParseResultRequest`(530)
  `saveReadingParseResult`(542) `parseReadingQuestionGroup`(568)——这些是**题组 parse
  回填**（detail 看题），不是 import 文件解析。
- **看板服务层（删）**：`fetchPaperWorkflows`(110) + 内部类型 `PaperWorkflowsResponse`(63)
  + 文件顶部 `PaperWorkflow` type import(17)。`App.tsx refreshPaperWorkflows` 是其唯一
  消费者（随 B3 删）。
- **domain 类型**（`app/src/domain/questionBank.ts`，已实证 9 个 import 类型 + 3 个看板
  类型全在此文件）：
  - 9 个 import type：`ImportBundle` `ImportBatch` `ImportContentRole` `ImportFileRecord`
    `ImportBundleDraft` `ImportDraftGroup` `ImportFileParseResult`
    `ImportAnswerAlignmentDraft` `ApplyAnswerAlignmentResult`（+ 其依赖的子类型，grep 定位）。
  - 3 个看板 type（L554-570）：`PaperWorkflowStatus` `PaperWorkflowExportFile`
    `PaperWorkflow`——已 grep 实证仅 App.tsx/AdminWorkbench/questionGroups 用，**无 KEEP
    泄漏**。
  - **删前对每个 type `grep -rn` 全库引用兜底**；tsc 报残引用为准。

---

## §E `app/src/App.css`

- 删 ~211 选择器：`.import-*` `.intake-*` `.batch-import-*`（import 模态，~147）+
  `.workflow-*`（`workflow-view`/`-overview`/`-card`/`-summary-grid`/`-stage-grid`/
  `-list`/`-progress`/`-question-panel` 等看板，~64）+ `.answer-alignment*`。
- **已实证 `.workflow-*` 板独占**（仅 AdminWorkbench JSX 用）。删前对每个类族 grep
  确认 JSX 侧无 KEEP 引用（`intake`/`import` 可能有个别撞词，逐个核）。
- 纯 CSS 删除 tsc 不报——删完 grep App.tsx/AdminWorkbench 确认无残留 className 引用
  已删规则（孤儿 className 无害但应清）。

---

## §F verify

- **纯删 3**：`scripts/verify-h1f-legacy-import-routes.mjs`(196)
  `scripts/verify-h5b-import-listing.mjs`(140) `scripts/verify-h5f-legacy-import-impl.mjs`(548)。
- **`scripts/verify-ci.mjs`**：删这 3 个的注册表索引行（grep `h1f`/`h5b`/`h5f`）。
- **`scripts/verify-owner-gate.mjs`**：删 12 条 `/api/import-*` owner-gate 端点条目
  （grep `import-files`/`import-bundles`/`import-batches`）。**⚠️ 若脚本有硬编码
  `openModeSample` 索引/计数**（Cut2 MF-1 已改成长度相对取样），核删端点后索引不塌；
  存疑则采 Cut2 同款长度相对法。
- **`scripts/README.md`**：删这 3 verify 的索引条目（若有）。
- **KEEP 防误删**：`verify-c7-paper-import-contracts` / `verify-c7-paper-import-publish`
  测的是引擎契约（名字带 paper-import 是巧合），**不碰**。

---

## §陷阱（TRAPS — 高危，CR 重点核）

1. **"parse" 一词两义**：删 `parseImportFile`/`fetchImportFileParse`/
   `parseStatusByFileId`/`parseErrorByFileId`/`activeImportParse`/`ImportFileParseResult`
   （import 文件解析）；**KEEP** `parseClozeGroup`/`parseReadingQuestionGroup`/
   `clozeParseResult`/`readingParseResult`/`saveXParseResult`/`ClozeParseQuestionGroupResult`
   （题组 parse 回填，member 看题）。**按完整符号名匹配，别 grep 裸 `parse` 批量删**。
2. **看板整退是 scope 扩张**（D1）：member 侧组卷/加草稿（`addToBasket`/
   `addGroupsToBasket`）+ 主卷数据（paper_sets/`selectPaperSetSummaries`）**零改动**。
   删的只是 owner-only 看板 UI + 其 read 端点。
3. **`paperBuild*` 双消费**：看板 props + import 模态内建按钮（L2587-2607）都用它，
   **两者都删**故可全删；别以为它是 KEEP 组卷 state（member 组卷用 `paperDraft`）。
4. **大小写变体**：grep 符号带大小写变体（`import`/`Import`）。
5. **serverContext shorthand**：api.mjs serverContext 里 legacy 属性是 property
   shorthand，漏删 → 引用已删符号 → 运行时崩（tsc 不测 .mjs，靠 §验收 smoke）。

---

## §KEEP 命门（git diff --stat 自证零改动）

`server/paper-import*/`（除 paper-sets/routes.mjs 删 1 路由）、`scripts/import-pipeline/`、
`verbProfileBackfill`、分析器、`selectPaperSetSummaries`、注入 helper **真 KEEP 5 个**
（cleanDraftText/normalizeDraftText/normalizeAnswerValue/timestampPrefix/groupTypeLabels
——**注意：sanitizeFileName/inferImportFileType/normalizeExamTitle/
extractDeclaredExamTitleFromText 本刀删，见 MF-3，不在 KEEP 内**）、parse 回填
state+service、member 消费（basket/paperDraft/paperExports/EntryModal + `questionGroupById`
memo，**savedPapers 本刀删见 MF-2**）、`handleDeleteQuestionGroup`/`handleEntrySaved`
函数体（MF-1）、AdminWorkbench 主题标签、`verify-c7-*`。

## §Forbidden（越界即 CR/PA 打回）

- 不碰 `server/paper-import*/`（除 paper-sets/routes.mjs 删 paper-workflows 单路由）。
- 不碰 `scripts/import-pipeline/`、分析器、发布器、storage、multipart。
- 不动 parse 回填（clozeParse/readingParse…）任何 state/service/JSX。
- 不动 member 消费流（组卷/加草稿/导出/详情看题/EntryModal 编辑）。
- **（MF-1）不删 `handleDeleteQuestionGroup`/`handleEntrySaved` 函数体**——只删其中的
  `refreshPaperWorkflows()` 调用行。
- **（SW-2）不删 `questionGroupById` memo（L881）**——只删传给 AdminWorkbench 的 prop。
- 不新建替代管理页 / 不预留脚手架（D5）。
- 不重组/挪 KEEP 引擎目录（ADR-0016 挂账清洁刀）。

## §验收 gates

1. `pnpm -C app build` 0 TS 错（tsc 收敛所有孤儿/断引用）。
2. `node scripts/verify-ci.mjs`（verify:all）全绿（本地 ~14 个 health 超时 = worktree
   无 server 预存问题，非回归；CI 环境跑）。
3. residue grep 全空：
   `grep -rn "legacyImport\|createLegacyImportRoutes\|listImportBundles\|scanImportDirectory\|paper-workflows\|listPaperWorkflowStatuses\|openWorkflowDraft\|workflow-view\|isImportOpen" server/api.mjs server/paper-sets/routes.mjs app/src/App.tsx app/src/features/admin/AdminWorkbench.tsx app/src/services/questionGroups.ts`
   （应 0；`server/imports/` 已整删）
4. `git diff --stat` KEEP 命门零改动（§KEEP）。
5. smoke：`node -e "import('./server/api.mjs')"` 或启动 server 不崩（serverContext 无
   断引用）。
6. Browser QA（forced-auth）：owner 管理台「导入」区**空**（Cut1/2/3 三钮全无）；
   「数据维护」只剩「给题库打主题标签」，**无多卷闭环看板**；**member/owner 删题组
   正常（MF-1 回归点 `handleDeleteQuestionGroup`）**；**EntryModal 编辑保存正常（MF-1
   回归点 `handleEntrySaved`）**；member 组卷/加草稿/看题/详情读已存解析**全正常**；
   `?view=` 深链不白屏。
