# PA 冷读审计 — M0-3 权限两档（owner/member）

- 审计人：PA（独立冷读，未参与 plan 撰写）
- 分支：`cut/m0-3-role-gate` HEAD 9d77552
- 日期：2026-07-03
- 被审对象：`docs/cuts/m0-3-role-gate/plan.md`

## Verdict

**APPROVE WITH MUST FIX**

方向正确、切法合理、地基属实：闸放路由声明层集中执行是正解（复用 M0-2
单点闸可审计的教训）；`context.session.role` 与 `SessionUser.role` 数据契约
两端齐全；AuthGate 时序保证 member homeMode 锁死无竞态；member 面
（AI 模式 + Concierge + 草稿卷 + 个人空间 + 导出）与 roadmap #6 吻合。
plan 的 file:line 绝大多数亲验属实。

但挂闸清单有一条经典详情页 AI 生成路由被漏列、一处路由计数错误，且开放
模式下 `authMode` 进 context 的契约需要在 plan 里钉死（否则现有三元会把它
一起丢掉）。这三项在 DEV 动手前必须回填 plan，否则会复现前两刀「清单不完备
/ 幽灵计数」的返工。

## Product Principle

member 是熟人小圈里"只来找题组卷"的同事：他只需要 AI 模式取题、加入草稿卷、
组卷导出、管理个人空间。经典模式=策展后台=owner 的题库生产线，member 既无
对应 UI 也无写共享馆的权限。安全边界只有一条真实的：服务端 403；前端裁剪
只为让 member 的正常路径根本走不到 403。开放模式=owner 视角（本地单人现状，
不造第三种产品形态）。

## Exact Architecture Model（PA 亲验后的事实底座）

- 服务端闸：`defineRoute` 现为 3 参（router/index.mjs:1），本刀新增第 4 参
  `options.ownerOnly`；`runRoutes`（index.mjs:15-31）在 `route.handle` 前插入
  检查。检查条件必须是三元 AND：`route.ownerOnly && context.authMode ===
  'enforced' && context.session?.role !== 'owner'` → 403 `{error:'forbidden'}`。
- `authMode` 来源：`applyAuthGate`（api.mjs:4139-4180）现返回 `{ session }`，
  开放模式（4152）与白名单无 session（4165）都返回 `{session:null}`——**二者
  不可区分**，正是必须显式下发 authMode 的原因。context 组装在 api.mjs:4211，
  现为 `authResult.session ? {...serverContext, session} : serverContext`。
- role 可用性：`applyAuthGate` 已把 `role` 放进 session（:4179），
  `readSession` 返回 role（auth.mjs:197）。`context.session.role` 真实可用。
- 前端：`useCurrentUser()` 在 App.tsx:769 已调用（先于 homeMode init :815）；
  `SessionUser.role: 'owner'|'member'`（session.ts:14）；`/api/auth/me` 返回
  role（authRoutes.mjs:104）。AuthGate（AuthGate.tsx:53-62）在 `loading` 期
  只渲染占位 div，App 只在会话解析完成后挂载——**member homeMode 锁死无竞态、
  无闪现**。plan 2b 的时序断言成立。

## Must Fix Before DEV

### MF-1：挂闸清单漏列 `POST /api/question-groups/:id/synonym-difficulty`（questionGroupRoutes.mjs:123）

- 证据：`questionGroupRoutes.mjs` 共 18 条 defineRoute（:17…:146）。plan 1c
  枚举的 POST 生成类只列了 6 条（reading-parse :61 / cloze-parse :67 /
  seven-choices-parse :79 / grammar-parse :99 / summary :111 / topic-labels
  :117），**遗漏第 7 条 synonym-difficulty（:123）**。
- 定性：它是经典详情页专属 AI 生成动作（`generateSynonymDifficultyByQuestion
  Group` → `server/ai-parse/synonymDifficultyService.mjs`，不写库、当前 410
  disabled、前端服务函数 `generateSynonymDifficulty`（questionGroups.ts:589）
  **无任何调用方**）。正因如此它完全符合 plan D6 的挂闸判据（classic-detail
  专属、member 无 UI）。
