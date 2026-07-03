# CR 冷读审查 — M0-3 权限两档（owner/member）

- 审查人：CR（独立冷读，未参与 plan/DEV/PA）
- 分支：`cut/m0-3-role-gate` HEAD bf29fef，基线 main 63b7109
- 日期：2026-07-03
- 被审 diff：`git diff 63b7109...HEAD`（4 代码 commit + 3 docs commit）

## Verdict

**APPROVE**

服务端 403 是唯一真实边界，本刀把它做对了：挂闸清单与 plan 1b/1c 逐条对齐
（41 条），member 面零 bank-write 路径，前端裁剪三件套齐全且只在 AuthGate 一处
翻译 open→owner-view。PA 3 MF 全部落进代码并被 verify 枚举覆盖。full verify:all
63/0 全绿，无回归。无 Must Fix。

## 我跑过的验证与结果

| 验证 | 结果 |
|------|------|
| `node scripts/verify-owner-gate.mjs` | 7/0 PASS（member 全 41 条 403、owner 全 41 条不 401/403、开放模式样本非 401/403、403 body 恒 `{error:'forbidden'}`）|
| `node scripts/verify-auth-gate.mjs`（M0-2 回归）| 17/0 PASS，语义未碰坏 |
| `node scripts/verify-h1-router-skeleton.mjs`（H1 骨架闸）| 28/0 PASS，router 无 `auth` 字样 |
| `pnpm -C app run verify:all` | **63 PASS / 0 SKIP / 0 FAIL** |
| `pnpm -C app run build`（tsc + vite）| 通过，无类型错误 |
| 逐模块 `grep defineRoute` vs `ownerOnly` 交叉核对 | 见下，全对齐 |

## 挂闸完备性交叉核对（源码 grep vs plan 1b/1c）

| 模块 | defineRoute 调用 | ownerOnly | 未挂 | 判定 |
|------|:-:|:-:|------|------|
| legacyImportRoutes | 12 | 12 | 0 | 整模块 ✓ |
| paperImportRoutes | 3 | 3 | 0 | 整模块 ✓ |
| paper-import-ai/routes | 6 | 6 | 0 | 整模块（MF-2 计数订正为 6 已落实）✓ |
| topicLabelBackfillRoutes | 1 | 1 | 0 | 整模块 ✓ |
| verbProfileBackfillRoutes | 1 | 1 | 0 | 整模块（D4 sidecar）✓ |
| questionGroupRoutes | 18 | 16 | 2×GET（:25/:40 列表+详情）| 含 synonym-difficulty（MF-1 补列）✓ |
| paper-sets/routes | 5 | 2（POST :29 / PUT :40）| 3×GET | ✓ |

- 反向核对：member 面模块（my-space/draft-paper/exports/ai-proxy/search）
  **无一条** `openDatabase({readOnly:false})`；draft-paper 读 bank 处全部
  `readOnly:true`；写只落 `openUserDatabase`（per-user 数据）。member 无任何
  写共享馆路径（含间接）。
- GET 通过面（question-groups 列表/详情、paper-sets 三 GET、my-space、
  draft-papers、exports、ai-proxy、health）均未误挂，verify 断言 4 兜底。

## 闸语义四象限（api.mjs:4188-4208 + :4237-4243 走读）

- `applyAuthGate` 四分支全部显式带 authMode：开放模式=`'open'`（:4159）、
  白名单无 session=`'enforced'`（:4172）、有 session=`'enforced'`（:4204）、
  401/null 已 return。四象限完备（PA MF-3 落实）。
- context 组装（:4240-4242）无条件带 authMode，不再依赖三元丢裸 serverContext。
- `ownerGateBeforeHandle`（api.mjs:4197-4207）用正判 `authMode === 'enforced'`，
  未来漏传/新值一律 fail-open（不误 403 开放模式）。403 在 `route.handle` 前
  短路（runRoutes:35-37），先于 body 读取，符合 D1。
- 策略/机制拆分正确：403 政策住 api.mjs 回调，router/index.mjs 保持纯分发骨架，
  H1 闸 28/0 原样通过（bf29fef 的搬迁 commit 是这条的落实）。

## 前端裁剪（App.tsx / AuthGate.tsx 走读）

- isOwnerView 单点翻译：AuthGate.tsx:79 `state.status !== 'authenticated' ||
  role === 'owner'`，经 `useIsOwnerView()` 下发；App.tsx 全部消费布尔，无
  `currentUser === null` 三元。默认值 `true`（fail-open 到 owner 形态，与
  pre-M0-2 一致；即便 fail-open 服务端仍 403，可接受）。
- homeMode 锁（:821-827）：member 无视 localStorage 'classic' 残留恒 'ai'。
- 4 策展按钮 + toggle（:3373-3436）全部 `isOwnerView &&` 包裹。
- URL 直达废（:776-784）：`?view=paper-import[-ai]` 初始化 member 恒 false；
  唯二 setter（openPaperImportWorkbench/AiWorkbench :3223/:3234）只被那两个隐藏
  按钮调用，无 popstate 监听重读 view 参数，无绕过再激活面。

## DEV Self-Review Blind Spots 核查结论

1. **owner 面手挑 5 条样本** — 实际 verify 断言 3 是 owner 打**全 41 条**不
   401/403（脚本 :291 遍历 `GATED_ROUTES` 全量）。DEV 此项自评过于保守，owner
   误伤面已是全量覆盖，非样本。开放模式（断言 5）确为 5 条样本，但那是唯一
   authMode='open' 分支的兜底，全量枚举已由 fixture A 证明，可接受。
2. **beforeHandle 无单元 tripwire** — 属实，只有黑盒 HTTP 断言。但 41 条 member
   403 + owner 全通 + 开放模式非 403 三面 HTTP 集成已实证覆盖钩子全部分支；
   钩子逻辑仅 5 行纯函数，风险低。非阻塞。
3. **前端仅静态证据，浏览器 QA 归 PM** — 属实，且服务端 403 是真边界，前端
   fail-open 也兜得住。接受分工。

## Should Watch（非阻塞）

- **SW-1 新路由默认不挂闸**：`defineRoute` 省略第 4 参 = member 可用。未来新写
  bank-write/策展路由漏挂闸时 verify-owner-gate 枚举抓不到，只靠 CR + 惯例。
  ADR-0013「后果」已自认。建议后续在 verify-owner-gate 头部注释钉死「新增
  bank-write 路由必须同步加断言」（PA SW-2 同）。当前清单完备，不阻塞。
- **SW-2 开放模式非 401/403 只 5 条样本**（verify-owner-gate.mjs:332）：authMode
  ='open' 分支的回归防线是样本而非全量。逻辑上 authMode 全局单值，样本足够
  证明分支；但若未来有人给某模块单独改判据，样本可能漏网。低风险。
- **SW-3 isOwnerView 默认 true（fail-open）**（AuthGate.tsx:14）：provider 未
  就位时消费方拿 owner 视角。当前 AuthGate loading 期不渲染 children，无真实
  暴露窗口；且服务端 403 兜底。记录备查，不阻塞。

## 结论

无 Must Fix。方向、切法、实现、验证四项齐全，PA 3 MF 全部实证落地，回归零破坏。
D2（开放模式=owner 视角）/D3（member 入口隐藏）仍是 owner 追认项，非阻塞合并。
建议 APPROVE 合并。
