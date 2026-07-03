# M0-2 邀请制登录 — Cut Note（结案记录）

- Cut: large（auth 数据契约 + 全 API 挂闸 + 登录页）
- 分支/PR: cut/m0-2-invite-login / PR #238
- 上游: roadmap 决策 #4；ADR-0012；M0-1 SW-4 挂账（本刀结清）

## 交付

- `users` / `sessions` 表进 user-data.sqlite（role/status 带 CHECK；
  M0-3 权限刀免动 schema）；`PRAGMA user_version = 2`（口径 0/2 两代，
  迁移比较只许 `< N`）。
- argon2id 密码哈希 + 256-bit 随机 token session（服务端 sha256 存储、
  30 天滑动续期、HttpOnly/SameSite=Lax/https 时 Secure）。
- 单点鉴权闸（主 handler，OPTIONS 后、一切路由前）；bootstrap 开放
  模式（users 表空 = 行为与 M0-2 前完全一致 + 启动醒目警告）；白名单
  login/me/health 精确正则。session 经 context 下发给路由层。
- 前端 AuthGate 包 RootComponent（两顶层分支全在门后）+ 登录页 +
  topbar 用户名/退出（开放模式零 UI 变化）。
- `scripts/create-user.mjs`（建号/重置密码/停用/启用，owner 无邮件
  找回流的替代）。
- `scripts/verify-auth-gate.mjs` 17 断言，进 verify-ci + README。

## 流程与验证

- 侦察（Sonnet）→ plan+ADR-0012 → PA（Opus，APPROVE WITH 4 MF 全采纳:
  user_version 口径 / health 白名单 / 两分支事实纠正 / npm lockfile）
  → DEV（Sonnet high，3 commit）→ CR（Opus，APPROVE WITH 1 MF:
  开放模式启动警告漏实现，已补 + SW-1 status 字段收敛）。
- verify-auth-gate 17/17（DEV/PM/CR 各自跑过）；verify:all 62/62
  （DEV 两跑，含 npm ci 干净重装）；tsc + vite build 过；
  housekeeping 80/80；CR 11 条破坏性反证全证伪。
- PM 浏览器 QA 全过（开放模式零变化/建号踢登录页/错密码文案/登录/
  topbar/退出/reading-analysis 门后安全边界/console 零错误）；QA
  临时账号已清，真库回开放模式。

## 挂账与移交

- **owner 追认（非阻塞）**：roadmap「签名 cookie」实现为随机 token +
  服务端哈希（ADR-0012 决策 3 论证；PA 判定实现细化非决策变更）。
- **M1 硬输入**：部署检查单必须「先建号再暴露公网」（ADR-0012 决策 1
  风险节）；前后端必须同源（决策 6）；isRequestSecure 上真 TLS 反代
  前要实测（CR SW-3）。
- CR SW-2：强制模式每请求 2 次只读 open 可合并（个位数用户不急）。
- owner 本地零操作：合并后仍是开放模式，跑
  `node scripts/create-user.mjs --username <名> --role owner` 才启用登录。

## 教训

- DEV 中途被 600s 无进展看门狗掐停一次，SendMessage 续跑即恢复、
  上下文不丢——比重开省一半 token。
- preview_fill 对 React 受控输入无效（DOM 直改不触发 onChange），
  QA 灌表单要用原生 setter + input 事件。
- 契约里的「运行时可见护栏」（启动警告这类）最容易漏活——CR 抓到的
  唯一 MF 正是它；plan 里这类条目建议进验收断言而非只写在决策里。
