# M0-3 权限两档（owner/member）— DEV 执行契约

- Cut size: medium-large；touches schema: no / data contract: no /
  **product boundary: yes**（member 产品形态首次定义）/ teaching interpretation: no
- 上游：roadmap 决策 #6（member 只见 AI 模式；经典模式 owner-only；
  topbar 按钮墙并入本刀）；M0-2 地基（`context.session.role` 已下发；
  users.role 已在表）。
- ADR：`docs/adr/0013-owner-member-role-gate.md`（本刀设计论证）。
- 侦察事实底座：本文件中所有 file:line 均经 PM sed 抽验（2026-07-03）。

## 0. 决策记录（PM 拍板，owner 追认项标注）

| # | 决策 | 拍板 |
|---|------|------|
| D1 | 服务端闸机制 | `defineRoute` 第 4 参 `{ ownerOnly: true }` 声明 + `runRoutes` 集中执行（匹配即检查，先于 handler 与 body 读取）。403 `{ error: 'forbidden' }` |
| D2 | 开放模式行为 | **= owner 视角**（users 表空时前后端均不裁剪；本地单人现状，不造第三种产品形态）⚠️ owner 追认 |
| D3 | member 入口处理 | **隐藏**而非禁用（roadmap 原话"member 只见 AI 模式"；灰按钮是向 member 展示他没有的东西，违背产品边界）⚠️ owner 追认 |
| D4 | 共享馆边界 | 含 paper-assets sidecar 文件（verb-profile backfill 写 sidecar JSON，与写 sqlite 同等对待，挂闸） |
| D5 | 安全边界归属 | 服务端 403 是唯一真实边界；前端隐藏只是体验层。QA 必须验证"绕过前端直打 API 被 403" |

## 1. 服务端改动

### 1a. 路由层机制（server/router/index.mjs）

- `defineRoute(method, pattern, handle, options = {})`：冻结对象加
  `ownerOnly: Boolean(options.ownerOnly)`。
- `runRoutes(routes, ctx)`：匹配成功后、调用 `handle` 前检查：
  `route.ownerOnly && ctx.context.authMode === 'enforced' &&
  ctx.context.session?.role !== 'owner'` → 403 JSON
  `{ error: 'forbidden' }`，return true（视为已处理）。
- **不要**用「session 为空 = 开放模式」推断：主 handler 必须把
  `authMode: 'open' | 'enforced'` 显式放进 context（改
  `applyAuthGate` 返回值 server/api.mjs:4139-4180 与 context 组装
  server/api.mjs:4211）。理由：白名单路由也可能 session 为空，语义
  不能混（api.mjs:4152 与 :4165 两处 `{ session: null }` 现状不可
  区分，正是要显式下发的根因）。
- **authMode 必须无条件出现在 context 全部四种情形**（开放模式 /
  enforced+有 session / enforced+白名单无 session / 静态资源走不到
  routes 不算）：api.mjs:4211 现有三元在无 session 时落回裸
  serverContext，改造后不论哪个分支 context 都要带 authMode。
- runRoutes 的闸用**正判** `authMode === 'enforced'`，禁止
  `!== 'open'` 反判——任何未来新增的 authMode 取值或 undefined
  漏传，反判会把开放模式误 403（PA MF-3）。verify 脚本断言 5
  （开放模式非 403）就是这条的回归防线。

### 1b. 挂闸清单（整模块）

以下模块**所有路由**加 `ownerOnly`（含 GET——它们是策展后台的读面，
member 无对应 UI）：

- `server/imports/legacyImportRoutes.mjs`（12 条，其中 6 条写 bank）
- `server/paper-import/paperImportRoutes.mjs`（3 条）
- `server/paper-import-ai/routes.mjs`（6 条：parse / analyze /
  analyze-seven-choices / analyze-cloze / analyze-grammar-fill /
  publish，PA MF-2 订正计数；verify 枚举以真实路由定义为准）
- `server/topic-labels/topicLabelBackfillRoutes.mjs`（1 条）
- `server/grammar-verb-profile/verbProfileBackfillRoutes.mjs`（1 条，写 sidecar，D4）

### 1c. 挂闸清单（逐条）

`server/question-bank/questionGroupRoutes.mjs`：

- POST `/api/question-groups`（:21）
- PUT `/api/question-groups/:id`（:36）
- DELETE `/api/question-groups/:id`（:46）
- PUT `*/reading-parse`（:55）、PUT `*/cloze-parse`（:73）、
  PUT `*/seven-choices-parse`（:89）、PUT `*/grammar-parse`（:105）
- PUT `*/topic-labels`（:140）
- PUT `/api/questions/:id/difficulty-rating`（:146）
- POST 生成类（reading-parse :61 / cloze-parse :67 /
  seven-choices-parse :79 / grammar-parse :99 / summary :111 /
  topic-labels :117 / **synonym-difficulty :123**——PA MF-1 补列：
  它并非无条件 410，`localQwenEnabled` 时会真跑 AI 生成，符合 D6
  判据）——不写库但是经典详情页专属 AI 动作 + 花
  server key，一并挂闸。**前置核对**：DEV 先 grep 前端调用方，确认
  这 6 条只被经典模式/详情页/策展工作台调用；若发现任何 member 可见
  面（Concierge/DraftPaper/MySpace/exports）调用其中一条，停下来在
  报告里说明，该条不挂闸。

`server/paper-sets/routes.mjs`：

