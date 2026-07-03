# M0-4 用户数据隔离 — pa.md（PA 独立评审）

Reviewer: PA（小川角色，独立上下文）
Date: 2026-07-03
Plan under review: `docs/cuts/m0-4-user-scope/plan.md`（提交 bee5c1c）
配套 ADR: `docs/adr/0014-user-data-isolation.md`

## Verdict

**APPROVE WITH MUST FIX**

方向正确、切法合理、哨兵设计论证成立、迁移锚点口径对齐 ADR-0012 §5。
侦察结论我逐条独立复核过 file:line，绝大多数为真。但**圈范围清单在
AI 搜索链路上有一处真漏**（会重演 plan 自己引用的 M0-1 按钮态串号
bug），且**表重建的事务/PRAGMA 时序**在 node:sqlite 下有一个静默失效
陷阱 plan 没锁死。这两条不修，DEV 有实质返工与越权泄漏风险。修完即
可开工。无 REJECT 级方向问题，未决 PO 决策 ≤ 3。

## Product Principle

强制模式下，草稿卷与个人空间是**每个用户的私有工作台**——包括
owner，owner 的数据特权只在共享馆写权限（M0-3 的闸），不在私有数据。
开放模式（users 空）行为与登录刀之前逐字节一致，全部数据归属隐含
单用户 `'local'`。产品形态数恒为 2，不造第三形态。这条我认同，
ADR-0014 决策 1/4 论证充分。

## Exact Architecture Model

- 三张顶层表加 `user_id TEXT NOT NULL DEFAULT 'local'`；子表
  `draft_paper_items` 不加列，经父表 `(id, user_id)` 命中圈定。
- 翻译点唯一 `resolveDataUserId(context)`（放 `server/auth/auth.mjs`）：
  `authMode === 'enforced'` → `session.userId`（缺 session 抛错）；
  否则 `'local'`。只路由 handler / api.mjs 顶层调用；store 与深层
  服务收显式必填 `userId`。
  - H1 闸无冲突：`resolveDataUserId` 被 `draftPaperRoutes.mjs` /
    `mySpaceRoutes.mjs` / `ai-proxy/routes.mjs` import 使用——这些目录
    不是 `server/router/`，H1 只约束 `server/router/index.mjs`。已核。
- current-draft 唯一索引改
  `ON draft_papers(user_id, current_marker) WHERE current_marker = 1`。
- `my_space_folders` 重建表，`UNIQUE(user_id, name)`。
- 迁移 = `ensureUserDatabaseShape` 内 `version < 3` 条件分支 + 列存在性
  双守卫，`PRAGMA user_version = 3` 收尾。

## Must Fix Before DEV

### MF-1 — AI 搜索链路（semantic-search / steward）的 userId 未穿透，
### 改动清单漏 `server/ai-proxy/routes.mjs` 与 `questionBankStewardSearch`

侦察点位表把 `getDraftSearchContext` 的调用点列为「`listQuestionGroups`
+ semanticSearch 工厂注入处」两个，但**穿透链不止一层**，且漏了一个
member 可达的入口。实际复核：

- `getDraftSearchContext()` 在 `semanticSearchService.mjs:374` 被调用，
  该函数是模块注入的零参绑定。
- 它的宿主 `semanticSearchQuestionGroups(query, apiKey, requestId,
  thinkingMode)` 有**两个**调用者：
  1. `server/ai-proxy/routes.mjs:24`（`POST /api/ai/semantic-search`）；
  2. `server/search/questionBankStewardService.mjs:430`（嵌套调用，
     宿主 `questionBankStewardSearch`，经 `ai-proxy/routes.mjs:30`
     `POST /api/ai/question-bank-steward` 进入）。
- 这两条 `/api/ai/*` 路由**不是 ownerOnly**，是 AI 模式 member 可达
  面。它们返回的卡片带 `in_current_draft` 按钮态（`buildDraftButtonState`
  → `getDraftSearchContext().groupIds`）。

后果：若只按 plan 现清单改到 `listQuestionGroups` 与 semanticSearch
工厂注入点，`getDraftSearchContext()` 仍以 `'local'`（或某默认）取
current draft——两个 member 在 AI 搜索/管家结果里会看到**彼此的**
当前草稿按钮态串号。这正是 plan 决策 7 自己引用的「M0-1 教训，静态
verify 抓不到」的同一 bug，只是发生在 AI 链路而非找题页。plan 决策 7
只点了「找题页 in_current_draft」进 Browser QA，漏了 AI 搜索面。

