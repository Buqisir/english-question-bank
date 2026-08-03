# similar-entrypoints (E3) — 详情页次入口 + concierge「找类似」换引擎

- Cut size: **medium**（TSX 交互 + URL 参数扩展 + 旧 hack 退役）。
- Touches schema / data contract / product boundary / teaching
  interpretation: **no**。server 零字节改动；URL 参数为纯前端契约扩展
  （沿 flow-panel 刀 3 的 lecture/questionId 既有契约加一个键）。
- PA: 不触发（可逆产品面；方向已在
  `docs/cuts/similar-questions/program.md` Q6/拆刀表落锤）。
- 流程：本 plan（PM）→ Sonnet DEV（worktree）→ fresh Opus CR → 主代理
  复核 + 合并 → 浏览器 QA（用户可见交互，必须真点击）。

## 目标（program E3 原文）

详情页「配相似」入口 + concierge「找类似」换新引擎，**退役文本回填
hack**（`buildSimilarIntent` 填搜索框跑文本搜索的旧路）。让所有入口
汇入 E2 已建成的唯一相似面：整卷页讲评态右栏相似栏。

配相似宪法：**只有「配」一个动词**——所有入口按钮统一叫「配相似」，
concierge 的「找类似」文案一并改名。

## 三块工作

### 1. `similar=1` 深链参数（PaperBrowsePage + App 路由）

现状：E2 的相似栏 (`similarView`/`similarSeed`) 是页内态，只能由讲评栏
CTA 点出来，无 URL 表达。

做什么：

- URL 契约加一个键：`?view=paper-browse&paperId=…&focusGroupId=…
  &questionId=…&lecture=1&similar=1`。App.tsx 解析 paper-browse 路由处
  把 `similar` 与 lecture/questionId 同路传进 `PaperBrowsePage` props。
- 入场自动触发：当 `lecture && questionId && similar` 且该题所在组的
  groupType 在 `SIMILAR_SUPPORTED_GROUP_TYPES` 内——在 asset/groupModels
  加载完成、讲评选题落位后，走与 `handleSimilarCtaClick` 完全相同的
  路径（种子快照构造照抄 CTA 处的现有构造，别另写一份）。**一次性**
  （ref guard）：用户点「返回解析」后不得被 effect 再顶回相似态。
  参考刀 3 深链沉降期的既有处理（plan 见 docs/cuts/flow-panel/）。
- 请求纪律不破：深链自动拉取=用户在别处显式点了「配相似」，等价于
  CTA 点击，仍然是一次显式意图一次请求；无预取。
- URL 回写：扩展现有 replaceState 同步 effect（PaperBrowsePage
  ~L379-409）——`similarView === 'similar'` 且有 seed 时写
  `similar=1`（questionId 与 seed 对齐），回到解析态/关讲评时删掉。
  刷新/分享还原姿态与 lecture 契约同规格。popstate 走 App 既有机制，
  不新增处理，但不得回归（Back/Forward 后视图与 URL 不失配即可，
  沿用 lecture 的行为档位）。
- 不支持题型或 questionId 查无此题：静默降级为普通讲评态深链
  （lecture 照开，similar 参数忽略并在首次 replaceState 时清掉），
  不报错不白屏。

### 2. 详情页次入口（QuestionGroupDetailView）

- 在「看解析」按钮旁加「配相似」（次级按钮，同视觉家族）：
  href = `buildPaperBrowseSimilarHref(...)`（见下），主点击拦截走 SPA
  导航（模式照抄 L226-240 的「看解析」双轨：href 保中键/新标签，
  onClick preventDefault 走 App 回调——App 侧加对应的
  `openPaperBrowseSimilar`，或给现有 `onOpenPaperBrowseLecture` 加
  similar 参数，取改动小者）。
- 渲染条件：`paperSurfaceHref` 可换算出讲评 href **且** groupType 在
  四类支持集内。写作组/无 href 组不渲染（与「看解析」的隐藏式降级
  一致，不做 disabled 态）。
