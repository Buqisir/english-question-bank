# M0-2 邀请制登录 — plan.md（DEV 执行契约）

cut size: large; touches schema, data contract, product boundary: yes
（auth 数据进用户库 + 全 API 挂闸 + 新登录页 = 数据契约与产品边界双碰）

权威输入：`docs/cuts/launch-roadmap/roadmap.md` 决策 #4（邀请制：owner
手工建账号，argon2 密码 + cookie session + 登录页，无自助注册/找回流/
邮件依赖）。设计裁决记录在 ADR-0012。

## 目标

1. `user-data.sqlite` 新增 `users` / `sessions` 表（含 role 字段，M0-3
   权限刀直接用，不再动 schema）。
2. 服务端登录/登出/会话查询三个端点 + 全 API 统一鉴权闸。
3. 前端启动期登录门 + 登录页 + topbar 用户信息/退出。
4. owner CLI 建号/重置密码/停用工具。
5. SW-4 复评落地：`PRAGMA user_version` 作为用户库 schema 版本标记
   （ADR-0012 决策 5）。

## 侦察结论（已抽验 file:line，2026-07-03）

- 原生 `node:http`，无框架无中间件链。主 handler `server/api.mjs:4096`，
  OPTIONS 特判 :4102，静态 `/paper-assets/` 特判 :4110，
  `runRoutes(serverRoutes, ...)` :4115，硬编码 verify-trace GET :4119，
  兜底 404 :4147。
- 路由 = 纯数据数组：各域 `createXxxRoutes()` 工厂产
  `defineRoute(method, regex, handle)`（`server/router/index.mjs:1-31`），
  在 `server/api.mjs:475-489` 汇总。
- `sendJson`（`server/api.mjs:579-588`）内嵌 CORS 头，origin 硬编码
  `http://127.0.0.1:5173`，**无 `access-control-allow-credentials`**。
- 用户库：`openUserDatabase` `server/api.mjs:643-649`（open-per-op，
  `readOnly` 时**不**跑 ensure）；`ensureUserDatabaseShape`
  `server/api.mjs:653-694`（CREATE IF NOT EXISTS，末尾调
  `ensureMySpaceDatabaseShape`，前例：子域 shape 抽独立模块再挂入）。
  启动时 `server/api.mjs:4156` 会跑一次写连接 ensure。
- 前端入口 `app/src/main.tsx:9-44`：启动期读一次 URL 决定顶层组件，
  是唯一"总路口"。无 react-router。API 调用 = 各 `services/*.ts` 原生
  fetch + `app/src/services/httpClient.ts:14-32` 的 apiPath（本地走
  vite proxy 同源）。无 401 集中处理点。
- vite proxy：`/api` `/paper-assets` `/user-space` →
  `127.0.0.1:8787`（`app/vite.config.ts:26-30`）。dev 前后端**同源**。
- `.env` 走 `node --env-file-if-exists`（`scripts/dev.sh:17-19`），无
  dotenv。现有唯一密钥 `DEEPSEEK_API_KEY`。
- 依赖：server 无 express/cookie/哈希库（`server/package.json`）。
  Node v25 本机（`node:sqlite` 要求 22+）。
- smoke/verify 脚本各自 spawn server + 临时 DB（如
  `scripts/smoke-c8-my-space.mjs:35-42`），**无共享启动器**——鉴权闸
  设计必须不破坏这批脚本（见决策 1）。
- 全仓无任何 user_id/鉴权痕迹；`sessions` 校验若走只读连接，依赖
  启动期 ensure 已建表（`server/api.mjs:647` 只读不 ensure 的陷阱）。

## 设计决策（DEV 不得偏离；改动先回 PM）

### 决策 1：bootstrap 开放模式（鉴权闸的开关 = users 表是否非空）

- `users` 表**为空** → 开放模式：行为与今天完全一致，不拦任何请求；
  `GET /api/auth/me` 返回 `{ authRequired: false, user: null }`；
  服务器启动日志打印醒目警告
  `[auth] users 表为空，登录未启用 — 运行 node scripts/create-user.mjs 创建账号`。
- `users` 表**非空** → 强制模式：除公开路径外全部请求要有效 session，
  否则 `401 { error: 'not_authenticated' }`。
- 效果：全部存量 smoke/verify（临时空库）零改动继续绿；owner 合并后
  本地照常可用，跑一次 create-user 即启用登录；M1 部署检查单必须包含
  「先建号再暴露公网」（记入 ADR-0012 风险节）。
