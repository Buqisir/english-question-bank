# M0-4 用户数据隔离 — plan.md（DEV 执行契约）

cut size: large; touches schema, data contract: yes（上线路线图 M0 第 4 刀，
决策 2 已由 owner 拍板：草稿卷/个人空间按用户私有）。

配套 ADR：`docs/adr/0014-user-data-isolation.md`（本刀合并时转 Accepted）。

## 目标

给用户库三张顶层表加 `user_id`，所有读写按当前用户圈范围。做完后：

- 强制模式下任何用户（含 owner）只见/只改自己的草稿卷与个人空间；
  跨用户按 id 直打 API 得 404，猜到 UUID 也下载不到别人的 PDF；
- 开放模式（users 表空）行为与今天逐字节一致——所有数据归属隐含
  单用户 `'local'`；
- 存量库（user_version=2）启动时自动迁移到 v3，零手工步骤。

## 侦察结论（已抽验 file:line，2026-07-03）

- 三张顶层表 `draft_papers` / `my_space_folders` / `my_space_artifacts`
  无任何 user 维度；`draft_paper_items` 全部 SQL 恒带
  `WHERE draft_paper_id = ?`（`draftPaperStore.mjs:267-535` 各点位），
  **经父表圈定即可，不加列**。
- 「当前草稿」是**数据库级全局单例**：`current_marker` + 部分唯一索引
  `idx_draft_papers_current_one ON draft_papers(current_marker) WHERE
  current_marker = 1`（`api.mjs:693-695`）；`createDraftPaper`（
  `draftPaperStore.mjs:59`）与 `markCurrentDraftPaper`（`:74`）会清
  **全表**的 current 标记。多用户下不改则第二个用户置 current 直接
  UNIQUE 冲突。
- `ensureUserDatabaseShape`（`api.mjs:660-708`）里有一段每次启动都跑的
  全局去重 UPDATE（`api.mjs:683-692`，「全表只留最新一条 current」）——
  多用户后它会清掉别人的 current，必须挪进一次性迁移分支。
- `my_space_folders.name` 是**内联 UNIQUE（全局唯一）**（
  `mySpace.mjs:9`）；改按用户唯一只能重建表（SQLite 不能改内联约束）。
- `users.id` 为 TEXT，格式 `user-<uuid>`（`auth.mjs:93`）；
  `context.session = { userId, username, role }`（`api.mjs:4186-4189`）；
  `authMode: 'open'|'enforced'` 已显式进 context（`api.mjs:4157-4159,
  4188`）。涉及的 17 条路由全部未挂 ownerOnly、无一处消费 session。
- `user_version` 现状：无条件写 2（`api.mjs:707`）；**fresh 库的
  user_version 也是 0**（建表后才写 2），条件迁移不能只看版本号，
  要配列存在性守卫。
- 只读连接不跑 ensure（`api.mjs:654`）；老库自动升级的保证触发点是
  启动时唯一写连接 `openUserDatabase({ readOnly: false }).close()`
  （`api.mjs:4285`）。
- `exportDraftPaperPdf` 先 `getDraftPaper` 后查 `recentDraftPdfExports`
  缓存（`draftPaperStore.mjs:625-639`）——上游圈人后缓存无泄漏路径，
  缓存键不用动。
- `GET /user-space/files/:id.pdf` 只校验 artifactId 正则格式
  （`mySpaceRoutes.mjs:29`），不校验归属——拿到 UUID 就能下载任何人
  的 PDF，本刀必须补。
- `getDraftSearchContext()` 是零参函数自开连接（`api.mjs:501-516`），
  两个调用点：`listQuestionGroups`（`api.mjs:1502`）、
  `semanticSearchService.mjs:374`（工厂注入）。加列后要按人取。
- `export_jobs` / `paper_sets` 不引用 draft_paper id（物理上在另一个库
  文件），无越权旁路。
- smoke-c8 两脚本跑在开放模式（不建用户）——开放模式行为不变则
  **零改动继续绿**。

## 设计决策（DEV 不得偏离；改动先回 PM）

