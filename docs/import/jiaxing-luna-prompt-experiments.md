# 嘉兴题组 Luna 提示词实验

状态：本地实验进行中；不是生产提示词切换或卷面验收记录。只保存问题与规则，
不复制全文材料。Owner 已要求停止 usage 查询；这里只记录时间与质量。

## 实验边界

- Import Project，Low 路由、fast；路由名称不能独立证明具体 reasoning effort。
- 每组隔离输入、权威答案、原题型合同、完整教学附录 schema 和共享教学规范。
- 保留初稿，正式校验与教学审读分别记录；JSON 可解析、自检通过不等于验收。
- 父线程指出错误后修正，不能计为模型自主发现错误；新规则需另题复测。
- 不为通过校验改答案、枚举或源文；源材料异常单列，不让模型静默修复。

## 阅读阶段已观察到的问题

- 阅读B：习语不能照字面排除；没有文本依据时不要编造误选动机。
  slower 与 simplify 不能仅凭方向感判成反义；未获支持不等于相反。
- 阅读A：entityMismatch 需要不同实体或实际语义角色变换；同一对象的
  可选/必需变化不属于对象偷换。提前购买与当天购买的适用条件不同，不能
  误判为事件先后颠倒。
- 一次未告知具体错题的窄标签自查，正确修正了阅读A第22题C项；这只支持
  该样本的“标签与解释一致性”自查，不证明全题型自审可靠。
- 阅读数字范围曾由程序修复；不能把修复后 PASS 记为原稿一次通过。

## 完形：首稿与一次修订均未通过正式校验

线程：https://ampcode.com/threads/T-01a0a8c8-55fe-71d5-9d8e-0ed1a4e6a93c

- request SHA256：`fd7af244c42b3657f630166d8d4cfc7cf527384a4c83cd893a041cdfcbb0ee09`。
- 原稿 SHA256：`d5f7a2a140417d778e9ff450759b66a4c6115245d85ede4c81663b07e305fa89`，66608 bytes；父线程核对一致。
- 子线程报告环境准备41秒；生成/自查：2026-09-16 05:58:39–06:09:53 UTC，11分14秒。
- 正式命令：`node scripts/import-pipeline/validate-analysis.mjs .scratch/grok-single-group/request-cloze-experiment.json .scratch/grok-single-group/luna-cloze-draft.json`。
- FAIL：`teachingContent.annotations/30.translationRanges/0/0: invalid Unicode code-point range`。

| 实际问题 | 候选提示词修正 | 当前证据/限制 |
| --- | --- | --- |
| 长难句译文范围疑似使用全文坐标 | 按 schema 对指定段落计算 Unicode 码点坐标，不混用全文坐标 | 正式 gate 已拦截；修订待验 |
| 引文各自可定位，但中英不是同一内容 | 先确认中英意义对应，再计算范围；不把“切片存在”当作语义对齐 | Q45、48、55 人工发现；仅坐标检查抓不到 |
| 证据只截空旁功能词，区分不了选项 | 搭配证据与决定答案的上下文可分别保留，不用功能词代替决定性线索 | 需检查修订是否补证据而非堆文字 |
| 末句 letter 误译为一封信 | 多义词按全文书法活动判义，检查译文是否凭空增加事件 | 父线程指出；不是自主纠错 |
| 错项以时态/通用句型硬排除，或编造搭配释义 | 说明本句情境为何不支持；语法上可用不要说语法不成立 | Q43、48、50 局部修订待验 |
| 长难句主句和宾语从句骨架混写 | 主句与从句分层还原主谓/系表，再解释关系 | 待复测 |

源材料另有开头 OCR/提取残片。它已存在于 request，初稿保留它不是模型
凭空生成；正式导入前需在源材料阶段核实修正。本实验不偷偷更换输入。

修订稿67123 bytes，SHA256
`30b0d8c10d6b56063324ea2d2ae81fa2d38b42b2438ee763fac58360195dc6a4`，父线程核对一致。
修订报告区间06:11:18–06:17:47 UTC，6分29秒；首稿与修订区间合计17分43秒，
不包含父线程审读或交接，不等于端到端耗时。

同一正式命令改用 `luna-cloze-revised.json` 仍 FAIL：
`teachingContent.annotations/8.sourceRanges/0/0/quote: does not match the exact text range`。
具体是Q45改用前段的 difficult，却仍绑定第3段 paragraphId。不能只在某一段
找到引文后填数字而不核对段落身份。

内容上 letter 判义与第二长难句分层已修正，但Q48-C旧的通用句型排除理由
仍未改；Q43-D用包含待选 attending 的并列列表解释为何不能选 recommending，
存在循环论证；多处 evidence.relation 新增“英文与中文对应”说明，偏离解题
证据本身。候选规则应明确：对齐只写在定位字段，讲解仍解释原文为何支持答案，
不能把反馈任务本身写进学生讲解。

本轮停止继续返工，保留失败文件；不宣称完形合格，也不升级模型或放宽校验。
这些规则尚未写入生产提示词。下一次应测试可泛化的短规则，而不是再增加本卷
答案专用指令；如做Terra对照，需固定输入与相同提示词，并分别比较机械与语义错误。

## 语法填空：首稿失败，定点修订正式校验通过

线程：https://ampcode.com/threads/T-01a0a8c8-60da-7048-8003-be2dab69a82c

request SHA256：`94e29221b4c8ab304877802f538236bfbc050c2d69006c6d4b78df3ef4702435`。
原稿 SHA256：`98bb13c1990abe328cde650b3f47c56e2c3e92004146c4e5fdbda37fae1d1b39`，
43138 bytes；父线程核对一致。子线程报告安装脚本12秒；生成/自查
2026-09-16 06:01:24–06:10:59 UTC，9分35秒。安装结束至生成开始的间隔
不隐含计入脚本耗时或生成耗时。

正式命令：`node scripts/import-pipeline/validate-analysis.mjs .scratch/grok-single-group/request-grammar-experiment.json .scratch/grok-single-group/luna-grammar-draft.json`。
FAIL：`teachingContent.annotations/6.sourceRanges/0/0/quote: does not match the exact text range`。

| 实际问题 | 候选提示词修正 | 当前证据/限制 |
| --- | --- | --- |
| 引文与切片不一致 | 对指定段落逐项检查 quote 等于切片，而非仅存在 | 正式 gate 拦截；要求同步检查下划线 |
| Q57 将 increasing 标为动词转副词 | 分类从题面实际提示词及其词性出发，不倒退到其词源动词 | 应复核 adjective-to-adverb；修订待验 |
| Q63 将 half the 泛化为必接复数 | 区分本题语境和普遍规则；用全球多个国家这一集合说明复数 | half the 也能接单数或不可数，不能只凭结构排除 |
| Q56 只说表状态所以用现在分词 | 补出动作与逻辑主语的主动关系，再判断分词形式 | 定点补充，避免展开无关语法课 |
| 精选句漏掉关键结构关系 | 补祈使句与后句关系、with 修饰对象、末尾分词逻辑主语 | 不为此重写整组 |

修订稿44144 bytes，SHA256
`4fc7f3adba44d024e7aad52910e1cf4fdcaca7062f6172944d55395978731a82`，父线程核对一致。
子线程按文件创建/最终检查记录修订时间06:13:42–06:16:45 UTC，3分03秒，
不代表包含全部读反馈时间。首稿与该修订区间合计12分38秒，不等于端到端耗时。

父线程运行同一正式命令，结果文件换为 `luna-grammar-revised.json`：
`PASS grammar: formal single-group validation; no files written; derived grammar fields checked on an in-memory copy`。
完整递归差异检查确认：非坐标改动仅涉及56/57/63的讲解、证据、57分类/route，
及两句结构讲解；所有数值坐标改动均在 annotations。答案、全文译文、源文和
下划线未改。此前怀疑下划线偏移未被正式检查证实，不能作为已确认错误。

指定问题已修复；57的 adjective-to-adverb/modify-predicate 组合通过正式合同，
63的逐空解释已消除“half the 一律复数”的泛化。仍有小的表达问题：第一句
“队伍主动地蜿蜒”较生硬，应理解为语法主动关系而非有意行动；第二长难句
仍简写“half the 后接复数”，结合本句可理解，但通用规则不宜照搬该句。
不为这些小措辞开启额外重写。本样本支持“定点反馈后能修正”，不证明无反馈
首稿或其他语法题可靠；候选提示词尚未在新样本复测。确定性答案形式由程序
派生，标签、理由和教学解释仍需语义审读。

## Terra 同提示词对照：语法首稿正式校验通过，教学仍有问题

Owner 将 Low 路由改为 Terra Max 后，仍以 Low＋fast 启动两组；没有查询usage，
故模型/effort按Owner配置记录，不声称已独立核实。初始任务提示词逐字复用，
request字节相同，不提供Luna错题或反馈。环境恢复指令提前下达，环境耗时单列。

语法线程：https://ampcode.com/threads/T-01a0a8e3-76ee-73f4-b876-509f686368d4
完形线程：https://ampcode.com/threads/T-01a0a8e3-69fe-757a-8b31-83c47b35234f

语法原稿44721 bytes，SHA256
`74eeb53055f35f6d6e53ea5bac1039b8b07b6cd3dfe5515714e2a192727af786`，已核对。
子线程报告环境06:26:39–06:26:58 UTC；生成06:27:15–06:31:55，4分40秒，
比Luna同组首稿9分35秒少5分以内（准确少4分55秒，约51%）。正式命令使用
同一request与 `terra-grammar-draft.json`，得到 `PASS grammar`。

审读发现：
- 57提示词词性正确标为 adjective-to-adverb，比Luna首稿好；但仍仅凭
  worldwide 前的位置选择副词修饰副词路线。该趋势更适合结合 drawing crowds
  解释，不能把相邻位置当唯一依据。
