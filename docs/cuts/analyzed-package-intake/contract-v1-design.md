# 统一解析与成品包合同 v1：设计稿

状态：Owner已确认方向并授权实施，正在落实。本文件的结构、提示词与验收仍为
设计依据，不代表已可运行的接口；实际进度见 spec.md。下文此前的暂停措辞为
讨论历史，已被实施授权取代；生产数据、发布与部署不在本次实施授权内。

依据：[字段表](./unified-field-matrix.md)、[讲解风格边界](./spec.md)、[标注补充蒸馏](./teaching-distillation-supplement.md)。
与旧 `docs/import/analyzed-package-contract.md`、未完成的包代码冲突时，本文件只代表拟议successor；不能拿旧validator通过证明新合同通过。

## 一、已经固定的产品边界

- 原卷路径：原始资料→现有源处理→Sol Medium按统一内容标准生成→Draft/Candidate→Review→独立发布。
- 成品包路径：已解析内容及答案／资源→小而明确的准入和确定性转换→同一Draft/Candidate、Review、revision、publication及rollback。不重新OCR、切分、抽图或全量解析，不静默回落到原卷路径。
- 两路径使用相同解析含义和教学风格；导题者写一次，Paper页与配套解析PDF使用同一份内容。不是两套讲解，不让renderer临时编写推理。
- 保留现有解题方向与分类、证据、推导、权威边界。参考册只提供讲清楚、自然、恰好讲透的表达启发，不替代我们的解题体系。
- teachingNote、语法个人framework/path、两种写作精选表达、旧continuationDesign退出新生产和活跃消费。新续写四区及证据保留。
- 本轮以NCK1整套卷为单位，不设计任意考试、逐题发布、历史批量迁移或生产删卷。相似评分和通用extensions不纳入v1实现目标；保留其需要的信息即可。

## 二、先区分拟议接口和现有事实

| 已查代码 | 真实约束 | v1设计后果 |
| --- | --- | --- |
| `server/paper-canonical/nck1MaterializationAdapter.mjs:28–94,415–570` | kind固定；输入materializationBytes/documents/media，可选音频描述；重放DOCX段落和媒体配方 | 外部包不能套该kind再跳过验证，也不能伪造DOCX/OCR证明 |
| `schemas/paper-canonical/nck1-source-materialization-v1.schema.json:15–116` | 九组笔试、45个笔试客观答案；听力另有20题/20答案/10份transcript；source定位到document | “完整包”不是仅九份解析；旧schema不能直接表示新译文关系和外部来源类型 |
| `shared/paper-canonical/nck1SourceMaterialization.mjs` | 共享内容、源引用、写作notice、给定文本等验证 | 语义规则继续复用；新来源信任模型需显式适配，不复制notice正则 |
| `server/import-review/revisionProjection.mjs:89–202,1067–1132`、`singlePaperPromotion.mjs:171–207` | revision和promotion都会从封存输入重建candidate | 新入口的来源类型与转换必须贯穿重建／恢复，不只在上传前做一次临时转换 |
| `server/paper-import/listeningAudioEvidence.mjs:6–36`、`revisionProjection.mjs:110–135` | captured听力现须音频原件/playback/ASR/check；缺比较与安全证据拒绝 | 外部已完成听力包要有明确审核证据政策，不伪造passed ASR/check；现路径保持不变 |
| `server/import-review/nck1AnalysisProjection.mjs:36–54,376–426` | 九份分析→五sidecar，无听力教学层 | 新教学层和新版字段需要投影与消费一起接通，不能只加ZIP文件 |

建议来源方案：为完整外部包增加显式的版本化source adapter（名字暂定 `nck1-analyzed-package`）。它保留所收原始包字节及来源声明，对包内事实、答案、引用做确定性准入，并明确标识“外部转录／分析，待Owner审核”。复用共享内容校验和后续Canonical生命周期，不冒充原件重提取证明。该方案触及共享来源authority，必须遵循仓库高风险评审／验证门；此文不是绕过现行门禁的授权。

## 三、统一解析数据的逻辑结构

以下给出v1候选字段名。技术实现可沿用现有文件位置；新增传输结构不等于把全部内部sidecar搬成另一套数据库。

### 3.1 包与内容顶层