1. **user_id 语义 = 哨兵 `'local'`，不用 NULL**。
   三张顶层表加列 `user_id TEXT NOT NULL DEFAULT 'local'`。
   开放模式读写恒为 `'local'`；强制模式用 `session.userId`。
   - 为什么不是 NULL：SQLite 唯一索引里 NULL 彼此不相等，
     `UNIQUE(user_id, name)` 与按人 current 索引对 NULL 全部失效；
     且 `WHERE user_id = ?` 单一查询口径比 `IS ?` 双口径少一类错。
   - 为什么对齐 ADR-0013：开放模式=那一个隐含用户（实践中即 owner），
     产品形态数仍为 2，不造第三形态。
   - `users.id` 格式 `user-<uuid>` 永不撞 `'local'`；`createUser` 加
     一行守卫拒绝 id/username 为 `'local'`（皮带加背带）。
2. **翻译点唯一**：新增 `resolveDataUserId(context)`（放
   `server/auth/auth.mjs`，与 LOCAL_USER_ID 常量一起导出）：
   `authMode === 'enforced'` → `context.session.userId`（session 缺失
   则抛错，这些路由都不在白名单，缺 session 属于 bug 要炸出来）；
   否则 → `'local'`。**只允许路由 handler / api.mjs 顶层调用它**；
   store 与深层服务一律收显式 `userId` 参数，禁止自己摸
   context/session（对齐 ADR-0013「isOwnerView 单点翻译」惯例，
   router 目录保持零 auth 词汇——H1 闸）。
3. **store 签名契约**：所有触及三张顶层表的 store 方法在连接参数之后
   加**必填** `userId` 参数（无默认值——漏传要炸，不许静默回落
   'local'）。SQL 口径：
   - 所有 SELECT/UPDATE/DELETE 的 WHERE 追加 `AND user_id = ?`；
   - 所有 INSERT 写入 `user_id`；
   - `createDraftPaper` / `markCurrentDraftPaper` 清 current 标记的
     UPDATE 改为 `WHERE current_marker = 1 AND user_id = ?`；
   - `getCurrentDraftPaperRow` / `listDraftPapers` 按 `user_id = ?` 圈；
   - **子表规则**：`draft_paper_items` 的 SQL 不动，但任何以
     draftPaperId 为入口的操作，必须先经父表按
     `(id, user_id)` 命中（未命中按现有「草稿不存在」路径回 404），
     不许直接信任路由参数里的 draft_paper_id。核对基准以「触及三张
     顶层表的每一条 SQL」为准（不是导出方法数，PA SW-1）——
     `draftPaperStore.mjs` 的 9 个自开连接方法（listDraftPapers /
     getOrCreateCurrentDraftPaper / addGroupToCurrentDraftPaper /
     updateDraftPaper / patchDraftPaperItem / deleteDraftPaperItem /
     restoreDraftPaperItem / migrateAssemblyBasketToDraftPaper /
     exportDraftPaperPdf）签名都要带 userId 并传给内部的
     getCurrentDraftPaperRow / createDraftPaper / markCurrentDraftPaper。
   - **协作路径点名（PA MF-3，最易漏的两处）**：
     ①`saveMySpaceArtifact` 的 folderId 存在性校验（`mySpace.mjs:176`）
     必须带 `AND user_id = ?`；artifact INSERT 的 user_id 取调用方
     传入的 userId，**不得**从 draftPaper 或 folder 反推。
     ②`POST /api/my-space/artifacts` 路由内的 `exportDraftPaperPdf`
     调用必须传 `resolveDataUserId(context)`——B 拿 A 的 draftId
     借导出旁路越权读，必须在 getDraftPaper 圈人处回 404。
   - **getDraftSearchContext 内联子表查询不加 user_id**（PA SW-2）：
     `api.mjs:507` 的 items 查询已经父表圈过，误加属违约。
   - **listMySpace 的 LEFT JOIN 两侧都圈**（PA SW-3）：
     `mySpace.mjs:112` 的 `LEFT JOIN draft_papers dp` 加
     `AND dp.user_id = a.user_id`（显式皮带，防 source_draft_exists
     跨用户误判）。
4. **「当前草稿」按人**：唯一索引改
   `ON draft_papers(user_id, current_marker) WHERE current_marker = 1`。
   同名索引换形要先 DROP 再 CREATE（放迁移分支，见决策 6）。
