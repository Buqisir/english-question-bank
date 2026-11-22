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

How the wrong-option sentence prints: 「**B 项**（译文）错在：<your sentence>」.
The reader already sees 错在, so say only what the option claims and what the
passage actually says; never restate that it is wrong. Never write a trap type
name anywhere in the sentence: no 「，属无中生有。」「，对象错配。」「属黑白颠倒」
「属词钩干扰」 or any other label, coined or not. `primaryType` carries the type;
the sentence shows the trick in plain words instead. 「原文只要求穿耐脏的衣服、
按天气增减，没提团队制服。」 For `sourceLexicalTrap`, name the borrowed English
word and what it means in the passage. The validator flags a label at the end of
the sentence.

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
  Native table cells are included in the source text address space: their
  existing `cellId` is supplied as `paragraphId`. Use that exact ID in evidence,
  trapEvidence, locationParaphrases.targetParagraphId, and teachingContent
  sourceRanges.paragraphId. Quotes and code-point offsets are local to the cell,
  including when two cells have the same price or other repeated text.
  Cells do not require individual paragraph summaries or discourseStructure
  entries, nor a separate translation paragraph for every cell; related cells
  may share one translation paragraph linked through sourceParagraphIds.
  Image-only figure/table evidence keeps its existing object reference; never
  invent text offsets for it. Non-key difficult sentences use empty `relatedQuestionIds` and
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
    "locateBy": "stem | options | passage",
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
  "explanation": "Chinese explanation stating what the passage does not say; no type name"
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

Each reading question MUST include 1-3 items:

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

### 定位 (locateBy and the stem locating item)

Purpose: help the reader understand the answer (where in the passage it
comes from, and how the stem and the correct option match the passage), and
on the way show, on this question's own words and paragraphs, how to get
back to the passage, so the reader can do the same next time. The stem gives
the locating words (定位词); they find one passage sentence (定位句); the
answer is either in that sentence or in its context.

Locating means finding, in the passage, the paraphrase that answers the
question. The answer key is given; show the path a strong reader takes to it,
in concrete words, never as a general tip.
Three things are each decided by one thing only:
- the 定位句 (`targetText`) is decided by the stem's clues;
- the answer (`answerText`) is decided by the correct option: the passage
  words the correct option rewrites are the answer;
- signal words (so, because, but, however) only tell which way to look from
  the 定位句 to the answer.
Best is a 定位句 that also holds the answer. When it does not, the bridge
says how the two are linked (see `bridgeZh`).

`locateBy` (question level, required):
- `stem` — words in the stem point to one sentence.
- `options` — no single sentence can carry the answer: the options have to
  be checked one by one in different places. The options' own evidence
  already shows where. Use it only for the forms marked `options` below.
- `passage` — the question is about a whole text or one named paragraph as a
  whole. No locating words; the paragraph the question names is shown from
  the correct option's evidence.

Step 1. Read the stem for one or two clues.
- 对象词 (object words): names, places, numbers, dates, terms. They narrow
  the search to a paragraph.
- 题眼 (the asking word): says what kind of information is wanted. Some fix
  a sentence: why, what caused / led to / prompted, suggest, advise, urge,
  when, how many, how long, directly, first, at the start, initially, struck
  him most, reveal, indicate, prove, show, a quoted or underlined word.
  Others cannot fix a sentence: true, mentioned, learn, What do we know,
  feature, findings, special, unique, in common, advantage, view, belief,
  offer, share, agree on, infer, imply. special, unique, feature and
  advantage do fix one when the passage words them about the same thing in
  one sentence (unlike, the only, the first, stands out, few others): Step 3.
- 对象词定段，题眼定句: when the object word and a sentence-fixing 题眼 land
  in different sentences, the 定位句 is where the 题眼 lands. A 题眼 lands
  through words (because, the reason, a lesson, a date). An imperative or
  should / must alone does not move the 定位句 off the sentence holding a
  name or place from the stem: locate there and bridge on to the advice.
- When the stem has both a sentence-fixing word and one that cannot fix a
  sentence ("What does humans' absence imply"), follow the one that fixes a
  sentence and locate from the stem.

Step 2. Choose `locateBy` by the question form. A reader should see a
定位句 whenever one exists, so `options` is kept for the few forms where
no single sentence can carry the answer.

