# Facet Taxonomy Draft — I0-A Seven Choices

Cut: I0-A 七选五辅助检索 facet taxonomy
Last synced: 2026-05-25

Rules:

- One facet key per row.
- Parent keys appear before child keys.
- Keys are lowercase ASCII, dot-separated, and max four levels deep.
- Chinese appears only in `label_zh`.
- Later blank/question tagging should use the most specific applicable leaf
  keys; parent rollup comes from `parent_key`.

| facet_key | label_zh | label_en | parent_key |
| --- | --- | --- | --- |
| `seven-choices` | 七选五 | Seven Choices |  |
| `seven-choices.position` | 空位位置 | Blank Position | `seven-choices` |
| `seven-choices.position.paragraph-start` | 段首 | Paragraph Start | `seven-choices.position` |
| `seven-choices.position.paragraph-middle` | 段中 | Paragraph Middle | `seven-choices.position` |
| `seven-choices.position.paragraph-end` | 段尾 | Paragraph End | `seven-choices.position` |
| `seven-choices.role` | 句子功能 | Sentence Role | `seven-choices` |
| `seven-choices.role.topic` | 主旨句 | Topic Sentence | `seven-choices.role` |
| `seven-choices.role.summary` | 概括句 | Summary Sentence | `seven-choices.role` |
| `seven-choices.role.bridge` | 承启句 | Bridge Sentence | `seven-choices.role` |
| `seven-choices.role.cohesion` | 衔接句 | Cohesion Sentence | `seven-choices.role` |
| `seven-choices.cohesion` | 衔接机制 | Cohesion Mechanism | `seven-choices` |
| `seven-choices.cohesion.grammatical` | 语法衔接 | Grammatical Cohesion | `seven-choices.cohesion` |
| `seven-choices.cohesion.grammatical.referential-cohesion` | 指代衔接 | Referential Cohesion | `seven-choices.cohesion.grammatical` |
| `seven-choices.cohesion.grammatical.logical-connector` | 逻辑词衔接 | Logical Connector | `seven-choices.cohesion.grammatical` |
| `seven-choices.cohesion.lexical` | 词汇衔接 | Lexical Cohesion | `seven-choices.cohesion` |
| `seven-choices.cohesion.lexical.topic-field-alignment` | 话题场对应 | Topic Field Alignment | `seven-choices.cohesion.lexical` |
