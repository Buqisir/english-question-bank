# ai-enhancement-retire — Accepted Decisions

Last synced: 2026-07-05 after owner 拍板（黄学伟）+ 侦察定靶。
产品原则见 `docs/adr/0015-web-surface-consume-only.md`（本刀 = 其挂账
「AI 增强面板退役」的落地）。

## 背景：ADR-0015 挂账落地

detail-consume-only（PR #258）退役了详情视图的现场生产，其 decisions.md
挂账列了「AI Enhancement 批量面板 → 同原则另刀退役」。本刀落地这条。

## 侦察定靶：「AI Enhancement」实为两个面

侦察发现「AI Enhancement」是两个独立的 owner-only 现场生产面：

- **A · 独立 AI 导题页**（`app/src/features/paper-import-ai/`，
  `?view=paper-import-ai`「AI 导题工作台」）：整卷 docx → 拆题 → 各题型跑
  解析 → 存试卷资产。用 `services/paperImportAi`。入口在管理台 AdminWorkbench。
- **B · App.tsx 内嵌 AI 增强面板**（`ai-enhancement-panel`，App.tsx ~3091）：
  普通导题草稿入库后弹出，对入库题组批量跑 简介 / 主题标签 / 答案解析
  （`aiEnhancement*` state + `handleRunAiEnhancement` / `runAiEnhancementAnswerParse`）。
  用 `services/questionGroups.ts`。

detail-consume-only 保留 5-state（`readingParseResult` 等）说的「AI Enhancement
面板共用」= **B**（B 的 `runAiEnhancementAnswerParse` sync 分支写这 5-state）。

## D1 — 靶子范围：本刀只退 B，A 单独立项

owner 两次拍板：
1. 先拍「A+B 都退」（彻底兑现「网站只消费」）。
2. 侦察挖出 **删 A 前端牵连 8 个前后端一体 verify**（在 CI 注册表：
   verify-i1-paper-import-route/analysis、i2-seven-choices-ai / i3-cloze-ai /
   i4-grammar-fill-ai / i5-writing-ai / i8-cloze-analysis、h11b-paper-import-ai-view；
   另 i1-splitter / i13 / h11a 亦读 A 前端）—— 它们用 readFileSync 跨层断言
   「前端 service 的 endpoint ↔ 后端 route」+ 后端 analyze 逻辑。删 A 前端留
   后端 → verify 割裂：一部分纯前端契约（退役）、一部分主体是后端 analyze
   覆盖（退役会让保留的后端逻辑裸奔，与「后端保留给后台用」矛盾；保留则要逐个
   改成纯后端 verify）。**A 非「干净纯删」，是「删前端 + 拆 8 verify + 可能补
   后端覆盖」的真工程，规模 ≈ detail-consume-only。**
   owner 重拍：**本刀只退 B**（干净低风险），**A 单独立项**（含 verify 拆分
   设计，走完整 grill/PA）。

符合「把大的拆小、每步可用、控风险」。

## D2 — B 退役边界：删现场生产面，保留 member READ 命脉

删 B 的现场生产（面板渲染块 + `runAiEnhancementAnswerParse` /
`handleRunAiEnhancement` / `handleBindAiEnhancementTopicLabels` +
`showAiEnhancementPanel` + 相关 state/常量/工厂 + 导题提交后的
`showAiEnhancementPanel` 调用）。**保留 5-state + `openDetail` 回填 +
`build*VerifyResult` 派生**（member 看已存解析的命脉）—— 只删 B 对 5-state 的
WRITE（`runAiEnhancementAnswerParse` 的 sync-into-open-detail 分支），跟
detail-consume-only 删详情 handler WRITE、留 5-state READ **完全同款切法**。

## D3 — 后端 + 普通导题 + 全局配置不碰

后端全保留（`server/**` 不碰，生产移后台、给后台 CLI 留路）。普通导题
workbench（`PaperImportWorkbench` 非 AI）+ 其 `handleCommitDraftGroup` /
`handleBatchCommitObjectiveDraftGroups` 逻辑保留，只去掉提交后
`showAiEnhancementPanel` 调用（导题仍入库，只是不现场增强）。全局 AI 配置
（`aiApiKey` / `aiModel` / `aiThinkingMode`）保留。

## 挂账（不在本刀，独立后续）

- **A · 独立 AI 导题页退役**（含 8 个前后端一体 verify 的拆分设计：纯前端
  契约 verify 退役 + 后端 analyze verify 改纯后端或补 CLI 覆盖）→ 单独立项，
  走完整 grill/PA。
- 普通导题 workbench（非 AI）去留 → 更大的「导题全面退役」决策，另议。
