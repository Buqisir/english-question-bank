# I17·B Plan — 主题标签 backfill 改走 Claude(12 套新课标真题)

## Cut Size

**medium**。Touches:
- **data contract = no**(`question_group_topic_labels` 表 schema、topic-label payload 形状、taxonomy 内容**全不动**;只把 api.mjs 内部纯件加 ESM 导出 + 抽一个纯函数)。
- **product boundary = yes(轻)**——点亮 12 套真题的「按主题找题」。
- 触 **`server/api.mjs`(契约 hook 守护)**:behavior-preserving 的加法导出 + 一处 inline→fn 抽取 + rewire。

全门:`Sync → plan.md → fresh PA(pa.md)→ PM 压缩 → DEV → CR-lite → PO QA(搜主题命中)→ RM`。**无 UI 改动**(I16b 已建回填 UI / 搜索链路);故无浏览器 UI QA,但有 PO QA(driver 跑完、搜主题词命中 12 套题组)。

## Objective

owner directive:**花 Claude 额度、跳过 DeepSeek**。I16b(#181)已建好 DeepSeek 版 topic-label backfill(orchestrator + route + UI + 搜索链路);本刀只把**这一类题组的分类调用从 DeepSeek 换成 Claude**,并把 **12 套新课标真题(108 组)** 标满,让「按主题找题」对这批真题成立。

决定性事实(本会话 live DB 核实):**12 套 = 108 组,当前仅 9 组有 topic-label,99 组未标。**

## Why(owner-locked, 2026-06-05)

- **范围 = 先 A**(topic-label 改 Claude);B(把 `.scratch` driver 固化到 `scripts/` + 整簇抽模块 + 代码 CR)**不在本刀**。owner 选「先 A 落地、小步先可用」。
- **api.mjs 改法 = Z-lite**(owner「你推荐哪个」→ Claude 拍):**最小、behavior-preserving 的加法导出**,**不**在本刀把 taxonomy/prompt/normalize 整簇搬进模块(那是 B 的「driver 固化」该做的,避免把 B 的活偷带进 A)。
- **模型 = Sonnet**(Claude 拍,可否决):topic-label 是从 ~100 项固定 taxonomy 选标签的**受约束分类**,不是开放解析;verb-profile(#189)也用 Sonnet。先 Sonnet + 抽查 10–15 组,错了再升 Opus。尊重「够用就好」。
- **重标全 108 组、覆盖旧 9 组**(Claude 拍,可否决):全库 topic-label 都 `source='ai'`,分不出新旧;旧 9 组才 9 个、重做极便宜;一个模型 / 一版 taxonomy 的一致性对要上线的产品更值。`bindTopicLabelsToQuestionGroup` 走 `replaceQuestionGroupTopicLabels`(删+插)天然覆盖。
- **被砍的教训(沿用 I16b)**:分类**绝不重塞解析 prompt**(`94950a1` 精准回退过);只走独立的 generate/bind 通道。本刀只换 generate 的 provider,bind/normalize/taxonomy 不动。

## Code Reality(本会话 intrinsic 核实 — 围着它设计)

- **api.mjs 顶层几乎零 ESM 导出**(只 `isGroupPrintReady` @374);topic-label 全簇内部、挂 serverContext。这正是 topic-label「需要 api.mjs 改」而 verb-profile「干净 drop-in」的根因(verb-profile 函数早在 `server/grammar-verb-profile/`、`server/paper-import-ai/` 独立模块 + 已有 `providerCaller` seam)。
- **要复用 / rewire 的实体**(`server/api.mjs`):
  - `callDeepSeekTopicLabels(context)` @10469-10491:inline 拼 messages(`DEEPSEEK_TOPIC_LABEL_PROMPT` @6585 + `TOPIC_LABEL_TAXONOMY` @148-259 的 allowedLabels + `formatQuestionGroupForTopicLabel(detail)` @9560)。**抽取点 = 10475-10484 的 messages 数组。**
  - `generateTopicLabelsByQuestionGroup(...)` @10493-10537:DeepSeek 编排(getDetail → callDeepSeekTopicLabels → normalize),返回 `{ topicLabels, ... }`、**不落库**。**本刀不改它**(DeepSeek 路保留)。
  - `normalizeTopicLabelPayload(payload)` @955-977:带 taxonomy 规范化 + 去重(依赖 `normalizeTopicLabelItem`/`TOPIC_LABEL_BY_LABEL`/`TOPIC_SUBTOPIC_ALIASES`/`compactTopicLabelText`)。
  - `getQuestionGroupDetail(id)` @1467:取题组详情(已挂 serverContext)。
  - `bindTopicLabelsToQuestionGroup(id, input)` @10539-10558:`replaceQuestionGroupTopicLabels` 落库(已挂 serverContext;内部会再 normalize 一次)。
  - `listUnlabeledGroupIds()` @10560:**全库**未标列表,**未 scope 到 12 套** → 本刀 driver 不用它,自带 scoped SQL。
- **复用层(I16b,不重造)**:`server/topic-labels/backfillTopicLabels.mjs` 是注入式 orchestrator(serial 循环);`getTopicLabelsForQuestionGroups` 已 merge 进 `selectQuestionGroupCards` → `QuestionGroupCard.topicLabels` → concierge/经典关键词搜已覆盖。**所以本刀不需要新检索层 / 不改卡片契约**:标签落库即可搜。
- **DB = `data/question-bank.sqlite`**(同导入库,非 teaching-qbank.db);表 `question_group_topic_labels`;12 套 = `sources` 中 `source_type='real_exam' AND year BETWEEN 2020 AND 2025`(region 含「全国新课标Ⅰ/Ⅱ」),经 `passages.source_id` → `question_groups.passage_id` 关联。

## Locked Decisions

1. **Z-lite 加法导出**(api.mjs):①抽 `buildTopicLabelMessages(detail)` 纯函数(由 10475-10484 提取,**留在 api.mjs**),`export`;②`export` `normalizeTopicLabelPayload`;③`export` `getQuestionGroupDetail`;④`export` `bindTopicLabelsToQuestionGroup`;⑤`callDeepSeekTopicLabels` 改调 `buildTopicLabelMessages(context.detail)`(prompt 单一来源,DeepSeek 路与 Claude driver 共用)。**仅此 5 处;不删 taxonomy、不搬模块、不改任何行为。**
2. **模型 Sonnet**(可否决,见 Why)。
3. **重标全 108、覆盖旧 9**(可否决,见 Why)。
4. **labels 只写 DB**(gitignored)——**无提交的内容文件**。本刀提交物 = api.mjs 的 5 处加法 + 可选 verify 更新。
5. **driver 在 `.scratch/import-pilot/`**(gitignored,**不进本刀 CR**;固化到 `scripts/` 是 B)。其正确性由 PO QA 证(标签落库 + 搜命中),同导入管线先例。

## Must Do

### Step 1 — api.mjs Z-lite 加法导出(契约级,DEV scope)
- 按 Locked #1 的 5 处改。**behavior-preserving**:抽 `buildTopicLabelMessages` 后,`callDeepSeekTopicLabels` 产出的 messages 必须**逐字符等同**原 inline(同一 system/user 文案、同一 allowedLabels 拼法)。
- 验证:`node scripts/verify-i16b-theme-labels-backfill.mjs` **保持绿**(证 DeepSeek 路经改后仍通);`server/api.mjs` 仅这 5 处 diff。

### Step 2 — `.scratch/import-pilot/` topic-label driver(gitignored,不进 CR)
- `topic-driver.mjs list|persist`:
  - **list**:scoped SQL 列 12 套全 108 组 id(+ paperName/groupType 便于报告);**不依赖 `listUnlabeledGroupIds`**。
  - **persist**:每组 `getQuestionGroupDetail` → `buildTopicLabelMessages` → **Claude(Sonnet)subagent** 产原始 JSON → `normalizeTopicLabelPayload` 校验(空/越界→记入 failed、不中断)→ `bindTopicLabelsToQuestionGroup` 落库。
  - 编排:serial 即可(108 组一次性);如要提速用 **Workflow** 扇出 classify(一组一 Sonnet agent、自校验)+ **serial bind**。
- **发布纪律(硬约束)**:bind 直写 SQLite → **先停 API**(`lsof -ti :8787 | xargs kill`)释放锁 → 跑 persist → **重启 API 刷缓存**(直连发布不 invalidate 路由缓存)。
- 报告:`{ processed, labeled, skipped, failed[] }` + 抽查样本,**诚实覆盖**。

### Step 3 — Verify
- **必须**:`node scripts/verify-i16b-theme-labels-backfill.mjs` 绿(回归围栏:DeepSeek 路 + MF-2 四文件 fence + 卡片搜索链路)。
- **可选(PA 定要不要)**:加一条轻断言「`buildTopicLabelMessages`/`normalizeTopicLabelPayload` 可 ESM import 且 buildMessages 对样本产出与基线等同」——证抽取无行为漂移。若加,注册进 `verify-ci.mjs` + `scripts/README.md`。
- `node scripts/verify-ci.mjs` 绿;`npm run build --prefix app` 绿(api.mjs 改动不应碰前端,但跑一遍兜底)。

### Step 4 — PO QA(交 owner,load-bearing)
- driver 跑完 12 套 → 108 组 labeled(failed 应为 0 或可解释)。
- 在 AI/经典模式搜主题词(如「环境保护」「科技」「人际沟通」)→ 命中刚标的真题组。
- 抽查 2-3 组:`source='ai'`、三级路径(theme/theme_group/subtopic)在 taxonomy 内、与篇章主题贴合(Sonnet 质量抽检;不达标则升 Opus 重跑该批)。

## Forbidden

- **绝不重塞解析 prompt**:不碰 `prompts/reading-choice-analysis-v1.md`、`server/paper-import-ai/analyzeReading.mjs`、`server/paper-import-ai/packageBuilder.mjs`(不得出现 `topicLabels`);不重建 `server/shared/topicTaxonomy.mjs`。**(verify-i16b Req7 MF-2 围栏,必须保持绿。)**
- **不改 data 层**:`question_group_topic_labels` schema、topic-label payload 形状、`TOPIC_LABEL_TAXONOMY` 内容、`DEEPSEEK_TOPIC_LABEL_PROMPT` 文案、`POST/PUT /topic-labels` 与 `/topic-labels/backfill` 行为——**全不动**(只读复用)。
- **不动 DeepSeek 路**:`generateTopicLabelsByQuestionGroup` / `callDeepSeekWithFallback` 的语义不变;Z-lite 只抽 messages + 加 export。
- **不搬模块、不删 taxonomy**:整簇抽进 `server/topic-labels/` 是 **B**,不在本刀(避免 A 偷带 B)。
- **不新建检索层 / 不改卡片契约**:复用现有 `topicLabels` → concierge/经典搜。
- **发布串行 + 停/起 API**:批量 bind 前停 API、完后重启;**绝不并发直写 SQLite**。
- **stage 显式**:禁 `git add -A`;永不提交 `app/public/paper-assets/**` / `.claude/launch.json` / `.scratch/**` / `data/*.sqlite`。

## Suggested Files

- `server/api.mjs`(Z-lite 5 处:`buildTopicLabelMessages` 抽取 + 4 export + rewire)。
- `.scratch/import-pilot/topic-driver.mjs`(新;gitignored;不进 CR)。
- (可选)`scripts/verify-i17b-topic-label-exports.mjs` + `scripts/verify-ci.mjs` + `scripts/README.md`——PA 定。

## Verification

- 定向:`node scripts/verify-i16b-theme-labels-backfill.mjs`、`git diff --check`、`git diff --stat server/api.mjs`(确认仅 5 处)。
- 全门:`node scripts/verify-ci.mjs`、`npm run build --prefix app`。
- PO QA:Step 4。

## DEV Readiness — PA attention asks

1. **api.mjs 加 4 个 ESM export 逆文件纹理(grain = serverContext)吗?** getDetail/bind 本就挂 serverContext,加 `export` 纯加法;normalize/buildMessages 是纯 helper。可接受,还是 PA 认为该最小化到「只 export driver 必需的、其余走别的 seam」?(B 会把这些收进模块。)
2. **`buildTopicLabelMessages` 抽取的等价性**:10475-10484 提取后,DeepSeek 路的 messages 必须逐字不变——要不要一条 characterization 断言锁住(Step 3 可选项)?
3. **重标覆盖 vs 幂等**:本刀 driver 故意覆盖旧 9 组(不走 `listUnlabeledGroupIds` 的跳过语义)。这与 I16b「幂等跳过已标」是不同口径——确认对一次性真题 backfill 合理,且不影响 I16b route 的幂等行为(两条路独立)。
4. **Sonnet 质量门**:从固定 taxonomy 选标签,Sonnet 是否够?抽检多少组算过关、什么信号触发升 Opus?
5. **scoped SQL 口径**:`real_exam + 2020-2025 + 新课标 region` 是否精确框住 12 套、不误纳其它真题(库里这区间是否只有这 12 套)?driver 列表要不要打印 paperName 供 QA 核对组数=108?

## Out of Scope(→ B 或后续)

- 把 `.scratch` driver 固化到 `scripts/` + 整簇 taxonomy/normalize 抽进 `server/topic-labels/` 模块 + 切卷 prompt 入库 + 代码 CR(**B**)。
- 重打/更新已有标签的常规流、置信度阈值、人工复核 UI。
- 结构化「按主题语境/群」chip/树筛选(随找题 UI / Claude Design)。
- 其它真题(全国甲/乙、浙江、模拟)的 topic-label。

## PA Follow-Up Decisions

_(待 fresh PA 写 `pa.md` 后,PM 帽在此把 Must Fix 映射成 plan 处置。)_
