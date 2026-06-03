# I16·B Plan — 主题标签批量回填 + 按主题找题（复用现成分类器；含最小 UI）

## Cut Size

**medium**。Touches schema/data contract = **no（复用现有 `question_group_topic_labels` 表 + 现成分类器，不加 schema）**；product boundary（按主题找题）= **yes**；触碰 **UI（最小触发面）**。全门：PA before DEV、CR-lite、verify-ci、**浏览器 QA（有最小 UI）**、PO QA、RM。

## Objective

让"按主题找题"成立（owner 的 B）。决定性事实：**live DB 18 个题组，0 个有主题标签**——所以 B 的substance 是**先把标签填上**，不是加搜索。第一刀：

1. **批量回填（后端）**：复用现成的独立分类器，给所有**无标签**题组打上三大主题语境→主题群→主题标签。**老师触发**（方案 A）、**AI 直接落库**（owner 已定）、key-gated、幂等（跳过已标）、逐组容错。
2. **最小 UI（做个先）**：一个"给题库打主题标签"的触发按钮 + 进度/结果。**owner 后面会改最终 UI**，所以本刀 UI 只求**能用、不求精**；**不改任何配色**。
3. **填完即可搜**（无需额外检索层）：标签落库后自动进 `QuestionGroupCard.topicLabels`，concierge + 经典筛选**已对 topicLabels 做关键词搜**——验证"搜某主题词能命中"即可。

## Why (owner-locked, 2026-06-03)

PM grill 定案（owner 拍）：填充方式 **A（批量回填、老师触发）**；**AI 直接落库**（`source='ai'` + 置信度，老师事后可改，跳过人工确认）；**UI 做个先**（最终版 owner 后改 / 留 Claude Design）。
**被砍的教训（已读 commit `94950a1` "keep import analysis metadata scoped"）**：当初把 topicLabels 塞进 reading 解析 prompt 被精准回退——**解析 prompt 不该兼职主题分类**。B **绝不重塞解析 prompt**，走系统**本来就有的独立分类通道**。

## Code Reality (verified — design around it)

- **现成独立分类器（复用，不重造）**：
  - `generateTopicLabelsByQuestionGroup(questionGroupId, apiKey, model, requestId, thinkingMode)`（`server/api.mjs:10488`）→ 取题组 detail → DeepSeek 从课标清单选标签（`DEEPSEEK_TOPIC_LABEL_PROMPT` `api.mjs:6580`，约束在 `TOPIC_LABEL_TAXONOMY` `api.mjs:141-252` 内）→ **返回** `{ topicLabels, ... }`（**不落库**）。key 入参，缺省回退 `DEEPSEEK_API_KEY` 环境变量。
  - `bindTopicLabelsToQuestionGroup(questionGroupId, input)`（`api.mjs:10534`）→ `replaceQuestionGroupTopicLabels` **落库**到 `question_group_topic_labels`（theme/theme_group/subtopic/source/confidence）。
  - **回填 = 每组连着调 generate→bind**（"AI 直接落库"）。
- **路由模式**：现有 `POST/PUT /api/question-groups/:id/topic-labels` 在 `server/question-bank/questionGroupRoutes.mjs:117/140`，经 `createQuestionGroupRoutes()` 工厂注册（`api.mjs:436` 的 `serverRoutes` 组合）。新回填路由**走同工厂或新工厂**加进组合（参照 cut A 的 MF-3 教训：**经工厂注册，不往字面量 push**）。`context` 已暴露 `generateTopicLabelsByQuestionGroup` / `bindTopicLabelsToQuestionGroup`（`api.mjs:71,80`）。
- **填完即可搜（已验证链路）**：`getTopicLabelsForQuestionGroups`（`api.mjs:845`）已 merge 进 `selectQuestionGroupCards`（`api.mjs:1368`）→ `QuestionGroupCard.topicLabels` 带上；concierge `conciergeSearch.ts` 与经典 `useMemo` 都把 `topicLabels[].label` 纳入关键词 haystack。**所以本刀不需要新检索层**。
- **回填目标量**：`SELECT COUNT(*) ... NOT EXISTS topic_labels` = **18**（当前全部）。
- **覆盖**：主题分类基于题组的 passage detail；无 passage / 分类失败的组**跳过并计入报告**，不中断整批。

