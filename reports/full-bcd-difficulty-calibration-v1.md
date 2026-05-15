# 全量 B/C/D 小题难度校准表 V1

生成时间：2026-05-15T00:00:00.000Z

## 结论

- 当前阶段：已导入且已有 DeepSeek 阅读解析的 B/C/D 全量校准。
- 当前覆盖：27 篇 / 108 题。
- 理论目标：27 篇 / 约 108 题。
- 当前缺口：0 篇，B/C/D 目标样本池已补齐。
- 校准状态：teacher-confirmed。DeepSeek 原始分、Codex/Claude 复核与用户最终分已全部写入。
- Claude 覆盖：108/108 题。

## 缺口

| 来源 | 年份 | 篇 | 缺口原因 | 下一步 |
| --- | ---: | --- | --- | --- |
| 无 | - | - | - | - |

## reviewPriority 规则

- high：T9/T10；word_meaning / adjective_summary / abstract_phrase_summary / writing_technique；含 topic；含 abstraction+distractor；AI 1-10 分先映射到 1-5 后与 Codex 初判差距 >= 2；证据缺失；AI 原始分 >= 7。
- medium：T5/T6/T7/T8；多个 blocker；AI 分 >= 5。
- low：直接定位或低阻断题。

AI 映射断点：1-2→1，3-4→2，5-6→3，7-8→4，9-10→5。

## 复核量

| 优先级 | 题数 |
| --- | ---: |
| high | 22 |
| low | 57 |
| medium | 29 |

## 题型覆盖

| 类别 | 题数 |
| --- | ---: |
| 猜词/指代 | 10 |
| 段落/文章主旨 | 12 |
| 推断/抽象压缩 | 14 |
| 细节/多细节/learn from | 63 |
| why mention/example/writing | 9 |

## 年份覆盖

| 年份 | 题数 |
| --- | ---: |
| 2021 | 12 |
| 2022 | 12 |
| 2023 | 24 |
| 2024 | 24 |
| 2025 | 24 |
| 2026 | 12 |

## T 卡覆盖

| T卡 | 题数 |
| --- | ---: |
| T1 | 3 |
| T10 | 4 |
| T2 | 53 |
| T3 | 10 |
| T4 | 3 |
| T5 | 12 |
| T6 | 12 |
| T7 | 8 |
| T8 | 1 |
| T9 | 2 |

## 三方分布

DeepSeek 映射分布：

| DeepSeek映射 1-5 | 题数 |
| --- | ---: |
| 1 | 25 |
| 2 | 51 |
| 3 | 26 |
| 4 | 6 |

Codex/超老师经验分布：

| Codex经验分 1-5 | 题数 |
| --- | ---: |
| 1 | 23 |
| 2 | 35 |
| 3 | 38 |
| 4 | 12 |

Claude 经验分布：

| Claude经验分 1-5 | 题数 |
| --- | ---: |
| 1 | 26 |
| 2 | 46 |
| 3 | 31 |
| 4 | 5 |

你已确认分布：

| 你最终分 1-5 | 题数 |
| --- | ---: |
| 1 | 4 |
| 2 | 23 |
| 3 | 60 |
| 4 | 16 |
| 5 | 5 |

## 三方分歧

- DeepSeek 映射分 与 Codex 经验分不一致：24 题。
- Codex 经验分 与 Claude 经验分不一致：32 题。

DeepSeek vs Codex 分歧幅度：

| 分歧幅度 | 题数 |
| --- | ---: |
| ±1 | 22 |
| ≥2 | 2 |

Codex vs Claude 分歧幅度：

| 分歧幅度 | 题数 |
| --- | ---: |
| ±1 | 30 |
| ≥2 | 2 |

## DeepSeek 解析元信息

| provider/model/thinking | 题数 |
| --- | ---: |
| deepseek/deepseek-v4-flash/thinking=false | 12 |
| deepseek/deepseek-v4-flash/thinking=true | 96 |

## 你优先看的 high 题