- 公开路径白名单（强制模式下仍放行）：`OPTIONS` 预检、
  `POST /api/auth/login`、`GET /api/auth/me`（未登录时它自己回 401，
  但不算"拦"——前端靠它探测登录态）、`GET /api/health`（正则精确
  `^\/api\/health$`，M1 uptime 探活必须免鉴权，PA MF-2）。
  **其余一切请求都拦**，包括 `/paper-assets/*` 静态特判、
  `/user-space/*.pdf` 路由（在 mySpaceRoutes 内，闸在 runRoutes 前
  天然覆盖）与硬编码 verify-trace 路由。

### 决策 2：闸的位置 = 主 handler 单点，不进各路由工厂

- 在 `server/api.mjs` 主 handler 内、OPTIONS 特判之后、静态特判与
  `runRoutes` 之前，插入单点闸：
  1. 白名单路径直接放行；
  2. 只读连接开用户库（启动期 ensure 已保证表存在），查
     users 非空与否；空 → 放行（开放模式）；
  3. 解析 cookie 中的 session token → sha256 → 查
     `sessions JOIN users`（未过期 + `users.status='active'`）；
     无效 → `sendJson(response, 401, { error: 'not_authenticated' })`；
  4. 有效 → 把 `{ session: { userId, username, role } }` 并进
     runRoutes 的 context（`{ ...serverContext, session }`），
     M0-3 权限刀直接消费 `context.session.role`。
- 不引入中间件框架，不改 `server/router/index.mjs` 的机制。

### 决策 3：session = 随机不可伪造 token + 服务端哈希存储（非 HMAC 签名）

- 登录成功：`crypto.randomBytes(32)` → base64url 为原始 token；DB 存
  `sha256(token)`（防 DB 泄露即会话被盗）；Set-Cookie:
  `eqb_session=<token>; HttpOnly; SameSite=Lax; Path=/`（`Secure`
  仅在请求为 https 时附加——M1 上 HTTPS 后自动生效）。
- TTL 30 天，滑动续期：校验时剩余 < 15 天则更新 `expires_at`
  （仅此分支开写连接，其余校验走只读连接）。
- 登出：删 session 行 + 清 cookie。
- 与 roadmap「签名 cookie」的措辞差异：256-bit 随机 token 本身不可
  伪造，HMAC 签名不增加安全性反而引入密钥管理（SESSION_SECRET 轮换、
  部署注入）。**零新增 env 变量**。此偏差报 owner 追认（ADR-0012
  决策 3 有完整论证）。
- 密码哈希：`argon2` npm 包（argon2id 默认参数），照 roadmap 原文。
  server/package.json 新增该依赖。若目标机安装原生绑定失败，回退
  `node:crypto` scrypt 是备案，但**本刀不实现双路径**。

