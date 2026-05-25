# Decisions — I0-B Seven Choices Analysis Contract

Cut: I0-B 七选五 reviewed-analysis contract
Status: accepted for docs-only implementation
Last synced: 2026-05-24
Open items from external review: none

## Locked Decisions

### Scope

- I0-B defines the human-readable contract for a future
  `seven-choices-analysis-v1` reviewed-analysis JSON file.
- I0-B is still docs-only. It does not create JSON Schema files, TypeScript
  runtime types, import validators, prompt files, sample JSON fixtures, app UI,
  PaperSurface entry points, search runtime, or database tables.
- I0-B consumes I0-A facet decisions. It must not rename I0-A facet keys.

### Source Of Truth

I0-B depends on:

- `docs/cuts/I0-facet-taxonomy-foundation/decisions.md`
- `docs/cuts/I0-facet-taxonomy-foundation/facet-taxonomy-draft.md`
- existing paper-asset `sevenChoices` groups with `questionIds`, `blankIds`,
  `optionBank`, passage paragraphs, and answerKey entries

### File Identity

The future reviewed-analysis file will use:

```json
{
  "schemaVersion": "seven-choices-analysis-v1"
}
```

It is a separate file from:

- `reading-choice-analysis-v1.json`
- old saved DeepSeek `sevenChoicesParseResult`

I0-B does not decide the final storage path. A later cut may place the file
under `analyses/seven-choices-analysis-v1.json` or another reviewed-analysis
location.

### Unit Of Analysis

The analysis unit is the blank / question, not the option.

Every question analysis item is keyed by `questionId` and must include the
corresponding `blankId`. The correct option is used to explain the blank, but
the facet and teaching fields attach to the blank.

### Answer Authority

AnswerKey remains authoritative.

If future JSON includes `correctOptionLabel`, validators must check it against
answerKey. The analysis file must not be treated as the answer source.

### Required Per-Blank Meaning

Each blank analysis must answer four teacher questions:

1. Where is this blank in the discourse unit?
2. What sentence role does the correct option play after insertion?
3. What is the main cohesion / fit mechanism, if any?
4. What concrete context clues make the answer teachable?

### Facet Field Rules

The contract uses I0-A leaf facet keys.

- `positionFacet`: required, exactly one `seven-choices.position.*` leaf.
- `roleFacet`: required, exactly one `seven-choices.role.*` leaf.
- `primaryMechanismFacet`:
  - required when `roleFacet` is `seven-choices.role.cohesion`
  - optional when `roleFacet` is `seven-choices.role.bridge`
  - absent when `roleFacet` is `seven-choices.role.topic` or
    `seven-choices.role.summary`
- `supportingMechanismFacets`: optional array, max 2, leaf keys only.

Mechanism facets must come from:

- `seven-choices.cohesion.grammatical.referential-cohesion`
- `seven-choices.cohesion.grammatical.logical-connector`
- `seven-choices.cohesion.lexical.topic-field-recurrence`
- `seven-choices.cohesion.lexical.synonym-paraphrase`

Do not use parent keys such as `seven-choices.cohesion.lexical` as blank-level
mechanism labels.

### Topic Clues

`topicClues` are required for every blank.

Definition:

> Context-side word chunks in the blank's semantic paragraph or content unit
> that belong to the same topic field and help solve the blank.

Rules:

- Include nearby context / heading clues only.
- Do not include words that appear only in the correct option.
- Do not collect generic high-frequency words.
- Prefer short chunks over isolated function words.

### Option Fit

`optionFit` explains how the correct option fits the context.

It is not a facet. It is text evidence connecting the option side to the
context side, especially for topic-field recurrence and synonym paraphrase.

### Context Evidence

`contextEvidence` records the local evidence around the blank.

It should be precise enough for future prompt generation and verification, but
I0-B does not require PaperSurface line-level anchors.

Expected evidence includes:

- `paragraphId`
- optional `headingAnchor`
- short `beforeQuote` when useful
- short `afterQuote` when useful

### Distractors

I0-B allows 1-2 key distractor notes per blank in future analysis.

Distractors do not receive facet keys in v1. Their reasons are prose analysis,
not a separate distractor taxonomy.

## Open Decisions

- None for I0-B.

## Moved / Cut

- JSON Schema implementation is moved to I0-C or later.
- External AI prompt, sample JSON, and verify script are moved to I0-C.
- Teacher-facing UI / PaperSurface display is moved to I0-D.
- Runtime search and database facet tables are moved to a later large cut.
- Reading comprehension facet taxonomy remains deferred until after the
  七选五 closed loop.
