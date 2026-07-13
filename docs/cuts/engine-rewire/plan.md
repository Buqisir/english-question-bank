# engine-rewire — plan.md（相似题配方接体裁/篇位真值，analysis-fields R1 接线刀）

- cut size: **medium**；touches schema: no；data contract: **一处前端类型联合改名**
  （`app/src/domain/questionBank.ts` reason kind `'position-proxy'` → `'position-slot'`，
  契约锁文件，本 plan 授权、主代理在 worktree 解锁）；product boundary: no；
  teaching interpretation: no（目标配方表 + chip 文案 owner 已拍板，
  `docs/cuts/analysis-fields/program.md` 2026-07-10）。
- PA: **PA-lite**。降档理由：方向/配方表/篇位换真值/chip 说人话文案均经
  2026-07-10 High 会话 grilling 逐项拍板；两处恒真病灶 + 前端过滤器 + verify
  断言交接已钉进 r1-genre-truth plan Forbidden 节。CR 复核降档是否仍成立。
- 基线：`github/main` @ 3234735；分支 `engine-rewire`，worktree
  `../wt-engine-rewire`。
- 前提（已成立，勿复查）：R1 真值已落库（本地+生产，记叙101/说明116/议论9/
  应用31/新闻16）；publisher 新卷 `discourse_type` 写 NULL（引擎 `Boolean()`
  guard 已 null 安全）。

## 侦察事实（DEV 直接用，勿重查）

- 引擎 `server/search/similarQuestions.mjs`（703 行）：配方为 RECIPES 配置对象，
  `score = primary*10000 + secondary*100 + bonus`（:407）；`densityTerm` 值域
  0-99、`booleanTerm` 命中=99（:242-253）。
- 病灶A 阅读次序 :355-387：`篇位 proxy = 词数邻域60% + discourse 匹配40%`——
  discourse 曾恒真，proxy 实为词数独舞，**整段废止换真篇位**。
- 病灶B 完形次序 :297-300：代码本身按 `discourseType` 匹配，真值落库后
  **数据自愈，代码零改动**（仅过时注释可顺手更正）；chip `同体裁 说明` 变有效。
- 前端 `app/src/features/paper-browse/SimilarQuestionsRailView.tsx`:52-66
  `isConstantDiscourseReason` SW-1 恒真过滤器 + :15 注释——摘除。
- 篇位数据干净：每卷阅读组 `display_order` 1..4（如 `group-2020-i-reading-c`
  = 第 3 位 = C 篇）；rank 需同卷全部 reading 组参与，超出 `fetchGroupDbMeta`
  的 id 集，需子查询/CTE（窗口函数 sqlite 可用）。
- `seedTargets` 构造在 :446-500（含 explain facets 列表），需补种子篇位集合。
- verify：`scripts/verify-similar-questions.mjs`（有 exit-2 SKIP 守卫，行为断言
  跑真库）、`scripts/verify-paper-browse.mjs` 断言 #55 钉着旧过滤器。

## Must Do

1. **阅读次序换真篇位**（reading.secondary 整段重写）：
   - slot 推导：候选/种子组若 `group_type='reading'`，取其在**同 source 卷内
     全部 reading 组按 `display_order` 排序的名次** → 1..n → A..D（按名次不按
     原始值）；批量 SQL 一次取齐，进 dbMeta（如 `readingSlot`）。
   - 计分（tier 不重叠）：候选字母 ∈ 种子字母集 → base **70**；与种子集最小
     名次差 =1 → base **35**；其余/无 slot → base 0。词数细排：沿用
     `READING_WORD_COUNT_DECAY_WINDOW`（300）线性邻近度，`+ round(proximity*29)`
     ——上限 99，档间永不翻转（同篇位 [70,99] / 相邻 [35,64] / 无 [0,29]）。
   - chip 文案（owner 拍板说人话）：同字母 `同为X篇 · 词数相近(±N)`；相邻
     `篇位相邻 · 词数相近(±N)`；无 slot 仅邻近 `词数相近(±N)`；value 0 无 chip。
     kind 用 `'position-slot'`。
   - **体裁彻底挪出阅读配方**（目标配方表阅读行无体裁项），60/40 注释一并废止。
2. **完形次序自愈确认**：代码零功能改动；:297 前过时注释（若有「恒真」表述）
   更正为真值语义。
3. **七选五加体裁弱加分**（目标配方表 R1 项）：bonus 改为
   `value = min(99, 话题密度值 + (discourseMatch ? 8 : 0))`；仅体裁命中时
   value=8、label `同体裁X`；两者皆有时 label `话题重合 m/n · 同体裁X`。
   8 为严格 tie-break 权重（低于任何现实话题密度台阶）。
4. **前端过滤器摘除**：删 `isConstantDiscourseReason` 与 filter（:52-66），
   reasons 全量渲染；:15 注释同步；`questionBank.ts` kind 联合
   `'position-proxy'` → `'position-slot'`（契约文件，已授权）。
5. **verify 同步**：
   - `verify-paper-browse.mjs` #55 改向：断言过滤器**已摘除**（railViewSrc 无
     `isConstantDiscourseReason`）且 reasons 不过滤直渲。
   - `verify-similar-questions.mjs`：废止 proxy 相关断言/注释；新增行为断言
     （真库，SKIP 守卫内）：①slot 推导对照（`group-2020-i-reading-c` → C）；
     ②tier 不翻转（构造/实取一对同篇位远词数 vs 相邻篇位近词数，前者胜）；
     ③完形 secondary 非恒真（某完形种子的候选池中 matched 与 unmatched 并存）；
     ④七选五体裁增量恰为 8 且不越台阶。
6. 自验 + 收口 commit（一行 message）；断点锚 commit 照惯例。

## Deferred（明确不做——防蔓延，各归其刀）

- 阅读 bonus 收紧「跨主题群」+ 话题三台阶阶梯：需把 `TOPIC_LABEL_TAXONOMY`
  从 api.mjs 模块化抽出（防循环依赖），独立 small 刀。
- 语法填空 i16a 动词三轴加分激活、完形签名细分弱加分：独立配置刀。

## Forbidden

- schema / 迁移（零新增列）
- `server/api.mjs`（taxonomy 不动）
- `server/draft-paper/**`、`server/paper-import/**`
- 生产机/生产库
- `app/src/domain/questionBank.ts` 除 kind 改名一行外不动其他

## 裁决点清单（PM 断点锚）

1. 【DP-1】DEV 完成 → 主代理亲手复核（narrow + verify:all + tsc）→ fresh
   Opus CR → MF 处置（主代理）。
2. 【DP-2】主代理浏览器 QA（rail chips 实看：阅读种子出「同为X篇」chip、
   完形种子出「同体裁」chip）→ merge → 盯 main CI。
3. 【DP-3】owner 观感 QA（部署后，非本刀关门条件）。

## Verification（worktree 内逐条）

```
node scripts/verify-similar-questions.mjs
node scripts/verify-paper-browse.mjs
pnpm -C app run verify:all
```
