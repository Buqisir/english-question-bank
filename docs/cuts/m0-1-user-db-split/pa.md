# M0-1 两库分离手术 — PA 审阅（冷读，独立上下文）

审阅人：PA（小川，全新上下文）  日期：2026-07-03  cut tier：large（schema + 数据契约手术）

## Verdict

**APPROVE WITH MUST FIX**（方向正确，但连接改造契约与 verify 改造方向必须先在 plan.md 锁死，否则 DEV 会在最深的坑里自由发挥）。

决策 7（两库分离、走 ID + 应用层拼装、不 ATTACH）是 owner 已拍板方向，本刀实现路径总体成立：无跨库事务、跨侧读几乎已是应用层拼装、只有一处真 JOIN + 一处 view 内读用户表。ADR-0011 与 roadmap 决策 7 一致，无 SPEC 矛盾。但计划把**最大的工程量（store 连接层双工厂改造的扇出）**用一句"两侧混查点改双连接"带过，这是 large 刀里最容易返工、最容易做出"假可用"的地方，必须补契约。

## Product Principle

草稿卷工作台 / 个人空间是教师工作区，本刀是**纯基础设施手术**：教师可见行为只应新增一种——被馆文件替换下架的题组，其草稿条目变"失效条目"（可删、不可打印/导出），其余行为零变化。任何超出"失效态最小可用展示"的 UI 都是越界。这条 PaperSurface 主体不变的边界，计划守住了。

## Architecture Model（本刀的真实改造面，plan 必须显式承认）

现状（已抽验 file:line）：

- draftPaperStore 的方法分两类，**两类都会在同一个连接上同时碰用户表和共享表**：
  - 收路由 `db` 参数类：`getDraftPaper` / `getDraftPaperItems`（store.mjs:247）/ `getCurrentDraftPaperRow`。`getDraftPaperItems` 在同一 db 上查 `draft_paper_items`（用户表）后立刻 `selectQuestionGroupCards(db,...)`（store.mjs:260，共享表）与 `isGroupPrintReady(db,...)`（store.mjs:261，共享表）。
  - 自开连接类（`openDatabase(...)`）：`listDraftPapers`、`getOrCreateCurrentDraftPaper`、`addGroupToCurrentDraftPaper`、`updateDraftPaper`、`patchDraftPaperItem`、`deleteDraftPaperItem`、`restoreDraftPaperItem`、`migrateAssemblyBasketToDraftPaper`、`exportDraftPaperPdf` —— 约 9 个。其中 `addGroupToCurrentDraftPaper`→`addGroupToDraftPaper`（store.mjs:354-388）自开一个 db，先 `selectQuestionGroupCards`（共享表 355）+`isGroupPrintReady`（357）再 INSERT `draft_paper_items`（用户表 379）。
- `selectQuestionGroupCards(db,...)`（api.mjs:1385）在共享库连接内部调用 `getDraftSearchContext(db)`（api.mjs:1418），后者读 `draft_paper_items`（api.mjs:494，用户表）。**该函数有 12+ 处调用方**（api.mjs:1441/1511/2114/2210/2308/2728/3581/3886、semanticSearchService.mjs:372、store.mjs:260/355）。

拆库后必需的模型（plan 要写死）：

- 用户表连接（`openUserDatabase`）与共享表连接（`openDatabase`）分离；凡"同时碰两侧"的 store 方法，必须**同时持有两个连接**，用户表操作走 userDb、卡片/print-ready 走 bankDb。路由层负责为这些方法开/关两个连接（自开连接类则在 store 内部各自开两个）。
- `selectQuestionGroupCards` 内部**不能再自己摸用户表**（决策 5 已定方向）：改为接收 `draftContext` 参数（由调用方从 userDb 取，或默认空上下文）。**12+ 处调用方每一处都要决定 draftContext 从哪来**——这是本刀真正的扇出，不是"一处混查"。

## Must Fix Before DEV

### MF-1　store 连接双工厂改造契约未锁死（最大返工/假可用风险）
计划决策 3 只写"两侧混查点改双连接"，但真实扇出是 store 里约 12 个方法。DEV 若逐个即兴处理，极易出现：连接开关不对称（泄漏/漏 close）、readOnly 语义错配（用户表写却开只读）、或漏改某个自开方法导致该方法在拆库后对已删表报错。
**风险**：功能"看起来能跑"但某条路径（如 export/restore/migrate）在共享库无对应表时崩，或连接泄漏在长跑服务上累积。
**处置（plan.md 应记录）**：新增一节"store 连接改造清单"，逐一列出 store.mjs 中**所有** `openDatabase` 自开点与收 db 参数的方法，标注每个方法「碰用户表 / 碰共享表 / 两者」，并锁定「双连接的方法由谁开谁关、readOnly 归属」的统一规则（如：用户表写→userDb readOnly:false；卡片查询→bankDb readOnly:true）。作为 Must Do 步骤，不许 DEV 自选取舍。

