# M0-2 邀请制登录 — CR 报告（cr.md）

审阅人：CR（小川），全新独立冷读上下文
分支：`cut/m0-2-invite-login`（PR #238）
审阅范围：`git diff 7799c01..HEAD`（3 commit：4f9bcc1 server / 66814db frontend / 3909e7d verify）
审阅级别：Big CR（L4 — 用户库新数据契约 + 全 API 挂闸 + 用户可见登录门 + 迁移锚点）
方法：先冷读全量 diff，再对 plan/pa/ADR；跑真 verify（17/17）、跑活服务器做破坏性反证、
      跑 app tsc、跑 architecture-housekeeping、亲验 ISO 字符串比较与 URL 归一化。

---

## Verdict

**APPROVE WITH MUST FIX**

安全正确性核心过关：闸单点、白名单精确、防枚举统一 401、token 随机 + sha256 存储、
滑动续期、--disable 即时、cookie 属性齐全、防绕过（大小写/尾斜杠/双斜杠/编码/点段/
多 cookie/错方法）全部证伪。8 决策逐条落地，Forbidden 全守，PA 4 MF 全部真落进实现，
verify 17 断言写法干净（状态码 + 响应体字段，无假绿）。

唯一 Must Fix：**plan 决策 1 与 ADR-0012 决策 1 白纸黑字要求的"users 表为空时启动
日志打印醒目警告"未实现**。这是 M1「先建号再暴露公网」裸奔风险的运行时唯一可见护栏，
契约明列却漏活。改动极小（启动块加一次 countUsers + 一行 console.warn），但属"契约
要求 vs 代码缺失"，按纪律必须补齐再合。

---

## Must Fix（阻塞合并）

### MF-CR-1 — 开放模式启动警告未实现（plan 决策 1 / ADR-0012 决策 1 明文要求）

契约原文（plan.md:58-59）：「服务器启动日志打印醒目警告
`[auth] users 表为空，登录未启用 — 运行 node scripts/create-user.mjs 创建账号`」。
ADR-0012:29 亦记「启动日志醒目警告」为 M1 裸奔风险的对策之一。

亲验事实：全仓无此警告。
- `grep -rn "登录未启用\|users 表为空\|create-user.mjs 创建" server/` → 无命中。
- 启动块 `server/api.mjs:4252-4263` 只 `ensureDatabaseShape()` +
  `openUserDatabase({readOnly:false}).close()` + `server.listen`，未查 users 表、未打警告。

风险：这不是可有可无的日志。它是 ADR 决策 1「风险与对策」里对"新机空库直接上公网 =
裸奔"的**运行时唯一可见护栏**——owner 部署新机、忘了先 create-user 时，唯一能提醒他
"当前谁都能进"的信号就是这行启动警告。契约明列、代码缺失 = 漏活，与 M0-1「改动清单是
DEV 契约，漏项就漏活」同型。

处置（`server/api.mjs` 启动块，`server.listen` 之前或回调内）：
用已导入的 `countUsers` 开一次只读连接查 users 表，为空则
`console.warn('[auth] users 表为空，登录未启用 — 运行 node scripts/create-user.mjs 创建账号')`。
约 5 行。不需要新 verify（启动日志），但补后本机起一次开放模式确认警告可见即可。

---

## Should Watch（非阻塞）

- **SW-CR-1 login 响应多回 `status` 字段（DEV 自报盲区 4）**：`rowToUser`（auth.mjs:67-75）
  返回 `{id, username, role, status}`，login 响应 `{ user: rowToUser(userRow) }`
  （authRoutes.mjs:64）因此比 plan 决策 6 的 `{id, username, role}` 多一个 `status`。
  **非安全问题也非绕过**：能到这行的用户必然 `status==='active'`（:53 已挡非 active），
  该字段恒为已知值、不泄露任何东西；前端 `SessionUser` 类型不含 status、login() 后
  `reload()` 走 /me（/me 的 user 对象是干净的 `{id,username,role}`，authRoutes.mjs:104）。
  轻微契约漂移。建议二选一：把 rowToUser 收敛到 `{id,username,role}`，或在 login 处显式
  投影。不阻塞。

