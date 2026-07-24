# 应用文讲评 1.0：单篇竖切实施规划

- **仓库**：`Buqisir/english-question-bank`
- **规划基线**：`main@4ed02871b2cd57872b3174c2aabfb781acfd3273`
- **落盘位置**：`docs/cuts/application-writing-v1/spec.md`
- **下一阶段**：按本 spec 下已批准的 tracer-bullet tickets 顺序执行，本文件只定义产品与工程合同
- **风险级别**：High
  原因：修改写作解析数据合同、生成管线、持久化规则和 PaperSurface 讲评呈现；需要一条 fresh `$code-review` lineage 与真实浏览器 owner QA。

---

## 1. 一句话目标

用一篇真实的新课标高考应用文，打通以下最小闭环：

> 完整题面 → 按本规划锁定的生成提示词产出 AI 参考范文 → 独立内容复核 → 配入现有审题卡 → 录入官方范文 → 校验并持久化为 `writing-analysis-v1.json` → 讲评态同时呈现 AI 参考范文、官方范文和现有审题卡。

本次不是整卷导题 Agent，也不是应用文全量回填；只做一个可验证、可复制的应用文 1.0 竖切。

---

## 2. 教师任务

老师打开一篇应用文讲评时，只需要三样东西：

1. **AI 参考范文**：按照明确的高考 13—15 分档生成合同写成，语言“够得着的好”，不是炫技范文。
2. **官方范文**：若答案材料提供，则忠实呈现原文，不由 AI 改写或补写。
3. **审题卡**：完全沿用当前 `ReviewCard` 合同，不在本次重新设计字段。

除此之外，本次不增加高分句块、逐句赏析、失分点、评分细则、课堂提问、板书建议或交互式批改。

---

## 3. 当前代码现实

### 3.1 已存在的应用文解析合同

当前 `ApplicationWritingAnalysis` 为：

```ts
type ApplicationWritingAnalysis = {
  taskType: 'application'
  modelAnswer: string
  reviewCard?: ReviewCard
  highlightExpressions: HighlightExpression[]
}
```

其中：

- `modelAnswer` 当前保存 AI 生成范文；
- `reviewCard` 已有完整合同；
- `highlightExpressions` 当前为必填；
- 旧的 `audit` 只属于 agent 生成中间结果，持久化服务会丢弃，不进入 paper asset。

### 3.2 当前生成器与新合同冲突

当前 `server/paper-import-ai/analyzeWritingAnalysis.mjs` 要求模型返回 JSON：

```json
{
  "taskType": "application",
  "audit": {},
  "modelAnswer": "...",
  "highlightExpressions": []
}
```

而 owner 新锁定的生成合同要求：

> 模型在内部完成审题，最终只输出完整英文成文，不输出 JSON、audit、解释、评分或词数。

因此不能只替换几句提示词；必须把“范文生成”与“解析候选 JSON 组装”分开。

### 3.3 当前讲评面仍是两套硬编码试点

`RetainedWritingLecture.tsx` 目前只允许：

- `group-2022-i-writing-application`
- `group-2024-i-writing-application`

完整 `modelAnswer + reviewCard` 时：

- 左侧原答题框显示 `modelAnswer`；
- 右侧只显示 `reviewCard`；
- 不显示亮点表达。

本次应把它从“硬编码两套试点”升级为“由完整数据决定是否可用”，但只用一篇新应用文做验收。

---

## 4. 锁定决定

### D1. 不建立新的 `audit` 持久化字段

新提示词中的审题过程全部留在模型内部：

- 不要求模型输出 `audit`；
- 不新增 `audit` schema；
- 不在 UI 展示思考过程；
- 不长期存储模型的中间推理。

### D2. 保留 `modelAnswer` 的既有语义

为避免迁移历史资产：

- `modelAnswer` 继续表示 **AI 参考范文**；
- 不把它改名为 `aiModelAnswer`；
- 历史 `writing-analysis-v1.json` 无需迁移。

### D3. 新增一个可选持久化字段

应用文新增：

```ts
officialModelAnswer?: string
```

