# similar-engine (E1) — CR 报告

- 审查人：CR（Opus，冷读 fresh context）
- 日期：2026-07-09
- 被审 diff：基底 `b5bfdff` → `b91c8a3`（含 checkpoint `203f3ad`）
- 复核深度：medium（PA-lite，理由见下）
- **结论：APPROVE**（0 Must Fix；6 项 Should Watch，其中 SW-1/SW-2 是给 E2 的硬交接）

verify 现场重跑：`node scripts/verify-similar-questions.mjs` → **29 passed, 0 failed**（真库真资产）。

---

## PA-lite 降级复核：成立 ✅

plan header 主张"确定性只读检索层、可逆、配方权重为配置级、无 DB 变更"。逐条对代码核实：

- 无 `data/**`、无迁移、无 schema 变更（diff 名单确认）。
- 新增 `POST /api/similar-questions` 全程 `openDatabase({ readOnly: true })` + finally `db.close()`（similarQuestions.mjs:691-700），只读、无连接泄漏。
- 配方为 `RECIPES` 配置对象（similarQuestions.mjs:258-398），dispatch 是属性查找非分支硬编码，权重确为配置级。
- 引擎对 AI 线零改动（`grep -niE "deepseek|ai-provider|dailyLimit|openai|anthropic" similarQuestions.mjs` → none）。

可逆、加性、只读、零数据面变更——PA-lite 降级我**同意**，不需要补 PA。

---

## 审查轴逐条裁定

### 1. 配方正确性 ✅

四题型配方与 program 表逐行核对一致（similarQuestions.mjs:258-398）：

| 题型 | 主序 | 次序 | 加分 | 核实 |
|---|---|---|---|---|
| grammarFill | facetKey 密度 | blankType 有/无提示词 | 无 | ✅ bonus 恒返 0（:281） |
| cloze | topicLabels 密度 | discourseType 匹配 | pos 密度 | ✅ |
| sevenChoices | roleFacet+positionFacet 密度 | mechanismFacet 匹配 | topic 密度 | ✅ |
| reading | skill 密度 | 篇位 proxy(词数邻域0.6+discourse0.4) | topic **不同**加分 | ✅（bonus 反向，:391） |

排除规则（种子组 / 同 passage / 同 source 卷）实现于候选过滤 :602-609，三条齐全。

**分层打分 `primary*10000 + secondary*100 + bonus`（:407）越级压制不成立性——已证严格分层：**
- primary/secondary/bonus 各项经 `Math.min(99,...)` 或 booleanTerm 恒 ≤ 99（reading bonus 固定 20 亦在界内）。
- secondary 满档 99*100 = 9900 < 10000（一个 primary 最小增量）→ 次序永远压不过主序。
- bonus 满档 99 < 100（一个 secondary 最小增量）→ 加分永远压不过次序。
- 结论：层级不可越级，边界正确。

**确定性平局裁决**（:638-642）：`score desc → year desc（新者先）→ groupId 升序字典序`，与 plan"年份新者先，再 groupId 字典序"逐字一致。groupId 是 pool Map 唯一键 → 平局最终必被 groupId 打破，无残留并列 → 全序确定。verify Criterion 3 用 `JSON.stringify` 跑两次逐字节比对（:214-216），对数组顺序敏感，是真断言。

### 2. DEV 四条自报偏离逐条裁

**① 混合题型多种子 → 400**（:562-564）：合理。多种子题型不一致直接拒，符合"目标 facet 取并集"仅在同题型内成立的前提。**接受。**

**② `matchedQuestionIds` 语义自定义 → 合理，但 E2 须知语义与空值可能**（见 SW-2）。plan API 契约只列了字段名未定义语义，DEV 定义为"候选组内、按 raw facet 命中种子主维 facet 画像的那些子题号"（computeMatchedQuestionIds :412-435）。这是对 E2 UI 有用的语义（高亮"该相似组里哪几道子题与种子同薄弱点"）。**接受，语义写入 SW-2 供 E2 引用。**

**③ discourse_type 退化为常真信号 → 比自报更严重，spec-faithful，E1 可接受但 E2 必须处置**（见 SW-1）。已实证：DB 里 `discourse_type` 值恒等于 `group_type`（reading 篇=`'reading'`、cloze 篇=`'cloze'`…，distinct=5 且一一对应）。故同池内 discourse 恒定 → cloze 次序项对每个候选恒为 99（层内常量、零区分度），reading 次序的 0.4 discourse 分量恒为满（仍靠 0.6 词数分量区分）。代码照 spec 忠实实现，E1 无 UI 面不可见，**在 E1 层接受**；但 chip 文案"同体裁 cloze"/"体裁一致"恒亮且语义空洞——这是 **E2 的硬交接**。

**④ writing 种子用内存 sqlite → 防御分支现实不可达，测试成色够用**（verify:255-267）。已实证 DB writing 组 `questions` 行数 = 0，故真库无可寻址 writing questionId，真数据下走 writing 分支前会先因"未找到题目"400。内存库注入合成 writing 行让 `resolveSeedRows` 的真 SQL 实跑并触发 writing 守卫（similarQuestions.mjs:559-561）——对该守卫是行为级测试，非源码 grep。诚实标注、成色达标。**接受。**

### 3. 零 AI 不变量 ✅

- 结构性保证：引擎零 AI 依赖 import（已 grep 证）。
- verify Criterion 6（:295-296）读真实 `server/logs/ai-daily-usage.json` 快照的 `used`，前后比对不变。断言真实（读持久化计数文件），配合"零 import"的结构证据，对一个加性只读层足够抓漏。**通过。**

