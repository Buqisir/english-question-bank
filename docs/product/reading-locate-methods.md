# 阅读做题心法

状态：v10 草稿（2026-11-21）。v1 和 Owner 逐条讨论后写成；v2 到 v10 按实题试做改，改了哪些见文末「版本记录」。
用途：做题时照它找定位、排除干扰项；写解析时把同一个过程写出来，就是定位行、证据和干扰项说明。
下一步改写成 `prompts/reading-choice-analysis-v1.md` 的「定位」一节。关联 BUB-255。

出处：例子都标了卷名。写年份加全国、新课标、浙江、九省联考的是真题，写城市或联盟名的是模拟卷。
- 真题例子得出的规则和模拟卷例子得出的规则冲突时，以真题为准；
- 只从模拟卷得出的规则，不能拿来推翻真题规则；
- 题库答案有争议的题不拿来立规则，只在版本记录里记一笔。

## 一、总原则

1. **定位就是在原文里找到能回答问题的那处同义替换。** 能直接落到答案所在的那一句，
   就落在那一句；落不到时，说清答案和定位句是什么关系（第 4 条）。
   检验：答案句里能找到题干线索的同义替换，就直接定位到它，不要先落到别句再连过去。
   三样东西各管一件事，不会冲突：
   - 定位句由题干线索决定（对象词定段，题眼定句）；
   - 答案句由正确项决定：正确项改写的是哪一句，答案就在哪一句；
   - 标志词（so、because、consequently）只告诉你往前还是往后找答案句。
   定位句和答案句是同一句最好；不是同一句，就按第 4 条写关系。
   **先把定位句读完**：句子后半的破折号、冒号说明常就是答案，读完这一句再往别处找。
   夸张、玩笑的说法要还原成本意，不能因为数字对不上就排除。例：河北石家庄 2026 年 4 月 Q26 问为什么不跟美国女士打招呼，
   I walked past her without a greeting – paying a thousand euros as punishment would do!，破折号后是夸张地说
   开口说英语就得挨重罚（规定是罚两欧元），答案是怕被罚；往前去找「脑子已经转成法语」是放掉了写着的说明。
   **写着的同义替换优先于自己归纳的说法**：一个选项直接改写原文某一句，另一个要自己归纳「重点」或「规律」，
   先选前者。归纳出来的选项要逐个例子核对，有一个例外就是太宽。
   例：福建厦门 2026 年 3 月 Q26 问第 3 段 imply about hope，hope has always fueled movements for change
   直接对应 It drives progress；浙江 Z20 2026 年 5 月 Q25，the same gesture in the US to represent something
   awesome 直接对应「在美国是正面的」，而「数字俚语都靠发音」在 2333 这个例子上不成立。
   这条管细节、因果、推断和 best describes 这几类题；只有主旨、标题、段落大意比的是覆盖面，见第二部分第 8 类。
   推断题里有一个例外：选项只复述题干对象本身是什么（它的定义、组成、做法），没有回答「能推出什么」，不算写着的答案。
   例：浙江杭州三省联考 2026 年 4 月 Q35 问 What can be inferred about the integrated approach，
   It combines satellite radar with ground-based methods 只复述这个办法由什么组成；
   答案 It enables more efficient archaeological exploration，由前文传统发掘费时费力加末段 demonstrate the effectiveness 推出（只从模拟卷得出）。
   成对的形容词、名词选项要两个都成立；两个都有原文直接对应的那项先核对，对得上就不要再用「逐件核对」把它判成太窄。
   例：河南四市 2026 年 1 月 Q25 问 best describes Jiang，Skilled 对 Applying first aid skills，considerate 对
   Only after ensuring his classmate was receiving professional medical care，答案 C；自己归纳的 Responsible and selfless 是陷阱
   （这题 A 也说得通，只用来说明这条管到推断题，没有单独拿它立规则）。
   **原文写着的原因标志优先于自己的逻辑**：owe X to Y、attribute X to Y、This is because 这类标志写着时，
   答案就是标志指出的原因，标志前的 this 默认指前面整句。例：湖南长沙 2026 年 1 月 Q34 问 Why do users overestimate，
   下一句 The study owed this to the fact that large language models (LLMs) help everyone perform better，答案 A；
   自己推出「表现变好只能解释差距缩小」去选前一句的 skip critical thinking，是放掉了写着的原因。
   四个选项都没有写着的改写时，先排除另外三项的明确错误，再选归纳出来的那个
   （2024 全国甲 Q24 的 survival skill 概括 get the mother's attention and be fed）。
   三项和原文正面相反、剩下那项说得比原文弱时，照样选它：重庆 2026 年 1 月 Q32，原文说 a faulty understanding、
   the backwards logic of offsets，答案 The logic of offsets, maybe imperfect, is to be discussed。
   两句都能对上题干线索时，定位到能回答题眼的那句：2023 全国甲 Q26 问 How did Terri avoid losing the deposit，
   段首句 DIY also saves her from losing any deposit 原词更多，回答 how 的是后一句的
   cover up holes and repaint a room to avoid any charges。
2. **线索来自题干，一到两个，照真实做题思路选，不定死步骤。** 对象词（人名、地名、
   数字、专有名词）缩小范围；题眼词（why、suggest、态度、mention 等）决定找哪一种信息。
   **对象词定段，题眼定句**：两个线索落在不同句子时，以题眼落的那句为定位句。
   题眼分两种：
   - 具体题眼能定句：why、suggest、when、how many、struck him most 这类，指明要找哪种信息；
   - 泛题眼定不了句：findings、feature、learn、What do we know、true、mentioned、special、unique、
     advantage、in common、philosophy、view、belief 这类。对象词定段以后按选项回这一段核对，
     对上正确项的那句就是定位句，也就是答案句。推断题的 infer、imply 也算泛题眼；
     推断题的对象词只落在一句时例外，见第二部分第 6 类。
   - 泛题眼还有 selling point、offer、discover、find（研究发现）、agree on、share。
   - 对象词就是全文话题词（PV cells、rewriting）、定不了段时，用题目顺序（第 5 条）缩到相应几段，再按题眼或选项核对；
     态度题问的正是全文话题时，按全文看。
   - 题干里泛题眼和能定句的词同时出现时，按能定句的那个走，从题干定位。例：山西 T8 2026 年 4 月 Q34
     「What does humans' absence imply」，humans' absence 落到 humans are completely absent，
     答案在后一句 implying that …；浙江 Z20 Q24 的 unique feature … highlighted，highlighted 对上 stood out。
   例：2025 新课标Ⅱ Q23「What does the author suggest visitors do in Mevagissey?」，
   Mevagissey 找到这一节，suggest 落到祈使句「Don't leave the harbor without a
   traditional Cornish pie.」，答案就在这句。
3. **对应物可以是词，也可以是句子特征。** 词：原词复现（Magna Carta）、换了说法
   （started → opened，Ho's job → hospital teacher）。句子特征：祈使句表建议、
   because 从句表原因、to do 表目的、if 条件句表条件。