语义：

- 仅保存答案材料真实提供的官方范文；
- 有则逐字忠实录入；
- 没有则省略字段；
- 禁止空字符串、占位语；
- 禁止 AI 生成后冒充官方范文。

只允许清理版面噪音，例如 PDF/DOCX 强制换行、页眉页脚、重复空格；不得润色、改词或修正疑似原文错误而不留痕。

### D4. 审题卡完全沿用现有合同

继续使用：

```ts
type ReviewCard = {
  form: string
  topic: string
  reader: string
  person: string
  tense: string
  type: string
  points: [string, string]
  readerWho: string
  readerCares: string
  readerWants: string
  value: string
}
```

本次不重新设计审题卡生成提示词。首篇试点的审题卡可以由独立 agent 或人工按现有合同产出并复核，然后作为已审核 JSON 输入持久化流程。

### D5. 新应用文不再生成亮点表达

应用文 1.0 的目标只有“两篇范文 + 审题卡”。

因此：

- 新生成路径不要求 `highlightExpressions`；
- application 分支把 `highlightExpressions` 改为可选；
- 历史资产已有的数组必须原样保留；
- continuation 分支完全不动，仍按现有合同要求 `highlightExpressions`；
- 旧应用文 fallback 面板可以继续读取历史亮点数据，但新的完整讲评体验不展示它们。

### D6. 继续使用 `writing-analysis-v1`

这是向后兼容的加法与放宽：

- 新增可选 `officialModelAnswer`；
- application 的 `highlightExpressions` 从必填改为可选；
- `modelAnswer` 和 `reviewCard` 语义不变。

不创建 `writing-analysis-v2`，不批量迁移历史文件。

### D7. 讲评体验由数据驱动，不再由 paperId 白名单驱动

完整应用文讲评的启用条件改为：

```text
lectureOpen
&& panelGroupId === groupId
&& sourceTaskType === 'application'
&& analysis.taskType === 'application'
&& modelAnswer 非空
&& reviewCard 完整合法
```

不再要求 groupId 位于硬编码 pilot set。

`officialModelAnswer` 是可选增强项，不影响基本体验是否成立。

### D8. 范文呈现方式

在讲评态左侧原答题框内自然纵向增长：

1. **AI 参考范文**：现有 `modelAnswer`
2. **官方范文**：仅当 `officialModelAnswer` 存在时显示

要求：

- 两块有清晰、克制的来源标签；
- 各自完整保留换行和段落；
- 不截断、不缩放、不横向溢出；
- 页面自然向下增长，不引入固定画布、tab、拖拽、批注或几何定位；
- 右侧讲评栏仍只显示审题卡；
- 关闭讲评后恢复普通空白答题框；
- 读后续写行为零改动。

---

## 5. AI 范文生成合同

### 5.1 单一权威

新增一个独立 prompt 文件作为单一权威，建议：

```text
prompts/application-writing-model-answer-v2.md
```

`server/paper-import-ai/` 中的 builder 只负责：

1. 读取或引用这份锁定提示词；
2. 将一份经过核对的“完整写作题目”填入文末占位；
3. 要求模型返回纯英文成文。

禁止在 JS、计划文档和 prompt 文件之间维护三份语义不同的副本。

### 5.2 模型输出合同

模型输出必须是：

- 纯文本；
- 只含完整英文成文；
- 第一字符就是成文内容；
- 不含 Markdown 围栏；
- 不含 JSON；
- 不含审题过程；
- 不含中文解释；
- 不含评分、词数或修改说明。

生成结果应写入：

```text
<work-key>.model-answer.txt
```

而不是旧的 `<work-key>.out.json`。

### 5.3 完整题面输入

传给模型的内容必须包含：

- 全部背景；
- 全部内容要点；
- 全部注意事项；
- 给定标题、称呼、开头、结尾、敬语、署名；
- 图表或其他背景材料的完整文字化内容。

不得只给摘要。

为兼容旧资产中 `applicationGiven` 为空、骨架埋在 `instruction` 或 group passage 的现实，新增一个纯 adapter：

