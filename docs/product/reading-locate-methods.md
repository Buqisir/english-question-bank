# 阅读做题心法

状态：v5 草稿（2026-11-21）。v1 和 Owner 逐条讨论后写成；v2 到 v5 按实题试做改，改了哪些见文末「版本记录」。
用途：做题时照它找定位、排除干扰项；写解析时把同一个过程写出来，就是定位行、证据和干扰项说明。
下一步改写成 `prompts/reading-choice-analysis-v1.md` 的「定位」一节。关联 BUB-255。

## 一、总原则

1. **定位就是在原文里找到能回答问题的那处同义替换。** 能直接落到答案所在的那一句，
   就落在那一句；落不到时，说清答案和定位句是什么关系（第 4 条）。
   检验：答案句里能找到题干线索的同义替换，就直接定位到它，不要先落到别句再连过去。
   三样东西各管一件事，不会冲突：
   - 定位句由题干线索决定（对象词定段，题眼定句）；
   - 答案句由正确项决定：正确项改写的是哪一句，答案就在哪一句；
   - 标志词（so、because、consequently）只告诉你往前还是往后找答案句。
   定位句和答案句是同一句最好；不是同一句，就按第 4 条写关系。
   **写着的同义替换优先于自己归纳的说法**：一个选项直接改写原文某一句，另一个要自己归纳「重点」或「规律」，
   先选前者。归纳出来的选项要逐个例子核对，有一个例外就是太宽。
   例：福建厦门 2026 年 3 月 Q26 问第 3 段 imply about hope，hope has always fueled movements for change
   直接对应 It drives progress；浙江 Z20 2026 年 5 月 Q25，the same gesture in the US to represent something
   awesome 直接对应「在美国是正面的」，而「数字俚语都靠发音」在 2333 这个例子上不成立。
2. **线索来自题干，一到两个，照真实做题思路选，不定死步骤。** 对象词（人名、地名、
   数字、专有名词）缩小范围；题眼词（why、suggest、态度、mention 等）决定找哪一种信息。
   **对象词定段，题眼定句**：两个线索落在不同句子时，以题眼落的那句为定位句。
   题眼分两种：
   - 具体题眼能定句：why、suggest、when、how many、struck him most 这类，指明要找哪种信息；
   - 泛题眼定不了句：findings、feature、learn、What do we know、true、mentioned、special、unique、
     advantage、in common、philosophy、view、belief 这类。对象词定段以后按选项回这一段核对，
     对上正确项的那句就是定位句，也就是答案句。推断题的 infer、imply 也算泛题眼。
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
   | 例子 | 定位到例子，答案是例子服务的观点 | 2024 浙江 Q30，1999 年的龙卷风为前一句的观点服务 |
   | 转折 | 定位句是预期、铺垫或让步，答案在 but、yet、however、not … but 之后 | 2025Ⅱ Q28，起初期望不高，But the opposite happened |
   | 前后文展开 | 定位句提出话题、领悟、说法或关键问题，前后一两句解释它、交代它的背景，或沿因果链推下去 | 2026Ⅰ Q30 画线词的意思在后一句；Q28 树产生 isoprene，危害在下一句；重庆巴蜀 2026 年 5 月 Q35，million-dollar question 为什么关键，看前一句以往做不出真木的力学性能 |
   | 叙事因果 | 没有标志词，原因藏在事情经过里 | 2024 浙江 Q25，被锁门外、手机在屋里 |
   | 多处合并 | 答案要把两处以上的信息合起来：计数、计算、几个对象的共同点 | 2026Ⅰ Q21 数各队场次；2024 浙江 Q22 两位演员各在一段 |

   - 关系看定位句和答案句之间；答案句内部的 but、however 不算转折。
   - 答案句用代词指回定位句（These people、This），算前后文展开；定位句用代词指向别处，才算指代回指。
   - 一道题只写一种，挑最直接的那种。两层指代（there 指图书馆，图书馆属于大教堂）算一处指代回指。
   - 多处合并时，定位句写题眼落的那一处，其余几处都列进答案。
   - 六种都不是，多半是定位错了，回头重找。
5. **几条贯穿所有题型的规律：**
   - 正确项是改写，错误项爱照抄定位句的原词。原词照搬加一点小改动，是最常见的干扰项做法。
     正确项也会用原文别处的概括词（productivity、reducing the cognitive effort），这不算照抄。
   - 转折后是重点：but、however、yet、in fact、actually、the opposite 后面常出题；
     fortunately、luckily、unfortunately、surprisingly 这类扭转局面的副词也算。
     转折前后说的得是同一个对象。However 后主语换了（厦门 Q26 从 hope 换成作者），这条不适用。
   - 人名定位后，答案在这个人的整段话里找，不一定在带人名的那句。
   - 题干说「第 N 段」，按原卷自然段数；试卷数据换页时可能把一段拆成两段。
   - 题目顺序大致同原文顺序（主旨题除外），可用来缩小定位范围。