**要求 plan.md 处置**：
1. 改动清单**新增 `server/ai-proxy/routes.mjs`**：两条搜索路由
   handler 取 `resolveDataUserId(context)` 传入。
2. 决策 7 明确：`semanticSearchQuestionGroups` **与**
   `questionBankStewardSearch` **两个**服务入口签名都加必填 `userId`，
   steward 把 userId 转发给它内部的 `semanticSearchQuestionGroups`
   调用；`getDraftSearchContext(userId)` 沿两条注入链一路显式传参。
   （改动清单 `semanticSearchService.mjs` 一行须扩为「+
   questionBankStewardService.mjs 转发 userId」。）
3. Browser QA 矩阵新增一格：两 member 各自的 **AI 语义搜索 + AI 管家
   结果卡片** `in_current_draft` 按钮态互不串（现验收 5 只覆盖找题页）。

### MF-2 — `my_space_folders` 重建表的事务/PRAGMA 时序未锁死，
### node:sqlite 下 `PRAGMA foreign_keys` 有静默失效陷阱

决策 5 列了 12 步最小版，但**没规定重建是否包在事务里，也没标注
SQLite 的硬约束**：`PRAGMA foreign_keys = OFF/ON` 在一个**活动事务
内部是静默 no-op**（不报错、不生效）。正确顺序必须是
`PRAGMA foreign_keys=OFF`（事务外）→ `BEGIN` → 建新表 / INSERT SELECT
/ DROP 旧表 / RENAME → `COMMIT` → `PRAGMA foreign_keys=ON` →
`PRAGMA foreign_key_check`。

现状复核：`ensureUserDatabaseShape` 目前整段是**单个无 BEGIN 包裹的
`db.exec`**（`api.mjs:660-708`），各语句各自 autocommit。这对本刀是
双刃：
- 好的一面：PRAGMA 开关此刻确实在事务外，能生效。
- 危险面：若 DEV 为「原子性」把迁移分支包进 `BEGIN`（本仓多处 store
  方法就是这么写的，DEV 极可能照抄），PRAGMA 开关会静默失效，且
  `DROP 旧表 → RENAME` 之间若崩溃、又没有事务包裹 rebuild 本身，会
  留下半迁移态（旧表已 DROP、新表未 RENAME、user_version 仍 <3），
  下次启动 ensure 重入——此时 my_space_folders 缺表，`CREATE TABLE
  IF NOT EXISTS` 会以**新形**补建（无数据），旧数据丢失。

**要求 plan.md 处置**：决策 5 补一条硬约束（锁死，DEV 不得偏离）：
1. `PRAGMA foreign_keys=OFF` 与 `=ON` 必须在事务**外**执行；
2. 表重建的 12 步主体（建新表→INSERT SELECT→DROP→RENAME）必须包在
   **一个** `BEGIN…COMMIT` 里，保证半迁移态不可能落盘；
3. 迁移分支整体只在唯一写连接（`api.mjs:4285`）跑一次；重入必须幂等
   ——验收 3 已有「再触发一次 ensure 幂等无错」，但须额外断言
   **崩溃重入路径**：手工构造「已 ADD COLUMN、user_version 仍 2」的
   半迁移库触发 ensure，断言收敛到 v3 且 folders 数据不丢。

### MF-3 — `saveMySpaceArtifact` 的 folderId 归属校验须显式进圈范围规则

复核 `mySpace.mjs:176`：`saveMySpaceArtifact` 保存 artifact 前校验
`folderId` 存在（`SELECT id FROM my_space_folders WHERE id = ?`）。多
用户下这条**必须**收窄为 `AND user_id = ?`，否则 B 能把自己的 artifact
归档进 A 的文件夹（folderId 是请求体传入的）。同理该路由
（`mySpaceRoutes.mjs:124` `POST /api/my-space/artifacts`）先调
`exportDraftPaperPdf(draftPaperId)` 再存 artifact——`exportDraftPaperPdf`
本身必须按 userId 圈（否则 B 拿 A 的 draftPaperId 生成 PDF 存进 B 的
空间，既越权读又污染）。

plan 决策 3 的「所有 SELECT/UPDATE/DELETE WHERE 追加 AND user_id = ?」
**逻辑上覆盖**了这两处，但因为这条路由是「导出+保存」双 store 协作、
且 folderId 校验藏在 `saveMySpaceArtifact` 内部而非路由层，属于
plan「逐方法核对…一个不漏」里最容易漏的一类。

