# M0-1 两库分离手术 — plan.md（DEV 执行契约）

cut size: large; touches schema, data contract: yes（上线路线图 M0 第 1 刀，
决策 7 已由 owner 拍板：两库分离、跨库引用走 ID + 应用层拼装）。

配套 ADR：`docs/adr/0011-user-data-database-split.md`（本刀合并时转 Accepted）。

## 目标

把四张用户数据表 `draft_papers` / `draft_paper_items` /
`my_space_artifacts` / `my_space_folders` 从 `question-bank.sqlite`
挪进独立的 `user-data.sqlite`，连接层双库。做完后：

- 共享馆库（question-bank.sqlite）可以整文件替换（M1 馆推流程），
  不再携带任何用户数据；
- 用户库（user-data.sqlite）服务器独有，部署流程永不触碰。

## 侦察结论（已抽验 file:line，2026-07-03）

- 连接层：`node:sqlite` `DatabaseSync`，无连接池，函数级现开现关。
  工厂 `openDatabase()` 在 `server/api.mjs:617-625`；路径
  `server/api.mjs:53`（`QUESTION_BANK_DB` env || `data/question-bank.sqlite`）。
  传递方式三种混用：store 工厂注入 `openDatabase`（
  `draftPaperStore.mjs:17-26`）、路由传 `db` 对象（`draftPaperRoutes.mjs`）、
  `context.openDatabase`（`mySpaceRoutes.mjs`）。
- Schema 双轨：`data/sql/schema.sql`（init-db.sh 首建）+
  `ensureDatabaseShape()`（`api.mjs:627-753` 启动幂等重建）。无版本表。
  my_space 两表定义在 `server/my-space/mySpace.mjs:5-29`
  （`ensureMySpaceDatabaseShape`）。
- 跨界点位（拆库后会断/需改）：
  1. `draft_paper_items.group_id REFERENCES question_groups(id) ON DELETE
     RESTRICT`（schema.sql:136）——跨库 FK，拆后无法强制；
  2. `deleteDraftPaperItem` 里唯一一处真 SQL JOIN 跨两侧
     （`draftPaperStore.mjs:484-493`，JOIN 只用于存在性确认）；
  3. `getDraftPaperItems` 同连接两侧混查（`draftPaperStore.mjs:248-260`，
     应用层逐行拼 `selectQuestionGroupCards`）；
  4. `getDraftSearchContext` 在共享表查询函数内读用户表
     （`api.mjs:489-495`，被 `selectQuestionGroupCards` 调用）。
- 用户表内部 JOIN（`my_space_artifacts LEFT JOIN draft_papers`，
  `mySpace.mjs:104-117, 205-216`）：两表同迁，不受影响。
- 事务核查：无任何事务同时**写**用户表和共享表——拆库无跨库事务问题。
- 脚本耦合：`smoke-c8-my-space.mjs` / `smoke-c8-draft-paper-composer.mjs`
  用 `QUESTION_BANK_DB` 注入子进程并直开 DB 文件；
  `verify-c8-draft-paper-contracts.mjs` / `verify-c8-my-space-contracts.mjs`
  静态正则断言 schema.sql 与源文件字符串，表定义搬家后正则需同步。
- `openDatabase()` 文件不存在直接抛错（不自动建库）；首建靠
  `scripts/init-db.sh`。

## 设计决策（DEV 不得偏离；改动先回 PM）

1. **用户库路径与创建**：`USER_DATA_DB` env || `data/user-data.sqlite`。
   与共享库不同，**启动时自动建库建表**（`ensureUserDatabaseShape()`，
   文件不存在就建）——部署永不推送此文件，必须自愈；共享库保持
   现状（缺文件抛错，首建走 init-db.sh）。
2. **用户库 schema 单一来源 = 代码**：四张表的 CREATE TABLE + 索引只
   活在 `ensureUserDatabaseShape()`（draft 两表）与
   `ensureMySpaceDatabaseShape()`（my_space 两表，改为吃用户库连接）。
   从 `data/sql/schema.sql` 删除这四张表及其索引。**不新建
   user-schema.sql**——消灭双轨漂移点，而不是复制一份。