```ts
buildCompleteApplicationTaskText(...)
```

它从已保存的写作任务与题组段落重建完整题面。首篇试点必须由人逐行核对重建结果与原题一致后，才允许调用模型。

本次原则上不修改 `PaperWritingTask` schema；只有实证表明现有数据无法无损重建时，才在同一 spec 下提出最小契约扩展，并重新经过 owner 决策。

---

## 6. 生成后质量控制

### 6.1 机器校验

新增 application 专用校验，至少覆盖：

- 输出非空；
- 输出不含 JSON/Markdown 包装；
- 题面给定字符串逐字出现且顺序正确；
- 不得遗漏给定称呼、标题、开头、结尾或署名；
- 不得重复给定骨架；
- 明显格式正确；
- 词数遵守题面要求。

对“80词左右”的默认实现：

- 推荐带：85—100；
- 80—105 可接受；
- 少于 80 或超过 105 拒绝，除非题面有不同明确要求。

词数应尽量只统计学生新增部分。若题面给定片段可以结构化识别，则从计数中扣除；无法可靠扣除时，不得伪造精确结果，必须转人工确认。

### 6.2 独立内容复核

生成 Agent 与复核 Agent 必须分离。

复核 Agent 获得：

- 完整原题；
- 本规划附录中的生成合同；
- AI 参考范文；
- 机器校验结果。

逐项检查：

1. 交际目的是否真正实现；
2. 所有显性要点是否完整落地；
3. 读者是否获得其需要的信息；
4. 格式与给定文字是否完全正确；
5. 内容是否具体而不跑题；
6. 语域、身份、场合和文体是否匹配；
7. 语法、搭配、拼写与标点是否可靠；
8. 句式变化是否自然；
9. 词数是否合规；
10. 是否具有 13—15 分档特征，而不是靠生僻词或炫技结构。

复核输出只允许：

```json
{
  "verdict": "PASS" | "MUST_FIX",
  "findings": [
    {
      "code": "string",
      "problem": "string",
      "requiredChange": "string"
    }
  ]
}
```

最多两轮自动修改。两轮后仍有实质争议，停止并交 owner，不得自行放行。

复核证据落入本 cut 的 `qa/`，不进入产品数据。

---

## 7. 候选组装与持久化

### 7.1 application 新候选形状

持久化前由驱动程序组装，而不是让范文生成模型直接输出：

```json
{
  "taskType": "application",
  "modelAnswer": "AI 参考范文",
  "officialModelAnswer": "官方范文，可选",
  "reviewCard": {
    "form": "...",
    "topic": "...",
    "reader": "...",
    "person": "...",
    "tense": "...",
    "type": "...",
    "points": ["...", "..."],
    "readerWho": "...",
    "readerCares": "...",
    "readerWants": "...",
    "value": "..."
  }
}
```

历史兼容输入仍可带：

```json
"highlightExpressions": [...]
```

但新路径不生产它。

### 7.2 驱动文件约定

建议 application 分支使用：

```text
<key>.model-answer.txt
<key>.review-card.json
<key>.official-model-answer.txt   # 可选
<key>.review.json                 # 独立复核结果
```

continuation 现有 `.out.json` 流程保持不变。

### 7.3 持久化投影

application 写入：

```ts
{
  taskType: 'application',
  modelAnswer,
  ...(officialModelAnswer ? { officialModelAnswer } : {}),
  ...(reviewCard ? { reviewCard } : {}),
  ...(legacyHighlightExpressions ? { highlightExpressions } : {})
}
```

要求：

- 现有同 paper 里的 continuation 或其他 group 不被覆盖；
- 旧 application 中的历史 `highlightExpressions` 在修改其他字段时不得意外丢失；
- `audit`、review 报告、模型原始回复和其他工作文件不得进入 paper asset；
- 使用现有临时文件 + 原子 rename 写入纪律。

---

## 8. Schema 与类型调整

### 8.1 TypeScript

目标：

