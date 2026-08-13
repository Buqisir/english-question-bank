# 记叙型读后续写标准解析字段 V1

Status: implemented; narrative only. New papers persist `continuationAnalysis` +
`modelAnswer` into `writing-analysis-v1` and display the five parts in lecture.
Historical assets may still carry `continuationDesign` / `highlightExpressions`.

## 1. V1 决定

V1 新定义一个 `continuationAnalysis` 字段，只服务**以记叙为主导、靠事件发展完成
续写的读后续写任务**。

它在设计层面取代现有的：

```ts
continuationDesign: {
  theme: string
  paragraphs: [string, string]
}
```

旧结构把真正需要分别判断的原文理解、人物动机、因果链、段首句约束、开放空间、
线索回收和语言衔接压进了三段自由文本，过浅且难以复核。新 V1 不继承旧字段，也
不以兼容旧形状为设计目标。

本轮工程化范围包括 JSON Schema、运行时校验、AI 消息构建、Provider seam 和聚焦
验证。旧 `writing-analysis-v1`、真实资产和 UI 的删除或迁移，留到后续生产任务
单独处理。

实现入口：

- Schema：`schemas/paper-import/continuation-analysis-v1.schema.json`
- Agent Prompt：`prompts/continuation-analysis-v1.md`
- 运行时模块：`server/paper-import-ai/analyzeNarrativeContinuation.mjs`
- 聚焦验证：`scripts/verify-continuation-analysis-v1.mjs`

## 2. 范文质量目标

后续由本字段支持的范文，应稳定对齐当前五档评分中的第五档，目标约 22—23 分：

- 内容完整、合理，与原文情境及两个段首句融洽；
- 情节有充分的因果支撑，人物反应符合已建立的性格、处境和动机；
- 语言准确、得体、有变化，但仍是优秀高中生可以学习和复现的英语；
- 两段之间以及续写与原文之间衔接自然，全文连贯。

`22—23` 是范文设计质量目标，不是自动评分结果。V1 不保存 `targetScore`，也不
产生 `predictedScore`、分项权重或机械扣分。

生成范文、独立内容复核和实际持久化均不在本轮范围内。

## 3. 适用边界

### 支持

- 事件推动型故事；
- 问题解决型故事；
- 人物选择或成长型故事；
- 关系修复型故事；
- 以记叙为主、局部包含描写、对话或简短说明的故事。

### 暂不支持

- 以解释知识或概念为核心的说明型续写；
- 以立场、理由和证据为核心的议论型续写；
- 说明或议论功能决定任务成败的混合型续写。

不支持的任务必须显式停止，不能被强行翻译成人物冲突、情绪曲线或故事高潮。
“Qiuyu”中文名字任务的核心包含解释与跨文化沟通，陈康的议论型实验题也超出 V1；
二者留给未来版本。

## 4. 证据边界

字段只采用本轮提供资料，优先级如下：

1. 实际题面、原文和两个段首句；
2. 官方年度试题分析与当前评分维度；
3. 2025 年修订课标，结合 2020 年课标对读后续写的明确说明；
4. 陈康的命题、效果验证与语篇研究；
5. 陈玉松、张琳、赵杰等教学研究；
6. 本文对上述资料的字段化综合。

教学外脑不参与 V1 字段取舍。来源笔记入口：
[`../sources/continuation-writing/README.md`](../sources/continuation-writing/README.md)。

## 5. 领域定位

`continuationAnalysis` 是完整 **Writing Task** 的派生解析。题面、原文和两个段首句
仍由 Writing Task 持有，本字段不得复制整篇原文，也不得成为唯一答案权威。

它是后续范文生成所需的**任务理解与成文规划**，不是：

- 唯一正确结局；
- 通用故事套路；
- 自动评分表；
- 高级词、复杂句或连接词清单；
- 脱离题面的道德结尾或“主题升华”。

## 6. 字段总形状

```ts
type ContinuationAnalysisV1 = {
  schemaVersion: 'continuation-analysis-v1'
  storyUnderstanding: StoryUnderstanding
  continuationContract: ContinuationContract
  narrativeDevelopment: NarrativeDevelopment
  languageAlignment: LanguageAlignment
  paragraphBlueprint: ParagraphBlueprint
}
```

