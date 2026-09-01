# Cloze Analysis Prompt — V1

## Purpose

Produce a reviewed-analysis JSON object for 高考英语完形填空 (cloze) groups (q41–q55, 15 blanks, A–D options).

This is an API response task, not a chat answer, not a research report, and not a free-form explanation.

## Output Requirement

You MUST create exactly one downloadable `.json` file named:

```text
cloze-analysis-v1.json
```

Do NOT output JSON in chat.
Do NOT paste JSON content into the chat window.
Do NOT wrap JSON in markdown fences.
Do NOT write a filename heading.
Do NOT write "Here is the JSON".
Do NOT explain what you are doing.
Do NOT provide a fallback JSON-in-chat response.

If you cannot create a downloadable file, stop and reply with exactly:

```text
UNABLE_TO_CREATE_FILE
```

## Reasoning Rule

Reason carefully internally about:

- each blank's part of speech (verb / noun / adjective / adverb / phrase / other)
- Collocation Fit: does the correct option collocate in its sentence
- each distractor in the current event: what it means here, why it is tempting,
  and what concrete part of the context makes it fail
- optional POS Signature: only when collocation alone does not lock the answer
- exact, highlightable evidence substrings that prove the reasoning
- exact field names and enum values

But output only the JSON object.

Priority order:

1. JSON structure and enum values must be valid.
2. `evidence.signalText` must be an exact substring of the source.
3. Chinese explanation quality comes after structure and signal accuracy.

If you are unsure, preserve valid structure and exact signal text first. Do not write prettier prose at the cost of wrong fields or non-locatable signals.

## Teaching Model

Every blank is solved on two axes, plus a highlightable evidence layer.

**Axis 1 — Collocation Fit (搭配合理).** Universal for every blank. The first test is whether the option forms a reasonable collocation in its sentence — subject–verb–object fit, modifier–modified fit, etc. This axis IS the distractor-discrimination work.

**Axis 2 — POS Signature (词性特有考点).** Optional. Only mark when collocation alone does not lock the answer.

| pos value | Signature facet key | Teaching point |
| --- | --- | --- |
| verb | cloze.signature.verb.action-sequence | 动作顺序 |
| noun | cloze.signature.noun.semantic-field | 语义场 / 话题词呼应 |
| adjective | cloze.signature.adjective.affective-consistency | 情感态度与上下文一致 |
| adverb | cloze.signature.adverb.affective-consistency | 与所修饰形容词绑定 |
| phrase | cloze.signature.phrase.contextual-composition | 语境合成义，可猜词 |

**pos: "other"** is for blanks whose options are prepositions, pronouns, or similar; it runs Collocation Fit only and must NEVER carry a `signatureFacet`.

Many blanks are solved by Collocation Fit alone — omit `signatureFacet` when no POS Signature genuinely applies. When unsure, OMIT the signature.

**Guard `action-sequence` hardest — it is the most over-applied signature.** Use `cloze.signature.verb.action-sequence` ONLY when the temporal ORDER of two or more actions is itself the key that selects the option (e.g. one action must come before/after another, or a chain of steps fixes the answer). A verb blank solved by word meaning, collocation, or who-does-what to whom is NOT action-sequence — leave its `signatureFacet` empty. Most verb blanks have NO signature.

**Different jobs, complete teaching.** The correct option gets a
`correctFit.reason` that restores the immediate scene and explains the decisive
context relation. Every distractor uses the existing
`distractorGlosses[].meaning` field for one compact contextual discrimination:
what the word or phrase would mean here, why a student might consider it, and
why it does not describe this event or complete this sentence. The field name is
kept for schema compatibility; its content is no longer a bare dictionary gloss.

Internal labels such as Collocation Fit, POS Signature, semantic field, action
sequence, and affective consistency are for classification. Do not lead
`reason`, `meaning`, `relation`, or `teachingNote` with those labels. First say
what the people, actions, comparison, or sentence actually show. A term may be
added only after the concrete explanation, when it gives a reusable name.

**Logical connectors are NOT a blank type.** They are `logical-connector` evidence items.

## Required Top-Level Shape