| 来源 | 篇 | 题号 | surfaceType | T卡 | DeepSeek 10 | DeepSeek档 | Codex | Claude | 你最终 | 复核原因 | stem | 三方备注 |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| 2021 2021年新课标Ⅰ卷-答案版 | B | 2 | adjective_summary | T10 | 8 | 4 | 4 | 3 | 3 | T10高风险边界；adjective_summary题型需复核；AI高难分 | Which of the following best describes Titterton's job on stage? | Codex：形容词压缩题需把具体描写抽象成评价词；T10 属高抽象边界，建议人工确认<br>Claude：需综合多句归纳为一个形容词，但选项区分度尚可，4偏高，3更合理<br>你：赞同给 3：需把多个具体要求压缩为 demanding，且 demanding 本身对学生有一定词汇阻断。 |
| 2021 2021年新课标Ⅰ卷-答案版 | C | 2 | word_meaning | T3 | 4 | 2 | 3 | 2 | 2 | word_meaning题型需复核 | What does the underlined word “decimate” mean in the first paragraph? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度；词汇负荷可能影响答案路径<br>Claude：上下文线索充分：killed/dried/reducing，可推出大规模破坏之意，选项区分度尚可<br>你：赞同：目标词生，但 killed/dried/reducing 等上下文线索强。 |
| 2021 2021年新课标Ⅰ卷-答案版 | D | 3 | attitude_tone | T9 | 4 | 2 | 4 | 3 | 3 | AI与Codex初判差距≥2；T9高风险边界；抽象+强干扰 | What is the author's attitude to the popularization of emotional intelligence? | Codex：态度题需综合语气与评价方向；干扰项有一定迷惑性<br>Claude：态度题需整合让步句run far ahead与转折more beneficial，区分favourably与其他选项<br>你：学生可能按一个正面多个负面误判态度，需处理让步转折。 |
| 2021 2021年新课标Ⅰ卷-答案版 | D | 4 | paragraph_main_idea | T5 | 4 | 2 | 4 | 2 | 2 | AI与Codex初判差距≥2；抽象+强干扰 | What does the last paragraph mainly talk about concerning emotional intelligence? | Codex：干扰项有一定迷惑性<br>Claude：段落大意题但末段结构清晰，hope/future方向明确，概括难度不高<br>你：赞同：hope/future/study 信号明显，段落方向直接。 |
| 2022 2022年新课标I-答案版 | C | 3 | word_meaning | T3 | 4 | 2 | 3 | 2 | 2 | word_meaning题型需复核 | What do the underlined words "embark on" mean in Paragraph 7? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：embark on上下文有first to...the project，可推出"开始参与"，选项区分度足够<br>你：赞同：first to...the project 提示 begin，但部分学生不理解为什么是开始，需排除。 |
| 2023 2023年新课标Ⅰ卷-答案版 | B | 4 | abstract_phrase_summary | T10 | 8 | 4 | 4 | 4 | 2 | T10高风险边界；abstract_phrase_summary题型需复核；AI高难分 | What is the basis for John's work? | Codex：抽象短语压缩题需把具体信息上升为概念标签；T10 属高抽象边界，建议人工确认；信息跨度增加定位/整合成本<br>Claude：全文主旨提炼题，需贯通John从观察自然到应用的逻辑线，抽象度高<br>你：虽是抽象概括，但后文 self-repair 定位明显，self 和 repair 对学生较可识别；diverse 和 organisms 有一定干扰但不强。 |
| 2023 2023年新课标Ⅰ卷-答案版 | C | 2 | word_meaning | T3 | 4 | 2 | 3 | 2 | 3 | word_meaning题型需复核 | What does the underlined word “declutter” in paragraph 3 mean? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度；干扰项有一定迷惑性<br>Claude：declutter由de-+clutter构词线索加step away from语境，可推出"清理"<br>你：词组干扰较强，step away from 也是理解障碍，猜词路径不算直。 |
| 2023 2023年新课标Ⅰ卷-答案版 | D | 4 | attitude_tone | T9 | 5 | 3 | 3 | 3 | 3 | T9高风险边界 | What is the author's attitude toward Navajas' studies? | Codex：态度题需综合语气与评价方向；词汇负荷可能影响答案路径<br>Claude：态度题需整合limitations与enormous两端信息，选项词汇有区分度<br>你：学生可能按一个赞同三个负面排除；抓住 Although 转折和 enormous 也能做出。 |
| 2023 2023年浙江卷（1月）-答案版 | B | 1 | word_meaning | T3 | 4 | 2 | 3 | 2 | 3 | word_meaning题型需复核 | What do the underlined words "jump on that bandwagon" mean in the first paragraph? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：bandwagon有上下文提示(sustainable lifestyle)，选项直白易排除<br>你：jump on that bandwagon 需要把选项中的 you 回指到原文语境，学生容易做人称转换不到位并误选 C。 |
| 2023 2023年浙江卷（1月）-答案版 | C | 2 | word_meaning | T3 | 4 | 2 | 3 | 2 | 3 | word_meaning题型需复核 | What does the underlined word "wrinkles" in Paragraph 2 refer to? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：ironed out搭配提供明确语境线索，指代errors/problems<br>你：wrinkles 前后有 errors / Such 指代线索，但 ironed out 本身是阻碍，需处理短语语义和指代关系。 |
| 2023 2023年浙江卷（1月）-答案版 | D | 4 | passage_main_idea | T5 | 6 | 3 | 4 | 3 | 3 | 抽象+强干扰 | Which of the following is the best title for the text? | Codex：干扰项有一定迷惑性<br>Claude：标题需整合solar farms与pollinators双主线，选项有干扰<br>你：赞同：标题题需整合 solar farms、low-impact development 和 pollinator-friendly 转向；D 覆盖最好但有一定抽象概括。 |
| 2024 2024年新课标Ⅰ卷-答案版 | C | 1 | word_meaning | T3 | 4 | 2 | 3 | 2 | 3 | word_meaning题型需复核 | What does the underlined phrase “shine through” in paragraph 2 mean? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度；句法负荷可能影响定位句处理<br>Claude：shine through语境明确(benefits particularly...)，选项区分度足够<br>你：赞同：证据句长且插入解释多，需抓住纸质阅读优势在复杂任务中更明显。用户指出该篇实际为 C 篇。 |
| 2024 2024年浙江卷（1月）-答案版 | B | 1 | word_meaning | T3 | 4 | 2 | 3 | 1 | 4 | word_meaning题型需复核 | What does the underlined word “it” in the first paragraph refer to? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：it指代就近回溯，make it seem指代flat/apartment，指代链极短<br>你：用户判断 3-4：第一人称行文偏散，试演话题陌生，throws/毯子语境增加干扰。 |
| 2024 2024年浙江卷（1月）-答案版 | D | 4 | passage_main_idea | T5 | 8 | 4 | 4 | 4 | 5 | AI高难分 | Which of the following is the best title for the text? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：主旨题需整合marshmallow test→成人每日决策→信息消费，跨段抽象概括难度大<br>你：高质量高难标题题：需从棉花糖实验一路转到成年人日常选择，再理解背后的信息诱惑隐喻；其他标题干扰也强。 |
| 2025 2025年新课标I卷-答案版 | B | 3 | word_meaning | T3 | 4 | 2 | 3 | 2 | 2 | word_meaning题型需复核 | What does the underlined word “staggering” in paragraph 3 mean? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：上下文正面情感线索充分(diverse, touched my heart)，猜词路径清晰<br>你：猜词题目标词 staggering 本身生不生不重要；上下文正向线索充分，diverse/touched my heart 可推 Amazing。 |
| 2025 2025年新课标I卷-答案版 | B | 4 | inference_general | T6 | 6 | 3 | 4 | 3 | 3 | 抽象+强干扰 | What does the author's experience show? | Codex：干扰项有一定迷惑性<br>Claude：需从末段提炼写作意义的启示，有干扰项且需一定抽象概括，难度适中<br>你：学生可能误选 Knowledge is power；需感受到末段 students showed me something more important 是学生反过来教会老师写作意义。 |
| 2025 2025年新课标I卷-答案版 | D | 1 | writing_technique | T8 | 5 | 3 | 3 | 3 | 3 | writing_technique题型需复核 | How does the author present the issue in the first paragraph? | Codex：写作手法题考查段落呈现方式而非事实定位<br>Claude：写作手法识别题，需判断列举多地点为举例说明普遍性<br>你：赞同：写作手法题，需识别第一段用多个地点和场景举例呈现微塑料污染普遍性，而非定义或统计。 |
| 2025 2025年浙江卷（1月）-答案版 | C | 1 | word_meaning | T3 | 4 | 2 | 3 | 2 | 3 | word_meaning题型需复核 | What does the underlined word “Eschewing” in the first paragraph mean? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：Eschewing虽生僻但后文对比线索充分，可从语境推出避免之意<br>你：赞同：Eschewing 词组语境相对友好，但也不简单；需结合不用化肥/电动工具与更像自然的园艺原则推断 avoiding。 |
| 2025 2025年浙江卷（1月）-答案版 | C | 3 | adjective_summary | T10 | 8 | 4 | 4 | 4 | 4 | T10高风险边界；adjective_summary题型需复核；抽象+强干扰；AI高难分 | Which of the following best describes Piet Oudolf's gardens? | Codex：形容词压缩题需把具体描写抽象成评价词；T10 属高抽象边界，建议人工确认；干扰项有一定迷惑性<br>Claude：需综合多个修饰短语概括风格，选项间区分度低，抽象性强<br>你：tasteful 本身有词汇障碍；还需把 artistic flavors、color and form、Beautiful year-round 等整体审美描写压缩成一个形容词，学生很难自然完成。 |
| 2025 2025年浙江卷（1月）-答案版 | C | 4 | passage_main_idea | T5 | 7 | 4 | 4 | 3 | 4 | AI高难分 | Which of the following can be a suitable title for the text? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：matrix planting贯穿全文，主题明确，但需排除干扰标题<br>你：赞同：标题 WILD 以抽象义抓住 matrix planting 的自然化核心；学生未必能从 novel 感受到 future，也容易被 C 的 care、D 的 old 干扰。 |
| 2026 2026年浙江卷（1月）-题目版 | B | 27 | adjective_summary | T10 | 8 | 4 | 4 | 4 | 3 | T10高风险边界；adjective_summary题型需复核；抽象+强干扰；AI高难分 | Which of the following best describes the author as a teacher? | Codex：形容词压缩题需把具体描写抽象成评价词；T10 属高抽象边界，建议人工确认；干扰项有一定迷惑性<br>Claude：需全文综合归纳教师特质，选项形容词辨析有干扰，抽象度高<br>你：形容词压缩题，但干扰项区分度较低；Innovative 概括全文教学方式，整体中等偏上但不到4。 |
| 2026 2026年浙江卷（1月）-题目版 | C | 29 | word_meaning | T3 | 4 | 2 | 3 | 2 | 4 | word_meaning题型需复核 | What does the underlined word “glowing” in paragraph 4 mean? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度；干扰项有一定迷惑性<br>Claude：上下文positive明确对应glowing，选项区分度高，词义猜测路径短<br>你：涉及文中核心概念，需一一捋清长短、正负等对应关系；考场上不只是简单 positive=glowing。 |

## 全量表