4. **答案不在定位句时，关系只有下面六种，写解析时点明是哪一种，桥接一句话说原因：**

   | 关系 | 什么样 | 例 |
   |---|---|---|
   | 指代回指 | 定位句里的代词或概括说法（it、there、this、such、the issue）指回别处，答案在被指的那里 | 2025Ⅱ Q21 there 指大教堂；2026Ⅰ Q29 if we're not careful 指回前段「照旧种原来的树」 |
   | 例子 | 定位到例子（事例、数据，也包括专家的话、书里的引语），答案是例子服务的观点 | 2024 浙江 Q30，1999 年的龙卷风为前一句的观点服务 |
   | 转折 | 定位句是预期、铺垫或让步，答案在 but、yet、however、not … but 之后；not because X 后面一句直接给真正原因，算省掉 but 的转折 | 2025Ⅱ Q28，起初期望不高，But the opposite happened；2021 浙江 1 月 Q25，The decline is not because we have all become lazy，原因在下一句 Families are pressed for time |
   | 前后文展开 | 定位句提出话题、领悟、说法或关键问题，前后一两句解释它、交代它的背景，或沿因果链推下去 | 2026Ⅰ Q30 画线词的意思在后一句；河南四市 Q28，In other words 一句复述前一句，目的 communities can prepare 在前一句；Q28 树产生 isoprene，危害在下一句；重庆巴蜀 2026 年 5 月 Q35，million-dollar question 为什么关键，看前一句以往做不出真木的力学性能 |
   | 叙事因果 | 没有标志词，原因藏在事情经过里 | 2024 浙江 Q25，被锁门外、手机在屋里 |
   | 多处合并 | 答案要把两处以上的信息合起来：计数、计算、几个对象的共同点 | 2026Ⅰ Q21 数各队场次；2024 浙江 Q22 两位演员各在一段 |

   - 关系看定位句和答案句之间；答案句内部的 but、however 不算转折。
   - 答案句用代词指回定位句（These people、This），算前后文展开；定位句用代词指向别处，才算指代回指。
   - 一道题只写一种。先问：正确项是不是少了哪一处就不完整？是，写多处合并：计数、计算、比较、几个对象的共同点、
     几处各给一半信息（辽宁沈阳 2026 年 1 月 Q24，身体累在 My lungs burned 一句，心里累在 every step … felt like a failure 一句）。
     不是，再按这个顺序取第一个说得通的：例子、转折、指代回指、叙事因果、前后文展开。
   - 这个顺序只用来给关系起名，不用来选答案。答案永远看正确项改写的是哪一句，先读完定位句（第 1 条）。
     例：2022 新课标Ⅱ Q32 问提到 rubber band 想说明什么，That's what happens to the heart 用 That 指回比方，写例子；
     2024 浙江 Q27 的 these books 指回前一句的 voluminous books on various subjects，写指代回指，不写多处合并。
   - 两层指代（there 指图书馆，图书馆属于大教堂）算一处指代回指。
   - 定位句先下判断、后文讲经过时，写前后文展开，不写叙事因果。例：浙江强基联盟 2026 年 5 月 Q26，
     But that early spring afternoon was unusual 先下判断，答案在后文 Leo 反问 "How was your day, Mom?"。
   - 表格在试卷数据里可能被拆成一格一段（舱位名一段，服务一段）。按行还原，同一行的格子算一处，不写多处合并。
   - 定位句由 So、Therefore、That's why 这类结果标志引出、原因在前一句时，写前后文展开；叙事因果只管没有标志词的。
     例：重庆南开 2026 年 4 月 Q26 问为什么提前一天送礼，定位句 So, on Nov. 12, he asked the kids to help deliver an early birthday present，
     原因在前一句 he was worried that word might get out about his surprise。
   - 多处合并只管几处彼此独立、各给一部分信息的情况。一处解释或展开另一处（概括句加后面的具体说明），
     写前后文展开；概括句后面两句各解释一半，也写前后文展开（浙江镇海 2026 年 5 月 Q29，a dangerous capability mismatch
     后面一句讲 Level 4 autonomy、一句讲 security judgment 只有 Level 2，答案 Strong autonomy and low safety assessment）；定位句的代词或概括词同时指回前面几句，写指代回指。例：湖北襄阳 2026 年 3 月 Q32 问 Why was John Hester impressed，
     定位句 "It's so amazing" 的 It 指回前两句（让 AI 写游戏、两小时后就能玩），写指代回指。
   - 多处合并时，定位句写题眼落的那一处，其余几处都列进答案。
   - 关系只在从题干定位时写。按选项或看全文时没有定位句，关系留空；答案要几处合起来，就把几处都列进答案句。
   - 六种都不是，多半是定位错了，回头重找。
5. **几条贯穿所有题型的规律：**
   - 正确项是改写，错误项爱照抄定位句的原词。原词照搬加一点小改动，是最常见的干扰项做法。
     这条只是提醒：正确项也可能几乎照抄（2022 全国甲 Q26 的 use a sense of touch），最后看意思对不对。
     正确项也会用原文别处的概括词（productivity、reducing the cognitive effort），这不算照抄。
   - 转折后是重点：but、however、yet、in fact、actually、the opposite 后面常出题；
     fortunately、luckily、unfortunately、surprisingly 这类扭转局面的副词也算。
     转折前后说的得是同一个对象。However 后主语换了（厦门 Q26 从 hope 换成作者），这条不适用。
     But 反驳的是定位句后面另一句铺垫，不是定位句本身时，关系写前后文展开；对话里人物回嘴的 But 不算转折。
     Beyond、more than、What's more 这类递进词后面也常是重点。
     While、Although 引出的让步从句，重点在主句：山东东营 2026 年 4 月 Q30 问第 4 段大意，While this isn't an entirely new connection … it
     outperforms many earlier studies，答案 Distinct strengths of the study。让步部分是实打实的反面论据、篇幅和正面相当时，选两面都盖住的选项。
     题干问 first、at first、originally 时，答案常在转折前，转折后是退而求其次的做法：2024 九省联考 Q25
     问 first response，答案是 Their first choice is to take flight，However 后的 fight 是陷阱。
   - 人名定位后，答案在这个人的整段话里找，不一定在带人名的那句。
   - 题干说「第 N 段」，按原卷自然段数；试卷数据换页时可能把一段拆成两段，也可能把两段合成一段。段号对不上时，以对象词落的那段为准。
   - 题目顺序大致同原文顺序（主旨题除外），可用来缩小定位范围。

## 二、题型心法

### 问法归哪类

归类只用下面十个名字，和后面十节的标题一一对应：细节、因果目的、建议、词义指代、态度、推断、写作意图、主旨标题、文体出处、是非。
以后按题型统计也用这十个名字。

