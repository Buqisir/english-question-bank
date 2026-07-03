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
3. **连接层**：`api.mjs` 新增 `openUserDatabase({ readOnly })` 工厂，
   与 `openDatabase` 并列。`serverContext` 挂 `openUserDatabase`；
   `createDraftPaperStore` 注入两个工厂；路由层负责开/关自己用到的
   连接（沿用现开现关模式，不引入连接池/ATTACH——决策 7 定的是
   应用层拼装，不走 ATTACH 跨库 SQL）。
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
   影响删除语义）。`getDraftSearchContext` 改为调用方先从用户库
   取草稿上下文（当前草稿 id + 组 id 集合），再传参进共享库查询
   函数——`selectQuestionGroupCards` 不再自己摸用户表。
6. **一次性迁移**：新脚本 `scripts/migrate-user-data-split.mjs`：
   ①先备份共享库文件（复制 `.bak.<timestamp>`）；②建/确保用户库
   shape；③把共享库中四张表的行原样搬进用户库（幂等：目标表非空
   则拒绝重复迁移）；④从共享库 DROP 四张表。启动时的
   `ensureDatabaseShape()` **不做自动迁移、不 DROP**——若检测到
   共享库仍有用户表则打印警告提示跑迁移脚本。owner 本机跑一次；
   全新环境（含未来服务器）init-db.sh 建的共享库本就没有这四张表。
7. **paper_sets / paper_items / export_jobs 不动**：路线图决策只圈了
   四张表；这些表的归属留给后续刀（如需要）。import-pipeline 脚本
   只碰共享表，路径口径不变，不改。

## 改动清单（预计）

- `server/api.mjs`：`openUserDatabase` + `ensureUserDatabaseShape` +
  `ensureDatabaseShape` 缩水（draft 两表建表迁出）+
  `getDraftSearchContext` 改造 + serverContext。
- `server/draft-paper/draftPaperStore.mjs`：双工厂注入；两侧混查点
  改双连接；JOIN 改写；孤儿容忍。
- `server/router/draftPaperRoutes.mjs`（或现役路由文件）：开/关两个
  连接的编排。
- `server/my-space/mySpace.mjs` + `mySpaceRoutes.mjs`：全部切用户库
  连接；`ensureMySpaceDatabaseShape` 挂到用户库启动路径。
- `data/sql/schema.sql`：删四张表 + 相关索引。
- `scripts/migrate-user-data-split.mjs`：新增。
- `scripts/smoke-c8-my-space.mjs` / `smoke-c8-draft-paper-composer.mjs`：
  注入 `USER_DATA_DB` 临时路径；直开点位改开用户库。
- `scripts/verify-c8-draft-paper-contracts.mjs` /
  `verify-c8-my-space-contracts.mjs`：正则断言指向新位置；**双库
  分离的新断言挂进这两个既有脚本，不新建 verify 文件**。
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
   条目失效可删、打印跳过。
4. `pnpm -C app run verify:all` 全绿（或 PR CI 绿）。
5. 浏览器 QA：草稿卷工作台 + 个人空间基本流回归（找题→加组→
   预览→存 PDF→个人空间可见）。

## PA Follow-Up Decisions

（PA 审后由 PM 压缩回填）