**要求 plan.md 处置**：决策 3 的子表/协作规则补两条点名断言（不新增
设计，只把隐含要求显式化，防漏）：
1. `saveMySpaceArtifact` 的 folderId 存在性校验须带 `AND user_id = ?`；
   artifact INSERT 写入调用方传入的 `userId`（**不得**从 draftPaper
   或 folder 反推）。
2. `POST /api/my-space/artifacts` 路由内 `exportDraftPaperPdf` 调用须
   传 `resolveDataUserId(context)`——B 拿 A 的 draftId 打这条回 404。
3. 验收 2 补一格：B 用 A 的 draftPaperId 打 `POST /api/my-space/
   artifacts` → 404（现验收 2 只测了 draft-papers 直打 + artifact 下载/
   删除，漏了「借导出旁路越权读 A 的草稿」）。

## Must Fix -> Plan Disposition Checklist

| MF | plan.md 须记录 |
| --- | --- |
| MF-1 | 改动清单加 `server/ai-proxy/routes.mjs`；决策 7 扩写为 `semanticSearchQuestionGroups` + `questionBankStewardSearch` 双入口 + steward 转发 userId；`semanticSearchService.mjs`/`questionBankStewardService.mjs` 均进清单；验收 5（Browser QA）加「两 member AI 搜索 + AI 管家结果按钮态互不串」一格 |
| MF-2 | 决策 5 补硬约束：PRAGMA 开关必在事务外、rebuild 主体包一个 BEGIN…COMMIT、迁移分支唯一写连接跑一次；验收 3 加「半迁移态（已 ADD COLUMN、user_version=2）重入 → 收敛 v3 且 folders 数据不丢」断言 |
| MF-3 | 决策 3 子表规则加两条点名：`saveMySpaceArtifact` folderId 校验带 `AND user_id = ?` 且 artifact 归属取调用方 userId；`POST /api/my-space/artifacts` 路由的 `exportDraftPaperPdf` 传 userId；验收 2 加「B 借导出旁路打 A 的 draftId → 404」一格 |

## Should Watch

- **SW-1（store 方法计数）**：plan 说「15 个方法」，实际
  `draftPaperStore` 导出 14 个（`getCurrentDraftPaperRow` /
  `markCurrentDraftPaper` 等），另有内部 helper（`touchDraftPaper` /
  `normalizeDraftItemOrder` / `createDraftPaper` / `getDraftPaperItems`
  / `getDraftPaper`）也触表。计数不精确不阻断，但 DEV 应以「触及三张
  顶层表的每一个 SQL」为准，而非以导出数为准——尤其 self-open 方法
  （`listDraftPapers` / `getOrCreateCurrentDraftPaper` /
  `addGroupToCurrentDraftPaper` / `updateDraftPaper` /
  `patchDraftPaperItem` / `deleteDraftPaperItem` / `restoreDraftPaperItem`
  / `migrateAssemblyBasketToDraftPaper` / `exportDraftPaperPdf`）自己开
  连接、内部经 `getCurrentDraftPaperRow` / `createDraftPaper` /
  `markCurrentDraftPaper` 圈 current，userId 必须一路带进这些自开方法
  的签名。verify 惯例（null-match 必 FAIL）是防线。
- **SW-2（getDraftSearchContext 内联子表查询）**：`api.mjs:507` 在
  拿到 `current.id` 后直接 `SELECT ... FROM draft_paper_items WHERE
  draft_paper_id = ?`。因 `current` 已经父表按 user 圈过，这条子表查询
  安全，无需加 user_id——符合决策 3 的父表命中规则。记录以免 DEV 误加。
- **SW-3（listMySpace 的 LEFT JOIN draft_papers）**：`mySpace.mjs:112`
  的 `LEFT JOIN draft_papers dp ON dp.id = a.source_draft_paper_id AND
  dp.status='active'` 用于算 `source_draft_exists`。当 artifacts 已按
  `a.user_id = ?` 圈，且 draft 也按人圈时，同一用户的 artifact 指向
  同一用户的 draft，JOIN 语义不变。**但若 DEV 只圈 artifacts 侧、忘了
  draft 侧**，跨用户 artifact 指向的 draft 仍可能被 JOIN 命中导致
  `source_draft_exists` 误判为 1。建议 JOIN 条件同时带
  `AND dp.user_id = a.user_id`（或对 dp 也加 `user_id = ?`）作显式
  皮带。非阻塞（正常路径 artifact 与 draft 同属一人），但值得 CR 盯。
