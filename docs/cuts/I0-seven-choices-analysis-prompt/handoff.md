# Handoff — Seven Choices Field Semantics

Last synced: 2026-05-26

This handoff is for the next thread that continues 七选五字段 / prompt /
analysis-quality work. It records the owner decisions made in chat after the
I0-C prompt and fixture work.

## Must Read First

- `docs/cuts/I0-seven-choices-analysis-prompt/decisions.md`
- `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md`
- `prompts/seven-choices-analysis-v1.md`
- `app/public/paper-assets/paper-2024-jslk-english/analyses/seven-choices-analysis-v1.json`

## Current Stable Model

The owner wants 七选五 analysis to separate these concepts:

- `positionFacet`: where the blank is: paragraph start / middle / end.
- `roleFacet`: what the inserted sentence does: topic / summary / bridge /
  cohesion.
- `primaryMechanismFacet`: the main solving mechanism.
- `supportingMechanismFacets`: optional secondary mechanisms.
- `mechanismSignals`: compact, exact, highlightable solving signals.
- `topicClues`: broader same-topic field chunks that help build context.
- `contextEvidence`: where to audit the blank. It is not a clue type.

Do not introduce "上下文线索" / "context clue" as a formal field. It is too broad
and blurs mechanism signals, topic clues, and evidence ranges.

## Mechanism Priority

Primary mechanism uses a hard teaching priority:

1. `seven-choices.cohesion.grammatical.logical-connector`
2. `seven-choices.cohesion.grammatical.referential-cohesion`
3. `seven-choices.cohesion.lexical.topic-field-alignment`

Topic-field alignment is the fallback primary mechanism only when there is no
real logical connector or referential cohesion doing the main solving work.

If the blank only has lexical / topic-field alignment, lexical is not weak. In
that case it is the primary mechanism and its signals should be strong
highlights, not only weak topic clues.

## Logical / Referential Direction Rule

Logical connector and referential cohesion can be triggered from either side:

- Option-side trigger: the correct option contains a logical connector or
  reference word, so the option must match the before / after context.
- Context-after trigger: the sentence after the blank contains a logical
  connector or reference word, so the inserted option must satisfy that
  downstream relation.

For referential cohesion, if the reference word requires an antecedent and the
antecedent is not inside the same sentence, the analysis should trace upward to
the previous context. The owner considers this important and usually
locatable.

## Signal vs Topic Clue Visual Semantics

The owner wants two visual strengths later in the UI:

- Strong highlight: true solving signals in `mechanismSignals`.
- Weak underline / wave / same-color marking: broader topic-field chunks in
  `topicClues` that help build the semantic field.

Do not make `topicClues` disappear just because they are weaker than
mechanism signals. For many blanks without logical or referential cues, same
topic-field chunks are how the student builds context.

`topicClues` means context-side word chunks scattered around the blank that
belong to the same topic field and help solve the blank.

## Distractor Scope

For this version, do not optimize for distractor analysis.

- Wrong options should stay neutral in the UI.
- Do not require key distractor analysis.
- If `keyDistractors` exists, treat it as optional supporting detail.
- The owner wants distractors handled in a later dedicated improvement cut.

## UI Direction Notes

The current Seven Choices Surface is acceptable as a working demo, but the
owner expects a later redesign:

- Left side: passage.
- Right side: option pool.
- Correct options highlighted; wrong options neutral for now.
- A-G option chips currently feel too "system-like" and may be redesigned.
- Highlight toggles can show all, one, or any subset of chains.

Do not mix that UI redesign into prompt/schema work unless a new cut explicitly
asks for it.

## Open / Watch

- q37 `roleFacet` may still deserve human review before using it as a
  search-training label.
- The fixture may need another pass so every blank has high-quality
  context-side `mechanismSignals`, not only option-side signals.
- Do not start I1 paper-import work from this handoff. I1 has its own plan at
  `docs/cuts/I1-paper-import/plan.md`.

## Suggested Next Skills

- `grill-me` if the owner wants to keep pressure-testing 七选五 terminology.
- `super-teacher` if the next task is teaching-language refinement.
- `tdd` only if changing verifier/schema behavior.
