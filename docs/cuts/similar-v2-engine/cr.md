# CR — similar-v2-engine (E5)

- Reviewer: CR（fresh context，formal 深度：API + 配方语义变更）
- 审查范围: `git diff 3500996..7f059b0`（基线=PA 压稿 commit，终点=DEV 收口 commit）
- 独立验证: worktree `/Users/huangxuewei/Projects/wt-similar-v2-engine`，分支
  `wt-similar-v2-engine`；`node scripts/verify-similar-v2.mjs` → **83 passed, 0 failed**（自跑，非引用 DEV 数字）。
- 语义基准: `docs/cuts/similar-questions/program.md` §配方 v2 / §篇章相似排序 /
  §语法填空考点粒度终稿（逐条对照）。

## Verdict

**MERGE**（0 Must Fix）。配方语义对 program.md 忠实、分层制数学上不越层、MF-2
数据契约锁落实、Forbidden 三面零触碰、verify 是真断言且注册进 CI。附一条**部署
Follow-up Gate**（非合入阻塞）与三条 Should Watch。

---

## Changed Scope（从 diff 实读，非报告转述）

8 个文件，全部在 plan 允许面内：
- `server/search/similarQuestions.mjs`（原地重铸，唯一运行时文件）
- `scripts/verify-similar-v2.mjs`（新，1030 行）/ `scripts/verify-similar-questions.mjs`（`git rm`）
- `scripts/verify-ci.mjs` + `scripts/README.md`（注册换名，一行/一行）
- `docs/cuts/similar-v2-engine/{cut-note,reasons-chips-table,qa/qa-dp2}.md`（记录）

Forbidden 面**逐个从 diff name-only 证实未触**：`server/api.mjs`、
`server/search/teachingFacets.mjs`、`app/`（含 `app/src/domain/questionBank.ts`）
均不在 diff 内。verify 内还有源码文本断言复核（`similarQuestions.mjs:996-1022`）。

---

## 配方语义正确性（逐条对照 program.md，formal 刀核心）

**分层制真分层（非加权求和）——数学证明不越层：**
- 篇章：`score = position*10000 + source*100`（`similarQuestions.mjs:497`）。
  source 走 `booleanTerm` → 99，secondary 上限 = 99×100 = 9900 < 10000（一个
  primary 单位）。position 档 70/35/0，相邻档差 ≥35 单位（350000）。secondary
  **永不跨越** primary 一档 → C-3「真题永在篇位之下一层」结构性成立，不靠调参。
- 小题：`score = primary*10000 + secondary*100`（`:813`）。同上，topic secondary
  9900 < 10000，谓语向量差 1 格 = 10000 > 9900 → 向量恒压话题。分层成立。

**篇章相似 tier→槽位（program.md:150-160）：**
- 同话题=硬门槛：`candidates.filter` 内 `hasOverlap` 不重合直接不进池（`:481`），
  非降权。verify 用 off-topic 候选断言「整组不进池」（`:616`）。✅
- 篇位仅 reading，70/35/0（`passagePositionTerm :377-391`），非 reading seedSlots
  为空 → position 恒 0、真题即最高档（`:471`、C-3）。verify 对 grammar/cloze/7c
  三题型断言「无 position-slot chip」（`:650`）。✅
- 真题 secondary 二元 `=== 'real_exam'`（`:394`，SF-2 落实，非"类值集合"）。✅
- 年份尾序：sort 用 `_year` 降序（newer first，`:513`）。verify real2(2022) 先于
  real1(2020)。✅

**谓语向量 时4/语2/一致1，取组内最高分空（program.md:181-188）：**
- `verbVectorScore`（`:357-363`）加性编码；`finiteVerbVectorPrimary` 遍历组内
  谓语空取 `max`（`:565-575`）。加性权重天然给出单调优先序
  7>6>5>4>3>2>1（时态支配、其次语态、再一致），与 owner「单中时时态>语态>一致」
  一致；verify 覆盖 7/6/4/2/1/0 六档不翻转 + 多空取 max（`:756-779`）。✅
- 池=含谓语空的组（presence gate，`grammarFillPoolPredicate :584`），向量 0 的组
  仍入池只是垫底（score0 fixture 实测在池，`:759`）——忠实 program.md「池=含谓语空的组」。✅

**非谓语 role 入池 + form 只进 chip（program.md:171-180）：**
- 池=同 role 组（`hasOverlap(roles) :585`）；`nonFiniteRolePrimary` role 命中，
  form 仅拼进 label 不进匹配（`:544-552`）；D1 落库前 `raw.form` 恒 undefined →
  chip 优雅省 form（verify noform 用例 `:818-826`）。✅