- 56选后置定语而非Luna的宾补。find 后的 -ing 结构需要辨别名词内部修饰与
  宾语状态补足；“已有宾语，所以后面是定语”不足以排除宾补。先记为分析与
  路线待复核，不把所有可作后置修饰的 -ing 一概判错。
- 63虽先提全球多个国家，仍写数量短语后面“要用可数名词复数”，保留了与Luna
  类似的过度概括；长难句也重复该表述。
- 57 annotation 原文选 worldwide，译文却选日益受到欢迎；60原文选时间段，
  译文却选一直是世界工厂。坐标合法不意味着中英选段意义对应。

结论：本样本首稿速度和机械正确性优于Luna，不能据此称教学完全合格。
暂不发修订，先保留公平的首稿比较，等待完形结果；未改生产提示词。

## Terra 完形首稿：更快，部分讲解改善，正式校验仍失败

原稿66145 bytes，SHA256
`479442fd24ac98211d1e16346a90965eafa12b42fc1fb9b55b1284e30f404137`，父线程核对一致。
报告环境35秒，生成06:27:20–06:33:48 UTC，6分28秒；比Luna同组首稿
11分14秒少4分46秒，约42%。同一正式命令使用 `terra-cloze-draft.json`，
FAIL：`teachingContent.annotations/6.translationRanges/0/0: invalid Unicode code-point range`。
Q44译文range仍使用121–133这样的全文位置，绑定的却是第3段局部文本。

相对Luna首稿的优点：letter按字母理解；Q43推荐项按学习者角色及事件解释，
没有用进行时硬排除；Q48 reason按适合材料/行为原因辨析；Q50不再编造
clear my image等固定搭配释义。第二长难句也先区分主句与宾语从句。

仍需修正的语义问题：
- Q49-B没有把选项 got around 与空后 to 合起来解释 get around to
  （终于抽空/开始做），只给绕开、走动等释义。Luna此处反而注意到了to。
- Q48-D声称没有被替换对象，漏看for calligraphy；应解释替代书法与把诗歌
  用作书法材料的区别，不能断言缺宾语。
- Q46-C把“听起来容易”预先塞进尚未填空的 make it sound so 框架，证据循环；
  Q54-D说 explain 需要说明给谁听或什么原因，不能据此排除解释某个行为。
- Q45英文选自我怀疑问句，中文却只选焦虑；Q52英文选笔纸两端，中文只选摩擦；
  Q55英文选自我修复，中文只选过程中。中英片段意义仍未对齐。
- 首稿译文自行省略输入开头残片。该片段确实是源材料异常，但正式导入时
  不能把模型静默省略当成已完成源材料核实。

没有发送第二轮反馈。本轮两模型各两个首稿仅是小样本：Terra均更快，语法
机械校验更好；完形内容有改善也有退步，不能宣称全面优胜或无审读可用。
下轮提示词候选保持短小：选项代回完整结构；局部判断不冒充通用规则；中英
引文同义对齐；定位按明确paragraphId局部计算。先另样本验证，再考虑生产采用。

## Luna 职责拆分实验：A已回收，B首次走错执行路径

Owner确认Low切回Luna后，用Low＋fast启动同一完形输入的两份分片，不提供既往
错误反馈。A只产blanks；B只产overview/affectiveArc/译文/长难句，用underlineTexts
暂代坐标。后续证据对齐和程序合并另计，不能把分片通过称为完整合同通过。

- A：https://ampcode.com/threads/T-01a0a8f6-d3b9-7455-8b37-d0e2cb3bd35c
- B：https://ampcode.com/threads/T-01a0a8f6-db5c-74cd-bb8c-74e2d30dc86d

A文件25115 bytes，SHA256
`e0934c830fe6b6c343b406d5046391ce53d50b3b999198e24d7b5d20f06b4617`，已核对；
报告生成06:50:27–06:54:19 UTC，3分52秒。父线程部分检查通过：15空答案与
blankId闭合、45错项标签/原文选项一致、16条signal精确命中；不是完整schema。
内容初读：43、48的语境辨析较好，49识别get around to，46没有用句型硬排除；
但50仍把clear my voice解释为清嗓子、image联想到澄清形象，54仍说explain
需要向别人说明，部分诱因和排除理由缺乏依据。拆分没有自动消除这些语义错误。

B报告失败后，父线程只读核实实际工具记录：调用了明确禁止的nck1_analyze_group，
工具返回JSON-only错误，没有写分片。其自报“未调用模型/解析插件”与记录矛盾。
06:48:49–06:52:03这一窗作执行违规记录，不能算Luna独立生成质量或有效耗时；
不根据工具错误中的另一个线程ID推断其内部模型。A实际直接apply_patch写文件。

父线程明确纠正B：不得重调生成工具，由该线程直接写原定分片，重新记录生成窗；
未给题目级反馈，未改输入。纠正后的B尚未回收。需保留这次路径偏差，后续
比较不能声称这是无干预、全程顺利的双Luna流程。

后续B已回收：4422 bytes，SHA256
`f9a4eb941f49a6e82543e4ac8f0c8da47b017f7cb68b1d03539e007207fa180a`，核对一致；
有效生成06:56:24–06:58:01 UTC，报告96.862秒。仍将letter译为一封信，第二句
主从句骨架仍混写。已下达限定语义对齐后，Owner叫停Luna实验，父线程随即发出
停止指令；没有完整合并产物或完整正式验收，不能报告拆分方案成功。

## Sol Medium 完形同提示词首稿：内容改善，正式校验失败

Owner确认Medium路由配置为Sol Medium后，使用Medium＋fast。初始提示词与
完整单组Luna/Terra逐字相同，输入摘要相同，没有此前错误反馈，不拆任务或叫顾问。
不查usage；模型/effort按Owner配置记录。
线程：https://ampcode.com/threads/T-01a0a906-35ed-73ce-8312-720faceca752

文件66621 bytes，SHA256
`583f91fa7ebf39edb9430c50745d77cb009a92e0c0906e7747398e253a2e1dfa`，已核对。
报告环境07:03:57–07:04:26 UTC，29秒；生成07:04:26–07:10:03，5分37秒。
同一正式命令使用 `sol-medium-cloze-draft.json`：
`FAIL: AI JSON selectedLongSentences[0].displayText 必须是按权威答案补全后的 sourceText。`
两句displayText分别出现constantlycomparing、wasstringing，遗漏了补全时应有的
词边界空格，下划线也按该错误displayText计算。原稿未改，未追加修订；校验
在此失败不能推断余下检查均已通过。

内容审读的改进：letter按字母处理，Q49解释完整get around to，Q48不再漏看
replacement for的替换对象，Q50没有编造clear my voice/image的固定搭配含义；
长难句主从句分层清楚。15条answer-evidence中英文选段总体表达相同内容，未见
此前把时间段对应谓语、把修复对应过程名词等明显错配，个别片段仍较宽/较窄。

仍有语义风险：Q41-C说require通常要说明规则或任务提出者，把语境优选说成
词语使用条件；非人称情势也可以require某事。Q41-A对不定式补足成分的称呼不够
精确。Q45仍有“没有出丑/被注视场面”的排除措辞，不能让学生误解embarrassed
必须发生公开出丑。部分错项诱因仍是可能联想，而非原文明示。

本样本判断：Sol Medium比两者完整首稿更接近Owner的“朴素但不教错”目标，
但不是零错误、不是完整验收PASS，也不证明成本效益已胜出。机械补全属于程序
可承担的工作，语义风险仍需审读。未改变生产提示词/路由，未自动追加试验。

## Sol Medium 小验收：机械字段交给程序，保留语义验收

Owner授权继续后，冻结原合同，在末尾追加
`prompts/objective-analysis-preparation-v1.md`，只调整准备稿包装和讲解要求：
不强求虚构错项诱因；需要的推理仍保留；不得把语境优选讲成普遍语法禁令。
原生产提示词、正式schema和发布路径不变，不查usage，不恢复Luna实验。

程序 `prepare-objective-analysis.mjs` 从权威答案补全原句和段落、计算局部范围。
插入位置按题目和空号绑定；其他引文必须在指定段落唯一命中，或保留已验证的
显式位置。它不翻译、不改引文、不换段落、不猜中英对应。准备结果先过原正式
validator，成功才以排他写入生成新文件；保留原稿，拒绝覆盖已有结果。

首轮三组均使用Medium＋fast，模型/effort按Owner路由声明记录；输入不包含旧稿
或题目级纠错反馈。环境准备单列，首稿一次生成，不自动重试或追加润色。