| 问法 | 归类 | 怎么定位 |
|---|---|---|
| Which would the author / X agree with；Which viewpoint might X agree with；Which is X's idea；What does X argue about Y | 是非 | 按选项；有人名先定到这个人的话 |
| What does the experience / story show；What does the story tell us；What can we learn from X's story；Which is true of X's story（选项是谚语） | 推断 | 问的是故事的道理，按选项；首段和末段都看，首段常先点出结果（2020 新课标Ⅰ Q27，首段 That willpower bore fruit 对应 Hard work pays off） |
| Which (word) best describes X / X's job / X's relationship with … / the impact of X；What was X like，选项是一个形容词或名词 | 推断 | 按选项；有对象词先定段，回到描述 X 的几处逐件核对，只盖一两件的选项算太窄（2020 新课标Ⅰ Q30，Eventful 盖住乌兹别克斯坦一路四件事，Dangerous 只盖警察那一件）；成对的词先核对两个都有原文对应的那项（总原则第 1 条） |
| What does X reveal / indicate / prove / show；What conclusion can be drawn from X；What inspiration / lesson does X bring | 推断 | 题眼能定句：落到 proving、showing、suggesting、indicating that 那句（江西南昌 2026 年 4 月 Q34，proving that the unseen pollution secretly governed the electrical reaction） |
| Who might benefit；Which is most likely；Who is most likely to do X（把原文的研究结论套到新人物、新情境上） | 推断 | 按选项；might、most likely 表推测。套到新人物时，先从原文列出结论里的条件，再逐个人物对：福建 2026 年 M1 Q29 问谁最可能坚持 4 小时拳击课，原文 Highly hardworking and reliable individuals demonstrated strong self-discipline，答案 a disciplined teacher who seeks weight loss；「爱看拳赛」是拿常识凑的条件。原文直接写着受益、有用的对象时归细节，从题干定位（江苏苏锡常镇 2026 年 3 月 Q30，Who will benefit most according to the author，原文 the most significant benefit to people who explore the world through touch） |
| Which is an example of X；Which fits X（X 是文中下过定义的概念） | 推断 | 先找到定义句，把定义的每个条件拿去套选项 |
| How does the author view X；What is the author's view on X（X 是文中一个具体对象） | 态度 | 用对象词从题干定位，找作者表态的那句（山东青岛 2026 年 5 月 Q27，I am not to discourage ambition, but it needs a reality check，答案 It should be grounded in life）；问全文话题的态度才看全文 |
| How does the author find X，选项是「A but B」 | 态度 | 用对象词从题干定位，拿定位句里的 but 两边去对选项的两半（广东深圳 2026 年 4 月 Q26，I've walked along the Thames a hundred times, but the banks look different each time，答案 Familiar but refreshing） |
| What is the (main) purpose of the text；Why does the author write the text；What is the author trying to express | 写作意图 | 全文，按主旨题的办法。选项是 inform、persuade、entertain 这类单词时：给实用信息、网址、联系方式的是 inform，有主张和呼吁的是 persuade，讲趣事的是 entertain |
| How does the author introduce the topic；How does the text begin | 写作意图 | 看首段的引入方式：提问、故事、数据、现象、常见看法 |
| What will the author talk about next；What may follow the last paragraph；What might the author continue talking about | 推断 | 全文（passage）；看末段末句；首段预告了几点时，看正文讲到了第几点；末段列出几点风险或问题时，下文要接住全部几点，只接最后一点的算太窄 |
| What is the purpose of paragraphs N and M | 写作意图 | 按选项回这几段，正确项可能两半各对一段 |
| What do paragraphs N–M mainly talk about | 主旨标题 | 按选项回这几段，正确项可能两半各对一段 |
| How does the author / X develop / support paragraph N / his idea | 写作意图 | 看这一段的论证方法：举例、对比、类比（打比方）、引用、数据、因果；making a comparison 也常指类比（重庆南开 2026 年 5 月 Q29，nature is like an airplane, and species are the rivets） |
| What is special / unique about X；What do A and B have in common | 细节 | 泛题眼，按选项；special 要排除别的对象也有的共性 |
| Why is X unique / different | 细节 | 问的是特点，不是原因；对应物常是对比结构 While、unlike |
| What is the first step；In which stage does … | 细节 | 找 First、Then、Finally 这类顺序词排出步骤 |
| How did X manage to do | 细节 | 答案是真正起作用的那个办法或交换条件，说话、提问只是外壳（广西南宁 2026 年 4 月 Q25，她靠问「If I volunteer to go first, could I join the class?」进了班，答案是自愿第一个交作品，不是向老师提问） |
| What is the key innovation / solution；How did they solve X | 细节 | 找 overcame this by、solved、the key is 那句 |
| Which applicant best meets；Who is most likely to be chosen（条件是原文写明的招聘要求、报名规则） | 细节 | 反向核对：先列出原文写明的条件，按选项逐条对；条件要从研究结论里推出来的归推断，见上 |
| What is paragraph N mainly about；What does paragraph N mainly tell us；What phenomenon is described in paragraph N；What does the last paragraph convey | 主旨标题 | 段落大意： 只看这一段，按选项回段核对；看段首句、主句主语、转折后的话和段末总结句（2026 新课标Ⅱ Q29，段末 This is how I began my search） |
| Which will result in X；Which is against the rules | 细节 | 反向核对：从题干定位到总述规则的那句（没有总述句时，小标题也算定位处），按选项逐条对后面的规则条目，记前后文展开；附表的方向规则在这里用不上（2020 新课标Ⅰ Q23，120 词的诗违反 100 words or fewer 这条，是答案） |
| 应用文问哪一项、在哪里、怎么联系：Which program / website；Where can you …；What can sb do with X | 细节 | 先用描述定出是哪一块，再在这一块里取网址、地址、时间，记多处合并；干扰项多是别的块里确有的项目（2022 全国甲 Q22、Q23）。题眼是 only、exclusively 时，要拿别的块对照才能排除 |

### 1. 细节题（Who / What / When / Where / How many）

- 定位：对象词加题眼（when 找时间，how many 找数字）。
- 对应：正确项多是原文的同义改写；原词照搬的选项要警惕。
- 数字题：先圈出原文所有数字，再看要不要算；注意 half、double、twice as many，
  百分比先看比较的基准是谁。日期题原文常给 last day、deadline，要比早晚。
  计数、计算题的答案是多处合并，证据列全参与计算的几处。
  题干给的年份段、百分比在原文文字里找不到，先怀疑原卷有图表没给出。缺图时把握写低，再按这几步排除：
  选项里成对的数常暴露比例和基准；和原文文字里的数字一模一样的选项先怀疑，图里的数多半是另一组；
  用常识上下限排除（一年的天数不超过 365）；选项不是数字时，用图前后文字对图的概括去推。
  选项是地名、项目名，前后文字也没概括图表时，只能用常识推，把握写低，缺口里记「缺图」或「缺表」：
  山东枣庄 2026 年 5 月 Q22 问哪个区 12 小时停车最高收费最贵，收费表缺了，按常识选 Manhattan。缺的是文字清单时也照这样记。
- 正确项常用上位词概括原文的具体东西（study guide、lessons → educational resources），
  细节题里这不算太宽。
