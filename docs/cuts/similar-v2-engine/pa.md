# PA Review — similar-v2-engine (E5) + grammar-facets-v2 (D1) 同场审

- Reviewer: PA (fresh context, un-anchored)
- 审查对象: commit 4214315 的两把已立案刀
  - `docs/cuts/grammar-facets-v2/plan.md`（D1，medium，契约面 = analysis schema v2 + facetKey registry）
  - `docs/cuts/similar-v2-engine/plan.md`（E5，medium-large，契约面 = API + 配方语义）
- 语义基准: `docs/cuts/similar-questions/program.md` §配方 v2 / §语法填空考点粒度终稿 / §篇章相似排序（2026-07-15 owner 逐格拍板，本审不重开语义）
- 本报告是完整版；`docs/cuts/grammar-facets-v2/pa.md` 为 D1 摘录 + 指针。

## Verdict

**APPROVE WITH MUST FIX（Must Fix 后开工）** — 两刀方向都对（program.md 语义
落地忠实），但存在一个**跨刀契约黑洞**：两份 plan 都完全没有提到仓库里已经
上线的 **I16·C 谓语时/语/一致子系统**（sidecar 文件 + 已挂载路由 + teachingFacets
合并 + 导入驱动）。D1 要"显性化 tense/voice/agreement 进 schema"、E5 要"消费
谓语向量 tense4/voice2/agreement1"——两边讲的都是 I16·C 已经产出的那份数据，
但谁都没说清 **E5 到底从哪里读、I16·C 那套是退役还是保留**。不锁死这一点，
DEV 会（a）让 E5 读一个 D1 从没在那个位置产出的字段，或（b）造出与 I16·C
矛盾/重复的第二份真值。这正是"同场审两刀契约一致性"要拦的东西。

Open PO decisions: **0**（语义全在 program.md 拍死；下列 Must Fix 是工程契约
决策，PM 压进 plan.md 即可，无需 owner 再裁）。DEV 可在 Must Fix 压稿后开工。

---

## 跨刀一致性总节（最重要）

### 事实底（本审实测，非引用 plan）

仓库已存在完整、**已上线**的 I16·C 谓语教学轴子系统：

- **每空 sidecar 文件** `grammar-fill-verb-profile-v1.json` 已铺在各卷
  `.../latest/analyses/` 下（实测存在，例 `paper-2020-i`、`paper-2025-ii` …），
  每空存 `{tense, voice, agreement}`。
- teachingFacets.mjs 把 sidecar 合并进每组聚合 Set `tenses/voices/agreements`
  （`server/search/teachingFacets.mjs:136-140`、`205-225`、`292-300`），
  并对外暴露 `tense/voice/agreement` 过滤参数（`:379-381`、`:400-415`、`:467-470`）。
- **已挂载的活路由** `POST /api/grammar-fill/verb-profiles/backfill`
  （`server/grammar-verb-profile/verbProfileBackfillRoutes.mjs`，
  在 `server/api.mjs:515` 装配）。
- 确定性分类器 + 抽取器已存在可复用：`analyzeGrammarFillVerbProfile.mjs` 的
  `classifyFiniteVerbFormDeterministic` / `extractFiniteVerbBlanks`。
- 消费/关联面还有：`verbProfileSidecar.mjs`、`verbProfileBackfillService.mjs`、
  `scripts/import-pipeline/vp-driver.mjs`、`scripts/verify-i16c-grammar-verb-axes.mjs`、
  `server/api.mjs` 内引用。

**语义还发生了变更**：I16·C 的 `agreement` 定义为"需主语上下文、have 型靠形态
判不了 → 走 AI"（verify-i16c 头注 MF-4）。program.md 2026-07-15 owner **重定义**
主谓一致为**纯 answer 表面**（is/am/are/was/were/has/have/does/三单-s 即算，
grammar-facets-v2 plan.md:30-32；program.md:189-191）。所以 sidecar 里现存的
`agreement` 值是**旧定义产物、按新定义已失效**，不能直接复用。

### 契约字段逐项对账（D1 产 vs E5 消费）