## 二、题型心法

### 问法归哪类

| 问法 | 归类 | 怎么定位 |
|---|---|---|
| Which would the author / X agree with；Which viewpoint might X agree with | 是非 | 按选项；有人名先定到这个人的话 |
| What does the experience / story show；What does the story tell us | 推断 | 按选项；记叙文的道理多在末段感悟句 |
| What is the (main) purpose of the text；Why does the author write the text | 写作意图 | 全文，按主旨题的办法 |
| What is the purpose of paragraphs N and M；What do paragraphs N–M mainly talk about | 写作意图或主旨 | 按选项回这几段，正确项可能两半各对一段 |
| How does the author develop / support paragraph N | 写作意图 | 看这一段的论证方法：举例、对比、引用、数据、因果 |
| What is special / unique about X；What do A and B have in common | 细节 | 泛题眼，按选项；special 要排除别的对象也有的共性 |
| Why is X unique / different | 细节 | 问的是特点，不是原因；对应物常是对比结构 While、unlike |
| What is the first step；In which stage does … | 细节 | 找 First、Then、Finally 这类顺序词排出步骤 |

### 1. 细节题（Who / What / When / Where / How many）

- 定位：对象词加题眼（when 找时间，how many 找数字）。
- 对应：正确项多是原文的同义改写；原词照搬的选项要警惕。
- 数字题：先圈出原文所有数字，再看要不要算；注意 half、double、twice as many，
  百分比先看比较的基准是谁。日期题原文常给 last day、deadline，要比早晚。
  计数、计算题的答案是多处合并，证据列全参与计算的几处。
- 正确项常用上位词概括原文的具体东西（study guide、lessons → educational resources），
  细节题里这不算太宽。
- 题眼太泛（feature、findings）时，先用对象词定段，再按选项回这一段核对。
- What can we learn / What do we know about X 归这一类或是非题：答案多是原文的直接改写，
  用对象词定位，再按选项核对。
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
  虚拟条件（Without / But for）、冒号破折号、叙事先后。
- 先分清问的是原因还是目的：两者都能回答 why，选项常互换来设陷阱。选项全是 to do 时，问的是目的。
- 目的没有标志词时：问机构、项目的目的，看它在做什么、关注什么（is investigating、focuses on、
  works on、is dedicated to）；问研究里为什么做某项测量，看结果被拿来说明什么（suggesting、
  demonstrating、showing、proving that …）；问某方法为什么被采用，看 By doing 句主句的结果；
  guide sb to do … with X 这类结构，X 是工具，目的在它前面；
  问法规的目的，看它针对的问题。
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
  - 反面条件：if we're not careful、otherwise、or else，说的是不这样做的后果，建议是它的反面。
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
- 陷阱：代回不通，包括选了词典里的常用义而不是文中义、单复数或人和物对不上、
  拿附近的字面信息或全文话题词凑数。

### 5. 观点态度题（作者或人物的态度）

- 定位：作者态度看全文；人物态度用人名定位。
- 对应：带感情色彩的形容词、副词、情态动词；转折后的话；引语。
- 高考文章的作者大多支持或客观；文中提出主张的专家、研究者也一样。indifferent 几乎不会是答案。
- 带条件的肯定仍是支持：take advantage of … without sacrificing …、as long as、provided that。
  前文的担忧是条件，不是否定；态度看最后的主张句。
- 人物情绪题先锁时间点（when、while、at first、later），同一人物不同时刻的情绪常被拿来设陷阱。
- 陷阱：把人物观点当作者观点；程度不符（concerned 选成 angry）；时间点错位。

### 6. 推理判断题（infer / imply / suggest 作「暗示」讲）

- 只有 infer、imply 和表示「暗示」的 suggest 算这一类；What can we learn / What do we know 归细节或是非题。
- 定位：题干有对象词，先用对象词缩到一两段，再按选项核对；没有对象词才整篇按选项找。数据里都记按选项。
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
  末段总结、呼吁、展望。首段摆出常见看法、后面 However 推翻它，首段的作用是立靶子，
  作者要纠正的是这个看法，不是批评那个现象（厦门 Q32）。
- 全文写作目的、多段合问、论证方法这几种问法，定位见本部分开头的「问法归哪类」。
- 陷阱：选了复述例子内容的选项。

### 8. 主旨、标题、段落大意