- helper：`app/src/concierge/paperSurfaceHref.ts` 加
  `buildPaperBrowseSimilarHref` = `buildPaperBrowseLectureHref` 结果
  再 set `similar=1`（复用，不复制解析逻辑）。种子题 = href 自带的
  questionId（组首题；program v1=单题入口，组级画像挂 v2）。

### 3. concierge 换引擎 + 旧 hack 退役

- `ConciergeGroupCard` 的「找类似」→「配相似」：从 `onSimilar` 回调改为
  与卡上「看解析」同款的深链导航（helper 同上）；渲染条件同详情页
  （无 href / 非四类 → 不渲染。行为变化：旧 hack 对任何组都出按钮，
  新版对写作组隐藏——这是拍板过的换引擎代价，池子诚实）。
- 退役链路（全删，不留兼容层）：
  - `conciergeSearch.ts` 的 `buildSimilarIntent`；
  - `useConciergeDesk.ts` 的 `triggerSimilar` 流（L280-292 一带）及其
    export；
  - `ConciergeDesk.tsx` 两处 `onSimilar={...}`（L539、L595）、
    `ConciergePaperRow` / `ConciergeGroupCard` 的 `onSimilar` prop 透传。
  - 收官标准：`grep -rn "buildSimilarIntent\|triggerSimilar\|onSimilar"
    app/src` 零命中。

## 已知雷区（DEV 必读）

- **groupType 命名双轨**：E2 白名单 `SIMILAR_SUPPORTED_GROUP_TYPES` 用
  paper-asset camelCase（`sevenChoices`/`grammarFill`）；domain 的
  `QuestionGroupCard.groupType` 可能是 DB snake_case。详情页/concierge
  的支持集判断必须按实际值映射，四类逐一实测，别想当然。
- **verify 脚本连带**：以下脚本引用了「找类似/onSimilar」，退役后必须
  同刀更新（不许留 stale 断言）：`verify-concierge-desk.mjs`、
  `verify-home-default-feed.mjs`、`smoke-concierge-stream.mjs`、
  `smoke-golden-path.mjs`、`verify-paper-intelligence-route-integration.mjs`、
  `scripts/README.md` 相应条目。改动后新断言优先行为级。
- **深链时序**：auto-trigger 必须等 groupModels 就位，且与刀 3 的
  「深链沉降期点题竞态抑制」不打架——先读 PaperBrowsePage 现有的
  沉降处理再动手。
- PaperBrowsePage/App.tsx 不在契约 hook 名单，但 App.tsx 只动路由参数
  透传与入口回调，别碰无关路由。

## Forbidden

- `server/**` 零改动（引擎/API 契约冻结）。
- `shared/papersurface/**`、domain schema、adapters、print/export 样式。
- E2 相似栏本体（`SimilarQuestionsRailView.tsx`）不动——本刀只加入口，
  不改结果态 UI。
- 命令行考点直搜（program 挂 v2）、多题种子合并画像（v2）不做。

## Verify / 验收

- `node scripts/verify-similar-questions.mjs`、
  `node scripts/verify-paper-browse.mjs` 及上表更新过的脚本全绿；
  `pnpm -C app run verify:all` 全绿；`tsc` 干净。
- 行为验收（DEV Playwright + 主代理复核 + owner QA 各过一遍）：
  1. 详情页（四类各一组）「配相似」→ 整卷页讲评态、该组首题选中、
     相似栏已开、结果已加载、「为什么相似」chips 在。
  2. 写作组详情页无「配相似」按钮。
  3. concierge 搜索卡「配相似」→ 同上；旧的填搜索框行为消失。
  4. 相似态下复制 URL 新标签打开 → 还原相似态；点「返回解析」→ URL
     的 similar 清掉，刷新落解析态。
  5. 中键/Cmd+点击详情页「配相似」→ 新标签直达相似态。
  6. 深链自动加载只发一次 `/api/similar-questions` 请求。
- DEV 断点锚惯例：实现完成先打 `wip(similar-entrypoints): impl
  complete, pre-QA` 再进自验。
