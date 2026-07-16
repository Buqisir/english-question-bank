# similar-v2-engine（E5：相似引擎 v2 重铸）

- cut size: **medium-large**；契约面：**API + 配方语义变更** → formal PA
  不降档（与 grammar-facets-v2 同场 PA，重点审两刀契约一致性）。
- 语义拍板全在 `docs/cuts/similar-questions/program.md` §配方 v2（2026-07-15
  四题型终稿 + 排序分层 + 语法填空粒度，**不得重开**）。本 plan 只做工程化。
- **依赖/合入顺序**：语法填空小题配方吃 grammar-facets-v2（D1）的 v2 字段
  （tense/voice/agreementSensitive/role/新词表）。**merge 顺序 D1 → E5**；
  E5 可先行开发（fixture 按 v2 schema 造），但 verify 全绿以 D1 落库为前提
  （D1 侧 analysisConfigs 升版与 33 份文件重写同刀原子，无 v1/v2 混读窗口）。
- **数据契约锁（PA MF-2 压稿 2026-07-15）**：谓语每空
  `tense`/`voice`/`agreementSensitive` 的**唯一读取源 = D1 analysis-v2 blank
  条目**，经现有 `buildRawFacetIndex` 的 `...entry` 透传（similarQuestions.mjs:122）
  读取——**不新增 sidecar-merge 逻辑**（I16·C sidecar 随 D1 退役，见
  grammar-facets-v2/plan.md 同名节）。fixture 必须按该字段位置与名字构造。
- 施工基座：`server/search/similarQuestions.mjs`（798 行）原地重铸——分层
  打分骨架 `primary×10000 + secondary×100 + bonus` 与池子构建/排除逻辑
  （同篇/同卷/种子组排除、poolStats）**保留复用**，RECIPES 换血。

## 目标

### 1. 新端点 POST `/api/similar-passages`（篇章相似，四题型统一）

- 入参 `{ groupId, limit? }`；鉴权同现有相似端点（登录态）。
- 分层（program.md §篇章相似排序，分层制非加分制）：
  1. **同话题 = 门槛**：话题标签零重合的候选不进池（不进结果不占位）。
  2. **篇位**（仅 `reading`）：同篇位 70 / 相邻 35 / 其他 0（复用现档位，
     词数细排 29 分段随 v1 废止——secondary 只剩篇位基分）。
  3. **真题 > 模拟**：`source_type === 'real_exam'` 二元判据（PA SF-2：库中
     枚举实测恰二值 real_exam 264 / mock_exam 9，"类值集合"措辞作废）。
  4. **年份新旧**尾序（现有 tie-break 保留）。
- tier→槽位映射（PA C-3）：落 `primary×10000 + secondary×100` 骨架时
  **篇位进 primary、真题进 secondary、年份 tie-break**——真题永在篇位之下
  一层，非 reading 无篇位档、真题即最高档；禁把两者放同层加权。
- chips：`同为B篇`/`篇位相邻`、`同话题·<标签>`、`真题`；池子诚实
  `totalInPool`（门槛后池）照旧。
- **种子自身零话题标签 → 诚实空态**（PA SF-3）：硬门槛下这类种子零候选
  入池，返回空结果 + 明示文案（不降级不兜底）；实测库中 7 组无话题标签
  （reading 4 / 三题型各 1），是真实路径不是理论边角。

### 2. `/api/similar-questions` 重铸（小题相似，仅阅读 + 语法填空）

- 骨架统一：**题型专属维度命中入池 → 同话题加分（secondary）→ 年份尾序**。
  密度概念全线退场（matched/total 打分删除；`matchedQuestionIds` 保留仅作
  chips「N 题」展示真值）。
- **阅读**：池 = 候选组含 ≥1 题与种子同 `skill.primary`；primary = 命中
  （booleanTerm）。
