# Decisions — I0-C Seven Choices Prompt + Verify

Cut: I0-C 七选五 prompt + external input + verify
Status: implemented, plus mechanism signal contract patch
Last synced: 2026-05-25
Open items from external review: 1 teaching-label watch item retained for later human review

## Locked Decisions

### Scope

- I0-C creates the reusable external-AI prompt, the first complete external-AI
  input package, and a hard verifier for `seven-choices-analysis-v1`.
- I0-C does not implement app UI, server routes, import validation, PaperSurface
  rendering, database facet tables, or search runtime.
- I0-C creates the reviewed fixture only after the external AI returns a
  downloadable JSON file and Codex cleans/reviews it.

### Output Rule

The external AI must create exactly one downloadable JSON file named
`seven-choices-analysis-v1.json`.

There is no JSON-in-chat fallback. If the model cannot create a downloadable
file, it must reply exactly `UNABLE_TO_CREATE_FILE`.

### First Target Group

The first target is:

- paperId: `paper-2024-jslk-english`
- groupId: `group-2024-jslk-seven-choices`
- questionIds: `q-2024-jslk-036` through `q-2024-jslk-040`

The current paper-asset fixture has the seven-choices group, questions, blanks,
optionBank, and passage paragraphs, but it does not yet contain answerKey
entries for q36-q40. For I0-C prompt generation, the external input package
provides fixture answer labels:

```text
36 B
37 G
38 A
39 F
40 D
```

Future import/runtime validation should prefer official answerKey entries when
they exist.

### Verification Boundary

The verifier checks hard contract compliance and source references.

It does not judge prose quality, teaching elegance, or whether the natural
language explanation is the best possible classroom explanation.

## Open Decisions

- None.

## Moved / Cut

- Teacher-facing display / entry remains I0-D.

## Imported External Output

The owner provided:

```text
/Users/huangxuewei/Downloads/seven-choices-analysis-v1.json
```

The external output was structurally close but used object-shaped
`topicClues`, array-shaped `contextEvidence`, and split distractor fields
(`whyTempting` / `whyWrong`). Codex cleaned those into the contract shape and
stored the reviewed fixture at:

```text
app/public/paper-assets/paper-2024-jslk-english/analyses/seven-choices-analysis-v1.json
```

Verification passed:

```text
node scripts/verify-i0c-seven-choices-analysis-v1.mjs
```

## I0-C+ Mechanism Signals

During I0-D product grilling, the owner clarified that logical-connector and
referential-cohesion labels are not enough for UI highlighting. The UI needs the
specific signal word or phrase that realizes the cohesion mechanism.

Accepted patch:

- Add optional `mechanismSignals` to each `questions[questionId]` item.
- Require `mechanismSignals` when the blank uses either:
  - `seven-choices.cohesion.grammatical.logical-connector`
  - `seven-choices.cohesion.grammatical.referential-cohesion`
- Each signal records:
  - `mechanismFacet`
  - `signalText`
  - `signalSide`: `context` or `option`
  - `targetText`, when useful
  - `relation`
- `mechanismSignals` is for concrete highlightable cohesion signals, not broad
  topic-field clues.

The first fixture now includes:

- q36: option-side `If` as logical connector.
- q39: option-side `While` as logical connector.
- q40: option-side `uncomfortable` as topic-field alignment signal for
  `hurts / pain`.

## I0-D Terminology Clarification

The owner clarified that I0-D should not introduce "context clue" /
"上下文线索" as a formal UI or data concept.

Accepted terminology:

- Position: paragraph start / middle / end; source field `positionFacet`.
- Sentence role: topic / summary / bridge / cohesion; source field `roleFacet`.
- Solving mechanism: logical connector / referential cohesion / topic-field
  alignment; source fields `primaryMechanismFacet` and
  `supportingMechanismFacets`.
- Solving clues: concrete logical words, reference words, and topic-field words
  that can be highlighted; source fields `mechanismSignals` and `topicClues`.
- Evidence range: where to look and audit the blank; source field
  `contextEvidence`.

`contextEvidence` is not itself a clue type. It answers "where to look", not
"what solved the blank".

## Claude Lite CR Follow-Up

Claude lite CR reported 0 Must Fix and 4 Should Watch items.

Resolved before commit:

- Removed blank marker numbers from `contextEvidence` quote fields.
- Replaced copied paper-asset metadata inside `groups[groupId]` with light
  group analysis fields (`overview`, `discourseStructure`).
- Updated fixture provenance to `reviewedBy: "external-ai+codex-cleaned"`.
- Tightened the verifier so future fixtures cannot duplicate paper-asset group
  fields or include blank marker numbers in evidence quote fields.
- Tightened the prompt and external input package to request group analysis
  fields and marker-free evidence quotes.

Retained watch item:

- q37 `roleFacet = seven-choices.role.summary` is debatable because option G
  gives a concrete 10% rule rather than merely restating the paragraph. This is
  acceptable for I0-C as a first reviewed sample, but should receive human
  review before the label is used as a search-training signal.