五个部分全部必填。每一部分只承担一种职责：

| 部分 | 回答的问题 |
| --- | --- |
| `storyUnderstanding` | 原文已经建立了什么故事世界 |
| `continuationContract` | 续写必须、适宜、可以和绝不能写什么 |
| `narrativeDevelopment` | 人物动机与因果关系应怎样推动故事 |
| `languageAlignment` | 续写语言怎样与原文和叙事功能保持一致 |
| `paragraphBlueprint` | 选定的一条有效路线怎样分配到两个段落 |

### 6.1 通用证据结构

```ts
type EvidenceRef = {
  source: 'instruction' | 'material' | 'paragraph1Starter' | 'paragraph2Starter'
  excerpt: string
}

type GroundedStatement = {
  statement: string
  evidence: EvidenceRef[]
}
```

`excerpt` 只保留能够定位判断的最短原文片段，不复制完整 Passage。凡是声称“原文
已经说明”“段首句要求”或“人物一定会”的内容，都必须有证据。

作者可以自由创造的内容放入 `openChoices` 或 `selectedRoute`，不能伪装成原文事实。

## 7. 五个必填部分

### 7.1 `storyUnderstanding`

来源性质：**资料直接支持与多源综合；字段分组属于工程设计。**

```ts
type StoryUnderstanding = {
  centralSituation: GroundedStatement
  sourceEndState: GroundedStatement
  narrativePerspective: GroundedStatement
  timeAndPlaceFrame: GroundedStatement
  characters: Array<{
    name: string
    role: string
    establishedTraits: GroundedStatement[]
    motivations: GroundedStatement[]
    currentState: GroundedStatement
  }>
  relationships: Array<{
    participants: [string, string]
    currentRelation: GroundedStatement
  }>
  causalChain: Array<{
    cause: GroundedStatement
    effect: GroundedStatement
  }>
  unresolvedProblem: GroundedStatement
  usableClues: GroundedStatement[]
  meaningDirection: {
    statement: string
    confidence: 'explicit' | 'stronglyInferred' | 'open'
    evidence: EvidenceRef[]
  }
  sourceStyle: GroundedStatement
}
```

规则：

- 人物特征必须从行动、语言、处境或他人反应中推断，不能贴空标签；
- `causalChain` 只保留会影响续写方向的关系，不复述全文；
- `unresolvedProblem` 是原文结束时仍需处理的核心问题，不等于强制制造冲突；
- `meaningDirection` 可以是关系改善、认识变化、责任承担或问题解决，不要求结尾
  明说大道理；
- `sourceStyle` 描述可观察特征，例如叙述距离、对话密度、句式节奏和描写方式，
  不写“高级、生动”等空标签。

### 7.2 `continuationContract`

来源性质：**段首句约束关系由资料直接支持；硬约束、软条件和开放空间的正式分类
属于字段化综合。**

```ts
type ContinuationConstraint = GroundedStatement & {
  id: string
}

type ParagraphContract = {
  paragraphIndex: 1 | 2
  entryState: GroundedStatement
  starterFunction: GroundedStatement
  requiredMoves: ContinuationConstraint[]
  requiredExitState: ContinuationConstraint[]
  supportedOptions: GroundedStatement[]
}

type ContinuationContract = {
  hardConstraints: ContinuationConstraint[]
  softAffordances: GroundedStatement[]
  openChoices: string[]
  forbiddenContradictions: ContinuationConstraint[]
  paragraphs: [ParagraphContract, ParagraphContract]
  closureRequirements: ContinuationConstraint[]
}
```

三类空间必须严格区分：

- `hardConstraints`：违反后会与题面事实、段首句或必要的段间状态冲突；
- `softAffordances`：原文线索明确支持、采用后通常更自然，但不是唯一合法路径；
- `openChoices`：题面没有确定、允许作者合理创造的内容。

段落状态链固定为：

```text
原文结束状态
→ 第一段首句设定的进入状态
→ 第一段必须达到的退出状态
→ 第二段首句设定的进入状态
→ 全文最终状态
```