- **SW-CR-2 强制模式每请求开 2 次只读连接（DEV 自报盲区 1 / PA SW-3）**：applyAuthGate
  先 `openUserDatabase(readOnly)` 查 countUsers（:4149-4155），再 `openUserDatabase(readOnly)`
  查 readSession（:4159-4165），续期时再开第 3 次写连接。两次只读**可以合并成一次连接**
  （同一 db 上先 countUsers 再 readSession）。个位数用户无压力、符合 open-per-op 惯例，
  但第二次 open 确如盲区所述可省。若未来觉察热路径开销，进程内缓存"users 是否非空"+
  create-user/disable 时失效是更彻底的解。本刀不做，记 watch。

- **SW-CR-3 isRequestSecure 未对真 TLS 代理跑过（DEV 自报盲区 2）**：auth.mjs:235-241
  逻辑正确——优先 `x-forwarded-proto`（取逗号分隔第一段 trim 后 === 'https'）、回退
  `socket.encrypted`。本地 dev 恒 http → Secure 不加，符合决策 3。M1 反代前无法端到端
  验证，但逻辑层面无误。M1 部署刀需实测反代确实注入 x-forwarded-proto（记入 M1 输入）。

- **SW-CR-4 verify 裸 kill() + 立即 rmSync（DEV 自报盲区 3）**：verify-auth-gate.mjs:280-281
  `child.kill()`（默认 SIGTERM）后立即 `rmSync(..., {force:true})`。与既有
  `smoke-c8-my-space.mjs:217-218`（`kill('SIGTERM')` + `rmSync force`）**同一既证模式**；
  `force:true` 吞掉临时文件瞬时占用错误。CI 慢机竞态理论存在但被 force 兜住、且全套件
  已用此模式多刀无事故。非阻塞、符合先例。可选微改：kill 传 'SIGTERM' 显式化。

- **SW-CR-5（继承 PA SW-1）argon2 首个原生依赖**：本机 `npm ci` 已装成功、lockfile 含
  argon2、verify 真跑 hash/verify 全绿。ubuntu-latest 有源码构建兜底。风险可控。scrypt
  备案已记 ADR:62-63，本刀不实现，同意。

- **SW-CR-6（继承 PA SW-4）会话中途过期无集中 401 拦截**：ADR 决策 3 已记已知取舍。
  同意本刀不做。

---

## 破坏性反证记录（每条假设 → 结论 → 证据）

对活服务器（强制模式，已建 user）实测 + 代码/归一化亲验：

1. **假设：URL 大小写变体绕白名单（`/API/HEALTH`）** → 证伪。返回 401。
   白名单正则 `/^\/api\/health$/`（api.mjs:4113）大小写敏感，健康口须精确匹配才放行；
   大小写变体既不匹配白名单、也不匹配任何真实路由 → 被闸拦。证据：live probe #2 = 401。

2. **假设：尾斜杠 `/api/health/` 绕白名单** → 证伪。返回 401。正则 `$` 锚定，尾斜杠不匹配。
   证据：probe #3 = 401。

3. **假设：双前导斜杠 `//api/health` 绕闸** → 证伪。返回 401。`new URL()` 不把 `//api/health`
   归一为 `/api/health`（pathname 保留 `//api/health`），不匹配白名单 → 拦。证据：probe #4 = 401。

4. **假设：错方法 `POST /api/health` 绕白名单** → 证伪。返回 401。白名单条目带 method
   （`{method:'GET', pattern:...}`，api.mjs:4111），isAuthPublicRoute 同时比 method + pattern
   （:4118）→ POST 不放行、也无 POST /api/health 路由 → 拦。证据：probe #5 = 401。

