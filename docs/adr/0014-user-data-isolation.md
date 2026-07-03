# ADR-0014: 用户数据隔离的 user_id 设计（M0-4）

- Status: Proposed（随 M0-4 cut 合并即 Accepted）
- Date: 2026-07-03
- 上游：`docs/cuts/launch-roadmap/roadmap.md` 决策 #2（草稿卷/个人空间
  按用户私有）、ADR-0011（两库分离）、ADR-0012 §5（user_version 锚点）、
  ADR-0013（开放模式=owner 视角、单点翻译惯例）

## 背景

M0-2/M0-3 后，`context.session.userId` 在每个受控请求里就位，但用户库
三张顶层表（`draft_papers` / `my_space_folders` / `my_space_artifacts`）
无任何 user 维度：任何登录用户可按 id 读写别人的草稿、下载别人的 PDF；
「当前草稿」还是数据库级全局单例（部分唯一索引强制全表最多一行
current），第二个用户置 current 会直接 UNIQUE 冲突。

## 决策

### 1. 开放模式的数据归属 = 哨兵 `'local'`，不用 NULL、不造第三形态

`user_id TEXT NOT NULL DEFAULT 'local'`。开放模式（users 表空）读写
恒为 `'local'`；强制模式用 `session.userId`。

- 对齐 ADR-0013：开放模式的契约是「与登录刀之前行为完全一致」。
  数据侧的等价表述是：开放模式只有一个隐含用户（实践中即 owner 本地
  策展），`'local'` 就是这个隐含用户的名字。产品形态数仍是 2。
- 不用 NULL 的硬理由：SQLite 唯一索引里 NULL 彼此不相等——
  `UNIQUE(user_id, name)`（文件夹按人唯一）和按人 current 部分唯一
  索引对 NULL 行全部失效；哨兵让全部查询保持单一口径
  `WHERE user_id = ?`。
- 碰撞面：`users.id` 生成格式为 `user-<uuid>`，永不等于 `'local'`；
  `createUser` 另加显式拒绝守卫。

**已知取舍（报 owner 追认）**：同一个库从开放模式建号切到强制模式后，
`'local'` 行不会自动划给任何账号（新账号视角是空库）。现实中服务器
库生来就是「先建号再暴露」（M1 检查单），本地库永远开放模式，正常
路径不会踩到；真要划转，手工一条
`UPDATE ... SET user_id = <owner-id> WHERE user_id = 'local'` 即可。
不做自动认领——「建号」隐式搬动存量数据比显式 UPDATE 更容易出事故。

### 2. 翻译点唯一：resolveDataUserId(context)

`authMode === 'enforced'` → `session.userId`（session 缺失即抛错——
这些路由不在白名单，缺 session 是 bug 不是状态）；否则 `'local'`。
只在路由 handler / api.mjs 顶层调用；store 与深层服务收显式必填
`userId` 参数，禁止自己摸 context。与 ADR-0013 的 `isOwnerView`
单点翻译同构：语义翻译只发生在一处，消费方拿值。

### 3. 隔离的粒度：顶层表加列，子表经父表圈定

`draft_paper_items` 不加 user_id：侦察证实其全部 SQL 恒带
`draft_paper_id`，规则改为「任何以 draftPaperId 为入口的操作必须先经
父表按 `(id, user_id)` 命中」。少一列冗余就少一类「父子 user_id 不
一致」的不变量维护。

### 4. owner 无数据特权

owner 的草稿/个人空间同样按人隔离。roadmap 决策 #2 的权限不对称在
**共享馆写权限**（M0-3 的 ownerOnly 闸）；私有数据上 owner 与 member
同权，不给「owner 可以看同事草稿」留口子——那是社交灾难不是功能。

### 5. 迁移：ensure 内首个条件分支，user_version 2→3

ADR-0012 §5 预留的机制首次落地：`version < 3`（禁 `=== 2`）圈住
迁移块，块内再按 `PRAGMA table_info` 做列存在性守卫——因为 fresh 库
的 user_version 在建表时也是 0，版本号单独不足以区分「旧库要迁」与
「新库已是新形」。存量行由 `ADD COLUMN ... DEFAULT 'local'` 自动
回填（现实中不存在强制模式多用户的 v2 库，无归属错并风险）。
`my_space_folders` 的内联全局 UNIQUE 改按人唯一必须重建表（SQLite
不能改内联约束），走官方 12 步的最小版 + `foreign_key_check` 断言。
原「全局只留最新一条 current」的启动期去重 UPDATE 挪进迁移分支
一次性执行——它的全局语义在多用户下是破坏性的（会清别人的
current），不能再每次启动跑。

### 6. 下载路由补归属校验

`GET /user-space/files/:id.pdf` 此前只靠 UUID 不可猜测性；补
artifact 行 `user_id` 校验，不命中回 404（与不存在同响应，不泄露
存在性）。文件目录保持单一平铺（DB 行校验已是强制门；per-user
子目录牵动存量文件搬迁，收益不抵）。

## 排除项

- 不做 per-user 文件子目录、不动 `recentDraftPdfExports` 缓存键
  （上游圈人后 404 先于缓存，无泄漏路径）。
- 不做资源级共享/协作（「把草稿卷分享给同事」是 M2 反馈后的事）。
- assembly-basket-v1 localStorage 换账号残留不处理（只含共享题组
  id，无隐私载荷；熟人圈共机属边缘）——挂 SW。

## 后果

- M0-5（AI 日限额）与本刀无 schema 交集，M0 收官前用户库定格 v3。
- 新写用户表查询必须带 user_id 圈——`scripts/verify-user-scope.mjs`
  的两用户隔离断言是防线；漏圈新查询时 CR 与 verify 惯例兜底。
- owner 追认清单新增一条：`'local'` 存量行不自动认领（见决策 1）。
