# cr-1.md — 刀① 让老师用人话找到题（本地搜索质量）CR-lite 冷读

Reviewer: 小川 (CR-lite, fresh session, reviewer ≠ implementer)
Branch: `restart-1-local-search` (github @ 3a20413)
Baseline: main @ 549c6ee
Level: L3 (默认首页找题主链路，user-visible runtime；非 persistence/export 故不上 L4)
Date: 2026-07-02

**Recommendation: APPROVE**（无 Must Fix；3 条 Should Watch + 1 条 Follow-up Gate 记录在案，均不阻塞本合并）

---

## Changed Scope

契约允许集内，无越界：

- `app/src/concierge/conciergeSearch.ts`（主，+460）— tokenize CJK / parseLocalIntent / 加权 haystack / 阈值重校 / 人话 reason。
- `app/src/concierge/ConciergeGroupCard.tsx`、`ConciergePaperRow.tsx`、`App.css` — 展示层 topic leaf chip（plan §6 明列 ConciergeGroupCard/ConciergePaperRow，在允许集内）。
- `scripts/verify-restart1-local-search-intent.mjs`（新，已注册 verify-ci）。
- `scripts/verify-c6a10-concierge-local-search.mjs`（1 行断言字符串跟随重构）、`scripts/verify-ci.mjs`（+1 注册行）、`scripts/README.md`（+1 表行）。

**Forbidden 逐条核（读 diff 文件列，非报告说辞）：**

