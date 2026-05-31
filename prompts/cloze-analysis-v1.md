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
- distractor glosses: what each wrong option means in this context (never why it is wrong)
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

Many blanks are solved by Collocation Fit alone — omit `signatureFacet` when no POS Signature genuinely applies.

**Asymmetric option treatment.** The correct option gets a `correctFit.reason` explaining WHY it fits. Distractors get only `distractorGlosses[].meaning` — a short Chinese gloss of what the option means in this context. NEVER argue why a distractor is wrong.

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
    "model": "...",
    "promptVersion": "cloze-analysis-v1",
    "reviewStatus": "reviewed",
    "reviewedBy": "AI",
    "reviewedAt": "2026-05-30"
  },
  "groups": {
    "group-...cloze": {
      "overview": "中文：文章主旨 + 文体（记叙文 / 夹叙夹议）",
      "affectiveArc": "中文：情感主线或故事走向（如先抑后扬），供情感一致类空参照"
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
        "reason": "中文：为什么对——搭配合理（施受/修饰关系）+ 特有考点怎样锁定"
      },
      "distractorGlosses": [
        { "optionLabel": "A", "optionText": "glance", "meaning": "中文：该词在此语境的意思" },
        { "optionLabel": "B", "optionText": "...", "meaning": "中文：词义" },
        { "optionLabel": "D", "optionText": "...", "meaning": "中文：词义" }
      ],
      "evidence": [
        {
          "type": "collocation-partner",
          "signalText": "the house",
          "signalSide": "context-after",
          "targetText": "pulled down",
          "relation": "中文：pull down 的宾语是 the house，施受关系成立。"
        }
      ],
      "teachingNote": "中文一句：可迁移的解题动作。"
    }
  }
}
```

## Required Fields Per Blank

Every `blanks[questionId]` MUST include:

- `blankId` — exact blankId from the input
- `blankNo` — integer blank number (41–55)
- `pos` — exactly one of: `verb`, `noun`, `adjective`, `adverb`, `phrase`, `other`
- `correctFit` — object with `reason` (1–3 Chinese sentences); `optionLabel` is recommended and MUST match the supplied answer key when present
- `distractorGlosses` — array; one entry per non-answer option, each with `optionLabel`, `optionText`, `meaning`
- `evidence` — array with ≥1 item; MUST include ≥1 `collocation-partner` item
- `teachingNote` — one Chinese sentence

`signatureFacet` is OPTIONAL. Include it only when a POS Signature genuinely applies. When present, it MUST be one of the five leaf keys listed in the table above, and its POS prefix MUST match `pos`.

## Group Analysis

`groups[groupId]` MUST include:

- `overview` — required; Chinese: main topic + text type
- `affectiveArc` — required; 1–2 sentences; Chinese: emotional arc or story direction

## Evidence Rules

Evidence items record concrete, highlightable substrings.

Closed `type` vocabulary — use ONLY these values:

- `collocation-partner` — the collocating partner word (verb's subject/object, noun's modifier, etc.)
- `repetition-echo` — a same-word / synonym / antonym echo elsewhere
- `semantic-field` — a topic-field partner word (noun semantic-field signature)
- `affective-cue` — a word that sets the emotional tone (affective-consistency signature)
- `logical-connector` — a transition or cause word in context

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

**Option-side usage:** `option`-side signals are reserved for `phrase` blanks only, to decompose the phrase (e.g. highlight `empty` and `out` separately) alongside a `contextual-composition` signature. Single-word blanks highlight in the passage, not the option.

Use short `signalText` (1–8 words). Use `targetText` for the larger connected object.

Do NOT pad evidence. Add an item only when it genuinely helps.

## Distractor Glosses

One entry per non-answer option. For a standard 4-option blank with correct answer C, the three distractors are A, B, D.

Each entry: `optionLabel`, `optionText` (the option text from the input), `meaning` (short Chinese gloss of what it means in context).

Do NOT explain why it is wrong. The student infers the mismatch from the correct-fit reasoning and the gloss.

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
