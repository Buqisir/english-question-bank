# Decisions — I0-A Facet Taxonomy Foundation

Cut: I0-A 七选五辅助检索 facet taxonomy
Status: accepted for docs-only implementation
Last synced: 2026-05-25
Open items from external review: none

## Locked Decisions

### Scope

- I0-A is a docs-only planning cut for the 七选五 facet taxonomy.
- I0-A does not create database tables, schema migrations, runtime validators,
  app UI, server routes, PaperSurface entry points, or analysis JSON schemas.
- I0-A records the taxonomy that later 七选五 reviewed-analysis and similarity
  search cuts will consume.

### Teaching Tree

The accepted PO teaching tree is:

```text
七选五空位
├── 段首
│   ├── 主旨句（统领下文）
│   └── 承启句（承上启下）
│
├── 段中
│   └── 衔接句
│       ├── 语法衔接（指代衔接 / 逻辑词衔接）
│       └── 词汇衔接（话题场对应）
│
└── 段尾
    ├── 概括句（归纳收束）
    ├── 承启句（承上启下）
    └── 衔接句
        ├── 语法衔接（指代衔接 / 逻辑词衔接）
        └── 词汇衔接（话题场对应）
```

Teaching basis:

- PO's `七选五做题技巧_术语修订版.docx`.
- Halliday-style grammatical / lexical cohesion.
- Gaokao 七选五 teaching practice: judge position first, sentence role second,
  and cohesion mechanism as the evidence dimension.

### Facet Dimensions

The taxonomy has three independent dimensions.

1. Position: where the blank sits in the discourse unit.
2. Sentence role: what the inserted sentence does.
3. Cohesion mechanism: how the sentence connects to context.

Position constrains likely roles, but position is not encoded as the parent of
role. A blank receives one position facet and one role facet independently.

`paragraph` in facet keys means a semantic paragraph or content unit, not only
visual line breaks. A content unit under a heading can still have
`paragraph-start`, `paragraph-middle`, and `paragraph-end`.

### Sentence Role Boundaries

- `topic`: 主旨句. It states the paragraph / content unit's main point and
  works like the doorplate of the unit.
- `summary`: 概括句. It wraps up the current paragraph / content unit and looks
  backward.
- `bridge`: 承启句. It is a cross-level transition that connects the previous
  paragraph, section, or argument layer to the next one.
- `cohesion`: 衔接句. It handles local sentence-to-sentence continuity.

Bridge is intentionally narrow: only cross-level transition gets `bridge`.
If a sentence only makes adjacent sentences read smoothly, use `cohesion`.

### Cohesion Mechanism Rules

`seven-choices.cohesion.*` names cohesion mechanism, not a subtype of
`seven-choices.role.cohesion`.

- `role=cohesion`: one primary mechanism is required.
- `role=bridge`: mechanisms are optional; if recorded, they are drawn from
  reference, logic, or topic-field alignment.
- `role=topic` and `role=summary`: mechanisms are not attached in v1.

A blank can have one primary mechanism and up to two supporting mechanisms in a
future analysis contract. In the taxonomy file, only the reusable facet keys are
defined.

Lexical cohesion is intentionally generalized as topic-field alignment. It
covers exact word recurrence, synonym / near-synonym, antonym, hypernym /
hyponym, same-scene vocabulary, and related chunks. Do not split these into
separate blank-level facet keys in v1.

### Facet Attachment

Seven-choices facets attach to the blank / question, not to the option.

The option does not have a stable role outside the blank where it is inserted.
The blank is the training and retrieval unit:

```text
第 36 空:
- position
- role
- primary/supporting cohesion mechanism
- correct option label
```

### Topic Clues Are Analysis Fields, Not Facets

Future 七选五 analysis should record `topicClues`, but `topicClues` are not
facet keys.

`topicClues` means: context-side word chunks in the blank's semantic paragraph
or content unit that belong to the same topic field and help solve the blank.

Rules for future analysis:

- `topicClues` are required for every blank.
- `topicClues` only include nearby context / heading clues, not words from the
  correct option.
- Correct-option words should be explained through `optionFit`, not mixed into
  `topicClues`.

### Parent And Leaf Keys

The taxonomy document keeps the full parent chain. Later question tagging should
attach only the most specific leaf keys.

Example:

```text
taxonomy contains:
seven-choices.cohesion
seven-choices.cohesion.lexical
seven-choices.cohesion.lexical.topic-field-alignment

blank tag uses:
seven-choices.cohesion.lexical.topic-field-alignment
```

The system can roll up to parent keys through `parent_key`.

### Namespace

Facet keys use the `seven-choices` namespace.

This intentionally differs from existing runtime names:

- DB group type: `seven_choices`
- paper-asset group type: `sevenChoices`
- facet namespace: `seven-choices`

Facet keys are lowercase ASCII, dot-separated, and max four levels deep.
Chinese labels live in `label_zh`, never in the key.

## Future Analysis Contract Notes

These are not part of I0-A runtime or schema work. They are recorded so the next
七选五 cuts do not lose the PO decisions.

Future `seven-choices-analysis-v1` will likely include:

- `positionFacet`
- `roleFacet`
- `primaryMechanismFacet`
- `supportingMechanismFacets`
- `topicClues`
- `optionFit`
- context quotes for the blank
- 1-2 key distractor reasons, without distractor facet keys

## Open Decisions

- None.

## Moved / Cut

- Reading comprehension facet taxonomy is deferred until after the 七选五 closed
  loop.
- 七选五 reviewed-analysis schema, prompt, sample JSON, verify, entry, and UI are
  deferred to later I0 cuts.
- Database facet tables and runtime similarity-search integration are deferred
  to a later large cut.
