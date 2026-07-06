# PA Review — legacy-import-retire (ADR-0016 第 3 刀 / 末刀)

> 独立冷读审查（fresh un-anchored context）。审 `plan.md`（DEV 前）。
> 逐条 grep/sed 实证，不信 plan 断言。行号 @9a0ab14（worktree 现态）。

## Verdict

**APPROVE WITH MUST FIX**

方向对、切分对、scope 扩张（看板整退 D1）判断稳。后端 serverContext 手术、
forwarding-wrapper 边界、verify-owner-gate 长度相对取样、parse 命名撞车 split、
domain 类型无 KEEP 泄漏——全部核过，准确。

但 plan 的 **App.tsx 前端 SEVER/删除清单不完整且有一处 KEEP 断言错误**，
其中 MF-1（SEVER 须子漏两条 KEEP 宿主）是真风险（误伤 member 流），MF-2
（`savedPapers` 被错标 KEEP）、MF-3（4 个后端 helper 被错标"有库外消费者"）
是命门证据错误，不改会让 DEV 按错误 plan 留死代码 / §KEEP 自检误报。其余为
tsc 可兜底的枚举缺漏（MF-4，降级 SW 亦可，但建议补全省 DEV 迭代）。

无 REQUEST CHANGES 级问题（无 build 崩 / 无运行时崩的漏删）。0 未决 PO 决策。

## Product Principle

owner 已拍板：网站零导题 UI，生产全在后台 Agent（ADR-0016 + ADR-0015）。本刀
删 legacy 人工导题后台 + 顺带整退「多卷闭环状态」看板（owner 2026-07-06 明确
「这一块资料有关的全退掉」）。teacher/member 侧零可见变化——被删的全在
`isOwnerView` 门内，member 从不渲染。owner 组卷能力不丢，退回 member 同款
消费流（正是 owner 要的形态）。方向与产品阶段一致，无 rescope 必要。

## Exact Architecture Model

- **DELETE**：`server/imports/*`（3 文件）+ api.mjs 两工厂/13 shorthand/8 wrapper/
  看板后端 4 fn + paper-sets/routes.mjs 单路由 + App.tsx（导入模态 JSX + 看板 +
  ~40 state + import/看板 handler + 派生值）+ AdminWorkbench 导入 section + 看板 +
  questionGroups.ts 12 import fn + 看板 fetch + domain 类型 + App.css 选择器 +
  3 verify + owner-gate 12 端点。
- **KEEP（命门）**：`server/paper-import*/` 引擎、import-pipeline、verbProfileBackfill、
  `selectPaperSetSummaries`、parse 回填 state+service、member 消费
  （basket/paperDraft/paperExports/EntryModal）、AdminWorkbench 主题标签、`verify-c7-*`。
- **数据契约**：本刀不引入新契约，纯删。被删的 `/api/paper-workflows`、
  `/api/import-*` 是 owner-only read/write，无 member 依赖。核实无误。

## Must Fix Before DEV

### MF-1 — SEVER 须子漏两条 KEEP 宿主（member 流误伤风险）【真风险】

plan §B6 断言：「KEEP 代码里唯一须子 = App.tsx:731 `onDocxOrPdfExported` 内的
`refreshPaperWorkflows()`；其余调用都在要删的 handler 内。」**此断言错。**

实证（`grep -n refreshPaperWorkflows` + 逐调用点映射 enclosing function）：
- `App.tsx:1051` 在 **`handleDeleteQuestionGroup`（L1043）** 内——这是 **KEEP**
  宿主（member/owner 删题组，`onDelete={handleDeleteQuestionGroup}` @L1954）。
- `App.tsx:1083` 在 **`handleEntrySaved`（L1068）** 内——这是 **KEEP** 宿主
  （EntryModal `onSaved={handleEntrySaved}` @L1979；EntryModal 是 ADR-0016 §排除项
  明确保留的编辑入口）。
- `App.tsx:1871` `onRefreshPaperWorkflows` prop——随 B7 AdminWorkbench props 删（OK）。