5. **假设：点段路径遍历 `/paper-assets/../api/draft-papers` 绕闸** → 证伪（且是好设计）。
   `new URL()` 在闸读 `url.pathname` **之前**就归一化点段：`/paper-assets/../api/health`
   → `/api/health`、`/paper-assets/../api/draft-papers` → `/api/draft-papers`（亲验 node
   URL 归一）。闸、paper-assets 静态特判、runRoutes 全部消费同一个已归一的 `url.pathname`
   → 无"闸看到 A、路由执行 B"的错位。`/paper-assets/../api/health` = 200 是**正确**的
   （它就是被归一成公开的 health），非绕过。证据：probe #8 归一验证。

6. **假设：多 cookie 注入（`eqb_session=; eqb_session=junk`）绕会话校验** → 证伪。返回 401。
   parseCookies（auth.mjs:149-166）逐段 split，后值覆盖前值 → 最终取 `junk`（或空）→
   hashToken 查不到会话 → readSession 返 null → 401。无"注入空 cookie 让校验短路"的洞。
   证据：probe #9 = 401。

7. **假设：编码变体 `/api/health%2f` 绕白名单** → 证伪。返回 401。`%2f` 不被 URL pathname
   解码为 `/`（保留编码），不匹配 `^/api/health$`。证据：probe #6 = 401。

8. **假设：countUsers 与 create-user 之间的开放窗口 = 未鉴权写入** → 确认为**设计内**，非漏洞。
   bootstrap-open 是显式契约（决策 1）：首个账号建成前一切放行，正是为了让存量 smoke/verify
   零改动 + owner 本地无缝。窗口关闭点 = readSession 每请求实时 JOIN `status='active'`（无缓存），
   故 --disable 也即时（verify (e) 实证）。ADR 决策 1 已把"新机裸奔"记为 M1 风险 + 对策
   （启动警告——见 MF-CR-1）。

