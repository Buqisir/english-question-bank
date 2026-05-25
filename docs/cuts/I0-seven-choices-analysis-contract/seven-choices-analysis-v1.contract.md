# Seven Choices Analysis V1 Contract

Cut: I0-B 七选五 reviewed-analysis contract
Last synced: 2026-05-25

This document defines the intended reviewed-analysis JSON shape for 七选五.
It is not yet a JSON Schema, TypeScript runtime type, validator, or prompt.

## Purpose

`seven-choices-analysis-v1` records reviewed teacher-facing analysis for
七选五 blanks. It explains why each correct option fits a blank, using the
I0-A facet taxonomy plus concrete text clues.

The file is for reviewed analysis. It is not the answer authority.

## Top-Level Shape

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
    "reviewedAt": "2026-05-24"
  },
  "groups": {
    "group-...": {}
  },
  "questions": {
    "q-...": {}
  }
}
```

## Group Analysis

Each target group may include a light group overview.

```json
{
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
```

`unitId` is analysis-local and must not replace paper-asset `paragraphId`.
Any paragraph evidence must still use existing paper-asset paragraph IDs.

## Question / Blank Analysis

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
      "relation": "If introduces the condition for the following advice."
    }
  ],
  "optionFit": {
    "correctOptionLabel": "G",
    "fitSummary": "Chinese explanation of why the option fits",
    "matchedClues": [
      {
        "contextSide": "training program / risk of injury",
        "optionSide": "increasing your running distance by no more than 10% each week",
        "relation": "The option gives a concrete gradual-training rule that fits the context's injury-prevention topic."
      }
    ]
  },
  "keyDistractors": [
    {
      "optionLabel": "A",
      "reason": "Chinese explanation of the tempting but wrong fit."
    }
  ],
  "teachingNote": "Chinese teacher-facing explanation of the solving move."
}
```

## Required Fields

For each blank:

- `blankId`
- `positionFacet`
- `roleFacet`
- `topicClues`
- `contextEvidence`
- `optionFit`
- `teachingNote`

`primaryMechanismFacet` is required when `roleFacet` is
`seven-choices.role.cohesion`.
It is optional when `roleFacet` is `seven-choices.role.bridge`.
It must be absent when `roleFacet` is `seven-choices.role.topic` or
`seven-choices.role.summary`.

`mechanismSignals` is required when a blank uses grammatical cohesion through
logical connectors or referential cohesion, whether the mechanism appears in
`primaryMechanismFacet` or `supportingMechanismFacets`. It is optional for
lexical cohesion and for topic / summary roles.

## Terminology

Do not use "context clue" / "上下文线索" as a formal 七选五 analysis term in
this contract. It is too broad and can blur several different concepts.

Use these terms instead:

- `positionFacet`: where the blank appears, such as paragraph start / middle /
  end.
- `roleFacet`: what the inserted sentence does, such as topic, summary, bridge,
  or cohesion.
- `primaryMechanismFacet` / `supportingMechanismFacets`: how the sentence
  connects, such as logical connector, referential cohesion, or topic-field
  alignment.
- `mechanismSignals`: concrete logical words, reference words, or lexical
  signals that can be highlighted.
- `topicClues`: context-side topic-field words or chunks that help solve the
  blank.
- `contextEvidence`: the evidence range used to locate and audit the blank,
  such as the paragraph ID, heading, and before / after quotes. It answers
  "where to look", not "what type of clue solved the blank".

## Facet Rules

Facet values must be I0-A leaf keys.

Valid position facets:

- `seven-choices.position.paragraph-start`
- `seven-choices.position.paragraph-middle`
- `seven-choices.position.paragraph-end`

Valid role facets:

- `seven-choices.role.topic`
- `seven-choices.role.summary`
- `seven-choices.role.bridge`
- `seven-choices.role.cohesion`

Valid mechanism facets:

- `seven-choices.cohesion.grammatical.referential-cohesion`
- `seven-choices.cohesion.grammatical.logical-connector`
- `seven-choices.cohesion.lexical.topic-field-alignment`

Do not use parent keys as blank-level facet values.

## Mechanism Signals

`mechanismSignals` records concrete, highlightable signals for the cohesion
mechanism. It answers: which word or phrase is doing the logical / referential
work, where is it, and what does it connect to?

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

Rules:

- `mechanismFacet` must be one of the valid mechanism facets above.
- `signalText` is the exact word or phrase to highlight.
- `signalSide` is `context` or `option`.
- `targetText` is the connected word or phrase, when useful.
- `relation` explains the connection in Chinese.
- Do not put broad topic clues here. Use `topicClues` for topic-field clues.

## Topic Clues

`topicClues` are context-side clues only.

They may come from nearby passage text or a heading, but they must not include
words that appear only in the correct option.

Good examples:

```json
["Not wearing the right equipment", "wear properly", "workouts", "running shoes"]
```

Bad examples:

```json
["expensive equipment", "take up running"]
```

The bad examples may belong in `optionFit.matchedClues[].optionSide`, not in
`topicClues`.

## Option Fit

`optionFit` links the correct option to the context.

- `correctOptionLabel` may be included for readability, but answerKey remains
  authoritative.
- `matchedClues` should compare option-side language with context-side clues.
- `fitSummary` explains the main solving move in Chinese.

## Distractors

`keyDistractors` is optional and should contain at most two items.

Use it only for the most teachable wrong options. Do not give distractors their
own facet keys in v1.

## Strictly Out Of Scope For I0-B

- JSON Schema files
- prompt files
- sample `seven-choices-analysis-v1.json`
- validator scripts
- app/server/runtime code
- database facet tables
- PaperSurface rendering