```ts
type ApplicationWritingAnalysis = {
  taskType: 'application'
  modelAnswer: string
  officialModelAnswer?: string
  reviewCard?: ReviewCard
  highlightExpressions?: HighlightExpression[]
}
```

`ContinuationWritingAnalysis` 保持原样。

### 8.2 JSON Schema

`writing-analysis-v1.schema.json` 必须按 task type 分支约束：

- application：
  - 必填 `taskType`, `modelAnswer`
  - 可选 `officialModelAnswer`, `reviewCard`, `highlightExpressions`
- continuation：
  - 继续必填 `taskType`, `modelAnswer`, `continuationDesign`, `highlightExpressions`
  - 禁止 `reviewCard`
  - 禁止 `officialModelAnswer`

若 `officialModelAnswer` 出现：

- 必须是 trim 后非空字符串；
- 不接受空字符串或纯空白。

### 8.3 Meta

若现有 envelope `meta` 能表达生成信息，可写：

- `model`
- `promptVersion: application-writing-model-answer-v2`
- `reviewedBy`
- `reviewedAt`

不为此新建数据库字段或搜索维度。

---

## 9. 前端行为合同

### 9.1 完整 payload

任何 application group 只要有：

- 非空 `modelAnswer`
- 合法完整 `reviewCard`

就启用完整讲评，不再限制为 2022-i/2024-i。

### 9.2 `officialModelAnswer` 存在

左侧依次显示：

```text
AI 参考范文
<modelAnswer>

官方范文
<officialModelAnswer>
```

右侧只显示现有审题卡。

### 9.3 `officialModelAnswer` 不存在

只显示 AI 参考范文和审题卡，不出现“官方范文为空”的假卡片，也不让 AI 补写。

### 9.4 fail-closed

以下任一发生时，不允许挂半成品：

- `modelAnswer` 缺失；
- `reviewCard` 缺字段或格式非法；
- application/continuation 类型错配。

行为沿用当前 fail-closed：

- 普通答题框保持；
- 右栏显示 `解析未发布`；
- 不显示部分审题卡。

### 9.5 不回归范围

- 读后续写讲评不变；
- 挑题态不变；
- student/print/PDF/DOCX/export 不变；
- PaperSurface 公共组件原则上零改动；
- 现有两套 retained pilot 视觉与行为不得倒退；
- 历史无 reviewCard 的应用文 fallback 不得崩溃。

---

## 10. 首篇真实竖切

Owner 最新决定由 Agent 从 EQB 现有资产、导入材料和可核验答案来源中调查选择首篇试点；owner 已批准以下绑定：

```text
Pilot paperId: paper-960d0f8d
Pilot groupId: group-960d0f8d-writing-application
Pilot writingTaskId: wt-960d0f8d-application
Source question: /Users/huangxuewei/Desktop/教学资料库/05_真题模拟与试卷库/各地模拟/2026年3月高三试卷/26年3月高三试卷/26.3重庆市巴蜀中学高三月考（七）英语试卷.docx
Source question SHA-256: 960d0f8d6fddc3e6ccff22a15c9044170cb58f59a8b62f9870cf522df8cde25b
Official model answer source: /Users/huangxuewei/Desktop/教学资料库/05_真题模拟与试卷库/各地模拟/2026年3月高三试卷/26年3月高三试卷/26.3重庆市巴蜀中学高三月考（七）英语答案解析.docx
Official model answer source SHA-256: cb59414336068de60c9949ee05e36182775e16d2930ec864975dcfd514bd402a
Official model answer location: 第四部分 写作，第一节（满分15分）【参考范文】
```

来源边界：

- EQB 的 `paper-asset.json` 记录题卷文件名、与原题文件精确一致的 SHA-256，以及配套答案解析文件名；
- 原题与答案文件是同一份“巴蜀中学2026届高考适应性月考卷（七）”的匹配文档；
- 本 cut 中“官方范文”精确指该命题方配套《英语参考答案》里的应用文【参考范文】，不扩大解释为 NEEA 发布的全国高考官方范文；
- 当前已保存 `instruction` 把“注意”部分第二项误编号为另一个 `(2)`，但背景、两个内容要点、80 词目标、细节允许项和完整书信骨架均可由 `instruction + wordCountTarget + group passage` 重建；生成前必须逐行对照上述原题文件，禁止把解析编号噪音传入模型。