| 优先级 | 来源 | 篇 | 题号 | surfaceType | answeringMove | T卡 | DeepSeek 10 | DeepSeek档 | Codex | Claude | 你最终 | blockers | stem | 三方备注 |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| low | 2021 2021年新课标Ⅰ卷-答案版 | B | 1 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 1 |  | What should Titterton be able to do to be a page turner? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：直接定位题，原文明确说I've learnt to read music，几乎无干扰<br>你：赞同：直接定位 I've learnt to read music，对应 Read music，干扰项弱。 |
| high | 2021 2021年新课标Ⅰ卷-答案版 | B | 2 | adjective_summary | description_to_adjective | T10 | 8 | 4 | 4 | 3 | 3 | abstraction | Which of the following best describes Titterton's job on stage? | Codex：形容词压缩题需把具体描写抽象成评价词；T10 属高抽象边界，建议人工确认<br>Claude：需综合多句归纳为一个形容词，但选项区分度尚可，4偏高，3更合理<br>你：赞同给 3：需把多个具体要求压缩为 demanding，且 demanding 本身对学生有一定词汇阻断。 |
| low | 2021 2021年新课标Ⅰ卷-答案版 | B | 3 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 3 |  | What does Titterton need to practise? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：定位不难但需区分主语Titterton练什么vs pianist练什么，有小陷阱<br>你：翻页场景本身有一定话题阻断，需理解 page turner 与 pianist 的配合及 nodding 信号。 |
| medium | 2021 2021年新课标Ⅰ卷-答案版 | B | 4 | why_did | direct_locating | T6 | 5 | 3 | 3 | 3 | 3 | distractor | Why is Ms Raspopova's husband “the worst page turner”? | Codex：干扰项有一定迷惑性<br>Claude：原因定位在引语中，需理解言外之意：沉浸音乐而忘翻页，有一定推理量<br>你：赞同：需从引语 Turn, turn! 推出丈夫太投入音乐而忘记翻页职责，C 项反向干扰。 |
| low | 2021 2021年新课标Ⅰ卷-答案版 | C | 1 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 1 |  | What was a cause of the waterfowl population decline in North America? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：原因定位题，原文明确提到wetlands dried，直接对应选项A<br>你：赞同：直接原因定位，wetlands were dried 对应 Loss of wetlands。 |
| high | 2021 2021年新课标Ⅰ卷-答案版 | C | 2 | word_meaning | context_guessing | T3 | 4 | 2 | 3 | 2 | 2 | vocab, abstraction | What does the underlined word “decimate” mean in the first paragraph? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度；词汇负荷可能影响答案路径<br>Claude：上下文线索充分：killed/dried/reducing，可推出大规模破坏之意，选项区分度尚可<br>你：赞同：目标词生，但 killed/dried/reducing 等上下文线索强。 |
| low | 2021 2021年新课标Ⅰ卷-答案版 | C | 3 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 3 |  | What is a direct result of the Act passed in 1934? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：需将duck stamp dollar与Act of 1934关联，有一步信息链接，但定位不难<br>你：用户判断 2-3：Act/1934 定位较早，但需继续读到收集钱信息，有一定负担。 |
| medium | 2021 2021年新课标Ⅰ卷-答案版 | C | 4 | passage_main_idea | coverage_test | T5 | 5 | 3 | 4 | 3 | 3 | distractor, info_span | Which of the following is a suitable title for the text? | Codex：信息跨度增加定位/整合成本；干扰项有一定迷惑性<br>Claude：主旨题需覆盖全文，标题选项间有干扰，需综合三段信息判断<br>你：赞同：标题题需覆盖全文，但 Federal Duck Stamp 主线清楚。 |
| low | 2021 2021年新课标Ⅰ卷-答案版 | D | 1 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 4 | distractor | What is a common misunderstanding of emotional intelligence? | Codex：干扰项有一定迷惑性<br>Claude：misunderstanding对应misunderstand，定位句长但关键词明确，选项D概括合理<br>你：语法和翻译负担高，makeup 难处理，话题抽象度不低，干扰项顺势干扰。 |
| medium | 2021 2021年新课标Ⅰ卷-答案版 | D | 2 | example_function | function_to_argument | T7 | 4 | 2 | 3 | 3 | 3 | abstraction | Why does the author mention “doctor” and “cheater” in paragraph 2? | Codex：例子功能题要从表层例子回到作者论点<br>Claude：例证题需从具体例子抽象到论点，doctor/cheater对比说明EI可善可恶，需推理一步<br>你：赞同：例子功能题需从 doctor/cheater 回到概念澄清，有一步抽象。 |
| high | 2021 2021年新课标Ⅰ卷-答案版 | D | 3 | attitude_tone | minimal_inference | T9 | 4 | 2 | 4 | 3 | 3 | abstraction, distractor | What is the author's attitude to the popularization of emotional intelligence? | Codex：态度题需综合语气与评价方向；干扰项有一定迷惑性<br>Claude：态度题需整合让步句run far ahead与转折more beneficial，区分favourably与其他选项<br>你：学生可能按一个正面多个负面误判态度，需处理让步转折。 |
| high | 2021 2021年新课标Ⅰ卷-答案版 | D | 4 | paragraph_main_idea | coverage_test | T5 | 4 | 2 | 4 | 2 | 2 | abstraction, distractor | What does the last paragraph mainly talk about concerning emotional intelligence? | Codex：干扰项有一定迷惑性<br>Claude：段落大意题但末段结构清晰，hope/future方向明确，概括难度不高<br>你：赞同：hope/future/study 信号明显，段落方向直接。 |
| medium | 2022 2022年新课标I-答案版 | B | 1 | example_function | function_to_argument | T7 | 4 | 2 | 3 | 2 | 3 |  | What does the author want to show by telling the arugula story? | Codex：例子功能题要从表层例子回到作者论点<br>Claude：例证题但arugula故事紧接主题句，功能明确为说明食物浪费普遍性<br>你：构词/词义与例子到论点的抽象都有负担，arugula 故事需概括为无意浪费。 |
| low | 2022 2022年新课标I-答案版 | B | 2 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 1 | 4 |  | What is a consequence of food waste according to the text? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：environmental problem原文直述，几乎零推理，直接定位即可<br>你：用户判断 3-4：moral grain 干扰强，需区分“浪费食物不道德”与“导致道德下降”，再定位 consequence。 |
| low | 2022 2022年新课标I-答案版 | B | 3 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 2 |  | What does Curtin's company do? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：公司业务直接定位，recovers food关键词与选项高度匹配<br>你：公司业务定位直接，但学生可能不熟 CEO，存在轻微身份/语境负担。 |
| low | 2022 2022年新课标I-答案版 | B | 4 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 2 |  | What does Curtin suggest people do? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：建议定位明确，not purchasing more than necessary，但需从段落中筛选<br>你：赞同：not purchasing more than necessary 对应 Buy only what is needed。 |
| low | 2022 2022年新课标I-答案版 | C | 1 | why_did | direct_locating | T2 | 2 | 1 | 1 | 1 | 2 |  | What is the purpose of the project? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：purpose题原文用to reduce loneliness直接表述，一步定位<br>你：purpose 定位直接，但 wellbeing 到 welfare 有一定词汇桥梁负担。 |
| low | 2022 2022年新课标I-答案版 | C | 2 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 2 |  | How has the project affected Ruth Xavier? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：Ruth Xavier引言直接表达感受，enjoying/useful与选项直接对应<br>你：赞同：题路简单，但 sense of achievement 有轻微词汇概括负担。 |
| high | 2022 2022年新课标I-答案版 | C | 3 | word_meaning | context_guessing | T3 | 4 | 2 | 3 | 2 | 2 |  | What do the underlined words "embark on" mean in Paragraph 7? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：embark on上下文有first to...the project，可推出"开始参与"，选项区分度足够<br>你：赞同：first to...the project 提示 begin，但部分学生不理解为什么是开始，需排除。 |
| low | 2022 2022年新课标I-答案版 | C | 4 | multi_detail_learn_from | option_backtracking | T4 | 3 | 2 | 2 | 2 | 2 |  | What can we learn about the project from the last two paragraphs? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：末两段信息整合但态度一致（welcome/happy），选项回溯即可确认<br>你：赞同：末两段 welcome/happy 支撑 well received，信息整合但方向明确。 |
| low | 2022 2022年新课标I-答案版 | D | 1 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 3 |  | Which aspect of the human speech sound does Damián Blasi's research focus on? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：直接定位Damián Blasi研究内容，信号句明确，无干扰<br>你：how and why this trend arose / led to new speech sounds 抽成 development 不明显，需从研究趋势上升到发展维度。 |
| low | 2022 2022年新课标I-答案版 | D | 2 | why_did | minimal_inference | T2 | 2 | 1 | 1 | 1 | 3 |  | Why was it difficult for ancient human adults to produce labiodentals? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：原文因果句直接对应，aligned导致难以发labiodentals，路径清晰<br>你：话题难度高，labiodentals、aligned、jaw structure 等概念会压住学生；虽有因果句但理解门槛不低。 |
| medium | 2022 2022年新课标I-答案版 | D | 3 | paragraph_main_idea | coverage_test | T5 | 5 | 3 | 3 | 3 | 3 | abstraction | What is Paragraph 5 mainly about? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：段落主旨需概括两句话：数据库证实全球语音变化+现今采集者仍无此音<br>你：赞同：段落主旨需概括数据库证据与猎采人群例证，confirmed 是提示但仍有功能概括负担。 |
| low | 2022 2022年新课标I-答案版 | D | 4 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 3 | syntax | What does Steven Moran say about the set of human speech sounds? | Codex：句法负荷可能影响定位句处理<br>Claude：引语较长但核心观点明确：语音集合非固定而是生物与文化交互产物<br>你：引语长且需把 not stable 与 complex interplay 压缩为 complex and dynamic system，不只是直接定位。 |
| low | 2023 2023年新课标Ⅰ卷-答案版 | B | 1 | multi_detail_learn_from | option_backtracking | T4 | 3 | 2 | 2 | 2 | 3 |  | What can we learn about John from the first two paragraphs? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：两段信息量不大，选项回溯即可排除，整体难度中等偏易<br>你：inquiring 有词汇门槛，需要把观察自然、wonder、asking questions 概括为好奇/探究心；long to be 与 fond of 也有词组阻碍。 |
| medium | 2023 2023年新课标Ⅰ卷-答案版 | B | 2 | why_did | direct_locating | T6 | 5 | 3 | 3 | 3 | 4 | distractor | Why did John put the sludge into the tanks? | Codex：干扰项有一定迷惑性<br>Claude：why题需理解eco-machine实验流程，sludge目的需跨句推理，有干扰项<br>你：若只定位到放污泥动作还不够，需整体理解工作流程：先建生态缸再放污泥，并回到前文处理污水的目的及后文水变清；build an ecosystem 干扰强。 |
| medium | 2023 2023年新课标Ⅰ卷-答案版 | B | 3 | example_function | function_to_argument | T7 | 5 | 3 | 3 | 3 | 3 | abstraction | What is the author's purpose in mentioning Fuzhou? | Codex：例子功能题要从表层例子回到作者论点<br>Claude：举例作用题属常见题型，需从段落结构判断论点，中等难度<br>你：赞同：Fuzhou 是例子功能题，需要从城市项目回到 John 想法的实际应用。 |
| high | 2023 2023年新课标Ⅰ卷-答案版 | B | 4 | abstract_phrase_summary | coverage_test | T10 | 8 | 4 | 4 | 4 | 2 | abstraction, info_span | What is the basis for John's work? | Codex：抽象短语压缩题需把具体信息上升为概念标签；T10 属高抽象边界，建议人工确认；信息跨度增加定位/整合成本<br>Claude：全文主旨提炼题，需贯通John从观察自然到应用的逻辑线，抽象度高<br>你：虽是抽象概括，但后文 self-repair 定位明显，self 和 repair 对学生较可识别；diverse 和 organisms 有一定干扰但不强。 |
| low | 2023 2023年新课标Ⅰ卷-答案版 | C | 1 | single_detail_normal | direct_locating | T2 | 4 | 2 | 2 | 2 | 3 | distractor | What is the book aimed at? | Codex：干扰项有一定迷惑性<br>Claude：aim定位到goal of this book句，但选项间有一定干扰需仔细比对<br>你：make the case for 阻碍，minimalism 与话题抽象度较高，C 项贴近原文干扰强。 |
| high | 2023 2023年新课标Ⅰ卷-答案版 | C | 2 | word_meaning | context_guessing | T3 | 4 | 2 | 3 | 2 | 3 | distractor | What does the underlined word “declutter” in paragraph 3 mean? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度；干扰项有一定迷惑性<br>Claude：declutter由de-+clutter构词线索加step away from语境，可推出"清理"<br>你：词组干扰较强，step away from 也是理解障碍，猜词路径不算直。 |
| low | 2023 2023年新课标Ⅰ卷-答案版 | C | 3 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 4 | distractor | What is presented in the final chapter of part one? | Codex：干扰项有一定迷惑性<br>Claude：final chapter of part one定位后，stories/strategies/traps与选项C匹配<br>你：stories/strategies/traps 不易概括为 practical examples，B/D 选项翻译和抽象理解也会干扰。 |
| low | 2023 2023年新课标Ⅰ卷-答案版 | C | 4 | single_detail_normal | direct_locating | T2 | 4 | 2 | 2 | 2 | 3 | distractor | What does the author suggest readers do with the practices offered in part two? | Codex：干扰项有一定迷惑性<br>Claude：toolbox/particular circumstances暗示选择性使用，但需理解比喻略有门槛<br>你：toolbox 与 particular circumstances 的比喻理解门槛不低，需推出按需使用。 |
| medium | 2023 2023年新课标Ⅰ卷-答案版 | D | 1 | paragraph_main_idea | coverage_test | T5 | 5 | 3 | 3 | 3 | 4 | abstraction | What is paragraph 2 of the text mainly about? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：段落主旨需归纳抽象概念(误差抵消机制)，有一定概括难度<br>你：用户判断 3-4 接近4：话题压人，underlying logic/errors cancel out 抽象，capitalizes on 短语难。 |
| low | 2023 2023年新课标Ⅰ卷-答案版 | D | 2 | single_detail_normal | direct_locating | T2 | 4 | 2 | 2 | 3 | 5 | vocab | Navajas' study found that the average accuracy could increase even if ________. | Codex：词汇负荷可能影响答案路径<br>Claude：需理解discussion条件下准确率仍提升的反直觉结论，选项干扰较强<br>你：需全面理解旧理论和新理论突出点，答案句语法与比较结构难，构词和干扰项都强。 |
| low | 2023 2023年新课标Ⅰ卷-答案版 | D | 3 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 2 |  | What did the follow-up study focus on? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：直接定位follow-up study内容，原文有明确信号词<br>你：需把具体研究内容定位为 discussion process；高难篇章压力会抬高低难题实际难度。 |
| high | 2023 2023年新课标Ⅰ卷-答案版 | D | 4 | attitude_tone | minimal_inference | T9 | 5 | 3 | 3 | 3 | 3 | vocab | What is the author's attitude toward Navajas' studies? | Codex：态度题需综合语气与评价方向；词汇负荷可能影响答案路径<br>Claude：态度题需整合limitations与enormous两端信息，选项词汇有区分度<br>你：学生可能按一个赞同三个负面排除；抓住 Although 转折和 enormous 也能做出。 |
| high | 2023 2023年浙江卷（1月）-答案版 | B | 1 | word_meaning | context_guessing | T3 | 4 | 2 | 3 | 2 | 3 |  | What do the underlined words "jump on that bandwagon" mean in the first paragraph? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：bandwagon有上下文提示(sustainable lifestyle)，选项直白易排除<br>你：jump on that bandwagon 需要把选项中的 you 回指到原文语境，学生容易做人称转换不到位并误选 C。 |
| low | 2023 2023年浙江卷（1月）-答案版 | B | 2 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 2 |  | What was the attitude of the author's father toward buying groceries with jars? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：silly一词直接表达态度，定位简单<br>你：题路直接，但 disapprove 对学生仍有一定词汇障碍，因此偏 2。 |
| medium | 2023 2023年浙江卷（1月）-答案版 | B | 3 | inference_general | minimal_inference | T6 | 4 | 2 | 3 | 2 | 3 | abstraction | What can we infer about the author? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：多处细节支持作者积极行动的推断，信息跨度不大<br>你：需要把一整段持续实践 zero waste 的行动压缩成 determined 这个性格形容词，属于轻度抽象概括。 |
| medium | 2023 2023年浙江卷（1月）-答案版 | B | 4 | passage_main_idea | coverage_test | T5 | 4 | 2 | 3 | 2 | 2 | abstraction | What is the text mainly about? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：全文围绕在不支持环境中坚持可持续生活，主旨清晰<br>你：赞同：全文主线 zero waste lifestyle 清楚，选项 C 覆盖度明显高于其他选项。 |
| medium | 2023 2023年浙江卷（1月）-答案版 | C | 1 | example_function | function_to_argument | T7 | 4 | 2 | 3 | 2 | 3 | abstraction | Why does the author mention Noa Ovadia in the first paragraph? | Codex：例子功能题要从表层例子回到作者论点<br>Claude：举例功能题，Noa Ovadia作为人类冠军被击败用以引出AI辩论话题<br>你：话题本身有轻微难度，opponent 等词有一定障碍；需从人类辩论冠军被击败的例子回到 Project Debater 的能力。 |
| high | 2023 2023年浙江卷（1月）-答案版 | C | 2 | word_meaning | context_guessing | T3 | 4 | 2 | 3 | 2 | 3 |  | What does the underlined word "wrinkles" in Paragraph 2 refer to? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：ironed out搭配提供明确语境线索，指代errors/problems<br>你：wrinkles 前后有 errors / Such 指代线索，但 ironed out 本身是阻碍，需处理短语语义和指代关系。 |
| low | 2023 2023年浙江卷（1月）-答案版 | C | 3 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 3 |  | What is Project Debater unable to do according to Hammond? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：Hammond原话直接定位，never knows what it's talking about<br>你：答案句 never knows what it's talking about 本身不难，但处在一段密集抽象概念中，学生会被周围难概念干扰。 |
| low | 2023 2023年浙江卷（1月）-答案版 | C | 4 | single_detail_normal | option_backtracking | T2 | 4 | 2 | 2 | 3 | 3 | syntax | What can we learn from the last paragraph? | Codex：句法负荷可能影响定位句处理<br>Claude：末段句式复杂(social interaction vs computation)，需准确理解抽象对比<br>你：学生可抓 interaction 做题；若完全理解 social interaction vs computation 的哲学对比会更难，但题目设计实际约为 3 分。 |
| low | 2023 2023年浙江卷（1月）-答案版 | D | 1 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 2 |  | What do solar developers often ignore? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：haven't given much thought to what they put under them直接对应答案<br>你：不是纯低难细节题，需要把 developers ignore what they put under panels 提取成安装太阳能板的负面环境影响。 |
| low | 2023 2023年浙江卷（1月）-答案版 | D | 2 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 2 |  | What does InSPIRE aim to do? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：InSPIRE目标句紧跟其名称出现，直接定位<br>你：low-impact / kinder to the land 到 environmentally friendly 有概括转换，题路清楚但不应压到 1。 |
| low | 2023 2023年浙江卷（1月）-答案版 | D | 3 | why_did | direct_locating | T2 | 4 | 2 | 2 | 2 | 2 |  | What is the purpose of the laws mentioned in Paragraph 4? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：laws与pollinator habitat protection并列，目的需小幅推断<br>你：赞同：pollinator habitat protection 与 pesticide use 可概括为保护传粉昆虫，存在轻微目的提取。 |
| high | 2023 2023年浙江卷（1月）-答案版 | D | 4 | passage_main_idea | coverage_test | T5 | 6 | 3 | 4 | 3 | 3 | abstraction, distractor | Which of the following is the best title for the text? | Codex：干扰项有一定迷惑性<br>Claude：标题需整合solar farms与pollinators双主线，选项有干扰<br>你：赞同：标题题需整合 solar farms、low-impact development 和 pollinator-friendly 转向；D 覆盖最好但有一定抽象概括。 |
| high | 2024 2024年新课标Ⅰ卷-答案版 | C | 1 | word_meaning | context_guessing | T3 | 4 | 2 | 3 | 2 | 3 | syntax | What does the underlined phrase “shine through” in paragraph 2 mean? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度；句法负荷可能影响定位句处理<br>Claude：shine through语境明确(benefits particularly...)，选项区分度足够<br>你：赞同：证据句长且插入解释多，需抓住纸质阅读优势在复杂任务中更明显。用户指出该篇实际为 C 篇。 |
| low | 2024 2024年新课标Ⅰ卷-答案版 | C | 2 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 3 | distractor | What does the shallowing hypothesis assume? | Codex：干扰项有一定迷惑性<br>Claude：hypothesis内容紧跟定义句，但选项措辞需比对<br>你：suitable 干扰较强，lightly 的同义替换学生不易感受到。 |
| low | 2024 2024年新课标Ⅰ卷-答案版 | C | 3 | why_did | direct_locating | T2 | 2 | 1 | 1 | 1 | 2 |  | Why are audio and video increasingly used by university teachers? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：more engaging直接对应选项，因果关系显而易见<br>你：赞同：more engaging 对应 hold attention，题路直但有轻微词汇门槛。 |
| medium | 2024 2024年新课标Ⅰ卷-答案版 | C | 4 | inference_general | minimal_inference | T6 | 6 | 3 | 3 | 3 | 5 | abstraction, info_span | What does the author imply in the last paragraph? | Codex：信息跨度增加定位/整合成本<br>Claude：末段隐含推断需理解not all media are the same的深层含义，有抽象要求<br>你：证据句未直接提 print texts，需结合全文纸质阅读优势，从 all media are not the same 推出纸质文本不可完全替代；However 与 identical words 形成隐性逻辑转折。 |
| low | 2024 2024年新课标Ⅰ卷-答案版 | B | 1 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 3 |  | What do some of Farber's coworkers think of him? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：直接定位coworkers态度，laugh at对应选项，干扰小<br>你：题路直接，但学生对 odd 掌握较弱，unusual/laugh at 到 odd 的词汇桥梁抬高难度。 |
| low | 2024 2024年新课标Ⅰ卷-答案版 | B | 2 | why_did | direct_locating | T2 | 3 | 2 | 2 | 2 | 3 |  | Why did Farber decide to try acupuncture on pets? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：why题但定位句明确，worked on veterinarian→work on patients逻辑清晰<br>你：兽医话题有轻微陌生度，What worked on a veterinarian... 名词性从句不友好。 |
| medium | 2024 2024年新课标Ⅰ卷-答案版 | B | 3 | paragraph_main_idea | coverage_test | T5 | 5 | 3 | 3 | 3 | 3 | abstraction | What does paragraph 3 mainly talk about? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：段落主旨需概括两个案例共性，需抽象为疗效/成功案例，有一定概括难度<br>你：赞同；C 项 rare animal diseases 干扰较强，学生可能把病例误读成疾病例子而非疗效证据。 |
| medium | 2024 2024年新课标Ⅰ卷-答案版 | B | 4 | example_function | function_to_argument | T7 | 5 | 3 | 3 | 3 | 3 | abstraction | Why does the author mention the American Holistic Veterinary Medical Association? | Codex：例子功能题要从表层例子回到作者论点<br>Claude：例证题需理解数据增长→支撑holistic approach会流行的论点，功能推理有门槛<br>你：赞同：协会会员增长数据用于证明 Farber 关于整体医学会更流行的观点。 |
| low | 2024 2024年新课标Ⅰ卷-答案版 | D | 1 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 2 |  | What do we know about the records of species collected now? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：直接定位most records...digital records，选项对应明确<br>你：赞同：records of species collected now 直接对应 most records ... digital records，选项 B 定位清楚。 |
| low | 2024 2024年新课标Ⅰ卷-答案版 | D | 2 | single_detail_normal | direct_locating | T1 | 3 | 2 | 2 | 2 | 3 | distractor | What does Daru's study focus on? | Codex：干扰项有一定迷惑性<br>Claude：定位Daru研究焦点，observational data需与选项匹配，有轻微干扰<br>你：话题负担较明显，Daru's study focus on 的 focus 不直接体现，需要从研究对象中概括到 observational data。 |
| medium | 2024 2024年新课标Ⅰ卷-答案版 | D | 3 | single_detail_normal | direct_locating | T2 | 4 | 2 | 2 | 3 | 4 | vocab, distractor | What has led to the biases according to the study? | Codex：词汇负荷可能影响答案路径；干扰项有一定迷惑性<br>Claude：bias原因需从sampling aspects提取，vocab如bias/sampling有门槛，干扰项需排除<br>你：涉及文章重点概念 bias/sampling 的理解。原文给出例子，但例子需要综合理解才好转化为 improper way of sampling；sample/sampling 也有话题词负担。 |
| low | 2024 2024年新课标Ⅰ卷-答案版 | D | 4 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 4 | distractor | What is Daru's suggestion for biodiversity apps? | Codex：干扰项有一定迷惑性<br>Claude：建议题定位明确，inform users/lead them to对应选项D，表述直接<br>你：干扰项强，尤其 B hire experts to check the records 与原文 expert verification 高度对应，但犯了张冠李戴；正确答案需概括应用给 citizen scientists 提供指导。 |
| high | 2024 2024年浙江卷（1月）-答案版 | B | 1 | word_meaning | context_guessing | T3 | 4 | 2 | 3 | 1 | 4 |  | What does the underlined word “it” in the first paragraph refer to? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：it指代就近回溯，make it seem指代flat/apartment，指代链极短<br>你：用户判断 3-4：第一人称行文偏散，试演话题陌生，throws/毯子语境增加干扰。 |
| low | 2024 2024年浙江卷（1月）-答案版 | B | 2 | why_did | direct_locating | T2 | 2 | 1 | 1 | 1 | 3 |  | Why did the author use the telephone box in 2006? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：定位2006年事件，locked out→call获取spare key，因果链直白<br>你：学生容易继续看到 2006 的 telephone box 后回到第一段，被试演/audition 场景干扰；需定位到 locked out 后打紧急电话拿备用钥匙。 |
| low | 2024 2024年浙江卷（1月）-答案版 | B | 3 | single_detail_normal | option_backtracking | T2 | 2 | 1 | 2 | 1 | 3 |  | What do we know about the “mini community library”? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：mini community library特征直接定位，borrow/return/replace描述清晰<br>你：anyone can contribute to its collection 需要和 borrow/return/replace with another title from their own collection 建立同义转换，学生未必能自然转过去。 |
| medium | 2024 2024年浙江卷（1月）-答案版 | B | 4 | why_did | direct_locating | T6 | 5 | 3 | 3 | 2 | 3 |  | Why did the author start to use the “library”? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：why题需理解unbeatable price-point→experiment with titles，因果需一步推理<br>你：赞同：unbeatable price-point 与 discovered some great books 支撑 free excellent books；A 项 love stories 容易形成局部干扰。 |
| low | 2024 2024年浙江卷（1月）-答案版 | C | 1 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 3 | vocab | What does the project aim to do? | Codex：词汇负荷可能影响答案路径<br>Claude：项目目标定位明确，make ice crystals fall as rain before成hailstones<br>你：赞同词汇负担和话题负担：ice crystals / hailstones / cloud seeding 语境会抬高直接定位题难度。 |
| low | 2024 2024年浙江卷（1月）-答案版 | C | 2 | single_detail_normal | direct_locating | T1 | 1 | 1 | 1 | 1 | 1 |  | Who are opposed to the project? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：反对者直接定位farmers in east-central Alberta，无干扰<br>你：赞同：farmers in east-central Alberta 原词定位，几乎无转换。 |
| medium | 2024 2024年浙江卷（1月）-答案版 | C | 3 | example_function | function_to_argument | T7 | 5 | 3 | 3 | 3 | 3 | vocab, abstraction | Why does Dr. Doswell mention the tornadoes he saw in 1999? | Codex：例子功能题要从表层例子回到作者论点；词汇负荷可能影响答案路径<br>Claude：例证题需理解龙卷风案例→质疑cloud seeding安全性，功能推理+抽象概括<br>你：赞同：例子功能题，需从 tornadoes 案例回到 cloud seeding 可能有危险的论点。 |
| medium | 2024 2024年浙江卷（1月）-答案版 | C | 4 | inference_general | minimal_inference | T6 | 5 | 3 | 3 | 3 | 3 |  | What can we infer from the last paragraph? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：推断题需整合末段legal safety含义，理解监管缺失允许私人工程继续<br>你：赞同：从 relative legal safety 推出 cloud-seeding companies will continue to exist，推断短但需理解法律安全空间。 |
| low | 2024 2024年浙江卷（1月）-答案版 | D | 1 | single_detail_normal | direct_locating | T1 | 1 | 1 | 1 | 1 | 2 |  | What did the children need to do to get a second treat in Mischel's test? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：waited 15 minutes直接对应选项，信息提取无障碍<br>你：waited 15 minutes 直接对应 delay eating，但实验语境和 treat/second treat 仍有轻微理解负担，不压到 1。 |
| low | 2024 2024年浙江卷（1月）-答案版 | D | 2 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 4 | vocab | According to paragraph 3, there is a mismatch between . | Codex：词汇负荷可能影响答案路径<br>Claude：mismatch定位明确，same brains vs reshaped world，但vocab mismatch需理解<br>你：话题难度明显，定位句句法较复杂；需理解 rich food supply 与 unchanged brains 的 mismatch，理解成本不低。 |
| low | 2024 2024年浙江卷（1月）-答案版 | D | 3 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 3 | vocab | What does the author suggest readers do? | Codex：词汇负荷可能影响答案路径<br>Claude：建议定位明确，thoughtful about information consumption对应选项<br>你：selective information consumers 是对 thoughtful information consumption / resist mental junk food 的抽象转述。 |
| high | 2024 2024年浙江卷（1月）-答案版 | D | 4 | passage_main_idea | coverage_test | T5 | 8 | 4 | 4 | 4 | 5 | abstraction | Which of the following is the best title for the text? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：主旨题需整合marshmallow test→成人每日决策→信息消费，跨段抽象概括难度大<br>你：高质量高难标题题：需从棉花糖实验一路转到成年人日常选择，再理解背后的信息诱惑隐喻；其他标题干扰也强。 |
| medium | 2025 2025年新课标I卷-答案版 | B | 1 | example_function | function_to_argument | T7 | 5 | 3 | 3 | 2 | 3 |  | Who are the people mentioned at the beginning of paragraph 1? | Codex：例子功能题要从表层例子回到作者论点<br>Claude：开头人物均为学生作文角色，需读懂写作课语境，定位后不难但有理解门槛<br>你：赞同：fictional 有一定阻断，且学生必须读懂原文 created 这些人物来自学生创作，是虚构角色。 |
| low | 2025 2025年新课标I卷-答案版 | B | 2 | why_did | direct_locating | T2 | 2 | 1 | 1 | 1 | 3 |  | Why did the students perform poorly in writing their first essay? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：原文直接给出原因：writing simply didn't strike them as important，一步定位<br>你：strike them as important 对学生有门槛；原文讲重不重要，选项转换为是否有兴趣，存在抽象转述。 |
| high | 2025 2025年新课标I卷-答案版 | B | 3 | word_meaning | context_guessing | T3 | 4 | 2 | 3 | 2 | 2 |  | What does the underlined word “staggering” in paragraph 3 mean? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：上下文正面情感线索充分(diverse, touched my heart)，猜词路径清晰<br>你：猜词题目标词 staggering 本身生不生不重要；上下文正向线索充分，diverse/touched my heart 可推 Amazing。 |
| high | 2025 2025年新课标I卷-答案版 | B | 4 | inference_general | minimal_inference | T6 | 6 | 3 | 4 | 3 | 3 | distractor, abstraction | What does the author's experience show? | Codex：干扰项有一定迷惑性<br>Claude：需从末段提炼写作意义的启示，有干扰项且需一定抽象概括，难度适中<br>你：学生可能误选 Knowledge is power；需感受到末段 students showed me something more important 是学生反过来教会老师写作意义。 |
| low | 2025 2025年新课标I卷-答案版 | C | 1 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 3 |  | What phenomenon does the author point out in paragraph 1? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：第一段现象直接定位，信息明确，选项干扰弱<br>你：话题相对抽象，pedestrian mobility 也构成词汇负担；虽有直接定位，但学生需要理解城市出行方式变化这一现象。 |
| low | 2025 2025年新课标I卷-答案版 | C | 2 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 2 | 3 |  | What were the Canadian journalist and other campaigners trying to do? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：需定位Jane Jacobs身份并理解其诉求，细节略有转述负担<br>你：需要从 Jane Jacobs 与 campaigners 的诉求中提取城市宜居性，涉及跨句/多信息提取；低干扰项仍有一定迷惑。 |
| medium | 2025 2025年新课标I卷-答案版 | C | 3 | inference_general | minimal_inference | T6 | 4 | 2 | 3 | 3 | 3 | abstraction | What can be inferred about the campaigns in Australia in the late 1960s and 1970s? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：需从although转折句推断运动未成功，逻辑抽象度较高<br>你：赞同：需从 Although 转折推出 campaigns largely ineffective，是最小推断而非直接细节。 |
| medium | 2025 2025年新课标I卷-答案版 | C | 4 | passage_main_idea | coverage_test | T5 | 5 | 3 | 3 | 3 | 5 | info_span | What can be a suitable title for the text? | Codex：信息跨度增加定位/整合成本<br>Claude：全文主旨概括题，信息跨度大，需整合多段内容选标题<br>你：Why the Rush? 需要对全文散落的 rush through 线索做总结，反问式标题抽象；C 有一定干扰，B/D 也可能吸引学生误选。 |
| high | 2025 2025年新课标I卷-答案版 | D | 1 | writing_technique | rhetorical_method_identification | T8 | 5 | 3 | 3 | 3 | 3 | abstraction | How does the author present the issue in the first paragraph? | Codex：写作手法题考查段落呈现方式而非事实定位<br>Claude：写作手法识别题，需判断列举多地点为举例说明普遍性<br>你：赞同：写作手法题，需识别第一段用多个地点和场景举例呈现微塑料污染普遍性，而非定义或统计。 |
| low | 2025 2025年新课标I卷-答案版 | D | 2 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 4 | vocab | What determines the effectiveness of trapping microplastics in water? | Codex：词汇负荷可能影响答案路径<br>Claude：关键句含calcium carbonate已标注中文，定位后直接匹配<br>你：hardness 使原本不太抽象的话题变抽象，需要把 calcium carbonate 与水的硬度联系起来；C/D 干扰较好，trap 的熟词生义也有阻断。 |
| medium | 2025 2025年新课标I卷-答案版 | D | 3 | example_function | function_to_argument | T7 | 5 | 3 | 3 | 3 | 3 | abstraction | What does the author try to illustrate by mentioning bottled water in paragraph 4? | Codex：例子功能题要从表层例子回到作者论点<br>Claude：举例论证功能题，需从例子回溯到论点，有一定抽象性<br>你：主要阻断在 severity 这一抽象词；bottled water 例子需回到微塑料问题严重性的论点。 |
| low | 2025 2025年新课标I卷-答案版 | D | 4 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 4 |  | What is Gauchotte-Lindsay's suggestion about? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：人物建议直接引用，定位清晰，选项匹配简单<br>你：B possible direction for further study 与 D potential application of the findings 容易区分不清；plant 熟词生义为水处理厂，若学生把握不到会影响判断。 |
| medium | 2025 2025年浙江卷（1月）-答案版 | B | 1 | inference_general | minimal_inference | T6 | 5 | 3 | 3 | 3 | 3 | abstraction | What can be inferred about the author from the first paragraph? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：需从messed up my relationship with food推断作者曾有饮食问题，需推理<br>你：赞同：同义替换较高级，把作者对自身 relationship with food 的负面结果，转换为她对当年喂养方式不满意/批判。 |
| low | 2025 2025年浙江卷（1月）-答案版 | B | 2 | single_detail_normal | option_backtracking | T2 | 3 | 2 | 2 | 3 | 3 | distractor | Which of the following would Markey disapprove of? | Codex：干扰项有一定迷惑性<br>Claude：反向推理题需理解disapprove含义并逐项回文验证，干扰项有迷惑性<br>你：赞同：反向问法且需理解 Markey 讨论对象是 food/食物管理，不是泛泛教育或学校话题；C 项需与 worries and insecurities 对应。 |
| low | 2025 2025年浙江卷（1月）-答案版 | B | 3 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 1 |  | What should kids do according to the “Division of Responsibility”? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：概念定义后直接给出孩子职责，信息单一明确<br>你：赞同：Division of Responsibility 后直接说明孩子自己决定吃什么和吃多少，答案路径清楚。 |
| low | 2025 2025年浙江卷（1月）-答案版 | B | 4 | single_detail_normal | direct_locating | T2 | 2 | 1 | 1 | 1 | 2 |  | What does the author think of the strategies she has been following? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：作者态度句直接表达less restrictive效果好，定位简单<br>你：workable 有一定词汇/概括门槛；需把 less restrictive 后孩子做出 better decisions 概括为策略可行。 |
| high | 2025 2025年浙江卷（1月）-答案版 | C | 1 | word_meaning | context_guessing | T3 | 4 | 2 | 3 | 2 | 3 |  | What does the underlined word “Eschewing” in the first paragraph mean? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度<br>Claude：Eschewing虽生僻但后文对比线索充分，可从语境推出避免之意<br>你：赞同：Eschewing 词组语境相对友好，但也不简单；需结合不用化肥/电动工具与更像自然的园艺原则推断 avoiding。 |
| low | 2025 2025年浙江卷（1月）-答案版 | C | 2 | why_did | direct_locating | T2 | 2 | 1 | 1 | 1 | 3 |  | Why was the idea of matrix planting introduced? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：原因句was born when直接给出背景，定位即得答案<br>你：学生未必能把 matrix planting 引入背景的长句拆开，需抓住 large areas of parkland 与 minimal maintenance 的目的关系。 |
| high | 2025 2025年浙江卷（1月）-答案版 | C | 3 | adjective_summary | description_to_adjective | T10 | 8 | 4 | 4 | 4 | 4 | abstraction, distractor | Which of the following best describes Piet Oudolf's gardens? | Codex：形容词压缩题需把具体描写抽象成评价词；T10 属高抽象边界，建议人工确认；干扰项有一定迷惑性<br>Claude：需综合多个修饰短语概括风格，选项间区分度低，抽象性强<br>你：tasteful 本身有词汇障碍；还需把 artistic flavors、color and form、Beautiful year-round 等整体审美描写压缩成一个形容词，学生很难自然完成。 |
| high | 2025 2025年浙江卷（1月）-答案版 | C | 4 | passage_main_idea | coverage_test | T5 | 7 | 4 | 4 | 3 | 4 | abstraction | Which of the following can be a suitable title for the text? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：matrix planting贯穿全文，主题明确，但需排除干扰标题<br>你：赞同：标题 WILD 以抽象义抓住 matrix planting 的自然化核心；学生未必能从 novel 感受到 future，也容易被 C 的 care、D 的 old 干扰。 |
| low | 2025 2025年浙江卷（1月）-答案版 | D | 1 | why_did | direct_locating | T2 | 2 | 1 | 1 | 1 | 3 |  | What is the purpose of making new technologies genderless? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：fix this直接呼应前文性别偏见问题，定位简单<br>你：解析路径直接，但全篇技术性别化/刻板印象话题有整体难度，会给基础题升档；需把 genderless 的目的回到减少 stereotypes。 |
| low | 2025 2025年浙江卷（1月）-答案版 | D | 2 | single_detail_normal | option_backtracking | T2 | 2 | 1 | 2 | 1 | 3 |  | What were the participants probably asked to do in the study? | Codex：定位和语言负荷较低，可作为低难控制题<br>Claude：实验操作rate their attachment直接对应选项，无需推理<br>你：rate their attachment 到 respond to a survey 是不错的同义转换；受全篇话题难度影响，学生未必能顺利概括实验任务。 |
| low | 2025 2025年浙江卷（1月）-答案版 | D | 3 | why_did | direct_locating | T2 | 3 | 2 | 2 | 2 | 3 | distractor | Why is it difficult to create genderless objects? | Codex：干扰项有一定迷惑性<br>Claude：原因在于人会自动赋予性别，需理解assign a gender含义<br>你：需把 participants still assign a gender 概括为 gender is rooted in people's mind，根深蒂固这一同义转换有抽象门槛。 |
| medium | 2025 2025年浙江卷（1月）-答案版 | D | 4 | paragraph_main_idea | coverage_test | T5 | 5 | 3 | 3 | 3 | 5 | vocab, distractor | What does the last paragraph mainly talk about? | Codex：词汇负荷可能影响答案路径；干扰项有一定迷惑性<br>Claude：末段含silver lining和anthropomorphism等词汇，段意概括有干扰<br>你：高阶段落主旨：前文讲刻板印象的坏处，末段转为利用产品拟人/性别化去改变刻板印象的积极面；upside 有词汇阻断，C/D 干扰强。 |
| low | 2026 2026年浙江卷（1月）-题目版 | B | 24 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 2 | distractor | What poses a challenge to teachers according to the author? | Codex：干扰项有一定迷惑性<br>Claude：首段直接给出battling student misconceptions，定位容易但选项需对应<br>你：赞同：misconceptions / assumptions 有轻微词汇桥梁，但首段定位直接。 |
| medium | 2026 2026年浙江卷（1月）-题目版 | B | 25 | why_did | direct_locating | T6 | 5 | 3 | 3 | 2 | 4 | distractor | Why does the author bring tires into the classroom? | Codex：干扰项有一定迷惑性<br>Claude：目的句紧跟动作句，so that结构清晰，干扰项不算强，难度偏2<br>你：friction 是明显障碍词，且需从 tires/car 具象实验抽象到 scientific concept；C 项 real-life experience 也有干扰。 |
| low | 2026 2026年浙江卷（1月）-题目版 | B | 26 | single_detail_normal | direct_locating | T2 | 4 | 2 | 2 | 2 | 2 | distractor | What was the unexpected outcome of the author’s teaching method? | Codex：干扰项有一定迷惑性<br>Claude：unexpected对应But转折句，信号词明显，定位快<br>你：赞同：But 后 stronger relationships 直接对应 closer teacher-student bond，定位和转折信号清楚。 |
| high | 2026 2026年浙江卷（1月）-题目版 | B | 27 | adjective_summary | description_to_adjective | T10 | 8 | 4 | 4 | 4 | 3 | abstraction, distractor | Which of the following best describes the author as a teacher? | Codex：形容词压缩题需把具体描写抽象成评价词；T10 属高抽象边界，建议人工确认；干扰项有一定迷惑性<br>Claude：需全文综合归纳教师特质，选项形容词辨析有干扰，抽象度高<br>你：形容词压缩题，但干扰项区分度较低；Innovative 概括全文教学方式，整体中等偏上但不到4。 |
| medium | 2026 2026年浙江卷（1月）-题目版 | C | 28 | paragraph_main_idea | coverage_test | T5 | 5 | 3 | 3 | 3 | 3 | abstraction | Which aspect of the study does paragraph 2 mainly talk about? | Codex：按 AI 解析和题型初步估计，等待人工校准<br>Claude：段落含实验设计细节，需归纳为methodology/design，有一定抽象<br>你：赞同：需把实验对象、样本、真假评论组合等信息压缩为 study design，有抽象词门槛。 |
| high | 2026 2026年浙江卷（1月）-题目版 | C | 29 | word_meaning | context_guessing | T3 | 4 | 2 | 3 | 2 | 4 | distractor | What does the underlined word “glowing” in paragraph 4 mean? | Codex：猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度；干扰项有一定迷惑性<br>Claude：上下文positive明确对应glowing，选项区分度高，词义猜测路径短<br>你：涉及文中核心概念，需一一捋清长短、正负等对应关系；考场上不只是简单 positive=glowing。 |
| medium | 2026 2026年浙江卷（1月）-题目版 | C | 30 | single_detail_normal | direct_locating | T4 | 5 | 3 | 3 | 3 | 3 | vocab, info_span | What kind of review would readers most likely trust? | Codex：词汇负荷可能影响答案路径；信息跨度增加定位/整合成本<br>Claude：需整合长负面+详细信息+dispassionate三个条件，信息跨度较大<br>你：赞同：需整合 negative 与 unemotional/dispassionate 两个维度，信息拼合但路径可控。 |
| medium | 2026 2026年浙江卷（1月）-题目版 | C | 31 | inference_general | minimal_inference | T6 | 5 | 3 | 4 | 4 | 4 | syntax, abstraction | What can be inferred from the last paragraph? | Codex：句法负荷可能影响定位句处理<br>Claude：需从AI写假评论+人类识别力有限推出悲观结论，多步推理加句法复杂<br>你：赞同：从 AI 写假评论、人类识别能力有限、this is not a good sign 推出更难识别，属多步推断。 |
| low | 2026 2026年浙江卷（1月）-题目版 | D | 32 | single_detail_normal | direct_locating | T2 | 3 | 2 | 2 | 2 | 2 | distractor | What do the scientists at Salk Institute hope to achieve? | Codex：干扰项有一定迷惑性<br>Claude：optimization aims to句直接给出目标，定位明确但需理解carbon stored<br>你：赞同：目标句 aims to increase carbon stored 直接对应 keeping more carbon，话题有轻微科学负荷。 |
| low | 2026 2026年浙江卷（1月）-题目版 | D | 33 | why_did | direct_locating | T2 | 3 | 2 | 2 | 2 | 3 | distractor | Why did Pereira create SLEAP? | Codex：干扰项有一定迷惑性<br>Claude：initially designed to track animal movement，目的句直接可定位<br>你：学生容易被 SLEAP 现在用于 root growth 和最初 create/initially designed 的目的混淆，D 项张冠李戴干扰较强。 |
| low | 2026 2026年浙江卷（1月）-题目版 | D | 34 | single_detail_normal | direct_locating | T2 | 4 | 2 | 2 | 2 | 3 | distractor | What will SLEAP help the scientists do? | Codex：干扰项有一定迷惑性<br>Claude：helps scientists find genes associated with characteristics，定位清晰<br>你：定位上若学生不坚定抓 help/find genes，会被 samples、root systems、preserve genes 等话题词带偏。 |
| medium | 2026 2026年浙江卷（1月）-题目版 | D | 35 | inference_general | minimal_inference | T6 | 5 | 3 | 3 | 3 | 3 | syntax | What can be inferred from Pereira’s words? | Codex：句法负荷可能影响定位句处理<br>Claude：需理解比喻equal footing和greater than sum of parts暗示跨学科融合价值<br>你：赞同：需把 equal footing 与 greater than the sum of its parts 抽象为跨学科促进创造力，A/D 有词面干扰。 |

## 下一步

1. 基于 108 题对比 DeepSeek / Codex / Claude / 用户最终分，提取 AI 易偏差模式。
2. 把高频 override reason 沉淀为小题难度 rubric，优先处理词汇、定位、抽象和干扰项。
3. 再决定哪些规则回写 prompt，哪些放进后端难度公式。