### 4. Scope ✅

diff 名单 = 白名单内 9 文件，`grep -iE "^app/|^data/|draft|print|export|deepseek"` → clean。
- `teachingFacets.mjs` 改动 = 仅 `analysisConfigs` 前加 `export` + 注释，**逻辑零改动**（diff 确认），verify:365-375 亦断言 4 groupType 表与 /api/teaching-facets 路由文本未变。✅
- `api.mjs` 仅 4 处接线（import / store 创建 / context 暴露 / route 组合），未碰 draft-paper 区域。E4 边界（api.mjs 归 E1 独占）**尊重**。✅
- `getTeachingFacetIndex`（api.mjs:272 函数声明）返回 `teachingFacetIndex.getIndex()`（Map），与 store 期望（`.get` + 可迭代）一致；按引用传入无 hoisting 隐患。接线正确。

### 5. verify 成色 ✅

29 条以行为级为主：真库（`data/question-bank.sqlite`）+ 真 paper-assets + 真 SQL 路径。关键断言（排除、poolStats、determinism、篇位排序、路由往返）均对真实计算结果比对。
- poolStats Criterion 5（:272-286）**独立重算** grammarFill 池（重跑排除逻辑）再断言相等，非哑断言。
- 仅接线/注册的 4 条（api.mjs/verify-ci/README）是 source-grep 式——但那是 housekeeping guard 的本职，非核心逻辑，可接受。
- reading 篇位排序断言（:201-205）自承是 soft（`topDelta <= tailDelta`），DEV 在注释里诚实说明词数只占 60% 权重——不夸大，合格。

### 6. 数据发现处置（阅读池 130 vs 126）✅ 优雅降级正确

paper-asset 索引有 130 reading 组、DB 只有 126（4 个已解析未同步 DB）。引擎以 paper-asset 索引为硬池（plan 约定），对这 4 个 thin 候选：`dbMetaByGroupId.get` 未命中 → `dbMeta = {}`（:614）→ 次序/加分（依赖 DB 的词数/discourse/topic）记 0、reason null，主序（依赖 paper-asset 的 skill 密度）仍成立；title/sourceLabel 回退 paper-asset 元数据（:628-630）。thin metadata fallback 正确、不崩。**通过**（但对 E2"加入草稿卷"是隐患，见 SW-3）。

---

## Should Watch（非阻断）

- **SW-1 【E2 硬交接】discourse_type 退化 → reason chip 语义空洞。** DB 内 `discourse_type ≡ group_type`，同池恒定。cloze 次序项对全体候选恒 99（零区分度，cloze 排序实际退化为 主序topic + 加分pos），且引擎会对每个 cloze 候选发出 `同体裁 cloze` chip、每个 reading 候选发出 `体裁一致` chip——**恒亮且无意义**。E2 **不得**把这些 chip 当有效"为什么相似"渲染。根因在数据面（discourse_type 应载体裁而非题型，属 program 盲区#3 解析管线补标），不在 E1 scope，故 E1 不阻断。可选廉价缓解：E1 在 `discourseType === groupType` 时抑制该 term/chip（未做，非本刀契约要求）。
- **SW-2 【E2 引用】`matchedQuestionIds` 语义 = 候选组内、raw facet 命中种子主维画像的子题号集合。** 注意**可能为空**即便该候选排名靠前（如 cloze 靠组级 topic 上榜但无 pos 命中，reading 靠 skill 上榜但…）。E2 渲染"N 题·考点"时须优雅处理空集，勿假设非空。
- **SW-3 【E2/数据面】reading 池含 4 个 thin 候选（paper-asset 已解析、DB 未同步）。** 它们会进结果（skill 密度打分、thin title）。若 E2"加入草稿卷"依赖 DB 存在，这些组可能下游 add 失败。对应 program 盲区#4（导入门禁）。E2 需确认 add 路径对 DB-缺席组的行为。
- **SW-4 同卷排除按 paper-asset paperId + passage_id，非 DB source_id。** 依赖 1 paper = 1 source 的一一映射（当前数据成立）。若未来某 source 跨多次 paper-asset 导入，同源姊妹组会漏排。当前无实证 bug，记录待观察。verify 用同一 paperIdOfGroup 机制断言，抓不到此类错配（同源盲点）。
- **SW-5 密度整数化（`Math.round(density*100)`，:245）** 会把邻近密度塌并成同值 → 增多平局（由 year/groupId 确定性打破）。确定性无损，v1 可接受，排序粒度略糙。
- **SW-6 密度分母方向跨配方不一致：** grammar/seven/reading 主序用**候选**集合大小做分母（"候选在种子薄弱点上的集中度"），cloze 主序用**种子** topic 数做分母（"候选覆盖了种子多少话题"）。各自可辩护，但方向不统一是有意还是笔误值得 DEV 确认一句；不影响分层与确定性。

---

## Self-Review Blind Spots（喂给后续 Big CR / E2 CR）

- 我未在真实登录态 dev server 上重跑 curl（沿用 DEV 存档的两份 response JSON + 本地 store 直调 verify）；路由往返用 fake request/response 已覆盖，但真实 HTTP 鉴权层（applyAuthGate）未由我端到端复验——依赖 plan"与既有 API 同鉴权层"及 api.mjs 接线位置正确的推断。
- discourse 退化的判断基于当前 `data/question-bank.sqlite` 快照；若生产库 discourse_type 语义不同（真载体裁），SW-1 结论需随数据修正。
- 性能不变量（<100ms、273 组池）未实测计时，仅信任内存索引 + 小池的量级判断。