5. **文件夹名按人唯一**：`my_space_folders` 重建表，
   `name TEXT NOT NULL` + `UNIQUE(user_id, name)`。重建走 SQLite 官方
   12 步套路的最小版（迁移分支内），**时序硬约束（PA MF-2，DEV 不得
   偏离）**：
   - `PRAGMA foreign_keys = OFF` 与 `= ON` 必须在事务**外**执行——
     SQLite 在活动事务内改这个 PRAGMA 是静默 no-op（不报错不生效），
     照抄本仓 store 方法「整段包 BEGIN」的惯例会中招；
   - 重建主体（CREATE 新形临时表 → INSERT SELECT（user_id 取
     DEFAULT 'local'）→ DROP 旧表 → RENAME）必须包在**一个**
     `BEGIN…COMMIT` 里——半迁移态（旧表已 DROP、新表未 RENAME）
     不可能落盘，否则下次启动 `CREATE TABLE IF NOT EXISTS` 会以新形
     补建空表，旧数据丢失；
   - 完整顺序：`foreign_keys=OFF`（事务外）→ `BEGIN` → 重建四步 →
     `COMMIT` → `foreign_keys=ON`（事务外）→ `PRAGMA
     foreign_key_check` 断言零行。
   `my_space_artifacts.folder_id` 的 FK（ON DELETE SET NULL）在
   DROP+RENAME 后指向新表；重建后必须跑 foreign_key_check 验证。
   捕获 UNIQUE 报错转「文件夹名称已存在」的现有逻辑（
   `mySpace.mjs:130,148`）语义不变，约束域收窄到按人。
6. **迁移 = ensure 内条件分支，user_version 2→3，无独立迁移脚本**
   （ADR-0012 §5 预留的正是这条路）。`ensureUserDatabaseShape` 新结构：
   1. 主 `db.exec`：CREATE TABLE IF NOT EXISTS 全部用**新形**（三张表
      含 user_id 列；my_space_folders 含 UNIQUE(user_id, name)；
      draft 的普通索引照旧）。**全局去重 UPDATE 从主 exec 删除**。
   2. 迁移分支：读 `PRAGMA user_version`，`version < 3` 时（**必须
      `< 3`，禁止 `=== 2`**，ADR-0012 §5）：
      - 对三张表逐个用 `PRAGMA table_info` 查 user_id 列，缺则
        `ALTER TABLE ... ADD COLUMN user_id TEXT NOT NULL DEFAULT
        'local'`（fresh 库 version=0 但列已在，守卫跳过——这就是
        双保险的意义）;
      - 原全局去重 UPDATE 原样跑一次（此刻全部行都是 'local'，全局
        语义=按人语义）；
      - `DROP INDEX IF EXISTS idx_draft_papers_current_one`；
      - my_space_folders 若无 user_id 列（即真旧表）→ 决策 5 重建；
   3. 分支后（无条件）：`CREATE UNIQUE INDEX IF NOT EXISTS
      idx_draft_papers_current_one ON draft_papers(user_id,
      current_marker) WHERE current_marker = 1`；补
      `CREATE INDEX IF NOT EXISTS` 的按人辅助索引（
      `draft_papers(user_id, status, updated_at)`、
      `my_space_artifacts(user_id, generated_at)`——具体列序 DEV 按
      查询形状定，进 plan 不锁死）；`PRAGMA user_version = 3`。
   - 存量行归属裁决：v2 库所有行回填 `'local'`。现实中不存在
     强制模式多用户的 v2 库（服务器 M1 才部署；owner 本地恒开放
     模式），故无数据错并风险。**记 ADR，列 owner 追认**。
7. **getDraftSearchContext(userId)**：签名加必填 userId，
   `getCurrentDraftPaperRow(userDb, userId)` 按人取。消费链共
   **三个 member 可达入口**，全部从请求 context 经
   `resolveDataUserId` 取值后一路显式传参（PA MF-1 订正——AI 链路
   是穿透两层的，漏改会重演 M0-1 按钮态串号 bug）：
   - `GET /api/question-groups` → `listQuestionGroups(userId, ...)`
     （`questionGroupRoutes.mjs` handler 取值下传）；
   - `POST /api/ai/semantic-search` →
     `semanticSearchQuestionGroups(userId, ...)` 签名加必填 userId，
     内部 `getDraftSearchContext(userId)`；
   - `POST /api/ai/question-bank-steward` →
     `questionBankStewardSearch(userId, ...)` 签名加必填 userId，
     并把 userId **转发**给它内部嵌套的
     `semanticSearchQuestionGroups` 调用
     （`questionBankStewardService.mjs:430`）。
   Browser QA 必测两格：「找题页 in_current_draft 按钮态按人正确」
   +「两 member 的 AI 语义搜索与 AI 管家结果卡片按钮态互不串」
   （静态 verify 抓不到，M0-1 教训）。
