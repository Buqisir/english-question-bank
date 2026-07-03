# 刀⑥ — 首页默认 feed（AI 取题台内容填空）· DEV 契约

Cut size: medium · touches schema/data contract: **no** · touches product boundary: yes（签名面 ConciergeDesk 的默认态）
Date: 2026-07-03 · PM: 小川 · Baseline: main @ 53bb0e2

## 为什么（读完这段再动手）

AI 取题台是产品门面，但无查询时是一张白纸——老师要凭空造查询才能开始。
两轮 impeccable critique 都点名（识别优于回忆 3/4、美学极简"空≠简洁"、
灵活高效 2/4），I16 已批方向：**不空 + chip 收窄**。DESIGN.md 签名组件一节
写死了做法：「用内容（默认按来源卷分组的题库 feed）填空，用 AI 口吻的筛选
chip 收窄」。同刀带走复评抓出的两个同面 P1 行为缺陷（chip 不直搜、提交清空
query）和一个 P3 尾巴（eyebrow slate）。

架构事实（已核实，别再全局摸索）：
- 语料就在 App state：`useConciergeDesk({ questionGroups, ... })`
  （App.tsx:879），`questionGroups: QuestionGroupCard[]` 是全库题组卡。
- 状态机：`ConciergeDeskState = empty | loading | results | clarification |
  error`（useConciergeDesk.ts）。
- 卷行渲染通道现成：`aggregatePaperResults` 产 `PaperResult[]`，
  `ConciergePaperRow` 渲染（展开/加入草稿卷/找类似/阅读解析都在里面）。
- `submit(intentOverride?)` 已支持传入覆盖 query。

## Scope（四件事，全部落在 concierge 面）

### 1. 默认 feed（主体）

`state.kind === 'empty'`（含 reset 后）时，不再只渲染空白，而是渲染按卷
分组的题库浏览 feed：

- 新纯函数 `buildDefaultFeed(groups: QuestionGroupCard[]): PaperResult[]`，
  新文件 `app/src/concierge/defaultFeed.ts`。**复用 `PaperResult` 类型**，让
  `ConciergePaperRow` 零改（或最小 props 松动）即可渲染；不得改它在搜索
  结果下的行为。
- 排序：最近优先——year DESC，同年按卷名稳定序。真题/模拟都进 feed，
  不过滤。
- 默认只显示前 8 套（全部折叠态），下方「显示全部 N 套卷」文字按钮一次
  展开余下全部。卷行为与搜索结果卷行一致：可展开看题组卡、加入草稿卷、
  找类似、阅读解析。
- feed 顶部一行说明，AI 口吻、人话、克制，例：
  「题库里现有 N 套卷 · M 个篇章。可以直接翻，或用一句话描述你要的题。」
  （文案可微调，主 agent QA 终审；禁技术腔/营销腔。）
- 起始 chips 保留在 feed 上方（现有渲染位置逻辑不动）。
- **渲染开关**：loading / results / clarification / error 态一律不渲染 feed；
  真空态（搜了但零命中）保持现有诚实文案 + chips，**其下方追加 feed**
  （给老师"浏览"这条出路）。
- 边界：语料未就绪（sample/加载中）→ 现有骨架与行为零回归；语料真为空
  （0 题组）→ feed 位置显示一句导入引导（纯文案 + 现有导入入口指引，
  不做新 UI）。

### 2. chip 点击直接搜

起始 chip 的 onClick 从 `setIntent(chip)` 改为「回填输入框 + 直接
`submit(chip)`」。消灭"点了没反应/旧结果配新输入"的两步错位。

### 3. 提交保留 query

`submit` / `triggerSimilar` 里的 `setIntent('')` 去掉：提交后输入框保留
本次 query（triggerSimilar 回填其生成的 similar intent）。迭代式检索是
自然语言找题的核心，老师要能在原句上改。

### 4. eyebrow 去 slate（一行级）

`.home-mode-ai` 作用域内 re-scope `.eyebrow` 的 color 到既有暖 token
（--ink-muted 同值的 var；照刀④ 的 re-scope 手法）。`:root` 零改，经典
模式不动。

## Forbidden（越线即返工）

- `conciergeSearch.ts` 的检索/评分/噪声地板逻辑零改（刀①⑤ 资产，断言
  护着）。aggregatePaperResults 尽量零改；确需扩展只许加不改。
- `server/**`、schema、domain、`*Adapter.ts`、PaperSurface、print/export
  零碰。
- Color-Lock：所有颜色 token 值零改；No-Blue（不引入任何蓝）；Red-Pen
  （新 UI 强调 ≤10%，feed 说明行用暖中性不用强调色）。
- 经典模式（homeMode !== 'ai'）行为与样式零改。
- `getQuestionGroupDetail` 每次返回 fresh 对象的契约（有护栏注释）不动。
- 不做：搜索算法改动、难度维度、topic 回填、key 接线、键盘捷径系统、
  批量加入（都是别的刀）。

## Verify（全绿才算完）

1. 新增 `scripts/verify-home-default-feed.mjs`（node 断言，仿现有 verify
   风格）：buildDefaultFeed 排序/分组/空语料/8 套阈值；empty→feed 渲染、
   results/loading/clarification/error→不渲染、真空态→文案+feed 共存；
   chip 直搜（submit 被调且 intent 回填）；提交后 intent 保留。挂进
   `scripts/README.md` 表格。
2. 既有绿零回归：`verify-concierge-desk.mjs`、
   `verify-c6a10-concierge-local-search.mjs`、
   `verify-restart1-local-search-intent.mjs`。
3. `pnpm -C app build`（含 tsc）过。
4. 浏览器 QA 由主 agent 亲手做（DEV 不必装真库浏览器验证，报告静态
   verify 即可，但别把静态绿说成"QA 过了"）。

## DEV 后勤（血泪教训，照做）

- 在独立 worktree 干活：`git worktree add <path> -b cut/home-default-feed`
  （基线 main@53bb0e2）；worktree 无 node_modules，先
  `ln -s` 三条：root（如有）/`app/node_modules`/`server/node_modules`
  指回主 checkout。
- 禁止动主 checkout（/Users/huangxuewei/Projects/english-question-bank）
  的任何文件与分支。
- 提交 1-2 个 commit，conventional message（feat(concierge): ...）。
- 完工报告：改动文件清单 + 每条 verify 命令与结果摘要 + Self-Review
  Blind Spots（自己最没把握的 2-3 处）。