- 题眼太泛（feature、findings）时，先用对象词定段，再按选项回这一段核对。
- What can we learn / What do we know about X 归这一类或是非题：答案多是原文的直接改写，
  用对象词定位，再按选项核对。问故事的道理（learn from X's story）归推断，见「问法归哪类」。
- 顺序题（first step、second stage、after doing X）：按 First、Then、Next、Finally 排出步骤，
  分清设备自动做的事和人要做的操作；干扰项多是把后面的步骤提前。
- 题眼落在列举上（problems like A, B and C），正确项却可能改写同一句的另一部分（which 从句）；
  几处都核对，选能回答题眼的那处。
- 陷阱：张冠李戴、偷换范围（some 变 all）、时态和事实颠倒、计算比较错。

### 2. 因果、目的题（Why / What led to / What caused / What prompted / What made sb do）

- 定位：先找题干动作在原文里的说法，再按标志词判断往前还是往后找（见附表）。
- 看到 because、to do 往后找；看到 so、that's why 往前找。方向还要看主语：
  result in 与 result from、lead to 与 be caused by，主语一换，原因就换边。
- 没有标志词时看结构：分词作原因状语、独立主格、形容词短语、情感后接不定式、
  虚拟条件（Without / But for）、冒号破折号、叙事先后。原因也会藏在定语从句里人物的期待：
  湖北武汉 2026 年 5 月 Q24，To a child who wanted clear answers, this sounded almost unfair，原因是外婆的做法没有明确规则。
- 定位句是 There are several possibilities、Another explanation 这类总起句，后面并列几种原因时，
  按选项去对后面列出的各条（浙江杭州 2026 年 5 月 Q29，答案在第二种解释 grab attention instantly）。
- 原文写「不这样做会怎样」（when … eaten alone、Without these fat droplets），原因或目的就是它的反面：
  浙江强基联盟 Q29 问为什么吃羽衣甘蓝要加油，they do not dissolve well … when kale is eaten alone，答案 To get more nutrients。
- 题干带 directly、mainly、most 时，在因果链上取离结果最近的那一环：山东菏泽 2026 年 5 月 Q24 问 What directly drove Heller，
  Seeing her mother replace the water filter membranes time and again, Heller set out to find a better solution，答案 Frequent maintenance；
  读报、水污染是更早的起因。
- 并列几条原因或障碍时，More critically、Above all、Most importantly 后面的是主要的：福建泉州 2026 年 3 月 Q35 问 What prevents
  the application，More critically, farmers currently get no financial motivation，答案 Lack of economic benefit for farmers。
- 「A 改善 B」也是因果：A can improve / boost / increase B，A 就是原因（福建福州 2026 年 5 月 Q25，
  letting students choose their writing topics can improve engagement，答案 Personal choice of topics）。
- 先分清问的是原因还是目的：两者都能回答 why，选项常互换来设陷阱。选项全是 to do 时，问的是目的。
- 目的没有标志词时：问机构、项目的目的，看它在做什么、关注什么（is investigating、focuses on、
  works on、is dedicated to）；问研究里为什么做某项测量，看结果被拿来说明什么（suggesting、
  demonstrating、showing、proving that …）；问某方法为什么被采用，看 By doing 句主句的结果；
  guide sb to do … with X 这类结构，X 是工具，目的在它前面；
  问实验里雇人、用道具、某个步骤的目的，看整个实验的 To test / to see / to find out 句，常在实验经过的前面
  （2020 新课标Ⅰ Q34 雇演员，目的在前一段 To test the effect of social influence on eating habits）；
  问工具、装备的目的，看后一句拿它做什么（广西南宁 Q28，implanted transmitters 的目的在下一句
  tracked the animals' locations and activities）；
  问法规的目的，看它针对的问题；
  问研究的目的，看研究前写的待解问题（山西太原 2026 年 4 月 Q33，Yet the exact mechanisms behind it remained a mystery，
  后面研究的是 fungal genes，答案 To uncover their genetic secret）。
- 标志词的坑：
  - since、as 可表时间或方式；
  - to do 可能是宾语（decided to leave）、定语（the first to arrive），only to find 表意外结果；
  - so 可能是 so…that 的程度；
  - by doing 是方式，不是目的；
  - with、for 作介词可能表伴随或对象。

### 3. 建议、做法题（suggest / advise / recommend / What should …）

- 对应：
  - 祈使句；
  - should、ought to、must、need to、had better；
  - It's a good idea to、It's worth doing、It pays to；
  - Try to、Make sure、Be sure to、Remember to、Don't forget to、require sb to；
  - Why not / Why don't you、How about / What about、Let's；
  - I suggest、I'd recommend、My advice is、If I were you、The best way is to；
  - you can / you may / you might、we could … if we just …；
  - 陈述句表建议：X simply takes / requires / only needs Y、All it takes is；
  - 反面条件：if we're not careful、otherwise、or else，说的是不这样做的后果，建议是它的反面；
  - 反问句：do we really need …?、Why should we …?，建议是它的反面（浙江金华义乌 2026 年 5 月 Q31，
    But do we really need all the data that we produce?，答案 Stop over-storage of data）。
- 题眼还包括 advocate、call for、recommend。一段里有几处建议信号时，落在和选项改写对得上的那句。
- 题干问单数（the secret、the key、the best way），原文一句并列几条做法时，只盖一条的选项算太窄，
  选能盖住这几条、或说出它们共同目的的那个。例：河南郑州 2026 年 4 月 Q31，并列三条做法，
  答案对应段末 balance financial goals with personal well-being。
- 劝别做什么：Avoid doing、Never、Don't。
- 注意否定祈使：Q23「Don't leave … without …」是双重否定，意思是一定要，
  只看到 Don't 会选反。
- 陷阱：把原文里别人的做法当成作者的建议；建议对象被换（给家长的改成给学生的）。
- 指南类文章的建议常集中在最后一两段。

### 4. 词义猜测、指代题（画线词、短语、句子）

- 定位：画线词本身，答案几乎都在它前后一两句。
- 上下文线索：同位或解释（that is、or、破折号、括号）、对比（but、unlike、instead）、
  举例（such as、like）、因果、构词法（前缀、后缀、词根）。
- 指代：就近往前找；单复数、人和物一致；把选项代回原句读一遍。
- 画线词带 not（not oblivious to）先去掉否定再释义，再代回去核对。
- 四项都不太贴切时，先排除明确错的三项，再选剩下那项。
- 陷阱：代回不通，包括选了词典里的常用义而不是文中义、单复数或人和物对不上、
  拿附近的字面信息或全文话题词凑数。

### 5. 观点态度题（作者或人物的态度）

- 定位：作者对全文话题的态度看全文；作者对某个具体对象的态度、人物态度，用对象词或人名从题干定位。
- 对应：带感情色彩的形容词、副词、情态动词；转折后的话；引语。
- 高考文章的作者大多支持或客观；文中提出主张的专家、研究者也一样。indifferent 几乎不会是答案。
- 书评、影评常是肯定为主、再用 That said、However 指出局限，态度写成 appreciative yet critical 这类，
  不是 doubtful、opposed（福建泉州 Q31，C4 That said, the book's perspective isn't universal，答案 Appreciative yet critical）。
