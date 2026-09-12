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
- the real before → inserted sentence → after progression in plain language
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

## Teaching Prose Rule

Position, role, and mechanism facets are internal classification. Keep their
enum values exact, but do not begin `fitSummary`, `relation`, or `reason`
with labels such as referential cohesion, topic-field alignment,
or lexical repetition. First reconstruct what the passage is doing.

`optionFit.fitSummary` should normally read as:

```text
空前正在做/问/说明什么 → 选项补上什么 → 空后为何能从这里继续
```

For example, say “饮品做好后喊出杯上名字，顾客才会上前取走”，before naming
that movement an action chain. For a question-answer gap, state the question and
the solution. For a topic-sentence gap, state what all following examples have
in common. For a reference gap, name the exact referent instead of only saying
“形成指代”。

`mechanismSignals[].relation` should explain what the highlighted words connect,
not simply announce that they belong to the same topic field. `keyDistractors`
may contain 0–2 genuinely teachable options; say which small part appears to fit
and exactly where the connection breaks. Do not fill it for symmetry.

## Required Top-Level Shape

```json
{
  "schemaVersion": "seven-choices-analysis-v1",
  "paperId": "paper-...",
  "sourceAssetVersion": 1,
  "targetGroups": ["group-..."],
  "meta": {
    "generatedBy": "external-ai",
    "promptVersion": "seven-choices-analysis-v1",
    "reviewStatus": "reviewed"
  },
  "groups": {
    "group-...": {
      "overview": "50–80字软目标的中文内容简介，概括主题及核心内容",
      "fullTranslationZh": "Answer-completed full Chinese passage translation with [36]...[40] markers",
      "selectedLongSentences": [
        {
          "paragraphId": "para-...",
          "sourceText": "Exact source sentence, retaining any __36__ marker",
          "displayText": "The same sentence with the authoritative option inserted",
          "relatedQuestionIds": ["q-...-036"],
          "translationZh": "Natural Chinese translation",
          "analysisZh": "Chinese explanation of the main trunk, modifiers, and relations",
          "underlineRanges": [{"start": 0, "end": 3, "quote": "The"}]
        }
      ],
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

Do NOT fill `meta.model`, `meta.reviewedBy`, or `meta.reviewedAt`. The runtime
stamps the actual model identity; Owner Review records approval provenance
later. `reviewStatus` is a compatibility field in this analysis contract, not
Owner Review approval.

## Group Analysis

Each `groups[groupId]` item is light analysis, not copied source data.

Include:

- `overview`
- `fullTranslationZh`
- `selectedLongSentences`
- `discourseStructure.summary`
- `discourseStructure.units[]`

`overview` is the one canonical introduction shared by teaching, list/search
and future similarity consumers. Aim for 50–80 Chinese characters without
padding. Do not discuss individual gaps or cohesion mechanics here; keep those
in the separate discourse fields.

`fullTranslationZh` is student-visible. Translate the whole passage in source
order and complete all five gaps with the authoritative answer sentences.
Preserve paragraph breaks. Do not hand-write `[36]`-style markers: insertion
identity comes only from `teachingContent` relationships. Do not add option letters, analysis,
vocabulary notes, or source text that is not present in this group.

`selectedLongSentences` contains 1–2 sentences with real teaching value; each has
a stable `sentenceId`. Prefer
a difficult sentence that carries the passage's central meaning or materially
supports one of the five gaps; do not select it merely for length. `paragraphId`
and `sourceText` must locate the stored source exactly, retaining any `__36__`
marker. `displayText` must be the deterministic answer-completed form.
`relatedQuestionIds` must cite questions in this group. In `analysisZh`, identify
the main trunk first and then explain how clauses, non-finite phrases, or logical
relations attach. `underlineRanges` locates decisive structure in `displayText`:
Unicode code-point offsets, start inclusive/end exclusive, with the exact `quote`.
Do not trim or normalize before counting. Usually 1–3 short ranges suffice;
repeated phrases and overlaps are valid when explicitly located. The example
offsets only illustrate the encoding; calculate them for your actual text. Do
not also emit historical `underlineTexts`.

Add closed `teachingContent` (`schemaVersion: objective-teaching-content-v1`)
beside these fields. It declares `sourceTextId`, exact `sourceAssetVersion`,
`translation {textId,legacyField:"fullTranslationZh",paragraphs[]}` whose
paragraphs are exact code-point slices of that one translation value and link
existing source paragraph IDs, authoritative `completedSourceTexts[]`, and
`annotations[]`. Every question needs original-text `answer-evidence` and one
completed-text `answer-insertion` bound to its exact `blankId`; every selected
sentence needs `sentence-structure`. Range shape is
`{textId,paragraphId,start,end,quote}`. Repeated occurrences, many-to-many links,
and overlaps require explicit offsets; never first-match, trim, normalize,
mutate original blanks, or interpret hand-written `[36]` as annotation data.
An insertion range must locate that blank's actual replacement, not another
occurrence of the same answer. All text identities are distinct. Non-key difficult
sentences use empty `relatedQuestionIds` and sentence-structure `questionIds`.

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
  ]
}
```

`contextEvidence` must be one object, not an array. Its quote fields must use
exact passage text but must exclude the blank marker number itself, such as
`36`, `37`, `38`, `39`, or `40`.

## Facet Values

These three existing fields are also the complete small-question similarity
profile. Do not add a second `similarityProfile` object: matching uses the exact
per-question `blankId` together with `positionFacet`, `roleFacet`, and
`primaryMechanismFacet`. `topicClues` and the evidence fields explain the match
but do not replace those controlled facets.

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
- Copy it character for character. Do not change tense, person, number,
  inflection, spelling, punctuation, spacing, or capitalization to make the
  signal read more smoothly. For example, source `serves` cannot become
  `serve`, and source `make` cannot become `makes`.
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
    "relation": "空后具体说会 hurts，选项先用 uncomfortable 概括这种不适。"
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

## Final Literal-Substring Check

Before returning JSON, silently run this check on every
`mechanismSignals[]` item:

1. For `signalSide: "option"`, search `signalText` in the authoritative correct
   option text with a literal substring search.
2. For `context-before` or `context-after`, search `signalText` in the supplied
   passage or heading with a literal substring search.
3. If the literal search fails, do not repair the source or explain the
   intended word family. Replace `signalText` with a shorter character-for-
   character substring that actually exists on that side.
4. Repeat the same literal check for `contextEvidence.beforeQuote` and
   `contextEvidence.afterQuote` against the passage.

Meaning-equivalent, lemma-equivalent, differently inflected, or normalized text
still fails this check. Do not return until every literal search succeeds.

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