| 样本 | 线程 | request SHA256 |
| --- | --- | --- |
| 嘉兴完形回归 | [线程](https://ampcode.com/threads/T-01a0a914-56f9-718f-9181-cf06df5ca014) | `fa4cbdd577c31cfae6498460b832f7f93273385254cb8e4781fd415d1a066914` |
| 2021 II完形新样本 | [线程](https://ampcode.com/threads/T-01a0a914-6402-76ac-912f-b0d770dd813d) | `da42fc20601c1a4db956c9832b58b18e9cc2419e0702d993ace87007ab2e6516` |
| 2021 II语法新样本 | [线程](https://ampcode.com/threads/T-01a0a914-6bf2-755c-9b75-8536da333656) | `84ba2446e21b90af28178816b09c7aa86690c3f5e2a4975b39e6e9a8ee064d5e` |

验收分两层记录，不能用JSON或机械PASS替代教学判断：
1. 原稿摘要、程序准备及原正式validator结果；失败保留准确位置，不放宽门槛。
2. 正答理由、错项辨析、译文、长难句和中英证据对齐的语义审读；按基准的六个
   维度记录，重点是答案/证据准确与结论强度。朴素或略短可接受，教错不可接受。

本地程序聚焦检查已通过：`verify-objective-preparation.mjs`、
`verify-reading-derived-ranges.mjs`、`verify-analysis-text-ranges.mjs`、
`verify-single-group-analysis.mjs`。新测试同时覆盖Unicode、提示词去除/补全空格、
重复答案的空号身份、段落局部坐标、输入不变、答案篡改拒绝、失败不写结果和
输出不覆盖。机器风险为unknown-fallback；这不是Ship或生产采用结论。

### 两份完形首稿：机械通过，语义不能直接验收

两份原稿摘要均已实测一致，均由同一准备命令一次通过原正式validator；未修改
原稿或追加模型修订。生成计时为线程报告，环境准备不计入：

| 样本 | 生成UTC / 耗时 | bytes / SHA256 |
| --- | --- | --- |
| 嘉兴完形 | 07:20:34–07:24:36 / 4分02秒 | 48794 / `960e1150cd931d7bd966b457620f24e52c0dbc42c2f910671d362ed0cf439164` |
| 2021 II完形 | 07:20:05–07:23:50 / 3分45秒 | 36384 / `ad6505dead6bec8cf8a2351275958cb1aaa9b6c4f339ad2bed0d23a6ee56e7fd` |

嘉兴不能接纳：全文译文15处均仅保留空号而漏译答案，例如“这[41]我成为一名
作家”“让我十分[45]”；answer-insertion中文引文因此没有对应词义。Q50仍将
clear my voice解释为清嗓，Q41仍用“没有发出要求的人或规则”排除require，Q54
说没有解释对象/听者却忽略句中已有the very act作对象。
letter按字母处理、主从句分层有所改善，但不能抵销上述实质错误。

2021 II也不能直接接纳：Q43-D用“王警官不是观众”排除audience，误把devoted to
的宾语当成主语身份；应比较投入角色与服务观众的语境。Q52英文证据send the
对应中文“把这些”，漏掉发送动作；Q50英文选段没有excuse，中文却含“借口”。
Q41-A“需要有学习者作为教学对象”容易被读成teach必须明说人的句法条件，宜
只说明此处是自己学会说方言而非教别人。译文15空均补齐，主要正答理由、动作
顺序和两句结构说明基本正确。两份下划线均有过宽近整句现象，属于密度问题。

按共享基准六维审读（非自动评分，未对固定25例重新生成）：

| 维度 | 嘉兴完形 | 2021 II完形 |
| --- | --- | --- |
| 答案与证据准确 | 答案正确；译文漏词、个别词义错误，FAIL | 答案正确；部分中英证据不对应，FAIL |
| 暗步讲明 | 正答多数有具体联系 | 正答多数还原调查/取信/记录的动作关系 |
| 不依赖内部术语 | 多数可读 | 多数可读 |
| 错项语境辨析 | 部分仍编造用法限制，FAIL | Q43-D结构误读，FAIL |
| 结论强度 | require、explain等限制过强 | “长期混入”等强于源文，需收窄 |
| 恰当密度 | 比旧稿简洁，下划线过宽 | 比旧稿简洁，下划线过宽 |

提示词后续候选：明确空号是答案中文旁的标签，不替代译词；对错项先代回
完整句子确认句法角色；只选两种语言都实际包含的同义短片段。不要继续堆叠
逐题黑名单，更不能让程序硬编码中文答案或自动替换讲解来制造PASS。

### 2021 II语法：答案备选表达被拒，另有可见内容问题

原稿32654 bytes，实测SHA256
`5c5e162025b6a31c1139c569abaaf7fbc346418acc98a98a1c2b343b1108180b`。
线程报告环境07:19:31–07:22:06，生成/一次自查07:22:06–07:26:20 UTC，4分14秒。
同一准备命令在原正式validator停止：
`q-2021-ii-059: AI 答案与答案解析版不一致：官方 which/that，AI which/that`。
已确认没有生成prepared文件。未改原稿、答案权威或冻结的校验规则。

原因是现有 `answerMatchesKey` 只拆分官方答案的斜杠备选，AI answer须为其中
一个单支答案；备选集合原样复制不被接受。稿件正确解释which和that均成立，
因此此项是包装约定问题，不能记成模型不懂定语从句。小验收请求强调权威答案
一致却没明确这一单支规则，应补充说明；也须单独明确补全文本使用官方集合
还是选定分支，不能在本实验临时改底层答案策略。

独立于该首个失败的审读发现：全文译文漏掉全部[56]–[65]标签；Q61称空格
“位于系动词could be后”，但原句是how harmful plastic could be，形容词前置，
应先还原普通语序再解释表语；overview把航空公司正在转型写成由作者最终促成，
超出回信所证明的因果。Q59、Q60、Q61等中英证据存在短源片段对应更宽译句的
现象。其他多数逐题主语/非谓语/目的/时态解释正确，两句长句主从层次基本清楚。

六维记录：答案知识基本正确、包装FAIL且证据对齐待修；暗步多数讲明；文字
可读；语法无需虚构错项（N/A）；overview结论强度FAIL；密度较简洁但下划线
过宽。首个validator错误之后的检查未继续执行，不能声称其余正式检查PASS。

### 本轮取舍

三组耗时约3分45秒至4分14秒。两组完形机械准备及原validator通过，一组语法
因备选表达失败；三组均有内容或合同问题，不足以支持无人审读生产采用。
本轮仅证明机械字段可以从生成任务中移出，不能证明Sol Medium或任何更贵模型
能保证正确。不继续自动重试、不切生产路由、不恢复Luna或查usage。

后续小改应先消除无歧义的合同表达问题（译文标签不替代译词、备选单支），
再评估一次专查词义/完整句法/结论强度/双语对应的窄验收是否能稳定拦错；
不要把增加文字或盲目提高推理档位当作已验证方案。保留本轮输入、原稿及失败
作为同任务证据，生产默认和完整发布门槛保持不变。

验证状态：新增准备程序的cloze/grammar完整夹具、范围回归和十题组单组校验
均PASS，`git diff --check` PASS。`pnpm -C app verify:changed` 因整个工作树的
累计改动选中all，进程352037仍运行（日志`.scratch/sol-pilot-verify-changed.log`）；
未把在途全量写成PASS。这里没有提交、push、PR、部署或导入真实卷。

## 一次窄校对实验：Owner再次授权后启动

保留上述三份冻结首稿，不重新生成。使用新的Medium＋fast上下文，每组只校对
自己的首稿；不提供父线程的逐题发现，也不读其他组。通用校对规则针对本轮
观察到的错误类别设计，因此这是定向流程试验，不是未见过错误类型的盲测。
没有查usage或改变生产路由。每组只允许一次审读及必要一致性自查。

- 嘉兴完形：[校对线程](https://ampcode.com/threads/T-01a0a922-4b33-75c5-8390-03befa8cecbf)
- 2021 II完形：[校对线程](https://ampcode.com/threads/T-01a0a922-52e9-70f8-b7f5-f6f4c43a8b7f)
- 2021 II语法：[校对线程](https://ampcode.com/threads/T-01a0a922-5b57-745c-9b5d-a8f577a01832)

统一上传原request、原draft、最新准备合同和独立校对合同，不传整卷或旧分析：
- preparation-contract SHA256：`f8affcd8062ced012019e380b628b1a9e9e4f8027e334f15826d6eba8f8e94ea`
- review-contract SHA256：`9e729d5e4842a65f641735d170a3168956b192f907e1c9d4c7641a9ea2224847`

准备合同补充两个明确规则：译文空号贴在答案词义旁而非替代答案；grammar的
answer填官方备选中的一支，机械补全及插入引文仍遵循现有官方原值规则。校对
合同只纠正可证明的词义/句法/双语证据/结论强度/合同问题，不全面改写。

回收前固定核对点，不以校对者自报findings数量作为效果：

| 组 | 已知必查问题 |
| --- | --- |
| 嘉兴完形 | 15空译词完整；Q41 require无伪限制；Q50 voice不冒充清嗓；Q54不否认现有宾语；相关译文引文同步 |
| 2021 II完形 | Q43 audience语法角色；Q50、Q52双语证据；Q41 teach不设伪句法条件；不添加长期/因果断言 |
| 2021 II语法 | Q59备选包装；十个译文标记；Q61前置语序；overview不夸大回信因果；Q59/60/61双语对应 |

父线程保留原稿，比较全部实际diff，复核已知点并审查新改动是否引入错误；
再运行同一准备/正式校验。无法确定的语义必须保留为未解决问题。若仍有实质
错误，停止本轮，不追加第三轮模型修补或宣称“零错误”。

证据更正：先前工具输出把Q43“作者自身”显示成疑似乱码；直接读取原稿和
校对稿的JSON字符串并按码点计数，二者U+FFFD均为0，文本均为“作者自身”。
这不是模型错误，已从问题表中撤回，不能算作校对漏检或修复。

### 校对回收与父线程验收

六个输出文件的字节数和SHA256均已实测与回报一致。父线程审阅完整结构diff，
没有再给模型反馈或追加改稿。

| 组 | 校对UTC窗（线程报告） | reviewed bytes / SHA256 | findings SHA256 |
| --- | --- | --- | --- |
| 嘉兴完形 | 07:35:41–07:38:51，3分10秒；环境另10秒 | 49290 / `ed8082a3c177e6819280826af7741347986d9525c5feda248cafb73e1f14030e` | `94237ec1ad6eef1fa7327801601dd8d53547236b143b90c27d53f1740bb4c704` |
| 2021 II完形 | 07:35:05–07:37:51，2分46秒；该窗包含环境13秒，不算纯推理时长 | 36427 / `ff42cced9f3cfb73da3b113238308244ccca14ec32085d619eae59d3bd9176b3` | `a3b65b0512fc655ed32a74888a9526bedee176b21589d53b4db8e925a4c83626` |
| 2021 II语法 | 07:35:06–07:38:51，3分45秒；该窗包含环境10.65秒 | 32895 / `c06c67bc750e3f68ec21cfc6b626431cfda6d4e1bd7a23fc62a65571c9d041fa` | `0e2db62d485c91b8d1b5150117f72f1f065ac6d9ac4c564c2be8cbfcaa9242b8` |

- 嘉兴：两层正式校验PASS；补全15空中文并同步引文，去掉无根据性别和require
  的伪限制，删除清嗓误释。但Q54“没有解释对象或听者”未改，仍忽略the very act；
  新的voice释义“让声音变清晰”也不应作为固定搭配教授。宽证据问题没有全面处理。
  校对报告只标出源材料残片未决，不能据此认为教学问题已经清零。
- 2021 II完形：两层正式校验PASS；7项记录确有相应修改，双语对齐、teach
  句法限制和“长期”等得到修正。Q43-D仍用“王警官不是观众”排除devoted to
  his audience，混淆宾语与主语身份。报告unresolved为空，但父线程仍拒绝内容验收。
- 2021 II语法：补齐标签、收窄多处证据、去掉航空公司改变由作者促成的断言；
  内层原题型validator（含完整教学附录）PASS。Q61“空格位于could be后”仍未改，
  与原句前置形式不符。外层正式校验FAIL，原因如下，不能算模型知识错误。

### 新定位的程序阻断：grammar备选答案两层校验相互冲突

上节“只需要补充单支约定”的判断不完整。校对把answer改为which后，执行到
`nck1AnalysisProjection.mjs` 的 `assertAnswerAgreement` 又被严格字符串相等
拒绝。直接用同一已准备数据在内存分别测试which、that、which/that、who：
前两者被外层拒绝，后两者被内层拒绝；未更改原稿或权威答案，未生成accepted文件。
代码确认该外层检查同时存在于单组入口和全卷projection。

这是程序一致性缺陷，不是调提示词可解决的错误。后续单独修复应复用原语法
四步答案比较语义，并同时回归单组/全卷的合法两分支与非法答案；不能通过改
官方key、模糊匹配、放宽其他题型或仅绕过单组检查修复。本轮未改发布校验，
准备合同已标明该已知阻断。

另一个实验执行问题：worker主动把同名文件上传父线程根目录，存在覆盖竞争。
父线程按每组摘要绑定结果，语法两文件从原线程重新下载到唯一组名路径，没有
使用不匹配的文件对。后续校对合同明确只在worker本地交付，由协调者串行取回；
本轮发送的合同摘要保持上表记录，不把后改合同说成本轮已执行。

结论：窄校对能修复一批错误，但三组均至少残留一处实质讲解问题，不能作为
无人审读通过门。共享六维中，语义准确、错项完整句法或句位说明仍未全过；
可读性和密度没有成为本轮阻断，未重跑固定25例生成，也未做生产采用。
不继续第三轮模型修补。后续优先处理程序合同冲突，再决定是否值得继续研究
校对方式；当前仍需人工教学验收，不承诺“低价模型＋一次校对＝不出错”。

本轮本地 `verify-teaching-analysis-style.mjs`、`verify-objective-preparation.mjs`
及`git diff --check` PASS。全量进程352037仍在运行，尚不宣告PASS；没有生产
调用、路由变更、提交、push或部署。

### Owner授权修复后的状态：grammar备选冲突已消除

新增双入口合成回归，先复现合法which被外层拒绝，再做最小修复：语法内层
`validateGrammarFillShape` 已执行官方备选匹配，单组和全卷不再额外套用只适合
选项字母的严格整串比较。没有另造比较规则，没有改四步归一化、schema、官方
答案、补全文本、题目/空号闭合或阅读/七选五/完形的答案要求。

`node scripts/verify-single-group-analysis.mjs` PASS：原十题组验收/拒绝均通过；
新回归在单组和全卷路径同时接受which、that、大小写/首尾空格差异，同时拒绝
who、which/that整串、that.、whiches和空字符串。比较源材料、请求、PaperAsset、
输入文件和内存对象，确认权威与输入未变；检查实际输出sidecar的答案值。
红灯日志保留在`.scratch/grammar-alternatives-red.log`。

2021 II语法校对稿重新运行准备命令已PASS并生成独立prepared文件；原稿SHA256
仍为`c06c67bc750e3f68ec21cfc6b626431cfda6d4e1bd7a23fc62a65571c9d041fa`，
request SHA256仍为`84ba2446e21b90af28178816b09c7aa86690c3f5e2a4975b39e6e9a8ee064d5e`。
这是程序阻断修复，不消除Q61等残留教学问题，不代表内容获准发布。

`verify-objective-preparation.mjs`、受改JS语法检查、`git diff --check` PASS。
此前全量进程352037结束：179 PASS / 1 SKIP / 0 FAIL，1571.8秒；SKIP为缺失的
仓库外i16a夹具。它在本修复前启动，不能作为本修复精确候选的最终全量证据。
当前仅宣告聚焦修复验证完成；未执行本候选最终Ship全量/E2E及独立审查，没有
提交、push、部署、模型生成或生产操作。

## 独立先判再对稿：单题两阶段小测试

Owner授权后使用 `prompts/objective-analysis-independent-review-v1.md`，发送版
SHA256 `238d195538eadc40afaf3457d57a60f87a350098dd45521667009aee21ec8cc5`。
Medium＋fast，仍不查usage。阶段1只上传源文、问题/选项、官方答案及同组上下文
补全答案；阶段1文件取回并校验摘要后才上传原解析，进入阶段2。禁止回改阶段1。
这只是判断实验，不生成staged分析，不安装Node/Ajv，不运行导题/API或正式发布。

已知漏检样本各用独立上下文：
- [嘉兴54](https://ampcode.com/threads/T-01a0a941-05a7-77dc-9137-1e4fa708a799)
- [2021 II完形43](https://ampcode.com/threads/T-01a0a941-0dc6-7408-b5aa-dd72b031418c)
- [2021 II语法61](https://ampcode.com/threads/T-01a0a941-1722-72ac-934d-e27bff511941)

第一阶段冻结摘要：嘉兴54 `dc95695c4cd078922328bfa6ad048df5e63f75471e620e8d5f45fd89696a4764`；
2021 II43 `94095b3de5074377b858c1d396c11b828de6f1b73f6f8b79218d9742ba42ecfe`；
2021 II61 `216af0c75f3d31a737ede7a75841008895c52940a1c1b1e131dedbca673ca25b`。
已实测与回报一致。两道完形独立判断明确了空格的宾语关系；语法独立判断仍用了
“after be”而未明确区分页面前置与常规语序，须看对稿阶段能否识别，不能先计成功。

预定新题对照：2024 I完形45、2024 II语法60保留资产中简短但实质正确的理由，
预期keep，不把“不够详尽”当事实错误；2024 I完形52只在独立实验副本中注入
主被动反转（作者超过当地车手），预期correct。后者是人工合成负例，不得报告成
新发现的模型自然错误。原资产不改，各题同样先独立后看稿，不提供预期标签。
这些题来自已有基准，但不是本轮已调过的嘉兴/2021题，不能称大型盲测或统计可靠率。

旧题阶段2：嘉兴54与2021 II语法61均判correct，准确指出既有宾语/实际前置位置，
嘉兴还发现“I enjoy反复出现”强于实际一次出现。2021 II完形43判keep，虽然
阶段1正确写出to的宾语关系，比较时仍替原解释补出合理理由，没有指出“本人并非
观众”不能排除devoted to his audience。这说明独立先判也可能在对稿时合理化原稿。
三份comparison摘要分别为
`0dee9484fc9fa877627ed8d84577fdd9d35234eb2acbeea04ca135ff6c867878`、
`9fb813af855422ee8305a1a8332e8941a125a301a8fc59082e2cba69f99f72f7`、
`b5bfb495abfcd00957ae23b747ba26920a6bd23dcf46316d3f8c3419e9bdaecf`。
阶段1/2报告耗时：嘉兴28/42秒，2021 II43为24/37秒，2021 II61为55/26秒；
不含创建Orb、传文件及父线程检查等待。这些旧题均为fast，不能与后续普通速度
混算成提速证据。

Owner随后明确Medium导题不开fast，已记入agent-contract。新题使用Medium且
显式`features: []`，未改账户/项目路由。此前刚建的三条fast新题线程尚未收到
输入或开始指令，不继续使用；工具不支持就地修改features，故普通速度新题为：
- [2024 I45](https://ampcode.com/threads/T-01a0a947-6233-71ba-922f-6c848e7f6774)
- [2024 I52](https://ampcode.com/threads/T-01a0a947-7439-7075-bfbe-b6ed96126f71)
- [2024 II60](https://ampcode.com/threads/T-01a0a947-8680-77ca-83cb-d18251c64966)
未启动的fast线程为T-01a0a946-3f1f-750d-8752-ebac1822da42、
T-01a0a946-63d8-70db-bd95-4bbaf6bf2489、T-01a0a946-7190-756b-a4fb-7932f9c30549。

### 普通速度对照收尾与采用边界

三份结果已取回到各自唯一命名路径，父线程核对 JSON、caseId、裁决枚举、
commentary 精确摘录、逐条源文引文及文件摘要全部 PASS；本地阶段1冻结副本
摘要保持不变。父线程阅读比较理由后，同意以下三个对照裁决：

| 样本 | 对照性质 | 实际裁决 | 阶段1/2耗时 |
| --- | --- | --- | --- |
| 2024 I 完形45 | 正确的简短解释 | keep，未误改 | 89/30秒 |
| 2024 I 完形52 | 人工注入主被动反转 | correct，指出作者被当地车手超过 | 65/27秒 |
| 2024 II 语法60 | 正确的简短解释 | keep，未误改 | 40/63秒 |

三份 comparison SHA256 按上表顺序为：
`875f8a127ce7dda98c51b4f605caa480658e10985a86b005e04b7584fbe18691`、
`f42dea8bc07fcba0853706242598d5a35ebadc10e950483c2c5b02c17e30e6b7`、
`0942207c7cc97f274dc0eb2f6655cda84981c5f2f7696e12380c02c1cd4dc93d`。
时间来自各线程报告的阶段起止 UTC，不含 Orb 创建、传输、协调或等待；未查账单，
不能从时间推断实际费用，也不能混同前轮 fast 来比较模型效率。

本轮结论：两道正确对照未被误改，合成负例被识别；但三个已知问题仍漏掉一道。
独立先判能帮助检查，不足以成为自动放行门。六个定向样本不能推算总体准确率，
更不能承诺“便宜模型不出错”。本轮到此结束，不追加生成或校对试跑。

后续提示词微调建议（尚未通过新试验验证，也未接入生产）：
- 对稿阶段核查原稿实际写出的论证，不能用自己的正确理由替它补台。例如
  “人物本人不是观众”不能推出“不可能投入于他的观众”；答案正确不等于排除理由正确。
- 保留完整句法代入，以及语法功能与题面实际位置的区分；禁止把语境不合说成
  普遍语法禁令。正确且简短的解释直接保留，不因教学密度不足扩大校对范围。
- 机械坐标、补全文本继续交程序；模型负责有源文依据的有限解释。无法证明的
  论断删除或标为不确定，不强行补满丰富解析；语义仍需人工验收。

本轮 `node scripts/verify-teaching-analysis-style.mjs` 和 `git diff --check` PASS。
这些是实验文件/合同检查，不是完整解析正式 validator 或生产质量证明；没有
新的全量运行、提交、push、部署或发布。Medium 普通速度约定已写入 agent-contract，
未改变账号/项目路由，也未启用无人审核流程。

## 写作价值试审：历史样稿，不是当前模型对比

Owner授权评估一篇应用文与一篇续写后，选固定基准中的2025 II催稿邮件、
2024 I Gunter续写。仅读取已有PaperAsset和writing sidecar，协调者直接审读并
另存教师样稿；没有启动生成worker、付费外部请求或重跑生成，原资产不变。
审读材料位于本线程 `.amp/in/artifacts/writing-value-review.md`，不是可发布staged数据。

应用文发现催稿后“无需着急”削弱任务目的、正文116词偏离当前推荐范围、
亮点说明推广万能句；修订正文85词，明确日期为参考创作。续写主体可保留，
补清回电而非仅还钱的承诺，修正教学模板遗漏主语，消除结尾驾驶/住所含混；
修订155词（含给定段首），未把礼物、接机或纸条当成题面必写。

本地Node文本检查PASS：词数、给定格式/段首、两份分析与两份PaperAsset摘要不变；
`git diff --check` PASS。旧应用文没有当前ReviewCard，续写使用旧continuationDesign，
因此不能把这些旧稿错误归于当前合同或某个模型。未运行正式导题validator，
未做完整写作sidecar迁移、渲染或发布。

内容样稿与问题记录已齐，真人审读耗时、改动量及是否省时仍待Owner填写。
不以代理用时冒充教师成本，不从两个定向旧样本推算模型错误率或购买意愿。
当前建议保留可审读的写作辅助，尚无依据宣称自动范文/解析可以无人验收。

## 应用文当前合同：约110词单次生成

Owner纠正篇幅偏好后，撤回上节“原正文116词本身偏长”的判断；旧85词样稿
保留为历史记录，不再作为目标。约80词题以110词左右为中心，推荐100—120词，
确定性接受80—120词；题面硬性上限仍由完整题面内容复核执行，其他词数不变。
同步V3、共享教学规范、对应基准及范文校验器，V2历史版不改，未改schema。

[Medium普通速度线程](https://ampcode.com/threads/T-01a0a970-7923-74ba-9ff3-c39e4d27f986)
使用显式features=[]，仅接收2025 II应用文题面、空官方范文权威、当前组合合同
和共享doctrine，没有旧范文/旧反馈。request 28904 bytes，SHA256
`97b328d63b32cff4afa77cf99a832149f8b6d56afc24af22d5d6d04c9ae57ee3`。
生成及必要自查UTC 08:59:56—09:00:49，共53秒；不含Orb、传输、父线程检查。
产物1706 bytes，SHA256 `4f2bfe84c36915a9d6548182020ecdec47d66ef7aba8d7ef32cc9ee2599fd358`。
一次生成，无重试或润色，父线程摘要与worker最终记录一致。wait工具连接失败后
仅读取原线程状态并取回文件，没有重复派发。

正式单组validator PASS application；既有范文校验器返回109词/recommended。
一次内容审读：正文两项任务、语气、语言、格式未发现必须修改的实质问题；
ReviewCard.relationship中的“熟悉”无题面依据，内容结果MUST_FIX（仅卡片）。
最小修改建议为“校英文报编辑与受邀撰稿的外教，应礼貌询问并明确提醒交稿”。
原稿保留不动；未自动返修，不把JSON通过算成内容通过。完整审读样稿为
`.amp/in/artifacts/application-110-first-draft.md`，原JSON同名前缀另存。

验证：`verify-application-model-answer-prompt.mjs` PASS，覆盖80/99/100/110/116/120
的接受与推荐状态、79/121拒绝、给定文字排除，以及其他100词任务130/131边界不变；
`verify-teaching-analysis-style.mjs`、`verify-single-group-analysis.mjs`（十题型）及
`git diff --check` PASS。机器分类unknown-fallback；未做本候选最终Ship gate。
此前误把--help传给verify:changed启动的进程437306已结束：179 PASS / 1 SKIP /
0 FAIL，1554.9秒；SKIP为仓库外i16a夹具缺失。该运行早于本次词数改动，不算
词数改动的最终全量证据。没有新全量重跑、push、部署或发布。

结论仅限本题：现有系统可一次写出可用正文，但审题卡仍可能添加无依据身份判断。
不改路由、不推广为无人验收，不据一次结果推算费用、总体错误率或真人净省时。

## 当前续写合同一次试写：2024 I Gunter

Owner授权后使用当前V2组合合同及完整schema，不修改提示词，不给旧范文或旧反馈。
[生成线程](https://ampcode.com/threads/T-01a0a97f-bf05-72b5-bafb-5270e94c4931)
为Medium普通速度features=[]；request 33363 bytes，SHA256
`38f45e586a3d996e94f88dcaa05102b32ca11e49fbd5447588388f9cfebe3696`。
合同SHA256 `b0fdae8865ea97100fb9581a2001e6e0f73cd660acb9f9989f555869784994b3`，
共享doctrine SHA256 `7d70971929290ac7575f5e9452c96a5634133d39c488e51288f77c16461205da`。
生成及自查UTC 09:16:42—09:20:17.379，约3分35秒；不含环境、传输或父线程验收。
仅一次生成；wait工具失败后只读取进度，没有重发任务。产物32751 bytes，SHA256
`782316d7ac04cc88af4d1f9f9677dc39fffe6bc9d3859563925f7e81ecac7750`。

正式单组validator PASS continuation，父线程摘要及两个精确段首检查PASS；
正文155词，段落80/75词，排除给定段首130词。原稿及审读存于
`.amp/in/artifacts/continuation-current-first-draft.json`与同名md，未改模型原稿。

内容判断：正文可作为普通参考，完整自然但不出彩；第二段事件偏平、结尾较常规，
这不构成必须重写的事实错误。解析包MUST_FIX：混淆源文终点与第一段入场；
把三种已知付款障碍概括成所有即时方式失效；把电话承诺精确到四天当硬要求；
把第二段还款与不免单当通用规则，与自身允许第一段即时付款的alternatives冲突。
这些边界错误会误伤其他合理续写，不能由schema/97条精确引文检查发现。

本轮不修稿、不追加生成、不修改正式合同或资产，不宣称模型整体质量/成本收益，
未发布部署。结论是“正文稳妥可参考，教学解析约束需小改”，不是无人验收通过。

## 准确性优先：逐主张校对首轮未达到自动放行要求

Owner明确保留AI解析、接受平庸且无时间逐篇审读，并授权启动准确性路线。本轮
仅测试新的 `prompts/teaching-claim-review-v1.md`，未接入生产。协议要求检查原稿
实际论证，代入完整句法，对必然性主张尝试反例，正确简短解释保留，不能确定则
uncertain；任一错误/不确定/缺失输出阻断。不是新增整卷生成或文风实验。

执行前冻结 `.scratch/claim-accuracy-pilot/expected-manifest.json`，5个样本共13条
选定主张，其中6条预标定错误、7条正确对照。预期仅存父线程，未发worker。
三个问题样本为既有audience错项理由、harmful题面位置、Gunter续写约束；独立
正确对照为inspired、achievement。续写附原字段语义说明，避免把通用约束当成
单一路线判断；它仍是定向回归，不是盲测总体准确率，也不证明完整题组覆盖。

协议发送版3555 bytes，SHA256
`0704402857d4b1ce0a2dd5d403c5dc99ae643fdb84f902126b8cab6f5ddc141a`。
所有线程Medium普通速度features=[]，只读该题完整源文和指定主张，一次校对。

| 样本 | 线程 | 校对UTC起止 | 与预期一致的主张 |
| --- | --- | --- | --- |
| case-01 / audience | [线程](https://ampcode.com/threads/T-01a0a9a2-e539-7620-b5db-ec8d0d64dbfb) | 09:55:26—09:56:15 | 3/4，关键错项理由漏检 |
| case-02 / harmful | [线程](https://ampcode.com/threads/T-01a0a9a2-ed96-708f-b74f-c44b6644188b) | 09:55:26—09:55:54 | 1/1，位置错误被识别 |
| case-03 / 续写 | [线程](https://ampcode.com/threads/T-01a0a9a2-f772-7134-84d1-80a27c69c3e4) | 09:55:26—09:56:27 | 3/6，4条问题仅识别1条 |
| case-04 / inspired | [线程](https://ampcode.com/threads/T-01a0a9a3-075c-7519-9d22-e345101486a2) | 09:55:28—09:56:05 | 1/1，正确保留 |
| case-05 / achievement | [线程](https://ampcode.com/threads/T-01a0a9a3-0e90-72cb-8ef7-3298ed14a0df) | 09:55:28—09:55:57 | 1/1，正确保留 |

时间均为2026-09-16，不含Orb/传输/协调，未查费用。case-01唯一自查命令因jq
编译错误未完成，worker如实报告；父线程机械检查完成。wait工具故障后只读状态
并取回已有文件，没有重复派发。5份最终摘要均与下载结果相符。

机械检查PASS：输入摘要、输出最终摘要、完整字段、按序覆盖、逐字claim、裁决
枚举、sourceId和精确引用、修正字段空值约束。它不证明语义。内容回归失败：
6条预标定问题找到2条、放过4条；7条正确对照均保留，无uncertain。

漏检证据：
- audience：worker仍用“王警官不是观众”排除“投入于他的观众”，并补出原稿
  未写的理由“未将他定位为拥有观众的人”。角色与介词宾语的混淆没有被拦住。
- sourceEndState：理由只核对队伍、故障、未付车费，跳过了主张中的“已回来”。
- 所有即时方式：理由将原稿的“所有…失效”缩成“即时付款受阻”，替原稿弱化后批准。
- 四天承诺：将四天后实际履约，当成承诺中必须提前确定具体四天的依据。

被识别的续写问题为“第二段必须处理未付车费”：worker给出第一段已免单、第二段
依约致谢的相容反例，正确指出解决时机不能当通用硬约束。正确对照未被润色。
case-05复核理由把开篇误叫“标题”（源段落ID含title），作为额外措辞问题记录，
不改已冻结的13条评价分母。这也说明校对文字本身需要谨慎对待。

本轮裁决 `BLOCK_AUTOMATIC_ADOPTION`，完整矩阵在scratch的results.json。
试验后仅给协议文件加NOT APPROVED状态；发送版原字节保存在scratch/protocol.md，
上述SHA256绑定发送版，不把后加状态说成本次模型已读输入。
不将该协议当作已验证的自动安全门，不以重复校对次数或双模型同意代替准确性。
原解析、权威、正式生成提示词、schema及发布路径均未改变，没有后续润色/生成
循环、发布或部署。下一步设计必须解决“逐条却未逐断言检查、替原稿补理由”的
实际失败，而非宣称加了反例指令就已可靠；尚未测试新的改法。

## 2026-09-16：生成端窄修订，尚未做模型效果验收

Owner 要求“来微调”。本轮是提示词修订，不是权重训练；不再把失败的主张校对
实验当安全门，也未自动启动模型试跑。Medium 后续试跑仍用普通速度 features=[]。

- 完形：替换“讲解质量排在结构后”的优先级表述。合法结构、精确引文与事实正确
  同时必需；权威答案不能证明任意理由。错项先代入完整结构，保留施受、所有格、
  介词关系，再写此处意思和语境不符之处；不虚构语法禁令或必要对象。
- 语法：区分题面实际语序与为解释而还原的骨架，不能将表语职责误写成实际位于
  系动词后。结构、引文、权威答案和理由正确同时必需。
- 续写：修改当前 V2，sourceEndState 只到 material 结尾；段首新动作不倒灌。
  已知几次受阻不等于所有办法耗尽；后续履约日期不证明先前承诺指定日期。
  若存在相容替代路线，具体支付方式、动作或解决时点不得变成通用硬约束。

字段/schema、答案权威、译文、标注、三个错项及完整写作输出要求未改变。
本次不改模型路由，不发布、不部署，不覆盖既有实验原稿和冻结结果。

验证（Node v24.21.0）：
- `node scripts/verify-teaching-analysis-style.mjs` PASS；新增断言检查真实 builder
  发出的提示词含本轮规则，含当前续写 V2，而不只检查历史 V1 文件。
- `node scripts/verify-single-group-analysis.mjs` PASS，10 类题组公共验收接口。
- `node scripts/verify-i8-cloze-analysis.mjs` PASS，74 checks。
- `node scripts/verify-i13-grammar-fill-analysis.mjs` PASS，138 checks。
- `git diff --check` PASS。

这些检查只证明规则接入及既有合同未破坏，不证明模型错误率下降。下一次经 Owner
同意的有界评估应冻结新旧提示词和评判标准，保留已知错例与正确对照，再加入
未用于写规则的同类题；分别记录实质错误、正确内容被误改和运行成本，不以结构
PASS 或同模型自报 PASS 替代准确性结论。

## 2026-09-16：生成提示词新旧对照，没有证实改善

Owner 同意继续后，只运行一次有界 A/B。两份输入共用同样的7例、doctrine和
局部输出协议，去掉所有旧主张/解析；A仅逆转上节提示词变更，B为当前本地版本。
旧续写提示词还与此前冻结 request 的 V2 正文逐字核对。评判规则在派发前冻结于
`.scratch/generation-ab-pilot/expected.json`，未交给worker。协调者知道A/B身份，
不是盲评。两个线程都是Medium、features=[]，各一次生成，无补写或重跑。

- A：[线程](https://ampcode.com/threads/T-01a0a9bf-1fbd-7138-8ca9-d97e8c84a563)，
  5840 bytes，SHA256 `01298b10b6ab9665a01a5cc2e2b868173fe4b985c01a2f61faffffb247474d42`。
- B：[线程](https://ampcode.com/threads/T-01a0a9bf-6024-763c-b84a-e948d8e6aa40)，
  5876 bytes，SHA256 `88377f1d3f5aa9cea1c8ecab398abbbde2519da0a943b3988f0f2722896d1601`。

| 局部样本 | A旧提示词 | B新提示词 |
| --- | --- | --- |
| role / audience | 实质错误 | 理由含混，未判通过 |
| harmful | 未发现实质错误 | 实质错误 |
| Gunter续写约束 | 未发现实质错误 | 实质错误 |
| inspired正确对照 | 未发现实质错误 | 未发现实质错误 |
| achievement正确对照 | 未发现实质错误 | 未发现实质错误 |
| 新编Only after倒装 | 未发现实质错误 | 未发现实质错误 |
| 新编修车续写 | 实质错误 | 实质错误 |

A有2例可证实错误；B有3例可证实错误、1例理由未确认。两道新编题只是迁移探针，
不是未见真题集。每组仅单次采样，不能由此证明新版整体更差，也不能宣传改善。
本次只测局部文字，不测完整题组负载、译文、坐标、范文和正式schema。

关键证据（全部8条发现的输出引文与原文件逐字检查通过）：
- A仍以“王先生在行动中是扮演者”排除 devoted to his audience，不成立。
  B改成“不是…扮演对象”，表达含混，不替它补充未写理由后判通过。
- B仍写“该形容词在 be 后作表语”，而空格在 how 后、plastic could be 前；
  表语职责正确，实际位置描述不正确。
- B要求“两人约定…四天后…打电话”，把履约日期变成承诺必含内容；又要求第二段
  处理未付车费。提前免单/结清、后来按约致谢是相容反例。
- 修车题A排除交给商店/邻居的修理，B要求亲手完成修补，还把一家店关门和一个
  邻居没有备胎扩大成“无法买到…或借到…”。段首并不排除尝试后获得帮助。

`node .scratch/generation-ab-pilot/check.mjs` PASS：输入摘要、同题同协议、无旧
解析、7例顺序、字段和答案/错项；两份worker自查也通过。这不是内容PASS。
计时：B为10:26:11Z—10:28:02.907Z，约112秒；A结束10:27:38.911Z，但其自报
起始约值早于派发，不可信，不报告生成耗时。未取得费用/token账单，不比较性价比。
wait工具失败后仅只读查状态并下载既有结果，没有重复任务。

结论 `NO_DEMONSTRATED_IMPROVEMENT`。结构正确、加明确禁令或缩小任务都不保证
教学断言正确；不把当前未发布的提示词修改称为已验收修复。结果和判据冻结保存，
本轮不追加提示词、不启动又一轮通用校对、不上线。后续若继续，应优先压缩不必要
的教学断言：说明实际句法职责、具体语境和一种续写路线，避免为“讲全”编造位置、
普遍禁令与唯一情节；这仍只是待验证方向，不是已经实现的无错方案。

## 2026-09-16：按成本边界收缩生成任务，未新增模型调用

Owner 明确解析必须保留，不能靠 Astra，当前 Sol 已贵，并同意收缩不必要断言。
本轮只修改现有生成提示词，不改模型路由，不新增长驻校对调用，不自动付费试跑。
后续 Medium 仍普通速度 features=[]。不承诺便宜模型无错，也不将 Owner 的
逐题审核当作本次方案；现有发布/确认权限未被本轮修改。

具体生成停止点：
- 完形：保留三个错项，每项“此处意思＋一个决定性的语境差别”讲清就停；
  用具体事件比较，不为补长度扩写词语的普遍禁令、学习者心理或用法课。
- 语法：保留必要骨架、职责、形式推导及局部验证；不主动增加词前词后的
  位置描述，除非语序本身决定答案（如倒装）。将这一规则统一放进学生讲解段，
  不在多个位置重复要求。
- 续写：先写最小充分的题面强制条件，再选择范文路线；源文未指定的方法、
  人物和时点不补成硬条件。路线以“本范文选择……”讲因果，不枚举情节来显得全面。
  所有schema必填字段仍保留，只有schema允许的可选数组才省略或留空。

本地验证全部PASS：`node scripts/verify-teaching-analysis-style.mjs`（真实builder
接入断言）、`node scripts/verify-single-group-analysis.mjs`（10类）、
`node scripts/verify-i8-cloze-analysis.mjs`（74项）、
`node scripts/verify-i13-grammar-fill-analysis.mjs`（138项）、`git diff --check`。
这些只证明合同和接入，不证明语义正确率或费用改善。没有新的生成结果或账单；
前一轮失败结果保持冻结，不挪用为本轮效果证据。未发布、部署或推广任何试卷。

## 2026-09-16：收缩版嘉兴完整完形验收，结构通过、内容未通过

Owner 交付继续执行后，选已有权威答案的嘉兴完形做一次完整题组生成，未新增
题目或替换源材料。使用当前收缩版cloze提示词、完整教学schema annex、共享
doctrine和既有preparation补充协议；只把数值坐标/派生文本留给确定性程序。
事前输入及评判范围冻结在 `.scratch/concise-full-cloze/manifest.json`。

线程：[嘉兴完形收缩版完整稿](https://ampcode.com/threads/T-01a0a9d3-3c03-712b-9841-4b37d71ad1c8)。
Medium普通速度features=[]，独立Import Project Orb；仅一次生成，没有后续
模型校对、润色或升级。条件授权analysis-only环境准备，Node24/Ajv ready。
生成UTC 10:48:40Z—10:55:02Z，共382秒。准备稿49037 bytes，SHA256
`69122d76340a503b35f7fb2fa32b8c190b5aea9eb0c43b7c6d0f663d29c00d2a`。
worker单次自查发现q43 blankId多出`:cloze`，定点修正后交付；父线程未改语义。

执行证据：
- `node scripts/verify-objective-preparation.mjs` PASS：Unicode、按空身份补全、
  段内范围、输入不变和不明引文拒绝。
- `node scripts/import-pipeline/prepare-objective-analysis.mjs` 对本轮request/draft
  生成另存prepared，PASS，包括原正式validator；不修改原稿。
- `node scripts/import-pipeline/validate-analysis.mjs` 对本轮request/prepared PASS。
- 原稿/request摘要复核、15答案、45错项、32标注、2长句和发现引文核对PASS。

协调者逐条读完正答、错项、证据/分类、概述/情绪线、译文、长句、32标注后判
`MUST_FIX_NOT_ACCEPTED`，不是“错了7道题”，而是以下7类必改发现：
1. 无性别来源却多次写“她”；
2. 写“提前走上写作之路”，原文只有意外进入方式，没有计划日期；
3. q41仍以失业不能“发出明确要求”排除required，虚构主语限制；
4. q54把accept附加成原先抗拒、后来勉强认可；
5. q54把explain说成需要向别人说明，额外听者不是必要条件；
6. 长句把`was stringing words`整体叫表语，未分清系动词was和表语stringing words；
7. evidence 48/49/50/51/53的中文片段混入答案义或邻近信息，英文短线索没有对应。

另记录3项表达/解释疑点，不并入确定错误：recommending的“对象”含混、seeing
it happen的指代解释、embarrassed被局限为具体难堪场面。完整逐字证据与六维评价
位于同目录 `content-review.json`。原材料残片“佳 选项 。”及空sourceHash另列来源
限制，不能归罪于本轮生成，也不能绕过后直接发布。

与历史原始准备稿相比，译文标签不再替代答案译义、voice不再错译为清嗓；但性别、
require/explain问题仍在，还有长句语法误标。历史稿48794 bytes，本稿49037 bytes；
文件长度不是token或账单，不声称变便宜、变快或总体变准。没有同期随机对照。
本轮没有继续堆提示词或重复试跑；所有失败原稿和权威输入保留，不接受、不上线。

## 2026-09-16：同次调用先句子事实、后解析，未构成可靠性保障

Owner 排除依赖现成解析来源，要求从原题和权威答案自动产生可靠解析，并授权
验证一次调用内先理解再写讲解。仅本地实验，未改正式prompt/schema/导题流程。
沿用上一轮完整嘉兴完形request的全部材料、答案、doctrine和合同，仅末尾添加
`.scratch/sentence-grounding-pilot/protocol.md`：先15条sentenceGrounding，再完整
analysis准备稿。每条记录原句、主语/限定谓语/空格职责、四选项代入义、1—2个
精确上下文引文。这是可核对的事实输出，不是思维过程记录，也不是答案权威。
判据和输入摘要在生成前冻结；旧错误清单未交给worker。

线程：[句子事实先行完整稿](https://ampcode.com/threads/T-01a0a9ea-d0c1-73aa-9345-f318f16b5bf0)。
Medium普通速度features=[]；一份生成，没有第二模型或后续润色。子线程新Orb的
main不等于父线程本地task branch，通过上传request绑定本地未推送合同，不依赖
远程仓库提示词。Node24/Ajv按授权analysis-only准备。生成11:15:06Z—11:22:15Z，
429秒；外层文件60705 bytes，SHA256
`9e21815d6d5d85d949dbb93494a5d2706e3b9353b845610b8557d4038a9664a9`。

验证：
- `node .scratch/sentence-grounding-pilot/check.mjs --extract` PASS：冻结输入不变、
  15条记录/60项词义、原句/证据定位；缺题、缺选项、错原句、错引文4个反例均拒绝。
  analysis只拆外层另存，不改语义。
- `node scripts/import-pipeline/prepare-objective-analysis.mjs` 对本轮request/draft
  另存prepared PASS，含原正式validator。
- `node scripts/import-pipeline/validate-analysis.mjs` 对本轮request/prepared PASS。
- 原始摘要、analysis提取不变、15题/45错项/32标注/2长句、所有发现精确引文复核PASS。

内容裁决 `NOT_ACCEPTED_GROUNDING_NOT_A_SAFETY_GATE`。协调者完成全量阅读，
明确区分事实层与讲解层，而不以同模型两层文字相同为正确证据：
- 事实表q41允许“这件事要求我成为作家”；讲解却以“没有谁向她提出…要求”排除
  required。对无生命主语的错误限制是在讲解层新增。
- 事实表q54为“接受/解释落笔行为”，没有要求抗拒或听者；讲解再添“暗示原先
  抗拒后容纳”“需要向人说明其含义”。事实表没约束住下游扩写。
- 无性别来源仍写“她”；“目标已有一段时间”扩写成“搁置已久”。
- 事实表q51把it与有限谓语enjoy放在同一记录却未分从句：enjoy主语是I，it属于
  seeing it happen的宾语/非限定结构逻辑主语，需明确区分。
- evidence 44/47/50/51/52及第一长句标注的中文引文含英文片段没有的答案义；
  这是5条答题证据和1条结构标注，不是6道答案错误。
- q48事实表的“主语”写法、q50/51关于seeing it happen的解释另列疑点，不强行
  计为已证实错误。全文逐字证据保存于同目录content-review.json。

局部改善：q53事实表明确was为限定谓语，长句讲解正确写stringing words为表语；
此前q48/49/53英中证据错配没有复现，译文答案义仍齐全。但其他错配出现/保留，
不能从少数改善宣称总体可靠。表格生成与解释同一调用且都能看到答案，字段顺序
不能证明模型独立推断，也不能保证不再倒推理由。

上一轮382秒、49037 bytes，本轮429秒、60705 bytes（含额外表格且嵌套不同）。
没有费用/token凭证，不由字节或耗时推断账单；单次历史比较也不能证明因果。
实验结果不足以支持把该结构接入生产，或把它当低成本内容验收。冻结结果后停止，
不再自动修改规则、重跑、升级模型或发布。自动可靠解析的目标尚未通过验证。

## 2026-09-16：Owner 新 low 路由单次嘉兴完形试验

Owner 明确授权试用新 low（Owner 称已路由 DeepSeek 4.1）。线程
[新 low 完整稿](https://ampcode.com/threads/T-01a0aa08-fc85-77e3-9ce2-11f4d0194904)
以 agent_mode=low、features=[] 创建；实际后端型号未独立确认，无 token/账单凭证。
没有第二模型评审、另起生成或生产操作。与上轮 Medium 的 request 字节完全一致：
51646 bytes，SHA256 `8db67f1599c0025df006284fd8a335fa3359286572980d76b603740ac8582ba1`。
原始输出保存在 `.scratch/deepseek-low-cloze/grounded-draft.json`：83823 bytes，
SHA256 `7d20eb9d4954f2d56668a0af4185e3a3ba1fa765a70b2d0326b5be95854b0fe4`。

实验隔离有偏离：worker 额外读取 verify-i8-cloze-analysis、analyzeCloze、
analyzerProviderShell、objectiveTeachingContent、analysisTextRanges 部分实现，
并搜索准备程序。协调者发出一次范围纠正，要求停止检索、完成同一稿。
未见读取旧嘉兴稿的证据，但不能称为严格隔离的模型对照。
worker 所报最终“生成”11:56:17Z—11:56:17Z只是构建写文件时间，不能代表模型
生成耗时；此前11:55:48Z映射失败、11:56:00Z缺一条collocation-partner后修正。
最终读回11:56:32Z；没有可信的完整生成耗时，不与上轮429秒作速度比较。

父线程验证（下列相对文件均在 `.scratch/deepseek-low-cloze/`）：
- `node .scratch/deepseek-low-cloze/check.mjs --extract` PASS：输入冻结、15条记录、
  60项选项释义、精确引文及4个负例；拆出analysis未改语义。
- `node scripts/import-pipeline/prepare-objective-analysis.mjs` 对request.json、
  analysis-draft.json、analysis-prepared.json PASS，机械补全及原正式校验通过。
- `node scripts/import-pipeline/validate-analysis.mjs` 对request/prepared PASS：
  `formal single-group validation; no files written`。

协调者读完15题、事实表、译文、2条长句与32条标注，内容裁决 **NOT_ACCEPTED**。
以下为具体错误，不把它们换算为模型总体错误率：
- q48用“语法上接不上”排除reason；a great reason for calligraphy语法可成立，
  应区别语境，不应捏造语法禁令。
- q49把got around代入后解释为“绕过”，忽略题面已有to；get around to也可以接
  名词，不能用“要用 got around to doing”作为这里的排除理由。
- q50写“clearing my voice 是清嗓子”，混淆voice与throat。
- q51/q55、全文译文和第二长句反复把one self-loving letter at a time解释成
  “一次一封写给自己的信”；上下文抄诗、笔画、书法对应逐个书写字母，不是写信。
- q53称下定义“不会产生情感或思想上的回应”；q55称experience是“已经过去”
  的体验，均把语境选择写成不成立的普遍限制。
- q41仍以“并没有谁提出要求”排除required，忽略情境本身可require某行为；
  q54仍无依据地给accept加入“勉强”意味。
- q44事实表把my own personal habit称为主语组成部分，又称主句主语为
  these past few months，前后矛盾。第二长句把the lines I wrote整体叫定语从句，
  实际从句仅I wrote，lines是先行词。
- evidence-50中文多出“在纸上”，英文片段未包含on paper；第一条长句标注
  英文含a new hobby，中文仅“它帮我”，未完整对应。

疑点另列：q55直接断言let为一般现在时不足以由词形确定；“提前”“长期”等
  扩写缺乏明确来源。“他”可能是汉语泛指，不直接计为明确性别错误。
局部改善：q53事实表正确区分was和动名词表语；q54对explain采取语境排除，
未再宣称句法必须有听者；多条英中证据比前稿对齐。局部改善不能抵消上述错误。
源文残片、空sourceHash、空标间距问题保留并与生成错误分开。未修改原稿语义，
未接入正式流程、未上线；单次且有隔离偏离，不据此判定DeepSeek总体能力或性价比。

## 2026-09-16：Medium只写逐题解析，不做定位

Owner 授权一路Medium普通速度，检验定位/其他任务是否影响解析准确性。
[唯一worker](https://ampcode.com/threads/T-01a0aa49-ca83-72d9-a5fa-6a196646b8e1)
以medium、features=[]启动。只上传同组sourceGroup和authoritativeAnswers，未给
旧稿或错误清单；同时移除了原合同/doctrine、译文、长句、事实表和标注任务。
因此是整体简化任务实验，不是只改变定位一个变量的严格对照。

输入 `.scratch/medium-prose-only-cloze/source.json`：11501 bytes，SHA256
`755d3162dc9efaeac2c4112e20e9186b2f85ad9650fd258abdf743953ba37737`。
输出同目录analysis-prose.md：11221 bytes，SHA256
`54ab995b7a201b5546180d20e78df1aa94a941720af055ae6f004c25b0ed4cb8`。
worker报告只读上传输入，没有仓库搜索、依赖安装或第二轮语义审查。
开始阅读12:57:39.535Z，写完12:59:27.592Z，共108.057秒；这是阅读到写完区间，
不是纯文件写入时间。无费用/token凭证，不据此推断账单。

父线程通读全部15题与45个错项，并复核答案/选项和输入来源。完整性PASS；
正式validator不适用于本轮Markdown，未运行，不称为正式schema验收。
内容仍 **NOT_ACCEPTED**，至少两处明确错误仍在：
- q41 required：“失业这一处境本身不能提出这种要求”。require可以由处境作主语，
  如The situation required me to act，不能以没有规则/权威排除。convinced也被
  限定为劝说过程，忽略事情/证据使人信服的用法。
- q49 got around：“这里后接 to other poetry，结构和语意都不合适”。
  get around to可以接名词（如get around to the work），不能因不是doing判为
  结构不合。需要依据从爱情诗拓展到其他诗的语境比较，而不是虚构句法禁令。

较弱但仍需修正的主张单列，不与明确错误混计：q54把accept与“原先不愿面对”
和“勉强”绑定，源文不支持；q55新增“长期”修复，正文只说Recently；q46将
专业人士“说得容易”扩成实际“表现得游刃有余”；q44关于adapt的环境/情况
限定容易误导，但其末尾“来表达攀比”是语义区分，不直接判为明确禁用人宾语。

可确认的局部优点：q48不再用语法理由排除reason；q50明确区分voice/throat；
q51把letters解释为字母/文字而非信件；q55对experience以整体经历/逐步过程比较，
没有强行限定为已经过去；q52承认bond的抽象搭配可能性。它们是本稿已写内容中的
观察，不将未生成的译文/长句/标注算作“修好了”。前两项词义改善也曾在历史稿
出现，不宣称本轮独有或总体准确率提升。

结论：纯解析仍会产生实质错误，因此定位不是这些错误发生的必要条件；不能由
本轮证明定位没有影响，也不能把相对更短、更快直接等同于更可靠。没有继续付费
重试、修改原稿、接入生产或上线。本轮只保留原稿和评审记录供Owner决定。

## 2026-09-16：Owner改路由后的Medium（称Sol xhigh）纯解析

Owner再次明确授权一次。[worker线程](https://ampcode.com/threads/T-01a0aa5a-142d-72d8-8e8d-600b27a922af)
使用medium、features=[]；Sol xhigh为Owner报告的路由，工具没有独立后端凭证。
上传与上一轮字节一致的source.json，沿用同一纯解析任务（仅更新路由说明），
没有提供旧稿或错误清单。worker报告仅读source.json、一次初稿和一次完整性检查，
没有仓库搜索、依赖安装、第二模型或第二轮语义审查。

原稿 `.scratch/sol-xhigh-prose-only-cloze/analysis-prose.md`：10564 bytes，SHA256
`fcd620a8ce522d2bec088ee3d1c87ba5a603793c01ef128f372b7c85616c34b3`。
run-summary.json报告阅读前13:15:10Z到写完13:16:48Z，共98秒；上一轮108.057秒，
单次、模型路由未独立核验、无账单数据，不据此给出总体速度/成本结论。

协调者通读全部15题和45个错项，逐题核对源文、答案和选项；机械完整性PASS。
Markdown不适用正式analysis validator，未运行，不声称正式schema通过。
内容 **NOT_ACCEPTED**，明确问题如下：
- q41 required仍称“失业这一事件本身不会发出这种要求”。处境/事件可作require
  的主语，不能以非人的主语排除该词。
- q44 adapting明确说“不说使自己适应‘别人’”。adapt oneself to可以接人，
  应区分适应他人与拿自己和他人比较，不应编造搭配禁令。
- q54正确项解释突然使用“她”，源文没有提供性别，属于新增来源外事实。
- q54 explain称“文中没有解释对象”；代入时the very act of putting a pen to
  paper就是可解释的对象。源文没有解释行为，不等于没有可作宾语的对象；也不必
  显式给出听者。应以语境而非不存在对象来排除。

局部改善：q49正确把got around与后面的to一起解释为终于抽出时间处理，并依据
拓展题材而非拖延作比较，不再谎称to后不能接名词；q54 accept未附加抗拒/勉强；
q46保持“轻松表达”与艰难体验对照，未把表达等同实际能力。q48、50、51、55的
主要改善继续保留。其余如q52对balance的排除措辞偏绝对，单列为表达风险，不把
轻微争议计入上述明确错误。

本轮有可辨认的修正，也有保留/新增问题，不能据此宣称xhigh达到自动可靠解析。
原稿未修订，没有进一步付费重试、生产接入、推送或上线。

## 2026-09-16：保留蒸馏规范和六个基准案例，去掉定位任务

Owner授权一次。[worker](https://ampcode.com/threads/T-01a0aaaa-8052-774a-b4a2-b2ad126d795d)
使用medium、features=[]，实际Sol xhigh路由仍仅有Owner报告。输入保留相同的
sourceGroup与authoritativeAnswers，附完整当前clozePrompt、teachingDoctrine和
benchmark中全部6个cloze案例（原样requiredTeachingMoves/rejectIf）。这些是蒸馏
讲解要点，不是6篇完整示范解析；没有把旧生产中只有词典释义的错项当优秀范文。
最高优先级例外仅去掉定位/标注/机械结构，改Markdown；恢复简介、情绪、完整译文、
逐题解析、长句内容。与前轮同时改变规范、案例和任务量，不是单变量因果试验。

`.scratch/medium-distilled-no-location/request.json`：43939 bytes，SHA256
`0435565f390cd424b4c478a8adbeacd431c9314a0cb41f8d54b432af486d1787`。
同目录analysis-prose.md：14888 bytes，SHA256
`34b035ab6b5d3a5e5c909e45a4cf6d379349e7d7b57b3f74878fd635f647a5f9`。
worker报告14:43:16Z—14:46:24Z，188秒，含读取、写稿及一次doctrine静默检查。
仅使用上传输入、未搜索仓库、未用其他模型。无账单凭证。父线程通读全部内容；
复核15题/45错项、5段译文、2条长句、输入与原稿摘要。Markdown不适用正式
analysis validator，未运行；机械完整性不代表内容通过。

内容裁决仍NOT_ACCEPTED，但应保留具体改善，不将所有旧问题照搬：
- q44不再声称adapt不能接人，而按“适应他人/比较差距”辨析；q49继续正确处理
  got around to；q48不虚构reason语法错误；q53不再断言下定义不可能引发回应。
- q41不再明说事件不能require，而改为原文没有规定/责任。这比普遍禁令收窄，
  但仍未充分处理情境使某事必要的意思，排除理由不够稳妥。
- 字母语义在全文译文及长句均保留，没有再译成信件；第二长句正确区分先行词
  the lines与定语从句I wrote，未把整个名词短语当从句。

仍有来源外事实和不稳妥的排除说明：
1. 简介、情绪和逐题解析反复写“她”；输入没有作者性别。这是明确新增事实。
2. 简介写“毫无准备”，原文只说没料到以这种方式开始，不能推出完全没有准备。
3. q54 accept写“更像不再抗拒或承认现实”，本句不支持先前抗拒；可以只比较
   接受与享受的情感程度，无须引入心理前史。
4. q54 explain写“句中没有需要她说明的对象”。应区分没有解释行为的语境与
   没有语法宾语：代入后the very act可以作对象。此措辞会误导，但没有直接写
   “explain必须有听者”，不把它夸大成明确的听者语法禁令。

源文“佳 选项 。”被如实隔离披露。lines译为“一行行文字”有书写语境支持，
不强行判定必须译为线条。其他普通、简略表述不因不够精彩而扣为事实错误。
一次生成不能证明实例无效或定位无影响；本轮也没有达到免审核直接发布标准。
未修订原稿、未额外付费重试、未修改生产提示词、未推送或上线。