**风险**：若 DEV 按 plan「其余随宿主消失」理解，会误以为 L1051/L1083 所在宿主
是删除对象，或漏删这两个调用。前者 = 删掉 member 删题/存题流（严重）；后者 =
残留对已删 `refreshPaperWorkflows` 的调用 = tsc 崩（能兜底但违背 plan「grep 应为 0」
自检承诺，且遮盖了真正需要人工判断的两个点）。

**要求 disposition**：plan §B6 改为列 **3 条 KEEP 宿主须子**——L731（paperExports
config）、L1051（`handleDeleteQuestionGroup`）、L1083（`handleEntrySaved`）——三处
**只删 `refreshPaperWorkflows()` 那一行调用，宿主函数保留**。明确标注这两个
handler 是 member/编辑 KEEP，禁删函数体。

### MF-2 — `savedPapers` 被错标 KEEP，实为本刀全孤儿【命门证据错误】

plan §B4 断言：「`savedPapers`（L1531 被读）是 KEEP，只删对它的 import-模态引用。」
**此断言错。** 实证 `savedPapers` 全部 reader：
- L952/L960 在 `handleBuildWorkflowPaperSet`（B3 DELETE）
- L1463/L1482 在 `handleBuildObjectivePaperSet`（本刀 DELETE，见 MF-4）
- L1531 在 `existingObjectivePaperSet` 派生（B4 DELETE）

**删完全部 import/看板宿主后，`savedPapers` 零 reader**——连带 L822-837 的
`fetchPaperSets()` useEffect + `setSavedPapers` 全部成孤儿（L828-831 注释
「savedPapers 仍喂 handleBuildObjectivePaperSet」的前提本刀消失）。

**风险**：DEV 按 plan 保留 `savedPapers` state + fetch effect = 留死状态 + 死网络
请求（tsc 会报 `savedPapers`/`setSavedPapers` unused，逼 DEV 回头，但 plan 明确
指示"KEEP"会让 DEV 困惑或写 `void savedPapers` 掩盖）。非崩，但命门证据错。

**要求 disposition**：plan §B4 改为——`savedPapers` + `setSavedPapers` + L822-837
`fetchPaperSets` useEffect 本刀 **全删**（其唯一 KEEP 借口 handleBuildObjectivePaperSet
本刀也删）。同步删 L828-831 陈旧注释。`fetchPaperSets` service import 若无他用一并清
（grep 确认）。

### MF-3 — 4 个后端 helper 被错标"有库外消费者"，实为本刀全孤儿【命门证据错误】

decisions §D4 + plan §A2 KEEP 列断言 9 个注入 helper「均有库外消费者」故保留。
**其中 4 个错。** 实证（grep 全库 code 引用）：
- `sanitizeFileName`、`inferImportFileType`、`normalizeExamTitle`、
  `extractDeclaredExamTitleFromText` 的**唯一库外消费者是 `server/imports/importListing.mjs`**
  （本刀 A1 整删）。删后仅剩 api.mjs 内 def + L80-83 importListing 工厂注入
  （本刀删）+ L3902-3907 legacy 工厂注入（本刀删）——**零 survivor**。
- 反证：`cleanDraftText`/`normalizeAnswerValue`/`normalizeDraftText`（经 cleanDraftText 传递）
  /`timestampPrefix`/`groupTypeLabels` 有真库外消费者
  （readingDifficultyNormalizer/synonymDifficulty/exports/print-renderer/…）——**真 KEEP**。

**风险**：`.mjs` tsc 不测 → 这 4 个死函数静默留存；更要害 = plan §KEEP 自检
「git diff --stat KEEP 命门零改动」会把「DEV 删掉这 4 个死 helper」误判为命门违规，
反向逼 DEV 留死代码。plan 的证据（"均有库外消费者"）对这 4 个是假的。