- 支持和客观同在选项里：作者只陈述成果和不足、没有评价词时选客观；有赞扬词、替它辩护或呼吁推广时选支持。
  例：河南四市 Q30，先写算法 quickly identified nearly two million previously hidden tiny quakes，再写 There was a drawback, however，答案 Objective。
- 带条件的肯定仍是支持：take advantage of … without sacrificing …、as long as、provided that。
  前文的担忧是条件，不是否定；态度看最后的主张句。
- 人物情绪题先锁时间点（when、while、at first、later），同一人物不同时刻的情绪常被拿来设陷阱。
- 陷阱：把人物观点当作者观点；程度不符（concerned 选成 angry）；时间点错位。

### 6. 推理判断题（infer / imply / suggest 作「暗示」讲）

- suggest 的两种意思：选项是做法（动词原形、to do）按建议题；选项是判断、结论按推断。
- 只有 infer、imply、表示「暗示」的 suggest，和「问法归哪类」里归推断的几种（故事的道理、best describes X、reveal、conclusion、might 等）算这一类；
  What can we learn / What do we know about X 归细节或是非题。
- 定位：题干的对象词只落在一句时，从题干定位到这句，答案不在这句就按总原则第 4 条写关系
  （2026Ⅰ Q28 的 Oaks and sweetgums 落到 produce huge amounts of … isoprene，危害在下一句，前后文展开）；
  对象词只能定到一两段时，按选项回这几段核对；没有对象词才整篇按选项找。
- 对应：原文的一步改写或概括，常是把具体情节概括成性格、品质或结论。
  人物品质看转折处的行为（受挫之后 Yet 仍坚持）；比较结构 more of A than B、rather than 常是推断依据。
- 陷阱：推过头（「有些人担心」变「普遍反对」）；用常识代替原文（选项本身对，但原文推不出）。

### 7. 写作意图、例子作用题（Why does the author mention X / The purpose of paragraph N）

- 定位：找到 X 出现的地方。提到某人时看他的身份同位语（冠军、专家、最……），它常点出例子的作用。
- 对应：例子为观点服务，观点通常在例子前后一句；答案是那个观点，不是例子的内容。
  这是需要桥接的典型题，桥接写「例子为前一句的观点服务」这类话。
- 例：2025 新课标Ⅱ Q30「by mentioning doctors and lawyers」，例子和观点在同一句：
  practice 前半句是「从业」，后半句是「练习」，作者借这个词把例子接到观点上。
- 段落作用：首段引出话题（提问、故事、数据、现象、一种常见看法）；中段举例、对比、让步、提出问题；
  末段总结、呼吁、展望。中段罗列数据、机构、期刊，作用常是增强可信度。首段摆出常见看法、后面 However 推翻它，首段的作用是立靶子，
  作者要纠正的是这个看法，不是批评那个现象（厦门 Q32）。
  选项里同时有方式（呈现现象、讲故事）和作用（引出话题）时，方式只盖住这一段怎么写，选作用。
  文章后半是 suggests、golden rule 这类做法时，全文目的要带上「指导」，只讲研究发现的选项算太窄。
- 全文写作目的、多段合问、论证方法这几种问法，定位见本部分开头的「问法归哪类」。
  只问一段的作用或论证方法，按选项回这一段核对。
- 陷阱：选了复述例子内容的选项。

### 8. 主旨、标题、段落大意

- 定位：首段、末段、每段首句，加上反复出现的高频词。
- 对应：概括性的说法，覆盖全文或整段。
- 标题题：先用下面的太宽、太窄检验排除，剩下的才比吸引力（设问、双关、短语式）。
  四个选项是比较出来的：取覆盖最多、偏差最小的那个，不要求一字不差地盖住每一段。
  自己判了太宽或太窄的选项就排除，不再拿来比「覆盖最多」。
  标题要带上全文的核心话题词；只呼应末段呼吁的原词、丢掉话题词的选项算太宽。
  贯穿正文的那个办法或概念拿来作标题，不算太窄。例：2021 浙江 6 月 Q27，正文讲孩子盯屏幕、
  David Bond 把自然当品牌推销给孩子、户外成习惯，答案 Market Nature to Children；
  Let Children Have Fun 只呼应末段 let them play，丢了自然和户外，盯屏幕也算 fun，太宽。
  「名词：短语」式的标题，先看冒号前的主题词贴不贴，冒号后泛一点可以接受。
  末段原词本身是全文话题的双关或比方时，话题词没有丢，不算太宽：山东济宁 2026 年 5 月 Q27，全文讲拼图，
  末段 Perhaps it was the very piece that I had failed to notice in my life，答案 The Missing Piece of My Life，piece 既是拼图块，也是生活里缺的那块。
- 段落大意题只看那一段，先确认第 N 段是原卷哪一段，按选项回这一段核对；看主句的主语讲的是什么。
  正确项要盖住整段，只改写一句的选项算太窄；「写着的改写优先」在这里不适用。段里有 known as、is called 这类命名句时，
  被命名的概念多半是这一段的中心（山东青岛 Q28，答案 An introduction of a key scientific concept，
  只改写首句的 A description of brain changes during learning 太窄）。
  选项说的是这一段在全文里的作用（背景、过渡、铺垫）时，要看它和前后段的关系。
  首句是铺垫（The beginning was challenging），后面有转折（Fortunately）时，这段的意思在转折后；
  段末有 This is how、That's why 这类总结句时，先看它。
- 陷阱：
  - **太宽**：多半用上位词扩大范围（plants 变 nature，mood 变 life 或 health，
    某项研究变 science），或加 all、every、the world。检验：它能不能拿去当另一篇
    文章的标题，能就太宽。只看检验，不看单个词是不是上位词：2024 九省联考 Q35 用 love 概括
    friendship、fondness，话题没丢，也套不到别的文章上，不算太宽。
    这条只在核心话题词还在时成立：把话题词换成更大的词（color 换成 vision），话题就丢了，算太宽。
    标题为了短常省掉 perception、the study of 这类层次词，不算原词变形；话题词齐全、意思大体对的选项优先。
    例：湖北随州 2026 年 1 月 Q35，原文说气味 affect our perception of colors，答案 The Influence of Smells on Colors；
    How Odors Shape Our Vision 把 color 换成 vision，太宽。
  - **太窄**：只盖住某一段或某个例子。最容易上当的是首段引入话题的故事，和末段的
    一条建议或结论。例：2025 新课标Ⅱ Q31 的 A「Time to Replace Houseplants」
    只盖末段一条建议。检验：它能不能盖住中间各段，不能就太窄。
  - 只说对一半。
  - 用被文章否定或排除的说法设陷阱（研究排除了「心情好」这个解释，选项却拿它当发现）。
    先看原文否定的是哪一层意思：2025 浙江 1 月 Q31 的 While matrix gardens appear wild, they are carefully planned
    否定的是「随意不规划」，不是「看起来野」；标题 The future of gardening is WILD 的 wild 指自然野趣，是正确项。