```json
{
  "schemaVersion": "cloze-analysis-v1",
  "paperId": "paper-...",
  "sourceAssetVersion": 1,
  "targetGroups": ["group-...cloze"],
  "meta": {
    "generatedBy": "external-ai",
    "promptVersion": "cloze-analysis-v1",
    "reviewStatus": "reviewed"
  },
  "groups": {
    "group-...cloze": {
      "overview": "中文：文章主旨 + 文体（记叙文 / 夹叙夹议）",
      "fullTranslationZh": "填入正答后的全文中文翻译，每空保留 [41]...[55] 标记",
      "affectiveArc": "中文：用人物处境与关键变化概括情感主线或故事走向",
      "similaritySummary": "中文一句：谁在什么处境中做了什么，事情怎样发展或发生转变",
      "selectedLongSentences": [
        {
          "paragraphId": "para-...",
          "sourceText": "保留 __44__ 等空标的原文精确片段",
          "displayText": "按权威答案补全空格后的同一句",
          "relatedQuestionIds": ["q-...-044", "q-...-045"],
          "translationZh": "自然中文翻译",
          "analysisZh": "先找主干，再说明修饰和逻辑关系",
          "underlineTexts": ["displayText 中 1—3 个唯一精确片段"]
        }
      ]
    }
  },
  "blanks": {
    "q-...-041": {
      "blankId": "blank-...-041",
      "blankNo": 41,
      "pos": "verb",
      "signatureFacet": "cloze.signature.verb.action-sequence",
      "correctFit": {
        "optionLabel": "C",
        "reason": "中文：先还原当前事件，再说明哪个上下文细节锁定答案"
      },
      "distractorGlosses": [
        { "optionLabel": "A", "optionText": "glance", "meaning": "中文：此处词义；看似能接哪一点；放回当前语境为何不成立" },
        { "optionLabel": "B", "optionText": "...", "meaning": "中文：简短、具体的语境辨析" },
        { "optionLabel": "D", "optionText": "...", "meaning": "中文：简短、具体的语境辨析" }
      ],
      "evidence": [
        {
          "type": "collocation-partner",
          "signalText": "the house",
          "signalSide": "context-after",
          "targetText": "pulled down",
          "relation": "中文：the house 是被拆除的对象，因此这里表达 pull the house down。"
        }
      ],
      "teachingNote": "中文一句：可迁移的解题动作。"
    }
  }
}
```

Do NOT fill `meta.model`, `meta.reviewedBy`, or `meta.reviewedAt` — the server
stamps real provenance after generation. Emit `meta` only as shown above
(`generatedBy`, `promptVersion`, `reviewStatus`).

## Required Fields Per Blank

Every `blanks[questionId]` MUST include:

- `blankId` — exact blankId from the input
- `blankNo` — integer blank number (41–55)
- `pos` — exactly one of: `verb`, `noun`, `adjective`, `adverb`, `phrase`, `other`
- `correctFit` — object with `reason` (1–3 Chinese sentences); restore the
  current event or sentence, then explain the relation that selects the answer;
  `optionLabel` is recommended and MUST match the supplied answer key when present
- `distractorGlosses` — array; one entry per non-answer option, each with
  `optionLabel`, `optionText`, `meaning`; `meaning` must combine contextual
  meaning, temptation, and concrete mismatch rather than stop at translation
- `evidence` — array with ≥1 item; MUST include ≥1 `collocation-partner` item
- `teachingNote` — one Chinese sentence

`signatureFacet` is OPTIONAL. Include it only when a POS Signature genuinely applies. When present, it MUST be one of the five leaf keys listed in the table above, and its POS prefix MUST match `pos`.

## Group Analysis

`groups[groupId]` MUST include:

