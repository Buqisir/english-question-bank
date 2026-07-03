# ADR-0012: 邀请制登录的鉴权设计（M0-2）

- Status: Proposed（随 M0-2 cut 合并即 Accepted）
- Date: 2026-07-03
- 上游: `docs/cuts/launch-roadmap/roadmap.md` 决策 #4（邀请制 auth）、
  ADR-0011（两库分离）、M0-1 pa.md SW-4（用户库无版本表挂账）

## 背景

产品定向公开上线（熟人小圈个位数用户）。M0-2 给系统装第一道登录门：
owner 手工建账号，密码 + cookie session，无邮件依赖。运行时是原生
`node:http` 单进程 + `node:sqlite`（open-per-operation），无中间件
框架；全部 smoke/verify 脚本各自 spawn server + 临时空库。

## 决策

### 1. bootstrap 开放模式：users 表为空 = 不强制登录

鉴权闸的开关不是 env 变量，而是 `users` 表是否非空。空表 = 开放模式
（行为与登录刀之前完全一致 + 启动警告日志）；建第一个账号即自动进入
强制模式。

理由：
- 全部存量 smoke/verify 用临时空库，零改动继续绿；不引入
  `AUTH_MODE=off` 这种测试后门 env（后门会跟着部署走，风险更大）。
- owner 合并后本地无缝：跑一次 `scripts/create-user.mjs` 才启用。

风险与对策：**M1 部署检查单必须包含「先建号、再暴露公网」**——新机
空库直接上公网等于裸奔。对策：启动日志醒目警告 + M1 刀的部署脚本把
create-user 列为前置步骤（M1 plan 引用本条）。

### 2. 单点闸在主 handler，session 经 context 下发

闸插在 `server/api.mjs` 主 handler 的 OPTIONS 特判之后、一切路由
（含静态 `/paper-assets/`、`/user-space/`）之前。白名单只有 OPTIONS、
`POST /api/auth/login`、`GET /api/auth/me`。校验通过后
`{ ...serverContext, session }` 传入 runRoutes——M0-3 权限刀直接消费
`context.session.role`，不再动闸。

不引中间件框架：路由是纯数据数组 + 线性匹配，单点闸五十行内解决，
洋葱模型对本仓库是负资产。

### 3. session = 256-bit 随机 token + 服务端 sha256 存储（放弃 HMAC 签名）

roadmap 决策 #4 原文是「签名 cookie session」。实现裁决为：
`crypto.randomBytes(32)` 随机 token 放 cookie（HttpOnly / SameSite=Lax /
https 时加 Secure），DB 存 `sha256(token)`，TTL 30 天滑动续期。

放弃 HMAC 签名的论证：签名的目的是"cookie 不可伪造"；256-bit 随机
token 的不可伪造性 ≥ HMAC（猜中概率 2^-256），而 HMAC 需要
SESSION_SECRET 的生成、注入、轮换——多一个 env 变量、多一类部署事故
（密钥丢失 = 全员掉线）。DB 存哈希使"数据库文件泄露"不等于"会话
泄露"。安全性等价或更强、运维面更小，视为对决策 #4 的实现细化而非
更改；**报 owner 追认**。

已知取舍：会话中途过期无集中 401 拦截（前端无统一 client 层），
用户表现为操作报错、刷新即回登录页。个位数用户 + 30 天滑动续期下
发生率可忽略；若 M2 反馈刺眼再做统一拦截。

### 4. 密码哈希 = argon2id（`argon2` npm 包）

照 roadmap 原文。仓库首个原生绑定依赖；主流平台有预编译产物。若
未来部署目标装不上，备案是 `node:crypto` scrypt（OWASP 认可），但
不预先实现双路径。登录失败统一回 `invalid_credentials`，不区分
用户不存在/密码错（防枚举）。无找回流：owner 用 CLI
`--reset-password` 代替（roadmap 明确排除项）。

### 5. SW-4 结清：`PRAGMA user_version` 作版本锚点，不引迁移框架

用户库演进机制维持「幂等 ensure（CREATE IF NOT EXISTS，未来需要时
ALTER 补列）」，但 `ensureUserDatabaseShape` 末尾写
`PRAGMA user_version = 2`。

版本口径（PA MF-1 修正）：**0 = M0-2 之前**（全仓从未写过
user_version，M0-1 及更早的真实库恒为 0）；**2 = M0-2 起**（含 auth
表）。「1」未曾发行、永久留空——真实库从 0 直接跳 2。未来所有条件
迁移**必须用 `version < N` 比较，禁止 `version === N`**（幂等 ensure
模型下，相等比较对跳代库是死分支）。本刀不引任何条件迁移分支。

理由：auth 数据进库后，"删库重建"不再是可接受的兜底，未来 schema
变更（M0-4 加 user_id 列）需要一个机器可读的"库处于哪一代"锚点做
条件迁移；`user_version` 是 SQLite 原生单整数，零表、零框架、零
运行时成本。全仓不引 migration 框架的既有裁决（ADR-0011）不变。

### 6. 同源约束：M1 部署必须前后端同源

cookie session + 现状 CORS（固定 dev origin、静态资源 `*`）决定了
跨源部署不受支持。dev 已同源（vite proxy）；M1 部署必须让前端静态
产物与 API 同源（单 Node 进程托管静态文件，或反向代理归一）。此为
M1 刀的硬约束输入。

## 后果

- M0-3 权限刀的地基就绪：users.role 已在表里，session 已进 context。
- M0-4 数据隔离刀的地基就绪：session.userId 可直接用于圈范围；
  user_version 锚点支持加列迁移。
- 新增运维面：owner 需要在服务器上跑 create-user CLI（建号/重置/
  停用）；这是无邮件依赖的代价，也是 roadmap 决策 #4 的本意。
