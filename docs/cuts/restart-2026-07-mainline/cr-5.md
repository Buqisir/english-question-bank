# CR-5 — 刀⑤ 诚实降级（冷读）

Reviewer: fresh Opus CR (no DEV context). Branch `restart-5-honest-fallback`
@ `bfeae09`, baseline main `849f6f7`（该基线已含刀①④，branch 只此 1 commit）。
Worktree 独立临时目录，未动主 checkout；已删除。

Recommendation: **APPROVE WITH MUST FIX**

一条 Must Fix（噪声地板对无空格中文内容词的误杀，实测在真实老师查询上把
合法命中降级成空真空态）。其余为 Should Watch。刀①的 54 断言独立重跑原样
全绿，forbidden scope 干净。

---

## Changed Scope

4 个文件，全部在 plan 刀⑤ Scope 内：

- `app/src/concierge/conciergeSearch.ts`（+新增 `wholeRunTokensOf`、
  `isConfidentCandidate`、`isAboveNoiseFloor`、`hasWholeRunMatch` 字段、
  `weak`/`allWeak` 出口字段、`buildLocalReason(weak)` 分支）
- `app/src/concierge/clarificationCopy.ts`（+`pickResultsNoticeLine`）
- `app/src/concierge/ConciergeDesk.tsx`（+`isAllWeakResultsState` 类型守卫，
  通知条改走 `pickResultsNoticeLine`）
- `scripts/verify-restart1-local-search-intent.mjs`（+§11/§12 共 15 断言）

Forbidden scope 实测干净：`git diff --name-only` 无 `server/**`、无 steward/
semantic 服务、无 `.css`、无 `App.tsx`。plan 写 `reason.ts`，实际理由构造器
`buildLocalReason` 就在 conciergeSearch.ts 内，未越界。

---

## Findings

### Must Fix

**MF-1 — 噪声地板误杀无空格中文内容词查询，把合法命中降成空真空态。**

`isAboveNoiseFloor` 的最后一道判据是 `hasWholeRunMatch`：只有当某个 matched
token 恰好是 query 里一个「分隔符包围的完整段」时才放行 general-tier-only 命中。
但中文老师最自然的输入是**无空格连写**——此时整个连写串是唯一的 whole-run
token，而它几乎不可能整串 substring-match 任何字段；真正命中字段的是从连写串里
carve 出来的 bigram（合法内容词），它**不在** whole-run 集合里 →
`hasWholeRunMatch=false` → 纯 general 命中被判 noise 整条丢弃。

实测（worktree 上 `rankByKeywords`，对照 baseline main）：

| query（无空格） | 命中字段 | baseline(main) | 刀⑤ 后 |
| --- | --- | --- | --- |
| `找篇科技文` | summary「…科技发展…」+topicLabel 信息技术 | 1 hit `2024 · B 篇` | **0 hit（空真空态）** |
| `讲科技的文章` | summary「…讲科技创新…」 | 1 hit `2024 · A 篇` | **0 hit（空真空态）** |
| `科技文章` | title「科技创新阅读」 | (命中) | **0 hit** |

这些都不是乱码：`科技` 是真实内容词、逐字出现在题组 title/summary 里，老师是
在真心找科技文。刀⑤把它们和 `zzxqwqxyz` 一样丢进空集，老师看到「没找到匹配」，
且（见 SW-1）连 starter chip 都不给。这是 false-negative，命中面比乱码防护的
收益更痛——中文用户极少打空格。

对照：`完形近三年`（无空格）能活下来是因为 groupType=cloze 给了 nonGeneralScore>0
（走 `nonGeneralScore>0` 分支，不靠 whole-run）；`生态主题C篇`（无空格）能活是靠
topicLabel/section 信号。**只有「唯一信号是 general 字段 + 无空格连写」这一格被误杀**
——而这正是测试集完全没覆盖的格：§11 的 weak 用例 `随便 试试看` 带空格且
`试试看` 是整段 whole-run，§12 redline 全部有 nonGeneral 信号。测试因此对这个
误杀面 100% 盲。