对应 ticket 统一命名为：

> 首篇真实应用文试点

首篇试点必须完成：

1. 核对完整题面；
2. 核对所有给定格式；
3. 运行新版模型范文生成；
4. 运行独立内容复核并清零 Must Fix；
5. 制作并复核现有 `reviewCard`；
6. 从上述命题方配套答案材料忠实录入官方范文；
7. 写入 `writing-analysis-v1.json`；
8. 浏览器真实打开该卷应用文讲评；
9. owner QA 通过后才允许合并。

不得使用 2022-i 或 2024-i 的内容复制到新卷。

---

## 11. 建议票据边界

以下四张横向票仅是输入计划提出的候选边界；最终实现边界以
`docs/cuts/application-writing-v1/tickets/` 中 owner 批准的 tracer-bullet
tickets 为准，不得机械照抄本节。

### Ticket 1 — 新范文生成合同与纯文本工作流

范围：

- 新 prompt 单一权威文件；
- 完整题面 adapter；
- application 生成 builder；
- driver `list` 生成纯文本任务；
- 单元验证。

不碰 UI，不写真实资产。

### Ticket 2 — application 数据合同、校验和持久化

范围：

- TS 类型；
- JSON schema；
- application 校验；
- `.model-answer.txt + reviewCard + official` 候选组装；
- 原子持久化；
- 历史数据兼容测试；
- continuation 零回归。

这是高风险契约票。

### Ticket 3 — 数据驱动讲评与双范文呈现

范围：

- 移除 retained groupId 白名单；
- 完整 payload predicate；
- 左侧 AI/官方范文自然增长；
- 右侧沿用审题卡；
- optional official/fail-closed/legacy fallback 行为验证；
- 浏览器级测试夹具。

不做真实 pilot 数据。

### Ticket 4 — 首篇真实应用文试点

范围：

- 使用 §10 已调查确认并经 owner 批准的真实题目与命题方配套答案；
- 生成、独立内容复核、审题卡复核；
- 写入一份真实 asset；
- 真实浏览器 QA；
- 记录 QA 证据；
- 更新 `docs/STATUS.md`（若构成 material release）。

---

## 12. 验证矩阵

### 12.1 生成器

- 锁定 prompt 内容未被压缩或改义；
- 输入包含完整题面；
- 输出为纯英文成文；
- 给定文字逐字保留；
- 不输出 audit/JSON/解释；
- 词数规则可验证。

### 12.2 数据合同

- 新 application 无 highlights 可通过；
- 历史 application 有 highlights 仍可通过；
- `officialModelAnswer` 缺省可通过；
- `officialModelAnswer: ""` 失败；
- continuation 缺 highlights 仍失败；
- continuation 带 official/reviewCard 失败；
- persist merge 不覆盖同 paper 其他 group；
- audit/review 临时字段不落盘。

### 12.3 UI

- 非白名单的新 application 完整 payload 可挂讲评；
- AI 参考范文标签与全文正确；
- 官方范文存在时显示且完整；
- 官方范文缺省时不渲染空段；
- 右栏审题卡字段顺序不变；
- malformed reviewCard fail closed；
- 关闭讲评恢复普通答题框；
- 2022-i/2024-i 无回归；
- continuation 无回归；
- 窄屏 drawer 与宽屏 rail 均可读。

### 12.4 全局

- narrow verifies 全绿；
- TypeScript/build 全绿；
- `pnpm -C app run verify:all` 或 PR CI 全绿；
- `git diff --check` 全绿；
- fresh independent `$code-review` 无 Must Fix；
- owner 浏览器 QA 通过；
- 合并后 main CI 绿。

---

## 13. 明确不做