```text
package.json
  contractVersion: "eqb-analyzed-package-v1"  （拟议，尚未注册）
  profileId: "nck1"
  packageId: 外部稳定交付ID
  paper: { externalPaperId, title, provenance }
  files: [{ path, role }]                    （完整文件清单）

content.json
  paper / groups / materials / questions / resources
answers.json
  objective: [{ questionId, value, sourceId }]
  officialModels: [{ groupId, text, sourceId }] （真实提供才有）
sources.json
  [{ sourceId, role, description, suppliedBy, path? }]
analysis.json
  contractVersion
  texts: [{ textId, ownerId, purpose, paragraphs: [{ paragraphId, text }] }]
  groups: { groupId: 题型专属解析 }
  questions: { questionId: 小题解析 }
  annotations: [见3.3]
```

- `content.json`保留原题层：段落、表格、框内给定文本、题干选项、空位和写作要求的语义形状沿用共享合同；正式schema以共享定义引用落地，不在包层自创表格/notice格式。将来源locator与内容规则分开复用，不能为了通过旧locator规则伪造页码。
- `materials`首先用于听力10个segment及其questionIds；笔试的段落/题组身份仍用原有结构，不再重复保存同一篇文章。
- 外部ID在包内唯一且稳定，原题序号另存。首次接收后EQB保存外部→内部ID映射；修正版不得按数组下标重新编号。目标paper/revision由OPS操作绑定，不接受包自行决定修改谁。
- 来源声明可以指向所附官方文件，也可指Owner提供的官方答案转录及出处；JSON答案键能证明“提交了什么”，不能证明“真是官方”。声明与Owner审核共同形成归属证据，禁止把外部AI推测写作官方答案。
- Owner已确认原始题卷/官方PDF作为可选核对附件；包本身必须完整、自足。若随包附原件只上传一次，不额外要求第二次上传，更不因此重做OCR。来源政策见第八节。

### 3.2 各题型内容布局与生产分工

下表是字段表的压缩映射；细考点/诊断内部叶结构沿用现行合同，不借传输改造重定义解析方向。

| 题型 | 新版逻辑内容 | 从旧字段到新交付 |
| --- | --- | --- |
| 阅读 | introduction、全文翻译引用、discourseStructure、selectedLongSentences；小题skill/similarityProfile/questionFocus/stemTranslationZh/optionAnalysis/locationParaphrases | summary/overview仅一个简介源值，组织摘要另留；段落function必须消费；证据推导不能缩成首条note |
| 七选五 | introduction、完成态全文翻译、discourseStructure、selectedLongSentences；逐空位置/作用/机制、contextEvidence、mechanismSignals、optionFit、keyDistractors | 去teachingNote；主机制解释不退化成标签；补空位置与上下文依据分开 |
| 完形 | introduction、完成态译文、条件affectiveArc、selectedLongSentences；pos、条件signatureFacet、correctFit、三项distractorGlosses、evidence | introduction兼顾事件发展用于后续相似，不再独立生成similaritySummary；去teachingNote |
| 语法 | introduction、完成态译文、selectedLongSentences；blank事实、facetKey、answer、条件role、similarityProfile、reason/evidence | 去path/framework/teachingNote；route不是快慢path。tense/voice/agreementSensitive/form/similarityForm继续由服务端按现有规则派生，不要求外部模型填 |
| 应用文 | reviewCard三组八项＋modelAnswer；officialModelAnswer条件提供 | 主题/目的和读者/关系在结构中可分辨，页面可合并；points随题数；去type重复展示项及highlightExpressions，不删内部范文规划 |
| 续写 | storyUnderstanding、continuationContract、developmentPlan、modelAnswer；语言一致性作为生成约束 | developmentPlan合并narrativeDevelopment/paragraphBlueprint重复内容：paragraphIndex、cause/action/result、sourceEvidence、cluePayoffs、bridge/ending；条件情绪/关系变化。旧有非重复证据要映射保留，不默默drop；旧continuationDesign/精选表达不进新内容 |
| 听力 | 每材料transcript引用、翻译引用、topic、introduction；每题stem/options翻译、answer引用、evidence、reason、条件distractors | 新教学内容，与10个稳定segment绑定；topic为theme/themeGroup/subtopic完整父子路径；一个主话题。20–40字总结同值供教学和后续相似 |