| 契约项 | D1 声称产出 | E5 声称消费 | 对账结论 |
|---|---|---|---|
| `role` 七格 | 归一 `adverbial/attributive/subject/object/predicative/object-complement/subject-complement`（plan:19） | 非谓语种子按 `role` 匹配（plan:39） | **对得上**。role 字段已在 analysis 且已流经 `buildRawFacetIndex` 的 `...entry`（similarQuestions.mjs:122）与 teachingFacets `roles`。注：现库无 `predicative`（实测 role 分布无表语），由 D1 role 校正引入；两边词表需钉同七格。见 C-2。|
| `facetKey` v2 词表（八向/三新类） | conversion 八向全称 + noun.number/genitive + adjective.comparison（plan:20-25） | "其余考点种子 = 同 facetKey 命中"（plan:41） | **对得上**（都是 facetKey 字符串比较），但**旧 key 消费方 sweep 不全** → MF-3。|
| `tense`（枚举） | 谓语条目新增字段，answer 推导（plan:29-31） | 谓语向量 时态4分（plan:40） | **读取路径未锁** → MF-1 / MF-2。|
| `voice`（active/passive） | 同上 | 语态2分 | 同上 |
| `agreementSensitive`（bool） | 同上（plan:31-32） | 一致1分 | 同上 + **命名三叉**：sidecar `agreement`(string) vs D1 `agreementSensitive`(bool) vs 索引 `agreements`(Set)。E5 只能消费一个名字 → MF-1。|
| `form`（to-do/doing/done） | 非谓语 answer 推导，只进 chip 不进匹配（plan:34-35） | chip 带 form 解释（plan:39） | **对得上**，语义一致（program.md:180 形态降级当解释）。|

### 结论

跨刀最大风险 = **谓语三字段的"单一真值来源 + 读取路径"未定义**，且与已上线的
I16·C 冲突。E5 的谓语向量是 medium-large 的核心新逻辑，它站在一个 D1 没画清的
地基上。必须在 plan.md 里钉死后 DEV 才能造 fixture / 写 scorer。

---

## Must Fix（阻塞 DEV）

### MF-1 — D1 必须显式收编/退役 I16·C 谓语 sidecar 子系统，并统一字段名与语义
- 依据: `server/search/teachingFacets.mjs:136-140/205-225/292-300`、
  `server/grammar-verb-profile/verbProfileBackfillRoutes.mjs` +
  `server/api.mjs:515`（活路由）、sidecar 实测在盘、
  grammar-facets-v2/plan.md:28-32（对 I16·C 只字未提）。
- 风险: D1 若把 tense/voice/agreementSensitive 折进 analysis-v2 却不动 sidecar，
  则同一数据两份真值、且 sidecar 的 `agreement` 按旧定义已错；teachingFacets 的
  `tenses/voices/agreements` 合并逻辑与新 schema 打架；`/api/.../backfill` 活路由
  产出与新 schema 语义不符的数据。
- 必须处置（plan.md 记录其一并展开 sweep）:
  1. 决定谓语三字段的**唯一真值位置**：折进 `grammar-fill-analysis-v2`
     blank 条目（program.md:190-191 "解析管线 schema 显性化 tense" 强烈指向此路），
     **同刀退役 sidecar 路线**；或明确保留 sidecar 由 D1 按新定义重算。
  2. 若折进 schema（推荐）：sweep 必须新增 I16·C 全套处置 —
     `teachingFacets.mergeVerbProfileAxes` + `tense/voice/agreement` 过滤参数、
     `verbProfileSidecar.mjs`、`verbProfileBackfillService.mjs`、
     `verbProfileBackfillRoutes.mjs`（活路由，退役需下线并测 404/改指）、
     `analyzeGrammarFillVerbProfile.mjs`、`scripts/import-pipeline/vp-driver.mjs`、
     `verify-i16c-grammar-verb-axes.mjs`、`server/api.mjs` 引用、盘上 sidecar 文件回滚。
  3. **字段名钉死一个**：E5 只消费一个名（建议 answer 派生 bool 用
     `agreementSensitive`；若保留索引聚合则同步 `agreements` 语义）。
  4. **agreement 按新定义重算，禁止复用 sidecar 旧值**（旧值是 subject-context/AI 定义）。