- POST `/api/paper-sets`（:26）、PUT `/api/paper-sets/:id`（:32）。
  GET 三条不挂（AI 模式可能要读试卷列表）。

### 1d. 明确不挂（member 面）

auth 全部、my-space 全部、draft-papers 全部、exports 全部、
ai-proxy 全部（status/semantic-search/steward/verify-question-group
——只读或不碰库）、teaching-facets、health、`/paper-assets/*` 静态、
`/api/ai/verify-trace`。这些仍受 M0-2 登录闸保护，本刀不动。

## 2. 前端改动（app/src）

### 2a. 角色视图 helper

- AuthGate（app/src/auth/AuthGate.tsx）向下暴露
  `isOwnerView: boolean`：开放模式（status==='open'）→ true；
  authenticated 且 `user.role === 'owner'` → true；member → false。
  形式由 DEV 定（扩 context value 或新 hook `useIsOwnerView()`），
  但**不许**让消费方自己写 `currentUser === null ? …` 的三元——
  开放模式语义只在 AuthGate 一处翻译。

### 2b. member 裁剪（isOwnerView === false 时）

- **homeMode 锁死 'ai'**：初始化（App.tsx:815-817）无视 localStorage
  的 `'classic'` 残留；`home-mode-toggle` 按钮（App.tsx:3403-3416）
  不渲染。不需要逐个改 12 处 `homeMode==='classic'` 分支——state 锁
  住它们自然不渲染。
- **topbar 4 个策展按钮不渲染**：导入资料（:3363）、整卷导入
  （:3367）、AI 导题（:3371）、给题库打主题标签（:3375-3402，含其
  结果/错误提示条）。
- **URL 直达失效**：`?view=paper-import` / `?view=paper-import-ai`
  路由 state（App.tsx:771-778 初始化，:3258-3264 渲染）在 member
  视角不激活（落回 AI 主页）。注意 App 挂载时 AuthGate 已解析完会
  话，role 可用。
- 保留：当前草稿卷、个人空间、用户名/退出、AI 模式全部交互
  （Concierge 加入草稿卷/找类似、DraftPaperWorkbench 组卷导出、
  MySpace 自有文件管理）。
- data-status 徽标、DeepSeek key 组、闭环面板本就 classic-only，
  homeMode 锁死后自动消失，不需要单独处理。

### 2c. owner / 开放模式零变化

isOwnerView === true 时前端行为与本刀之前逐像素一致（含开放模式）。

## 3. 验证

### 3a. 新 verify 脚本 `scripts/verify-owner-gate.mjs`

参照 `scripts/verify-auth-gate.mjs` 的临时库/起服务套路。断言：

1. 建 owner + member 两账号，各自登录拿 cookie。
2. **member 打 1b/1c 全部挂闸路由**（枚举正则对应的具体路径，路径
   参数用假 ID）→ 全部 403 `forbidden`（不需要合法 body——闸先于
   body 读取）。
3. owner 打同批路由 → 状态码 ∉ {401, 403}（400/404/200 都算过闸）。
4. member 打允许面样本 → 非 403：GET /api/question-groups、
   GET /api/paper-sets、GET /api/my-space、
   POST /api/draft-papers/current/items（合法 body）、
   GET /api/auth/me。
5. 开放模式（users 表空）：原挂闸路由样本非 401/403。
6. 403 响应体固定 `{ error: 'forbidden' }`，不泄漏路由存在性以外
   的信息。

进 `scripts/verify-ci.mjs` + `scripts/README.md`（housekeeping 闸
会查）。

### 3b. 既有回归

`pnpm -C app run verify:all` 全绿（verify-auth-gate 17 断言不许
碰坏）；tsc + vite build 过。

### 3c. 浏览器 QA（PM 做，DEV 不做）

member 账号：首屏=AI 模式、无切换按钮、无 4 策展按钮、localStorage
预置 `home-mode=classic` 后刷新仍进 AI、手打 `?view=paper-import`
落回主页、组卷/个人空间可用；owner 账号与开放模式零变化。

## 4. Forbidden

- 不动 schema/迁移（users.role 已就位）。
- 不动 M0-2 登录闸语义（白名单、开放模式判定、session 续期）。
- 不做 per-route 前端 403 错误 UI（member 正常走不到 403）。
- 不做经典模式功能搬家（roadmap：member 缺什么 M2 反馈后再说）。
- 不碰 contract 硬闸文件（domain/schema/Adapter/PaperSurface）。

## 5. 验收产出

改动文件清单 + verify-owner-gate 断言数与结果 + verify:all 结果 +
1c 前置核对的调用方 grep 证据（file:line）+ 已知风险。

## PA Follow-Up Decisions

PA 结论 APPROVE WITH 3 MF（`pa.md`），全部采纳并回填：

| MF | 处置 |
|----|------|
| MF-1 synonym-difficulty 漏列 | 已补进 1c 生成类挂闸清单（PM 亲验 :123-138：`localQwenEnabled` 时真跑 AI 生成，非无条件 410），verify 枚举同步含它 |
| MF-2 paper-import-ai 幽灵计数 7→6 | 已订正 1b；verify 枚举以真实 defineRoute 为准 |
| MF-3 authMode 四象限 + 正判 | 已钉进 1a：context 无条件带 authMode；runRoutes 用 `authMode === 'enforced'` 正判，禁反判 |

Open PO decisions：0 阻塞（D2/D3 为 owner 追认项，非阻塞）。
