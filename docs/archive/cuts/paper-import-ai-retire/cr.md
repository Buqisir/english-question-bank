# CR Review — paper-import-ai-retire（面 A「AI 导题」退役，PR #264）

Reviewer: CR (fresh cold context, Opus 4.8)
Branch: `claude/paper-import-ai-retire`  Base: github/main@75c7a74（含 Cut 1）
Contract: `plan.md`（C1–C6 + Forbidden）+ `decisions.md`（D1–D5）+ `pa.md`（APPROVE w/1MF）

## Verdict: APPROVE（0 Must Fix）

纯删刀执行外科级干净。KEEP 命门（12 分析器 + 2 json + publisher/validator/storage）
`git diff --stat` 零改动；`App.tsx` 2 处 cross-reset 确为函数保留只删行；8 混合
verify 只删死断言、引擎断言（analyze*/packageBuilder/docxSplitter）全留；MF-1
（owner-gate openModeSample）已按 plan 修法落地；`verify:all` = 64 pass / 1 skip
（i16a off-repo）/ 0 fail。与 plan / pa 无偏离。

## 核查点 1 — KEEP 命门零改动（最重要）— PASS

`git diff github/main HEAD --stat -- server/paper-import-ai/ server/paper-import/`
只显示两个删除：`routes.mjs`（−199）+ `multipart.mjs`（−72）。12 个分析器 .mjs +
2 个 json + `publisher/validator/storage.mjs` **零改动**。`scripts/import-pipeline/`
/ `server/grammar-verb-profile/` / `data/sql/` 三个 KEEP 前缀 diff 全空。C2/C5 +
Forbidden 完全满足，「页面死引擎活」契约完整。

## 核查点 2 — App.tsx / AdminWorkbench 外科正确 — PASS

`App.tsx`（−40）逐处核对无误：
- import 删整行 ✓
- `paperImportAiRouteActive` useState 块删（`adminRouteActive` 独立保留）✓
- **2 处 cross-reset 是函数保留只删行**：`openDraftPaperWorkbench` 内只删
  `setPaperImportAiRouteActive(false)` 一行（其上 pushState / 其下
  `setMySpaceRouteActive(false)` / `setCurrentPiRoute` / `setDraftPaperRoute` 全留）；
  `openMySpace` 内同理（其下 `setMySpaceRouteActive(true)` 保留）✓
- back handler `paperImportAiOnBackToWorkbench` + open handler
  `openPaperImportAiWorkbench` 两个 useCallback 整块删 ✓
- 挂载块 `if (paperImportAiRouteActive) {...}` 整块删 ✓
- `<AdminWorkbench>` 的 `onOpenPaperImportAiWorkbench` prop 删 ✓

`AdminWorkbench.tsx`（−8）：icon import 去掉 `Sparkles`（`FileText/Plus/RefreshCw/Tag`
保留）、prop 类型 + 解构 + 「AI 导题」按钮 JSX 全删；「导入资料」按钮（Cut 3）保留 ✓

`grep -n "paperImportAi\|PaperImportAi\|paper-import-ai" App.tsx AdminWorkbench.tsx`
→ **零命中**（exit 1）。`grep -n "Sparkles" AdminWorkbench.tsx` → **零命中**（无
orphan，`noUnusedLocals` 无隐患）。V4 满足。

## 核查点 3 — verify 瘦身未丢引擎覆盖 — PASS

抽查 i1-analysis / i1-splitter / i2 / i3 / i4 / i5 / i8 / i13 —— 删的是
`createPaperImportAiRoutes` import + `routes.some(...route registered...)` +
`routeSource`/`serviceSource`/`pageSource`/`apiSource` 断言；**保留**：
- `buildPaperImportAiPackageFiles` import + `assertPackageBuilder()`（i2/i3/i4/i5/i8/i13
  main 里都还在跑，build 调用数 3~7 处/脚本）
- `analyzeSevenChoices`/`analyzeCloze`/`analyzeGrammarFill`/`analyzeReading` 引擎断言
- `docxSplitter`（`parseReading*` + `mammoth.extractRawText`）
- validator/publisher/storage/facets json 断言

i1-splitter 删掉 `apiSource.includes('createPaperImportAiRoutes')` 死断言 +
route.pattern 断言，保留 `mammoth.extractRawText` + `mammoth` 依赖断言（引擎测试未删空）。
i1-route + h11b 确为整删（stat 显示 −67 / −137 全文件消失）。C3 满足，无引擎覆盖损失。