要求修复方向（不指定实现）：让「逐字出现在字段里的真实内容 bigram」有办法通过
噪声地板，而不必是分隔符包围的完整段。可选：对 general-tier bigram 命中要求
「命中的是 haystack 里一段连续子串 / 命中长度或密度达阈值」而非「必须是 query
的 whole run」；或对连写 query 额外产出并信任更长的 n-gram。修复后必须新增覆盖
「无空格中文内容词 general-only 命中不被误杀」的断言（现测试集缺此格）。

> 备注：若 owner/PM 判定「本地兜底宁可少给不可给错，误杀可接受」，则本条可降级为
> 产品决策而非缺陷——但当前 plan 写的是「乱码 query 走真空态」，没有授权把
> **真实内容词查询**也丢进真空态。按 plan 语义这是超出授权的行为收窄，故列 Must Fix，
> 请 owner 明确取舍后再合。

### Should Watch

**SW-1 — 空真空态不渲染 starter chip（plan 明写要 chip）。**
gibberish（及被 MF-1 误杀的 query）走 `kind:'results', hits:[]` →
`paperResults.length===0` → 显示「没找到匹配。可以换个说法，或在经典模式里精筛。」
但 starter chip 只在 `state.kind==='empty'|'error'` 渲染（Desk:126），
`kind:'results'` 空集**不出 chip**。plan 刀⑤改动 1 与验收都写「真空态+起始 chip
呈现」/「乱码查询→真空态可达」。验收「可达」这半条满足（有独立的诚实空态文案），
但「+起始 chip」这半条未实现。**§11 的断言注释「the true vacuum state (zero hits)
so starter chips render」是 fake-green 注释**——断言只验了 `hits.length===0`，从未
验证 chip 渲染，而 chip 在此路径根本不渲染。此属 UI 层小改，不阻断正确性，但注释
误导后续 reader，建议要么补 chip 渲染分支要么改正注释。留给主 agent 浏览器 QA 定夺。

**SW-2 — 用户可见理由暴露 carve 出来的 bigram 碎片。**
weak 理由 fallthrough 到 `可能相关：${matchedTokens.join('、')}`，matchedTokens
含分词器切出的碎片。实测出现 `可能相关：的完、完形`、`可能相关：议论、论文、阅读`，
DEV 报告举的 `集作` 同理。`的完`/`集作` 是无意义碎片，直接摆进用户文案违反
PRODUCT.md「人话/克制」语气。属观感非正确性。建议 weak 且无 topic/dimension 文案
时，过滤掉非 whole-run 的碎片 token 再拼，或干脆退回统一「可能相关」不列词。

**SW-3 — 混合 weak+confident 的 paper 行文案/通知不一致。**
`aggregatePaperResults` 完全不读 `hit.weak`；paper 行头 `displayReason` 取**首个**
hit 的 reason。若一张卷首题组 weak、其余 confident：行头显示「可能相关：…」，而通知条
`hits.every(weak)` 为 false 显示 confident 文案 → 同屏自相矛盾。反之首题 confident、
含 weak 尾题：行头 confident 文案掩盖了尾部 weak。不阻断（信息不丢，只是措辞取首题），
但真库里同卷混合 weak 概率不低，建议记账，后续让 aggregate 感知 weak（或按 confident
优先选 representative）。

**SW-4 — 「生态主题 C 篇」真库 flip 成 allWeak（DEV 报告点 3）。**
裁决见下。机制上不与刀①测试语义冲突，但真库可能出现「相近文案 + 前排全 C 篇但被标
allWeak」的观感，需主 agent 用真库 QA 确认是否满足验收精神。列 Should Watch。

---

## 五点裁决（DEV 自报重点）

1. **noise 误杀面** → 见 **MF-1**。DEV 说「继承 tokenize 既有局限」不成立：
   baseline 上这些 query 有命中，是刀⑤新加的噪声地板把它们清零的，属新引入的
   行为收窄，且落在测试盲区。构造的 3 个真实无空格 query（`找篇科技文`/
   `讲科技的文章`/`科技文章`）实测被误杀。Must Fix。

2. **`weak` optional 消费点安全性** → **通过**。tsc `-b` 干净（verify-ci 的
   「app build/typecheck」步会跑）。`weak?` 用 `=== true` 显式收窄，`undefined`
   等同 false，符合注释契约。`aggregatePaperResults` / `ConciergePaperRow`
   **完全不读 weak**，故混合卷不会崩——只有措辞取首题的观感问题（SW-3）。
   `allWeak` 在 fallback 三出口全部赋值，`local-direct-match` 赋 false，穷尽。
   Desk 重算 allWeak（不依赖 outcome.allWeak），双路一致。安全。

