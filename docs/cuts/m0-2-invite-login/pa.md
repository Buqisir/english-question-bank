# M0-2 邀请制登录 — PA 审阅（pa.md）

审阅人：PA（小川），全新独立上下文
分支：`cut/m0-2-invite-login` @ c5539bf
审阅级别：L4（用户库新数据契约 + 全 API 挂闸 + 用户可见登录门 + 迁移锚点）
方法：plan 全部 file:line 坐标逐一 sed/grep 亲验；ADR-0012 / roadmap 决策 #4 /
M0-1 SW-4 交叉核对；argon2 依赖与 CI 装法核实。

---

## Verdict

**APPROVE WITH MUST FIX**

方向正确（roadmap 决策 #4 的忠实落地，切法与仓库现状契合），坐标准确率高，
数据契约基本清晰。但有 4 条阻塞项必须在 DEV 前压回 plan：user_version 追溯口径
的 `=== 1` 陷阱、公开路径白名单漏了健康探活口（M1 uptime 会被闸打死）、
「三顶层视图」的事实错误、以及 argon2 → server lockfile 的同刀更新纪律缺失。
其余为 Should Watch。**补齐 4 条 Must Fix 后 DEV-ready。**

roadmap 决策 #4 与 plan 决策 3（放弃 HMAC）的偏差，判定为**实现细化而非决策
变更**（论证见 SPEC 一致性判断节），处置正确（报 owner 追认 + ADR 记全论证），
不构成 `SPEC CONTRADICTS`。

---

## Product Principle

装第一道登录门，不动任何业务行为。个位数熟人圈、owner 手工建号、无邮件依赖。
教师动作层面：owner 合并后本地无缝（跑一次 create-user 才启用登录）；member/
owner 行为本刀完全一致（权限差异是 M0-3）。产品边界干净：不碰 PaperSurface、
不碰打印/导出、不碰共享题库 schema。

## Exact Architecture Model（已亲验）

- 主 handler `server/api.mjs:4096` createServer；OPTIONS 特判 `:4102`；
  `/paper-assets/` 静态特判 `:4110`；`runRoutes(serverRoutes)` `:4115`；
  硬编码 verify-trace GET `:4119`；兜底 404 `:4147`。**全部精确。**
- `sendJson` `:579-588`，CORS origin 硬编码 `http://127.0.0.1:5173`，
  确无 `access-control-allow-credentials`。**精确。**
- `openUserDatabase` `:643-649`（`readOnly` 时不 ensure，只 `readOnly:false`
  才 `ensureUserDatabaseShape`）；`ensureUserDatabaseShape` `:653`，末尾调
  `ensureMySpaceDatabaseShape` `:693`。**精确。**
- 启动期 ensure：`:4155 ensureDatabaseShape()` → `:4156
  openUserDatabase({readOnly:false}).close()`（跑写连接 ensure，建表 +
  建文件），**在 `server.listen` 之前**。故运行中的服务器里，闸的只读连接
  永远能查到已建的表 —— 决策 2 步骤 2 的前提成立。**精确。**
- 路由机制 `server/router/index.mjs:1-31`（defineRoute 纯数据 + runRoutes
  线性匹配）；serverRoutes 汇总 `server/api.mjs:475-489`。**精确。**
- 前端入口 `app/src/main.tsx`（1-48 行），boot 一次读 URL；`RootComponent`
  在 `:33-38`，`createRoot().render` 在 `:44-48`。无 react-router。**基本精确
  （见 MF-3 关于「三视图」的事实纠正）。**
- vite proxy `/api` `/paper-assets` `/user-space` → 8787
  （`app/vite.config.ts:26-30`），dev 同源。**精确。**
- 包管理：**app = pnpm**（CI `pnpm install --frozen-lockfile`，
  corepack pnpm@10.28.1）；**server = npm**（CI `npm ci`，
  `server/package-lock.json` 已提交 322KB）。CI = ubuntu-latest / Node 24
  （`.github/workflows/verify.yml`）。**plan 未点名 server 用 npm/需更新
  lockfile —— 见 MF-4。**

---

## Must Fix Before DEV

### MF-1 — user_version 追溯口径的 `=== 1` 陷阱（决策 5 / ADR-0012 决策 5）

