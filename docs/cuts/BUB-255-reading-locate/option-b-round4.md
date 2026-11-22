# Option B 第四轮盲评：v21 提示词对旧版

日期：2026-11-22。提示词版本：分支提交 677152ab8（心法 v21）。只影响以后新冻结的解析，已冻结的不变。

## 结论

这一轮新版明显领先，是四轮里头一次到显著；但新版仍有少数题被两位评审一致判输，见下文。

- 两套新卷（2020 全国甲、2026 浙江 1 月，30 题），心法没引用过，前三轮和样卷改前改后页都没用过。
  两版写法不同的只有 12 题，按题把两位评审合起来：新版占优 7，旧版占优 1，一样 4，双侧符号检验 p 约 0.07。
- 第三轮的 5 套卷（65 题）用 v21 重跑，再和同一批旧版结果比。v19 有一条是看着这 5 套的输题改的，
  v20、v21 的规则没看这 5 套。两版不同的 42 题剔除 2 题后：新版占优 15，旧版占优 4，一样 21，p 约 0.02。
  第三轮同一批卷是新 11 旧 6。
- 合起来 52 题：新版占优 22，旧版占优 5，一样 25，p 约 0.003。
- 两位评审 52 题里 43 题判得一样。评审六：新 17 旧 6 一样 29；评审七：新 21 旧 4 一样 27。

## 做法

- 新版 S：提示词「定位」一节（677152ab8）。旧版 X：改之前的那一节（90c8c3fb9 时的 HEAD）；
  第三轮 5 套卷的旧版结果沿用第三轮的，两套新卷的旧版这轮新跑。
- 每套卷每版一个代理，只许读提示词、请求文件和任务说明，跑校验到 PASS，9 份全过。
- 两版写法完全相同的题不进盲评，剩 54 题。两位评审拿到同样的题，A、B 位置各自随机，只读题目文件。
- 剔除的 2 题在看判决之前定好，和第三轮相同：2021 新课标Ⅱ Q22（小标题粘在上一行），2020 全国Ⅲ Q34（引号和下一句粘连）。
- 2020 全国甲原卷有拼写问题（Q28 题干 purpose 写成 pumpose，Q24 报纸名题干和原文拼法不同），两版看到的一样，没有剔除。

## 新版还输的题（两位评审都判旧版好，或一位判旧版另一位判一样）

- 2021 新课标Ⅱ Q27、2020 浙江 1 月 Q27：旧版用题干说法的同义替换一步落到答案句（send back → time for them to go，
  special → unique），新版先落到人名句再桥接，多绕一步。v19 那条「人名、地名落到一句就定在那句」在这里用过了头。
- 2023 全国乙 Q33：答案是记录「片面」，新版只截英方的 scientific reports，看不出对照，可能把学生引向干扰项。
- 2026 浙江 1 月 Q30：新版把 most likely 对到 the more likely，是字面撞词，不是同义对应。
- 2020 全国Ⅲ Q27（一位判旧版，一位判一样）：问从末段推断，新版按 v20 的新规则判按选项，评审觉得看整段更合题意。

## 逐题（只列至少一位评审判出高下的 28 题）

