# similar-passages-entry（E6：篇章相似入口 + 讲评 CTA 改指 + 类型收账）

- cut size: **medium**；契约面：**yes**——`app/src/domain/questionBank.ts`
  类型对齐 E5 已合入 main 的服务端契约（零语义新决策，语义全在
  `docs/cuts/similar-questions/program.md` §配方 v2，不得重开）。
- **PA 降 PA-lite**（降档理由）：入口三场景原型
  `docs/cuts/similar-questions/prototype-passage-entry.html` owner 逐场景
  拍板全过（2026-07-15）；端点契约已由 E5 formal PA + fresh CR 审过。
  CR 须复核此降档是否仍成立。
- **本刀是解部署门刀**：E5 把完形/七选五小题相似改 400 后，「配相似」CTA
  在生产是死路（similar-v2-engine/cut-note.md §4）；D1/E5 部署随本刀同批。
- 契约锁：PM 已按规程 `touch .claude/contract-unlock`，收口删除。

## 服务端契约（E5 已定，本刀只消费，不改 server）

- `POST /api/similar-passages` 入参 `{ groupId, limit? }`，响应
  `{ seedProfile: { groupType, topicLabels[] }, results: [{ groupId,
  paperId, title, sourceLabel, score, reasons[] }], poolStats:
  { totalInPool, returned }, notice: string|null }`。
  `notice` 非空 = 诚实空态文案（种子零话题标签），原样展示。
- `POST /api/similar-questions` 仅阅读+语法填空；完形/七选五种子 400。
- reason.kind 全集与文案：`docs/cuts/similar-v2-engine/reasons-chips-table.md`
  （单源表，改前端别改表；发现表与 server 不符 → 停手上报，不自行改 server）。

## 目标

### 1. domain 类型收账（契约面，唯一 hard-guard 触点）

- `SimilarQuestionReasonKind` → v2 五值
  `topic-match | position-slot | authentic-source | facet-hit | verb-vector`。
- `SimilarQuestionsResponse` / `SimilarQuestionResult` 对齐 v2 实际输出
  （以 `server/search/similarQuestions.mjs` 为准：bonus 层已删、seedProfile
  随新配方）。
- 新增 `SimilarPassagesResponse` / `SimilarPassageResult` 类型（按上方契约）。

### 2. 服务层

- `services/similarQuestions.ts` 加 `fetchSimilarPassages({ groupId, limit? })`
  thin wrapper（与现有 fetchSimilarQuestions 同构，含错误文案透传）。

### 3. 共享「相似篇章」候选面板（新组件，纯展示 + 回调）

原型场景 1/3 的 `psim` 块：头行（「相似篇章」标题 + 配方副标 + 「收起 ↑」）
/ 候选卡（title、sourceLabel、reasons chips、「＋ 加入草稿卷」）/ 池子诚实
条（`库内同话题…还剩 N 组`，N = totalInPool - returned）/ notice 诚实空态 /
loading / error+重试。

- reasons chips 全量渲染 `reason.label`（与 rail 现状一致；无 kind 白名单
  过滤——reasons-chips-table.md 已核不违反 DESIGN.md §7 禁兜底）。
- 加入草稿卷按 groupId 从全局题组列表解析 `QuestionGroupCard` 走既有
  basket 通路；查不到的 thin 候选禁用 + title 提示（rail SW-3 同款语义）。
- 挂载后本刀两处消费（详情页 + 搜索卡）；详情页重设计刀将原样重挂进新
  速览头动作行（spec 已补录），组件按此可迁移性设计（不绑详情页布局）。

### 4. 详情页入口（场景 1）

- `QuestionGroupDetailView` 的「配相似」→ **「相似篇章」**，不再深链
  讲评态（`onOpenPaperBrowseSimilar` / `buildPaperBrowseSimilarHref` 在
  本入口的使用退役；helper 若仍被讲评深链兜底引用则保留模块）。
- 点击 = hero 下方原地展开候选面板（fetch on 展开，收起不清结果）。
- 题型 gate 维持四类 + 有 paperSurfaceHref（写作组照旧隐藏式降级）。

### 5. 搜索结果卡入口（场景 3）

- `ConciergeGroupCard` 的「配相似」→ **「相似篇章」**，原深链退役，点击
  = 卡下方原地展开同一面板（一次只展开一张卡的候选，切卡自动收起）。

### 6. 讲评 rail CTA 改指（解门主体）

- 完形/七选五：CTA **保留、原位、文案改「相似篇章」**，点击改调
  `/api/similar-passages`（种子 = 当前题组）；rail 结果态渲染篇章结果——
  复用现有勾选 + 批量「加入草稿卷」交互（groupId 级，persist 通路不变），
  无 `matchedQuestionIds` chip，头行「相似篇章 · 完形填空」。
- 阅读/语法填空：小题相似照旧（`/api/similar-questions`），头行文案不变。
- `RECIPE_SUMMARIES` 前端文案表整表对 v2 更新（cloze/sevenChoices 换篇章
  配方描述，reading/grammarFill 换 v2 小题配方描述）。
- 深链 `similar=1`：cloze/sevenChoices 旧链接照常打开讲评态并自动进
  **篇章**结果（legacy URL 自愈，不 400）；reading/grammarFill 深链行为不变。

## Forbidden

- 不动 `server/**`（端点契约以 E5 为准；缺字段/表不符 → 停手上报）。
- 不动 `shared/papersurface/**`、`schemas/`、任何 `*Adapter.ts`（contract
  unlock 只为 `app/src/domain/questionBank.ts` 类型收账开，别处照锁）。
- 不做场景 2 工作台⇄（E7）；不做详情页重设计（独立刀）；不动
  `grammarFillFacetRegistry.ts`（D1 已收）。
- program.md 拍板语义不得重开；DESIGN.md §7 三纪律（禁兜底/显式覆盖/留白法）。

## verify

- `pnpm -C app run typecheck`（tsc）+ `pnpm -C app run verify:all`。
- DP-2 行为脚本入档 `docs/cuts/similar-passages-entry/qa/`（可重跑，
  headless Playwright + 本地 QA 账号，确定性 DOM/URL 断言，不依赖 CDP
  合成点击盲区——判例见 STATUS 2026-07-14 trust-cracks 条）：
  ① 详情页阅读组点「相似篇章」→ 面板展开、候选卡带 chips、池子诚实条；
  ② 讲评态完形题点「相似篇章」→ rail 渲染篇章结果（非 error 态）；
  ③ 搜索卡展开候选 + 切卡收起；
  ④ 面板「＋ 加入草稿卷」→ basket 计数 +1 + toast；
  ⑤ cloze 旧 `similar=1` 深链 → 自动进篇章结果（legacy 自愈断言）；
  ⑥ 静态断言：`app/src` 零 v1 kind 残留
  （`facet-density|pos-density|topic-diff|secondary` 作 reason kind 用法）。
- 无新 CI verify 脚本（服务端行为已由 `verify-similar-v2.mjs` 在 CI 守）。

## 裁决点清单（PM 断点锚）

- [x] 裁1 plan 落锤 + commit（本文件）
- [ ] 裁2 DEV 回执审读 + 主代理亲跑复核（worktree：tsc + verify:all +
      DP-2 脚本，原始退出码）
- [ ] 裁3 fresh CR（Opus/high）MF 处置
- [ ] 裁4 merge 主树 + main CI 绿 + 契约锁收回（删 contract-unlock）
- [ ] 裁5 owner DP-3（归并 D1/E5/E6 三刀一并实点）→ **部署同批解门**
      （强制裁决点；D1 数据文件走 git 同步无需停服 apply）