- 风险：plan 的挂闸清单被呈现为"完备清单"，而 ADR-0013「后果」节自认的头号
  风险就是"路由escape闸"。这一条既不在 gate 列表，也就不会进 verify 3a step 2
  的枚举——闸和验证同时漏掉它。这正是前两刀「清单不完备」返工的同型。
- 要求处置：plan 1c 的 POST 生成清单显式加入 synonym-difficulty（:123），
  并进 verify-owner-gate 枚举；或按 D6「有则该条豁免并记录」的同一格式，在
  plan 里写明豁免理由（不写库 + 410 停用 + 无 UI）。默认取"挂闸"更符合
  gate-at-declaration 的一致性。

### MF-2：`paper-import-ai` 路由计数错误（plan 1b「7 条」实为 6 条）

- 证据：`server/paper-import-ai/routes.mjs` 只有 6 条 defineRoute
  （:83 parse / :109 analyze / :118 analyze-seven-choices / :127 analyze-cloze
  / :136 analyze-grammar-fill / :145 publish）。plan 1b 写「7 条」。
- 风险：verify 3a step 2 要求"枚举正则对应的具体路径"。若 DEV/verify 以"7"
  为锚点，会造出一条幽灵路径断言（前两刀「幽灵版本号」同型）。整模块按
  per-route 正则挂闸本身不受影响，但清单事实必须准确、verify 必须由真实路由
  生成而非照抄计数。
- 要求处置：plan 1b 改「7 条」为「6 条」（或直接列 6 条路径），并在 5. 验收
  产出里要求 verify 断言数与真实挂闸路由数逐条对齐。

### MF-3：`authMode` 必须在 context 的全部四象限都存在（开放模式无 session 会被现三元丢掉）

- 证据：context 组装 api.mjs:4211 现为
  `authResult.session ? { ...serverContext, session } : serverContext`。
  开放模式 session=null 时落到裸 `serverContext`——若 DEV 只把 authMode 塞进
  有 session 的分支，`context.authMode` 在开放模式/白名单无 session 两个象限
  会是 undefined。
- 风险：runRoutes 的门用 `authMode === 'enforced'` 判断。若开放模式下
  authMode 缺失（undefined ≠ 'enforced'）恰好也不触发闸——**碰巧正确**。但
  这依赖 undefined 的偶然行为，语义不闭环，且一旦有人把默认判据写反（如
  `authMode !== 'open'`）就会在开放模式误 403。plan 1a 只说"改返回值与 context
  组装"，未钉死 authMode 必须无条件出现在 context。
- 要求处置：plan 1a 增补一条硬约束——`applyAuthGate` 返回 `{ session,
  authMode }`（open-mode/白名单无 session 时 `session:null, authMode:'open'`
  或 `'enforced'`），context 组装改为无条件带上 authMode（`{...serverContext,
  authMode, ...(session ? {session} : {})}`）；runRoutes 的门判据用
  `authMode === 'enforced'`（白名单/正判），不得用 `!== 'open'` 反判。verify
  3a step 5（开放模式样本非 401/403）已能兜底回归，但契约需先在 plan 写死。

## Must Fix -> Plan Disposition Checklist

| MF | plan.md 应记录的处置 |
|----|----------------------|
| MF-1 | 1c POST 生成清单显式加入 `synonym-difficulty`（:123）+ 进 verify-owner-gate 枚举；或以 D6 豁免格式记录不挂闸理由 |
| MF-2 | 1b 改「7 条」→「6 条」（或直列 6 路径）；5. 验收产出要求 verify 断言数 = 真实挂闸路由数并逐条对齐 |
| MF-3 | 1a 增补硬约束：`applyAuthGate` 返回 `{session, authMode}`，authMode 无条件进 context，runRoutes 门用 `authMode==='enforced'` 正判；列为 Verification 覆盖点 |

## Should Watch

- **SW-1 前置核对的 stop-condition 必须真执行**：plan 1c/D6 要求 DEV grep 6 条
  （含 MF-1 后 7 条）POST 生成路由的前端调用方，确认无 member 面调用。PA 已
  抽验 `synonym-difficulty` 前端无调用方、`reading-parse` 等在 `services/
  questionGroups.ts` 但调用面是 classic 详情页。DEV 的 grep 证据（file:line）
  必须进验收产出（plan 5. 已要求），CR 核对。非阻塞，但漏做=挂错闸弄坏
  member 面的风险入口。