3. **连接层**：`api.mjs` 新增 `openUserDatabase({ readOnly })` 工厂
   （同样 `PRAGMA foreign_keys = ON`，PA SW-2），与 `openDatabase`
   并列。`serverContext` 挂 `openUserDatabase`；`createDraftPaperStore`
   注入两个工厂；路由层负责开/关自己用到的连接（沿用现开现关模式，
   不引入连接池/ATTACH——决策 7 定的是应用层拼装，不走 ATTACH 跨库
   SQL）。**具体到方法的双连接契约见下节「store 连接改造清单」，
   DEV 不得自选取舍（PA MF-1）。**
4. **跨库 FK 降级为应用层守卫**：`group_id` 的 REFERENCES 删除。
   写侧守卫已存在（`addGroupToDraftPaper` 插入前校验题组，
   `draftPaperStore.mjs:355-358`），保留。读侧新增孤儿容忍：题组
   在共享库消失时（馆文件替换可能下架题组），`getDraftPaperItems`
   不崩溃——该 item 标记 `groupMissing: true` 返回，前端草稿卷
   工作台把它显示为失效条目（可删除、不可打印）；打印/导出路径
   跳过失效条目并在响应里带出提示。UI 只做最小可用（失效态样式
   复用现有禁用/警示语汇），不做新交互设计。
5. **JOIN 改写**：`deleteDraftPaperItem` 的 JOIN 改为单表查
   `draft_paper_items`（原 JOIN 只做存在性确认；题组是否还在不
   影响删除语义）。`getDraftSearchContext` 改为从 userDb 取草稿
   上下文（当前草稿 id + 组 id 集合）。
   **`selectQuestionGroupCards` 新签名锁定（PA MF-2）**：
   `selectQuestionGroupCards(db, whereClause = '', params = [],
   draftContext = EMPTY_DRAFT_CONTEXT)`——不再自己摸用户表；
   空上下文默认语义 = 不标 `in_current_draft`。全仓 12 处调用方
   的处置：**只有找题/卡片列表主路径（搜索入口路由）从 userDb
   取一次真实 draftContext 传入**；draftPaperStore 内部调用
   （加组校验、items 拼卡片）与其余调用方一律用默认空上下文
   （这些路径不消费按钮态）。禁止每个调用方各开一次 userDb。
   「找题页 in_current_draft 按钮态」列入 Browser QA 必测
   （`buildDraftButtonState` 依赖 draftContext.groupIds，静态
   verify 抓不到这个回归）。
6. **一次性迁移**：新脚本 `scripts/migrate-user-data-split.mjs`：
   ①先备份共享库文件（复制 `.bak.<timestamp>`）；②建/确保用户库
   shape；③把共享库中四张表的行原样搬进用户库（幂等：目标表非空
   则拒绝重复迁移）；④DROP 前逐表断言「用户库行数 == 共享库行数」，
   不一致则中止不 DROP（PA SW-1），通过后才从共享库 DROP 四张表，
   并打印迁移前后行数对照表。启动时的
   `ensureDatabaseShape()` **不做自动迁移、不 DROP**——若检测到
   共享库仍有用户表则打印警告提示跑迁移脚本。owner 本机跑一次；
   全新环境（含未来服务器）init-db.sh 建的共享库本就没有这四张表。
7. **paper_sets / paper_items / export_jobs 不动**：路线图决策只圈了
   四张表；这些表的归属留给后续刀（如需要）。import-pipeline 脚本
   只碰共享表，路径口径不变，不改。
8. **写侧守卫保留、读侧才容忍（PA MF-5）**：`addGroupToDraftPaper`
   插入前校验题组存在（不存在则抛错）**保持不变**——不允许把不
   存在的组加进草稿；孤儿容忍只作用于读侧（组入草稿后才被下架）。
   失效条目的**统一过滤点**：`getDraftPaperItems` 在 item 上标
   `groupMissing: true`（card 为 null 时），打印/导出由
   `buildDraftPaperExportInput` / `buildDraftPaperBlocks` 统一过滤
   `groupMissing` 条目；**禁止在 `getQuestionGroupDetail` 里吞异常**
   （`buildDraftPrintHtml` / `exportDraftPaperPdf` 经它取详情，
   失效条目必须在到达它之前被过滤掉）。

