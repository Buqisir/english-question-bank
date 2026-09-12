# 统一内容与解析字段表（Owner 审阅稿）

状态：设计盘点，不是已冻结的 JSON Schema，不授权实现、历史补写或发布。
依据：[逐项确认笔记](./spec.md)。两条输入路径共用本表：原卷路径按标准生成；成品包路径提供同等内容并接受检查，不全量重解。

Owner已确认第12节全部收口决定。前文盘点中的“简介合并／语法字数待定”、
“续写旧字段候补”和“听力标签层级待确认”由第12节取代；代码现状记录仍有效。

## 怎么读

- **保留**：已确认保留的语义，或现行字段没有获得删除授权；不表示当前端到端都已实现。
- **条件**：只在实际适用时填写，缺少不适用内容不能算失败。
- **退役**：已明确退出新生成要求和活跃消费，历史文件不批量改写。
- **待定／候补**：不能擅自加成必填，也不能因暂时未消费就删除。
- 表中英文路径是现行定位，不是新版字段名承诺。重复目的应复用一个值，但字段合并与兼容映射仍需设计。
- 以下“教学页”指现有题库讲解界面，不等同于导入 Owner Review。“教师 PDF”也区分配套解析 PDF 和组卷教师版。
- 自动准入检查类型、数量、ID、来源引用、官方答案一致性、资源闭合；准确性和解释质量交由 Owner Review，字数软目标不变成机械拒收线。

## 1. 保存、生产与消费的证据索引

| 编号 | 真实路径与作用 | 当前边界 |
| --- | --- | --- |
| S1 | `server/import-review/nck1AnalysisProjection.mjs:36–54,280–426`：九个 staged 输入→阅读、七选、完形、语法、写作五个 sidecar；`revisionProjection.mjs:1092–1133` 暴露 `analysisSidecars` | 没有听力教学解析 sidecar；校验投影不是重新生成 |
| S2 | `server/paper-import/storage.mjs:390–494,550–621`：`paper-assets/{paperId}/versions/vN/analyses/*.json`，同步 `latest/analyses`；答案另存 `answer-key.json` | 文件保存与数据库检索字段不是同一条写入链；解析没有因此回填 `questions.explanation` |
| S3 | `server/api.mjs:962–990,1180–1238,1308–1345`：`question_group_topic_labels`；`1688–1740,3891–3913`：`passages.summary` 及列表读取／写入 | 主题与列表简介是独立 DB enrichment，不是仅放进 sidecar 就自动进入列表检索 |
| G1 | `prompts/reading-choice-analysis-v1.md:176–405`；`server/paper-import-ai/analyzeReading.mjs` | 阅读生成输出合同与运行时校验 |
| G2 | `prompts/seven-choices-analysis-v1.md:84–221`；`analyzeSevenChoices.mjs:122–230` | 七选五生成输出与校验，后者位于 `server/paper-import-ai/` |
| G3 | `prompts/cloze-analysis-v1.md:91–201`；`server/paper-import-ai/analyzeCloze.mjs:125–229` | prompt 要求与兼容 validator 的实际必填程度不能混为一谈 |
| G4 | `prompts/grammar-fill-analysis-v1.md:148–243`；`server/paper-import-ai/analyzeGrammarFill.mjs:216–243,324–468` | 文件名 v1，内部 schema 为 v2；AI 输出与服务端派生字段分工不同 |
| G5 | `prompts/application-writing-model-answer-v3.md`、`application-writing-staged-analysis-v1.md:8–40` | 范文生产指导＋staged 审题卡输出封装 |
| G6 | `prompts/continuation-analysis-v1.md`、`continuation-writing-staged-analysis-v1.md:8–53`；`app/src/domain/continuationAnalysis.ts:39–165` | 续写现有五区分析＋范文；四区整合尚未实施 |
| G7 | `server/api.mjs:3332–3368` 主题／简介提示词 | 主题选完整三级标签、通常1–3个，含理由和置信度；简介仍要求80–140字符，与新约定不同 |
| U1 | `app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts`、`PaperAssetAnalysisPanel.tsx` | 阅读数据转换与教学页；段落 function 未被结构转换消费 |
| U2 | 同目录 `sevenChoicesSurfaceAdapter.ts`、`SevenChoicesAnalysisPanel.tsx` | 七选五教学页；明确不显示 teachingNote |
| U3 | 同目录 `clozeAnalysisSurfaceAdapter.ts`、`ClozeAnalysisPanel.tsx` | 完形教学页；overview／affectiveArc、正答与干扰辨析，teachingNote 不显示 |
| U4 | 同目录 `grammarFillAnalysisSurfaceAdapter.ts`、`GrammarFillAnalysisPanel.tsx:89–163` | 语法仍显示 framework、reason、role/path；teachingNote 不显示 |
| U5 | `app/src/features/paper-browse/PaperBrowsePage.tsx:919–935,1238–1350,2984–3105`；同目录 `ContinuationAnalysisPanel.tsx` | sidecar 加载与题型分派，写作／续写界面；不等于每个底层叶字段都完整展示 |
| P1 | `server/exports/companionAnalysisRenderer.mjs:200–312,362–418`；`exportRoutes.mjs:38–53` | 配套解析 PDF 实际选择字段渲染，不是 sidecar 全量打印；没有听力分支 |
| P2 | `server/draft-paper/analysisText.mjs:1–30,73–136,222–254`；`draftPaperStore.mjs:795–823` | 组卷教师版拼接短解析（最多600字符），听力排除；尚有“点拨”拼接。不能当全文解析 PDF |
| P3 | `server/import-review/reviewPagination.mjs` | Review 试卷打印／分页链路，不是 P1；不得声称有 sidecar 就已经能在 Review 检查全部教学字段 |
| Q1 | `app/src/services/similarQuestions.ts:4–53` → `PaperBrowsePage.tsx:2200–2214`；后端 `server/search/similarQuestions.mjs:895–941` → store | 实际页面调用小题／篇章两个 API，不只是未接入的工具函数 |
| Q2 | `server/search/teachingFacets.mjs:25–55` 及 `extractGroupFacets`；`similarQuestions.mjs:414–525,565–610,635–692,760–855` | 读取四类客观题 sidecar；篇章同话题入池；小题仅阅读／语法，读 skill／facet／role 等。无写作／听力支持 |

