# agent-entrypoint — similar-passages-entry（E6）

## Must Read（按序）

1. `docs/cuts/similar-passages-entry/plan.md` — 执行契约（scope /
   Forbidden / verify / 裁决点）。
2. `docs/cuts/similar-v2-engine/reasons-chips-table.md` — reason.kind →
   文案单源表（只消费不改）。
3. `docs/cuts/similar-questions/prototype-passage-entry.html` 场景 1/3 —
   owner 拍板的入口形态与候选面板结构（场景 2 是 E7，不做）。
4. `docs/cuts/similar-v2-engine/cut-note.md` §3/§4 — 类型收账清单与
   部署门成因。

## Background（同会话已读可跳）

- `docs/cuts/similar-questions/program.md` §配方 v2 — 语义拍板（不重开）。
- `AGENTS.md`（Product Posture / UI Collaboration / Browser Verification）。
- 现状代码入口：`app/src/features/paper-browse/PaperBrowsePage.tsx`
  （similar 态机 + `SIMILAR_SUPPORTED_GROUP_TYPES` + `RECIPE_SUMMARIES`）、
  `SimilarQuestionsRailView.tsx`、
  `app/src/features/question-detail/QuestionGroupDetailView.tsx`（E3 入口）、
  `app/src/concierge/ConciergeGroupCard.tsx`（E3 入口）、
  `app/src/services/similarQuestions.ts`、
  `app/src/domain/questionBank.ts`（契约面，已解锁）。