### 9. 文体、出处、读者题（Where is the text taken from / Who is it written for）

- 对应文体特征：广告和指南（价格、时间、联系方式、祈使句）、新闻（时间、地点、具体人物）、
  科普（研究、数据、专家）、教材（讲道理、给练习）、书评影评（书名、作者前作、写作风格评价、
  stand out）、产品说明书（部件清单、操作步骤、Tip、see page 27 这种指向本册页码的提示）。
  读者看文中的 you 指谁。
- 选项里没有「广告」「指南」时，选会刊登这类文字的载体（旅游杂志、报纸）。
- 排除时看反面特征：广告有价格、优惠和夸赞，新闻有时间、地点、人物和事件，杂志会评介或推荐产品。

### 10. 是非题（Which is true / NOT true / mentioned）

- 定位：按选项回原文逐个对。
- NOT 题先看题干问的是哪一层（consequences、reasons、benefits、steps），把原文里属于这一层的几处圈出来，
  再拿选项去对。四项在原文里都有对应词时，不属于这一层的那项（机制、过程、原因）是答案。
  例：浙江稽阳 2026 年 4 月 Q31 问哪项不是 biophobia 的后果，末段 that reinforcing cycle 说的是越躲越少接触的循环过程，
  后果是 thin people's relationship with the natural world、greater challenges for conservation，答案 The reinforcing cycle of less outdoor exposure。
- 陷阱：选项一半对一半错（时间对、人物错）。

## 三、干扰项怎么写

干扰项按这几类写，说明里点出是哪一类、错在哪里：

| 类别 | 说明怎么写 |
|---|---|
| 无中生有 | 原文没有提到什么 |
| 偷换范围 | **必须写明是「太宽」还是「太窄」**：太宽写清用了哪个上位词或扩大词；太窄写清只盖住哪一段或哪个例子 |
| 张冠李戴 | 原本是谁的事，被安到了谁身上；也包括时间点错位：别的时刻、别的阶段的事安到这里 |
| 原词变形 | 照搬原文的词，改了它和主语或别的词的关系；写清原文怎么说、选项改成了什么 |
| 正反颠倒 | 原文是什么方向，选项反了 |
| 因果倒置 | 原文的因和果分别是什么 |
| 程度不符 | 原文的程度词和选项的绝对词（always、never、only、all），或态度强度不对 |
| 计算比较错 | 数错、算错、比错大小或先后；写清正确的数怎么来 |
| 答非所问 | 原文确实有，但回答的不是这个问题：列举项冒充「最」的那一项、复述例子的内容 |
| 代回不通 | 词义指代题专用：代回原句读不通，写清代回后哪里不通 |
| 文体不符 | 文体出处题专用：写清本文有哪些特征、这个文体该有而本文没有的特征 |

一个选项同时错在两处时，写最直接的那一类。

容易归不进去的几种：
- 别的对象也有的共性冒充 special 的特点：答非所问。
- 换掉核心动作（appreciate 变 evaluate，calculate 变 adjust）、按字面理解习语（million-dollar question）：原词变形。
- 作者要纠正一个看法，选项说成批评一个现象：张冠李戴。
- 拿被文章否定或排除的说法设陷阱：正反颠倒。
- 时间上的三种分清：别的时刻、别的阶段的事被安到问的这一刻或原因的位置，是张冠李戴；
  同一时刻原文确有、但答的不是问的这一点，是答非所问；把先后次序本身说反，是计算比较错。
- 应用文里把别的块的项目安到问的这一块：张冠李戴；问哪一块符合要求，选了别的块：答非所问。
- 论证方法题里原文没用到的方法（下定义、分析数据、描述）：无中生有。
- 作者明确表了态，选项却是 unclear、uncertain、neutral：正反颠倒。
- 成对的形容词一半对一半错：按错的那一半归类（福州 Q27 的 Thoughtful and brave，原文没有体现 brave，写无中生有）。
- NOT 题里不选的几项是原文属实的，不硬套十一类，说明开头写「原文属实」，再引原文那句。
- 把结论套到新人物的题，人物条件和原文结论相反写正反颠倒，原文没提的条件（爱看比赛）写无中生有。

偷换范围的写法例子：「太窄：只盖住末段一条建议，拿它作标题会把全文的身心益处缩成更换植物。」
「太宽：用 nature 替换 plants，范围超出了文章。」数据里的分类代码（scopeShift）不变，
「太宽」「太窄」写在说明开头。

## 四、怎么落到定位数据和页面上

| 题型 | 定位方式 | 页面上的定位行 |
|---|---|---|
| 细节、why、建议、词义指代、人物态度、作者对具体对象的态度、例子作用、对象词落在一句的推断、reveal 和 conclusion 类推断、原文写着受益对象的 Who benefits | 从题干（stem） | 题干词 原词 段落，或 题干词 → 原文词 段落；对应物是句子特征时加一个短说明（「祈使句表建议」「because 引出原因」） |
| 推断（对象词只能定段时）、是非（含 agree with）、泛题眼的细节、多段合问、单段的段落大意、作用和论证方法 | 按选项（options），有对象词先用它定段，找法一句写明定在哪段；题干有能定句的词时改从题干 | 「按选项回原文」，各选项在干扰项辨析里对原文 |
| 主旨、标题、出处、读者、作者对全文话题的态度、全文写作目的、全文的论证方法、预测下文 | 全文（passage） | 一句找法：「首段加末段，高频词 plant」「看文体特征：价格、联系方式」 |

- 题干里用到的线索词在英文题干里加粗，定位行和原文里对应的词也加粗。
- 答案不在定位句时（总原则第 4 条六种关系之一），定位行下一行写「答案不在定位句，在前一句」
  （程序算），引文末尾一行桥接只说原因。多处合并时引文列出每一处。

目前已实现的：一个线索、词对词的对应、程序算位置、桥接。还没实现、待这一版心法试过后再改的：
- 两个线索；
- 对应物是句子特征时的短说明；
- 全文题的找法一句；
- 干扰项「太宽」「太窄」的写法要求；
- 第 4 条六种关系的名字（现在数据里只有一句桥接）；
- 干扰项新增的原词变形、计算比较错、答非所问、代回不通、文体不符，以及绝对化改名程度不符（现在代码里的分类没变）。
- 图表题：原文的表、流程图、图片选项要交给模型看，现在试做用的卷子只有文字。

## 附：因果、目的标志词

**原因，答案在标志词后面**

| 类别 | 标志词 |
|---|---|
| 连词 | because, since, as, for, now that, seeing that, given that, considering that, in that |
| 介词短语 | because of, due to, owing to, thanks to, on account of, as a result of, in view of, in light of, by virtue of |
| 介词表原因 | out of (curiosity), from (exhaustion), through (carelessness), for (joy), with (cold), at (the news), given (the cost) |
| 动词「B 来自 A」 | result from, stem from, arise from, come from, be caused by, be attributed to, be due to；owe B to A, attribute B to A, put B down to A, credit B to A（原因在 to 后面） |
| 名词引出 | the reason is (that), the cause is, the key is, this is because, partly because, mainly because |

