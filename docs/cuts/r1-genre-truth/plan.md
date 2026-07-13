# r1-genre-truth — plan.md（体裁补真值,analysis-fields R1 轨）

- cut size: **medium**；touches schema: no（覆写既有列,零新增）；data contract:
  **publisher 写入语义一处**（防回归修复,见 Must Do 3）；product boundary: no
  （ADR-0015 界内后台管线）；teaching interpretation: 五类词表已 owner 拍板
  （program 2026-07-10）+ 边界判例 4 条已 owner 裁决（2026-07-13,见判例集）。
- PA: **PA-lite**。降档理由:方向经 2026-07-10 High 会话 grilling 全拍板
  （开刀包 `agent-entrypoint.md` 预写「已拍板的决策勿重新讨论」）,本 plan 仅
  吸收侦察事实与判例;CR 复核降档是否仍成立。
- 基线: `github/main` @ 292c058;分支 `r1-genre-truth`,worktree
  `../wt-r1-genre-truth`。
- 侦察报告:本次会话 scratchpad `r1-recon-report.md`(要点已吸收进本文,
  报告本身不入库)。
- **与在飞刀 draft-desk-b 的并行边界**:文件面唯二交点 = `verify-ci.mjs` 名单
  与 `scripts/README.md` 登记,双方均为追加行,收口串行时后合并者 rebase 即解;
  其余零交集(publisher/api.mjs taxonomy/新 verify vs draft-paper 面)。

## 判例集（owner 裁决 2026-07-13,跑批 prompt 必须内嵌）

**元原则:判文体看结构骨架,不看表面信号**(报道背景/时效性引子/劝导语气
均不改判)。

1. 人物经历时间线为骨架的纪实文 → **记叙**(主人公是记者、有报道背景不改判)。
   **新闻**收窄为事件播报体:具体日期+机构/官员引语+第三人称播报腔。
   （判例源:passage-2020-i-reading-c Bissell/咸海）
2. 解释因果/分析数据为主体 → **说明**(「first official data has shown」类
   时效引子不改变文体)。（判例源:passage-2022-yi-reading-d 糖税）
3. 贴士/指南/攻略体 → **说明**(带劝导语气不改判)。**议论**收窄为:明确论点
   +论证层层推进的说理文。（判例源:passage-2020-jia-seven-choices 减塑）
4. 第一人称体验/感受为主线 → **记叙**(事件性弱、描写成分重不改判;游记/
   食记/随笔同此)。（判例源:passage-2023-i-grammar-fill 小笼包）

低置信/五类都不贴的样本**不许硬判**:落 `needs-ruling` 清单递 owner 增补判例。

## Must Do

### 1. 分类批(两相分离:判定产物 ≠ 落库动作)
- **规则批(48 篇 writing,零 AI)**:`title` = `应用文写作` → **应用**;
  `读后续写` → **记叙**(侦察已抽样核实内容吻合)。
- **AI 批(225 篇)**:node 脚本(scripts/ 后台管线风格)调项目既有 AI 通道,
  prompt 内嵌五类定义+判例集;**受控枚举硬 gate**(输出不在五类内拒收重试);
  自报置信,低置信入 `needs-ruling`。分批落盘(reading 3 批×42、cloze/
  sevenChoices/grammarFill 各 1 批),断点友好。
- 产物 = `docs/cuts/r1-genre-truth/genre-decisions.json`(273 条:passage_id、
  判定、置信、一句依据、批次)——**审计工件,过 owner gate 前不碰任何 DB**。

### 2. 应用批(幂等 apply 脚本)
- `genre-decisions.json` → UPDATE `passages.discourse_type`;跑前
  `cp data/question-bank.sqlite{,.bak.genre-r1}`;幂等可重跑;同一脚本日后对
  生产库复用(生产同步随下次部署走 pull-run-push,owner 拍板节点,本刀不做)。

### 3. publisher 防回归(侦察新发现,源头堵漏)
- `server/paper-import/publisher.mjs:223` 现把 `group.groupType` 写进
  `discourse_type` 且 `ON CONFLICT DO UPDATE`(:210)会把 R1 真值冲回题型名。
  修法:**conflict 分支保留既有 `discourse_type`**;新 insert 改写 NULL
  (引擎侧 null 安全:体裁项不匹配而已,不炸)。导题标准补「新卷入库须带
  五类体裁」一行(`docs/import/agent-runbook.md` 或 nck1 标准的相应节,
  最小改动)。

### 4. 抽检页(owner gate 器物)
- 分层 ~20 条(五类各若干+全部低置信),形态照
  `docs/cuts/analysis-fields/trap-audit.html`(对味/不对/存疑三判+计分),
  入本 cut 目录。**owner gate 过了 decisions 才算定稿、才许 apply**。

### 5. verify-genre-truth.mjs
- 断言:273/273 覆盖、全落五类枚举、题型名旧值零残留、
  **publisher 源不再向 discourse_type 写题型名**(防回归,源码或行为断言)。
- 挂 CI:`scripts/README.md` 登记 + `verify-ci.mjs` 名单(housekeeping 守卫)。
- **时序注意**:枚举断言在 apply 前必红——CI 挂接与 apply 同 PR 收口,不留
  中间态红。

### 6. 顺手项(开刀包既定)
- api.mjs `TOPIC_LABEL_TAXONOMY`:「生态环境」从环境保护列表删除(归自然
  生态),alias 行同步(program 话题体系节拍板)。

## Forbidden(本刀不许动)
- `server/search/similarQuestions.mjs` 引擎配方(= engine-rewire 刀,含
  `SimilarQuestionsRailView.tsx:52-58` 恒真 chip 前端过滤器摘除 +
  `verify-paper-browse.mjs:1675-1679` 断言同步——已记入该刀交接)
- schema(零新增列)
- 生产库/生产机(同步随下次部署,owner 拍板节点)
- draft-desk-b 在飞面(server/draft-paper/、app draft-paper 面)

## 裁决点清单(PM 断点锚)
1. 【R1-DP1】decisions 产物就绪 → **owner 抽检 gate**(抽检页,判例裁决制);
   不过 → 按新判例返工重批。
2. 【R1-DP2】gate 过 → apply 落库 + verify 全绿 + CR-lite → 合并。
   收口串行:draft-desk-b 若先合,本刀 rebase(verify-ci/README 追加行冲突
   预期内)。

## 验收
verify-genre-truth 绿(含防回归断言)+ verify:all 不回退 + owner 抽检 gate 过
+ 「议论」类全量占比复核(15 篇试跑 0 命中,全量后若仍显著稀疏,报 owner 确认
语料分布 vs 判定偏保守)。AI 成本:225 次调用,DeepSeek 量级几元内。