- **SW-4（'local' 存量行不自动认领）**：ADR-0014 决策 1 已挂 owner
  追认。本地库永远开放模式、服务器库「先建号再暴露」，正常路径踩不到。
  同意不做自动认领，记入 Open PO Decisions。
- **SW-5（assembly-basket localStorage 换账号残留 / per-user 文件目录
  不做）**：ADR-0014 排除项已覆盖，无隐私载荷，同意挂 SW 不做。
- **SW-6（c8 verify 定长窗口正则重量窗）**：plan 已自觉（`:48` 的
  {0,160}、`:52` 的 {0,260}）。去重 UPDATE 挪进迁移分支后，
  `verify-c8` 切片边界 `warnIfSharedDatabaseStillHasUserTables` 仍须
  包住迁移分支源码，DEV 改完须实跑确认切片非空、UPDATE 仍在窗内。

## Allowed Files

与 plan「改动清单」一致，**加 MF-1 的两个文件**：
- `server/api.mjs`（ensure 重排 + getDraftSearchContext + listQuestionGroups 传参）
- `server/auth/auth.mjs`（LOCAL_USER_ID + resolveDataUserId + createUser 守卫）
- `server/draft-paper/draftPaperStore.mjs`
- `server/draft-paper/draftPaperRoutes.mjs`
- `server/my-space/mySpace.mjs`
- `server/my-space/mySpaceRoutes.mjs`
- `server/search/semanticSearchService.mjs`
- **`server/search/questionBankStewardService.mjs`**（MF-1：转发 userId）
- **`server/ai-proxy/routes.mjs`**（MF-1：两搜索路由取 userId）
- `server/question-bank/questionGroupRoutes.mjs`（listQuestionGroups 传 userId）
- `scripts/verify-user-scope.mjs`（新增）
- `scripts/verify-c8-draft-paper-contracts.mjs` / `verify-c8-my-space-contracts.mjs`（断言升级）
- `scripts/verify-ci.mjs` + `scripts/README.md`（挂新脚本）

注：`questionGroupRoutes.mjs`（`GET /api/question-groups` → `context.listQuestionGroups()`）plan 改动清单未点名但决策 7 隐含要动——请一并列入。

## Forbidden Files

同 plan「Forbidden」，无异议：
- 不动共享馆 `question-bank.sqlite` 任何表、paper_sets / export_jobs / import-pipeline。
- 不动 `server/router/`（H1 零 auth 词汇闸）。
- 不改 auth 流程 / session 契约 / applyAuthGate / 白名单。
- 不改前端（含 localStorage 语义）；不做 per-user 文件目录。
- 不引迁移框架、不建独立迁移脚本。
- 不做 role 例外（owner 私有数据同样按人隔离）。

## Static Verify Requirements

`scripts/verify-user-scope.mjs`（hermetic，4 路径 env + 端口指向临时目录）
须覆盖：
1. 开放模式回归：空 users → CRUD 全通 → 直查库所有行 `user_id='local'`。
2. 两用户隔离（含 MF-1 / MF-3 新增格）：
   - draft-papers 直打 GET/PATCH/DELETE items/print-html 跨用户 → 404；
   - **B 借 `POST /api/my-space/artifacts` 用 A 的 draftId → 404（MF-3）**；
   - artifact 下载 / 删除跨用户 → 404；folder 同名按人各自成功、同人内
     报「名称已存在」；owner 无特权（A 用 B 的 draftId → 404）。
3. 迁移：v2 库触发 ensure → 列齐 / 回填 'local' / 复合索引在 /
   user_version=3 / 幂等重入；**+ MF-2 半迁移态重入收敛断言**。
4. c8 契约断言升级：user_id 列存在、复合 current 索引、
   `UNIQUE(user_id, name)`、去重 UPDATE 活在迁移分支且落在切片窗内；
   两定长窗口重量窗；null-match 必 FAIL 纪律保持。
5. `pnpm -C app run verify:all` / PR CI 全绿；verify-user-scope 挂 verify-ci。

## Browser QA Matrix（PM 亲跑，两 profile 两账号）

