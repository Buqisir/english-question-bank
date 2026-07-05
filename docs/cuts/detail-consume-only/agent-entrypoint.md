# detail-consume-only — Agent Entrypoint

Cut: 详情视图退役回归看题页 + 全站难度 UI 下线。
落地 ADR-0015「网站界面只做消费」+ 难度维度下线（只删 UI 层）。

## Must Read（cut-specific，短）

- `docs/cuts/detail-consume-only/plan.md` — DEV 执行契约（硬契约 C1–C7 +
  DELETE/KEEP 清单 + Forbidden + Browser QA Matrix）。
- `docs/cuts/detail-consume-only/decisions.md` — grill 逐条拍板结论 D1–D5。
- `docs/adr/0015-web-surface-consume-only.md` — 产品边界与难度处置的「为什么」。
- `app/src/features/question-detail/QuestionGroupDetailView.tsx` — 本刀主战场
  （删现场生产 + 难度，保留看题内容 + 编辑/删除）。

## Background（已加载可跳过）

- `AGENTS.md` — 角色/流程/gate（本刀 medium-large，PA→DEV→CR→QA→RM）。
- `PRODUCT.md` — 新增「生产在后台，网站只做消费」原则段。
- `docs/adr/0013-owner-member-role-gate.md` — owner/member 两档 gate（本刀
  与其决策 #2 的关系已在 ADR-0015 §4 讲清）。
- `docs/adr/0008-primary-vs-derived-fields.md` / `0009-derived-dimension-store.md`
  — 难度是 derived 维度、可 backfill 重建（本刀只删 UI 层的架构依据）。

## 关键提醒（侦察钉的易漏 / 易误删点）

- **保留 READ 回填链路**：`openDetail` 灌已存 parse/verify 进 state 是 member
  看解析的命脉，只删 `handle*` 现场调 AI 的 WRITE 路径。
- **保留 5 个 parse/verify state**（只读态）：`runAiEnhancementAnswerParse`
  side-channel 共用；service 层解析/验证/标签函数保留。
- **保留编辑/删除 + EntryModal**：侦察把 EntryModal 列为「连带删」，但本刀
  onEdit（编辑）保留，故 EntryModal **保留**（plan 有反向 ⚠️ 提示）。
- **数据层零改动**：难度只删 UI；`server/**`、schema、难度 normalizer/service、
  steward、`difficulty` type 字段一律不碰。
- **DEV 不许 spawn 子代理**。

## Next Action

PA（fresh Opus high）review `plan.md` 是否 ready for DEV，写 `pa.md`。