亲验事实：全仓今天**没有任何一处写 `user_version`**（`server/api.mjs` 只有
`foreign_keys`、`table_info` 的 PRAGMA；`scripts/migrate-user-data-split.mjs`
也不写）。因此**所有现存的 M0-1 用户库 `user_version` 恒为 0**。plan 决策 5
让 ensure 末尾无条件写 `user_version = 2`，追溯口径标注「1 = M0-1 shape」。

风险：版本「1」是一个**任何数据库里都不会物理存在的历史标签**。M0-1 库从 0
直接跳到 2，永远读不到 1。未来 M0-4 作者若照口径写
`if (version === 1) addUserIdColumn()`，对真实的 M0-1 库（version=0）**永不触
发**，是一颗埋进迁移逻辑的哑弹。这正是「短寿/歧义数据契约」型返工。

处置（plan.md + ADR-0012 决策 5 都要改）：
- 口径改为 `0 = M0-2 之前（含 M0-1 及更早，一律视为 0）；2 = M0-2 起（含
  auth 表）`。**删掉从未存在过的「1」**（或明确标注「1 未曾发行、留空」）。
- 明文约束未来所有条件迁移**必须用 `version < N` 比较，禁止 `version === N`**
  （幂等 ensure 模型下相等比较不安全）。
- 既然无条件写 2、且 M0-1 库当前是 0，DEV 不需要「先判 0 再补 auth 表」的
  条件逻辑（CREATE IF NOT EXISTS 已幂等）——但 plan 要写清「本刀不引条件
  迁移，version 仅作未来锚点」，避免 DEV 自作聪明加分支。

### MF-2 — 公开路径白名单漏了健康探活口，M1 uptime 会被闸打死

亲验事实：`/api/health` 是 `runRoutes` 内的路由（`server/api.mjs:148`，
h1Routes），**闸在 runRoutes 之前**。plan 决策 1 白名单只有 OPTIONS /
`POST /api/auth/login` / `GET /api/auth/me`，并明写「其余一切请求都拦」。
故**强制模式下 `GET /api/health` 会被 401**。

风险：roadmap M1「最小可观测：错误日志落盘 + **uptime 探活**」。健康检查探
活器（云监控/反代/负载均衡）拿不到 200，会误报服务宕机。健康口不泄露任何
数据，本就该无鉴权。存量 smoke 用空库（开放模式）掩盖了这个洞——它在部署
的强制模式下才暴露，属于「plan 没想到的洞」。

处置（plan.md 决策 1 白名单 + ADR-0012 决策 2）：
- 把 `GET /api/health` 加入公开路径白名单（正则精确匹配 `^/api/health$`，
  勿宽松前缀）。
- verify-auth-gate 增断言：强制模式下无 cookie `GET /api/health` 仍 200。

### MF-3 — 「三顶层视图」是事实错误，AuthGate 包裹的实际结构要写准

亲验事实：`main.tsx` 的 `RootComponent`（`:33-38`）只有**两个**分支：
`raRoute.kind === 'reading-analysis'` → `<ReadingAnalysisDemoRoute/>`，否则
`<App piRoute={piRoute}/>`。**没有独立的 paper-intelligence 顶层组件**——PI
预览是在 App 外壳里由 `piRoute` prop 驱动渲染的。plan 决策 7 与本刀 prompt 都
说「三个顶层视图（App / reading-analysis / paper-intelligence）」，与代码不符。

风险：DEV 若照「三视图」去找第三个挂载点会扑空，或误以为 PI 需要单独包
AuthGate。实际只需在 `RootComponent` 外层（或 `createRoot().render` 内）包一层
`<AuthGate>`，两个分支自动受控，PI 因在 App 之下天然覆盖。事实说不准 = 挂载
点说不准 = 返工种子。

处置（plan.md 决策 7）：
- 改述为「两个顶层分支（reading-analysis / App，PI 在 App 外壳内）」；锁定
  AuthGate 包裹点 = `RootComponent` 的返回值外层（或 render 处包 RootComponent），
  一处覆盖全部。