阅读/七选/完形/语法简介50–80汉字软目标；翻译和范文不设置统一机械长度。相似精细字段保留现有受控值和含义，不承诺v1实现新的排名算法。

一份解析是一个逻辑交付，并不强迫一个模型上下文包办整卷。原卷仍按题组调用既定Sol Medium，writer汇总；外部工具亦可分组制作再校验关联。

### 3.3 标注候选结构

#### 已实施编码选择：题组内 `objective-teaching-content-v1`

本轮采用题组内 `groups[groupId].teachingContent` 附件，不建全局sidecar。这样
四类客观题的staged analysis、发布sidecar、Paper页和配套解析PDF沿用同一个
revision快照，不复制题组／题目身份。新原卷生成与外部成品包完整准入都要求：

- `schemaVersion: "objective-teaching-content-v1"`、`sourceAssetVersion`、
  `sourceTextId`；版本必须与分析和Candidate一致，修订后旧关系直接拒绝；
- `translation` 只声明 `textId`、`legacyField: "fullTranslationZh"` 和
  `paragraphs[]`。每个中文段落含稳定`paragraphId`、已有
  `sourceParagraphIds`及对唯一`fullTranslationZh`值的精确
  `start/end/quote`切片；不保存第二份译文源值；
- `completedSourceTexts[]`仅保存程序可由原段落和权威答案重算一致的补全态文本，
  不覆盖Canonical原题空位；`answer-evidence`只能引用原题文本，
  `answer-insertion`只能引用该补全态并绑定一个真实`blankId`；
- `annotations[]`为闭键对象，范围统一为
  `{textId,paragraphId,start,end,quote}`。三种kind固定为
  `answer-evidence`、`answer-insertion`、`sentence-structure`；后者通过新增稳定
  `selectedLongSentences[].sentenceId`关联长难句。题目数组天然表达多题共享，
  多范围及重叠不合并身份；
- 范围统一按Unicode码点左闭右开校验，保留CRLF、组合字符及空白原样。
  图像证据继续使用既有figure/source object reference，不进入文本范围附件。

历史sidecar仍可读取原`fullTranslationZh`和旧唯一可定位的`underlineTexts`；
renderer不再把正文中的`[36]`猜成标注。新生产和完整包准入不得走该兼容分支。

```json
{
  "annotationId": "a-q24-e1",
  "kind": "answer-evidence",
  "questionIds": ["q24"],
  "sourceRanges": [
    {"textId":"source-b", "paragraphId":"p1", "start":0, "end":8, "quote":"She left"}
  ],
  "translationRanges": [
    {"textId":"translation-b", "paragraphId":"zh-p1", "start":0, "end":4, "quote":"她离开了"}
  ]
}
```

上例仅说明中英范围机制，不是完整小题、实际答案证据或可导入样卷。

- `start/end`拟用Unicode码点、左闭右开；接收器与两端共用同一转换规则，不用JS UTF-16索引偷换，也不隐式trim/换行归一化。`quote`必须与精确切片相同。英文标点、emoji、CRLF等加入测试。
- textId指向确定版本文本；原题直接引用现有段落，translation指向texts中的译文段落，不重复复制原文。段落身份不靠翻译的第几个换行猜测；一段可译成多段，显式关联。
- `kind`拟限定：`answer-evidence`、`answer-insertion`、`sentence-structure`。译文对应是前两类关系的目标范围，不另生成中文“证据文章”。
- answer-evidence允许多题、多源范围、多译文范围；缺某个范围必须按该材料语言/来源明确处理，不伪造引用。图表沿用已有共享源对象锚点的分支，正式编码需在schema中显式引用，不将图表坐标混进文本offset。
- answer-insertion绑定一个空，在按官方答案确定性补全后的英文文本和中文翻译标范围；原题仍保留空。英文补入不唯一时靠范围精确定位；中文虚词对应短语/分句，不强求一个汉字对一个英文词。
- sentence-structure关联selectedLongSentences原句与displayText；旧underlineTexts可在唯一精确出现时确定性转换。重复时须补精确范围，不能选择第一个或静默不画线。
- 重叠范围合法，保留全部题目关联；PDF可合并重叠线段并显示排序去重后的题号，Paper可按当前题高亮。底层不得因视觉合并丢关系。
- 新版规范化文本不嵌HTML/Markdown下划线，也不在译文中手写 `[题号]`；两端由annotation和真实questionNo产生标记。旧译文标记只能经明确版本转换，不能任意从正文删除类似`[36]`的正常内容。
- 现有同义改写/证据对象仍负责“为什么成立”；annotation只说明在哪里，不取代reason、trap和关系解释。已有证据到annotation优先程序投影，不要求AI重复写相同引文两遍。