| 题 | 评审六 | 评审七 | 评审六理由 | 评审七理由 |
|---|---|---|---|---|
| 2020 全国甲 Q22 | 新 | 新 | A 把教练两句话合起来，knows where he is going 才是 independent 的关键依据；B 只截前半句，证据不全。 | independent 要靠教练两句话合起来推出，B 把后半句 knows where he is going 也给出并说明引语未完，A 只截前半句不够。 |
| 2020 全国甲 Q24 | 新 | 新 | A 的 the editor of 直接提示这是报纸；B 的 receptionist 本身看不出是报社，提示力弱。 | B 定位到 the editor of the Braunschve Zeitung，editor 一词直接指向报社；A 的 receptionist 句本身看不出是报纸。 |
| 2020 全国甲 Q28 | 一样 | 新 | A 的 purpose→To draw attention 对应牵强，B 的 documentary 原词定位太泛，两者答案句都能带到 raise awareness，各有短板。 | 同一句，B 标出的 To draw attention to 正对 raise awareness；A 把 purpose 硬对到 To draw attention，答案却落在 inspire action and conservation，对应得不准。 |
| 2026 浙江 1 月 Q22 | 新 | 新 | B 直接点出算出约 21 天，比 A 只说据此推算更具体。 | 两者定位相同，B 直接说明算出约 21 天，更具体。 |
| 2026 浙江 1 月 Q24 | 新 | 一样 | B 的答案句包括两种错误看法，并点明都是关于学习的看法，正对选项 B；A 只截一半。 | 同一定位句，都说明 misconceptions 的具体内容在下一句，A 答案更全，B 讲得更具体，差别不大。 |
| 2026 浙江 1 月 Q30 | 旧 | 旧 | B 的 most likely→the more likely 只是字面巧合，并非同义对应，会教错定位方法；按选项比较第4段各类评论更稳妥。 | B 把 most likely 对到 the more likely 是表面撞词（take the reader in 才对应 trust），会教学生找同形词；这题按选项比照第 3、4 段更稳。 |
| 2026 浙江 1 月 Q32 | 新 | 新 | A 用 hope to achieve→aims to 精准同义替换，一步到答案句；B 绕到前一句再靠说明转接。 | B 用 hope to achieve → aims to 直接定位到答案句；A 先定位前一句再绕回来，多走一步。 |
| 2026 浙江 1 月 Q33 | 一样 | 新 | 同一定位句同一答案，B 的 create 对应稍准，A 保留 initially 更点题，大体相当。 | 同一句，B 的答案保留 initially，正好用来排除干扰项 D（追踪根系生长）。 |
| 2026 浙江 1 月 Q35 | 旧 | 新 | A 的答案截取含 equal footing，容易把学生引向干扰项 A；B 截 create something greater，直接对应创造力。 | B 的答案包含 equal footing，并点明 them 指不同学科，跨学科这层意思讲得更清楚。 |
| 2020 全国Ⅲ Q23 | 新 | 新 | A 用 highlight→highlights 一步定到含答案的句子；B 先定到空泛的首句再转接，多绕一步。 | B 用 highlight → highlights 一步定位到含 underground cities 的句子；A 先停在介绍句，答案在下一句。 |
| 2020 全国Ⅲ Q27 | 旧 | 一样 | 题干已限定最后一段，看整段更合题意；按选项逐项核对反而没指向该段。 | 推断题，两者都不给定位句。 |
| 2020 全国Ⅲ Q32 | 新 | 新 | A 指出举例前的总起句 finding examples of human evolution in the past few thousand years，正是例子要说明的观点，切实可用。 | A 定位的正是统领后面例子的主题句，finding examples of human evolution 直接对应 new knowledge of human evolution，比只写看全段更能教方法。 |
| 2021 新课标Ⅱ Q27 | 旧 | 旧 | A 用 send back→time for them to go 的同义对应，教会学生找同义表达；B 只靠人名原词。 | A 用 send back → time for them to go 做同义对应，教学生把题干转述对回原文；B 只认人名。 |
| 2021 新课标Ⅱ Q28 | 新 | 新 | A 把定位句和第2段的 started a project 连起来，正对选项 Run a project；B 的答案截取里没有 project，学生还得自己推一步。 | 正确项是 Run a project，B 把奖金用途连到 started a project 并说明两者关系；A 的答案句里没有 project，学生仍要自己跳一步。 |
| 2021 新课标Ⅱ Q29 | 新 | 新 | B 截取了 particularly welcome 和 downgraded 两部分，更能推出 deserves greater attention。 | B 的答案保留 particularly welcome... downgraded，正是推出 deserves greater attention 的完整依据。 |
| 2021 新课标Ⅱ Q33 | 一样 | 新 | 实质相同，B 多点明 It 指机器人，差别很小。 | 两者相同，B 多点明 It 指机器人，指代链更清楚。 |
| 2021 新课标Ⅱ Q34 | 新 | 一样 | 题干 still hire cowboys 正对原文 still has each of his cowboys，A 的对应更精准，答案就在前一句。 | A 从人名起用 But 转折引出理由，B 用 still...cowboys 贴合题干，两者都能把学生带到答案。 |
| 2023 全国乙 Q22 | 新 | 新 | B 直接带到 Tan wrote a book，选项原样复现，学生能立即核实；只写按选项不如给出具体位置。 | Tan 的段落里 wrote a book 就是她独有的特点，B 直接定位到这句；A 只写按选项核对，信息较少。 |
| 2023 全国乙 Q24 | 一样 | 新 | 同一定位句，答案和说明实质相同。 | B 的答案带上 with a few of my friends，容易把学生引向干扰项 A（与其他摄影师组队）；A 只截 state parks or countryside，说明也把挑战和应对连得清楚。 |
| 2023 全国乙 Q29 | 新 | 新 | B 给出 TV programmes have helped change what people think about cooking，直接体现 influential，定位准确。 | A 用 TV programmes have helped change what people think 直接支撑 Influential，定位准确；B 不给定位句，浪费了一个现成的证据句。 |
| 2023 全国乙 Q33 | 旧 | 旧 | A 说明例子分英澳两方对照展开，点出只有一方记录，正对 one-sided；B 只截英方记录，看不出片面。 | one-sided 要靠英澳两方对照才看得出，B 点明这层对照；A 只给英方 scientific reports，反而可能把学生引向干扰项 A。 |
| 2023 全国乙 Q34 | 一样 | 新 | 同一定位句和答案，两者都讲清 that conversation 与 dialogue 的指代关系。 | B 把 that conversation 解释为双方的历史记述，和答案 History 衔接得更直接。 |
| 2020 浙江 1 月 Q21 | 新 | 新 | A 从“人人都怕她”定位，再用她的具体做法说明 strict，路径清楚可用。 | A 用人人都怕她引出后文的具体做法，能教学生按事实推断性格；B 只写按选项核对。 |
| 2020 浙江 1 月 Q22 | 新 | 新 | A 的说明点明 this feeling 指拼命借书读书的快乐，比 B 更具体。 | 两者都对，B 的说明点明是拼命借书读书时的快乐，更贴近答案 Desire to read。 |
| 2020 浙江 1 月 Q25 | 新 | 新 | B 从少用岩盐推到岩盐污染饮用水，逻辑链完整，比只写按选项更能教会学生。 | B 从使用奶酪盐水的句子出发，把少用岩盐和岩盐污染饮用水连起来，推理链具体清楚；A 只写按选项核对。 |
| 2020 浙江 1 月 Q26 | 新 | 新 | A 指向 help both cheese producers and cities，正是一举两得的依据，比只写看全文具体。 | B 定位到新旧方法对比处，找到一举几得的证据（both cheese producers and cities save money, while keeping roads safe），比只写看全文更能教学生。 |
| 2020 浙江 1 月 Q27 | 旧 | 旧 | A 用 special→unique 精准同义替换，答案就在句内；B 定位到人名句再转接，多绕一步。 | A 用 special → unique 一步到答案句；B 先停在描述研究过程的句子，再绕到下一段。 |
| 2022 浙江 1 月 Q25 | 新 | 新 | one man's lifetime 推不出19世纪，B 把它连到第4段电力革命发生在19世纪，推理才完整；A 误称答案在定位句。 | 要推出主要生活在 19 世纪，必须把 one man's lifetime 和第 4 段的 19th century 连起来，A 讲清了这一步；B 只给 during one man's lifetime，推不出答案。 |