**要求 disposition**：plan §A2 把这 4 个从"KEEP 勿删"移出，明确 **本刀应删**
（它们唯一消费者 importListing.mjs 本刀删）；或若为降险选择保留，须**改证据措辞**
为「本刀后无消费者的死代码，暂留待后续清洁刀」并从 §KEEP 自检豁免。注意
L80-83 的 4 条注入行**无论如何必删**（在被删的 importListing 工厂调用内）。
建议：直接删这 4 个函数（纯删刀语义一致），残留仅 `path`/`randomUUID` 等标准依赖。

## Must Fix -> Plan Disposition Checklist

- **MF-1** → `plan.md §B6` 改列 3 条 KEEP 宿主须子（L731 / L1051 handleDeleteQuestionGroup /
  L1083 handleEntrySaved），标注「只删调用行、禁删宿主函数」+ 加 §Forbidden 一条
  「不删 handleDeleteQuestionGroup / handleEntrySaved 函数体」。
- **MF-2** → `plan.md §B4` 改「`savedPapers` KEEP」为「`savedPapers`+`setSavedPapers`+
  L822-837 fetchPaperSets effect 全删」；§KEEP 命门列移除 savedPapers。
- **MF-3** → `plan.md §A2` + `decisions.md §D4`：`sanitizeFileName`/`inferImportFileType`/
  `normalizeExamTitle`/`extractDeclaredExamTitleFromText` 从「KEEP·有库外消费者」改为
  「本刀删（唯一消费者 importListing.mjs 本刀删）」；§KEEP 自检对这 4 个豁免。

## Should Watch

### SW-1（可提级 MF-4）— 前端删除枚举漏几个看板 helper/handler

plan §B3/§B7 未列到但需删的前端符号（全 tsc 可兜底，故列 SW；但补全省 DEV 迭代）：
- `handleBuildObjectivePaperSet`（L1444，import-modal-only，onClick@L2590 在删除的模态内）
  ——plan B3 handler 删除清单**漏了它**。它是 MF-2 `savedPapers` 孤儿链的一环。
- `workflowProgress`（L309）、`formatWorkflowExport`（L289）、`workflowSectionLabel`（L294）
  ——看板专用 helper，plan §B3 只列了 `sortedWorkflowBankGroups`，漏这 3 个。
- L839-847 `fetchPaperWorkflows()` useEffect（board mount 拉数据）——plan 未列，
  随 `paperWorkflows` state 删。
- `<AdminWorkbench>` 实际传 ~18 props（L1862-1881），plan §B7 说「12 props」偏少；
  DEV 应以「删看板后 AdminWorkbench 接口只留 topic-label 四件套」为准，逐 prop 按 tsc 清。

**为何不阻断**：全在 App.tsx/AdminWorkbench（.tsx），`pnpm -C app build` 会精确点名
未用符号/断引用，plan §执行纪律 3 已把 tsc 收敛列为主手段。漏列只增迭代轮次，不漏网。
**但**：若 owner 想让 plan 成为可离线执行的完整契约（不靠 DEV 反复跑 tsc），把上述
补进 §B3/§B7 更稳，此时提为 MF-4。PM 定夺。

### SW-2 — `questionGroupById` 是 KEEP，勿随看板删

`questionGroupById`（L881 memo）除看板外还喂 `paperDraftAddGroups`（L1593/1597，KEEP
member 组卷）。B7 只删传给 AdminWorkbench 的 prop（L1873），**保留 memo 本身**。
plan 未点名，tsc 也不会误删（L1593 保命），列此防 DEV 手滑。

### SW-3 — `importDir` borderline 判断合理，倾向删

`importDir`（L57 def）实证仅 L99 serverContext + L3895 legacy 注入引用，均本刀删。
plan A2「存疑则留」保守可接受；但既然两引用都删，**建议连 L99 serverContext 条目
一起删**（纯删刀语义一致）。非阻断，DEV 判断即可。

## Allowed Files

- `server/imports/legacyImportRoutes.mjs`、`legacyImportImplementation.mjs`、
  `importListing.mjs`（整删）