## store 连接改造清单（PA MF-1，Must Do，不许自选取舍）

统一规则：
- **userDb** 管四张用户表的一切读写；有写操作的路径开
  `openUserDatabase({ readOnly: false })`，纯读开只读。
- **bankDb** 管 `selectQuestionGroupCards` / `isGroupPrintReady` /
  `getQuestionGroupDetail` 等共享表查询，从这些路径永远只读。
- 任何一条 SQL 不得跨侧：四张表的语句只跑在 userDb 上，反之亦然。
- 原自开连接的方法继续自开（需要哪侧开哪侧，`finally` 里对称
  close）；原收 `db` 参数的方法改收 `{ userDb, bankDb }`（只用一侧
  的可只收一侧），由调用方（路由层）开/关，同样 `finally` 对称。

`server/draft-paper/draftPaperStore.mjs` 逐方法归属（行号 2026-07-03
核实；DEV 开工时如有漂移以函数名为准）：

| 方法 | 行 | 现连接 | 触侧 |
|---|---|---|---|
| getCurrentDraftPaperRow | 29 | 收 db | 仅用户 |
| createDraftPaper / touchDraftPaper / markCurrentDraftPaper | 50/62/66 | 收 db | 仅用户 |
| getDraftPaperItems | 247 | 收 db | **两侧**（items→userDb；cards+printReady→bankDb） |
| getDraftPaper | 278 | 收 db | **两侧**（经 getDraftPaperItems） |
| listDraftPapers | 301 | 自开 | 仅用户 |
| getOrCreateCurrentDraftPaper | 321 | 自开(写) | 仅用户 |
| normalizeDraftItemOrder | 346 | 收 db | 仅用户 |
| addGroupToDraftPaper | 354 | 收 db | **两侧**（校验→bankDb；INSERT→userDb） |
| addGroupToCurrentDraftPaper | 388 | 自开(写) | **两侧** |
| updateDraftPaper | 411 | 自开(写) | **两侧**（若返回体经 getDraftPaper 拼卡片） |
| patchDraftPaperItem | 452 | 自开(写) | **两侧**（同上） |
| deleteDraftPaperItem | 479 | 自开(写) | 仅用户（JOIN 改单表后） |
| restoreDraftPaperItem | 518 | 自开(写) | **两侧** |
| migrateAssemblyBasketToDraftPaper | 542 | 自开(写) | **两侧**（组校验） |
| exportDraftPaperPdf | 575 | 自开(写) | **两侧**（draft→userDb；详情→bankDb 经 getQuestionGroupDetail；last_printed_at→userDb） |

`server/my-space/mySpace.mjs` 全部函数 + `mySpaceRoutes.mjs` 的
9 处 `context.openDatabase()` → 全量切 `context.openUserDatabase()`
（my_space 两表 + LEFT JOIN draft_papers 都在用户库内，单连接即可）。
唯一例外：若 my-space 路径有共享表触点（DEV 核对），按统一规则拆。

## 改动清单（预计）

- `server/api.mjs`：`openUserDatabase` + `ensureUserDatabaseShape` +
  `ensureDatabaseShape` 缩水（draft 两表建表迁出）+
  `getDraftSearchContext` 改造 + serverContext。
- `server/draft-paper/draftPaperStore.mjs`：双工厂注入；两侧混查点
  改双连接；JOIN 改写；孤儿容忍。
- `server/draft-paper/draftPaperRoutes.mjs`：开/关两个连接的编排
  （PA MF-3 订正：`server/router/` 下只有 index.mjs，草稿卷路由
  在 draft-paper/ 目录）。
- `server/my-space/mySpace.mjs` + `mySpaceRoutes.mjs`：全部切用户库
  连接；`ensureMySpaceDatabaseShape` 挂到用户库启动路径。
- `data/sql/schema.sql`：删四张表 + 相关索引。
- `scripts/migrate-user-data-split.mjs`：新增。
- `scripts/smoke-c8-my-space.mjs` / `smoke-c8-draft-paper-composer.mjs`：
  注入 `USER_DATA_DB` 临时路径；直开点位改开用户库。
