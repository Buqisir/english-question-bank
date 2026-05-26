# Seven Choices Analysis Prompt — V1

## Purpose

Produce a reviewed-analysis JSON file for 高考英语七选五 groups.

This is a file-generation task, not a chat answer, not a research report, and
not a free-form explanation.

## Output Requirement

You MUST create exactly one downloadable `.json` file named:

```text
seven-choices-analysis-v1.json
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

- the blank's discourse position
- the inserted sentence role
- grammatical / lexical cohesion
- topic clues from the context
- correct-option fit
- optional teachable distractors, only when genuinely useful
- exact field names and enum values

But output only the downloadable JSON file.

If the supplied passage, option bank, questions, blanks, and answer labels are
sufficient, generate the file immediately. Do not spend time on unrelated
thinking, task restatement, process narration, or confirmation.

Priority order:

1. JSON structure and enum values must be valid.
2. `mechanismSignals.signalText` must be exact and locatable.
3. Chinese explanation quality comes after structure and signal accuracy.

If you are unsure, preserve valid structure and exact signal text first. Do not
write prettier prose at the cost of wrong fields or non-locatable signals.

## Required Top-Level Shape

```json
{
  "schemaVersion": "seven-choices-analysis-v1",
  "paperId": "paper-...",
  "sourceAssetVersion": 1,
  "targetGroups": ["group-..."],
  "meta": {
    "generatedBy": "external-ai",
    "model": "...",
    "promptVersion": "seven-choices-analysis-v1",
    "reviewStatus": "reviewed",
    "reviewedBy": "...",
    "reviewedAt": "..."
  },
  "groups": {
    "group-...": {
      "overview": "Chinese overview of the passage topic and 七选五 structure",
      "discourseStructure": {
        "summary": "Chinese summary of the discourse flow",
        "units": [
          {
            "unitId": "unit-...",
            "heading": "Optional heading text",
            "paragraphIds": ["para-..."],
            "summary": "Chinese summary of this unit"
          }
        ]
      }
    }
  },
  "questions": {
    "q-...": {}
  }
}
```

## Group Analysis

Each `groups[groupId]` item is light analysis, not copied source data.

Include:

- `overview`
- `discourseStructure.summary`
- `discourseStructure.units[]`

Do NOT copy paper-asset fields into `groups[groupId]`. In particular, do not
include `groupId`, `groupType`, `questionIds`, `blankIds`, `optionBank`, or
`passageTitle` there.

## Required Per-Blank Shape

Each `questions[questionId]` item analyzes one blank.

```json
{
  "blankId": "blank-...",
  "positionFacet": "seven-choices.position.paragraph-middle",
  "roleFacet": "seven-choices.role.cohesion",
  "primaryMechanismFacet": "seven-choices.cohesion.grammatical.referential-cohesion",
  "supportingMechanismFacets": [
    "seven-choices.cohesion.lexical.topic-field-alignment"
  ],
  "topicClues": [
    "new runners",
    "training program",
    "risk of injury"
  ],
  "contextEvidence": {
    "paragraphId": "para-...",
    "headingAnchor": "Optional heading text",
    "beforeQuote": "Short exact context before the blank",
    "afterQuote": "Short exact context after the blank"
  },
  "mechanismSignals": [
    {
      "mechanismFacet": "seven-choices.cohesion.grammatical.logical-connector",
      "signalText": "If",
      "signalSide": "option",
      "targetText": "keep these things in mind",
      "relation": "If 引出适用条件，与空后祈使句构成条件—建议关系。"
    }
  ],
  "optionFit": {
    "correctOptionLabel": "G",
    "fitSummary": "Chinese explanation of why the option fits",
    "matchedClues": [
      {
        "contextSide": "training program / risk of injury",
        "optionSide": "increasing your running distance by no more than 10% each week",
        "relation": "Chinese explanation of the match"
      }
    ]
  },
  "keyDistractors": [
    {
      "optionLabel": "A",
      "reason": "Chinese explanation of the tempting but wrong fit"
    }
  ],
  "teachingNote": "Chinese teacher-facing explanation of the solving move"
}
```

`contextEvidence` must be one object, not an array. Its quote fields must use
exact passage text but must exclude the blank marker number itself, such as
`36`, `37`, `38`, `39`, or `40`.

## Facet Values

Use ONLY these position facets:

- `seven-choices.position.paragraph-start`
- `seven-choices.position.paragraph-middle`
- `seven-choices.position.paragraph-end`

Use ONLY these role facets:

- `seven-choices.role.topic`
- `seven-choices.role.summary`
- `seven-choices.role.bridge`
- `seven-choices.role.cohesion`

Use ONLY these mechanism facets:

- `seven-choices.cohesion.grammatical.referential-cohesion`
- `seven-choices.cohesion.grammatical.logical-connector`
- `seven-choices.cohesion.lexical.topic-field-alignment`

Do NOT use parent keys as blank-level facet values.
Do NOT invent new facet keys.
Do NOT use earlier draft names for lexical echo or pronoun reference. Use the
final facet keys listed above exactly.

## Mechanism Rules

Every blank MUST include primaryMechanismFacet.

`roleFacet` answers what the inserted sentence does. `primaryMechanismFacet`
answers how the blank is solved. Topic and summary blanks still need a solving
mechanism, usually `seven-choices.cohesion.lexical.topic-field-alignment`.

Choose `primaryMechanismFacet` by this hard priority order:

1. If the correct option and the before / after context form a clear logical
   connector relation, use
   `seven-choices.cohesion.grammatical.logical-connector`.
2. Otherwise, if they form a clear referential relation, use
   `seven-choices.cohesion.grammatical.referential-cohesion`.
3. Otherwise, use `seven-choices.cohesion.lexical.topic-field-alignment`.

Topic-field alignment can be supporting evidence, but it must not override a
real logical connector or referential mechanism as the primary mechanism.
When no logical connector or referential cohesion is doing the main solving
work, topic-field alignment is not a weak mechanism. It is the primary solving
mechanism, and its compact matched signals belong in `mechanismSignals`.

- `supportingMechanismFacets` is optional and may contain at most 2 items.
- `mechanismSignals` is required for every blank.
- Each blank must have 2-5 `mechanismSignals`.
- Each blank must include at least one option-side signal and at least one
  context-side signal (`context-before` or `context-after`).
- A logical-connector blank must include the logical connector and at least one
  logical object it connects to.
- A referential-cohesion blank must include the reference word and its
  antecedent / referent.
- A topic-field-alignment blank must include compact matched word chunks from
  both the context side and option side.

Common logical connectors include, but are not limited to: if, while, however,
therefore, so, also, instead, for example, in addition, as a result, because,
although, but, yet.

Common reference words include, but are not limited to: this, that, these,
those, it, they, such, one, ones, the former, the latter.

## Mechanism Signals

Use `mechanismSignals` for the exact logical connector, pronoun, demonstrative,
or topic-field word chunk that should be highlightable in the UI.
They are the strong solving signals. A future surface may render them as strong
highlights.

Each item must include:

- `mechanismFacet`
- `signalText`
- `signalSide`: `option`, `context-before`, or `context-after`
- `targetText` when useful
- `relation` in Chinese

`signalText` rules:

- It MUST be an exact substring of its source.
- `option` signal text must appear in the correct option.
- `context-before` / `context-after` signal text must appear in the passage or
  heading.
- Prefer short chunks, usually 1-8 English words.
- Logical connectors and reference words may be a single word.
- Do not put a whole sentence or paragraph in `signalText`; use `targetText`
  for larger explanation objects.

`targetText` may be a summary or multi-part explanation. It does not need to be
independently highlightable.

Examples:

```json
[
  {
    "mechanismFacet": "seven-choices.cohesion.lexical.topic-field-alignment",
    "signalText": "hurts",
    "signalSide": "context-after",
    "targetText": "uncomfortable",
    "relation": "hurts 与选项 uncomfortable 属于疼痛/不适话题场。"
  },
  {
    "mechanismFacet": "seven-choices.cohesion.lexical.topic-field-alignment",
    "signalText": "uncomfortable",
    "signalSide": "option",
    "targetText": "hurts / pain",
    "relation": "uncomfortable 概括空后 hurts、pain。"
  },
  {
    "mechanismFacet": "seven-choices.cohesion.grammatical.logical-connector",
    "signalText": "If",
    "signalSide": "option",
    "targetText": "keep these things in mind",
    "relation": "If 引出适用条件，与空后祈使句构成条件—建议关系。"
  },
  {
    "mechanismFacet": "seven-choices.cohesion.grammatical.referential-cohesion",
    "signalText": "these things",
    "signalSide": "context-after",
    "targetText": "common mistakes",
    "relation": "these things 指代前文 common mistakes。"
  }
]
```

For topic-field alignment, put only the compact matched words or chunks that
decide the answer in `mechanismSignals`. Put the broader context-side clue set
in `topicClues`.

## Topic Clues

`topicClues` are required for every blank.

They are context-side word chunks in the blank's semantic paragraph or content
unit that belong to the same topic field and help solve the blank.
They are broader than `mechanismSignals`: useful context-side topic-field clues,
not the strongest solving signal. A future surface may render them as weaker
marks such as underlines or wave marks.

Do NOT introduce `contextClues`, "context clue", or "上下文线索" as a formal
field or category. That wording is too broad and blurs `mechanismSignals`,
`topicClues`, and `contextEvidence`.

Rules:

- Include 3-6 items per blank.
- Include nearby context / heading clues only.
- Do NOT include words that appear only in the correct option.
- Do NOT collect generic high-frequency words.
- Prefer short chunks over isolated function words.

Example good `topicClues`:

```json
["Not wearing the right equipment", "wear properly", "workouts", "running shoes"]
```

Example bad `topicClues`:

```json
["expensive equipment", "take up running"]
```

The bad examples may belong in `optionFit.matchedClues[].optionSide`, not in
`topicClues`.

## Option Fit

`optionFit` explains how the correct option fits the context.

- `correctOptionLabel` must match the supplied answer label.
- `matchedClues` must compare option-side language with context-side clues.
  It is expanded explanation detail, not a UI highlighting source.
- `fitSummary` must explain the main solving move in Chinese.
- `fitSummary` should be 1-2 Chinese sentences. It explains why this option
  fits this blank.

## Context Evidence

`contextEvidence` is the audit location for the blank. It tells the reviewer
where to look: paragraph ID, optional heading anchor, and exact before / after
quotes.

It is not a clue type and should not be treated as the thing that solved the
blank. Put concrete solving signals in `mechanismSignals`; put broader
context-side topic-field chunks in `topicClues`.

## Distractors

`keyDistractors` is optional and may contain at most 2 items.

Use it only for the most teachable wrong options. Do NOT give distractors their
own facet keys.

Do not spend effort filling distractors if it harms the correct-option signal
quality. The current surface does not display distractors.

## Teaching Note

`teachingNote` should be one Chinese sentence. It should state the transferable
solving move, not repeat the whole `fitSummary`.

## Strictly Forbidden

- Do NOT output chat JSON.
- Do NOT output markdown.
- Do NOT invent paragraph IDs, blank IDs, question IDs, group IDs, or option
  labels.
- Do NOT change passage text, option text, or answer labels.
- Do NOT include `status` as a chat wrapper.
- Do NOT include `questionNo` instead of `questionId` keys.
- Do NOT include analysis for non-target groups.
- Do NOT use `reading-choice-analysis-v1` fields or schemaVersion.
- Do NOT create fields named `answer`, `correctAnswer`, `explanationZh`,
  `analysisZh`, `questionSide`, or `sourceSide`.