- 明确 `ReadingAnalysisDemoRoute` 这条 demo/product 分支**也**在门后（强制模式
  下未登录不能绕 `?view=reading-analysis` 看内容）——这是安全边界，必须显式
  确认，不能默认。

### MF-4 — argon2 是 server 首个原生依赖，同刀必须更新 server/package-lock.json

亲验事实：server 用 **npm**（CI `npm ci`，需 `server/package-lock.json` 与
`package.json` 一致）；argon2 0.44.0 engines `>=16.17.0`，走 node-addon-api
（N-API，ABI 稳定）+ node-gyp-build，含预编译产物、缺则源码构建。plan 改动
清单只写「`server/package.json`（argon2）」，**没提 lockfile**。

风险：`npm ci` 是**严格**模式——`package.json` 加了 argon2 但 lockfile 没同步
更新，CI 直接 `npm ci` 失败（EUSAGE: lock file out of sync），整条 verify 红，
不是运行时问题而是**装依赖就挂**。M0-1 教训：改动清单是 DEV 契约，漏项就漏活。

处置（plan.md 改动清单）：
- 明写「`server/package.json` + `server/package-lock.json` 同刀更新（server
  用 npm，非 pnpm；`npm install argon2 --prefix server` 生成锁）」。
- 验收步骤补一句：CI 的 `npm ci --prefix server`（或 working-directory
  server）必须绿——即 lockfile 已同步。
- （非阻塞附言，进 SW-1）预编译加载失败的备案 scrypt 本刀不实现，可接受，
  但要在 ADR 风险节留一句「若目标机源码构建失败，回退 scrypt 是已备案路径」。

---

## Must Fix -> Plan Disposition Checklist（骨架，PM 回填）

- [ ] MF-1 → plan 决策 5 + ADR-0012 决策 5：口径删「1」、改为 0/2 两代 +
      明文「未来迁移用 `< N` 禁 `=== N`」+「本刀不引条件迁移」。
- [ ] MF-2 → plan 决策 1 白名单加 `GET /api/health`（正则精确）；
      verify-auth-gate 加「强制模式无 cookie health 200」断言。
- [ ] MF-3 → plan 决策 7 改述为两分支 + 锁定 AuthGate 包裹点 = RootComponent
      外层；显式确认 reading-analysis 分支也在门后。
- [ ] MF-4 → plan 改动清单加 `server/package-lock.json`（server=npm）；验收
      加 `npm ci` 绿；ADR 风险节留 scrypt 备案一句。

---

## Should Watch（不阻塞 DEV）

- **SW-1 argon2 原生构建风险（低-中）**：N-API 预编译产物跨 Node 版本 ABI 稳定，
  ubuntu-latest 有 python/make/g++ 兜底源码构建，owner 本机 Node 25 与 HK
  Ubuntu 均在支持面内。风险可控但真实（首个原生依赖）。DEV 装完在本机与 CI
  各跑一次 `npm ci` + 一次 hash/verify 冒烟即可。备案 scrypt 不预实现，同意。

- **SW-2 sendJson 加 `allow-credentials` 只对跨源路径有意义，同源流不载荷**：
  dev 走 vite proxy = 同源，CORS 头对同源 fetch 无作用；跨源 fallback
  （`httpClient.ts` 的 `API_ORIGIN`/`apiPathNoIpv6`）本刀明确不带 credentials
  也不支持（ADR 决策 6）。故该头是「合法但非本流关键」的补丁，加上无害、
  不加也不影响同源登录。DEV 加就加，别指望它让跨源带 cookie 生效。

- **SW-3 闸每请求开一次只读用户库连接查 countUsers**：符合现有 open-per-op
  惯例，但强制模式下每请求多一次 open+query+close。个位数用户无压力；若未来
  觉察热路径开销，可在进程内缓存「users 表是否非空」并在 create-user/disable
  时失效。本刀不做，记 watch。

- **SW-4 会话中途过期无集中 401 拦截**：ADR 决策 3 已记为已知取舍（无统一
  client 层，扇出不可控；30 天滑动续期 + 个位数用户下发生率可忽略，刷新即
  回登录页）。同意本刀不做。M2 若刺眼再做。

