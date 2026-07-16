# agent-entrypoint — detail-page-redesign

## Must Read（按序）

1. `docs/specs/2026-07-15-detail-page-redesign-design.md` — 产品真源
   （owner approved；页面结构/负空间/数据契约/退役清单/边界/错误边角）。
2. `docs/cuts/detail-page-redesign/plan.md` — 执行契约（工程要点/verify
   锚更新授权清单/Forbidden/验证命令/裁决点）。
3. 现状代码：`app/src/features/question-detail/QuestionGroupDetailView.tsx`
   （被重写面，含 E6「相似篇章」挂载——随迁不重写 Panel 本体）、
   `app/src/features/question-detail/DetailPaperPeekPrototype.tsx`（整删对象，
   参考其真数据挂纸路径但**不搬运代码**）。

## Background（同会话已读可跳）

- `AGENTS.md`（Product Posture / Super Teacher Boundary / Browser
  Verification）；DESIGN.md §7 三纪律。
- 单组只读挂纸的现成参照：`app/src/features/paper-browse/PaperBrowsePage.tsx`
  的 adapter 消费（五 groupType 分支 + WritingPaperPage 包裹）。
- chips 文案源：`app/src/features/paper-intelligence/grammarFillFacetRegistry.ts`
  （只消费）。
- E6 判例（DP-2 纪律出处）：`docs/cuts/similar-passages-entry/cr.md`
  §DP-3 现场打回与收账。