## 四、准入、持久化与round-trip

### 4.1 小而明确的检查

| 层次 | 阻止进入可审核完整revision | 只提示／交Owner审核 |
| --- | --- | --- |
| 文件 | 路径逃逸、链接、加密、重复/大小写冲突、超限、未声明文件、缺引用资源、非法JSON | 无原件附件按待确认来源政策提示，不假装已验原件 |
| 结构 | NCK1题型/题数不闭合，官方答案缺失/冲突，ID错绑，必需分析缺失，受控分类非法，未知活跃字段 | 简介略短/长、适用性与解释质量；不强制情感弧、干扰项数量跨题型通用 |
| 关联 | quote不匹配范围、跨材料题号、未知text/paragraph、无效时间段、修改文本后旧标注失效 | 多题共享证据或合理重叠本身不是错；没有分段时间不算失败 |
| 语义转换 | 共享内容validator或确定性candidate编译失败 | 解题是否讲透、外部转录/官方来源是否可信，Review直接检查，不再调模型全量验证 |

v1不接受任意extensions；未知字段返回file/JSON pointer/code/message/相关ID，禁止静默剥离。用户确需额外内容时先评估successor，不塞进无法检索展示的任意metadata。

包大小暂沿用已写的包层限制作为候选：压缩与展开均≤256MiB、单文件≤64MiB、≤1024条目。须用真实整套音频pilot验证容量，不到时临时绕过限制。资源MIME须检查实际格式，外部URL不自动下载执行。

### 4.2 保存与生命周期

- 封存实际上传字节、内部摘要、外部来源声明、ID映射、合同版本和确定性转换版本；包自己不签发Candidate、确认或发布身份。
- Canonical继续负责原题与稳定显示语义；教学内容保留版本化sidecar及关联文本。统一源值派生到兼容sidecar、DB简介/主题及教师消费者，不分别调用AI重写。
- 听力三层topic映射到材料级记录，不能把10材料硬塞两section标签。新的材料级表/索引或sidecar落点由实现遵循现有持久化边界选择，需revision可恢复及不破坏旧group筛选。
- topic/summary写入正式检索只在发布同一revision时进行；Review草稿不得污染正式题库。重建、失败恢复和rollback都由精确publication关联回对应sidecar/投影，不能只回滚试卷而留新主题。
- 音频建议包内交付可播放MP3与原文，选附分段起止/独立切片；EQB检查字节、时长及时间范围。外部听力不得伪造ASR通过收据，是否与原稿一致由专门Owner Review项确认。若现有内容安全门有独立要求，必须经评审保留其检测目标，不以“不重解”删除安全门。
- 修正版交完整包，通过OPS选既有paper及expectedRevision；过期返回冲突，不覆盖新修订。新增、删除或重新编号小题产生明确结构差异，不能默认为全新卷或按位置强制对齐。
- 重复网络提交靠服务端operation/idempotency记录返回同一结果；packageId不是单独去重权威。相同ID不同字节报冲突；相同内容主动另建试卷须显式操作，不能误触发。

### 4.3 导出→再导入规则

1. **原始包存档**按字节保存，用于审计；**标准化再导出**是统一合同输出，不承诺ZIP字节完全相同。
2. 同一合同版本的规范化内容再导入，文本、源层顺序、官方答案、全部保留的题型内容、topic、annotation范围和资源bytes必须等价；差异仅限EQB重新签发的内部状态/ID映射及明确可重算字段。
3. 兼容summary/overview/similaritySummary从一个introduction投影；不得把两个不一致旧值随便选一个。旧数据冲突明确提示/拒绝自动转换，不批量迁移。
4. 退役字段不进v1活跃内容；旧原始附件存档可保留它们，但不导出成新必需字段或恢复显示。
5. 修改译文时相应范围必须一并更新；旧revision仍可重现旧标注。修正版审核绑定新revision，旧认可不得继承。
6. 导出不能仅拼当前latest若干文件；以一个确定revision/publication快照读取全部内容，避免跨版本混包。
7. 无法表达的非退役字段必须报告，不用“格式转换”名义丢失。v1外部导出器上线前要有语义比较测试；字段覆盖尚未完成时不得称无损。