- 不接读后续写新版合同；
- 不设计整卷导题 Agent；
- 不批量回填历史应用文；
- 不迁移已有 `modelAnswer`；
- 不删除历史 `highlightExpressions` 数据；
- 不生成或展示 audit；
- 不做高分句块新生产；
- 不做逐句批注、箭头、下划线、手写卡片或几何定位；
- 不做学生作文批改；
- 不修改打印、PDF、DOCX 和导出；
- 不接生产环境；
- 不恢复网站导题 UI；
- 不把写作解析放进 DB 搜索维度或整卷发布完整性门。

---

## 14. 完成定义

本 initiative 完成必须同时满足：

1. 新生成器严格使用附录 A 的提示词，输出纯英文范文；
2. application 新资产无需 `highlightExpressions`；
3. `officialModelAnswer` 可选并有来源真实性约束；
4. 现有 reviewCard 原样复用；
5. 任一完整 application payload 都能启用讲评，不依赖硬编码 paperId；
6. 左侧可完整阅读 AI 参考范文与官方范文，右侧可阅读审题卡；
7. §10 中 Agent 调查确认并经 owner 批准的真实应用文完成内容复核、持久化和浏览器 QA；
8. continuation、历史资产、挑题态和导出面无回归；
9. 独立代码审查、owner QA 和 main CI 全部通过。

---

# 附录 A：锁定的 AI 参考范文生成提示词

以下文本是本 initiative 的内容生成权威。Codex 拆票和实现时不得擅自压缩、改写或恢复旧 `audit + highlightExpressions` 输出。

---

你是一名熟悉中国高考英语应用文评分标准的英文写作者。请根据我提供的完整题目，写一篇具有13—15分档特征的成文。

你的目标不是堆砌高级词汇，而是让文章：

1. 完全实现题目规定的交际目的；
2. 覆盖全部内容要点，表述清楚、合理、具体；
3. 结构清晰，句间衔接自然，全文意义连贯；
4. 词汇和语法准确、恰当，并有适度变化；
5. 符合写作者身份、读者关系、场合和文体要求；
6. 尽量做到零句子错误，只允许不影响理解的极小疏漏。

若要求发生冲突，严格遵守以下优先级：

题面事实与给定格式 ＞ 内容要点与交际目的 ＞ 准确、自然、得体 ＞ 逻辑与具体细节 ＞ 句式变化 ＞ 华丽表达。

一、成文前请在内部完成审题，但不要展示分析过程

1. 锁定文体或载体、写作者身份、读者身份及关系、写作目的、全部显性要点、读者真正需要的信息、主要人称、主要时态、格式和词数。
2. 题目给出的称呼、标题、开头、结尾、敬语或署名必须逐字保留，不得遗漏、改写或只保留一部分。
3. 判断本题的主要任务：
   - 信息或描述型：重点回答“是什么、发生了什么、具体怎样”，使读者真正知道或看见这件事；
   - 观点或问题解决型：重点回答“为什么、问题在哪里、怎么办”，使读者理解并愿意接受观点或建议；
   - 若两类兼有，以题目核心动词和主要内容要点决定详略。
4. 为每个内容要点安排明确句子；主体要点详写，辅助要点略写。不得遗漏半个要点，也不得让题外信息挤占篇幅。

二、内容组织要求

1. 从读者的信息差出发写作：优先写读者不知道、最关心、需要据此作出回应或行动的信息。
2. 每句话都必须承担至少一种功能：完成要点、提供证据、推进逻辑、体现交流或完成收束。删除没有功能的套话。
3. 信息或描述型文章应加入2—3个与题目直接相关的具体细节，如时间、地点、动作、过程、颜色、声音、人物反应或真实结果，再自然落到一层感受或意义。
4. 观点或问题解决型文章应做到：
   - 立场明确；
   - 问题说清“现象或原因＋实际后果”；
   - 理由至少形成一条“观点—理由—例子或结果”的完整链；
   - 建议必须针对前述问题，并说明这样做会带来什么结果。
