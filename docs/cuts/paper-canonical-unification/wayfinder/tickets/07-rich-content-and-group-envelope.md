# 定义题组通用 envelope 与 rich content nodes

Status: closed
Type: prototype
Claim: claimed
Blocked by: 设计 canonical compilation 深模块接口; 定义卷型模板与整卷装配单合同
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/07a-abcd-option-layout-selector.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

What must every Canonical Question Group share, and which facts must remain inside discriminated family variants? Design the common identity, source-map, digest, ordering, question/blank references, option-bank ownership, and validation envelope together with a minimal rich-content node model for text, semantic blanks, tables, figures, and source-linked media. Stress-test shared versus per-question option banks, nested or flattened tables, figure placement, punctuation ownership, inline annotations that are not paper semantics, and renderer projections so the canonical model cannot encode duplicated option ownership and renderer contracts can reject duplicated projection, without fossilizing placeholder strings or becoming a universal document AST. Confirm explicitly that A–D layout mode is derived downstream and is never persisted as source or canonical semantics.

## Resolution

[Prototype asset: Canonical Question Group envelope 与 rich content nodes](../../prototypes/rich-content-and-group-envelope.md)

Select one closed, validated `CanonicalQuestionGroupArtifactV1` envelope. It
shares stable paper/group identity, exact manifest and family-contract refs,
ordered Question/Blank refs, minimal paper-semantic content, source-linked
media, a typed Source Map, source fingerprint, and semantic digest. Array
position is the sole intra-group semantic order; display numbering and group
order stay in the Plan.

The discriminated family variant exclusively owns member bodies and coupling,
cardinality, answer shape, material roles, Writing Task facts, and one closed
choice-owner union: `none`, `per_question`, or `shared_bank`. Common Questions
have no optional option fallback. Seven Choices can therefore contain one
group-owned A–G bank but cannot also encode copied per-question options;
reading/cloze per-question sets cannot also encode a group bank. The shared
projector preserves that discriminant, and renderer conformance rejects any
projection that repeats or nests a shared bank.

Rich content remains deliberately smaller than a document AST: ordered
paragraph, rectangular semantic table, and source-linked Figure blocks, with
only literal text and semantic Blank refs inline. Nested/flattened tables,
unresolved media, placeholder strings, annotation nodes, inline Figure layout,
and renderer geometry fail closed. Literal punctuation stays in text nodes;
Blank nodes own no punctuation, underscores, number, hint rendering, or
visible width. Tables whose grid cannot be established exactly are
`needs_review` or `unsupported`, not silently promoted from marker text or a
screenshot.

The Source Map points typed semantic identities to pre-normalization Source
Spans and accepted Transformation Records. `sourceFingerprint` changes with
the evidence closure; `semanticDigest` excludes source coordinates and
renderer/Analysis state but includes identity, authority refs, semantic order,
content, media bytes, and the family variant. The throwaway logic prototype
passed 15/15 cases covering option ownership and duplicated projection,
table/figure boundaries, punctuation, annotations, identity coverage, and
digest separation; only the linked answer is retained.

A–D `four_columns` / `two_by_two` / `one_column` selection is explicitly
downstream renderer presentation derived from projected option content,
typography, and available measure. It is never source evidence, canonical
semantics, semantic-digest input, or a persisted renderer-neutral projection.

No `CONTEXT.md` update, Fog graduation, or new ticket is required. Existing
family and renderer-selector tickets retain their exact field and algorithm
decisions.