本次核对对象是当前工作树，不声称与最新生产完全一致；没有运行生产数据库查询。行号用于定位，后续改动可能使其偏移。

## 2. 公共层（所有题型）

| 中文字段／现行定位 | 含义与交付规则 | 状态、生产和准入 | 保存／使用与缺失后果 |
| --- | --- | --- | --- |
| 试卷、题组、材料、小题身份与覆盖关系 | 稳定 ID、题型、顺序、题号；例如一段听力覆盖6–7题 | 保留；原题提取或包转写，程序检查唯一性和闭合，不由解析自由改编号 | Canonical／paper asset 原题结构；所有消费者依赖，错绑会把答案和解析挂错题 |
| 原题内容 | 段落、题干、选项／选项库、空位与提示词、写作要求／给定文本 | 保留；忠实原题，不用答案补全后的讲解文本覆盖原题 | 原题层＋共享 renderer；缺失不能组成可用试卷 |
| 资源及引用 | 图像、音频与所属材料；图注／文字保留语义 | 实际引用资源必须闭合；没有原题资源不能伪造。包内文件形式尚待接口阶段 | 资源文件＋原题引用；关系错误导致漏图、错音频；不接受外部 CSS 代替语义 |
| 官方答案 | 客观题正答，写作官方参考范文如有 | 客观题保留；官方范文条件。Owner提供权威，AI只转写；重复答案字段须与权威一致 | S2答案及写作 officialModelAnswer 投影；学生试卷隐藏，教师版使用；不许生成答案冒充官方 |
| 分析版本与绑定信息 | 现行 schemaVersion/paperId/sourceAssetVersion/targetGroups/meta | 机制保留；新版外部元数据精确集合待定。真实生成来源／Owner审核分别由可信流程记录 | S1/S2；兼容 reviewStatus 不代表审批；外部不能伪造发布身份 |
| 主题标签 | 主题—主题群—子主题，含 label/reason/confidence | 保留现有分类基础；G7生成，原卷／包的具体统一写入要接通S3；听力另见第9节 | S3列表筛选、Q2相似确实读取标签；理由与置信度不是当前排名维度 |
| 篇章简介 | 当前 DB summary／sidecar overview 有不同生产路径 | 阅读、七选、完形50–80汉字软目标；语法确认只产一份但长度尚未明确 | S3列表与各教学页/P1；重复字段收敛见决策点，不默默丢其中一份 |