## Locked Product Decisions

- **方案 A**：老师触发的批量回填；**不耦合导入**（绝不在 import/publish/解析 prompt 里自动跑——尊重 `94950a1`）。
- **AI 直接落库**：generate→bind 连调，`source='ai'`，跳过人工确认；老师可事后用现有 `PUT /topic-labels` 改。
- **幂等**：只处理无标签的组；已标的跳过（可安全重跑 / 续跑）。
- **key-gated**：回填需 DeepSeek key（owner 会填；复用现有 key 入参/环境变量来源）。
- **逐组容错**：单组失败不炸整批；返回 `{ processed, labeled, skipped, failed[] }` 摘要。
- **最小 UI**：仅"触发 + 进度/结果"；**不改配色**；最终 UI owner 后改。
- **不新建检索层**：复用现有卡片 topicLabels + concierge/经典关键词搜。结构化"按主题语境/群"筛选**留给后续找题 UI（Claude Design）**，不在本刀。

## Must Do（TDD：可注入分类器，纯编排逻辑先写断言→实现到绿）

### Step 1 — 后端：批量回填编排（可测、可注入）
- 新建 `server/topic-labels/backfillTopicLabels.mjs`（或同级）：`backfillTopicLabels({ db, listUnlabeledGroupIds, classify, bind, apiKey, model, limit? })` 纯编排——取无标签组 → 逐组 `await classify(id, apiKey, model)` → `bind(id, result.topicLabels)` → 收集摘要；单组 try/catch 计入 `failed`。`classify`/`bind`/`listUnlabeledGroupIds` 都**注入**（生产传 `generateTopicLabelsByQuestionGroup`/`bindTopicLabelsToQuestionGroup`/真实 SQL；测试传 stub，**不打真 DeepSeek**）。
- Verification（Step 4 verifier）：注入 mock classify → 3 个无标签组全 labeled+bound、已标组被跳过、第 2 组 classify 抛错→计入 `failed` 且不中断、摘要计数正确；空 key 行为（按现有 generate 的 key 解析）。

### Step 2 — 后端：回填路由（经工厂注册）
- 加 `POST /api/topic-labels/backfill`（经 `createQuestionGroupRoutes()` 内或新 `createTopicLabelBackfillRoutes()` 工厂，加进 `serverRoutes` 组合——**不往 `:436` 字面 push**）。body 取 `apiKey`/`model`（参照现有 topic-labels 路由的 `parseRequestArgs`）。调 Step 1 编排，返回摘要 JSON。
- Verification：路由注册可达（路由表存在或最小请求 smoke）；与现有 topic-labels 路由不冲突。

### Step 3 — 前端：最小触发 UI（做个先，零配色改动）
- 加一个"给题库打主题标签"按钮（放在合理且低调处，如 AI 模式工作区或个人空间一角；owner 后改位置）。点击 → POST `/api/topic-labels/backfill`（带现有 key 入口的 key）→ loading 态 → 显示结果摘要（"已为 N 个题组打标签，跳过 M，失败 K"）。
- 复用现有按钮/面板样式类，**不新增颜色、不动 token/hex**。
- Verification：浏览器 QA（Step 5）。

### Step 4 — Verifier + CI
- 新建 `scripts/verify-i16b-theme-labels-backfill.mjs`：import Step 1 编排，注入 mock 跑上述断言（全标/跳过/容错/摘要）；源码断言回填路由经工厂注册、前端按钮调 `/api/topic-labels/backfill`。注册进 `scripts/verify-ci.mjs` + `scripts/README.md`。
- Verification：`node scripts/verify-i16b-theme-labels-backfill.mjs` 绿；`verify-ci.mjs` 绿；`npm run build --prefix app` 绿。

### Step 5 — 浏览器 QA（真数据，load-bearing）
- 起 app（前端 5173 / API 8787），填 DeepSeek key。点"给题库打主题标签"→ 等回填完 → 摘要显示已标若干组。
- 然后在 AI 模式 / 经典模式搜一个主题词（如"环境保护"/"科技"）→ **命中刚打上该主题的题组**（验证"搜主题能搜到"）。
- 抽查一个组的主题标签：`source='ai'`、三级路径合理。
- 回归：不影响其它搜索 / 卡片 / 解析。不提交 `app/public/paper-assets/**`。