### MF-2　`selectQuestionGroupCards` 的 12+ 调用方 draftContext 传参未定义
决策 5 说"调用方先取草稿上下文再传参"，但没说清 `selectQuestionGroupCards` 新签名，也没交代那 12+ 处调用方每处 draftContext 从哪来（多数调用方手里只有 bankDb，没有 userDb）。
**风险**：DEV 可能给每个调用方都塞一次 userDb 开连接（性能与连接数暴涨），或给大部分调用方传 null 导致"in_current_draft"按钮态在找题页静默失效（`buildDraftButtonState` api.mjs:502 依赖 draftContext.groupIds）——这是教师可见的回归，且静态 verify 抓不到。
**处置（plan.md 应记录）**：锁定 `selectQuestionGroupCards(db, whereClause, params, draftContext = EMPTY_DRAFT_CONTEXT)` 的新签名与"空上下文=不标 in_current_draft"的默认语义；明确**只有找题/卡片列表主路径**（api.mjs:1441 附近的搜索入口）需要真实 draftContext（从 userDb 取一次），其余调用方一律传默认空上下文。将"找题页按钮态"列为 Browser QA 必测项。

### MF-3　改动清单坐标错误：`server/router/draftPaperRoutes.mjs` 不存在
plan 改动清单写 `server/router/draftPaperRoutes.mjs`（或现役路由文件）。仓库现实：草稿卷路由在 `server/draft-paper/draftPaperRoutes.mjs`；`server/router/` 下只有 `index.mjs`。（此坑正是记忆里"侦察坐标变幻觉"的复发点。）
**处置（plan.md 应记录）**：改动清单把路径订正为 `server/draft-paper/draftPaperRoutes.mjs`，并显式列入 `server/my-space/mySpaceRoutes.mjs`（当前用 `context.openDatabase()`，17 处开关点需切 `context.openUserDatabase()`）。

### MF-4　verify-c8 两脚本的改造方向不能只说"指向新位置"，会假绿
两个 verify 脚本大量断言直接 `read('data/sql/schema.sql')` 找这四张表（draft: 31-37 行断言；my-space:49-55）。决策 2 删表后：
- draft/my_space 的 `table exists` 断言直接 FAIL；
- 更隐蔽：my-space verify:52 用 `schema.match(/CREATE TABLE ... my_space_artifacts[\s\S]*?\);/)` 提取表体做 BLOB 检查，表搬走后 match 返回 null→检查作用于空串→**恒 PASS（假绿）**。
**风险**：DEV 若只做"schema.sql 断言 → api.mjs/mySpace.mjs ensure 字符串"的机械替换，容易保留会假绿的正则，让"用户库 schema 单一来源"这个核心契约失去守护。
**处置（plan.md 应记录）**：明确断言重定向目标（schema.sql → `server/api.mjs` 的 `ensureUserDatabaseShape` 字符串 / `server/my-space/mySpace.mjs` 的 `ensureMySpaceDatabaseShape` 字符串）；**新增一条反向断言**：`data/sql/schema.sql` 中**不再包含**这四张表（防止漂移复活）；BLOB 等表体正则改为对 ensure 源字符串取子串，避免匹配空串假绿。

### MF-5　孤儿容忍的产品行为在"列表/详情"外还有两条路径未定义
决策 4 定义了列表/详情/打印导出的失效态，但抽验发现两条路径未覆盖：
1. `deleteDraftPaperItem`（store.mjs:479）现用 JOIN `question_groups` 做存在性确认——决策 5 改单表查后语义 OK（失效条目仍可删，符合决策 4）。但 `getDraftSearchContext`/`addGroupToDraftPaper` 的写侧守卫（store.mjs:355-358）依赖 `selectQuestionGroupCards` 返回卡片：题组不存在时 `addGroupToDraftPaper` 抛错，这是**加组**路径，与孤儿容忍无关，正确——需在 plan 里点明"写侧守卫保留=不允许加不存在的组，读侧才容忍"，避免 DEV 误把写侧也改成容忍。
2. `exportDraftPaperPdf`（store.mjs:575）与 `buildDraftPrintHtml`（store.mjs:132）经 `getQuestionGroupDetail(item.groupId)`（store.mjs:139/211，无 db 参数、自查共享库）取详情——失效条目在这里 detail 会是 null/抛错。决策 4 说"打印/导出跳过失效条目"，但**跳过逻辑落在哪一层**（是 getDraftPaperItems 标记 groupMissing 后由 buildDraftPaperBlocks 过滤，还是 export 内 try/catch）没定。
**处置（plan.md 应记录）**：明确"写侧守卫保留、读侧容忍"的边界；锁定失效条目的过滤点=在 `getDraftPaperItems` 产出的 item 上带 `groupMissing`，由 export/print 输入构建（`buildDraftPaperExportInput`/`buildDraftPaperBlocks`）统一过滤，禁止在 `getQuestionGroupDetail` 里吞异常。将"引用题组被删后打印跳过且不崩"列为 Browser QA + smoke 必测。