## 3. 阅读理解

存储：`reading-choice-analysis-v1.json`；生产 G1；投影 S1、保存 S2。下表均须让 Owner 可审核，现有 Review 全字段呈现尚未证明。

| 中文字段／现行路径 | 含义、规则与状态 | 教学页／教师PDF／搜索相似现状；缺失后果 |
| --- | --- | --- |
| 篇章简介 `groups[].overview`／DB `summary` | 保留内容，50–80字；是否合为一个值待定，不与文章组织混写 | U1/P1用overview，S3用summary；缺失影响选题预览与讲解背景 |
| 全文翻译 `fullTranslationZh` | 必须保留，完整按原顺序译，保留段落，不夹解析 | P1明确读取；U1该桥接类型没有此字段，其他页面入口须单独验收；Q2不读；缺失丢整篇中文理解支持 |
| 长难句 `selectedLongSentences[]` | 保留1–2句。子项 paragraphId/sourceText/displayText/relatedQuestionIds/translationZh/analysisZh/underlineTexts：原句定位、讲解展示句、关联题、翻译、主干关系分析、关键划线 | 优先难的解题关键句；关键句简单则选理解关键的难句，不只挑最长。P1读取，Q2不读；缺失丢句法教学及定位 |
| 段落摘要 `discourseStructure.paragraphs[].summary` | 必须保留；写每段说什么，paragraphId绑定原段 | U1结构读取；P1不读discourseStructure；Q2不读 |
| 段落作用 `paragraphs[].function` | 必须保留；如何推进或联系其他段，不能只写“承上启下” | 当前U1未映射，P1未读，是已知消费缺口；不能因此判废字段 |
| 全文组织 `discourseStructure.summary` | 必须保留；段落怎样组成全文，不重复大意、不强套结构标签 | U1读取、P1未读、Q2不读；缺失看不到文章组织 |
| 小题题型 `skill.primary/secondary` | 保留；primary受控，secondary仅适用时推断 | U1题型标签，Q2确实读primary参与小题相似；不等于所有二级属性都被消费 |
| 精细解题类型 `similarityProfile.family/subtype/detailScope/technique` | 现行新生成要求；保留候补，不擅自删除。细节范围／写作手法按题型适用 | G1生产／校验；当前Q2未读取此profile，不能声称已驱动相似；不应和旧skill重复人工维护 |
| 考查焦点 `questionFocus` | 保留；此题究竟问什么，不拿翻译代替推理 | U1/P1/P2读，Q2不按该文本匹配 |
| 题干翻译 `stemTranslationZh` | 必须保留，翻译不泄露额外提示 | U1/P1读；P2不全量输出；Q2不读 |
| 四项翻译与对错 `optionAnalysis[].label/optionTranslationZh/status` | 必须保留；A–D齐全、一个correct且与官方一致 | U1全项，P1主要显示干扰项译文，不是四项全量；缺失无法逐项讲解 |
| 正答依据 `optionAnalysis[].evidence[]` | 必须保留；role/paragraphId/quote/anchor，原文精确引用、主证据在先 | U1/P1/P2读；Q2不读；只报答案不能替代 |
| 干扰诊断 `trap`、`trapEvidence[]` | 三个错误项均保留具体解释及现行诊断结构；原词诱惑与实际错因要分清 | U1/P1/P2选择消费，含现有suspension显示限制；不能把内部挂起机制当外部包自主审核权限 |
| 原文—选项对应 `locationParaphrases[]` | 保留原文定位、选项表达和关系解释，具体叶字段沿用G1，不另建标签体系 | U1读，P1只取部分targetText及首条note；Q2不读；“字段有值”不代表所有对应关系都输出 |