第二段首句对第一段的反向约束必须写进第一段 `requiredExitState`。这是 V1 最重要
的结构规则，不能只在第二段解释。

### 7.3 `narrativeDevelopment`

来源性质：**人物、冲突、因果和线索回收来自记叙型资料；结构化表达属于工程设计。**

```ts
type NarrativeDevelopment = {
  coreTension: GroundedStatement
  drivingMotivations: GroundedStatement[]
  requiredTurningPoints: GroundedStatement[]
  eventChain: Array<{
    cause: string
    event: string
    immediateEffect: string
    evidence: EvidenceRef[]
  }>
  emotionLogic: Array<{
    trigger: string
    internalResponse: string
    visibleAction: string
  }>
  relationshipMovement: Array<{
    participants: [string, string]
    from: string
    to: string
    cause: string
  }>
  interactionMoves: Array<{
    speaker: string
    listener: string
    purpose: string
    relationshipNeed: string
    expectedEffect: string
    evidence: EvidenceRef[]
  }>
  cluePayoffs: Array<{
    clue: EvidenceRef
    payoff: string
  }>
  endingState: string
}
```

规则：

- `coreTension` 可以是困难、误解、选择或未完成目标，不要求激烈冲突；
- `eventChain` 中每个关键事件都要能回答“为什么发生”和“造成了什么”；
- `emotionLogic` 必须形成“触发因素 → 内在反应 → 可见行动”，不能堆砌突然的
  紧张、泪水、温暖或感动；
- `relationshipMovement` 只在关系确实发生变化时记录，允许空数组；
- `interactionMoves` 处理道歉、请求、安慰、说服和关系修复等人物交际动作；重点是
  它在关系中要完成什么，而不是机械加入一段对话；
- `cluePayoffs` 回收真正服务后续的原文线索，不要求把所有细节重新出现；
- `endingState` 应解决或转化核心问题，同时保留题面允许的开放性。

### 7.4 `languageAlignment`

来源性质：**资料直接支持。**

```ts
type LanguageAlignment = {
  personAndPerspective: string
  baseTense: string
  licensedTenseShifts: string[]
  narrativeDistanceAndRegister: string
  sourceStyleContinuity: string
  cohesionPlan: Array<{
    relation: 'sequence' | 'cause' | 'contrast' | 'reference' | 'echo'
    use: string
  }>
  dialoguePolicy: string
  descriptionPriorities: string[]
  functionLedLanguage: string[]
  languageRisks: string[]
}
```

规则：

- 描述语言形式承担什么叙事功能，而不是规定高级词、从句或连接词数量；
- 人称、视角和主时态必须延续原文，必要切换要有明确叙事理由；
- `dialoguePolicy` 依据原文风格和事件需要决定，不强制每篇加入对话；
- `descriptionPriorities` 只选本题真正需要的动作、心理、环境或感官细节，允许只
  重点处理其中一两类；
- 语言目标是准确、自然、有变化、学生可学，不靠生僻词和炫技结构制造高分感。

### 7.5 `paragraphBlueprint`

来源性质：**资料支持多条合理路径与必要依赖；选择一条路线并分配到两段属于
工程设计。**

```ts
type ParagraphBlueprint = {
  selectedRoute: string
  routeRationale: GroundedStatement[]
  paragraphs: [
    {
      paragraphIndex: 1
      narrativeFunction: string
      eventMoves: string[]
      characterActionsAndReactions: string[]
      evidenceToReuse: EvidenceRef[]
      stateChange: string
      bridgeToNext: string
    },
    {
      paragraphIndex: 2
      narrativeFunction: string
      eventMoves: string[]
      characterActionsAndReactions: string[]
      evidenceToReuse: EvidenceRef[]
      stateChange: string
      bridgeToNext: string
    }
  ]
  finalEffect: string
  validAlternativeRoutes: string[]
  qualityRisks: string[]
}
```

`selectedRoute` 是后续生成一篇范文时采用的一种有效实现。它不能删除
`validAlternativeRoutes`，也不能把官方分析中的可选细节升级成唯一答案。

