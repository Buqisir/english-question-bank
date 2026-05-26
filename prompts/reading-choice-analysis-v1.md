# Reading Choice Analysis Prompt — V1

## Purpose

Produce clean reading-choice analysis for 阅读理解第一节 A-D groups.

## Input

- Already validated `content` (groups with passages, questions with options)
- Already validated `answerKey` for the target questions

## Output

### JSON file output contract

The required output is the complete contents of a JSON file, suitable to save
directly as `reading-choice-analysis-v1.json`.

If the chat/product supports downloadable files, create a downloadable `.json`
file with the requested filename. If file attachment is not supported, output
the complete JSON file contents directly in the chat.

This is a reviewed-analysis data file generation task, not a chat answer, not a
research report, and not a free-form explanation.

The model should reason carefully internally about:

- answer evidence
- option traps
- quote exactness
- location/paraphrase relations
- schema compliance

But it MUST NOT output reasoning steps, planning text, markdown, comments, or
human-facing explanation outside the JSON file.

If the supplied passage, questions, options, and answerKey are sufficient, the
model MUST generate the JSON file immediately. Do not spend time on unrelated
thinking, task restatement, process narration, or confirmation.

The first character of the response MUST be `{`.
The final character of the response MUST be `}`.
Do not write a filename heading.
Do not write "Here is the JSON".
Do not wrap the JSON in a ```json code fence.

### Required top-level shape

```json
{
  "schemaVersion": "reading-choice-analysis-v1",
  "paperId": "paper-...",
  "sourceAssetVersion": 1,
  "targetGroups": ["group-..."],
  "meta": {
    "generatedBy": "external-ai",
    "model": "...",
    "promptVersion": "reading-choice-analysis-v1",
    "reviewStatus": "reviewed",
    "reviewedBy": "...",
    "reviewedAt": "..."
  },
  "groups": { "...": {} },
  "questions": { "...": {} }
}
```

This file is an import candidate only after human/code review. Dirty JSON,
schema-drift JSON, or JSON with unmatched quotes must not be imported.

### Schema obedience rule

Use the field names and enum values below EXACTLY. Do not invent synonymous
fields, translated fields, renamed fields, alternate enum values, or wrapper
objects. Strong reasoning is welcome internally; schema creativity is not.

Common failure examples that are STRICTLY INVALID:

```json
{
  "skill": ["detail"],
  "explanationZh": "...",
  "analysisZh": "...",
  "questionNumber": 28,
  "stem": "...",
  "answer": "A",
  "relationType": "inferenceBridge",
  "subtype": "conditionDrop"
}
```

Correct shape examples:

```json
{
  "skill": { "primary": "detail" },
  "trap": {
    "primaryType": "scopeShift",
    "subtype": "conditionRemoved",
    "explanation": "..."
  },
  "locationParaphrases": [
    {
      "relationType": "paraphrase"
    }
  ]
}
```

## STRICTLY FORBIDDEN

- **DO NOT** output `status` — this is a JSON file, not a chat wrapper
- **DO NOT** output a top-level `analysis` wrapper
- **DO NOT** output `correctAnswer` — `answerKey` is the only answer authority
- **DO NOT** output `answer` inside question analysis
- **DO NOT** output `questionId`, `groupId`, `questionNumber`, `stem`, or `optionText` inside question analysis unless that field is explicitly listed in the schema for that nested object
- **DO NOT** generate content for non-reading question types
- **DO NOT** include `unknown` or `reviewFlags`
- **DO NOT** rename fields into Chinese or hybrid variants such as `explanationZh`, `analysisZh`, `questionSide`, or `sourceSide`
- **DO NOT** use arrays for `skill`; `skill` must be an object
- **DO NOT** invent enum values such as `conditionDrop`, `scopeNarrowing`, `valueReversal`, `inferenceBridge`, or `semantic`
- **DO NOT** include markdown outside JSON
- **DO NOT** include code fences, comments, headings, or filenames outside JSON
- **DO NOT** invent paragraph IDs or change paragraph text
- **DO NOT** output analysis reasoning steps
- **DO NOT** restate the task or explain what you are about to do
- **DO NOT** guess answers — answerKey is authoritative, but every correct option still needs exact evidence

---

## Group Analysis Schema

For each reading group:

```json
"groups": {
  "{groupId}": {
    "overview": "Brief Chinese overview of the passage topic and structure",
    "discourseStructure": {
      "summary": "Chinese summary of discourse flow",
      "paragraphs": [
        {
          "paragraphId": "para-...",
          "summary": "Chinese summary of this paragraph",
          "function": "Chinese description of paragraph function"
        }
      ]
    },
    "topicLabels": [
      {
        "theme": "人与自然",
        "themeGroup": "环境保护",
        "subtopic": "生态环境",
        "reason": "文章讨论人类活动对自然环境的影响"
      }
    ]
  }
}
```

- `paragraphId` must match existing content paragraph IDs exactly
- AI must NOT create new paragraphId values
- AI must NOT change paragraph text
- `topicLabels`: 1–2 labels from the taxonomy below. `theme`, `themeGroup`, and `subtopic` MUST be exact values from the table. `reason` is a 1-sentence Chinese explanation of why this label fits the passage.

### Topic Label Taxonomy

Select ONLY from these exact values:

| theme | themeGroup | subtopic |
| --- | --- | --- |
| 人与自我 | 生活与学习 | 个人生活 |
| 人与自我 | 生活与学习 | 家庭生活 |
| 人与自我 | 生活与学习 | 社区生活 |
| 人与自我 | 生活与学习 | 学校生活 |
| 人与自我 | 生活与学习 | 健康的生活方式 |
| 人与自我 | 生活与学习 | 积极的生活态度 |
| 人与自我 | 生活与学习 | 认识自我 |
| 人与自我 | 生活与学习 | 丰富自我 |
| 人与自我 | 生活与学习 | 完善自我 |
| 人与自我 | 生活与学习 | 乐于学习 |
| 人与自我 | 生活与学习 | 善于学习 |
| 人与自我 | 生活与学习 | 终身学习 |
| 人与自我 | 生活与学习 | 语言学习的规律 |
| 人与自我 | 生活与学习 | 语言学习的方法 |
| 人与自我 | 做人与做事 | 劳动实践 |
| 人与自我 | 做人与做事 | 劳动价值 |
| 人与自我 | 做人与做事 | 工匠精神 |
| 人与自我 | 做人与做事 | 优秀品行 |
| 人与自我 | 做人与做事 | 正确的人生态度 |
| 人与自我 | 做人与做事 | 公民义务 |
| 人与自我 | 做人与做事 | 社会责任 |
| 人与自我 | 做人与做事 | 生命的意义 |
| 人与自我 | 做人与做事 | 生命的价值 |
| 人与自我 | 做人与做事 | 生命安全 |
| 人与自我 | 做人与做事 | 未来职业发展趋势 |
| 人与自我 | 做人与做事 | 个人职业倾向 |
| 人与自我 | 做人与做事 | 未来规划 |
| 人与自我 | 做人与做事 | 创新意识 |
| 人与自我 | 做人与做事 | 创业意识 |
| 人与社会 | 社会服务与人际沟通 | 良好的人际关系 |
| 人与社会 | 社会服务与人际沟通 | 社会交往 |
| 人与社会 | 社会服务与人际沟通 | 公益事业 |
| 人与社会 | 社会服务与人际沟通 | 志愿服务 |
| 人与社会 | 社会服务与人际沟通 | 跨文化沟通 |
| 人与社会 | 社会服务与人际沟通 | 包容 |
| 人与社会 | 社会服务与人际沟通 | 合作 |
| 人与社会 | 文学、艺术与体育 | 小说 |
| 人与社会 | 文学、艺术与体育 | 戏剧 |
| 人与社会 | 文学、艺术与体育 | 诗歌 |
| 人与社会 | 文学、艺术与体育 | 传记 |
| 人与社会 | 文学、艺术与体育 | 文学简史 |
| 人与社会 | 文学、艺术与体育 | 经典演讲 |
| 人与社会 | 文学、艺术与体育 | 文学名著 |
| 人与社会 | 文学、艺术与体育 | 绘画领域的代表性作品和人物 |
| 人与社会 | 文学、艺术与体育 | 建筑领域的代表性作品和人物 |
| 人与社会 | 文学、艺术与体育 | 影视领域的概况及其发展 |
| 人与社会 | 文学、艺术与体育 | 音乐领域的概况及其发展 |
| 人与社会 | 文学、艺术与体育 | 日常体育活动 |
| 人与社会 | 文学、艺术与体育 | 大型体育赛事 |
| 人与社会 | 文学、艺术与体育 | 体育与健康 |
| 人与社会 | 文学、艺术与体育 | 体育精神 |
| 人与社会 | 历史、社会与文化 | 文化习俗 |
| 人与社会 | 历史、社会与文化 | 传统节日 |
| 人与社会 | 历史、社会与文化 | 对社会有突出贡献的人物 |
| 人与社会 | 历史、社会与文化 | 重要国际组织 |
| 人与社会 | 历史、社会与文化 | 社会公益机构 |
| 人与社会 | 历史、社会与文化 | 法律常识 |
| 人与社会 | 历史、社会与文化 | 法治意识 |
| 人与社会 | 历史、社会与文化 | 物质文化遗产 |
| 人与社会 | 历史、社会与文化 | 非物质文化遗产 |
| 人与社会 | 历史、社会与文化 | 社会热点问题 |
| 人与社会 | 历史、社会与文化 | 农业发展 |
| 人与社会 | 历史、社会与文化 | 乡村振兴 |
| 人与社会 | 历史、社会与文化 | 重大政治事件 |
| 人与社会 | 历史、社会与文化 | 重大历史事件 |
| 人与社会 | 历史、社会与文化 | 文化渊源 |
| 人与社会 | 历史、社会与文化 | 国家安全 |
| 人与社会 | 历史、社会与文化 | 社会进步 |
| 人与社会 | 历史、社会与文化 | 人类文明发展 |
| 人与社会 | 科学与技术 | 科技发展 |
| 人与社会 | 科学与技术 | 信息技术创新 |
| 人与社会 | 科学与技术 | 科学精神 |
| 人与社会 | 科学与技术 | 信息安全 |
| 人与社会 | 科学与技术 | 网络安全 |
| 人与自然 | 自然生态 | 不同国家地理概况 |
| 人与自然 | 自然生态 | 自然环境 |
| 人与自然 | 自然生态 | 人与动植物 |
| 人与自然 | 自然生态 | 生态环境 |
| 人与自然 | 自然生态 | 自然科学研究成果 |
| 人与自然 | 环境保护 | 自然遗产保护 |
| 人与自然 | 环境保护 | 人与环境 |
| 人与自然 | 环境保护 | 生态环境 |
| 人与自然 | 环境保护 | 国土安全 |
| 人与自然 | 环境保护 | 人类生存与环境的关系 |
| 人与自然 | 环境保护 | 社会发展与环境的关系 |
| 人与自然 | 灾害防范 | 自然灾害与防范 |
| 人与自然 | 灾害防范 | 安全常识 |
| 人与自然 | 灾害防范 | 自我保护 |
| 人与自然 | 宇宙探索 | 地球奥秘探索 |
| 人与自然 | 宇宙探索 | 宇宙奥秘探索 |

---

## Question Analysis Schema

For each reading question:

```json
"questions": {
  "{questionId}": {
    "skill": { "primary": "...", "secondary": "..." },
    "questionFocus": "Chinese description of what the question tests",
    "stemTranslationZh": "...",
    "optionAnalysis": [ ... ],
    "locationParaphrases": [ ... ]
  }
}
```

---

## Field Specifications

### skill

```json
{
  "primary": "detail",
  "secondary": "inference"
}
```

`primary` MUST be one of:
- `detail` — 细节题
- `inference` — 推断题
- `mainIdea` — 主旨题
- `wordMeaning` — 词义推测
- `authorPurpose` — 写作目的
- `attitude` — 态度观点
- `title` — 标题选择
- `structure` — 篇章结构

`secondary` is optional. If present, MUST be `inference`.
`secondary: "inference"` is legal ONLY when `primary` is `detail` or `attitude`.

Forbidden:

```json
"skill": ["detail"]
```

Required:

```json
"skill": { "primary": "detail" }
```

### stemTranslationZh

- Chinese translation of the English question stem
- Must be accurate and natural Chinese
- **MUST NOT leak answer analysis** — translation only, no hints

### optionAnalysis

MUST be an array, never an object. MUST include all four options A-D in order:

```json
[
  {
    "label": "A",
    "optionTranslationZh": "准确自然的中文翻译",
    "status": "wrong",
    "trap": { ... },
    "trapEvidence": [ ... ]
  },
  {
    "label": "B",
    "optionTranslationZh": "...",
    "status": "correct",
    "evidence": [ ... ]
  }
]
```

Forbidden shape:

```json
{
  "A": { "...": "..." },
  "B": { "...": "..." }
}
```

Rules:
- Every option MUST have `optionTranslationZh` (accurate, natural, NO analysis in translation)
- Exactly ONE option has `status: "correct"` — MUST match answerKey
- All wrong options MUST include trap diagnosis
- Correct option MUST NOT have trap fields

### Correct Option Evidence

1-3 evidence items. First must have `role: "primary"`:

```json
"evidence": [
  {
    "role": "primary",
    "paragraphId": "para-...",
    "quote": "exact quote from content paragraph",
    "anchor": "human-facing short anchor"
  }
]
```

- Every `quote` must EXACTLY match text in the referenced content paragraph
- Every `quote`, `sourceQuote`, `targetText`, and evidence quote must be copied exactly from the supplied paragraph text
- Do not normalize punctuation, convert curly quotes to straight quotes, or add/remove spaces inside copied text
- If a long quote is hard to copy exactly, choose a shorter exact substring
- `paragraphId` must reference an existing paragraph

---

## Trap Diagnosis

### Controlled trap types:

| primaryType | 中文标签 | Interactive |
|---|---|---|
| `sourceLexicalTrap` | 原文词钩干扰 | Yes |
| `polarityReversal` | 黑白颠倒 | Yes |
| `scopeShift` | 范围偷换 | Yes |
| `entityMismatch` | 对象错配 | Yes |
| `unsupportedClaim` | 无中生有 | **NO** |

Rules:
- `primaryType` required
- `secondaryType` optional, must not equal `primaryType`

### sourceLexicalTrap

```json
{
  "primaryType": "sourceLexicalTrap",
  "sourceText": "exact text from source passage",
  "optionText": "exact text from option",
  "matchType": "exact | wordFamily",
  "relationNote": "Chinese explanation of misleading mechanism"
}
```

- `sourceText` must match source quote
- `optionText` must match option text
- `exact`: relationNote explains it uses the original word to mislead
- `wordFamily`: relationNote explains the word-family relation
- `matchType` MUST be `exact` or `wordFamily`; do not use `semantic`

Future UI: amber word-level highlight only when wrong option selected/expanded.

### polarityReversal

Chinese label: 黑白颠倒

```json
{
  "primaryType": "polarityReversal",
  "subtype": "oppositeAction | oppositeAttitude | oppositeTrend | causeEffectReversal | timeOrderReversal | negationReversal",
  "sourceQuote": "exact from content paragraph",
  "sourceHighlight": "key phrase within sourceQuote",
  "optionText": "exact from option",
  "optionHighlight": "key phrase within optionText",
  "explanation": "Chinese explanation"
}
```

- `sourceQuote` must match content paragraph
- `sourceHighlight` must be substring of `sourceQuote`
- `optionHighlight` must be substring of `optionText`
- Material mismatch such as `soft paper` vs `cloth` is NOT polarityReversal; use `entityMismatch` or `unsupportedClaim` depending on whether a source anchor exists
- `subtype` MUST be one of the listed enum values. Do not use `valueReversal`; usually use `oppositeAttitude`, `oppositeTrend`, or another listed subtype instead.

### scopeShift

Chinese label: 范围偷换

```json
{
  "primaryType": "scopeShift",
  "subtype": "overgeneralization | overstatement | understatement | conditionRemoved",
  "sourceQuote": "exact from content paragraph",
  "sourceHighlight": "...",
  "optionText": "exact from option",
  "optionHighlight": "...",
  "explanation": "Chinese explanation"
}
```

- `subtype` MUST be one of the listed enum values. Do not use `conditionDrop`; use `conditionRemoved`. Do not use `scopeNarrowing`; use `understatement` or another listed subtype.

### entityMismatch

Chinese label: 对象错配. No subtype.

```json
{
  "primaryType": "entityMismatch",
  "sourceQuote": "exact from content paragraph",
  "sourceEntity": "entity in sourceQuote",
  "optionText": "exact from option",
  "optionEntity": "entity in optionText",
  "explanation": "Chinese explanation"
}
```

### unsupportedClaim

Chinese label: 无中生有

```json
{
  "primaryType": "unsupportedClaim",
  "claim": "the unsupported claim text",
  "explanation": "Chinese explanation stating 原文未提及"
}
```

**MUST NOT** include `sourceQuote`.
**MUST NOT** include `trapEvidence`.
Future UI: NOT selectable, no evidence/trap line, no original text highlight.

---

## Trap Evidence

Required for: `sourceLexicalTrap`, `polarityReversal`
May be used for: `scopeShift`, `entityMismatch`
**MUST NOT** be used for: `unsupportedClaim`
`trapEvidence` MUST be a sibling of `trap` on the option object, never nested inside `trap`.

```json
{
  "label": "B",
  "status": "wrong",
  "trap": { "...": "..." },
  "trapEvidence": [
    {
      "paragraphId": "para-...",
      "quote": "exact quote from paragraph",
      "anchor": "short human anchor"
    }
  ]
}
```

---

## locationParaphrases

UI title: 定位关系 / 同义替换

Each reading question MUST include 1-2 items:

```json
"locationParaphrases": [
  {
    "sourceText": "expression from stem or correct option",
    "sourceRole": "stem | correctOption",
    "targetText": "expression from passage",
    "targetParagraphId": "para-...",
    "relationType": "locationCue | paraphrase | wordFamily | calculation",
    "note": "Chinese explanation preserving key English expressions"
  }
]
```

Rules:
- Describes the correct solving path, NOT wrong-option traps
- Do NOT include wrong-option relations here (those belong in trap fields)
- `sourceRole`: `stem` or `correctOption`
- `targetParagraphId` must reference existing paragraph
- `relationType`:
  - `locationCue` — 定位线索
  - `paraphrase` — 同义替换
  - `wordFamily` — 词族关联
  - `calculation` — 计算/推算
- `note`: Chinese, preserving key English expressions
- Do not use `inferenceBridge`; choose `paraphrase` or `locationCue`.

### Example:

```json
{
  "sourceText": "How long",
  "sourceRole": "stem",
  "targetText": "It will be on view through Tuesday, May 31.",
  "targetParagraphId": "para-2024-jslk-reading-a-p2",
  "relationType": "locationCue",
  "note": "题干用 How long 问持续时间，原文用 be on view through + 截止日期表达持续到何时。"
}
```

---

## Analysis Meta

```json
"meta": {
  "generatedBy": "external-ai",
  "model": "model-name-version",
  "promptVersion": "reading-choice-analysis-v1",
  "reviewedBy": "reviewer-name",
  "reviewedAt": "ISO-8601 datetime"
}
```

---

## Validation Checklist

Output must:
- Parse as valid JSON
- Be saveable directly as a `.json` file
- Be complete JSON file content with first character `{` and final character `}`
- Have top-level `schemaVersion: "reading-choice-analysis-v1"`
- Have top-level `paperId`, `sourceAssetVersion`, `targetGroups`, `meta`, `groups`, and `questions`
- Have NO top-level `status`
- Have NO top-level `analysis` wrapper
- Have NO `correctAnswer` field anywhere
- Have NO question-level `answer`, `stem`, `questionId`, `groupId`, or `questionNumber` fields
- Have NO `explanationZh`, `analysisZh`, `questionSide`, or `sourceSide`
- Have NO `unknown` or `reviewFlags`
- Have NO invented enum values such as `conditionDrop`, `scopeNarrowing`, `valueReversal`, `inferenceBridge`, or `semantic`
- Have NO markdown, code fence, comments, filename heading, or explanatory prose
- Have `skill` as an object, never an array
- Have exactly one `status: "correct"` option per question matching answerKey
- All `quote` fields must exactly match content paragraphs
- All `paragraphId` references must exist in content
- All trap types must be from the controlled list
- `unsupportedClaim` must not have `sourceQuote` or `trapEvidence`
- Every wrong option must have trap diagnosis
- Every question must have `stemTranslationZh` and `locationParaphrases`
- If source information is sufficient, output immediately without unrelated deliberation text
