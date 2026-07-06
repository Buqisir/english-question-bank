# ADR-0016: 网站端零导题 UI（导题只在后台 Agent）

- Status: Accepted（2026-07-05，owner 黄学伟拍板）
- 上游：ADR-0015（网站界面只做消费）；产品原则「生产在后台 Agent、网站只做
  消费」（owner 2026-07-05）；ADR-0007（六题型发布门）
- 落地：分刀实施——`c7-paper-import-retire`（本刀，整卷导入）、面 A「AI 导题」
  退役刀、legacy「导入资料」退役刀。

## 背景

ADR-0015 把「网站只做消费」的靶子对准了详情视图的现场生产动作。owner 在
后续 QA 中把原则推到最彻底的形态：**网站端一切「导题」入口全部退役**。

原话（2026-07-05）：「以后只有后台 Agent 的导题；普通导题、人工导题这些
网站端 UI 全部不要。」

现状：导题 UI 是 `AdminWorkbench` 上的 **3 颗按钮**——
- 「整卷导入」`paper-import`（C7，结构化整卷 asset 包 → 校验 → 发布）
- 「AI 导题」`paper-import-ai`（面 A，整卷 docx → 拆题 → 跑 AI 解析 → 发布）
- 「导入资料」`legacy-import`（人工导题后台，本地扫描 + 补录 + 答案对齐）

这些是 owner 更早设想「网站现场生产」时留下的壳。实际的生产**早已在后台**：
`scripts/import-pipeline/` 离线管线导题、出题 skill 生产解析、backfill 打标签。
网站导题 UI 是虚假需求，member（普通老师）完全不需要。

## 决策

**网站界面提供零个「导题」入口。所有导题（结构化整卷 / AI 拆题 / 人工补录）
只在后台 Agent（`scripts/import-pipeline/` + 出题 / backfill skill）完成。**

删除范围（跨 3 刀）：网站**页面组件 + 前端 service + HTTP 导题路由 + 入口
按钮 + 相关 App.tsx 路由态/handler**。

### 要害：「页面死、引擎活」——后端分析器/发布器是库函数，必须保留

删的是**网站消费不到的 HTTP 包装 + 前端**；被后台离线管线当**库函数复用**的
后端引擎**必须原样保留**：

- `server/paper-import-ai/*.mjs` 分析器（analyzeReading / Cloze / SevenChoices /
  GrammarFill / GrammarFillVerbProfile / WritingAnalysis / ContinuationAnalysis /
  docxSplitter / packageBuilder / extractJson / normalizePassageText /
  analyzerProviderShell）——被 `scripts/import-pipeline/*.mjs` +
  `server/grammar-verb-profile/verbProfileBackfillService.mjs` 直接 import。
- `server/paper-import/{publisher,validator,storage}.mjs`——import-pipeline
  02-publish 动态 import 发布 + `api.mjs` 建表（`ensurePaperImportDatabaseShape`）
  + `/paper-assets/*` 静态服务（**看题 / 详情页读题基建**）。
- `server/paper-import/multipart.mjs`——半死（仅 HTTP 导题路由用）；**删完
  所有 HTTP 导题路由（3 刀完成）后**才失去最后调用方，届时连带删。

删这些引擎会**同时砸掉后台生产线和 member 看题页**。

## 排除项

- 不碰后台离线管线 `scripts/import-pipeline/` 及其复用的分析器/发布器。
- 不碰看题 / 详情读题基建（`storage.mjs` 的 `/paper-assets/*` 静态服务）。
- 不碰 `verify-c7-paper-import-contracts` / `verify-c7-paper-import-publish`
  ——名字带 `paper-import` 是巧合，测的是**引擎契约**不是 UI，保留（删 PR
  里加注释防未来误删）。
- `EntryModal`（`mode="edit"` 编辑已入库题组）**不是导题入口**，保留。
- 不建替代「管理页」——member 不需要，owner 的运营改数据走后台（见 ADR-0015
  §1）。

## 后果

- `AdminWorkbench` 三颗导题按钮全部消失；网站无任何整卷/AI/人工导题界面。
- 导题产能不减——后台离线管线继续导题，引擎全留。
- 分 3 刀可逆实施（每刀纯删 UI + 薄路由，git revert 即回）；先 clean 后
  gnarly：C7（整卷导入，最小）→ 面 A（AI 导题）→ legacy（人工导题，最大、
  需 grill）。
- 每刀 verify 随动：删 UI/路由的 verify（纯删）+ 引擎 verify（保留）+ 面 A
  scope-guard 的跨刀容忍（widen whitelist）。
- 三刀完成后 `multipart.mjs` 失去最后调用方，末刀连带删。
