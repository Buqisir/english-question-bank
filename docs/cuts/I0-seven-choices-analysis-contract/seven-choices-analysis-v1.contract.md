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
- `primaryMechanismFacet`
- `topicClues`
- `contextEvidence`
- `optionFit`
- `teachingNote`

Every blank MUST include `primaryMechanismFacet`.

`roleFacet` answers what the inserted sentence does in discourse. It does not
decide whether the blank has a solving mechanism. Topic and summary blanks also
usually have a mechanism, often
`seven-choices.cohesion.lexical.topic-field-alignment`.

Choose `primaryMechanismFacet` by this teaching priority:

1. logical connector cohesion
2. referential cohesion
3. topic-field alignment

Topic-field alignment can support a logical / referential blank, but it should
not become primary when a real logical connector or reference relation is doing
the main work.

`mechanismSignals` is required for every blank. Each blank must have 2-5
signals, with at least one `option` signal and at least one context-side signal
(`context-before` or `context-after`).

For logical connector cohesion, signals must include the logical connector and
at least one logical object it connects to.

For referential cohesion, signals must include the reference word and its
antecedent / referent.

For topic-field alignment, `mechanismSignals` must include at least one
context-side signal and at least one option-side signal. These are the compact,
highlightable word chunks that directly prove the topic-field match. Broader
context-side clue lists still belong in `topicClues`.

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

`mechanismSignals` records concrete, highlightable signals for the solving
mechanism. It answers: which word or phrase is doing the logical /
referential / topic-field work, where is it, and what does it connect to?

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

Rules:

- `mechanismFacet` must be one of the valid mechanism facets above.
- `signalText` is the exact word or phrase to highlight.
- `signalSide` is `option`, `context-before`, or `context-after`.
- `targetText` is the connected word or phrase, when useful.
- `relation` explains the connection in Chinese.
- For topic-field alignment, include both context-side and option-side signals
  when both sides have exact highlightable text.
- `signalText` must be an exact substring of its source. `option` signals must
  appear in the correct option; context-side signals must appear in the passage
  or heading.
- Prefer short `signalText` chunks, usually 1-8 English words. Use `targetText`
  for larger explanation objects.
- Do not put the whole broad topic-clue list here. Use `topicClues` for broader
  context-side topic-field clues.

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

`topicClues` should contain 3-6 items per blank.

## Option Fit

`optionFit` links the correct option to the context.

- `correctOptionLabel` may be included for readability, but answerKey remains
  authoritative.
- `matchedClues` should compare option-side language with context-side clues.
- `fitSummary` explains the main solving move in Chinese.
- `fitSummary` should be 1-2 Chinese sentences and explain why the correct
  option fits this blank.

## Distractors

`keyDistractors` is optional and should contain at most two items.

Use it only for the most teachable wrong options. Do not give distractors their
own facet keys in v1.

## Teaching Note

`teachingNote` should be one Chinese sentence. It should state the transferable
solving move, not repeat the whole `fitSummary`.

## Strictly Out Of Scope For I0-B

- JSON Schema files
- prompt files
- sample `seven-choices-analysis-v1.json`
- validator scripts
- app/server/runtime code
- database facet tables
- PaperSurface rendering