- 定位：首段、末段、每段首句，加上反复出现的高频词。
- 对应：概括性的说法，覆盖全文或整段。
- 标题题：先用下面的太宽、太窄检验排除，剩下的才比吸引力（设问、双关、短语式）。
  四个选项是比较出来的：取覆盖最多、偏差最小的那个，不要求一字不差地盖住每一段。
  「名词：短语」式的标题，先看冒号前的主题词贴不贴，冒号后泛一点可以接受。
- 段落大意题只看那一段，先确认第 N 段是原卷哪一段；看主句的主语讲的是什么。首句是铺垫（The beginning was challenging），
  后面有转折（Fortunately）时，这段的意思在转折后。
- 陷阱：
  - **太宽**：多半用上位词扩大范围（plants 变 nature，mood 变 life 或 health，
    某项研究变 science），或加 all、every、the world。检验：它能不能拿去当另一篇
    文章的标题，能就太宽。
  - **太窄**：只盖住某一段或某个例子。最容易上当的是首段引入话题的故事，和末段的
    一条建议或结论。例：2025 新课标Ⅱ Q31 的 A「Time to Replace Houseplants」
    只盖末段一条建议。检验：它能不能盖住中间各段，不能就太窄。
  - 只说对一半。
  - 用被文章否定或排除的说法设陷阱（研究排除了「心情好」这个解释，选项却拿它当发现）。

### 9. 文体、出处、读者题（Where is the text taken from / Who is it written for）

- 对应文体特征：广告和指南（价格、时间、联系方式、祈使句）、新闻（时间、地点、具体人物）、
  科普（研究、数据、专家）、教材（讲道理、给练习）、书评影评（书名、作者前作、写作风格评价、
  stand out）、产品说明书（部件清单、操作步骤、Tip、see page 27 这种指向本册页码的提示）。
  读者看文中的 you 指谁。
- 排除时看反面特征：广告有价格、优惠和夸赞，新闻有时间、地点、人物和事件，杂志会评介或推荐产品。

### 10. 是非题（Which is true / NOT true / mentioned）

- 定位：按选项回原文逐个对。
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
| 答非所问 | 原文确实有，但回答的不是这个问题：列举项冒充「最」的那一项、复述例子的内容、别的时段的事 |
| 代回不通 | 词义指代题专用：代回原句读不通，写清代回后哪里不通 |
| 文体不符 | 文体出处题专用：写清本文有哪些特征、这个文体该有而本文没有的特征 |

一个选项同时错在两处时，写最直接的那一类。

容易归不进去的几种：
- 别的对象也有的共性冒充 special 的特点：答非所问。
- 换掉核心动作（appreciate 变 evaluate，calculate 变 adjust）、按字面理解习语（million-dollar question）：原词变形。
- 作者要纠正一个看法，选项说成批评一个现象：张冠李戴。
- 拿被文章否定或排除的说法设陷阱：正反颠倒。
- 先后顺序弄反：计算比较错。

偷换范围的写法例子：「太窄：只盖住末段一条建议，拿它作标题会把全文的身心益处缩成更换植物。」
「太宽：用 nature 替换 plants，范围超出了文章。」数据里的分类代码（scopeShift）不变，
「太宽」「太窄」写在说明开头。

## 四、怎么落到定位数据和页面上

| 题型 | 定位方式 | 页面上的定位行 |
|---|---|---|
| 细节、why、建议、词义指代、人物态度、例子作用、单段的段落作用 | 从题干（stem） | 题干词 原词 段落，或 题干词 → 原文词 段落；对应物是句子特征时加一个短说明（「祈使句表建议」「because 引出原因」） |
| 推断、是非（含 agree with）、泛题眼的细节、多段合问 | 按选项（options），有对象词先用它定段，找法一句写明定在哪段；题干有能定句的词时改从题干 | 「按选项回原文」，各选项在干扰项辨析里对原文 |
| 主旨、标题、出处、读者、作者态度、全文写作目的、论证方法 | 全文（passage） | 一句找法：「首段加末段，高频词 plant」「看文体特征：价格、联系方式」 |

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
| 动词「B 来自 A」 | result from, stem from, arise from, come from, be caused by, be attributed to, be due to |
| 名词引出 | the reason is (that), the cause is, the key is, this is because, partly because, mainly because |

**原因，答案在标志词前面**

| 类别 | 标志词 |
|---|---|
| 结果副词 | so, therefore, thus, hence, consequently, as a result, as a consequence, accordingly |
| 指回前文 | that's why, this is why, which is why, for this reason, that explains why |
| 动词「A 导致 B」 | lead to, result in, cause, bring about, give rise to, contribute to, trigger, account for, explain |
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