- **SW-5 `/user-space/files/*.pdf` 是路由不是静态特判**：亲验在
  `server/my-space/mySpaceRoutes.mjs:54`（defineRoute），非主 handler 静态。
  闸在 runRoutes 之前，天然覆盖它——结果对，但 plan 决策 1「`/user-space/*`
  静态」措辞不准（它不是像 `/paper-assets/` 那样的静态特判）。非阻塞，DEV
  按「闸在 runRoutes 前 = 覆盖全部路由 + paper-assets 静态特判」的正确心智
  实现即可。建议 plan 把「静态」二字去掉，改「含 `/user-space/*.pdf` 路由」。

- **SW-6 verify 脚本注册的 housekeeping 硬闸**：亲验
  `scripts/verify-architecture-housekeeping.mjs` 强制「listed in verify-ci 的
  脚本必须在 scripts/README.md CI 表标 yes，反之标 no 的不得进 verify-ci」
  （:169-198）。plan 改动清单已含 `scripts/verify-ci.mjs + scripts/README.md`，
  意识到了。DEV 注册 verify-auth-gate 时两处必须同步，否则 housekeeping 红。

---

## Nice to Have

- create-user CLI 建号成功后除打印密码，可顺带打印一行「登录已启用，本地
  下次刷新会要求登录」提示，降低 owner「怎么突然要登录了」的困惑。
- 启动日志的开放模式警告已很醒目；可再附一行 M1 部署检查单锚点 URL/条款号，
  把「先建号再暴露公网」钉死在运行时可见处。

---

## Plan 与仓库现实的矛盾（单列）

1. **事实错误**：`main.tsx` 只有两个顶层分支（reading-analysis / App），
   无独立 paper-intelligence 顶层组件（PI 在 App 外壳内）。plan 决策 7 与
   prompt 的「三顶层视图」不成立。见 MF-3。
2. **口径埋雷**：`user_version` 追溯口径的「1 = M0-1 shape」在任何真实库里
   都不存在（全仓从不写 user_version，M0-1 库恒为 0），会诱发未来 `=== 1`
   死分支。见 MF-1。
3. **白名单遗漏**：`/api/health`（runRoutes 内路由）不在白名单，强制模式下
   被闸 401，与 M1 uptime 探活冲突。见 MF-2。
4. **改动清单漏项**：server 用 npm，argon2 需同刀更新 `server/package-lock.json`，
   否则 `npm ci` 失败；清单只写了 package.json。见 MF-4。
5. **措辞不准（非阻塞）**：`/user-space/*` 是路由非静态特判（SW-5）。

坐标准确性总评：主 handler、sendJson、user DB 函数、路由机制、serverRoutes、
vite proxy、main.tsx 结构 —— 全部经 sed/grep 亲验为**精确**（除 MF-3 的
「三视图」概念错、SW-5 的「静态」措辞）。较 M0-1 的坐标幻觉，本 plan 侦察
质量明显更高。

---

## Static Verify Requirements

- verify-auth-gate.mjs 断言必须用**状态码 + 响应体字段**（禁正则匹配空串
  可通过的假绿写法，M0-1 MF-4 教训）。plan 验收 1 已明写此纪律，达标。
- 覆盖：(a) 空库开放模式现有 API 200 + `/api/auth/me` `authRequired:false`；
  (b) CLI child process 真跑 create-user；(c) 强制模式无 cookie 401 / 错密码
  401 / 登录后 200 / `/paper-assets/` 无 cookie 401；(d) logout 后旧 cookie
  401；(e) `--disable` 后即时 401。**+ MF-2 新增：health 无 cookie 200。**
- 「存量套件零改动全绿」验收可执行：亲验 smoke（如 smoke-c8-my-space.mjs:105）
  用 `...process.env` + 全新临时 `USER_DATA_DB` → users 表空 → 开放模式 →
  存量脚本零改动通过。**这条声明成立。** plan 验收 2「若有任何一个需改脚本
  才能过，停下回报 PM，不许静默改脚本」——纪律正确，保留。

## Browser QA Matrix（PM 做，plan 验收 3 已含，确认充分）