- server/** — 未触（`git diff --stat` 无 server 文件）。
- domain/schema/Adapter/PaperSurface — 未触（仅从 `domain/questionBank.ts` 新增 **import** `groupTypeLabel`/`GroupType`/`TopicLabel` 类型与常量，不改 schema）。
- questionBankStewardService / semanticSearchService — 未触。
- `App.tsx` — 未触（`git diff --stat -- app/src/App.tsx` 为空）。契约未列 App.tsx 为刀① scope，DEV 正确地没碰。

无 scope drift。

---

## DEV 五点自报逐条裁决

**① CJK bigram 分词 + 中文 stopword —— 裁决：站得住。**
- 纯英文/数字段走 V1 原路（`nonCjkOnly` 分支），`tokenize('Reading C')=['Reading','C']`、单字母 `'a'` 保留、空 query `[]`。无回归。
- bigram 噪声兜底：whole-run + bigram 都过 stopword 表；重复 token 经 `Set` 去重（下游按 distinct token 累权，去重是正确的，否则「阅读 C D 阅读」会双计）。
- 2 字 run 不产 bigram（`cjkBigrams` `< 3` 早返回），避免 whole-run 与其唯一 bigram 双计——这个细节 DEV 想清楚了，验证脚本也钉住了（「完形」只出现 1 次）。

**② 加权分级 topicLabel(5) > 篇位(3) > place(2) > general(1) + 长词 bonus —— 裁决：站得住，垄断风险已被「取最高 tier 不跨 tier 累加」压住。**
- 单 token 只按命中的**最高** tier 计权（`.find(...)` 短路），不跨 tier 累加——一个既在 topic 又在 summary 的词不会虚高。这是防垄断的关键设计，正确。
- 「生态主题 C 篇」混合 query 排序：我独立跑 fixture，topic-label 组（score 含 5×tier）压过只有篇位命中的干扰组，前排正确。
- 长词 bonus（`tokenLengthFactor` 5+→×4 / 3+→×2）让 whole-run 近逐字命中压过一堆 2 字 bigram 噪声，方向对。

**③ parseLocalIntent 正则硬过滤 —— 裁决：误触发面收得干净，一个低危 year 软噪见 SW-1。**
- 我独立探针：`region('阅读一篇讲全国卷改革的文章')=null`、`region('讲全国经济的文章')=null`、`region('新课标改革')=null`——「全国卷」「全国经济」都不误触（region 正则要求 甲乙丙卷 或 新课标+数字，「全国」裸词不是 pattern）。`section('阅读一篇讲全国卷改革')=[]`——「阅读」后无相邻字母不误抽篇位。硬过滤误触发风险低。
- 硬过滤清零兜底：`applyIntentHardFilters` 把候选清零时，`highConfidenceLocalHits` 回落到无过滤候选集（探针 D 证实：query 命名「浙江」但池全「全国」+ 有 key → 不误锁，steward 被调）。兜底正确。
- year 只是 boost 非硬过滤，故 `'讲2025年高考改革'→year=2025`、`'第2025题'→2025` 这类误抽只会轻微抬近三年权重，不会清池（见 SW-1）。

**④ highConfidenceLocalHits 阈值重校 —— 裁决：边界正确，但「有 key 用户被强本地命中拦住不问 LLM」是真实行为变化，记 SW-2。**
- 弱命中不短路：探针证实「生态主题 C 篇」对无生态 label 的样本库 + 有 key → `stewardCalled=true`（仅一个篇位字母 score<5 floor，正确落到 steward）。假阳被挡。
- 无 label 只靠 title 命中：探针 C，有 key 时 `stewardCalled=true`、`source=steward`——title-only 命中 general tier < 8 floor，不误锁，正确交给 steward。54% gap 组既没被系统性沉底也没被误锁。
- **但**：一个真 topic-label 命中（score 5 ≥ floor）会让**有 key 的老师**也短路 LLM（探针 B：`source=fallback`, steward 未调）。这是 local-first 的设计意图（plan/audit 明确本地优先），不是 bug，但对付费 key 用户是行为收窄——记 SW-2，不阻塞。

**⑤ verify 脚本（36 断言）—— 裁决：测行为非测实现，hermetic 合格。**
- 断言真跑代码路径：`tokenize`/`parseLocalIntent`/`rankByKeywords`/`runConciergeSearch` 都是真调用真输入真断言输出，非 grep 源码字符串（§6 展示层 2 条是源码 include，属展示层弱断言但可接受，不是核心逻辑）。
- 会失败性：我推演，若排序退回等权计数，§3「topic-label group ranks first」与「tiebreak by year DESC」会红；若硬过滤失效，§4 三条会红。断言能 fail。
- hermetic：`import.meta.url` 定位 root，直接 `import` TS 源（Node 内建 strip），无 `git show main:`、无本地 main ref。已注册 `verify-ci.mjs` registry。

---

## Findings

### Must Fix

无。

### Should Watch（记录，不转本刀工作）

- **SW-1（year 软误抽）**：`parseLocalIntent` 的 `/(20\d{2})/` 会把「讲2025年高考改革」「第2025题」里的 2025 抽成 year boost。因 year 仅加权（+2）不硬过滤，最坏后果是把无关命中的近三年组轻微抬前，不清池、不误锁。低危。若未来 year 升级为硬过滤，此处需先加「题号/无关数字」排除，否则会清空池。
- **SW-2（有 key 用户被本地强命中短路 LLM）**：`runConciergeSearch` 中 `highConfidenceLocalHits` 在 apiKey 检查**之前**执行；一个 topic-label 命中（score≥5）即返回 `source:'fallback'`，付费 key 用户拿不到 steward 的语义广度。这是 plan/audit 的 local-first 设计意图，非缺陷，但属于对 key 用户的行为收窄，值 owner 在浏览器 QA 时主观确认「精确命中直接给结果」是想要的体验。
- **SW-3（region 双向 includes 理论过匹配）**：`groupMatchesRegion` 用 `groupRegion.includes(wanted) || wanted.includes(groupRegion)`，query「全国甲卷」会同时通过硬过滤匹配到仅存「全国」（未带甲乙丙）的组。真实数据 region 均带完整甲乙丙 tag，故当前无实害；若未来入库出现裸「全国」region，硬过滤会把甲/乙/丙 query 泄漏到彼此。低危，记录即可。

### Follow-up Gate

- **FG-1（浏览器 QA 前必过）**：plan §验收的 4 组人肉 query（「生态主题 C 篇」前排全生态 C／「找一篇讲环境保护…近三年」非空环保近三年优先／三组维度硬过滤／纯英文空查询无回归）需主 agent 在真实运行库（非 sampleQuestionGroups）上浏览器 QA 确认。verify 用的是样本库 fixture，真实 26 组生态池的前排质量与 topic label 覆盖缺口下的观感只有浏览器能证。本刀 CR 不代替此闸。

---

## Self-Review Blind Spots

- **真实数据分布**：所有行为探针跑在 `sampleQuestionGroups` 与我构造的 fixture 上。真实运行库（API 合并样本后）的 topic label 分布、region 存储形态、26 组生态池的实际前排我未验证——这是 FG-1 交给浏览器 QA 的原因，也是我信心最低处。
- **加权数值调参**（floor=5 / general-floor=8 / bonus ×2/×4）：我验证了这些阈值在若干边界上分类正确，但「三版调平衡假阳/假阴」的最优性我无法独立判断——这是产品体感问题，非可静态证伪的正确性问题。
- **展示层视觉**：ConciergeGroupCard/PaperRow 的 chip 我只读了源与 CSS，未在浏览器看渲染。topic chip 在真实卡片上的换行/截断/密度需 QA 目视。
- **CJK stopword 表完备性**：表是手工短表，真实老师口语里的虚词（如「有没有」「帮忙」「那种」）是否漏网、会不会制造 bigram 噪声，样本外我未穷举。属可迭代项，非本刀阻塞。

---

## Verification Evidence

- 独立 re-run `node scripts/verify-restart1-local-search-intent.mjs` → **36 passed, 0 failed**（我读了 §1–§5 的真实断言，确认测行为非测字符串；§6 两条为展示层源码 include，弱但可接受）。
- 独立 re-run 全量 `pnpm -C app run verify:all`（worktree symlink app+root+server node_modules 后）→ **PASS 56 / SKIP 1 / FAIL 0**。SKIP 为 `verify-i16a`（owner-only off-repo fixture，pre-existing，无关本刀）。
  - 注：首轮出现 10 个 import/analysis 脚本 FAIL，逐一定位为 worktree 缺 `server/node_modules`（`ERR_MODULE_NOT_FOUND: ajv`），链入 server deps 后单跑 `verify-c7-paper-import-contracts.mjs` → 36 passed 0 failed，全量复跑归零。纯环境缺失，非 diff 引起（diff 不碰 server）。
- 行为探针（我构造，非 DEV fixture）：region/year 误触发面、key-holder 短路、无 label 组可达性与不误锁、region 命名无本地匹配时的 steward 兜底、混合池排序——结论已入上述裁决。
- `verify-c6a10` 的 App.tsx refresh 疑点：diff **未触** App.tsx；`verify-c6a10` 中 App.tsx refresh 断言（`mergeQuestionGroupsWithSamples` ≥2 处）**未被本 diff 改动**。唯一改动是第 170 行「Reading C/D aliases」断言字符串，跟随 haystack 重构（三元→`readingSection &&` 守卫），仍验证 alias 存在，非弱化闸门。**该疑点确属 pre-existing 且本 diff 未恶化。**

---

## Failure / Attack Angle

- **假绿角度已排查**：新 verify 断言均真跑代码路径且能失败（排序退化/硬过滤失效会红），非 string-match。`verify-c6a10` 那行改的是断言字符串跟随重构、不是删断言或松闸门，App.tsx 保护断言原样保留。未发现被弱化的闸门。
- **最可能的真实翻车点**是 FG-1：verify 跑样本库全绿，但真实库 topic label 覆盖缺口（audit 报 46%/54%）下，无 label 的近半题组在新加权里排在有 label 组之后（探针证实 present 但 rank 靠后），老师首屏观感是否「找得到」只有浏览器 QA 能证——静态 verify 观察不到这一面。这是本刀绿了仍需 QA 的核心原因。
- **未来 agent 误用角度**：SW-1 若有人把 year 从 boost 升成硬过滤而不加数字排除，会把「第2025题」这类 query 清空池；SW-3 若入库出现裸「全国」region，硬过滤会跨甲乙丙泄漏。两者当前无实害，已留 Should Watch 供后续 cut 接手时警惕。

---

## Residual Risk

低。逻辑正确性、scope、验证强度均达 L3 门槛，无 Must Fix。剩余风险集中在**真实数据下的观感质量**（FG-1 浏览器 QA）与**产品体验取向**（SW-2 key 用户短路是否合意），均非可静态证伪的代码缺陷，交 QA / owner 决断。建议：主 agent 完成 FG-1 浏览器 QA（真实运行库上 plan §验收 4 组 query）后即可 squash-merge，SW-1/2/3 记入 watch-ledger 不转本刀。

---

## 返工复核（c07d069 — 真库浏览器 QA 三缺陷修复）

Reviewer: 小川 (CR-lite, fresh 增量冷读)
增量: 3a20413 → c07d069（`conciergeSearch.ts` +121/scripts verify +229；无新文件、无 server、无 App.tsx）
主 agent 已完成真库浏览器 QA：四组验收 query（生态主题 C 篇／2025 浙江卷／七选五／全国甲卷 完形）全过。
Date: 2026-07-02

**Recommendation: APPROVE**（无 Must Fix；新增 1 条 Should Watch SW-4，不阻塞）

### 修复内容与我原 CR 的呼应

三处修复正是真库暴露的、样本 fixture 测不到的缺陷，其中 #2 直接兑现我原 CR 的 **SW（bigram 噪声）预警**：

1. **篇位英文兜底 + 硬过滤下沉主路径**：`extractReadingSectionLabel` 补 `\b(?:reading|passage)\s*([A-D])\b` 英文模式（真库篇位字母在 title 的 "Reading C"，`group.section` 只是通用大纲串无字母）；硬过滤从「仅 highConfidenceLocalHits 按需」下沉为 `rankKeywordCandidates` 默认生效——修掉了我原 CR 未及深挖的一个真缺陷：**无 API key 兜底路径（`rankByKeywords`，老师最常走）此前完全不硬过滤**，「C 篇」形同虚设。
2. **topic tier 前缀/相等匹配**：`topicSegmentMatchesToken(seg,tok)=seg===tok||seg.startsWith(tok)`，topic tier 从整串 substring 改为按段前缀。killing「生态」→「人生态度」内嵌误命中——正是我原 CR 的 bigram 噪声预警。其余 tier 维持 substring 不动。
3. **维度形态 tag 不入「讲X的」**：`isDimensionShapedTag` 识别年份/月份/来源/题型/卷别 provenance tag，reason 兜底跳过；纯维度命中改用「地区 年份 · 题型/篇位」平铺句式。

### 逐条裁决（coordinator 指定三风险面 a/b/c）

**(a) rankByKeywords 补硬过滤会不会误清空候选 —— 裁决：不会，兜底守卫正确。**
`pool = hasExplicitIntent && intentFilteredPool.length > 0 ? intentFilteredPool : groups`。我独立探针：
- 无维度 query「生态环境」→ 不过滤，全候选合格（探针 a1）。
- 显式「七选五 生态」但池全 reading（过滤后为空）→ 回落 `groups` 非空，r1 返回（探针 a2，不误清空）。
- 显式「七选五」混合池 → 只留 sc（探针 a3）。
无 API key 兜底路径与 high-confidence 路径现共用同一过滤逻辑，行为一致。`requireIntentMatch` option 已彻底移除，无悬挂引用（grep 干净），tsc exit 0。

**(b) 段前缀匹配边界 —— 裁决：边界正确，但引入一个有界的 suffix 召回收窄，记 SW-4。**
- 空段：`!segment` 早返回 false（安全）。
- 英文 label 段：`startsWith` 对 latin 正常（探针 b2「ecology」命中）。
- 单字 token：仅当 query 本身是单 CJK 字才产生（bigram 是 2 字、whole-run≥1），「生」作前缀命中 topic，属退化 query 的合理落点，非缺陷。
- token 长于段：经 bigram 拆分后由子 gram 前缀命中（探针 b3），符合预期。
- **SW-4（suffix/interior 内容词召回收窄）**：前缀规则使「环境」匹配不到 leaf「生态环境」、「人生态度」匹配不到 leaf「正确的人生态度」（非前缀）。这是精度换召回的**刻意取舍**且有界：①真库 leaf 通常被整词/前缀查（「生态环境」「生态」），interior 后缀查较少；②只要 tag/title/summary 有同词回声（general tier substring），suffix 仍命中（探针 b4：带 tag 的组「环境」仍 `hits=1`，reason 还原「讲生态环境的」）；③有 key 时 suffix query 仍到 steward（探针 b4：stewardCalled=true）。最坏仅「只有 topic leaf 无任何 general 回声 + 无 key + interior 后缀查」的单组本地不出——不破验收 query、不回归常见路径。默认首屏 false-positive 比 suffix miss 更伤，取舍方向正确。记 Should Watch，不阻塞。

**(c) 维度理由文案 —— 裁决：正确。**
探针「2025 浙江卷」→ reason = `"2025 浙江 · 完形填空"`（平铺，无「讲2025的」）。真内容命中仍走「讲X的」（§9 断言 `讲生态环境的` 绿，证明未全局静音 topic 文案）。`isDimensionShapedTag` 用 `Object.values(groupTypeLabel).includes` + 卷别/来源/年月正则识别 provenance，方向对；未来若新增来源类型枚举需同步该正则（低危提醒，非本刀问题）。

### 新增 18 断言质量 —— 裁决：测行为非测实现，能失败。

- §7 用**真库形态 fixture**（"Reading C" 在 title、section 为通用大纲串）测篇位英文兜底 + 硬过滤；断言若英文模式缺失会红。「一篇」「这篇」不误抽篇位字母的负例到位。
- §8 关键断言 `soloLifeAttitude.length === 0`：**在旧 substring 匹配下必红**（旧代码「生态」会内嵌命中「人生态度」）——这是真正证伪前缀修复的断言，非 string-match。exact-equal 正例（「生态环境」仍命中）防过度收紧。
- §9 断言纯维度命中 reason **不含**「讲2025的/讲七选五的」且**仍含**平铺维度，并保留真内容的「讲X的」——正反双向锁住第 3 修复。
- 全部真调用真输入真断言输出，hermetic（import TS 源，无 git show main:）。已在 verify-ci registry（原 CR 已确认）。

### 验证证据（独立 re-run，非抄报告）

- `node scripts/verify-restart1-local-search-intent.mjs` → **54 passed, 0 failed**（读了 §7–§9 真实断言，确认 §8 能证伪旧行为）。
- 全量 `pnpm -C app run verify:all` → **PASS 56 / SKIP 1 / FAIL 0**（SKIP=verify-i16a owner-only off-repo fixture，pre-existing 无关）。
- `tsc -b --noEmit` exit 0；`requireIntentMatch` 无悬挂引用。
- scope：增量仅 conciergeSearch.ts + verify 脚本，无越界（server/App.tsx/schema 均未触）。

### Failure / Attack Angle

- **假绿角度**：§8 的 `length===0` 断言是真证伪点（旧 substring 会红），非绕过。硬过滤下沉后我独立验证兜底非空守卫存在，未见「靠清空池制造精确假象」。
- **最可能翻车点**转为 SW-4：suffix/interior 内容词对「纯 topic-leaf 无 general 回声」组的本地召回收窄，静态 verify 只测了前缀正例与内嵌负例，未系统覆盖「合法 suffix 内容词」这一召回面——真库长尾里这类 query 的命中率只有持续 QA / 用户反馈能证。已记 SW-4 供后续观察，非本刀阻塞。

### 结论

三修复各自对准真缺陷、修法正确（精度/召回取舍偏向默认首屏正确的一侧）、无 scope drift、验证强度匹配、主 agent 真库四组验收已过。返工复核 **APPROVE**，无 Must Fix。SW-4 记入 watch-ledger（与原 SW-1/2/3 并列），不转本刀工作。可 squash-merge。