## 五、外部AI生成提示词草案

本节供Owner审阅，不是当前生产可执行prompt。正式分发必须随附：冻结版schema/字段表、共享题型合同、经过退役修订的Teaching Analysis Style及离线validator。不能让外部工具自行访问仓库或猜未定义结构。

> 你要制作一套NCK1完整教学解析包，而非只做OCR预处理。它将供EQB Paper页和配套解析PDF使用，同一份内容只写一次。
>
> 输入包括：Owner提供的原题材料、官方答案及其出处、实际图片/音频，以及随本提示提供的版本化输出合同。先核对原题与答案是否属于同一卷；缺关键原题、答案或不明归属时停止并列出具体缺项，不自己解题补成“官方答案”。
>
> **优先级**：原题事实和官方答案权威→EQB题型内容/字段合同→EQB共享讲解风格。参考答案册只启发讲解方式，不是内容权威，不复制其整段解析，不以它覆盖EQB分析方向。
>
> **讲解总口令**：先讲人话，再给名字；先讲这道题为什么，再讲这类题怎么看。还原现场，指出真正连接的关系，补出必要暗步；错项说清诱因和放回语境的错处；结论不超过证据。简单题一句说透就停，难题充分解释，不为凑模块重复。
>
> **逐题型**：阅读按题问、证据、改写/推导讲清，保留三个错误项辨析；七选五讲空前—补入—空后的真实衔接；完形讲正答和三项干扰的语境义、诱因、不成立处；语法讲句中职责和答案形式，不套个人快慢路径、不编造干扰项；听力每材料一话题和一句总结，每题讲原话怎样经替换/推断/计算得到官方答案。
>
> **文章与标注**：阅读/七选五/完形/语法简介只写一份，50–80汉字软目标，听力20–40；翻译完整自然。补空先按官方答案完成英文再译。精确关联题目、原文证据、译文范围和补入位置；同题多处/多题共用允许。虚词没有独立中文词时定位相关短语，不硬译。阅读/七选五/完形/语法每组长难句1–2句，优先既关键又难，说明主干、修饰和关系；划线仅标真正有用片段，听力不新增长难句模块。
>
> **写作**：应用文按基本审题、内容要求、读者意识三组八项写审题卡，要点按原题实际数量。续写按故事理解、续写边界、两段发展方案、完整范文四区；保留源证据与开放路线。官方范文与生成范文分开，范文不得违背给定行/首句/词数要求。
>
> 不输出teachingNote、个人framework/path、highlightExpressions或旧continuationDesign。不因参考册有词汇/背诵栏目就新增合同外字段。不要另生成PDF专用解析、HTML、CSS、发布批准或伪造的模型/审核/ASR收据。
>
> 按随附合同组织文件和稳定ID，资源仅用包内声明的相对路径。可以按题组分别制作再汇总，不能串组或用上下文不足的猜测填字段。已解析素材无需重新OCR；只有输入尚未转录时才由外部制作过程完成所需提取。
>
> 交付前运行随附离线validator并修正结构/引用/答案一致性问题，再自检是否有省略暗步、术语代替解释、夸大结论或重复内容。报告真实结果，不伪称Owner已审核。不具备执行工具时如实说明未验证，不捏造PASS。最终交一个完整ZIP；有阻塞则交缺项报告而非假完整包。

原卷EQB生成也使用同样题型与风格要求，仅来源处理、模型身份与内部派生由EQB执行；外部工具不需要伪装成Sol。

## 六、完整pilot计划（仅计划，尚未执行）

### Pilot素材与两个入口

选择Owner有权提供的一套完整NCK1原题、官方1–65答案、写作题和听力：10段材料/20题及整套MP3，包含长阅读、图表或框文、长译文和续写。优先选满足条件的单套真题，不为演示修改原题。若缺重复短语/重叠标注等边界，另用自有最小fixture检验，不把伪造边界塞进真卷。

原卷在隔离环境走既定Sol生成；以它的统一规范化输出导出成品包，再在另一隔离命名空间按包路径导入，以消除两次AI输出差异。额外检查一份由外部工具独立按提示制作的同卷包：不要求措辞相同，但所有权威与结构约束一致。