- 七格白名单完整含现库尚无的 `predicative`/`subject-complement`（`:74-82`），
  verify 全七格逐格断言命中+中文文案+排除异格（`:792-809`，C-2 防漏格假绿）。✅

**混类多种子 400 + 分支判据（SF-4 / C-2）：** `buildSmallQuestionSeedTargets`
按 facetKey `given.verb.finite`/`given.verb.non-finite` 分支，`branches.size>1` 抛
400（`:652-655`）；「其余考点」统归 'other' 桶允许内部混（合理）。verify
finite+non-finite 组合断言 400 文案（`:876-880`）。✅

**拆除清单（plan §3）：** `densityTerm`/`READING_WORD_COUNT_DECAY`/话题+20/体裁+8
在新文件中全无踪迹；`booleanTerm` 保留。旧 verify 35 断言里的 9 条 RETIRE
（#1/2/3/6/7/9/10/15/16）**逐条核对属实**：全部系密度打分、word-count proxy、或
cloze/7c 小题整体退役（→400）三类真删除概念，非静默丢断言。✅

## 数据契约锁（PA MF-2）

`buildRawFacetIndex` 只经 `...entry` 透传 analysis blank 条目（`:154`），
谓语三字段 `tense/voice/agreementSensitive` + `role/form/facetKey` 全从该条目读。
**全仓 grep 无 sidecar / verbProfile merge 逻辑**（仅注释提及"no sidecar"）。
fixture 按契约把字段直接铺在 blank 条目上（`verify:414-419`）。✅

## verify 质量（对抗式核）

- 83 条**真断言**，会红：随机核了「分层不翻转」（`:620` mock 同篇位 vs real 相邻篇位
  比分，退化为加权求和即红）、「多空取 max」（`:776` 取首/平均即红）、「role 异格排除」
  （`:805` 门槛失效即红）、「谓语向量解码 primary===expected」（`:765` 权重错即红）——
  均实际驱动引擎路径，非字符串匹配。
- fixture 全自造（内存 sqlite + 临时 paper-assets，`:120-578`），**不依赖真库/不依赖
  D1 落库**；读真实 `analysisConfigs` 导出发现 live schemaVersion，D1 升版后零改跟随。
- 注册干净：verify-ci 换名 + 旧名缺席双断言（`:1011-1019`）；README 同步。已 `git rm`
  旧脚本，cut-note §1 给 35→(9 RETIRE/26 MIGRATE) 全账，关键不变量（自排除/同卷排除/
  poolStats 诚实/确定性/400 校验/路由注册/Forbidden 边界）均在新文件复现。

## Forbidden / questionBank.ts 旧类型（task #3）

`app/src/domain/questionBank.ts` 未在 diff，DEV 故意留旧 v1 union 类型并 cut-note §3
挂账。独立核实**无运行时破绽**：`SimilarQuestionsRailView.tsx` 的 `renderChips` 直接
渲染 `reason.label`、以 `kind` 仅作 React key，**全仓无对 `reason.kind` 的 switch/
narrowing**（grep 证实）。TS 类型是编译期物，新 kind（verb-vector/authentic-source/
facet-hit）在运行时照常出 label。属文档漂移，E6/E7 收编。✅

## 鉴权 / 错误处理 / 性能

- 两端点走 `defineRoute` + 既有 `applyAuthGate` 登录态，无 ownerOnly，与 plan 一致
  （`:899-942`）。错误统一 `SimilarQuestionsError.status`（400），route catch 兜非
  Similar 错误也回 400 + message。`db.close()` 在 finally。✅
- 池子量级：facetIndex 全表扫一次（groupType 过滤）+ 每请求 batched SQL（IN 占位符），
  真库题组量级下 O(pool) 无隐患。rawIndex 惰性构建 + 缓存 + invalidate。✅

---

## Findings

### Must Fix
无。

### Follow-up Gate（部署前必须处置，非合入阻塞）— UI 死路（task #6，我的独立判断）

cut-note §4 的排序风险**属实且我独立复核确认**：
- `PaperBrowsePage.tsx:257` `SIMILAR_SUPPORTED_GROUP_TYPES` 仍含 cloze/sevenChoices，
  点「配相似」仍 POST `/api/similar-questions`，本刀令这两型返回 400
  「完形/七选五的小题相似已下线，该题型走篇章相似」。
- `handleSimilarRetry`（`:1270`）为**手动**重试，`loadSimilarQuestions` 无 useEffect
  自动重放 → 是**永久卡住的手动死路，不是崩溃、不是无限重试循环**。RailView error 分支
  兜得住（`:90-94` 渲染 message + 重试钮）。