## 4. 七选五

存储：`seven-choices-analysis-v1.json`；生产 G2；S1/S2。

| 中文字段／现行路径 | 含义、规则与状态 | 消费与缺失后果 |
| --- | --- | --- |
| 简介 `groups[].overview`／DB summary | 保留，50–80字；不把每空衔接解释塞进简介；两个现行值如何统一待定 | U2/P1与S3分读；缺失影响整体理解 |
| 全文翻译 `fullTranslationZh` | 沿用现行要求：按官方句子补全翻译，各空保留一次对应题号标记 | P1读；不覆盖原题带空文本；缺失失去补全后的连续理解 |
| 长难句 `selectedLongSentences[]` | 沿用G2的1–2句及阅读同族子字段；sourceText保留空标、displayText按官方答案确定补全 | P1读；源定位与补全一致性必须检查，不能把补全句当原文引用 |
| 文章组织 `discourseStructure.summary/units[]` | 保留；unitId/heading/paragraphIds/summary，分单元说明内容组织；标题条件适用 | U2转换结构，P1没有完整单元渲染；缺失影响宏观衔接解释 |
| 空位身份 `blankId` | 必须保留，绑定小题 | 错绑会让解释指向别空 |
| 位置／作用／机制 `positionFacet/roleFacet/primaryMechanismFacet/supportingMechanismFacets` | 保留；主机制明确、辅助机制有证据才填 | Q2的教学维度索引读取；当前七选不做小题相似，不能把筛选与相似评分混同 |
| 主题线索 `topicClues[]` | 保留上下文词线索，不等同S3整篇主题标签 | U2读；不是当前相似主题门槛的数据源 |
| 上下文证据 `contextEvidence` | paragraphId/headingAnchor/beforeQuote/afterQuote，标题锚条件适用；空前空后真实引用 | U2/P1读空前空后；边界处无前／后文不能杜撰 |
| 机制信号 `mechanismSignals[]` | mechanismFacet/signalText/signalSide/targetText/relation：哪个词与哪里构成什么关系 | U2使用；P1没有全量展开；缺失只剩抽象机制名 |
| 正答契合 `optionFit` | correctOptionLabel/fitSummary/matchedClues；后者contextSide/optionSide/relation | U2读，P1取fitSummary；官方一致性必检，讲清跨空连接 |
| 关键干扰 `keyDistractors[]` | optionLabel/reason；讲有迷惑性的错接点，不铺陈所有未选句 | U2读，P1目前只取首个；多条保存不代表多条打印 |
| 教学提示 `teachingNote` | **退役** | G2/validator仍要求，U2已隐藏，P2仍有点拨：须联动移除，不改历史文件 |

## 5. 完形填空

存储：`cloze-analysis-v1.json`；生产 G3；S1/S2。