**原因，答案在标志词前面**

| 类别 | 标志词 |
|---|---|
| 结果副词 | so, therefore, thus, hence, consequently, as a result, as a consequence, accordingly |
| 指回前文 | that's why, this is why, which is why, for this reason, that explains why |
| 动词「A 导致 B」 | lead to, result in, cause, bring about, give rise to, contribute to, trigger, account for, explain；improve, boost, increase, enhance, reduce（A 改变了 B） |
| 动词「A 促使人做 B」 | prompt, drive, push, motivate, inspire, encourage, force, persuade sb to do |
| 程度结果 | so … that, such … that |

**目的，答案几乎都在后面**

| 类别 | 标志词 |
|---|---|
| 不定式 | to do, in order to, so as to, in an effort to, in an attempt to |
| 从句 | so that, in order that, so（口语等于 so that）, in case, for fear that, lest |
| 介词短语 | for the purpose of, with the aim of, with a view to doing, in the hope of, in pursuit of, with plans to, for + 名词 |
| 动词 | aim to, intend to, mean to, seek to, try to, hope to, plan to, be designed to, be intended to, be meant to |
| 名词作表语 | the goal / purpose / aim / mission / idea is to … |
| 否定目的 | to avoid, so as not to, in order not to, prevent / keep / stop sb from doing |

**目的，答案在标志词前面**

| 类别 | 标志词 |
|---|---|
| 指回前文 | to this end, for this purpose, with this in mind, with this goal（目的在 this 指的前一两句；安徽合肥 2026 年 2 月 Q29，To this end 指回前一句改善教育效果要定期进行，答案 To enhance learning through museum visits） |

## 版本记录

**v2（2026-11-21）**，依据第 1 轮试做：2026 全国Ⅰ、2023 浙江 1 月、2025 新课标Ⅱ、2024 浙江 1 月，
各由一个子代理盲做，60 题全对；17 题答案不在定位句，其中 9 题不属于 v1 的三种情况。
- 总原则第 4 条从「只有三种」改成六种关系的表：加了转折、后文展开、多处合并，指代扩大到回指。
- 总原则第 2 条加「对象词定段，题眼定句」；第 5 条加人名看整段话、按原卷自然段数段。
- What can we learn / What do we know 从推断题移到细节或是非题；推断题有对象词先缩范围；
  删去「原文直接写着的往往不是推断题答案」（和 4 道真题冲突）。
- 干扰项加原词变形、计算比较错，绝对化改名程度不符，张冠李戴包括时间点错位。
- 补：目的题无标志词时怎么找、by doing 是方式、建议题的 require sb to 和反面条件、
  人物情绪先锁时间点、标题题先检验再比吸引力、上位词概括在细节题里不算太宽。

**v3（2026-11-21）**，依据第 2 轮试做：上面 4 份加湖南新高考联盟 2026 年 4 月联考，75 题全对；
桥接写「其他」从 9 题降到 0，干扰项写「其他」从 25 处降到 7 处（同 4 份卷）。
- 题眼分具体和泛两种：泛题眼（findings、learn 等）定不了句，按选项回段找（2025Ⅱ Q29、2026Ⅰ Q26 被硬落到别句再连过去）。
- 总原则第 1 条加检验：答案句里能对上题干或正确项的同义替换，就直接定位到它。
- 关系看定位句和答案句之间；多处合并的定位句写题眼落的那处；两层指代算一处。
- 干扰项加答非所问、代回不通（湖南 Q26、2025Ⅱ Q30、2024 浙江 Q24）。
- 转折信号加 fortunately 这类副词；段落首句是铺垫时意思在转折后（湖南 Q25）；画线词带 not 先去否定。

**v4（2026-11-21）**，依据第 3 轮试做：2026 全国Ⅰ、湖南联考、江苏南通 2026 年 5 月、安徽合肥 2026 年 4 月，58/60。
错的两题：安徽 Q22 是试卷数据缺场馆表；江苏 Q35 是心法问题（研究者带条件的肯定被当成怀疑）。
- 写明定位句、答案句、标志词各管什么（三个子代理都卡在「谁优先」）；第 1 条检验只看题干线索。
- infer、imply 算泛题眼，推断题有对象词也按选项记，第四部分的表改成一致。
- 态度题：带条件的肯定仍是支持；「大多支持或客观」也适用于文中的专家、研究者。
- 照抄限定为照抄定位句的原词；答案句用代词指回定位句算后文展开。

**v5（2026-11-21）**，依据第 4 轮试做：6 份没用过的 2026 年模拟卷（山东淄博、福建厦门、重庆巴蜀、河南郑州、
浙江 Z20、山西 T8），85/90。错的 5 题里 2 题是图表题（卷子只给了文字）；3 题是心法问题，
其中 2 题都是放掉原文写着的同义替换，去选自己归纳的「重点」或「规律」（厦门 Q26、浙江 Z20 Q25），
另 1 题是并列几条做法时选了只盖一条的选项（郑州 Q31）。
- 总原则第 1 条：写着的同义替换优先于自己归纳的说法，归纳出来的选项逐例核对。
- 转折后是重点只用于转折前后说的是同一个对象。
- 泛题眼和能定句的词同时出现时从题干定位（T8 Q34 被硬记成按选项）；泛题眼补 special、unique、advantage 等。
- 后文展开改名前后文展开，收进答案在前一句交代背景的情况。
- 第二部分开头加「问法归哪类」表（6 份卷的子代理都卡在归类上）。
- 补顺序题、单数 secret 对并列做法、立靶子式首段、书评和说明书的文体特征、陈述句表建议、目的的几种结构。
- 干扰项加第 11 类文体不符，并写明 5 种容易归不进去的情况归哪类（第 4 轮有 9 处写了「其他」）。

**v6（2026-11-21）**，依据第 5 轮试做：题库里能抓到的 37 套真题（2020 到 2026 年），523/525。
这些卷子有背题的可能，正确率只作参考；有用的是 2 道错题和子代理记下的心法缺口。2020 全国Ⅰ已审核，抓不到。
下面带真题题号的条目，都回到原卷原文核对过，规则能从原文推出标准答案。
2022 全国乙 Q28 子代理选的 A 在原文有直接对应，题库答案 B 待核实，没有拿它立规则。
- 标题题：自己判了太宽的选项就排除；标题要带全文的核心话题词，只呼应末段原词的算太宽（2021 浙江 6 月 Q27，本轮错题）。
- 统一三处自相矛盾：单段的段落大意、作用和论证方法一律按选项；推断题的对象词落在一句时从题干定位（2026Ⅰ Q28）；
  关系只在从题干定位时写。