- A、B 各自找题→加组→当前草稿互不串；个人空间互不见。
- 找题页 `in_current_draft` 按钮态按人正确。
- **AI 语义搜索 + AI 管家结果卡片按钮态两 member 互不串（MF-1 新增）**。
- 退回开放模式（清 users）后 owner 日常流零变化。
- QA 前 `lsof -nP -iTCP:8787 -sTCP:LISTEN` + `ps -o lstart` 核进程新鲜度；
  QA 账号用完清掉。

## DEV Readiness

修完 MF-1/MF-2/MF-3（都是「plan 补记录」，无一需要新设计决策）即
DEV-ready。teacher action / before-after / cut 边界 / allowed-forbidden /
verify / QA 矩阵均可陈述清楚。未决 PO 决策 ≤ 3。

## Open PO Decisions（≤ 3）

1. **`'local'` 存量行不自动认领**（ADR-0014 决策 1）——open 切 enforced
   后 local 数据不划给任何账号，手工 UPDATE 兜底。owner 追认。
2. **owner 无私有数据特权**（ADR-0014 决策 4）——owner 看不到同事草稿/
   个人空间。这是 roadmap 决策 2 的直接推论，PM 视为已拍板则移除本条；
   若 owner 想要「后台可见全体草稿」的运营视角，须另开刀，不塞本刀。
3. （无第三条阻断项。）

## 复核过的关键坐标清单

- `server/api.mjs:501-516` getDraftSearchContext（零参自开只读连接，
  内联子表查询在 :507）— 确认。
- `server/api.mjs:1498-1506` listQuestionGroups（零参，:1502 传
  getDraftSearchContext()）— 确认。
- `server/api.mjs:660-708` ensureUserDatabaseShape（单 exec 无 BEGIN 包裹；
  去重 UPDATE :683-692；current_one 索引 :693-695；user_version=2 :707）
  — 确认，MF-2 依据。
- `server/api.mjs:4146-4189` applyAuthGate（open 模式返回
  `{session:null, authMode:'open'}`，enforced 返回
  `session:{userId,username,role}`）— 确认 resolveDataUserId 口径成立。
- `server/api.mjs:4240-4242` context 组装（open 模式 context **无**
  session 键，只 authMode）— 确认 `context.session?.userId` 安全。
- `server/api.mjs:4285` 启动唯一写连接触发 ensure — 确认迁移触发点。
- `server/draft-paper/draftPaperStore.mjs`：createDraftPaper :59（全表清
  current）、markCurrentDraftPaper :74（全表清 current）、
  getCurrentDraftPaperRow :36、9 个 self-open 方法各自开连接 — 确认
  SW-1 依据。
- `server/draft-paper/draftPaperRoutes.mjs`：GET :57 / POST items :91（含
  markCurrentDraftPaper :103）/ print-html :152 三条 db-param 路由在路由层
  开连接 — 确认须取 resolveDataUserId 下传。
- `server/my-space/mySpace.mjs`：ensureMySpaceDatabaseShape :5-29（folders
  内联 UNIQUE :9）、listMySpace :83（folders + artifacts 两查询 +
  LEFT JOIN draft_papers :112）、saveMySpaceArtifact folderId 校验 :176、
  createMySpaceFolder :128 / renameMySpaceFolder :146 UNIQUE 捕获 — 确认
  MF-3 / SW-3 依据。
- `server/my-space/mySpaceRoutes.mjs`：下载路由 :29 只校 artifactId 正则、
  不校归属 — 确认 plan 决策 8 必要；POST artifacts :124 导出+保存协作 —
  确认 MF-3 依据。
- `server/ai-proxy/routes.mjs:22,28` semantic-search / steward 两路由非
  ownerOnly、member 可达 — 确认 MF-1 依据。
- `server/search/semanticSearchService.mjs:374` getDraftSearchContext()
  零参调用；`server/search/questionBankStewardService.mjs:430` 嵌套调
  semanticSearchQuestionGroups — 确认 MF-1 穿透链。
- `server/auth/auth.mjs:90-107` createUser（id=`user-<uuid>`）— 确认
  'local' 永不碰撞。
- `scripts/smoke-c8-*.mjs`（USER_DATA_DB 临时路径、不建用户）— 确认开放
  模式零改动继续绿的前提成立。
- ADR-0012 §5（`< N` 比较口径）/ ADR-0013（authMode 显式、H1 闸）—
  与 plan 决策 6 / 2 一致，无矛盾。