5. 若题目涉及两种选择，应在同一标准上进行比较，而不只说自己选择的“很好”。
6. 若要回应他人的观点或做法，可先简短承认其合理用意，再转入自己的判断；不得把对方贬得一无是处。
7. “meaningful”“interesting”“learned a lot”等评价必须有前文细节支撑，不能单独充当内容。
8. 价值或意义必须从题目情境和具体细节中自然生长，最多凝练一层，不喊口号，不强行拔高。
9. 结尾必须符合真实交际：
   - 写给朋友，可以自然互动；
   - 写给师长，应尊重、委婉而明确；
   - 面向公众，应客观收束、提出号召或点明结果；
   - 报道、投稿、通知等不得机械添加书信套语。

三、语言要求

1. 优先使用高中课标范围内的常用词、自然语块和可靠搭配。不要为了显得高级而使用冷僻词、夸张词、中式直译、名言或生硬比喻。
2. 长短句自然搭配。根据表达需要，从以下结构中选择2—3处准确使用即可：定语从句、目的或结果状语从句、what主语从句、条件句、让步转折、强调句、never...until、主语一致的分词结构等。
3. 复杂结构必须帮助压缩信息、突出重点或推进逻辑。不得堆叠从句，不得强塞倒装，不得让高级句式破坏清楚和准确。
4. 语气必须与读者关系匹配：
   - 对朋友自然、亲切；
   - 对师长先接住善意，再委婉表达，不下命令、不催促；
   - 对公众客观、清楚，不随意使用私人化的“you”。
5. 衔接依靠因果、转折、递进、指代和关键词回扣。不要机械地同时使用First, Second, Finally；让前一句自然产生后一句。
6. 避免无意义重复，但不要为了换词而使用不确定的同义词。

四、词数与格式

严格遵守原题词数。若题目只写“80词左右”，正文通常控制在85—100词，原则上不超过约105词。题目给定部分是否计入词数，以题面说明为准。

五、输出前请静默检查

1. 格式、给定文字和题面事实是否完全正确；
2. 所有内容要点是否逐项落地，详略是否合理；
3. 读者能否清楚知道、看见、理解或据此行动；
4. 每个分句是否有完整主干，有无缺谓语、谓语堆叠或逗号硬连两个完整句；
5. 时态、语态、主谓一致、名词单复数、冠词、代词指代、介词搭配、拼写和标点是否正确；
6. 2—3处句式变化是否自然、准确，而非刻意炫技；
7. 是否存在空话、题外信息、语气冒犯或不符合文体的套语；
8. 对任何没有把握的词、搭配或结构，立即换成更简单、确定的表达。

最终只输出完整的英文成文。不要输出审题过程、中文解释、评分、修改说明、加粗标记或词数统计，除非题目另有要求。

【完整写作题目】
请在这里粘贴题目原文，包括全部注意事项、给定格式、开头、结尾、署名、图表或背景材料：

---

# 附录 B：交给 Codex 的 `/to-tickets` 提示词

```text
请读取这份规划文档，并使用当前仓库 AGENTS.md 规定的 /to-tickets 流程，把它拆成可顺序实施的 tickets。

要求：
1. 只拆票，不实施。
2. 在 docs/cuts/application-writing-v1/ 下落盘 spec.md 与 tickets/。
3. 以仓库 main@4ed02871b2cd57872b3174c2aabfb781acfd3273 为规划基线；若 main 已前进，先重读最新 AGENTS.md 和相关代码并记录差异，不得静默沿用过时事实。
4. 保留规划中的 D1—D8 锁定决定，不得自行恢复 audit、highlightExpressions 新生产、硬编码 pilot 白名单或旧 JSON 生成输出。
5. 每张票必须有明确 Scope、Forbidden、Acceptance、验证命令、前置依赖和 owner QA 要求。
6. 高风险数据合同票与 user-visible UI 票要明确 fresh $code-review lineage 和浏览器 QA。
7. 首篇真实应用文试点绑定 paper-960d0f8d / group-960d0f8d-writing-application 以及 §10 的精确原题与命题方配套答案来源，不得保留 owner 待提供占位，也不得复制 2022-i 或 2024-i 内容。
8. 输出最后一条给 owner 的完整 attachment-first Next block，供新开顶层任务执行第一张票。
```