- **语法填空**（吃 D1 v2 字段）：
  - 非谓语种子：池 = 含同 `role` 非谓语空的组；chip 带 `form` 解释
    （"同款：非谓语作定语 · done"）。
  - 谓语种子：池 = 含谓语空的组；primary = 组内谓语空对种子的最佳匹配
    向量 **时态4/语态2/一致1**（0-7，取组内最高分空）。
  - 其余考点种子：池 = 同 facetKey（v2 词表）命中。
- **完形/七选五种子 → 400**，错误文案明示"该题型走篇章相似"（E6 改指）。
- **混类多种子 → 400**（PA SF-4 钉死）：seeds 数组必须同配方分支（同谓语 /
  同非谓语 / 同其余 facetKey 类），混类拒绝，文案明示"一次按一个考点找
  相似"（program.md 本命 = 单种子错题）；verify 断言。分支判定按 facetKey
  `given.verb.finite` / `given.verb.non-finite`（PA C-2）。
- seedProfile 结构随新配方（facets 字段对齐 v2 词表）。

### 3. 拆除清单（恒真/密度/proxy，全部废止）

- 完形：体裁次序、pos 词性加分、话题密度主序（完形不再有小题配方）。
- 语法填空：提示词 blankType 次序（信息已编进 v2 考点 key）。
- 七选五：role+position 密度主序、机制次序、话题+体裁加分（不再有小题配方）。
- 阅读：词数邻域细排（READING_WORD_COUNT_DECAY_WINDOW 及其常量删）、
  话题不同+20 加分。
- `densityTerm` 删除；`booleanTerm` 保留。

### 4. reasons/chips 文案表

- 与 recipe 同源单表（E2 cr.md SW"FE 配方文案表可漂移"挂账一并收）：
  新 kind 集合 = `topic-match / position-slot / authentic-source / facet-hit /
  verb-vector`；前端未知 kind 兜底行为按 DESIGN.md §7 禁兜底纪律显式白名单。

## Forbidden

- 不动 UI（E6/E7 的活）；不动分析文件与 schema（D1 的活）；不动
  teachingFacets 检索层对外契约（i16a filter 行为不变）。
- program.md 拍板语义不得重开；分层制不得退化为加权求和。

## verify

- 新 `verify-similar-v2.mjs`：
  - 每配方分支 fixture 断言（四题型篇章 + 阅读/语法填空小题 + 谓语向量
    7/6/4/2/1 序 + 非谓语 role 匹配）。谓语 fixture 字段位置/名字按上方
    数据契约锁（analysis-v2 blank 条目：tense/voice/agreementSensitive）。
  - **分层不翻转断言**：构造下层满分 vs 上层一格候选，断言永不越层
    （话题门槛外的同篇位真题必不出现）。
  - 门槛断言：话题零重合 → 不在结果；池子诚实计数随门槛收缩；
    **种子零话题 → 诚实空态**（PA SF-3 用例）。
  - 完形/七选五小题种子 400 + 文案断言；**混类多种子 400** 断言（SF-4）。
  - 真题>模拟排序断言（同话题同篇位构造对，**自造含 mock 数据**——真库
    mock 仅 9 条该档几乎不触发，PA SF-2）；`source_type` 枚举域断言
    （恰 {real_exam, mock_exam}，出新值即红）。
  - role 白名单断言含**全七格**（含现库尚无、由 D1 role 校正引入的
    `predicative`，PA C-2 防漏格假绿）。
- 现有 `scripts/verify-similar-questions.mjs`（**35 个 assert**，PA SF-1
  实测更正：plan 原写 "verify-similar-engine 29 断言" 系笔误，该文件不存在）
  逐条处置清单：迁移/改写/退役，入 cut-note，不许静默删。
- DP-2：本地 QA 帐号实调两端点各题型一轮（qa 记录入 cut 目录）。

## 收口

- [ ] verify:all + 新 verify 绿 + main CI 绿
- [ ] fresh CR（formal，配方语义变更）
- [ ] STATUS.md 更新；部署随 E6/E7 同批或先行（端点无 UI 消费者时上线
  无害）；owner DP-3 归并到 E6 入口刀一并实点
