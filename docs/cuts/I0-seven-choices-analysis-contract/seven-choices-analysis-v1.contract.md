# Seven Choices Analysis V1 Contract

Cut: I0-B 七选五 reviewed-analysis contract
Last synced: 2026-05-24

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
    "seven-choices.cohesion.lexical.topic-field-recurrence"
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
- `seven-choices.cohesion.lexical.topic-field-recurrence`
- `seven-choices.cohesion.lexical.synonym-paraphrase`

Do not use parent keys as blank-level facet values.

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