### MF-2 — E5 谓语向量的"每空读取路径"必须在两份 plan.md 里钉死
- 依据: similarQuestions.mjs:73-132（`buildRawFacetIndex` 只走 analysis 文件、
  `...entry` 透传，**不读 sidecar**）；teachingFacets 索引只有**每组聚合 Set**，
  没有每空 tense/voice（谓语向量取"组内最高分空"需要每空粒度）；
  similar-v2-engine/plan.md:40 未说读取源。
- 风险: E5 谓语向量按 `raw.tense/voice/agreementSensitive` 取每空值。若 D1 把这些
  留在 sidecar，`buildRawFacetIndex` 拿不到 → E5 向量恒空/需额外扩 sidecar-merge
  逻辑（未列入 E5 scope）。fixture 也会按错的字段位置造，verify 全绿但线上取不到。
- 必须处置（plan.md 记录）: 明写"E5 谓语向量从 analysis-v2 blank 条目经现有
  raw-index 走 `...entry` 读每空 tense/voice/agreementSensitive"（与 MF-1 折进 schema
  一致）；若 MF-1 选保留 sidecar，则 E5 scope 必须加"buildRawFacetIndex 合并 sidecar
  每空轴"这一条工程量。E5 fixture 必须按最终字段位置/名字造。

### MF-3 — D1 前端 facetKey 文案表 key 重映射的范围边界与完备性 verify
- 依据: `app/src/features/paper-intelligence/grammarFillFacetRegistry.ts` 硬编码
  正在退役的旧 key：`given.noun`(:76)、`given.adjective`(:90)、
  `given.derivation.noun-to-adj`(:104)/`verb-to-noun`(:118)/`verb-to-adj`(:132)/
  `adjective-to-noun`(:146)；D1 plan.md:20-25 全部退役/改名；
  Forbidden "不动 UI"(:61) 与 sweep "前端 facet 文案表"(:48) 语义打架。
- 风险: 迁移后每个改名/新 key 的空在前端命中不到文案 → 空 chip 或触发兜底
  （E5 plan.md:57 引 DESIGN §7 禁兜底）。DEV 面对"不动 UI vs 改文案表"会猜边界。
- 必须处置（plan.md 记录）:
  1. 明确 registry **数据表（key→文案）在 D1 scope 内可改**，UI 组件不动——把
     grammarFillFacetRegistry.ts 从 Forbidden 例外出来。
  2. verify 加两条：全站旧 key 零残留（含前端）；**v2 每个新 key 在 registry 有条目**
     （否则红），封死禁兜底黑洞。

---

## Should Fix（不阻塞，但压稿前应改）

### SF-1 — verify 脚本名与断言数错误
- 两份 plan 都写"现有 `verify-similar-engine`（29 断言）逐条处置"
  （similar-v2-engine/plan.md:76）。**实测不存在该文件**；真身是
  `scripts/verify-similar-questions.mjs`，**35 个 `assert(` 调用**（非 29）。
  DEV 会照名找不到、照数对不齐。改正名字与数目，逐条处置清单才映射得上。

### SF-2 — `source_type` 枚举实证与 "类值" 措辞
- 实测 `sources.source_type` 域**恰好两值**：`real_exam`(264)、`mock_exam`(9)
  （question-bank.sqlite）。E5 plan.md:26 "`real_exam` 类值 > `mock_exam`" 的
  "类值"暗示一个真题类集合——实际是单值，判据应是 `=== 'real_exam'` 二元。
  建议 plan 钉死二元并让 verify 断言枚举域。**注**：mock 仅 9 条，"真题>模拟"
  档在真库几乎不触发，verify 需自造/引用含 mock 的构造对才判得动。

### SF-3 — 无话题标签的种子 → 篇章相似空池，无诚实兜底
- 实测无 topic label 的组：grammar_cloze 1、cloze 1、seven_choices 1、reading 4
  （coverage 96.7% 与 program.md 一致）。篇章相似是**硬门槛**（program.md:150-160），
  这类种子 → 零候选入池 → 空结果；这类候选永不出现。E5 plan.md:75 只提"门槛/池子
  诚实计数"，未覆盖**种子自身零话题**这条空池路径。建议加诚实空态 + verify 用例。

