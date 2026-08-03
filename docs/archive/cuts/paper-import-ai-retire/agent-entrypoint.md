# paper-import-ai-retire — Agent Entrypoint

退役面 A「AI 导题」网站界面（ADR-0016 第 2 刀）。分支 `claude/paper-import-ai-retire`
（从 `github/main`@75c7a74 起，含 Cut 1）。

## Must Read（本刀特定，短）

1. `docs/cuts/paper-import-ai-retire/plan.md` —— DEV 契约（硬契约 C1–C6 + 参考实现
   真坐标 + Forbidden + Verification + QA Matrix + DEV 顺序）。
2. `docs/cuts/paper-import-ai-retire/decisions.md` —— D1–D5（含 3 个 grill 开放
   问题的落定 + D4 multipart 连带删的 PA 压力点）。
3. `docs/adr/0016-website-zero-import-ui.md` —— 伞状决策「页面死引擎活」。

## 命门（一句话记牢）

**删的是「页面 + HTTP 路由 + 前端 service」；`server/paper-import-ai/` 下的 12 个
分析器 + 2 个 json 零改动**（被 `scripts/import-pipeline/*` 离线生产线 +
`verbProfileBackfillService` 复用，删 = 砸后台线 + 看题页）。只有 `routes.mjs` 是
要删的 HTTP 层；连带删已 orphan 的 `server/paper-import/multipart.mjs`。

## 三个易踩雷（血泪，本 arc 实证）

- **行号已漂 1~42 行**（Cut 1 −42 的累积效应）—— 一律 grep 符号定位，勿信 plan 里
  的行号（仅快速定位用）。
- **2 处 cross-reset**（`openDraftPaperWorkbench` / `openMySpace` 内的
  `setPaperImportAiRouteActive(false)`）函数保留、只删行 —— 漏删 = `tsc` 崩，
  scope-guard 兜不住。
- **verify 三类别搞混**：整删 2（i1-route/h11b）/ 原地瘦身 8（留引擎断言）/ 轻改 4；
  **不整体删混合脚本**（会误伤 packageBuilder/analyze* 引擎断言）。

## Background（同 session 已加载可跳）

- 记忆 `website-consumption-only-principle`（arc 全貌 + 25 棒 preview_fill 血泪）、
  `eqbank-live-ops`（redeploy 零密钥，归 owner）、`scout-hints-become-hallucinations`。
- `AGENTS.md`（唯一真源：角色/流程/verify 约定/tier 表）。
- 前刀先例：`docs/cuts/c7-paper-import-retire/`（同套路，PA/CR 均 0MF）、
  `docs/cuts/ai-enhancement-retire/`（面 A 8-verify 清单最早立项处）。