**我的判断：不该在本刀加临时门。** 加门必须改
`SIMILAR_SUPPORTED_GROUP_TYPES`（UI），撞死 Forbidden「不动 UI」；且 plan §收口 已
明列「部署随 E6/E7 同批」这条路。故正确处置 = **部署门**：E5 端点**不得单独先于
E6/E7 上线**，除非 owner 明确接受 cloze/7c「配相似」CTA 短期降级。合入 main 安全
（merge≠deploy，plan 已设想同批部署）。DEV 如实上报，处置得当。

### Should Watch（不阻塞本次合入）

1. **source_type「出新值即红」canary 在无库 CI 里没牙。** plan verify 要求「枚举域
   出新值即红」。真正有牙的断言在 `:681-695` 的 bonus 块，**仅当
   `data/question-bank.sqlite` 在盘才跑**（本 worktree 在盘、实跑通过）；CI 干净
   checkout 无库时 SKIP。留在 CI 的 `:669-678` 是 fixture 自指断言（断言 fixture 自己
   只用了两值，近恒真）。**为何不阻塞**：引擎对第三种 source_type 的行为是良定义的
   （非 real_exam → 归低档），语义安全；canary 只是「有人加了新 source_type 该复审」的
   提示，不影响正确性。若日后真库新增 source_type，建议把该断言提到不依赖库的位置。

2. **FE 未知 kind 显式白名单（plan §4 / DESIGN §7 禁兜底）延后 E6/E7。** 现状 label
   无条件渲染（不崩、不需兜底），符合 Forbidden「不动 UI」。cut-note §3 已挂账。
   E6/E7 接线时补白名单 + `verb-vector`/`authentic-source`/`facet-hit` chip 样式。

3. **`questionBank.ts` 旧 union 类型 + 小题 response 去 `bonus`/seedProfile 变形。**
   文档漂移，E6/E7 更新类型 + 加 passages-response 类型时一并收。运行时无害（见上）。

---

## Self-Review Blind Spots（供后续 Big CR / E6-E7 优先看）

- **teachingFacets 聚合索引与 raw 索引的字段一致性未由本刀 verify 交叉证。** finite 池
  谓词吃 `facets.facetKeys.has('grammar-fill.given.verb.finite')`（聚合 Set），向量吃
  raw 条目 `entry.facetKey`——两者都源自同一批 on-disk 分析条目，逻辑上必一致；但
  **本刀不改 teachingFacets，真库当前是 v1**，「D1 落库后聚合 Set 里 facetKey 是否
  确带 `grammar-fill.` 前缀且与 raw 同形」要等 D1 合入后的联调（DP-2/DP-3）证。fixture
  两侧都是自造同源，不能替 D1 真数据背书。**这是 D1→E5 合入顺序的真联调点。**
- **reading `skill.primary` 词表跨聚合/raw 一致**同上，属沿用 v1 假设，未在本刀新证。
- verify-ci 全量 `verify:all` 我只单跑了目标脚本（83/83）+ 注册文本断言，未整轮跑
  `verify:all`（重）；注册换名是一行、低风险，但 main CI 全绿由收口清单兜。

## Failure / Attack Angle

- **最可能的假绿**：若 D1 落库后 analysis-v2 的 facetKey 不带 `grammar-fill.` 前缀，
  或谓语三字段名/位置与 fixture 不符，则线上谓语向量恒 0 / 池恒空，而本刀 verify
  仍全绿（fixture 自造符合契约）。防线 = MF-2 契约锁把「唯一读取源」钉死 + D1→E5
  合入序 + DP-2 真库联调。CR 无法在 D1 未落库时消除此风险，已列 Blind Spot 顶条。
- **误部署**：E5 端点单独先上线 → cloze/7c 老师点「配相似」永久卡错误态。防线 =
  上方 Follow-up Gate（部署随 E6/E7 同批）。
- **未来 agent 滥用**：有人后续在 FE 加 `switch(reason.kind)` 而不更新 `questionBank.ts`
  旧 union → 漏 case。防线 = cut-note §3 ledger + E6/E7 类型更新。

## Residual Risk

低（就本刀合入而言）。运行时面单文件、纯确定性、零 AI（verify 断言日限额零增长）、
分层数学可证不越层、契约锁与 Forbidden 均证实。残余风险集中在**跨刀联调（D1 真数据）
与部署时序**，两者都在本刀 scope 之外且已被正确标注/挂账。

## Recommendation

**APPROVE（MERGE）** — 无 Must Fix。合入前请把「部署 Follow-up Gate：E5 端点不得
单独先于 E6/E7 上线」记入 STATUS/收口，并保留三条 Should Watch 待 E6/E7 与 D1 联调收。