| 验收面 | 能抓住错误实现的输入与断言 |
| --- | --- |
| 无重解 | 包入口给OCR/模型/裁图调用安置会报错的测试替身；仍可到Review。原卷路径必须仍实际调用正确生成/提取链，不用同一禁用开关污染原卷 |
| 标注 | 一题两处、两题共用、重复quote第二次出现、emoji前后码点、范围重叠、虚词中译分别验证精确slice和两端显示；不能只看有下划线 |
| 原题隔离 | 填答案后的译文/显示句不会回写原题空位；学生试卷不泄答案或讲解，教师端看到官方答案 |
| 解析内容 | 阅读function、完整推导与四项译文；七选五连接链；完形三项语境辨析；语法无framework/path/teachingNote；应用文三组八项；续写四区且无旧字段；听力10份教学层 |
| 分类与搜索 | 发布前正式库无新增主题/简介；隔离发布后查询真实列表/主题接口取得同一introduction及完整三级topic；旧相似路由保持支持范围，不声称新排名已实现 |
| 来源与音频 | 有原件／无原件政策各测；同包声明外部转录，不能伪装OCR证明。整MP3无时间戳能保留音频，不能声称逐句播放；不公开原始审计/ASR私件 |
| 两端渲染 | 精确pilot URL/登录/起始状态预备；Paper点题定位和翻译关联，PDF首页、图表、密集标号、长难句、长译文跨栏跨页、两段范文；截图并逐张检查，不能只渲染成功 |
| 无损往返 | 规范化导出→再导入比较全部保留字段/关系/资源hash；故意丢一个function或多题关联应失败；不是只比较题数 |
| 修正版 | 改一处译文但不改offset应拒绝；正确修订形成新revision，旧revision不变；过期expectedRevision拒绝，同操作重试不多建卷 |
| 恢复回滚 | 隔离发布/投影失败后读回身份再恢复；rollback试卷、解析、DB简介/topic、媒体版本一起回到对应快照，不复用旧审批或误发生产 |

实施中的窄验证：受影响题型validator、标注范围测试、包准入及review public-seam；最终由于共享Canonical来源/持久化变化，按仓库执行verify:paper及受影响Screen/Print/PDF，一次verify:all和独立Standards/Spec评审。结果以实际PASS/FAIL/SKIP记录，不能把计划写成通过。

Owner QA交付按现有handoff模板准备真实服务、登录、数据与第一状态；提供可访问portal与已检查截图。设计阶段不启动部署、不触碰正式题库。

## 七、实施顺序与非目标

1. 确认本设计，冻结来源政策、统一结构及兼容映射，保留现有受控分析方向。
2. 实现统一解析内容/标注的validator与投影、更新共享风格及题型prompt退役规则；再接两端消费者并用隔离fixture验证。
3. 实现外部来源adapter及revision重建、音频政策；接原卷输出与成品包到同一规范化结果。
4. 接现有OPS完整包上传/修正版，统一持久化/发布检索映射；按pilot实测与Owner QA收口。

同一工作树单writer；本轮同步UI工作不动，后续共享模块变更需明确协调。原先未完成包实现只作现状，不当v1完成。无新相似算法、任意extensions、历史批量更新、自动发布或生产删除。

## 八、Owner已确认的来源政策

Owner已确认：**完整包不强制附原始PDF/DOCX，必须交完整原题、官方答案转录与出处、完整解析和所需资源；可附原件供审核，不需要另外上传一次。来源明确标为外部提交，Owner审核，不伪造原件重放或ASR证明。**

无原件时，系统检查包内完整性和对应关系，不声称已证明与原卷逐字一致；转录准确性依靠制作与审核。有原件时方便对照，但不因此重新识别、切题或写整套解析。此确认取代前文的“来源政策待确认”措辞。

这是接受证据方式的改变，不只是文件格式调整；现有源码尚不支持，不能假称复用旧adapter即可完成。此项设计确认本身不恢复实现，也不免除共享来源接入的评审与验证。

其余结构和范围编码为本稿的工程推荐，Owner可按教学可用性审核，不需要选择底层库或字段排列。听力安全检查政策在接入评审中必须保留真实检测目标；不把Owner内容审核当取消安全门的通行证。