## 核查点 4 — MF-1（owner-gate openModeSample + 计数注释）— PASS

`verify-owner-gate.mjs`：6 条 `/api/paper-import-ai/*` 端点 + 上方注释删除 ✓；
`openModeSample` 从硬编码 `[GATED_ROUTES[0],[12],[18],[27],[31]]` 换为
length-relative `[GATED_ROUTES[0], GATED_ROUTES[Math.floor(length/2)],
GATED_ROUTES[length-1]]` ✓；注释「not the full 33」→「not the full enumeration」
（写死数字去除）+ 补 first/middle/last 说明 ✓。与 pa.md MF-1 修法逐字一致。
`verify-owner-gate`（CI gate）PASS。

## 核查点 5 — D4 multipart 删安全 + 无残留 landmine — PASS

`grep -rn "paper-import/multipart\|parsePaperImportMultipart\|createPaperImportAiRoutes\|paper-import-ai/routes\|services/paperImportAi\|from.*paperImportAi'" server scripts app`
—— 仅 5 命中，全部为 **scope-guard 白名单内的 inert 字符串常量**（`Set([...])`
的 allowlist 项），非 `readFileSync` / import：
- `verify-i1-paper-import-analysis.mjs:366/388`（`allowedFiles` / `scopeRelevantFiles`）
- `verify-i1-paper-import-splitter.mjs:76/92/111`（`allowed` / `scopeRelevantFiles`）

已 `sed` 核实上下文：这些是权限许可项，删后不 read 已删文件，不构成 landmine。
live 消费者（api.mjs 注册 / 前端 service / 8 verify 的 route 断言）**零命中**。
D4 连带删安全（`multipart.mjs` 唯一消费者 routes.mjs 已删）。V5 满足。

## 核查点 6 — verify:all 全绿自证 — PASS

`pnpm -C app run verify:all` 末尾：**PASS 64 / SKIP 1 / FAIL 0**；唯一 skip =
`verify-i16a`（off-repo fixture absent，非回归，与 plan V1 预测一致）。owner-gate
/ h11a 手术后均在 CI 绿。i16a `invalidationRouteFiles` 段删除后 CI 恒 skip 不受影响。

## Must Fix

无。

## Should Watch（非阻塞）

- **SW-1**：`verify-i1-paper-import-analysis.mjs` / `verify-i1-paper-import-splitter.mjs`
  的 scope-guard 白名单里仍留 `app/src/services/paperImportAi.ts` /
  `server/paper-import-ai/routes.mjs` 等已删文件的字符串常量（inert 许可项，非
  read）。plan 明确「不 widen i1-splitter 白名单」，故留着符合契约；但这两处白名单
  现指向不存在的文件，属可清理的死字符串。归入 ADR-0016 独立清洁刀（同 httpClient.ts
  注释、分析器挪中性目录一并清），本刀不动正确。
- **SW-2**：i16a 是 CI 恒 skip 脚本；将来若把 off-repo fixture 引入 CI，需确认
  teaching-facet invalidation 在离线 publish 路径（publisher / import-pipeline）另有
  覆盖——非本刀责任，记 ADR-0016 挂账域（与 pa.md SW-3 一致）。
- **SW-3**：本刀未跑 Browser QA（C6 Matrix / V6）。CR 代码层已确认 `?view=paper-import-ai`
  的 useState + 挂载块全删（该 URL 参数不再激活任何界面、落回正常工作台），逻辑上
  满足 Matrix「直接访问 `?view=paper-import-ai` 不崩溃」；但真机双视角 QA 仍建议在
  merge/redeploy 后由 owner 补验（storage 静态服务 + 分析器未动 → 看题读解析应正常）。

## 与 plan / pa 的一致性

- plan C1–C6 + Forbidden 全部满足；D1–D5 执行到位。
- pa.md MF-1 已落地（核查点 4）；pa 的 SW-1（httpClient inert）/ SW-3（i16a）本刀
  按契约保留，无偏离。
- 无 Forbidden 越界：publisher/validator/storage / import-pipeline /
  verbProfileBackfillService / data/sql / EntryModal / legacy 导入资料 / c7 verify /
  httpClient.ts / i16b/i16c/i7/i11/i14/i6/relay-json 全未碰（stat + grep 自证）。