8. **下载路由补归属**：`GET /user-space/files/:id.pdf` 取 artifact 行
   后校验 `user_id === resolveDataUserId(context)`，不命中回 404
   （与 id 不存在同响应，不泄露存在性）。
9. **不动面**：`recentDraftPdfExports` 缓存键不动（上游已圈人，
   404 在缓存之前）；`userSpaceFilesDir` 保持单一平铺目录（DB 行
   校验已是强制门，per-user 子目录牵动存量文件搬迁，不做——记 SW）；
   assembly-basket-v1 localStorage 换账号残留（只含共享题组 id，
   无隐私载荷）不动——记 SW 挂账。

## 改动清单（预计）

- `server/api.mjs`：`ensureUserDatabaseShape` 重排（新形建表 + 迁移
  分支 + user_version=3）；`getDraftSearchContext(userId)`；
  `listQuestionGroups(userId, ...)` 及其路由传参；语义搜索工厂注入点
  传参。
- `server/auth/auth.mjs`：`LOCAL_USER_ID` + `resolveDataUserId`；
  `createUser` 拒绝 `'local'`。
- `server/draft-paper/draftPaperStore.mjs`：15 个方法加必填 userId、
  SQL 圈范围、current 语义按人。
- `server/draft-paper/draftPaperRoutes.mjs`：12 条路由 handler 取
  `resolveDataUserId(context)` 下传。
- `server/my-space/mySpace.mjs`：shape 新形 + 8 个函数加必填 userId、
  SQL 圈范围。
- `server/my-space/mySpaceRoutes.mjs`：9 条路由下传 userId；下载路由
  归属校验。
- `server/search/semanticSearchService.mjs`：
  `semanticSearchQuestionGroups` 签名加必填 userId，
  `getDraftSearchContext(userId)` 沿注入链打通。
- `server/search/questionBankStewardService.mjs`（PA MF-1）：
  `questionBankStewardSearch` 签名加必填 userId 并转发给内部的
  semanticSearch 调用。
- `server/ai-proxy/routes.mjs`（PA MF-1）：semantic-search 与
  question-bank-steward 两条路由 handler 取
  `resolveDataUserId(context)` 下传。
- `server/question-bank/questionGroupRoutes.mjs`：
  `GET /api/question-groups` handler 取 userId 传
  `listQuestionGroups`。
- `scripts/verify-user-scope.mjs`（新增，进 verify-ci +
  scripts/README.md）：见验收 1–3。
- `scripts/verify-c8-draft-paper-contracts.mjs` /
  `verify-c8-my-space-contracts.mjs`：静态断言**升级到新契约**——
  user_id 列存在、复合 current 索引、`UNIQUE(user_id, name)`、
  去重 UPDATE 活在迁移分支；两个定长窗口正则（`:48` 的 160、`:52`
  的 260）重新量窗；null-match 必 FAIL 的既有纪律保持。
- 前端：**零改动**（圈范围全在服务端；两用户互不见是 API 语义）。

## Forbidden

- 不动共享馆（question-bank.sqlite）任何表、不动 paper_sets /
  export_jobs / import-pipeline。
- 不做 role 例外：owner 的草稿/个人空间同样按人隔离（roadmap 决策 2
  「按用户私有」，owner 特权只在共享馆写权限——那是 M0-3 的闸）。
- 不引迁移框架、不建独立迁移脚本、不新建 verify 文件之外的脚本。
- 不改 auth 流程 / session 契约 / applyAuthGate / 白名单。
- 不改前端（含 localStorage 语义）；不做 per-user 文件目录。
- 不动 `server/router/`（保持零 auth 词汇，H1 闸）。
- 新起服务的 verify 脚本 env 覆盖必须齐 4 路径 env：
  `QUESTION_BANK_DB` / `USER_DATA_DB` / `QUESTION_BANK_PAPER_ASSET_ROOT`
  / `QUESTION_BANK_USER_SPACE_ROOT`（+ 端口）——M0-3 事故教训，对照
  `api.mjs:55-63` 清单逐个过。

## 验收（DEV 自证 + RM 复核）

新脚本 `scripts/verify-user-scope.mjs`（hermetic：全部 4 路径 env +
端口指向临时目录；不跑 vivliostyle——artifact 行用脚本直插临时用户库
构造）：