- **SW-2 新路由默认不挂闸的长期风险**：ADR-0013 已自认——verify 枚举只覆盖
  当前清单，未来新写的 bank-write 路由漏挂闸时 verify 抓不到，只靠 CR + 惯例。
  接受为残留，但建议 verify-owner-gate 头部注释写明"新增 bank-write/策展路由
  必须同步加断言"，把惯例钉在脚本里而非只在 ADR。
- **SW-3 topbar 4 按钮与 homeMode 的关系**：PA 已核实——4 策展按钮（:3363/
  :3367/:3371/:3375）与 toggle（:3403）**不**受 `homeMode==='classic'` 包裹，
  在 AI 模式下对 owner 也渲染；data-status（:3306）/DeepSeek key 组（:3325）/
  闭环按钮（:3357）**受** classic 包裹、homeMode 锁死后自动消失。plan 2b 的
  分类正确。DEV 勿把 4 按钮误当"classic-only 自动消失"处理。
- **SW-4 D2/D3 owner 追认**：开放模式=owner 视角、member 入口隐藏而非禁用，
  两条 PM 拍板 PA 无反对（隐藏对熟人圈更干净；开放模式裁剪会瘫痪本地策展）。
  仍是 owner 追认项，不阻塞 DEV。

## Data-Contract Notes

- `applyAuthGate` 返回值本刀从 `{session}` 扩为 `{session, authMode}`——这是
  唯一新增的服务端内部契约，MF-3 已钉死其四象限完备性。
- 403 响应体固定 `{error:'forbidden'}`（D1/verify 3a step 6），不泄漏路由
  存在性以外信息——与 M0-2 的 `not_authenticated`/`invalid_credentials`
  防枚举风格一致，PA 认可。
- 前端 `isOwnerView` 语义（AuthGate 一处翻译 open→true）：`useCurrentUser()`
  返回 null 当且仅当开放模式（authenticated 恒有 user，loading 期不渲染
  children）。plan 2a 禁 `currentUser===null?…` 三元、集中到 isOwnerView 的
  设计正确——null=open=owner-view 虽然当前成立但非直觉，集中翻译防漂移。

## Allowed Files

- `server/router/index.mjs`（defineRoute 加第 4 参 + runRoutes 加门）
- `server/api.mjs`（applyAuthGate 返回值 + context 组装 :4211）
- `server/imports/legacyImportRoutes.mjs`、`server/paper-import/paperImportRoutes.mjs`、
  `server/paper-import-ai/routes.mjs`、`server/topic-labels/topicLabelBackfillRoutes.mjs`、
  `server/grammar-verb-profile/verbProfileBackfillRoutes.mjs`、
  `server/question-bank/questionGroupRoutes.mjs`、`server/paper-sets/routes.mjs`
  （加 `{ownerOnly:true}`）
- `app/src/auth/AuthGate.tsx`（暴露 isOwnerView / hook）
- `app/src/App.tsx`（homeMode 锁 / 4 按钮 + toggle 隐藏 / URL route 失效）
- `scripts/verify-owner-gate.mjs`（新建）、`scripts/verify-ci.mjs`、`scripts/README.md`

## Forbidden Files

- schema / 迁移（users.role 已就位，本刀不碰）
- M0-2 登录闸语义：`applyAuthGate` 的白名单/开放模式判定/session 续期逻辑
  （只允许扩返回值，不改判定）、`server/auth/*`
- member 面路由：`server/auth`、`server/my-space`、`server/draft-paper`、
  `server/exports`、`server/ai-proxy`、`server/search/teachingFacets.mjs`
  （不得误挂 ownerOnly）
- contract 硬闸：domain / schema / Adapter / PaperSurface

## Static Verify Requirements

- 新建 `scripts/verify-owner-gate.mjs`，断言 plan 3a 六条，其中：
  - step 2 member 打**全部挂闸路由**403——枚举必须从真实路由生成（含 MF-1
    的 synonym-difficulty，见 MF-2 计数），不照抄 plan 计数。
  - step 3 owner 打同批 → ∉ {401,403}（证明没弄坏 owner 面）。
  - step 4 member 打允许面样本 → 非 403（证明没误挂坏 member 面）。
  - step 5 开放模式样本 → 非 401/403（覆盖 MF-3 的 authMode='open' 象限）。
