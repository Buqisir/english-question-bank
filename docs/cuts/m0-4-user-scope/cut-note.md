# M0-4 用户数据隔离 — Cut Note

- Cut: large（schema + 数据契约 + 迁移）；PR #240；ADR-0014（合并即 Accepted）
- 流程：侦察×2（Sonnet）→ plan+ADR → PA（Opus，APPROVE w/ 3 MF，全采纳）
  → DEV（Sonnet high，7 commits）→ CR（Opus，APPROVE 0 MF）→ PM 浏览器
  QA（真库两账号）→ RM。

## 交付

- 三张顶层表 `user_id TEXT NOT NULL DEFAULT 'local'`；子表经父表
  `(id, user_id)` 圈定。开放模式=哨兵 `'local'`，行为与 M0-3 前逐字节
  一致（smoke 零改动继续绿）。
- `user_version` 2→3 条件迁移（`< 3` + 列存在性双守卫）：ADD COLUMN
  自动回填、current 唯一索引改按人复合、`my_space_folders` 重建表改
  `UNIQUE(user_id, name)`（PRAGMA/事务时序按 PA MF-2 锁死）、原全局
  去重 UPDATE 挪入迁移分支（多用户下它是破坏性的）。
- 17 条草稿卷/个人空间路由 + AI 搜索链路（semantic-search / steward，
  PA MF-1）按 `resolveDataUserId(context)` 单点翻译圈范围；
  `/user-space/files/:id.pdf` 补归属校验（404 不泄露存在性）。
- 新增 `scripts/verify-user-scope.mjs`（50 断言，hermetic 4 路径 env）
  挂 verify-ci；c8 两静态 verify 升级到新契约。

## QA 证据（真库，2026-07-03）

- 真库迁移当场兑现：owner 真实 user-data.sqlite v2→v3，存量草稿
  「0702 英语草稿卷」回填 `'local'`，零手工。
- 两账号矩阵全绿：B 越权 GET/PATCH/print-html/借导出（MF-3）全 404；
  同名文件夹跨用户 201、同用户 400；双 current 并存（复合索引）；
  找题页与 AI 语义搜索/AI 管家按钮态互不串（MF-1），payload 中对方
  draft id 零泄漏；owner 无数据特权（A 拿 B 的 id 同样 404）。
- 退回开放模式：清 users 后无登录门、owner 草稿 2 组原样。
- QA 账号已清、真库已备份（user-data.sqlite.bak.m0-4-qa.*）。
- QA 前按教训核对进程新鲜度——**又抓到一只孤儿**（DEV 会话残留的
  8787 API，起点在 DEV 中途），杀掉重起后才开测。

## 决策与挂账

- owner 追认（非阻塞，累计）：`'local'` 存量行建号后不自动认领
  （ADR-0014 决策 1，手工 UPDATE 兜底）。
- SW 挂账：assembly-basket localStorage 换账号残留（无隐私载荷）；
  userSpaceFilesDir 平铺目录不做 per-user 子目录；listMySpace JOIN
  两侧圈已做显式皮带（PA SW-3）。
- M0-5 硬输入：新增用户表查询必须带 user_id 圈（CR Follow-up Gate）。

## 教训

- **孤儿进程教训第二次应验**：DEV 子会话也会留孤儿 API，QA 前
  `lsof + ps -o lstart` 已是必做，不分谁起的服务。
- vite `--strictPort` 撞别的项目端口时，QA 起服要显式换 PORT
  （本次 5173 被 mp-data-console 占用，QA 走 5174）。
- preview 里 React 受控表单要用原生 setter + input 事件才提交得动；
  preview_click 对视口外元素静默落空（老教训再次应验）。

## 成本

侦察 ~19万 + PA ~8.8万 + DEV ~42万 + CR ~12.3万 ≈ **82万 tok**
（比 M0-3 的 ~70万略高，DEV 长跑 32 分钟含全套 verify 自证）。