| 中文字段／现行路径 | 含义、规则与状态 | 消费与缺失后果 |
| --- | --- | --- |
| 简介 `overview`／DB summary | 保留50–80字内容简介；不强行升华 | U3/P1与S3分读 |
| 情感走向 `affectiveArc` | **条件**：文章真实存在情绪发展才保留；无情感弧不算不完整 | U3可显示，P1不读；G3仍写required，需要改合同 |
| 相似摘要 `similaritySummary` | 当前G3要求一句“处境—事件—发展／转变”；与新统一复用原则的映射待定 | 当前Q2不读取，没有据此可声称的embedding索引；不要额外强制生成另一篇重复简介 |
| 全文翻译／长难句 | `fullTranslationZh`、`selectedLongSentences[]`，沿用补答案、题号标记及1–2句要求 | P1明确读取；同七选区分原句与补全句 |
| 空位／词性／特征 `blankId/blankNo/pos/signatureFacet` | 身份与词性保留，signatureFacet仅真实适用时填受控值 | 教学维度索引读取pos/signature；当前相似为整篇话题匹配，不做逐空配相似 |
| 正答解释 `correctFit.optionLabel/reason` | 保留；恢复事件／句子关系，再说语境怎样锁定答案 | U3/P1/P2读reason；标签如提供必须与官方一致 |
| 三项辨析 `distractorGlosses[].optionLabel/optionText/meaning` | 必须保留：语境义＋为什么诱人＋放回此处搭配／事件关系哪里不成立，不是词典释义 | U3/P1/P2读；空字符串检查无法证明搭配力讲清楚 |
| 依据 `evidence[].type/signalText/signalSide/targetText/relation` | 保留，G3现要求至少一条collocation-partner；证据须对应真实搭配关系 | U3并非逐条全量展示、P1只渲染解释和辨析；不可声称其已参与Q2排名 |
| 教学提示 `teachingNote` | **退役** | 提示词／validator仍要求、U3隐藏、P2仍拼接 |

## 6. 语法填空

存储：`grammar-fill-analysis-v1.json`，内部v2；生产 G4；S1/S2。

| 中文字段／现行路径 | 含义、规则与状态 | 消费与缺失后果 |
| --- | --- | --- |
| 统一简介 `overview`／DB summary | 已确认只生成一个内容值，列表／教学复用；是否50–80字待确认 | 当前分路生成保存；U4/P1及S3需接同值 |
| 全文翻译／长难句 | `fullTranslationZh/selectedLongSentences[]`，沿用官方补空、题号及精确源引用要求 | P1读；不因为历史文件缺失而降新标准 |
| 空位事实 `blankId/blankNo/blankType/hint` | 必须保留，given用原提示词，无提示hint为null；不是AI判断题面 | U4使用提示词；错绑／改词将改变题意 |
| 官方形式 `answer` | 保留且与官方权威一致，非模型另解出一份答案 | U4/P1/P2读；重复字段只能作一致投影 |
| 细考点 `facetKey` | 保留现行22叶考点，不把Owner个人解题方法强加给读者 | 教学筛选／Q2真实读取；删掉会损失细粒度检索 |
| 非谓语成分 `role` | **条件保留**：非谓语适用，其他null；主语／定语／状语等真实语法职责 | U4及Q2非谓语相似真实读；不能随path一起删 |
| 自然解题过程 `reason` | 必须保留；依据句法、语境推出形式，简单题短说，难题充分说；不强制固定步骤 | U4目前标题“代入”，P1/P2读；不是旧framework，不能误删 |
| 证据 `evidence[]` | 保留真实句中依据；具体结构沿用G4，定位检查与内容判断分开 | U4有证据展示路径，P1主要显示reason；Q2不以全文证据匹配 |
| 语境解题画像 `similarityProfile.route/features` | 现行G4要求，route是为什么选该形式，不等于个人快慢path；候补保留、不误退役 | 生成校验存在，当前Q2未读取该profile；消费接入另列，不承诺已上线 |
| 形式派生 `tense/voice/agreementSensitive/form/similarityForm` | 条件保留；现行服务端按答案等确定派生，prompt禁止AI自行填；不是新增外部必填 | Q2确实读取谓语向量／非谓语form用于理由；各派生叶字段消费不一，不应统称全部参与排名 |
| 个人快慢路径 `path` | **退役**，与上面的route严格区分 | G4条件必填、U4徽标仍显示，后续一并移除 |
| 固定考点框架 `framework` | **退役**：现行adapter/registry提供的通用步骤／表格，不是每空AI实际生成字段 | U4仍展开；删显示与生成依赖不能误删facet分类本身 |
| 教学提示 `teachingNote` | **退役** | G4/validator与P2仍有，U4不显示 |