| Question form | `locateBy` |
| --- | --- |
| why, what caused / led to / prompted / made sb do; what X is aimed at | `stem` |
| suggest / advise / recommend / urge / What should …, when the options are actions | `stem` |
| who / what / when / where / how many / how long; how did X manage; the key solution | `stem` |
| What does X (a named person) say / think about Y; the answer may be anywhere in that person's words | `stem` |
| a quoted or underlined word, phrase or sentence; what a pronoun refers to | `stem` |
| Why does the author mention X; Why is X compared to Y | `stem` |
| the author's view of one named thing (How does the author view / find X) | `stem` |
| What does X reveal / indicate / prove / show; What conclusion can be drawn from X | `stem` |
| infer / imply / suggest (meaning 暗示) when the object word lands in one sentence | `stem` |
| Who will benefit, when the passage names who benefits | `stem` |
| Which will result in X; What will definitely disqualify: the sentence stating the general rule | `stem` |
| Which best describes X; What was X like; What can we learn / What do we know about X; What is special / unique about X; infer / imply about X — when X, or a time, place or event in the stem, lands on one sentence and the correct option's evidence is that sentence or comes a few sentences later in the same paragraph (locate there and bridge on to it) | `stem` |
| What do A and B / the listed things have in common, when one sentence states what they share ("All these stadiums are still …") | `stem` |
| What do A and B have in common; What similar experience do A and B have; any comparison of two or more things, when no single sentence states it | `options` |
| Which is true / NOT true / mentioned, and What can we learn / do we know about X, when the options' facts come from different places | `options` |
| Which would X agree with; What does X argue (checking the options against X's words) | `options` |
| Who is most / least likely to …; Who might benefit (applying the passage to new people) | `options` |
| the purpose of paragraphs N and M; how paragraph N is developed; What do paragraphs N–M talk about | `options` |
| How many parts / items / steps, or a sum, when the answer means adding up three or more headings, items or numbers | `options` |
| the correct option's number is not written in the text (read off a chart or table, or worked out) and no sentence states it in words | `options` |
| the main idea, best title or purpose of the whole text; the author's attitude to the whole topic | `passage` |
| Where is the text taken from; Who is it written for; What will follow; the author's primary concern | `passage` |
| What can be learned from the text, when the options are noun phrases summing up the text | `passage` |
| What can we infer / learn from paragraph N or the last paragraph: read that paragraph as a whole | `passage` |
| the main idea or emphasis of one named paragraph | `passage` |

Step 3. Choose the 定位句 (`targetText`).
- When a name or place in the stem lands on one sentence and the answer
  follows later in the same paragraph (a list of what X does, the turn
  after However), locate on that sentence and bridge on; do not fall back
  to `options` because the answer is a few sentences away.
- Test first: if the answer sentence itself holds the stem's object word,
  or its plain counterpart (stem "the birth of Gordon", passage "Gordon was
  born"), or a real counterpart of another stem phrase (a verb phrase,
  or special worded as "unlike any other"), locate there, even when a name
  from the stem sits in an earlier sentence; an object word that runs through most of the
  passage (the town a text is about, its topic word) does not count here; do not land on another sentence and bridge back.
  If the answer sentence does not hold it, locate on the sentence that
  does, and let the bridge lead on to the answer. Never skip the stem's
  anchor (a name, a time, a place, a source such as "the study in
  Science") to land on a sentence that only shares a common word.
- Read the 定位句 to its end. A dash, colon or closing clause is often the
  answer.
- When two sentences both match the clue, choose the one that answers the
  题眼 (the how, the why), not the one sharing more words with the stem.
- When the sentence holding the 题眼 words only points back with a pronoun
  ("this is the real reason", "that's why"), locate the sentence it points
  to.
- A verb phrase or adjective in the stem that has a real counterpart in
  exactly one sentence is a strong 定位词: stem "avoid touching", passage
  "never actually touch"; "unwelcome", "hate"; "learn from", "a lesson";
  "moved to London", "arrived at Heathrow, London". Use it as `sourceText`
  with its counterpart as `targetCue`, and prefer it to an object word that
  appears all through the passage. The counterpart must mean the same
  thing, not just sit nearby.
- A stance word in the stem (be opposed to, support, doubt, be in favor
  of) pairs with the passage words that show that stance toward the same
  thing (raise concerns about, protest, welcome, a doubter about). Prefer it
  to the stem's topic noun (the plan, the program, the study): a topic noun the
  passage keeps naming counts as a word that runs through the passage,
  even when it also sits in the 定位句.
- The counterpart may be a sentence feature, not a word: an imperative, or
  should / must / need to / it is essential that, for advice; a because
  clause for a cause; to do / so that / in order to for a purpose; an if
  clause for a condition. Only for advice (suggest, advise, recommend,
  urge, should), and only when the 定位句 holds no object word, use the 题眼
  as `sourceText` and the feature words as `targetCue` (stem "suggest",
  passage "Don't leave"). Never pair words such as purpose, parts, happen
  or benefit with a loosely related passage word: when no natural pair
  exists, locate on the sentence with the object word. When the 定位句
  holds a distinguishing object word (a name, a number, a rare term), that
  object word is `sourceText`, even if the 题眼 also matches. A name the
  passage keeps naming (the people or animals the text is about) is not
  distinguishing: when another stem phrase has its real counterpart in the
  定位句, that pair is `sourceText` and `targetCue` (stem "give up the
  shop", passage "closed its doors for good").

Step 4. Where the answer usually sits, as seen from the 定位句.
- After but, however, yet, in fact, actually, the opposite, and after
  surprisingly, fortunately, unfortunately, when both halves are about the
  same thing. A But inside a quoted reply in a dialogue is not a turn.
- In a While / Although concession, the main clause is the point. Two
  exceptions: when the stem asks about at the start or initially, the answer
  is often the concession clause, which tells how things were at first; when
  it asks first, at first or originally, the answer is often before the
  turn, and what follows the turn is the fallback.
- directly, mainly, most in a chain of causes: the link nearest the result.
  A direct result of X: the link right after X, not a later one.
- owe X to Y, attribute X to Y, This is because: the cause these words name.
- When So, Therefore or That's why begins the 定位句, the cause is in the
  sentence before.
- After a person's name, the answer may be anywhere in that person's words,
  not only in the sentence with the name.
- For a pronoun or a word in context, try the nearest noun first; when it is
  not among the options, go back to the topic sentence and check it with the
  verb.
- Questions mostly follow the passage order; use it to narrow the search.

When `locateBy` is `stem`, add exactly ONE `locationParaphrases` item with
`sourceRole: "stem"` and `relationType: "locationCue"`. When it is `options`
or `passage`, add NO such item.

Fields of that item:
- `sourceText` — 定位词: 1-5 English words copied exactly from the stem.
  Never the whole stem. Prefer names, numbers, dates and rare content words
  that appear in the 定位句 and not all through the passage, then a stem
  phrase with one real counterpart there (Step 3); use a 题眼 only when the 定位句 holds none of them. Never pick question words, or words that appear everywhere
  in the passage.
  For a reference or word-meaning question, use the quoted word itself.
- `targetText` — 定位句: ONE complete passage sentence, copied exactly,
  containing the locating words or their counterpart.
- `targetParagraphId` — the paragraph of `targetText`.
- `targetCue` — the exact words inside `targetText` that match `sourceText`,
  1-5 English words: the counterpart a reader circles, not a clause (stem
  “Ho's job”, passage “hospital teacher”, not “what it means to be a
  hospital teacher”). REQUIRED when the passage words differ from the stem
  words (stem “started”, passage “opened”); omit it when `sourceText`
  appears in `targetText` as is (case does not matter). The PDF prints
  `sourceText → targetCue`, or `sourceText 原词` when there is no
  `targetCue`, so both must read well side by side.
- `answerText` — the exact passage words where the answer is. It MUST be a
  substring of one `quote` in the correct option's `evidence`. Keep it to
  the deciding words, not the whole evidence. The deciding words cover every
  part of the correct option: when the option's fact and its verb sit in
  different phrases of the quote, keep both and the words between them
  (option "She overcame a fear of water", quote "swimming had always
  terrified her, but last summer she finally swam across the lake": keep
  from "swimming had always terrified her" through "swam across the lake").
  Trim only words the option does not rewrite.
  For a word-meaning question, `answerText` is the context clue that gives
  the meaning (a restatement, a contrast, an example next to the word), not
  the word or its own phrase.
- `bridgeZh` — only when `answerText` is NOT inside `targetText`: one short
  Chinese line, at most 25 units (each Chinese character and each English
  word counts as one), saying WHY the answer is in the context. Say the
  concrete link in plain words: which word points to what ("she 指新生的
  小犀牛"), what the turn is ("But 后才是实际情况"), which sentence gives the
  cause. When the answer sentence or the 定位句 holds a word pointing back
  (that belief, this, it, such), first say what it points to ("that belief
  指女孩认为本性别不够聪明"). Do not write the link's name; the six links below only help you
  decide what to say:
  - 指代回指 — a pronoun or summary word in the 定位句 (it, there, this,
    such, the issue) points to the answer elsewhere;
  - 例子 — the 定位句 is an example, a figure or a quoted expert, and the
    answer is the point it serves;
  - 转折 — the 定位句 is the expectation, set-up or concession, and the
    answer comes after but, yet, however, not … but; "not because X"
    followed by the real cause also counts;
  - 前后文展开 — the 定位句 raises a topic, a claim or a key question, and
    a sentence or two around it explains it, gives its background or
    follows the cause on; also when So, Therefore, That's why begins the
    定位句 and the cause is before it;
  - 叙事因果 — no signal word; the cause lies in what happened in the story;
  - 多处合并 — the answer needs two or more places put together (counting,
    sums, what several things share). Put the place the 题眼 lands on in
    `targetText` and the most telling other place in `answerText`.
  "Why does the author mention X", "What does the author want to show by
  telling X": the link is 例子.
  To choose, first ask whether the correct option is incomplete without
  one of several places: if so, 多处合并. Otherwise take the first that
  fits, in this order: 例子, 转折, 指代回指, 叙事因果, 前后文展开. The order
  only picks the link; the answer is always where the correct option points.
  A pronoun in the answer sentence pointing back to the 定位句 is
  前后文展开; only a pronoun in the 定位句 pointing away is 指代回指.
  If none of the six fits, the 定位句 is probably wrong; locate again.
  Say the link in the correct option's sense: never use an English word
  that only a wrong option uses, which leads the student to that option.
  Do not repeat the answer. Do not say WHERE (前一句, 后一句, 下一段): the
  PDF works that out from the positions and prints it on the 定位 line.
  When `answerText` is inside `targetText`, omit `bridgeZh`.
- `note` — as for every item: a short Chinese line; for this item say which
  stem words lead to which passage words.

Example, answer in the 定位句:

```json
{
  "sourceText": "Lake Mora",
  "sourceRole": "stem",
  "targetText": "Visitors to Lake Mora can rent a boat for ten dollars an hour.",
  "targetParagraphId": "para-...",
  "relationType": "locationCue",
  "answerText": "rent a boat for ten dollars an hour",
  "note": "题干 Lake Mora 原词出现在第 2 段。"
}
```

Example, answer in the context (a pronoun points back):

```json
{
  "sourceText": "the golden key",
  "sourceRole": "stem",
  "targetText": "The golden key was hidden there for forty years.",
  "targetParagraphId": "para-...",
  "relationType": "locationCue",
  "answerText": "an old clock tower stands at the edge of the village",
  "bridgeZh": "there 指 old clock tower",
  "note": "题干 the golden key 原词出现在第 3 段。"
}
```

Example, the passage uses other words:

```json
{
  "sourceText": "started",
  "sourceRole": "stem",
  "targetText": "When Mia opened her bakery, she expected few customers.",
  "targetParagraphId": "para-...",
  "relationType": "locationCue",
  "targetCue": "opened",
  "answerText": "the shop was full every morning",
  "bridgeZh": "But 后是实际情况，和预期相反",
  "note": "题干 started 对应原文 opened。"
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
- Every question must have `locateBy`; a `stem` question has exactly one stem `locationCue` item whose `sourceText` is copied from the stem, whose `targetText` is one whole passage sentence, and whose `answerText` lies inside the correct option's evidence quote; `bridgeZh` appears exactly when `answerText` is outside `targetText`
- If source information is sufficient, output immediately without unrelated deliberation text