- `server/api.mjs`（两工厂+13 shorthand+8 wrapper+看板 4 fn+可选 importDir）
- `server/paper-sets/routes.mjs`（仅删 paper-workflows 单路由）
- `app/src/App.tsx`（导入模态+看板+state+handler+派生，含 MF-1/2/SW-1 修正范围）
- `app/src/features/admin/AdminWorkbench.tsx`
- `app/src/services/questionGroups.ts`、`app/src/domain/questionBank.ts`
- `app/src/App.css`
- `scripts/verify-h1f-legacy-import-routes.mjs`、`verify-h5b-import-listing.mjs`、
  `verify-h5f-legacy-import-impl.mjs`（整删）
- `scripts/verify-ci.mjs`、`verify-owner-gate.mjs`、`scripts/README.md`（索引/端点删）

## Forbidden Files

- `server/paper-import*/`（`publisher`/`validator`/`storage`/`multipart`）——不碰
- `scripts/import-pipeline/`、分析器、`verbProfileBackfill`——不碰
- `selectPaperSetSummaries`（api.mjs:2541，2 消费者 @2579/2875）——不碰
- parse 回填（`parseClozeGroup`/`parseReadingQuestionGroup`/`saveXParseResult`/
  `clozeParseResult`…）——不碰（命名撞车，按符号名区分）
- member 消费流：basket/`addToBasket`/`addGroupsToBasket`/paperDraft/paperExports/
  `paperDraftAddGroups`/EntryModal——不碰
- **新增（MF-1）**：`handleDeleteQuestionGroup`、`handleEntrySaved` 函数体——不删
- `verify-c7-paper-import-*`——不碰

## Static Verify Requirements

1. `pnpm -C app build` 0 TS 错（tsc 收敛前端孤儿——本刀主兜底）。
2. `node scripts/verify-ci.mjs` 全绿（本地 health 超时非回归）。
3. residue grep 全空（plan §验收 3 的一行 grep）。
4. **serverContext smoke**（关键，.mjs 无 tsc）：`node -e "import('./server/api.mjs')"`
   不崩——证 13 shorthand 无断引用。plan §验收 5 已含，保留为硬闸。
5. `git diff --stat` KEEP 命门零改动——**但按 MF-3 从命门列移除那 4 个 helper +
   按 MF-2 移除 savedPapers**，否则自检误报。
6. owner-gate：删 12 端点后 `openModeSample` 长度相对（已实证 Cut2 MF-1 在位，
   `GATED_ROUTES[0]/[len/2]/[len-1]`），无索引塌陷。

## Browser QA Matrix

forced-auth（owner 视角）：
1. owner 管理台「导入」区**空**（Cut1/2/3 三钮全无）。
2. 「数据维护」只剩「给题库打主题标签」，**无多卷闭环看板**。
3. **member/owner 删题组**（`handleDeleteQuestionGroup`）正常——MF-1 回归点。
4. **EntryModal 编辑保存**（`handleEntrySaved`）正常——MF-1 回归点。
5. member 组卷/加草稿/看题/详情读已存解析全正常。
6. `?view=` 深链不白屏。

## DEV Readiness

- 精确 teacher 动作：无 member 可见变化；owner 失去导入/看板快捷入口，退回 member
  同款消费流——符合 owner 意图。✅
- before/after：owner 管理台三导入钮→空、看板→无；member 零变。✅
- 当前刀边界 / 未来刀边界（D5 不建管理页）：清晰。✅
- allowed/forbidden：已列（含 MF-1 新增禁删）。✅
- verify/QA：已列，含 serverContext smoke + MF-1 两个回归点。✅
- PO 决策：**0 未决**。✅

**结论**：修完 MF-1/MF-2/MF-3（三处均为 plan 文本修正，非新增 scope）即 DEV-ready。
SW-1 建议同步补全但可交给 tsc 兜底。

## Open PO Decisions

无（0）。owner 4 问已在 decisions.md 拍板；D5「未来管理页」明确本刀不建不预留。