- `scripts/verify-c8-draft-paper-contracts.mjs` /
  `verify-c8-my-space-contracts.mjs`（PA MF-4，防假绿）：
  ①schema.sql 的表存在断言**重定向**到新的单一来源——draft 两表
  →`server/api.mjs` 的 `ensureUserDatabaseShape` 源字符串、
  my_space 两表→`server/my-space/mySpace.mjs` 的
  `ensureMySpaceDatabaseShape` 源字符串；②**新增反向断言**：
  `data/sql/schema.sql` 不再包含这四张表（防漂移复活）；③表体
  正则（如 my-space 的 BLOB 检查）改为对 ensure 源字符串取子串，
  且 match 为 null 必须 FAIL——正则匹配空串恒真的假绿必须修掉；
  ④**双库分离的新断言挂进这两个既有脚本，不新建 verify 文件**。
- 前端草稿卷工作台失效条目最小展示（涉及文件以 DEV 侦察为准，
  禁改 reducer/state 契约——展示层容忍即可）。

## Forbidden

- 不加 `user_id` 列、不做 auth、不做权限（M0-2/3/4 的活）。
- 不引入 ATTACH、连接池、ORM、migration 框架。
- 不动 import-pipeline、paper-import、共享表 schema（除删四张用户表）。
- 不动 PaperSurface / print 渲染契约（导出跳过失效条目在数据层做）。
- 不改 `QUESTION_BANK_DB` 既有语义与默认路径。

## 验收（DEV 自证 + RM 复核）

1. 全新 data 目录：`init-db.sh` 建共享库（无四张用户表）→ 起服 →
   用户库自动出现且四张表齐 → 草稿卷/个人空间 CRUD 正常
   （smoke-c8 两脚本绿）。
2. 迁移脚本：在含旧四表数据的共享库上跑 → 行数一致迁入用户库 →
   共享库四表消失 → 再跑一次幂等拒绝。
3. 孤儿容忍：删掉共享库一个被草稿引用的题组 → 列表/详情不崩、
   条目失效可删、**打印/导出跳过且不崩**（此场景进 smoke 断言，
   挂既有 smoke-c8 脚本，PA MF-5）。
4. `pnpm -C app run verify:all` 全绿（或 PR CI 绿）。
5. 浏览器 QA：草稿卷工作台 + 个人空间基本流回归（找题→加组→
   预览→存 PDF→个人空间可见）+ **找题页 in_current_draft 按钮态**
   （已在草稿里的组，卡片按钮须正确显示，PA MF-2）。

## PA Follow-Up Decisions

PA 判定 APPROVE WITH MUST FIX（pa.md，2026-07-03），5 条 Must Fix
全部采纳并压缩入本文件：

- MF-1（store 双连接契约）→ 新增「store 连接改造清单」节，逐方法
  锁归属 + 统一开关/readOnly 规则。
- MF-2（selectQuestionGroupCards 扇出）→ 设计决策 5 锁新签名 +
  默认空上下文语义 + 仅主搜索路径取真实 draftContext；Browser QA
  加按钮态必测。
- MF-3（路由文件坐标错）→ 改动清单订正为
  `server/draft-paper/draftPaperRoutes.mjs`，补 mySpaceRoutes 切换。
- MF-4（verify 假绿）→ 改动清单 verify 条目写死断言重定向 + 反向
  断言 + null-match 必 FAIL。
- MF-5（孤儿过滤点）→ 设计决策 8 锁「写侧守卫保留/读侧容忍」+
  统一过滤点在 export 输入构建层；验收 3 加 smoke。

Should Watch 采纳情况：SW-1（迁移脚本 DROP 前行数二次核对断言）
采纳，进设计决策 6 的 DEV 实现要求；SW-2（用户库 pragma）已进
设计决策 3；SW-3 确认无阻；SW-4（用户库无版本表技术债）挂账在本节 + pa.md，
M0-2（users 表进用户库）开刀时必须复评是否引入版本表，本刀不做。