9. **假设：静态 /paper-assets/* 在强制模式漏鉴权** → 证伪。闸在静态特判**之前**
   （api.mjs:4196 applyAuthGate → :4201 paper-assets 特判）→ 无 cookie 401。证据：verify
   (c) `/paper-assets/*` 无 cookie 401 断言 + probe。

10. **假设：ISO 字符串比较 `expires_at > nowIso()` 存在跨长度/时区比较 bug** → 证伪。
    `toISOString()` 恒定长（24 字符）UTC 格式，字典序 == 时序（亲验）→ 过期判断正确。

11. **假设：/api/auth/me 白名单但仍解析 session 的实现有洞** → 证伪。闸对 me 只抑制
    "写 401 并停"（isPublic 分支 :4171 return `{session:null}`），会话有效时照常把 session
    并进 context；me 路由据 context.session 报 authRequired/user（authRoutes.mjs:82-113）。
    开放模式 me 自报 authRequired:false、强制模式无会话 me 自回 401——逻辑自洽。verify (a)(c) 实证。

---

## DEV 自报盲区处置

1. 每请求 2-3 次 SQLite open → **SW-CR-2**（真可合并两次只读；个位数用户不阻塞）。
2. isRequestSecure 未对真 TLS 跑过 → **SW-CR-3**（逻辑正确，M1 实测入 M1 输入）。
3. verify 裸 kill + rmSync 竞态 → **SW-CR-4**（同 smoke-c8 既证模式 + force 兜底，非阻塞）。
4. rowToUser 多回 status → **SW-CR-1**（非安全非绕过，轻微契约漂移，建议收敛）。

---

## plan 符合度清单

8 决策：
- [x] 决策 1 bootstrap 开放模式：空库放行、非空强制、白名单精确。
      ⚠ **启动警告日志缺失 → MF-CR-1**（决策 1 的一部分未落地）。
- [x] 决策 2 单点闸在主 handler（OPTIONS 之后、静态/runRoutes 之前），session 经 context
      下发；不改 router/index.mjs。api.mjs:4196。
- [x] 决策 3 randomBytes(32) base64url token + sha256 存储 + HttpOnly/SameSite=Lax/Path=/
      /Max-Age + https 时 Secure；30 天 TTL + <15 天滑动续期（仅续期开写连接）。
- [x] 决策 4 schema 全进 auth.mjs，ensureAuthDatabaseShape 从 ensureUserDatabaseShape 挂入
      （api.mjs:701）；role/status CHECK 齐；时间戳 ISO。
- [x] 决策 5 `PRAGMA user_version = 2`（api.mjs:705），0/2 两代口径注释在位、明文 `< N` 禁
      `=== N`、本刀不引条件迁移分支。**PA MF-1 落地。**
- [x] 决策 6 三路由 createAuthRoutes；login 防枚举统一 401 invalid_credentials；logout
      幂等（token 为空也不报错，destroySessionByToken:142-145 early return）；me 三态。
      sendAuthJson 自带 Set-Cookie + credentials 头，sendJson 补 credentials 头零改调用方。
- [x] 决策 7 AuthGate 包 RootComponent（main.tsx:43-45，一处覆盖两分支含 reading-analysis）；
      LoginPage 独立、失败 close 到登录页、autocomplete 齐；session.ts 三函数走 apiPath。
      **PA MF-3 落地（两分支 + 挂载点锁定）。**
- [x] 决策 8 create-user.mjs 单脚本三模式，复用 auth.mjs + openUserDatabase，密码不落盘打印
      一次，disable 清 session、reset 清 session。

PA 4 MF：MF-1 ✓（user_version 口径）/ MF-2 ✓（health 白名单精确正则 + verify 断言）/
MF-3 ✓（两分支 + AuthGate 挂载点）/ MF-4 ✓（server/package-lock.json 同刀更新，`npm ci`
本机绿、lockfile 含 argon2）。

Forbidden：
- [x] router/index.mjs 未动。
- [x] 无 role 行为分支（仅 CLI 入参校验 + verify 断言，M0-3 正确留白）。
- [x] 业务表无 user_id（user_id 仅在 sessions 自身 FK）。
- [x] services/*.ts 未动（无集中 401 拦截）。
- [x] question-bank.sqlite schema 未动（ensureDatabaseShape 未改）。
- [x] App.tsx 纯 display-only 追加 topbar（useCurrentUser + logout 按钮，不碰 reducer/
      状态契约/数据获取）。
- [x] 未引 migration/express/前端路由框架。

契约文件纪律：server/api.mjs 改动全在授权范围（import + serverRoutes 汇总 + credentials 头
+ openUserDatabase export + ensure 挂入 + user_version + 闸函数 + 主 handler 挂闸）；
App.tsx display-only 属实。

假绿检查：verify-auth-gate.mjs 17 断言逐条为状态码 + 响应体字段组合（无正则匹配空串可过的
写法）；真跑 17/17；(a) 存量零改动开放模式属实（临时空库）；architecture-housekeeping 80/80
（verify-ci + README 同步）；app tsc 干净退出 0。

---

## Self-Review Blind Spots（喂给后续 Big CR）

- 未在真 TLS 反代后端到端验 isRequestSecure（M1 才有环境）——已记 SW-CR-3 转 M1 输入。
- 未压测强制模式高并发下 open-per-op 3 连接的表现（个位数用户前提下不做）——SW-CR-2。
- 未验 M1 同源部署下服务器托管前端静态文件时闸是否仍覆盖 index.html（M0-2 server 不托管
  前端静态，dev 靠 vite；同源静态托管是 M1 刀的活，ADR 决策 6 已划入 M1 约束）。
- 浏览器 QA（plan 验收 3，含 `?view=reading-analysis` 门后）由 owner 做，本 CR 只从代码
  层确认 AuthGate 包裹两分支正确、未实机点击。