开放模式一切照旧 → create-user → 刷新被踢登录页 → 登录进工作台 → topbar 显
用户名 → 退出回登录页 → 错密码人话提示 → 第二浏览器 profile 未登录直接看登录
页。**补一条（配合 MF-3）**：强制模式下未登录直接访问 `?view=reading-analysis`
应看到登录页而非阅读解析内容。

## Allowed Files（plan 改动清单，按 MF-4 订正后完整）

- 新：`server/auth/auth.mjs`、`server/auth/authRoutes.mjs`、
  `app/src/auth/AuthGate.tsx`、`app/src/auth/LoginPage.tsx`、
  `app/src/auth/session.ts`、`scripts/create-user.mjs`、
  `scripts/verify-auth-gate.mjs`、`docs/adr/0012-*.md`（已存在，随刀转 Accepted）。
  —— 亲验以上路径均不与现存文件冲突。
- 改：`server/api.mjs`、`server/package.json`、**`server/package-lock.json`
  （MF-4 补）**、`app/src/main.tsx`、`app/src/App.tsx`（topbar display-only）、
  `scripts/verify-ci.mjs` + `scripts/README.md`（housekeeping 硬闸，SW-6）、
  登录页 CSS（跟现状惯例）。

## Forbidden Files / Scope（plan Forbidden 节，确认正确）

不做权限差异（M0-3）、不给业务表加 user_id（M0-4）、不做注册/找回/邮件/验证
码/限流/审计、不引 migration/express/前端路由框架、不改 router/index.mjs 机
制、不动 question-bank.sqlite schema、不改 services/*.ts 错误处理扇面、不动
print/export/PaperSurface/paper-assets。**边界干净，与 roadmap 里程碑划分一致。**

---

## SPEC 一致性判断：放弃 HMAC 是实现细化还是决策变更？

roadmap 决策 #4 原文「密码（argon2）+ **签名 cookie** session」。plan/ADR 改为
256-bit 随机 token + 服务端 sha256 存储、零新增 env。

判定：**实现细化，不是决策变更，处置正确（报 owner 追认 + ADR 记全论证）。**
理由——决策 #4 的产品意图是「cookie 不可伪造的服务端 session」，「签名」是达成
手段的一种描述而非产品约束；256-bit 随机 token 的不可伪造性 ≥ HMAC，且服务端
存哈希使「DB 泄露 ≠ 会话泄露」，安全性等价或更强、运维面（无 SESSION_SECRET
轮换）更小。产品可见行为（登录/会话/登出）与决策 #4 完全一致。这落在「改任
何一条要重新过 owner」里的「实现如何达成同一决策」一侧，而非「改决策本身」。
plan 报 owner 追认是稳妥做法，**不构成 SPEC CONTRADICTS，不阻塞 DEV**（追认是
知会，非前置放行门）。

---

## DEV Readiness

- 教师动作 / 前后行为 / 当前刀边界 / 未来刀边界：清楚。
- 允许 / 禁止文件：Forbidden 完整正确；Allowed 按 MF-4 补 lockfile 后完整。
- 数据契约：users/sessions schema 明确、role/status 有 CHECK、防枚举统一
  401、session 哈希存储——契约稳定，M0-3/M0-4 可直接续建。唯 user_version
  口径需按 MF-1 修正（否则埋未来迁移雷）。
- verify / QA：验收 1 断言纪律达标、存量零改动声明经亲验成立；按 MF-2 补
  health 断言、MF-3 补 reading-analysis 门后 QA 后，能证明用户可见风险。
- **结论：补齐 4 条 Must Fix 后 DEV-ready。** 4 条都是 plan 层可闭合的具体
  修改（口径措辞 / 白名单一行 / 事实纠正 + 挂载点锁定 / 清单补 lockfile），
  无一需要重开设计。未补前不建议开工——MF-1 会埋进未来迁移、MF-2 会在 M1
  部署才炸、MF-4 会让 CI 装依赖直接红。

## Open PO Decisions（≤3）

**0 个需 owner 拍板的新产品决策。** roadmap 决策 #4 已定方向；放弃 HMAC 属
实现细化（追认非放行门，见上）；MF-1~MF-4 全是实现契约修正，不含产品悬案。
唯一需 owner「知会/追认」的是 HMAC 偏差，plan 已安排，不计入未决 PO 决策。