### SF-4 — grammarFill 混类多种子的子配方未定义
- E5 grammarFill 按种子 facetKey 分三支（谓语向量/非谓语 role/其余 facetKey，
  plan.md:38-42）。API 收 seeds 数组（similarQuestions.mjs:594-608）。当一次传入
  finite+non-finite 混类种子时走哪支未定义。program.md 本命=单种子错题（program.md
  盲区5），但契约上数组可混。plan 应钉：拒绝 / 取首种子类 / 并集，任选其一并测。

---

## Consider（可选优化，不入本刀也行）

- **C-1**: D1 谓语三字段推导别从零写——`classifyFiniteVerbFormDeterministic` /
  `extractFiniteVerbBlanks`（`analyzeGrammarFillVerbProfile.mjs`）已是确定性分类器，
  可复用/改造（agreement 按新定义即可）。plan 指个针，省一轮重造轮子。
- **C-2**: E5 verify 白名单 role 必须含全七格（含现库尚无的 `predicative`，
  由 D1 role 校正引入）；谓语/非谓语种子分支以 facetKey `verb.finite`/`verb.non-finite`
  判定——这两点写进 verify 断言，防漏格假绿。
- **C-3**: 篇章排序分层落 `primary×10000+secondary×100` 骨架时，reading 的
  篇位在**真题之上**（program.md:150-160），非 reading 只有真题一档。plan 可点一句
  tier→槽位映射，避免 DEV 把真题错放到篇位同层。

## Notes（事实记录，无需动作）

- 33 份 latest grammar-fill 分析文件 = 330 空（实测，与 D1 plan.md:43 "330 空"一致）。
- 旧 facetKey 分布实测与 program.md "旧桶三乱" 吻合：given.adjective 28（形变副~13+
  比较~11+形变名~3）、given.noun 22（数15/格3/派生1）、derivation 四向 41、
  verb.finite 52、non-finite 62、numeral 2、pronoun 9。八向重归桶数据基础成立。
- 现库 role 分布：adverbial 26/attributive 17/object 13/subject-complement 3/
  subject 2/object-complement 1（共 62 = non-finite）。program.md 目标分布与
  错档校正（tell sb to do→宾补、stays closed→表语）对得上，D1 嫌疑名单 ≤20 合理。
- similar 引擎 `primary×10000+secondary×100+bonus` 分层骨架 + 池子构建/排除
  （similarQuestions.mjs:488-496、697-704）确可复用，E5 "换血 RECIPES" 判断成立。
- `densityTerm`/`READING_WORD_COUNT_DECAY_WINDOW`/阅读话题+20/七选五+8 体裁等
  恒真项（:289-295、:57、:474-482、:383-405）确为 v2 拆除目标，拆除面清晰。

---

## Must Fix → Plan Disposition Checklist

| Must Fix | plan.md 应记录（谁的 plan） |
|---|---|
| MF-1 | grammar-facets-v2：新增"I16·C 谓语 sidecar 收编/退役"决策段 + 完整 sweep 清单（含活路由下线、字段名统一、agreement 按新定义重算、回滚 sidecar 文件）。定为 Must Do 步 + Forbidden（禁复用旧 agreement 值）+ Verify（旧 sidecar 消费面零残留）。|
| MF-2 | 两份 plan：明写"谓语每空 tense/voice/agreementSensitive 的唯一读取源 = analysis-v2 blank 条目经 raw-index `...entry`"。E5 记为数据契约锁 + fixture 构造依据。|
| MF-3 | grammar-facets-v2：把 grammarFillFacetRegistry.ts 移出 Forbidden（数据表可改、UI 组件不动）；新增 Verify 两条（旧 key 零残留含前端 / v2 每新 key 有 registry 条目）。|

## DEV Readiness

不满足开工门槛：谓语三字段的真值来源与读取路径未锁（MF-1/MF-2），
E5 无法可靠造 fixture / 写向量 scorer。MF-1~MF-3 由 PM 压进两份 plan.md 后可开工；
合入顺序 D1→E5 与 "E5 先行开发、verify 全绿以 D1 落库为前提"（E5 plan.md:9）在
钉死读取源后自洽——但需保证 analysisConfigs 升 v2（teachingFacets.mjs:51-56）与
33 文件重写**同刀原子落地**，否则中间态 grammarFill 索引整桶掉线（v2 校验拒 v1，
similarQuestions.mjs:112 / teachingFacets.mjs:282）。