- 进 `scripts/verify-ci.mjs` + `scripts/README.md`（housekeeping 闸会查）。
- 回归：`pnpm -C app run verify:all` 全绿（verify-auth-gate ~17 断言不许碰坏）
  + tsc + vite build 过。

## Browser QA Matrix（PM 做，DEV 不做）

- member：首屏=AI 模式 / 无切换按钮 / 无 4 策展按钮 / localStorage 预置
  `home-mode=classic` 刷新仍进 AI / 手打 `?view=paper-import` 与
  `?view=paper-import-ai` 落回主页 / Concierge 加草稿卷 + 组卷 + 个人空间可用。
- member 绕前端：curl 直打一条挂闸路由（带 member cookie）→ 403 forbidden
  （D5 硬要求）。
- owner + 开放模式：与本刀之前逐像素一致（含 4 策展按钮、toggle、URL 直达）。

## DEV Readiness

- 改进的 teacher action：给共享馆装 owner/member 权限边界，member 只见 AI 模式。
- before/after：before=任何登录用户可写共享馆 + 见 4 策展按钮 + URL 直达经典
  后台；after=member 服务端 403 + 前端隐藏、owner/开放模式零变化。
- 当前刀边界：路由声明层挂闸 + 前端裁剪 + verify；不做细粒度 ACL、不做 403
  专属错误页、不做经典功能搬家。
- 未来刀边界：M0-4 数据隔离（user_id 圈范围）、M2 反馈后按需搬功能。
- Open PO Decisions：0 条阻塞（D2/D3 为 owner 追认、非阻塞）。
- 结论：三条 MF 回填 plan 后 DEV-ready。MF 均为 plan 层事实/契约补全，不改
  方向。

## Open PO Decisions

无阻塞项（≤3）。D2（开放模式=owner 视角）、D3（member 入口隐藏）为 owner
追认项，PA 无反对，不阻塞 DEV。

## PA 亲验事实清单（file:line）

- router/index.mjs:1（defineRoute 现 3 参）、:15-31（runRoutes 无门）✓
- api.mjs:4139-4180（applyAuthGate 返回 `{session}`，4152/4165 两处 null
  不可区分）、:4211（context 三元，null→裸 serverContext）、:4179（session
  带 role）、:96（serverContext 无 authMode 字段）✓
- api.mjs:149-153（h1Routes 仅 health GET）、:477-491（serverRoutes 组装）✓
- questionGroupRoutes.mjs 18 条 defineRoute（:17…:146）；**:123
  synonym-difficulty 未在 plan 1c**；GET :17/:27 正确不挂 ✓
- paper-sets/routes.mjs：GET :9/:13/:17 不挂、POST :26 / PUT :32 挂 ✓
- paper-import-ai/routes.mjs：**实为 6 条**（:83/:109/:118/:127/:136/:145），
  plan 1b「7 条」错 ✓
- paper-import 3 条、legacyImport 12 条、topic-labels 1 条、verbProfile 1 条 ✓
- member 面 draft-paper(12)/my-space(9)/exports(4)/ai-proxy(4:
  status/semantic-search/steward/verify-question-group) 均无 bank-write、
  plan 1d 正确不挂 ✓
- 全部 `openDatabase({readOnly:false})` bank-write helper（api.mjs 11 处 +
  imports/paper-import/paper-import-ai）逐一映射到挂闸路由，无一流入 member
  模块 ✓
- AuthGate.tsx:53-62（loading 期不渲染 children，无竞态）✓
- session.ts:14（SessionUser.role）、authRoutes.mjs:104（/me 返回 role）✓
- App.tsx:769（useCurrentUser 先于 homeMode）、:815-817（homeMode init）、
  :771-778（paper-import URL init）、:3258-3264（PI render）、:3363/:3367/
  :3371/:3375-3402（4 按钮）、:3403-3416（toggle）、:3306/:3325/:3357
  （classic-only 三件套）✓
- scripts/verify-auth-gate.mjs（~17-18 断言存在）、verify-ci.mjs、README.md ✓
- synonymDifficultyService.mjs（不写库）、questionGroups.ts:589
  generateSynonymDifficulty 无前端调用方 ✓
