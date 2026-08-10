# 过词后的滚动复习：国内外产品机制与 EQBank 接入启示

- 调研日期：2026-08-09
- 仓库基线：`80379bff9754cc57c355dfcb41438974464e631d`
- 定位：为后续产品规划提供证据，不是正式产品计划、数据设计或实施授权
- 目标场景：教师在电脑端快速过学生背过的词，认识即过、不认识即收；随后形成生词组、听写，并在连续上课或每周上课时滚动复习

## 结论先行

证据指向的不是“再做一个背词 App”，而是把当前已经顺手的过词闭环补上一层**按学生、按单词、按能力通道持续变化的复习状态**。

1. **快速过词、复习和听写是三个不同动作。**首次“认识 / 不认识”适合筛选；真正的复习必须先要求学生回忆，再给答案和反馈；只看卡片或循环听音频不能代替主动回忆。Roediger 与 Karpicke 的原始实验中，重复提取在延迟测试上优于重复学习；收益不等同于当场表现好。[原始论文：Test-Enhanced Learning](https://doi.org/10.1111/j.1467-9280.2006.01693.x)（访问：2026-08-09）
2. **到期复习优先于继续加新词。**Anki 明确提醒，新卡会制造后续复习负担；出现积压时应暂停新卡，而不是继续扩大积压。[Anki Manual：Daily Limits](https://docs.ankiweb.net/deck-options.html#daily-limits)（访问：2026-08-09）墨墨也把复习量和建议新学量合并为一个学习量，复习多时减少新学、复习少时增加新学。[墨墨官方帮助](https://www.maimemo.com/help30)（访问：2026-08-09）
3. **“这个词会不会”不能只存一个永久布尔值。**主流机制都会依据时间和答题历史改变复习顺序；Anki/FSRS明确区分可提取性、目标记忆保持率和个体参数，Quizlet 曾明确把答题正误、距上次作答时间、历史间隔和测试方向用于预测。[Anki Manual：FSRS](https://docs.ankiweb.net/deck-options.html#fsrs)、[Quizlet 官方工程说明](https://quizlet.com/blog/spaced-repetition-for-all-cognitive-science-meets-big-data-in-a-procrastinating-world)（访问：2026-08-09）
4. **认义和听写至少要分开记。**“看到英文能说出核心义”不代表“听到读音能拼出单词”。Quizlet 的官方工程说明把学习方向当作分开但相关的事实；其 Spell 模式要求听音后输入，拼错会指出字母并重试，完成一轮需每词正确两次。[Quizlet 官方工程说明](https://quizlet.com/blog/spaced-repetition-for-all-cognitive-science-meets-big-data-in-a-procrastinating-world)、[Quizlet Spell 官方帮助](https://help.quizlet.com/hc/en-us/articles/360030645752-Studying-with-Spell-mode)（访问：2026-08-09）
5. **每天上课与每周上课，差别应在“复习机会何时出现”，不是另造两套词库或两种 Set。**间隔研究显示，合适间隔会随目标保持时长而变化，不存在对所有目标都最佳的一组固定天数。[Cepeda 等 2008 原始论文](https://laplab.ucsd.edu/articles/Cepeda%20et%20al%202008_psychsci.pdf)（访问：2026-08-09）因此，上课频率和学生复习频率要解耦：周课学生也应能在课间通过二维码获得短复习机会。
6. **`VocabularySet` 应继续是冻结的交付物，不应变成调度器。**Set 适合保证打印、二维码、顺序和内容不漂移；复习状态会随每次结果改变，必须是另一层数据。当前仓库正好已经把 Set 定义为冻结快照，但尚无 per-student/per-word 的长期到期时间、记忆强度、遗忘次数和能力通道状态。

## 一手资料显示，各产品实际上做了什么

以下“官方事实”只写官方页面、官方帮助、官方源码/算法说明或原始论文明确披露的内容。厂商没有公开的算法细节不作推测。

### 国内产品

| 产品 | 官方可确认机制 | 对本场景最有价值的启示 | 证据边界 |
| --- | --- | --- | --- |
| 扇贝单词 | 记录“我认识 / 提示一下”等学习行为，估计个人记忆效果；当前官方介绍还称其综合错误频率和遗忘趋势动态调整复习顺序与强度，多次错误会增加后续复现权重；另有极速刷词、拼写/听写/复述与可打印词表。 | 当前二元过词操作很适合做低摩擦入口；反复错误词应自然浮到前面，但不能让教师手工整理“顽固词”。 | 官方未公开生产算法公式、状态字段和精确间隔。[扇贝学习记忆曲线](https://web.shanbay.com/cms/articles/bbrrss)、[扇贝官方产品介绍](https://web.shanbay.com/company/jieshao)（访问：2026-08-09） |
| 百词斩 | 为每个词制作专属场景；允许自定义词数和每日任务；提供发音、场景例句与多种复习模式。 | 图片最适合帮助理解和建立线索；每日任务量可以由教师控制，但场景图不能替代之后的无提示提取。 | 官网没有公开不同复习模式如何排程，也没有公开遗忘模型参数。[百词斩官网](https://baicizhan.com/)、[百词斩官方下载页](https://www.baicizhan.com/download)（访问：2026-08-09） |
| 不背单词 | 官方称根据记忆效果动态调整学习安排；把真实语境例句与智能拼写测试放在同一学习闭环。 | 例句和图片应在答错后的讲解阶段发挥作用；拼写是一次独立的产生式检查，而不是继续看词。 | 官网只披露产品层机制，不披露评分、遗忘状态或精确调度公式。[不背单词官网](https://bbdc.cn/index)（访问：2026-08-09） |
| 墨墨背单词 | “认识 / 模糊 / 忘记 / 熟知”有不同后果：当天首次反馈影响未来日期；模糊、忘记会在当天再次出现，忘记还很可能次日再现；复习量大时少加新词。官方还称 MM 算法依据学习时间、复习时间和记忆保留率动态安排间隔。 | 最可借鉴的是“两层反馈”：一次课内短循环用于把刚错的词再提取出来；跨天调度只由当天第一次有效测试更新，避免教师连续点几次把长期状态冲坏。 | 墨墨披露了行为语义和论文/源码，但其线上生产参数与完整策略未公开。[墨墨官方帮助](https://www.maimemo.com/help30)、[墨墨官方产品说明](https://memodocs.maimemo.com/docs/memo)、[官方 SSP-MMC 源码](https://github.com/maimemo/SSP-MMC)（访问：2026-08-09） |

### 国外产品与算法

| 产品/体系 | 官方或原始资料可确认机制 | 对本场景最有价值的启示 |
| --- | --- | --- |
| Anki + FSRS | 学习和重学使用同日可完成的短步骤；失败后进入 relearning；可限制每日新卡和复习上限。FSRS 以目标保持率调节负担，较高保持率意味着更短间隔和更多复习，并从个人复习历史拟合参数；官方提醒少于数百次复习时数据不足。 | 先保证真实、稳定地记录结果，后谈个性化模型。早期可用共同默认参数；不要在每位学生只有几十次记录时伪装成“AI 精准预测”。[Anki Manual](https://docs.ankiweb.net/deck-options.html#fsrs)（访问：2026-08-09） |
| SuperMemo / SM-2 | 每个最小知识项有自己的 easiness factor；答题质量 0–5 会改变间隔；低于 3 重新开始，且当天低于 4 的项目继续出现直到至少为 4。 | 单词应是独立调度单位；失败应同时触发课内重学和跨日缩短间隔。当前“一个 Set 一起复习”过粗。[SuperMemo 2 原始算法说明](https://www.super-memory.com/english/ol/sm2.htm)（访问：2026-08-09） |
| Quizlet | 当前 Learn 根据目标和对内容的熟悉度生成个性化路径，混合选择、判断、书写等题型，答对后逐渐转向更难的题型；Write/Spell 可让错题重新输入。其官方工程历史还明确披露了基于正误、时间间隔、学习方向来预测召回概率的机制。 | 先用容易形式恢复信心，再用无选项的认义或拼写证明掌握；一个“认识”不应同时代表认义和听写通过。[Quizlet Learn 官方帮助](https://help.quizlet.com/hc/en-us/articles/360030986971-Studying-with-Learn)、[Quizlet Spell 官方帮助](https://help.quizlet.com/hc/en-us/articles/360030645752-Studying-with-Spell-mode)（访问：2026-08-09） |
| Duolingo | 原始 HLR 论文以学生—词练习记录估计记忆半衰期，预测召回率相较基线降低 45% 以上误差；当前官方说明称个性化练习把间隔与准确率结合来挑选词和语法，Practice 提供错题、听力等定向练习。 | 复习队列可以把“最可能遗忘”和“最近答错”结合，而不是只按加入生词本的先后顺序；但 HLR 论文不能证明今天 Duolingo 的全部生产逻辑。[Duolingo HLR 原始论文](https://research.duolingo.com/papers/settles.acl16.pdf)、[Duolingo 官方间隔复习说明](https://blog.duolingo.com/spaced-repetition-for-learning/)、[Practice 官方说明](https://blog.duolingo.com/guide-to-duolingo-practice-hub/)（访问：2026-08-09） |

## 跨产品的一致机制

### 1. 先提取，再揭示

主动回忆是复习的核心操作。对 EQBank 而言，三种提示方向应明确分开：

- 英文词形 → 学生说核心义：检查认义。
- 中文核心义 → 学生写英文：检查主动拼写。
- 单词音频 → 学生写英文：检查听写。

**我们的推断：**图片、音节、整词音标和例句应在学生作答后用于反馈和纠错；如果一开始就全部展示，记录到的是“看懂了”，不是“能提取”。

### 2. 错词既要课内再来一次，也要跨日再来

Anki 的 learning/relearning steps、SM-2 的当天补做、墨墨的“模糊/忘记当天再现”都把短期重学与长期排程分开。[Anki learning/relearning](https://docs.ankiweb.net/deck-options.html#learning-steps)、[SuperMemo 2](https://www.super-memory.com/english/ol/sm2.htm)、[墨墨官方帮助](https://www.maimemo.com/help30)（访问：2026-08-09）

**我们的推断：**教师点击“不认识”后，不必立刻反复同一词；先显示教学卡，再隔若干词无提示复测一次。即使课内复测正确，也仍保留次日/下次的到期复习。课内答对只能说明刚刚学会，不能清空长期风险。

### 3. 难词的定义来自行为，不靠静态标签

SuperMemo 为每个 item 维护难度因子；FSRS 区分难度、稳定性与可提取性；墨墨和扇贝均称会依据错误历史提高难词复现。[SuperMemo 2](https://www.super-memory.com/english/ol/sm2.htm)、[FSRS 开源项目](https://github.com/open-spaced-repetition/fsrs4anki)、[墨墨官方算法日志](https://memodocs.maimemo.com/docs/maimemo-algorithm-updates)、[扇贝官方产品介绍](https://web.shanbay.com/company/jieshao)（访问：2026-08-09）

**我们的推断：**原书难度、词频和教学阶段适合作为冷启动信息；真正的“这个孩子的难词”必须由该学生的失败、犹豫、听写错误和间隔后遗忘逐渐形成。

### 4. 每日容量应先减去到期复习

固定“每天再加 20 个”容易让未来复习量滚雪球。Anki 明确给出这一负担警告；墨墨直接把新学与复习放进同一学习量。[Anki Daily Limits](https://docs.ankiweb.net/deck-options.html#daily-limits)、[墨墨官方帮助](https://www.maimemo.com/help30)（访问：2026-08-09）

**我们的推断：**教师设置的应是这次最多投入多少时间/多少次判断，系统先装入到期词，剩余容量才给新词。当前“本轮收多少个生词”可以继续保留，但它控制输出 Set 的大小，不应成为长期学习负担的唯一阀门。

## 两种上课节奏怎么滚动

以下是基于上述证据的产品推断，不是已经验证的固定算法。

### 连续每天上课

一次短流程可以是：

1. 先过到期词：无提示认义或听写，记录真实结果。
2. 把失败词插入本课稍后位置做一次课内复测，而不是立刻连点。
3. 到期任务完成后，才继续快速过新词。
4. 新收生词仍生成冻结 Set，用于打印和扫码；同时进入该学生的长期复习队列。
5. 第二天先处理昨天失败和今天到期的旧词，再开新量。

这种节奏的优势是教师每天都能产生高质量结果。要避免的是每天都从新词开始，最后把旧词复习挤掉。

### 每周一次上课

教师见面频率低，不等于复习也必须一周一次：

1. 课堂仍负责快速过词、讲清和第一次有效测试。
2. 冻结 Set 的二维码在两次课之间提供短的听写/认义机会；应先让学生作答或在纸上写，再揭示答案。
3. 如果公共二维码保持匿名、只播放音频，网站只能提供练习材料，不能声称已经完成个性化调度；结果可以等下次课由教师批量记录。
4. 若未来选择让课间结果自动进入排程，就必须有稳定的学生身份或学生专属链接，并处理误点、代做和隐私边界。
5. 下周课堂优先复测最可能遗忘、上周失败或课间未完成的词，再决定本周新量。

**关键判断：**每周一次课若完全没有课间提取机会，系统仍可以在下周按风险排序复习，但它不是完整的间隔复习闭环；二维码使轻量课间练习成为可能，不过“扫码听一遍”本身仍只是暴露，不是听写证据。

## 与现有 EQBank 的接入边界

### 已有的正确积木

当前规范和代码已经具备：完整 1600 词 Program、顺序过词、`known/unfamiliar` 决策、1–60 词冻结 `VocabularySet`、打印、分享、撤销和扫码播放器。规范明确 Set Entry 保存生成时内容快照，后续词库更新不得让旧单词纸或二维码漂移。见 [`spec.md`](../spec.md) 第 3.2、5–7 节。

这意味着无需重做已验收的过词交互，也不应让长期复习修改旧 Set。

### 当前缺口：不是缺一个按钮，而是缺长期记忆主体

仓库事实：

- `vocabulary_review_decisions` 只记录某一次 run 的 `known/unfamiliar` 与顺序；run 冻结后即成为 Set 来源。[`server/vocabulary/vocabularyStore.mjs`](../../../../server/vocabulary/vocabularyStore.mjs)
- `vocabulary_sets` 和 `vocabulary_set_entries.snapshot_json` 保存冻结内容；公开播放读取这份快照。[`server/vocabulary/vocabularyStore.mjs`](../../../../server/vocabulary/vocabularyStore.mjs)
- 当前 vocabulary 用户表以登录 `user_id` 为边界，没有 vocabulary 专用的 `student_id`，也没有每个学生—单词的 `dueAt`、历史结果、遗忘次数或“认义/听写”分通道状态。[`server/vocabulary/vocabularyStore.mjs`](../../../../server/vocabulary/vocabularyStore.mjs)

因此，不能把 Set 当作复习状态，也不能把教师账号的一个总进度当作多个学生的记忆。

### 后续规划最小需要回答的产品问题

这些是研究导出的决策题，不是本轮实施项：

1. **记忆归谁：**老师的一名具体学生、一个固定小组，还是老师自己？对“一直连续上课的学生”，最自然的单位是学生。
2. **什么算一次有效复习：**教师电脑上的无提示判断、学生扫码后的输入、纸笔听写后教师批改，哪些可以更新长期状态？
3. **最少保留几个能力通道：**建议至少把“认义”和“听写拼写”分开；不要一开始扩成听说读写所有维度。
4. **匿名二维码的角色：**只做稳定练习材料，还是要记录学生结果？前者简单但不能自动个性化；后者需要学生身份、权限和防误记。
5. **启动算法的复杂度：**在数据很少时用共享、可解释的保守排程；积累足够真实历史后再评估 FSRS，而不是从第一天训练每人模型。Anki 官方说明 FSRS 在低于数百次复习时可能缺少足够数据。[Anki Manual：FSRS Health Check](https://docs.ankiweb.net/deck-options.html#fsrs)（访问：2026-08-09）

### 最值得保留的一条产品主线

```text
选择学生
  → 先完成到期复习
  → 有余量再快速过新词
  → 不认识词形成冻结 VocabularySet
  → 纸张/二维码提供讲解与听写材料
  → 有效作答回写学生—单词状态
  → 下次按到期与失败风险重新排队
```

这里真正新增的只有“学生—单词长期状态 + 到期队列 + 有效结果入口”。图片、例句、音频、打印、二维码和冻结 Set 都是现有资产，不需要重新设计。

## 不建议照搬的做法

- 不把连续打卡当学习效果；打卡可以帮助习惯，但不能替代每词的提取结果。
- 不把循环播放当听写；必须先产生答案，再反馈。
- 不一开始要求四级或六级主观评分。现有二元“认识/不认识”可以映射为 pass/fail；需要时再增加“模糊”，避免拖慢教师过词。
- 不让固定每日新词数压过复习；到期积压时先清旧词。
- 不用一个总“掌握度”掩盖认义与听写差异。
- 不因引入调度而修改旧 `VocabularySet`；冻结交付物与动态记忆状态职责不同。
- 不在每位学生数据极少时宣传“精准遗忘预测”。

## 一手资料无法确认的空白

1. 百词斩、不背单词和扇贝没有公开当前生产调度器的公式、精确间隔或完整反馈语义；本报告只采用其官方明示功能。
2. Quizlet 2017 工程文中的 Long-Term Learning 已明确退役；该文可用于理解设计取舍，不能当作当前 Learn 的完整实现。当前行为以官方 Help Center 为准。
3. Duolingo HLR 是公开的原始研究，但当前生产系统已继续演进；官方没有公开今天所有词汇排程参数。
4. 没有找到针对“中国初中、一对一或小班、教师代操作、连续日课与周课并存”这一完整场景的产品级随机对照研究。两种节奏的建议是基于间隔效应、提取练习与产品机制的推断。
5. 现有公开资料不能证明被动听单词能产生等同于主动听写的长期保持；因此播放器只能作为材料载体，除非学生确实先作答且结果被可靠记录。
6. 研究没有替 Owner 决定学生身份、匿名链接是否记分、教师代录结果的可信度和目标保持率；这些应在后续正式规划时锁定。

## 主要来源清单

所有来源均于 2026-08-09 访问。

- [Anki Manual：Deck Options / FSRS / Daily Limits / Learning and Relearning](https://docs.ankiweb.net/deck-options.html)
- [FSRS4Anki 官方开源项目](https://github.com/open-spaced-repetition/fsrs4anki)
- [SuperMemo 2 原始算法说明](https://www.super-memory.com/english/ol/sm2.htm)
- [Roediger & Karpicke 2006：Test-Enhanced Learning](https://doi.org/10.1111/j.1467-9280.2006.01693.x)
- [Cepeda et al. 2008：Spacing Effects in Learning](https://laplab.ucsd.edu/articles/Cepeda%20et%20al%202008_psychsci.pdf)
- [Quizlet Learn 官方帮助](https://help.quizlet.com/hc/en-us/articles/360030986971-Studying-with-Learn)
- [Quizlet Spell 官方帮助](https://help.quizlet.com/hc/en-us/articles/360030645752-Studying-with-Spell-mode)
- [Quizlet 官方工程说明：Learning Assistant](https://quizlet.com/blog/spaced-repetition-for-all-cognitive-science-meets-big-data-in-a-procrastinating-world)
- [Duolingo HLR 原始论文](https://research.duolingo.com/papers/settles.acl16.pdf)
- [Duolingo 官方间隔复习说明](https://blog.duolingo.com/spaced-repetition-for-learning/)
- [扇贝官方记忆曲线说明](https://web.shanbay.com/cms/articles/bbrrss)
- [扇贝官方产品介绍](https://web.shanbay.com/company/jieshao)
- [百词斩官网](https://baicizhan.com/)
- [不背单词官网](https://bbdc.cn/index)
- [墨墨官方帮助](https://www.maimemo.com/help30)
- [墨墨官方产品与算法说明](https://memodocs.maimemo.com/docs/memo)
- [墨墨 SSP-MMC 官方源码](https://github.com/maimemo/SSP-MMC)