### 决策 4：schema（全部进 `server/auth/auth.mjs`，照 mySpace 模块前例）

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
```

- `server/auth/auth.mjs`（新）：`ensureAuthDatabaseShape(db)` +
  `hashPassword` / `verifyPassword` / `createSession` /
  `readSessionFromRequest` / `destroySession` / `countUsers` 等纯函数，
  从 `ensureUserDatabaseShape`（`server/api.mjs:693` 一带）挂入，
  模式照 `ensureMySpaceDatabaseShape` 前例。
- 时间戳格式沿用现有表惯例（看 draft_papers 的 created_at 写法，
  保持一致）。

### 决策 5：SW-4 落地 = `PRAGMA user_version`，不引 migration 框架

- `ensureUserDatabaseShape` 末尾执行 `PRAGMA user_version = 2`。
- 版本口径（PA MF-1 修正）：**0 = M0-2 之前（含 M0-1 及更早，全仓
  从未写过 user_version，真实库恒为 0）；2 = M0-2 起（含 auth 表）。
  「1」未曾发行，永久留空**——真实库会从 0 直接跳 2。
- **未来所有条件迁移必须用 `version < N` 比较，禁止 `version === N`**
  （幂等 ensure 模型下相等比较是死分支陷阱）。
- **本刀不引任何条件迁移分支**：CREATE IF NOT EXISTS 已幂等，version
  仅作未来刀（M0-4 加列）的锚点。DEV 不得加"先判版本再建表"逻辑。
- ADR-0012 决策 5 记录裁决理由，SW-4 挂账就此结清。

### 决策 6：服务端路由 = `server/auth/authRoutes.mjs` 工厂

- `createAuthRoutes()` 返回三条：
  - `POST /api/auth/login`：body `{ username, password }`；成功
    → Set-Cookie + `{ user: { id, username, role } }`；失败统一
    `401 { error: 'invalid_credentials' }`（不区分用户不存在/密码错，
    防枚举）。
  - `POST /api/auth/logout`：删 session + 过期 cookie + `{ ok: true }`。
  - `GET /api/auth/me`：开放模式 `{ authRequired: false, user: null }`；
    强制模式有会话 `{ authRequired: true, user: {...} }`，无会话 401。
- 挂进 `server/api.mjs:475-489` 的 serverRoutes 汇总。
- Set-Cookie 需要 `sendJson` 之外的头支持：允许传额外 headers 或在
  auth 路由内直接 `writeHead`——选一种，保持 `sendJson` 现有调用方
  零变化。同时 `sendJson` 固定头补
  `'access-control-allow-credentials': 'true'`（origin 已是固定值，
  合法组合）。

### 决策 7：前端门 = main.tsx 总路口 + 独立 LoginPage

- 新 `app/src/auth/session.ts`：`fetchMe()` / `login()` / `logout()`，
  走 `apiPath`，fetch 默认同源带 cookie，无需 credentials 配置
  （dev 经 vite proxy 同源；跨源场景明确不支持，M1 部署必须同源，
  记 ADR-0012）。
- 新 `app/src/auth/AuthGate.tsx`：挂载时 `fetchMe()`；
  loading → 极简占位；`authRequired && !user` → 渲染 LoginPage；
  否则渲染 children 并通过 context/prop 提供当前 user。
- 挂载点事实纠正（PA MF-3）：`main.tsx` 的 `RootComponent`
  （`main.tsx:33-38`）只有**两个**分支——`reading-analysis` →
  `ReadingAnalysisDemoRoute`，否则 `App`（paper-intelligence 不是
  独立顶层组件，它在 App 外壳内由 piRoute prop 驱动）。AuthGate
  包裹点锁定为 `createRoot().render` 处包住 `<RootComponent />`
  一处，两个分支自动全在门后。**`?view=reading-analysis` 在强制
  模式下未登录必须看到登录页而非内容**——这是安全边界，验收显式测。
- 新 `app/src/auth/LoginPage.tsx`：居中卡片，「英语题库工作台」标题 +
  用户名/密码/登录按钮 + 错误提示（"用户名或密码不正确"）。视觉跟
  现有 app 气质走（读现有 CSS 变量/字体，不引新依赖）。登录成功后
  `window.location.reload()`（最简，避免状态穿引）。
- topbar（`app/src/App.tsx:3294-3320` 一带）：登录启用时显示用户名 +
  「退出」按钮（logout 后 reload）；开放模式下**完全不渲染**任何
  auth UI（零视觉变化）。App.tsx 是灰区文件：仅此 display-only 追加，
  不碰 reducer/状态契约/数据获取。
- 登录页照常走浏览器密码管理器（`autocomplete="username"` /
  `"current-password"`），这是无找回流下 owner 圈层的实际记忆方案。
- 会话中途过期：不做集中 401 拦截（无统一 client 层，扇出不可控）。
  个位数用户 + 30 天滑动续期，出现时用户刷新页面即回登录页。记
  ADR-0012 已知取舍。

### 决策 8：CLI = `scripts/create-user.mjs`（单脚本三模式）

- 照 `scripts/migrate-user-data-split.mjs` 风格（头注释引 roadmap
  决策 #4 + ADR-0012、`fail()` 设 exitCode、步骤打印、try/finally
  close）。复用 `server/auth/auth.mjs` 导出的哈希/ensure 函数，
  不重复 schema。
- 模式：
  - 建号：`node scripts/create-user.mjs --username W [--role owner|member]`
    （默认 member）；密码不传则 `crypto.randomBytes(9).toString('base64url')`
    生成并**打印一次**，不落盘。
  - 重置：`--reset-password --username W`（无找回流的替代：owner 在
    服务器上跑）。重置同时清该用户全部 sessions。
  - 停用/启用：`--disable / --enable --username W`。停用即时生效
    （闸的 JOIN 条件含 `status='active'`）。

## 改动清单（预计）

- 新：`server/auth/auth.mjs`、`server/auth/authRoutes.mjs`、
  `app/src/auth/AuthGate.tsx`、`app/src/auth/LoginPage.tsx`、
  `app/src/auth/session.ts`、`scripts/create-user.mjs`、
  `scripts/verify-auth-gate.mjs`、`docs/adr/0012-*.md`。
- 改：`server/api.mjs`（ensure 挂入 + 闸 + serverRoutes 汇总 +
  sendJson credentials 头 + user_version）、`server/package.json`
  **+ `server/package-lock.json` 同刀更新**（PA MF-4：server 用
  npm 非 pnpm，CI 跑 `npm ci` 严格校验 lockfile，漏更新则 CI 装
  依赖直接红；用 `npm install argon2` 在 server/ 下生成锁）、
  `app/src/main.tsx`（AuthGate 包裹）、`app/src/App.tsx`
  （topbar 用户名/退出，display-only）、`scripts/verify-ci.mjs` +
  `scripts/README.md`（注册新 verify，housekeeping 闸要求同刀内完成）、
  必要的 CSS（登录页样式，新文件或既有全局表，跟现状惯例走）。

## Forbidden

- 不做权限差异（owner/member 行为完全一致，M0-3 的活）。
- 不给业务表加 user_id、不改任何业务查询的圈定（M0-4）。
- 不做自助注册、找回流、邮件、验证码、限流、审计日志。
- 不引 migration 框架、不引 express/koa、不引前端路由库。
- 不改 `server/router/index.mjs` 机制、不动共享题库
  `question-bank.sqlite` 任何 schema。
- 不改各 services/*.ts 的错误处理扇面（无集中 401 拦截）。
- 不动 print/export、PaperSurface、paper-assets 生成链路。

## 验收（DEV 自证 + RM 复核）

1. `scripts/verify-auth-gate.mjs`（新，进 verify-ci）：临时用户库全流程
   —— (a) 空库开放模式：任选一个现有 API（如 `/api/draft-papers`）
   200 且 `/api/auth/me` 回 `authRequired:false`；(b) 用 CLI 真跑
   `create-user`（child process，验证脚本本体）；(c) 强制模式：无
   cookie 401、错密码 401、登录成功拿 cookie 后同 API 200、
   `/paper-assets/` 无 cookie 401、**`GET /api/health` 无 cookie 仍
   200（PA MF-2）**；(d) logout 后旧 cookie 401；(e) `--disable` 后
   该用户即时 401。**断言用状态码 + 响应体字段，不用正则匹配空串
   可通过的写法**（M0-1 MF-4 假绿教训）。
2. 存量套件：`pnpm -C app run verify:all` 全绿（重点证明 bootstrap
   开放模式没有破坏任何现有 smoke/verify——它们必须零改动通过；若
   有任何一个需要改脚本才能过，停下来回报 PM，不许静默改脚本）。
   argon2 装完后 `npm ci`（server/ 下）必须绿（lockfile 已同步，
   PA MF-4）。
3. 浏览器 QA（PM 做）：dev 起服 → 开放模式一切照旧 → create-user →
   刷新被踢到登录页 → 登录进入工作台 → topbar 显示用户名 → 退出回
   登录页 → 错密码有人话错误提示 → 第二个浏览器 profile 未登录直接
   看到登录页 → **未登录直访 `?view=reading-analysis` 看到登录页
   而非内容（PA MF-3 安全边界）**。
4. `node scripts/verify-cut-artifacts.mjs docs/cuts/m0-2-invite-login large`
   过（plan/pa/cr/cut-note 齐）。

## PA Follow-Up Decisions

PA 审阅（pa.md，APPROVE WITH MUST FIX，0 未决 PO 决策）→ PM 全部
采纳压缩回本 plan：

- **MF-1 采纳**：决策 5 版本口径改 0/2 两代（「1」永久留空）、明文
  `< N` 禁 `=== N`、本刀不引条件迁移分支。ADR-0012 决策 5 同步订正。
- **MF-2 采纳**：决策 1 白名单加 `GET /api/health`（精确正则）；
  验收 1(c) 加 health 无 cookie 200 断言。
- **MF-3 采纳**：决策 7 改述为两顶层分支、AuthGate 锁定
  `createRoot().render` 处包 `RootComponent`；验收 3 加
  reading-analysis 门后 QA。
- **MF-4 采纳**：改动清单补 `server/package-lock.json` 同刀更新
  （server=npm）；验收 2 加 `npm ci` 绿。
- SW-1~SW-6 记录在案不阻塞；SW-5 措辞已在决策 1 顺带订正
  （`/user-space/*.pdf` 是路由非静态特判）。
- HMAC 偏差经 PA 判定为**实现细化非决策变更**（pa.md「SPEC 一致性
  判断」节），报 owner 追认即可，非前置放行门。