## 7. 应用文

存储：`writing-analysis-v1.json → groups[groupId].writing`；生产 G5；S1/S2。以下是语义八项，不强定新版JSON命名。

| 中文字段／现行对应 | 要求与状态 | 消费与缺口 |
| --- | --- | --- |
| 写作形式 `reviewCard.form` | 保留，如邮件／通知；基本审题第1项 | U5/P1现有卡片消费；Q2不支持写作 |
| 主题与目的 `topic + readerWants` | 保留；基本审题第2项；显示组合但检索可分别识别 | 后续相似主维度，当前尚未实现；不把同话题误判同交际目的 |
| 人称 `person` | 保留；基本审题第3项，说明适用人称 | 教学用，非主要相似维度 |
| 时态 `tense` | 保留；基本审题第4项，必要切换说清 | 教学用，非主要相似维度 |
| 内容要点 `points[]` | 保留；内容要求组。数量随原题，不固定两个；明确要求与合理补充分开 | G5当前exactly two，与新决定冲突，需改生成／校验／呈现 |
| 读者与关系 `reader + readerWho` | 合并语义；读者意识第1项 | 未来相似辅助维度；不得编造读者身份 |
| 读者需要 `readerCares` | 保留；读者意识第2项：理解、判断、回应需要什么信息 | 教学用，不与价值落点合并 |
| 价值落点 `value` | 保留；读者意识第3项，具体可用价值，不强升华 | 教学用，非主排名输入 |
| 展示语篇类型 `reviewCard.type` | 与写作形式重叠的显示项不另要求；内部生成计划的type不因此退役 | 当前staged仍要求type，需精确区分显示删减和范文内部规划 |
| 生成范文 `modelAnswer` | 必须保留；依照原题instruction/groupPassage/wordCountTarget/applicationGiven，保留给定行顺序，完整实现要求 | U5/P1；不同于条件存在的officialModelAnswer；不以范文措辞做主相似 |
| 内部关系规划 | G5中的relationship/readerContribution/coreAct/relationshipRisk/relationshipMoves/moveOrder等 | 保留生产指导，不自动新增为外部包必交或页面全部展示字段 |
| 精选表达 `highlightExpressions` | **退役（应用文）** | G5已禁止生成，P1仍无条件调用历史表达渲染；需消费侧收口 |

## 8. 读后续写

存储：writing sidecar内 `continuationAnalysis`＋`modelAnswer`；生产 G6；S1/S2。四个教学区已确认；现有叶字段是否合并保存尚未冻结。

