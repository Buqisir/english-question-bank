# ADR-0013: owner/member 权限两档设计（M0-3）

- Status: Accepted（2026-07-03，PM 拍板；D2/D3 待 owner 追认，非阻塞）
- 上游：roadmap 决策 #6；ADR-0012（邀请制登录）；ADR-0011（两库分离）

## 背景

M0-2 落地登录后，`users.role ('owner'|'member')` 与
`context.session.role` 已就位但零消费（前后端 grep 均无 role 判断）。
roadmap 决策 #6：member 只见 AI 模式，经典模式（策展后台）整个
owner-only，「key UI 迁移」工单消亡、topbar 按钮墙并入本刀。

侦察确认的现状风险：

1. 写共享馆（question-bank.sqlite）的 20 条路由对任何登录用户开放；
2. 前端 4 个策展按钮（导入资料/整卷导入/AI 导题/打标签）无任何门控；
3. `?view=paper-import` / `?view=paper-import-ai` 是纯前端 state
   初始化的 URL 直达，绕过一切 UI 门控；
4. `homeMode` 初始值来自 localStorage，残留 `'classic'` 会让 member
   直接以经典模式启动。

## 决策

### 1. 闸放在路由声明层，集中执行

`defineRoute(method, pattern, handle, { ownerOnly: true })` 声明 +
`runRoutes` 匹配后、handler 前统一检查。403 `{ error: 'forbidden' }`。

- 为什么不是 handler 内各自判断：20+ 条路由逐个写判断必漏（M0-2 的
  教训是单点闸好审计——白名单 3 条正则一眼看完；owner 闸同理，
  `grep ownerOnly` 即得全量挂闸清单）。
- 为什么不是路径正则集中表（像 AUTH_PUBLIC_ROUTES）：owner 闸的粒度
  跟着路由走（同一 pattern 的 GET/POST 待遇不同），复制一份正则表
  等于维护两张路由表，必然漂移。声明跟路由定义放在一起，新路由必须
  显式选择是否挂闸。
- 闸先于 body 读取：403 不消耗解析成本，也不给 member 触发副作用的
  机会。

### 2. 开放模式 = owner 视角（待 owner 追认）

users 表空（bootstrap 开放模式，ADR-0012）时，前后端均不做任何
role 裁剪。

- 理由：开放模式的契约就是「与 M0-2 前的服务器行为完全一致」（本地
  单人现状）。若开放模式按 member 裁剪，本地 owner 日常策展直接瘫痪；
  若造第三种"介于中间"的形态，产品形态数从 2 变 3，M1 部署检查单
  「先建号再暴露公网」已经覆盖了裸奔风险。
- 实现上主 handler 把 `authMode: 'open' | 'enforced'` 显式放进
  context；禁止用「session 为空」推断开放模式（白名单路由 session
  也为空，语义会混）。

### 3. member 入口隐藏而非禁用（待 owner 追认）

roadmap 原话是「member **只见** AI 模式」。灰按钮是向 member 展示
他没有的东西——对熟人小圈的同事，这制造的是困惑（"为什么我不能
点？"）而非边界感。隐藏 + 服务端 403 兜底，界面干净、语义清楚。

### 4. 共享馆边界 = sqlite + paper-assets 派生资产

verb-profile backfill 写的是 paper-assets 下的 sidecar JSON，不是
question-bank.sqlite 本身，但它是共享题库的派生数据（随馆文件一起
推送部署），member 改它等于改共享馆。挂闸。

### 5. 安全边界只在服务端；前端隐藏是体验层

member 绕过前端（curl / 手改 localStorage / URL 直达）时，唯一可
依赖的是服务端 403。前端裁剪（锁 homeMode、藏按钮、废 URL 路由）
只为让 member 的正常路径根本遇不到 403。QA 必须包含"绕过前端直打
API"的验证。

### 6. 经典详情页的 AI 生成类 POST（不写库）也挂闸

reading-parse/cloze-parse/seven-choices-parse/grammar-parse/summary/
topic-labels 六条 POST 生成路由不写库，但：①它们是经典模式详情页
专属动作，member 无对应 UI；②它们烧 owner 的 server key（roadmap
决策 #5 全局日限额之外多一层收敛）。挂闸前 DEV 核对前端调用方，
确认无 member 可见面调用（有则该条豁免并记录）。

## 排除项

- 不做 per-user 细粒度权限/资源级 ACL——两档够用（roadmap #1 个位数
  用户）。
- 不做 member 的 403 专属错误页——member 正常路径遇不到 403。
- 不做经典模式功能向 AI 模式搬家——M2 反馈后按需（roadmap 既定）。

## 后果

- 新路由默认不挂闸（省略 options = member 可用）。写共享馆的新路由
  必须记得加 `ownerOnly`。缓解：`scripts/verify-owner-gate.mjs` 枚举
  挂闸清单断言 403，新写路由漏挂闸时 CR 与"写路由必须配 verify 断言"
  的惯例是防线。
- 前端 `isOwnerView` 语义只在 AuthGate 一处翻译（开放模式→true），
  消费方拿布尔值，避免「currentUser === null」被误读成 member。