## Must Fix -> Plan Disposition Checklist

- [ ] MF-1 → plan 新增"store 连接改造清单"节（逐方法标两侧归属 + 开关/readOnly 统一规则），列为 Must Do。
- [ ] MF-2 → plan 锁定 `selectQuestionGroupCards` 新签名 + 默认空上下文语义 + 仅主搜索路径取真实 draftContext；Browser QA 加"找题页 in_current_draft 按钮态"。
- [ ] MF-3 → plan 改动清单订正 `server/draft-paper/draftPaperRoutes.mjs`，补 `server/my-space/mySpaceRoutes.mjs` 的 openDatabase→openUserDatabase 切换。
- [ ] MF-4 → plan verify 节写明断言重定向目标 + 新增"schema.sql 不含四表"反向断言 + 修 BLOB 正则空串假绿。
- [ ] MF-5 → plan 明确"写侧守卫保留/读侧容忍"边界 + 失效条目统一过滤点；验收补孤儿打印 smoke。

## Should Watch（不阻塞 DEV）

- **SW-1 迁移脚本备份只备共享库、不备用户库**：决策 6 幂等（目标非空则拒绝）合理；但第 4 步 DROP 共享库四表前，除了 `.bak.<timestamp>` 文件复制，建议脚本在 DROP 前二次核对"用户库行数 == 共享库行数"再 DROP，避免复制成功但迁移中断后仍 DROP。非阻塞，DEV 可在实现时加断言。
- **SW-2 `foreign_keys = ON` pragma**：`openDatabase`/`ensureDatabaseShape` 都开了外键；用户库连接也应开 pragma，但四张表间仍有内部 FK（draft_paper_items→draft_papers ON DELETE CASCADE、my_space_artifacts→my_space_folders SET NULL），这些留在用户库内有效，方向正确。仅需 DEV 确保 `openUserDatabase` 同样 `PRAGMA foreign_keys = ON`。
- **SW-3 M0-2/M0-4 前向兼容**：users 表进用户库、user_id 圈范围——本刀把四表放进无版本表的 ensure-only 用户库，未来加 user_id 列走"ensure 里 ALTER 补列"套路（与现有 `ensureDatabaseShape` 的 ALTER 模式一致），不被本刀设计卡死。确认无阻。
- **SW-4 无版本表**：用户库沿用"ensure 幂等重建 + ALTER 补列"而非 migration 框架，与全仓现状一致（Forbidden 已禁 migration 框架），可接受；但用户库将承载 auth 数据，长期缺 schema 版本表是技术债，记在 watch-ledger 供 M0-2 复评，不在本刀处理。

## Nice to Have

- 迁移脚本可打印"迁移前后各表行数对照表"，便于 owner 本机跑一次时肉眼核对（验收步骤 2 已要求行数一致，脚本自打印能省一次手工查库）。
- `ensureDatabaseShape` 检测到共享库仍有用户表时的警告文案，建议直接给出迁移脚本命令行，降低 owner 操作成本。

## Plan 与仓库现实的矛盾（单列）

1. **坐标错**：`server/router/draftPaperRoutes.mjs` 不存在，实为 `server/draft-paper/draftPaperRoutes.mjs`（见 MF-3）。
2. **扇出低估**：决策 3「两侧混查点」实为 store ~12 方法 + 决策 5 的 `selectQuestionGroupCards` 12+ 调用方（见 MF-1/MF-2）。plan 措辞"混查点"暗示是个别点，与代码现实不符，需订正描述以免 DEV 低估工作量。
3. **verify 假绿风险**：plan"正则断言指向新位置"未覆盖删表后正则匹配空串恒真的假绿（见 MF-4）。

## DEV Readiness

- 教师动作/前后行为/当前刀边界/未来刀边界：清楚。
- 允许/禁止文件：Forbidden 节完整且正确（已抽验 import-pipeline、PaperSurface、QUESTION_BANK_DB 语义均未被本刀波及）。
- Allowed 文件：需按 MF-3 订正路径、按 MF-1/MF-2 补充改造清单后才完整。
- verify/QA：需按 MF-4/MF-5 补充后才能证明用户可见风险。
- **结论：补齐 5 条 Must Fix（尤其 MF-1/MF-2 的连接与签名契约）后 DEV-ready。未补前不建议 DEV 开工——最深的连接改造无契约会直接返工。**

## Open PO Decisions（≤3）

无需 owner 拍板的新产品决策。决策 7 已定方向；MF-4/MF-5 的失效态语义 owner 已在决策 4 拍板（可删、不可打印、最小展示），本刀只需把它落到未覆盖的路径，属实现契约而非产品悬案。**0 个 PO 未决问题。**