| 中文字段／现行分区及叶字段 | 新标准要求／状态 | 消费与缺口 |
| --- | --- | --- |
| 故事核心与背景 `storyUnderstanding.centralSituation/sourceEndState/narrativePerspective/timeAndPlaceFrame/sourceStyle` | 保留原故事理解与语言依据；事实和判断绑定证据；无需每个底层属性占一块页面 | U5；P1只取核心、终点等部分，不是整区全量 |
| 人物、关系与因果 `characters/relationships/causalChain` | 保留人物动机、关系与事件因果；动机归故事理解，不重复生成另一份清单 | U5选读；P1未全量打印；缺失容易写出不符合原人物的行为 |
| 问题、线索与主题 `unresolvedProblem/usableClues/meaningDirection` | 保留；主题含statement/confidence/evidence，不强拔高 | P1读问题／主题；未来相似用核心处境＋有证据主题＋未决问题，Q2目前不支持 |
| 续写边界 `continuationContract.hardConstraints/softAffordances/openChoices/forbiddenContradictions/closureRequirements` | 保留硬要求、可用条件、创作自由和禁矛盾，不能拿选定方案冒充硬要求 | U5，P1主要取hardConstraints/forbiddenContradictions；需保留源依据 |
| 两段题面约束 `continuationContract.paragraphs[]` | paragraphIndex/entryState/starterFunction/requiredMoves/requiredExitState/supportedOptions；区分必须达到的状态和可选动作 | 未来相似结构维度，当前未消费于Q2；范文必须守原段首句 |
| 发展方案 `narrativeDevelopment` | coreTension/drivingMotivations/requiredTurningPoints/eventChain/emotionLogic/relationshipMovement/interactionMoves/cluePayoffs/endingState | 与下行整合为一个两段方案，非逐项删数据；情绪／关系变化条件适用，不机械填满 |
| 两段蓝图 `paragraphBlueprint` | selectedRoute/routeRationale/paragraphs/finalEffect/validAlternativeRoutes/qualityRisks；paragraphs含narrativeFunction/eventMoves/characterActionsAndReactions/evidenceToReuse/stateChange/bridgeToNext | U5/P1选择读取；整合因果—动作—结果、回扣、段间衔接，避免重复发展链 |
| 语言一致性 `languageAlignment` | personAndPerspective/baseTense/licensedTenseShifts/narrativeDistanceAndRegister/sourceStyleContinuity/cohesionPlan/dialoguePolicy/descriptionPriorities/functionLedLanguage/languageRisks | 保留生成约束；不默认整块长清单展示。任务特有提醒内嵌方案，是否持久化全部叶字段待映射 |
| 完整范文 `modelAnswer` | 必须保留两个完整英文段落，精确使用给定首句、实现选定路线 | U5/P1读取；官方范文如有独立显示，不加重复范文评语 |
| 旧 `continuationDesign/highlightExpressions` | 历史兼容候补；现行G6禁止新生成，不因应用文退役决定就自动删续写历史字段 | P1仍有fallback／表达渲染；是否退出活跃呈现需单独确认 |

GroundedStatement、Constraint、EvidenceRef等内部证据子结构沿用现行续写schema，暂不复制成另一份合同；四区精简不授权删除证据。

## 9. 听力

目前S1的九组／五sidecar不含以下教学层；P1和Q2也没有听力分支。表中是已确认目标，不是已实现字段名或保存承诺。

| 中文字段 | 内容与要求 | 生产／保存／消费差距及缺失后果 |
| --- | --- | --- |
| 材料身份、原文、所辖小题 | 当前NCK1十段材料：5短对话＋5长对话／独白；不是两个section，也不是20份独立材料 | 原题层已有听力，教学层需绑定材料稳定ID；错粒度会错贴主题、译文与音频 |
| 原文来源 | 官方听力稿、ASR转录、AI解析分开 | 不把机器转录标成官方稿；具体来源字段映射待接入设计 |
| 每段全文翻译 | 必须保留，自然完整翻译，绑定同一材料 | 需新增生成输出、sidecar/持久化和审核／教学消费，不能只加prompt |
| 每段一个话题 | 必须保留主话题，同段小题共享，不同段可以相同 | 复用分类基础但粒度不能套题组DB直接宣称可用；标签层级待确认 |
| 每段一句话总结 | 必须保留，20–40汉字软目标，复杂材料可稍长；写人物／场景／内容，不堆答案 | 同值用于教学和未来相似；先话题后总结，过滤还是排序、评分实现均未定 |
| 每题题干、三个选项翻译 | 必须保留，选项对应准确、不夹答案提示 | 新教学层；缺失无法完整逐题讲解 |
| 官方答案、原文依据与解题过程 | 必须保留；原话怎样经同义替换、推断或计算导向答案 | 答案复用权威；解析证据需材料内定位，不新增全量解题验收 |
| 必要干扰辨析 | 条件：时间、地点、人物、否定／改口等确需辨析时讲清 | 不强迫两个错误项各写一段，不引入teachingNote |
| 整套音频／分段音频／起止时间 | 按实际资源保存，可只给整套音频；不强迫十个文件，不造时间戳 | 当前具体资源转换与播放定位路径需后续逐项核对；没有分段信息就不承诺精确跳转 |

