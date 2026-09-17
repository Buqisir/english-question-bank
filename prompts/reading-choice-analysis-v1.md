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
- the hidden calculation, comparison, analogy, or inference step a student must supply
- what makes a tempting option fail in this passage rather than in the abstract
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
    "promptVersion": "reading-choice-analysis-v1",
    "reviewStatus": "reviewed"
  },
  "groups": { "...": {} },
  "questions": { "...": {} }
}
```

Do NOT fill `meta.model`, `meta.reviewedBy`, or `meta.reviewedAt`. The runtime
stamps the actual model identity; Owner Review records approval provenance
later. `reviewStatus` is a compatibility field in this analysis contract, not
Owner Review approval.

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
  "similarityProfile": { "family": "detail", "subtype": "why-mention" },
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
  "similarityProfile": {
    "family": "detail",
    "subtype": "calculation",
    "detailScope": "single",
    "technique": null
  },
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
- **DO NOT** omit `similarityProfile` or invent values outside its controlled
  family-specific vocabulary
- **DO NOT** invent enum values such as `conditionDrop`, `scopeNarrowing`, `valueReversal`, `inferenceBridge`, or `semantic`
- **DO NOT** include markdown outside JSON
- **DO NOT** include code fences, comments, headings, or filenames outside JSON
- **DO NOT** invent paragraph IDs or change paragraph text
- **DO NOT** output analysis reasoning steps
- **DO NOT** restate the task or explain what you are about to do
- **DO NOT** guess answers — answerKey is authoritative, but every correct option still needs exact evidence

---

## Teaching Prose Rule

The controlled `skill`, `primaryType`, `subtype`, and `relationType` values are
internal classification. Keep them exact, but student-visible Chinese must not
merely translate those labels. First explain the actual passage relation.

For the correct path, use `locationParaphrases[].note` to state:

```text
题目问什么 → 原文提供什么 → 中间怎样计算、比较、类比或推断 → 为什么到达正答
```

Simple direct-detail questions may collapse this to one sentence. Calculation
questions must show the numbers and operation. Comparison questions must name
both sides and the common standard. Writing-method questions must say both what
the author does and what that choice makes concrete, clear, or persuasive.
Inference questions must expose the missing step and use conclusion language no
stronger than the evidence.

For a wrong option, the relevant `explanation` or `relationNote` should say why
it is tempting and what exact object, scope, polarity, condition, paragraph, or
claim fails when returned to the passage. Do not stop after naming the trap.
`原文未提及` is valid only when no source anchor exists; when possible, add what
the passage actually discusses so the student can see the boundary. Never turn
“not mentioned” into “does not exist in reality.”

`questionFocus` is one concise, concrete Chinese sentence about the work this
question asks the student to do. It may name the familiar exam question type,
but it must not expose internal enum names or repeat the full answer analysis.

---

## Group Analysis Schema

For each reading group:

```json
"groups": {
  "{groupId}": {
    "overview": "50–80字软目标的中文内容简介，概括主题及核心事件或信息",
    "fullTranslationZh": "Accurate full Chinese translation of the passage in source order",
    "selectedLongSentences": [
      {
        "sentenceId": "sentence-{groupId}-1",
        "paragraphId": "para-...",
        "sourceText": "One exact sentence or substring from that paragraph",
        "displayText": "The same text, with authoritative answers inserted if it contains gaps",
        "relatedQuestionIds": ["q-..."],
        "translationZh": "Natural Chinese translation",
        "analysisZh": "Chinese explanation of the main trunk, modifiers, and relations",
        "underlineRanges": [{"start": 0, "end": 3, "quote": "The"}]
      }
    ],
    "teachingContent": {
      "schemaVersion": "objective-teaching-content-v1",
      "sourceTextId": "source-{groupId}",
      "sourceAssetVersion": 1,
      "translation": {
        "textId": "translation-{groupId}",
        "legacyField": "fullTranslationZh",
        "paragraphs": [{"paragraphId":"zh-{groupId}-p1","sourceParagraphIds":["para-..."],"start":0,"end":8,"quote":"全文译文精确切片"}]
      },
      "completedSourceTexts": [],
      "annotations": []
    },
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
- `overview` is the one canonical introduction shared by teaching, list/search
  and future similarity consumers. Aim for 50–80 Chinese characters without
  padding simple texts. Cover the subject and core event or information; do not
  duplicate paragraph summaries or `discourseStructure.summary`.
- `fullTranslationZh` is student-visible. Translate the complete textual passage
  in source order, preserving paragraph breaks and any textual title or caption.
  Do not omit sentences, add explanations, or append vocabulary notes. Translate
  only source text available in this group; do not invent data hidden in an image.
- `selectedLongSentences` is required and contains 1–2 genuinely teachable
  sentences. Prefer a sentence that is both important to answering a related
  question and syntactically difficult. If the answer-bearing sentence is simple,
  choose a difficult sentence central to understanding the passage instead; do
  not select a sentence merely because it is long. `sourceText` must be an exact
  substring of `paragraphId`, `displayText` must equal it for gap-free reading,
  and every `relatedQuestionIds` value must belong to this group. Explain the
  sentence as a teacher would: find the main trunk first, then attach clauses,
  non-finite phrases, comparisons, or logical relations. Do not just name grammar.
- Give every selected sentence a stable `sentenceId`. Complete `teachingContent`
  as the closed group-local annotation annex: translation paragraphs are exact
  Unicode-code-point slices of the single `fullTranslationZh` value (never a
  second translation copy), each explicitly linked to existing source paragraph
  IDs. Add `answer-evidence` annotations for textual question evidence and
  `sentence-structure` annotations covering every selected sentence. Each range
  is `{textId,paragraphId,start,end,quote}` and `quote` must equal that exact
  code-point slice. There are two coordinate systems: translation paragraph
  `start/end` are relative to the entire `fullTranslationZh`; annotation
  `translationRanges.start/end` are relative to that paragraph's `quote`,
  starting again at zero. Never copy a full-translation offset into an annotation.
  For example, in `甲。\n乙来了。`, the second paragraph starts at 3 in the full
  translation, but `来了` is `[1,3)` within that paragraph, not `[4,6)`.
  Source annotation offsets are likewise local to the referenced source paragraph;
  underline offsets are local to `displayText`. Repeated text must use the intended occurrence's offsets;
  many questions and overlapping ranges are valid. Source answer evidence must
  reference original passage text. Do not derive offsets by first substring.
  Figure/table evidence keeps its existing object reference; never invent text
  offsets for it. Non-key difficult sentences use empty `relatedQuestionIds` and
  empty sentence-structure `questionIds`, rather than inventing a question link.
- `underlineRanges` locates the words that reveal the trunk or a decisive relation
  in `displayText`. Use Unicode code-point offsets, start inclusive/end exclusive,
  and the exact `quote`; do not trim or normalize before counting. Usually 1–3
  short ranges suffice. Repeated phrases and overlaps are valid when explicitly
  located. Never underline the whole sentence for decoration. The numbers above
  illustrate the encoding only; calculate them for your actual text. Do not emit
  the historical `underlineTexts` field alongside the ranges.

---

## Question Analysis Schema

For each reading question:

```json
"questions": {
  "{questionId}": {
    "skill": { "primary": "...", "secondary": "..." },
    "similarityProfile": {
      "family": "...",
      "subtype": "...",
      "detailScope": null,
      "technique": null
    },
    "questionFocus": "Chinese description of what the question tests",
    "stemTranslationZh": "...",
    "optionAnalysis": [ ... ],
    "locationParaphrases": [ ... ]
  }
}
```

---

## Field Specifications

### similarityProfile

`similarityProfile` is the machine-facing solving-action profile used to match
questions. It is required on every new question analysis. It does not replace
`skill`: keep the legacy-compatible `skill.primary`, and make the two agree by
the mapping below.

Use exactly one family and one family-specific subtype:

| family | allowed subtype | required legacy `skill.primary` |
| --- | --- | --- |
| `detail` | `general-detail`, `behavior-reason`, `calculation`, `comparison-integration`, `situation-match` | `detail` |
| `main-idea` | `paragraph-main-idea`, `passage-main-idea`, `best-title` | `mainIdea` except `best-title` → `title` |
| `inference` | `detail-inference`, `attitude`, `writing-purpose`, `character-trait`, `source` | respectively `inference`, `attitude`, `authorPurpose`, `inference`, `inference` |
| `word-meaning` | `word`, `phrase`, `sentence` | `wordMeaning` |
| `reference` | `reference` | `wordMeaning` for legacy compatibility |
| `writing-method` | `writing-method` | `structure` |

`detailScope` must be `single` or `multiple` for the `detail` family and must
be `null` for every other family. Four options that each need returning to the
passage are `multiple` even when all four concern one paragraph or event.

`technique` must be `null` unless family is `writing-method`. For
`writing-method`, use exactly one of:

- `example`
- `comparison`
- `quotation`
- `statistics`
- `definition`
- `topic-introduction`
- `viewpoint-support`

`Why does the author mention X?` belongs to `writing-method`, not detail. Its
answer may be example, comparison, topic introduction, or viewpoint support;
do not force every mention question into `example`. Do not create paragraph
function or text-organization subtypes without a confirmed source question.

Reading A/B/C/D slot is source metadata. Do not output it in
`similarityProfile`; the coordinator derives it from the group.

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
- `note` is the student-facing reasoning bridge, not only a label such as
  “同义替换”. Include the decisive hidden step when the question is not direct
  retrieval.
- for `calculation`, write the complete operation and result in `note`
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
  "promptVersion": "reading-choice-analysis-v1",
  "reviewStatus": "reviewed"
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
- Have a complete, controlled `similarityProfile` that agrees with `skill`
- Have exactly one `status: "correct"` option per question matching answerKey
- All `quote` fields must exactly match content paragraphs
- All `paragraphId` references must exist in content
- All trap types must be from the controlled list
- `unsupportedClaim` must not have `sourceQuote` or `trapEvidence`
- Every wrong option must have trap diagnosis
- Every question must have `stemTranslationZh` and `locationParaphrases`
- If source information is sufficient, output immediately without unrelated deliberation text