`qualityRisks` 只记录会直接损害第五档表现的题目专属风险，例如：

- 第一段没有达到第二段首句预设的状态；
- 关键事件缺少原因，只靠巧合推进；
- 人物突然改变立场，没有触发因素和可见行动；
- 与原文人物关系、事实或时间地点矛盾；
- 两段重复同一事件，没有新的状态变化；
- 结尾突然添加原文不支持的宏大主题。

## 8. 必填与允许为空规则

| 字段 | 规则 |
| --- | --- |
| 五个顶层部分 | 全部必填 |
| `GroundedStatement.evidence` | 题面事实、推断和约束至少一条；开放创作除外 |
| `characters` | 至少包含推动核心问题的主要人物 |
| `causalChain` | 至少覆盖原文中直接决定续写起点的因果关系 |
| `paragraphs` | 恰好两段，并分别绑定两个给定段首句 |
| 第一段 `requiredExitState` | 必须包含第二段首句反向要求的状态 |
| `eventChain` | 覆盖所有必要转折，不设置固定事件数量 |
| `relationshipMovement` | 没有关系变化时允许为空数组 |
| `interactionMoves` | 没有关键人物交际动作时允许为空数组 |
| `cluePayoffs` | 没有需要显式回收的线索时允许为空数组 |
| `validAlternativeRoutes` | 允许为空数组，但不得声称当前路线是唯一答案 |

## 9. 明确禁止的字段和代理指标

V1 不包含：

- `predictedScore`、`scoreBreakdown`、评分权重；
- `advancedWordCount`、`complexSentenceCount`、`connectorCount`；
- 固定数量的动作、心理、环境或对话描写；
- 固定情绪曲线和统一的“危机—救援—感动—升华”模板；
- `requiredMoralEnding` 或脱离题面的主题拔高；
- `uniqueCorrectEnding`；
- 已退出当前题型的划线关键词覆盖要求；
- 从未发布的原故事结局倒推出的所谓标准情节。

## 10. 接受门

一份 `continuationAnalysis` 只有同时满足以下条件才可进入人工复核：

1. 任务确实以记叙和事件发展为主；否则明确报告 V1 不支持；
2. 完整读取实际题面、原文和两个段首句；
3. 所有题面事实、人物推断和硬约束都有最短证据片段；
4. 没有把软条件或开放选择写成必须发生；
5. 第一段退出状态能够无矛盾地进入第二段首句；
6. 关键事件具备原因、行动和结果，人物情绪能够落实到行为；
7. 规划回扣必要原文线索，但不机械复述全文；
8. 语言要求按叙事功能提出，没有数量崇拜或炫技要求；
9. 两段各自发生有效状态变化，结尾解决或转化原文核心问题；
10. 规划足以支持第五档、约 22—23 分范文，但不输出分数预测；
11. 不复制完整原文，不携带模型思维过程、评分推理或教学外脑材料。

## 11. 三类记叙题压力检查

| 记叙场景 | V1 主要检验点 | V1 避免的问题 |
| --- | --- | --- |
| 母亲节早餐 | 第二段首句反向要求第一段先解决早餐失败；人物帮助和行动形成因果链 | 只写孩子焦急、母亲感动，中间没有解决过程 |
| Gunter 出租车故事 | 原文事实、人物选择、行动后果和结局之间形成完整状态变化 | 用通用善良模板替代题目专属因果 |
| 兄弟、狗与道歉 | 认识错误、修复动机、到达门口、道歉与关系修复逐步发生 | 人物突然和好，缺少反思与修复行动 |

这三类均为记叙，但分别压测问题解决、人物选择和关系修复。V1 不需要说明型或
议论型模块也能容纳它们。

## 12. 暂不决定

以下事项留到后续单独讨论：

- 旧 `continuationDesign` 的删除、迁移与历史资产处理；
- 说明型、议论型及核心功能为解释的混合型 V2。

教师端讲评已按五段字段 + `modelAnswer` 展示新卷；旧卷仍读历史
`continuationDesign`。JSON Schema / 运行时校验 / Prompt 已在本仓库落地。
