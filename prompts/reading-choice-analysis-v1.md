# Reading Choice Analysis Prompt — V1

## Purpose

Produce clean reading-choice analysis for 阅读理解第一节 A-D groups.

## Input

- Already validated `content` (groups with passages, questions with options)
- Already validated `answerKey` for the target questions

## Output

### Success output:

```json
{
  "status": "ok",
  "analysis": {
    "meta": {
      "generatedBy": "external-ai",
      "model": "...",
      "promptVersion": "reading-choice-analysis-v1",
      "reviewedBy": "...",
      "reviewedAt": "..."
    },
    "groups": { ... },
    "questions": { ... }
  }
}
```

### Failure output (when answerKey conflicts with passage evidence):

```json
{
  "status": "failed",
  "errors": [
    { "questionId": "...", "reason": "..." }
  ]
}
```

**Failed output CANNOT be imported.**

## STRICTLY FORBIDDEN

- **DO NOT** output `correctAnswer` — `answerKey` is the only answer authority
- **DO NOT** generate content for non-reading question types
- **DO NOT** include `unknown` or `reviewFlags`
- **DO NOT** include markdown outside JSON
- **DO NOT** invent paragraph IDs or change paragraph text
- **DO NOT** guess answers — if answerKey conflicts with evidence, output failure

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
    }
  }
}
```

- `paragraphId` must match existing content paragraph IDs exactly
- AI must NOT create new paragraphId values
- AI must NOT change paragraph text

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

### stemTranslationZh

- Chinese translation of the English question stem
- Must be accurate and natural Chinese
- **MUST NOT leak answer analysis** — translation only, no hints

### optionAnalysis

MUST include all four options A-D:

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

```json
"trapEvidence": [
  {
    "paragraphId": "para-...",
    "quote": "exact quote from paragraph",
    "anchor": "short human anchor"
  }
]
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
- Have `status: "ok"` or `status: "failed"`
- If `ok`: include complete analysis for all target questions
- Have NO `correctAnswer` field anywhere
- Have NO `unknown` or `reviewFlags`
- Have exactly one `status: "correct"` option per question matching answerKey
- All `quote` fields must exactly match content paragraphs
- All `paragraphId` references must exist in content
- All trap types must be from the controlled list
- `unsupportedClaim` must not have `sourceQuote` or `trapEvidence`
- Every wrong option must have trap diagnosis
- Every question must have `stemTranslationZh` and `locationParaphrases`
