# c7-paper-import-retire — Agent Entrypoint

Cut: 退役 C7「整卷导入」网站界面（ADR-0016 arc 第 1 刀，3 刀中最小最干净）。
删网站页面 + 前端 service + HTTP 路由 + 入口按钮；**引擎全留**（页面死引擎活）。

## Must Read（cut-specific，短）

- `docs/cuts/c7-paper-import-retire/plan.md` — DEV 执行契约（C1–C5 + DELETE/KEEP
  + verify 三类手术 + Forbidden + Browser QA Matrix）。
- `docs/cuts/c7-paper-import-retire/decisions.md` — owner 拍板 D1–D3（无新 grill）。
- `docs/adr/0016-website-zero-import-ui.md` — 产品边界「为什么」+ KEEP 命门。

## Background（已加载可跳过）

- `AGENTS.md` — 角色 / 流程 / gate（本刀 medium，PA→DEV→CR→QA→RM）。
- `docs/cuts/ai-enhancement-retire/plan.md` — 同 arc 上一刀（删 WRITE 留 READ 切法
  先例；PA 抓漏删 build-break 先例）。

## 关键提醒（侦察钉的易漏 / 易误删点）

- **⚠️ 4 处 cross-reset 易漏**：`setPaperImportRouteActive(false)` 散在
  `openDraftPaper`(~1690) / `openMySpace`(~1728) / 面 A 的
  `paperImportAiOnBackToWorkbench`(~1779) / `openPaperImportAiWorkbench`(~1801)。
  删 useState 前必须清干净这 4 处，否则 `tsc` 崩（面 A scope-guard 不在 CI，兜
  不住）。
- **引擎 KEEP 命门**：`server/paper-import/{publisher,validator,storage,multipart}.mjs`
  + `server/paper-import-ai/*` 零改动。`multipart.mjs` 本刀仍被面 A `routes.mjs`
  import，**保留**（三刀完成才连带删）。
- **verify 三类手术**（`verify:all` = verify-ci 注册表，非 glob）：纯删 h1c/smoke-c7；
  外科手术 h1d/i16a/h11a/owner-gate（只删对已删物的断言/条目，别动引擎/面 A 断言）；
  保留 c7-contracts/c7-publish（测引擎，加防误删注释）。
- **面 A 不碰**：`?view=paper-import-ai` / `paperImportAi*` / AdminWorkbench 面 A
  按钮（Sparkles）—— Cut 2 才动。`FileText` icon 保留（legacy 按钮也用）。
- **DEV 不许 spawn 子代理**。