## Forbidden

- **绝不把 topicLabels 塞进任何解析 prompt / `analyzeReading.mjs` / `packageBuilder.mjs` / import/publish 流程**（`94950a1` 的教训）。分类只走独立的 generate/bind。
- **不改配色**：不动颜色 token / 任何 hex；最小 UI 复用现有样式。
- **不新建检索层 / 不改卡片契约**：复用现有 `topicLabels` 进卡片 + 关键词搜；结构化主题筛选留后续。
- **不改** `question_group_topic_labels` schema / `TOPIC_LABEL_TAXONOMY` / 现有 `POST/PUT /topic-labels` 行为 / `DEEPSEEK_TOPIC_LABEL_PROMPT`（只读复用）。
- 路由经工厂注册（非 `:436` 字面 push）。
- 不提交 `app/public/paper-assets/**` / `.claude/launch.json`；禁止 `git add -A`。

## Suggested Files

- `server/topic-labels/backfillTopicLabels.mjs`（新：可注入编排）
- `server/api.mjs` / `server/question-bank/questionGroupRoutes.mjs`（回填路由 + 暴露 `listUnlabeledGroupIds`）
- `app/src/App.tsx`（最小触发按钮）+ `app/src/services/questionGroups.ts`（`backfillTopicLabels` fetch）
- `scripts/verify-i16b-theme-labels-backfill.mjs`（新）+ `scripts/verify-ci.mjs` + `scripts/README.md`

## Verification

- 定向：`node scripts/verify-i16b-theme-labels-backfill.mjs`、`git diff --check`。
- 全门：`node scripts/verify-ci.mjs`、`npm run build --prefix app`。
- 浏览器 QA：Step 5。

## Browser QA Matrix

| Case | Expected |
| --- | --- |
| 点"给题库打主题标签"（填了 key）| 回填跑完，摘要显示已标 N / 跳过 M / 失败 K |
| 回填后搜主题词（环境保护/科技…）| 命中刚打该主题的题组 |
| 再点一次回填 | 已标的跳过（幂等），只处理新无标签组 |
| 抽查标签 | `source='ai'`、三级路径在课标 taxonomy 内 |
| 配色 / 其它搜索 | 不变（回归）|

## DEV Readiness

- 本 plan committed → **PA before DEV**（产品边界 + UI + 复用 AI 分类器）。`pa-reviewer`（fresh Opus）写 `pa.md`。
- DEV 用 **TDD**：Step 1 编排注入 mock 先写断言→实现到绿，再接路由 + 最小 UI。
- **PA attention asks**：
  1. 回填同步循环 vs 异步/分批：18 组同步可接受；但"很多很多题"时会长时间阻塞——本刀做同步 + 摘要够吗，还是要预留分批/进度流？
  2. key 解析：复用现有 generate 的 key 来源（入参/环境变量）是否一致、最小 UI 怎么拿 key（复用现有 DeepSeek Key 入口）？
  3. "填完即可搜"链路：卡片 topicLabels 关键词搜是否对**所有题型**有效，还是仅 reading（分类器是否只对有 passage 的组产标签）？覆盖局限要不要在摘要里讲清楚？
  4. 幂等口径：以"组有无标签"判跳过，是否会漏掉"标签过时需重打"的情形（本刀不处理重打，记为 watch 即可）？
  5. 最小 UI 放哪最不碍事、又能让 owner 后面好替换？

## Out of Scope（后续）

- **结构化"按主题语境/主题群"筛选 UI**（chip/树）——随找题 UI（Claude Design）。
- **重打/更新已有标签**、置信度阈值、人工复核流。
- **C 被动/语态**、难度维度。
- 异步/后台大批量回填（规模真大时再做）。

## PA Follow-Up Decisions

<PA 后填。>

| PA item | `pa.md` 处置 | `plan.md` handling | Status |
| --- | --- | --- | --- |
|  |  |  |  |