- 几种关系都说得通时的先后顺序（12 套卷碰到）。
- 「问法归哪类」补：learn from X's story 归推断、best describes X 归推断、单段大意、反向核对题、应用文的块。
- 转折的两个例外：题干问 first 时答案在转折前（2024 九省联考 Q25）；not because X 算省掉 but 的转折（2021 浙江 1 月 Q25）。
- 照抄原词只是提醒（2022 全国甲 Q26）；被否定的说法要看否定的是哪一层（2025 浙江 1 月 Q31）。
- 实验里人员、道具的目的看 To test 句（2020 新课标Ⅰ Q34）；只有归纳项成立时可选；两句都对得上时选回答题眼的那句。

**v7（2026-11-21）**，依据第 6 轮试做：8 套没用过的 2026 年模拟卷（广东广州、河北石家庄、湖北武汉、山东青岛、辽宁沈阳、
浙江杭州、广西南宁、江西南昌），117/120。错的 3 题里 1 题是缺图（武汉 Q22 的博物馆地图）；2 题是心法问题，
都是放掉原文写着的说明：石家庄 Q26 没读完定位句破折号后的夸张说明，往前找了观点；南宁 Q25 把「提问」这个外壳当成办法。
另复查 4 套真题（2021 浙江 6 月、2026Ⅰ、2025 浙江 1 月、2024 九省联考）55/55，但 v6 里引了这几套的原题和答案，不算验证。
下面引的模拟卷例子都回原文核对过。
- 总原则第 1 条：先读完定位句，破折号、冒号后的说明常是答案；夸张说法还原本意。「写着的优先」只管细节一类。
- 第 4 条：先判断是不是多处合并，再按顺序起名；写明顺序只管起名，不管选答案（v6 的顺序可能把石家庄 Q26 引去找例子的观点）。
- 「问法归哪类」补 10 行：reveal 和 conclusion、might、套定义、作者对具体对象的态度、首段引入、预测下文、How did X manage to、
  创新和解决办法、谁最符合条件；What was X like 并入 best describes。
- 因果目的补：工具装备看后一句、定语从句里的期待、总起句后并列几种原因按选项对。
- 段落大意：正确项盖住整段，命名句的概念多半是中心；标题题太宽只看检验，近义上位词不算（2024 九省联考 Q35，真题，已核对原文）。
- 转折：But 反驳的不是定位句时写前后文展开，对话回嘴不算；递进词后也常是重点。
- 干扰项：时间上的张冠李戴、答非所问、计算比较错分清，答非所问里去掉「别的时段的事」。

**v8（2026-11-21）**，依据第 7 轮试做：8 套没用过的 2026 年模拟卷（重庆南开、福建福州、广东深圳、河南四市、湖南长沙、
江苏苏锡常镇、山西太原、浙江强基联盟），117/120。错的 3 题里 1 题是缺图（深圳 Q21）；2 题是心法问题，还是放掉原文写着的：
河南四市 Q25 把两个词都有原文对应的 Skilled and considerate 判成太窄，诱因是 v7 把「写着的优先」限成只管细节（这题答案有争议）；
长沙 Q34 认出了 owed this to 却用自己的逻辑推翻它。下面引的模拟卷例子都回原文核对过。
- 总原则第 1 条：「写着的优先」放回到因果、推断和 best describes，成对的词两个都要成立；原文写着的原因标志优先于自己的逻辑。
- 对象词就是全文话题时用题序缩范围；泛题眼补 selling point、discover、find。
- 第 4 条：In other words 复述前一句算前后文展开；先下判断、后讲经过写前后文展开；引语算例子；表格按行读。
- 「问法归哪类」补：谚语选项的 Which is true of X's story、原文写着受益对象的 Who benefits、A but B 的 How does the author find、
  inform 和 persuade 类目的、类比论证、某段描述的现象、预测下文接住末段几点、小标题、only 对照别的块。
- 因果目的补：反面条件、A improves B、研究的待解问题；附表补 owe … to 和 improve 类动词。
- 态度：支持和客观怎么分；推断：suggest 两种意思；词义：四项都不贴切先排除；写作意图：方式和作用选作用、指导类目的；
  文体：没有广告选项选载体；干扰项：一半对一半错按错的一半归类；缺图时先怀疑图表。

**v9（2026-11-21）**，依据第 8 轮试做：8 套没用过的 2026 年模拟卷（山东东营、福建泉州、湖北随州、重庆一诊、浙江金华义乌、
山东菏泽、湖北襄阳、江西赣州），117/120。v8 针对的「放掉写着的」这一轮没再出现。错的 3 题：泉州 Q21 缺图；
随州 Q34 题库答案存疑（原文 perceived a color enriched in blue as grey，按感知补偿推灰色应偏黄，答案却是偏蓝），没有拿它立规则；
随州 Q35 是心法问题，把换了上位词、丢了话题词 color 的标题当成正确项。下面引的模拟卷例子都回原文核对过。
- 标题题：近义上位词不算太宽只在核心话题词还在时成立；省掉 perception 这类层次词不算原词变形。
- 第 4 条：多处合并只管彼此独立的几处；概括加展开写前后文展开，代词指回几句写指代回指。
- 因果：directly 取最近一环；More critically 后是主要原因。建议：反问句取反面。态度：书评的肯定加局限。
- 转折：While、Although 让步句重点在主句。数字题：缺图时的四步排除。段号对不上以对象词为准。
- 总原则第 1 条：三项正面相反时，剩下那项说得弱也选它。问法表补 argue、trying to express、inspiration、do with X；泛题眼补 offer、agree on、share。
- 干扰项：没用到的论证方法写无中生有；作者明确表态时 unclear 类选项写正反颠倒。

**v10（2026-11-21）**，依据第 9 轮试做：8 套没用过的 2026 年模拟卷（安徽合肥 2 月、重庆南开 4 月、福建 M1、山东济宁、山东枣庄、
浙江杭州三省联考、浙江稽阳、浙江镇海），118/120。错的 2 题：合肥 Q21 缺图；杭州三省联考 Q35 是 v8 的副作用，
「写着的优先」管到推断题后，子代理选了只复述办法组成的选项。下面引的模拟卷例子都回原文核对过。这一版的规则都只从模拟卷得出。
- 开头加出处说明：真题和模拟卷的规则冲突时以真题为准，模拟卷规则不推翻真题，答案有争议的题不立规则。
- 总原则第 1 条：推断题里只复述题干对象本身的选项不算写着的答案。
- 第 4 条：So 类标志引出的定位句、原因在前一句，写前后文展开；概括句后两句各解释一半也写前后文展开（南开 Q26、镇海 Q29）。
- 「问法归哪类」：归类只用十个固定名字；把结论套到新人物的 Who is most likely 归推断，招聘要求类的归细节（福建 M1 Q29）。
- 标题题：末段原词是话题的双关时不算太宽（济宁 Q27）。是非题：NOT 题先按题干的层次筛（稽阳 Q31），不选的几项写「原文属实」。
- 附表加「目的，答案在标志词前面」：to this end、for this purpose（合肥 Q29）。缺图时选项是地名，用常识推、把握写低（枣庄 Q22）。