- `overview` — required; Chinese: main topic + text type
- `fullTranslationZh` — required for new NCK1 generation; translate the complete
  answer-filled passage into natural Chinese in source order. Immediately before
  each translated correct word or phrase, keep its exact ASCII blank marker
  (`[41]` ... `[55]`, or the source paper's actual blank numbers), exactly once.
  Preserve paragraph breaks; do not add analysis or vocabulary notes.
- `affectiveArc` — required; 1–2 sentences; Chinese: emotional arc or story direction
- `similaritySummary` — required for new generation; exactly one compact Chinese
  sentence that says both what happens and how the situation develops or turns.
  This is the stable text later embedded for whole-passage similarity. Do not
  write a label such as “温暖的成长故事”, list the fifteen answers, or imitate
  the model answer. The Embedding vector itself is generated and versioned by
  the indexer, never by this analysis response.
- `selectedLongSentences` — required; 1–2 sentences with real teaching value.
  Prefer a difficult sentence that carries the story's key meaning or connects
  several blanks; do not select it merely for length. `paragraphId` and
  `sourceText` must locate the stored source exactly and retain its `__44__`-style
  markers. `displayText` must be the deterministic form completed with the
  authoritative option texts. `relatedQuestionIds` must belong to this group.
  `analysisZh` first restores the main trunk, then attaches modifiers and logical
  relations instead of listing grammar labels. `underlineTexts` contains 1–3
  unique, non-overlapping exact substrings of `displayText`; underline only the
  decisive structure.

## Evidence Rules

Evidence items record concrete, highlightable substrings.

Closed `type` vocabulary — use ONLY these values:

- `collocation-partner` — the collocating partner word (verb's subject/object, noun's modifier, etc.)
- `repetition-echo` — a same-word / synonym / antonym echo elsewhere
- `semantic-field` — a topic-field partner word (noun semantic-field signature)
- `affective-cue` — a word that sets the emotional tone (affective-consistency signature)
- `logical-connector` — a transition or cause word in context

**`type` and `signalSide` are two DIFFERENT axes — never mix them up.** `type`
is WHAT KIND of signal (the five values above). `signalSide` is WHERE it sits
(`context-before` / `context-after` / `stem` / `option`). `type` is NEVER
`"option"`, `"context-before"`, or any side value. An option-side signal is
written as `{ "type": "collocation-partner", "signalSide": "option", ... }`,
NOT `{ "type": "option" }`.

Each evidence item:

```json
{
  "type": "collocation-partner",
  "signalText": "exact substring of source",
  "signalSide": "context-before",
  "targetText": "optional connected phrase",
  "relation": "中文：这个词如何指向答案"
}
```

`signalSide` MUST be exactly one of: `context-before`, `context-after`, `stem`, `option`

**Exact-substring rule:** `signalText` MUST be an exact substring of its source.
- `context-before` / `context-after` / `stem` signals: `signalText` MUST appear verbatim in the cloze passage text or question stem.
- `option` signals: `signalText` MUST appear verbatim in one of that blank's A–D option texts.

**Blank marker rule:** `signalText` MUST NOT include blank markers such as `__41__`, `__42__`, etc. Quote the surrounding words, NEVER the blank token itself.

**Option-side usage:** `option`-side signals are reserved for `phrase` blanks only, to decompose the phrase (e.g. highlight `empty` and `out` separately) alongside a `contextual-composition` signature. Single-word blanks highlight in the passage, not the option. Correct shape for an option-side decomposition signal:

```json
{ "type": "collocation-partner", "signalText": "empty", "signalSide": "option", "targetText": "empty out", "relation": "中文：empty 表示“空”。" }
```

Use short `signalText` (1–8 words). Use `targetText` for the larger connected object.

Do NOT pad evidence. Add an item only when it genuinely helps.

## Distractor Glosses

One entry per non-answer option. For a standard 4-option blank with correct answer C, the three distractors are A, B, D.

Each entry: `optionLabel`, `optionText` (the option text from the input),
`meaning` (one compact Chinese contextual discrimination).

Write `meaning` in this order when all three steps are useful:

1. the word or phrase's meaning in this sentence;
2. the nearby word, familiar collocation, or partial event that makes it tempting;
3. the exact action, object, contrast, cause, or story direction it fails to express.

For an obvious distractor, steps 2 and 3 may be merged into one short clause.
Do not invent a difference merely to make every line equally long. Never give
only a reusable dictionary gloss such as `优势、好处` or `贡献`.

Good shape:

```text
“贡献”；它看似也能表示正面结果，但这里比较的是作者完成 15 英里与对方准备
52.4 英里的成绩大小，不是在说作者为别人作了什么贡献。
```

Bad shape:

```text
贡献。
```

## Strictly Forbidden

- Do NOT output chat JSON or markdown.
- Do NOT invent blank IDs, question IDs, group IDs, or option labels.
- Do NOT change passage text, option text, or answer labels.
- Do NOT use `seven-choices.*` facet keys; this is `cloze.*` vocabulary only.
- Do NOT include `schemaVersion: "seven-choices-analysis-v1"` — it MUST be `"cloze-analysis-v1"`.
- Do NOT mark a `signatureFacet` for `pos: "other"` blanks.
- Do NOT mark a `signatureFacet` whose POS prefix does not match `pos` (e.g. a `verb` blank cannot use `cloze.signature.noun.*`).
- Do NOT include a blank marker (`__41__` and similar) in any `signalText`.
- Do NOT overwrite or contradict the authoritative answer key.
- Do NOT omit the ≥1 `collocation-partner` evidence per blank.
- Do NOT create fields named `contextClues`, `上下文线索`, `answer`, `correctAnswer`, `analysisZh`, or `questionSide`.
