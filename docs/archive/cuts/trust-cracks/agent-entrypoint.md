# trust-cracks — Agent Entrypoint

## Must Read

1. `docs/cuts/trust-cracks/plan.md` — 硬契约 C1-C9、Forbidden、验证矩阵。

## Background（同会话已载入可跳过）

- `.impeccable/critique/2026-07-13T15-58-11Z__full-project.md` — 三路评审
  快照（本刀账目来源：Priority 1/2/4 + Persona 红旗）。
- `AGENTS.md` — 宪法（Forbidden 边界与 verify 纪律的上位法）。

## 现场备忘（PM 勘察结论，DEV 不必重查）

- "硬凑 8 条无关推荐"的机制 = 重排 prompt 规则 3 强制返回 + 未入榜候选
  兜底追加 + 预筛无分数地板，三件套全在
  `server/search/semanticSearchService.mjs`。
- 客户端真空态（空 matches 的渲染）已上线：`ConciergeDesk.tsx`
  `isVacuumResultsState` → concierge-empty 行 + 默认 feed。
- 结巴实据（本地库 33 组 region/paper_name 全查过）：
  `全国甲卷 + 2024年全国甲卷` → "全国甲卷 全国甲卷"；
  `全国新课标Ⅰ + 2026年新课标Ⅰ卷` → "全国新课标Ⅰ 新课标Ⅰ卷"；
  `重庆市巴蜀中学 + 26.3重庆市巴蜀中学高三月考（七）英语试卷` →
  剥年后剩裸 "3"。
- URL 路由三件套（pushState / boot-read / popstate 重放）已有成熟模式：
  照 `openPaperBrowse` / `paperBrowseOnBackToWorkbench` / popstate handler
  抄结构即可。
