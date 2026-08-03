# paper-import-ai-retire Decisions

本刀 = ADR-0016「网站端零导题 UI」**第 2 刀**（Cut 1 = C7「整卷导入」已合
PR #263；Cut 3 = legacy「导入资料」后续独立刀，需 grill）。三刀伞状决策见
`docs/adr/0016-website-zero-import-ui.md`。本文件只记面 A「AI 导题」特有的执行
决策；owner 已拍「网站端一切导题 UI 全退」大方向，本刀无新 PO 决策，D3–D5 为
PM/PA 层技术裁决（3 个 grill 开放问题的落定）。

## D1 只退面 A「AI 导题」一面

退役 `paper-import-ai`：`AdminWorkbench`「AI 导题」按钮（Sparkles）→
`PaperImportAiWorkbench` → 6 个 `/api/paper-import-ai/{parse,analyze,
analyze-seven-choices,analyze-cloze,analyze-grammar-fill,publish}` 路由。删网站
页面 + 前端 service + HTTP 路由 + 入口按钮 + `App.tsx` 路由态。legacy「导入资料」
不碰（Cut 3）。

## D2 分析器全留（KEEP 命门，「页面死引擎活」）

`server/paper-import-ai/` 下的分析器 **零改动**：analyzeReading / analyzeCloze /
analyzeSevenChoices / analyzeGrammarFill / analyzeGrammarFillVerbProfile /
analyzeWritingAnalysis / analyzeContinuationAnalysis / docxSplitter /
packageBuilder / extractJson / normalizePassageText / analyzerProviderShell +
`grammar-fill-facets-v1.json` + `grammar-fill-verb-axes-v1.json`。

grep 实证复用方（删引擎 = 砸后台生产线 + 看题页）：
- `scripts/import-pipeline/*`（01-split / 02-publish / validate-one / vp-driver /
  writing-analysis-driver / lib / verify-publish-gate…）直接 import 这些分析函数。
- `server/grammar-verb-profile/verbProfileBackfillService.mjs:9` import
  `analyzeGrammarFillVerbProfile`（独立端点 `/api/grammar-fill/verb-profiles/backfill`）。
- `packageBuilder.mjs` 内 `importMode: 'paper-import-ai'` 是引擎的导入模式标记
  字符串，**不是**要删的路由 —— grep 到勿删。

## D3 routes.mjs 纯删（grill 开放问题①：纯删 vs 降级内部库导出）

**裁决：纯删**。`server/paper-import-ai/routes.mjs`（199）整删，不降级为内部库
导出。理由：它是 HTTP 包装层，全库消费者只有三处 —— 前端 `services/
paperImportAi.ts`（本刀删）、`api.mjs` 注册（本刀删）、8 个 verify（本刀瘦身）。
离线管线 `import-pipeline` **直接 import 分析函数**（`analyzeReadingImportCandidate`
/ `buildPaperImportAiPackageFiles` 等），不经过 HTTP routes。routes 无任何库价值，
留它 = 死 HTTP 层。

## D4 multipart.mjs 连带删（routes.mjs 唯一消费者，删后彻底 orphan）

**裁决：连带删** `server/paper-import/multipart.mjs`（`parsePaperImportMultipart`）。
grep 实证：全库唯一 import 点 = `server/paper-import-ai/routes.mjs:1`。Cut 1 已删
它的另一历史消费者（C7 `paperImportRoutes.mjs`），故本刀删 routes.mjs 后 multipart
**彻底 orphan**（0 引用）。它是 HTTP multipart 表单上传解析（属页面/路由层，非
引擎 —— 离线管线读磁盘文件不走表单）。无任何 verify 断言其存在（`verify-c7-
paper-import-contracts/publish` 引擎测试不碰它，已 grep 确认）。

> ⚠️ **PA 压力点**：C7 收官记录曾写「multipart 三刀完成才连带删」—— 这是 C7 当时
> 的保守判断（当时它仍被面 A routes.mjs import）；本刀 grep 推翻：Cut 2 删 routes.mjs
> 即是它的死期，legacy 刀用的是 `server/imports/*`，永不碰 `server/paper-import/
> multipart`。若 PA 认为应保守（留 orphan + `// KEEP orphan` 注释、独立清洁刀清），
> 可回退 —— 成本 = 留一个永久死文件（无后续刀会碰 `server/paper-import/`）。牵连：
> `verify-i1-paper-import-splitter` 的 scope-guard 白名单不含 multipart，但该脚本
> **不在 CI 注册表**（假红非 gate），故不 widen 白名单。

## D5 8 混合 verify 原地瘦身 + 分析器不挪目录（grill 开放问题②③）

- **③ 原地瘦身**（不重组/不合并）：8 个 import `routes.mjs` 的 verify
  （i1-analysis / i1-splitter / i2 / i3 / i4 / i5 / i8 / i13）删掉 routes import +
  `createPaperImportAiRoutes()` 调用 + 所有路由注册断言 + 引用已删前端
  （serviceSource / pageSource / appSource / apiSource）的断言；**保留**
  `buildPaperImportAiPackageFiles` / `analyze*ImportCandidate` / `docxSplitter`
  引擎断言。改动最小，引擎测试覆盖不丢（这 8 个是各题型引擎的主要测试，无替身）。
- **② 分析器本刀不挪**中性目录。目录名 `paper-import-ai` 是历史遗留（分析器最初
  为 AI 导题写），物理位置不影响功能。挪目录 = 改所有 import 点 + 全部 verify =
  爆炸半径翻倍。记为独立清洁刀（ADR-0016 挂账），本刀严守 KEEP 零改动。