3. **「生态 C 篇」flip allWeak 是否冲突刀①语义** → **不构成断言冲突，列观感风险**。
   刀①合成 fixture 有 topicLabel，单条 topicLabel 命中 score=5 ≥ confidence
   floor → 恒非 weak（§12 redline 断言实测绿）。真库若 flip，是因为那些真实 C 篇
   题组**没有** topicLabel 命中（plan 记 topic 覆盖率 46%）——即数据缺标，不是刀⑤
   分类逻辑与刀①打架。合成 fixture 与真库的差距不是刀⑤引入的。裁决：不阻断，但
   「相近文案+全 C 篇」是否仍满足「前排全部是阅读 C」的验收精神，须主 agent 真库 QA
   收口（SW-4）。

4. **三态文案质量 + 碎片暴露** → 文案本身（「没有精确匹配，以下是主题相近的题组。」
   / 「可能相关…」）符合 PRODUCT 语气。**但碎片词入文案（SW-2）应过滤**——
   `的完`/`集作` 这类无意义 carve 碎片直接给老师看，破坏克制感。非阻断，建议本刀
   顺手收口或立即 follow-up。

5. **新 15 断言质量** → 行为向、非纯字符串匹配，多数扎实（gibberish→0、weak 标记、
   `可能相关` 且禁 `命中`、redline 全非 weak、`pickResultsNoticeLine` 双向）。
   **两处弱点**：(a) §11 chip 注释是 fake-green（SW-1，断言与注释声称不符）；
   (b) 测试集不含「无空格中文内容词 general-only」这一格，正好漏掉 MF-1 的误杀面
   ——绿得漂亮但没护住真实输入。

---

## Self-Review Blind Spots

- **真库行为未跑**：MF-1/SW-4 我用合成 group 复现，未连真 sqlite。真库 26 组池里
  「生态主题 C 篇」到底 flip 几条、MF-1 的误杀在真库频率多高，需主 agent 用真数据
  验证。我的结论基于机制 + 合成对照，方向确定，量级待实测。
- **浏览器三态实际呈现**：SW-1 的 chip 缺失、SW-3 的行头/通知不一致，是我从代码
  推断的渲染路径，未开浏览器截图确认。plan 验收要求「浏览器实测三态文案各出现一次」
  ——这步归主 agent QA，我未执行。
- **`normalize` 大小写/全角对 whole-run 判定的边角**：`wholeRunTokens` 经
  `normalize` 后与 matchedTokens 比对，英文/全角混排 query 的 whole-run 归一我未
  穷举，只验了纯中文与「reading C」两类。

## Failure / Attack Angle

- **最可能的实战翻车**：老师无空格打「找篇科技文」「讲环保的文章」这类最自然的中文
  查询，本地兜底（无 key / steward 挂）直接吐「没找到匹配」——比刀⑤上线前更差
  （之前至少给一张相关卷）。诚实降级本意是别给假命中，却顺手把真命中也降级了（MF-1）。
- **fake-green 掩护**：§11 chip 注释声称 chip 渲染，实际不渲染；测试只验 hits=0。
  未来 agent 读注释会误以为 chip 路径受保护而放心动 Desk 渲染分支（SW-1）。
- **stale/inconsistent 文案**：混合卷 paper 行头取首题 reason，weak/confident 谁在前
  谁定调，通知条另算一套，二者可当屏打架（SW-3）。

---

## Verification Evidence

- `git diff 849f6f7...HEAD --name-only`：4 文件，forbidden scope（server/steward/
  css/App.tsx）实测零触碰。
- `node scripts/verify-restart1-local-search-intent.mjs`：**69 passed, 0 failed**
  （54 刀① + 15 刀⑤，独立重跑，非抄报告数）。刀① 54 断言原样绿。
- `scripts/verify-restart1-local-search-intent.mjs` 已在 `verify-ci.mjs:71` 注册
  （真 CI 会跑，非手跑独绿）。