## 10. 真实仓库数据抽查（不是生产覆盖率）

只读抽查 `app/public/paper-assets/paper-zj-2026-jan/latest/analyses/`，用Node读取对象键，没有复制试卷正文：

| sidecar | 样本结构证据 | 能得出的结论 |
| --- | --- | --- |
| reading | 4组／15题；首组overview,discourseStructure；首题skill,questionFocus,stemTranslationZh,optionAnalysis,locationParaphrases | 该样本首组没有全文翻译／长难句，首题没有新similarityProfile；不能说prompt要求已覆盖旧卷 |
| seven | 1组／5题；首组overview,discourseStructure；小题仍有teachingNote | 新合同与历史资产不同，不授权历史补写 |
| cloze | 1组／15空；组只有overview,affectiveArc；首空仍有teachingNote | 样本没有similaritySummary／翻译／长难句 |
| grammar | 1组／10空；内部schema v2；组只有overview；首空有role,path,reason,teachingNote,form | 细考点升级不代表所有新增解析字段齐备 |
| writing | 应用文：taskType,modelAnswer,highlightExpressions；续写另有continuationDesign | 该样本不是最新reviewCard／continuationAnalysis结构，不能拿它证明新八项或四区已完整落地 |

这是一个历史样本的键级抽查，不推断所有卷子同样缺失；也未对真实DB的topic/summary覆盖率下结论。

## 11. 必须改的已确认差距（不是再请Owner选一次）

1. 原卷与包共用内容标准；prompt、validator、投影、持久化和消费者必须一起对齐，不只改字段名。
2. teachingNote三题型退役；语法framework/path退役；应用文精选表达退役；不能只隐藏而继续强制生成。
3. 简介长度更新、语法简介单值复用；完形affectiveArc从强制变条件。
4. 阅读段落function到教师端的真实消费补齐；每个目标PDF分别验收，不把P1/P2/P3混为一条链。
5. 应用文三组八项、要点随题；续写四区去重复，但保留语义证据和生成约束。
6. 听力教学层和材料级主题／总结需要新的完整生产保存消费路径；旧“九组分析齐了”不再代表全套成品齐全。
7. S3主题／简介独立DB与S2 sidecar需要明确导入映射和修订一致性。当前Q2不读新profile/summary，相关相似设计是未来消费，不假称已上线。

## 12. Owner已确认的收口决定

以下五项已确认，适用于原卷生成和成品包输入。技术存储映射、校验器复用、ID转换仍由后续设计给方案；此确认不恢复实现。

1. **简介统一**：阅读／七选／完形／语法的列表和教学复用同一份内容简介，段落摘要与全文组织另留。完形相似摘要所需的事件发展信息纳入该简介，不再为检索额外生成重复内容。旧字段兼容映射不能造成信息静默丢失。
2. **简介字数**：上述四类统一50–80汉字软目标；听力保持20–40字，不机械凑字或按软目标拒收。
3. **讲解与PDF交付**：教学页和配套解析PDF提供完整约定教学内容；普通教师试卷允许短解析。Review须能审核完整内容，不强制全部挤进试卷分页；具体布局尚未冻结。
4. **续写旧精选表达／旧设计退役**：`highlightExpressions`和`continuationDesign`退出新生成、成品包要求和活跃教学／导出消费，不仅是默认折叠。历史文件保留，不授权批量删除或重写；兼容读取不得重新显示退役内容。此决定不退役新的`continuationAnalysis`及其四区内容。
5. **听力话题三层齐全**：每材料一个主话题，必须同时保留主题、主题群、子主题及其正确层级关系；不是三个独立话题，也不能只保存最细标签而丢失上层。字段编码随后设计，相似评分和各层的匹配权重仍留后续校准。

`similarityProfile`的受控子类、未来评分权重和extensions不在本轮自动冻结；先保留已存在的有意义信息，等相似任务核对消费者再决定，不能以“可能无用”为由删掉。
