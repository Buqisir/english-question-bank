# ai-enhancement-retire — Agent Entrypoint

Cut: 退役 App.tsx 内嵌「AI 增强面板」（B）—— 导题草稿入库后的现场增强面。
落地 ADR-0015「网站只消费」挂账。A（独立 AI 导题页）单独立项，不在本刀。

## Must Read（cut-specific，短）

- `docs/cuts/ai-enhancement-retire/plan.md` — DEV 执行契约（C1–C5 +
  DELETE/KEEP 清单 + Forbidden + Browser QA Matrix）。
- `docs/cuts/ai-enhancement-retire/decisions.md` — owner 拍板 D1–D3（含 A/B
  定靶脉络 + A 单独立项的 why）。
- `docs/adr/0015-web-surface-consume-only.md` — 产品边界「为什么」。
- `docs/cuts/detail-consume-only/plan.md` — 5-state READ/WRITE 切法先例（本刀
  同款：删 WRITE、留 READ 命脉）。

## Background（已加载可跳过）

- `AGENTS.md` — 角色 / 流程 / gate（本刀 medium，PA→DEV→CR→QA→RM）。
- `app/src/App.tsx` — 本刀唯一主战场（+ `App.css`）。

## 关键提醒（侦察钉的易漏 / 易误删点）

- **保留 member READ 命脉**：`openDetail` 回填 5-state + `build*VerifyResult`
  本地派生是 member 看已存解析的命脉。B 的 `runAiEnhancementAnswerParse` sync
  分支写同样的 5-state —— **删 sync 分支（WRITE），留 5-state 声明 +
  `openDetail` 回填（READ）**。跟 detail-consume-only 删详情 handler 同款切法。
- **B 无专属 verify**：删 B 无 verify 需增删；`verify:all` 保持全绿即可。
- **A 不碰**：`features/paper-import-ai/**`、`services/paperImportAi.ts`、
  `paperImportAiRouteActive` 路由 —— A 单独立项（删 A 牵连 8 前后端一体 verify）。
- **普通导题只去 `showAiEnhancementPanel` 调用**，导题逻辑保留。
- **全局 AI 配置（`aiApiKey` / `aiModel` / `aiThinkingMode`）保留**。
- **DEV 不许 spawn 子代理**。

## Next Action

PA（fresh Opus high）review `plan.md` 是否 ready for DEV，写 `pa.md`。核心核：
删 B 的 5-state WRITE 不伤 member READ 命脉（`openDetail` 回填 +
`build*VerifyResult` 保留自洽）+ 导题入库删 `showAiEnhancementPanel` 后自洽 +
Forbidden 守得住。