- `tsc -b --noEmit`（app）：**exit 0**，`weak?`/`allWeak`/类型守卫全通过类型检查。
  （verify-ci 通过 `npm run build --prefix app` 跑同一 typecheck。）
- MF-1/SW-2 复现：worktree `rankByKeywords` 对 5 组真实无空格 query 实测，并对照
  baseline main 同 query 有命中——差异由刀⑤噪声地板产生。

## Residual Risk

MF-1 修复前不应合：它把 plan 明确圈定的「乱码→真空态」擅自扩到「真实内容词→真空态」，
属超授权的行为收窄，且被测试盲区完整掩盖。修复须附「无空格中文内容词 general-only
不被误杀」的新断言，否则回归会复发。SW-1/2/3/4 不阻断本合并，但 SW-1（chip 缺失
+ 误导注释）与 SW-2（碎片入文案）建议本刀顺手收，避免立刻二次开刀。真库量级与浏览器
三态呈现由主 agent QA 收口。

---

## 返工复核二轮（rework CR）

Reviewer: same fresh Opus CR session. 增量 commit `bfeae09 → 48aebf2`
（branch `restart-5-honest-fallback`）。独立临时 worktree，未动主 checkout，已删除。

Recommendation: **APPROVE**（无 Must Fix；MF-1/SW-1/SW-2 三项均以证据关闭）

### 返工改了什么（全部在 Scope 内）

- `conciergeSearch.ts`：`wholeRunTokensOf` → `tokenRunIdsOf`（run-id 版）；
  噪声地板判据由 `hasWholeRunMatch` 换成 `hasCorpusSignal` = 「全 haystack
  四 tier 合并 DF≥3」**或**「≥2 个来自不同 query run 的 matched token」二选一；
  新增 `buildCombinedHaystack` / `makeDocumentFrequencyLookup`（pool 级 lazy
  缓存）/ `pickDisplayTokens`（每 run 取最长 token）；`buildLocalReason` weak
  分支改 join `displayTokens` 而非 raw `matchedTokens`。
- `ConciergeDesk.tsx`：新增 `isVacuumResultsState`，chip gate 加
  `|| isVacuumResultsState(state)`（SW-1）。
- `verify-restart1-local-search-intent.mjs`：§11 vague 用例改 DF 驱动
  （`随便 教学反思`）、§11b 新增（三条无空格误杀 query 端到端 ≥1 hit +
  命中真 target；gibberish 对 DF-realistic pool 仍空）、§13 新增（SW-2 碎片
  不入文案）。
- `verify-concierge-desk.mjs`：Test 12 断言重写锁 `isVacuumResultsState` 的
  gate 表达式与函数定义；Test 5/6 加 `dfFillerGroups` 让 `写作`/`汽车` DF 达标。

Forbidden scope 二次实测干净：`git diff 849f6f7..48aebf2 --name-only` grep
`server/|steward|semantic|.css|App.tsx|PaperSurface|reason.ts` = **NONE**。
两个 verify 脚本均在 `verify-ci.mjs` 注册（:21 desk、:71 restart1）。

### 四点复核

**(a) 原三条误杀 query 独立复现 + 乱码仍空 → 关闭 MF-1。**
我用 DF-realistic pool 独立跑（非抄断言）：
- `找篇科技文` / `讲科技的文章` / `科技文章` → **各 4 hits，命中真 target**
  （全 weak，措辞诚实）。round-1 这三条都是 0 hit 空真空态，现修复。
- 同 pool 打乱码 `zzxqwqxyz 不存在的题目 12345` → **0 hit**，真空态保持。
MF-1 的 false-negative 消除，且没换成对乱码放水。

**(b) 全 haystack DF 新口径的系统性误放风险 → 有界、已知残差，非新缺陷。**
我构造最坏攻击：乱码串里嵌一个高 DF 真词的子串（`zzq环境kkq乱码`）。
- 若 `环境` 是 topicLabel 词 → 命中 confident（weak:false）。实测**baseline
  刀① 同 pool 同 query 也返回 confident**——这是刀①的 topic-match 行为，
  **刀⑤未触碰**，不是本刀引入。
