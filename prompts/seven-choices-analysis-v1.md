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
- 1-2 teachable distractors
- exact field names and enum values

But output only the downloadable JSON file.

If the supplied passage, option bank, questions, blanks, and answer labels are
sufficient, generate the file immediately. Do not spend time on unrelated
thinking, task restatement, process narration, or confirmation.

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

- If `roleFacet` is `seven-choices.role.cohesion`, `primaryMechanismFacet` is
  required.
- If `roleFacet` is `seven-choices.role.bridge`, `primaryMechanismFacet` is
  optional.
- If `roleFacet` is `seven-choices.role.topic` or
  `seven-choices.role.summary`, `primaryMechanismFacet` MUST be absent.
- `supportingMechanismFacets` is optional and may contain at most 2 items.
- `mechanismSignals` is required when the blank uses
  `seven-choices.cohesion.grammatical.logical-connector` or
  `seven-choices.cohesion.grammatical.referential-cohesion`, whether the
  mechanism is primary or supporting.

## Mechanism Signals

Use `mechanismSignals` for the exact logical connector, pronoun, demonstrative,
or other concrete cohesion signal that should be highlightable in the UI.

Each item must include:

- `mechanismFacet`
- `signalText`
- `signalSide`: `context` or `option`
- `targetText` when useful
- `relation` in Chinese

Examples:

```json
[
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
    "signalSide": "context",
    "targetText": "common mistakes",
    "relation": "these things 指代前文 common mistakes。"
  }
]
```

Do NOT put broad topic-field words in `mechanismSignals`; use `topicClues` for
that.

## Topic Clues

`topicClues` are required for every blank.

They are context-side word chunks in the blank's semantic paragraph or content
unit that belong to the same topic field and help solve the blank.

Rules:

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
- `fitSummary` must explain the main solving move in Chinese.

## Distractors

`keyDistractors` is optional and may contain at most 2 items.

Use it only for the most teachable wrong options. Do NOT give distractors their
own facet keys.

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