1. **开放模式回归**：空 users 表起服 → 草稿 CRUD + 加组 + 个人空间
   文件夹 CRUD 全通 → 直查库断言所有行 user_id='local'。
2. **两用户隔离**（CLI 建 owner A + member B，各自登录拿 cookie）：
   - A、B 各建草稿、各置 current：互不冲突（复合索引生效）、
     `GET /api/draft-papers/current` 各回各的；
   - B 用 A 的 draft id 打 GET/PATCH/DELETE items/print-html →
     全部 404；B 的列表只见 B 的；
   - A、B 建同名文件夹都成功；同一用户内建同名文件夹仍报
     「名称已存在」；
   - B 用 A 的 artifact id 打 `GET /user-space/files/:id.pdf` 与
     `DELETE /api/my-space/artifacts/:id` → 404；A 自己下载成功；
   - **B 用 A 的 draftPaperId 打 `POST /api/my-space/artifacts` →
     404（PA MF-3，借导出旁路越权读）**；B 把 artifact 归档进 A 的
     folderId → 404/校验拒绝；
   - owner 无特权：A（owner）用 B 的 draft id → 同样 404。
3. **迁移**：脚本手工构造 v2 形库（无 user_id 列 + user_version=2 +
   预置行，含一行 current_marker=1）→ 触发 ensure → 断言：列齐、
   行回填 'local'、复合索引在（`PRAGMA index_info`）、旧行仍可经
   开放模式 API 读到、user_version=3 → 再触发一次 ensure 幂等无错。
   **另构造半迁移态库（已 ADD COLUMN、user_version 仍 =2）触发
   ensure → 断言收敛到 v3 且 my_space_folders 数据不丢（PA MF-2
   崩溃重入路径）**。
4. `pnpm -C app run verify:all` 全绿（或 PR CI 绿）；
   verify-user-scope 已挂 verify-ci（housekeeping 闸）。
5. **浏览器 QA**（PM 亲跑，两浏览器 profile 两账号）：A、B 各自
   找题→加组→当前草稿互不串→个人空间互不见；**找题页
   in_current_draft 按钮态按人正确**；**AI 语义搜索 + AI 管家结果
   卡片按钮态两 member 互不串（PA MF-1）**；退回开放模式（清
   users）后 owner 日常流零变化。QA 前
   `lsof -nP -iTCP:8787 -sTCP:LISTEN` + `ps -o lstart` 核对进程
   新鲜度（孤儿进程教训）；QA 账号用完清掉。

## PA Follow-Up Decisions

PA 判定 APPROVE WITH MUST FIX（pa.md，2026-07-03），3 条 Must Fix
全部采纳并压缩入本文件：

- MF-1（AI 搜索链路 userId 未穿透）→ 决策 7 扩写为三入口
  （question-groups / semantic-search / steward），steward 转发
  userId；改动清单补 `ai-proxy/routes.mjs` /
  `questionBankStewardService.mjs` / `questionGroupRoutes.mjs`；
  验收 5 加 AI 搜索按钮态互不串一格。
- MF-2（表重建事务/PRAGMA 时序）→ 决策 5 补硬约束：PRAGMA 开关必在
  事务外（事务内静默 no-op）、重建主体包单个 BEGIN…COMMIT；验收 3
  加半迁移态重入收敛断言。
- MF-3（saveMySpaceArtifact 协作路径）→ 决策 3 补点名：folderId
  校验带 user_id、artifact 归属取调用方 userId 不反推、
  `POST /api/my-space/artifacts` 内 exportDraftPaperPdf 传 userId；
  验收 2 加借导出旁路 404 一格。

Should Watch 采纳情况：SW-1（以 SQL 为清单基准 + 9 个自开方法签名）
进决策 3；SW-2（内联子表查询勿误加）进决策 3；SW-3（LEFT JOIN 两侧
圈）进决策 3；SW-4/5（'local' 不自动认领、basket 残留不做）已在
ADR-0014 + owner 追认清单；SW-6（c8 窗口正则重量窗 + 切片边界确认）
已在改动清单 verify 条目，DEV 改完实跑确认。

Open PO Decisions 处置：①'local' 存量行不自动认领 → owner 追认
（非阻塞，累计清单）；②owner 无私有数据特权 → roadmap 决策 2
「按用户私有」的直接推论，PM 视为已拍板，不阻塞（owner 若想要运营
视角另开刀）。