- 若 `环境` 仅 general 字段高 DF（无 topicLabel）→ DF 路径放行，返回
  **weak** 卡、理由 `可能相关：环境`。这正是 DEV 自报的已知残差（DF 粗地板
  在大语料放行真词），措辞诚实、weak 标记、不进 confident 通知。协调者已声明
  该残差「不算新发现」。裁决：DF 换 whole-run 后**没有引入超出已知残差的
  新系统性误放**；查询里真出现的连续真词以 weak 呈现是诚实降级的应有之义，
  比 round-1 把含真词的 query 整条丢弃更对。

**(c) 同 run 合并（tokenRunIdsOf）正确性 → 通过。**
独立复现：
- `不存在的`（`存在`+`在的` 同 run 重叠 bigram）单独 → **0 hit**（塌成一个
  信号，不凑多重性）。
- `征集 作品`（两个不同 run）→ **1 hit**（多重性路径放行）。
run-id 分配、bigram 继承父 run id、`matchedRunIds.size>=2` 判据均正确；
`pickDisplayTokens` 每 run 取最长 token 的塌缩逻辑正确。

**(d) 重写断言是否真锁行为 → 通过（做了变异测试）。**
上轮抓过 fake-green，这轮对新断言做 mutation：
- 变异 A：`DF_NOISE_THRESHOLD` 9999（废掉 DF 路径）→ **10 条 fail**
  （§11b 三条 query 的 `>=1 hit`/`命中 target` + vague/allWeak 全红）。
- 变异 B：`isAboveNoiseFloor` 恒 true（废掉噪声地板）→ **3 条 fail**
  （gibberish redline `hits===0` 全红）。
- 还原后 85/0。
断言确实会因行为回归而失败，非字符串巧合。SW-1 的 desk 断言直接 regex
`isVacuumResultsState(state)` 出现在 gate 表达式里 + 函数体定义，round-1 的
fake-green 注释已改正。SW-2 §13 用 `!reason.includes('在的')`/`'的问'` 锁碎片
不入文案。

### 独立验证证据（自己重跑，非抄报告）

- `verify-restart1-local-search-intent.mjs`：**85 passed, 0 failed**
  （刀① 54 断言原样在内 + 刀⑤/CR-5 修复断言）。
- `verify-concierge-desk.mjs`：**230 passed, 0 failed**。
- `tsc -b --noEmit`（app，verify-ci 的 build/typecheck 步同款）：**exit 0**。
- `node scripts/verify-ci.mjs` 全量：刀⑤ 相关门全绿；报告的 10 个 `verify-i*`/
  `verify-c7-*` fail 经查全是 `ERR_MODULE_NOT_FOUND: ajv`——CR worktree 缺
  `server/node_modules` 的隔离伪象，**symlink server 依赖后逐一 PASS**，与刀⑤
  无关（刀⑤只碰 app/concierge + 2 个 verify 脚本）。
- mutation A/B 见 (d)：证明新断言可失败。

### 遗留（不阻断本合并）

- **SW-3（round-1 已记，仍在）**：`aggregatePaperResults` 仍不读 `hit.weak`
  （grep `.weak` = 0）。混合 weak+confident 卷的 paper 行头 `displayReason`
  取首题 reason，可与通知条 `every(weak)` 措辞不一致。非正确性问题（信息不丢），
  本刀未处理，继续记为 Should Watch，后续可让 aggregate 感知 weak。
- **DF 粗地板残差（DEV 自报，已知）**：DF=3 绝对地板在 ~270 组语料下会放行
  含真词的乱码 query 成 weak（见 (b)）。措辞诚实、可接受；若后续要更严，
  可叠加「DF 命中 token 需占 query 一定长度占比」，另立 follow-up。

### 真库 QA 归口（非 CR 职责）

SW-4（「生态主题 C 篇」真库是否 flip allWeak）与三态文案浏览器实测仍归主 agent
QA，本 CR 用合成 fixture 证明机制正确（topicLabel 命中 score=5 ≥ 置信地板 →
恒非 weak），真库量级与视觉呈现待浏览器收口。

### 二轮结论

MF-1 关闭（误杀修复且乱码防护保留，变异测试证断言有效）；SW-1 关闭
（chip 渲染真空态 + 断言锁 gate）；SW-2 关闭（displayTokens 防碎片，§13 锁）。
无新 Must Fix。forbidden scope 干净，两 verify 门注册且独立重跑全绿。

**Recommendation: APPROVE.**
