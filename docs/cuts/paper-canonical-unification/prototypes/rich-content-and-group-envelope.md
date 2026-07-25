# Canonical Question Group envelope 与 rich content nodes

Status: accepted Wayfinder prototype answer
Scope: data-contract prototype only; no production schema, compiler, migration,
or renderer code
Question: every Canonical Question Group shares what, while family semantics
remain impossible to mix or duplicate?

## Decision

Select one closed, validated `CanonicalQuestionGroupArtifactV1` envelope:

```ts
type CanonicalQuestionGroupArtifactV1 = Readonly<{
  schemaVersion: 'canonical-question-group-v1'

  identity: Readonly<{
    paperId: string
    groupId: string
  }>

  contractRef: Readonly<{
    manifestId: string
    manifestVersion: number
    manifestDigest: Sha256
    familyContractId: string
    familyContractVersion: number
    familyContractDigest: Sha256
  }>

  // Array position is the one semantic order owner. Display question numbers
  // remain in the Canonical Paper Plan.
  questionRefs: readonly Readonly<{ questionId: string }>[]
  blankRefs: readonly Readonly<{ blankId: string }>[]

  content: RichContentDocumentV1
  media: readonly SourceLinkedMediaV1[]
  variant: CanonicalQuestionGroupVariantV1

  sourceMap: CanonicalGroupSourceMapV1
  sourceFingerprint: Sha256
  semanticDigest: Sha256
}>
```

The common envelope owns only the facts every family needs to participate in
the same compiler, Plan binding, validation, digest, and projection protocol:
stable identity; exact authority closure; ordered Question and Blank
identities; paper-semantic content; source-linked media; provenance; and
fingerprints.

The discriminated `variant` remains the sole owner of family cardinality,
Question and Blank bodies and coupling, answer shape, choice ownership,
family-specific material roles, and Writing Task semantics. The later family
tickets define those exact variant bodies; this ticket deliberately does not
pre-empt them.

There is no common `title`, instruction, score, question number, answer region,
layout mode, or Analysis field. Standard headings, instructions, scores,
numbers, and answer regions already belong to the Profile and Plan. Renderer
presentation and teacher supplements do not become Question Group semantics.

## Common identity, references, and order

- `paperId + groupId` is the artifact identity. A group cannot silently move
  between papers while retaining the same artifact identity.
- `contractRef` closes both the root manifest and exact family contract by
  id, version, and digest. No Group means “latest family rules”.
- `questionRefs` and `blankRefs` are ordered arrays of stable ids. Their array
  positions are the only intra-group semantic order. A second `order` or
  source question number is forbidden.
- The variant must define every referenced Question and Blank exactly once and
  may define no unreferenced member. Whether a Blank is one-to-one with a
  Question, whether a writing group has zero Questions, and other cardinality
  rules are family-contract facts, not common-envelope guesses.
- Human-facing question numbers and group order are Plan projections. A
  renderer may never write display numbering back into these references.

This keeps the common Interface small while making the validator and projector
deep: callers do not learn family-specific source dialects, placeholder
markers, option fallbacks, or numbering rules.

## Minimal rich-content model

```ts
type RichContentDocumentV1 = Readonly<{
  blocks: readonly RichBlockV1[]
}>

type RichBlockV1 =
  | Readonly<{
      kind: 'paragraph'
      nodeId: string
      inlines: readonly RichInlineV1[]
    }>
  | Readonly<{
      kind: 'table'
      nodeId: string
      columnCount: number
      rows: readonly Readonly<{
        rowId: string
        cells: readonly RichTableCellV1[]
      }>[]
    }>
  | Readonly<{
      kind: 'figure'
      nodeId: string
      mediaId: string
      caption: readonly RichInlineV1[]
    }>

type RichInlineV1 =
  | Readonly<{
      kind: 'text'
      nodeId: string
      text: string
    }>
  | Readonly<{
      kind: 'blank_ref'
      nodeId: string
      blankId: string
    }>

type RichTableCellV1 = Readonly<{
  cellId: string
  columnStart: number
  columnSpan: number
  rowSpan: number
  role: 'header' | 'data'
  inlines: readonly RichInlineV1[]
}>

type SourceLinkedMediaV1 = Readonly<{
  mediaId: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/svg+xml'
  sha256: Sha256
  pixelWidth: number
  pixelHeight: number
  sourceArtifactRef: Readonly<{
    captureId: string
    artifactId: string
  }>
}>
```

This is intentionally not a universal document AST:

- only paragraph, table, and figure blocks exist;
- inline flow contains literal text and semantic Blank references only;
- tables are a rectangular semantic grid with explicit spans; cell content is
  one inline flow, so nested tables and arbitrary block nesting are invalid;
- a flattened text string or screenshot is not accepted as a semantic table.
  If the grid cannot be established exactly from evidence or an authorized
  assertion, compilation fails closed instead of inventing rows or columns;
- a Figure is an ordered block referencing immutable captured media bytes.
  Block order records “between these semantic blocks”; x/y coordinates,
  float, alignment, width, and page placement remain renderer facts;
- a figure path, URL, marker string, or renderer placeholder is not canonical
  media identity. Renderers resolve bytes through `sourceArtifactRef` and
  verify `sha256`;
- v1 does not encode an inline Figure. Evidence that truly requires one is
  `unsupported`, not a reason to smuggle presentation coordinates into the
  model.

The current `paper-2026-i` table bridge therefore cannot be migrated merely by
promoting its `[表: …]` marker, flattened paragraph text, or PNG. The compiler
must establish the semantic grid and separately retain the captured PNG as
source-linked media when the figure facsimile is still required.

## Punctuation and semantic blanks

A `blank_ref` contains only `nodeId` and `blankId`. It does not contain source
marker text, underscores, visible width, numbering, parentheses, hint text, or
punctuation.

Literal paper punctuation belongs to adjacent `text` nodes and participates in
the semantic digest. Family-specific givens, such as an exact grammar-fill
lexeme, belong to that Blank's family-variant definition. The source marker
bytes remain addressed by the source map. Each renderer derives the visible
blank token from the family contract, Plan numbering, and typography rules;
no placeholder string is persisted and later parsed back.

Teacher annotations, evidence highlights, translations, and Analysis are not
paper semantics. They remain supplements anchored to stable content,
Question, or Blank identity and ranges. An `annotation` rich-content node is
invalid.

## Option ownership is structurally exclusive

Questions do not carry an optional `options` fallback in the common envelope.
Each family variant selects exactly one closed choice-owner shape:

```ts
type ChoiceOwnershipV1 =
  | Readonly<{
      ownership: 'none'
    }>
  | Readonly<{
      ownership: 'per_question'
      sets: readonly Readonly<{
        questionId: string
        options: readonly CanonicalOptionV1[]
      }>[]
    }>
  | Readonly<{
      ownership: 'shared_bank'
      bankId: string
      options: readonly CanonicalOptionV1[]
    }>

type CanonicalOptionV1 = Readonly<{
  optionId: string
  label: string
  content: readonly RichInlineV1[]
}>
```

The family contract fixes the allowed discriminant: reading and cloze use
`per_question`; Seven Choices uses one `shared_bank`; grammar fill uses
`none`. Later writing tickets decide their non-choice answer shape without
weakening this union.

A shared-bank variant has no per-question option field at all, and a
per-question variant has no group bank field. Closed schemas with
`additionalProperties: false` make “one A–G bank plus copied A–G under every
blank” unrepresentable rather than merely discouraged. Equal option text in
two legitimate per-question sets is not treated as duplicate ownership;
ownership follows ids and the discriminant, not string similarity.

## Source map and digests

```ts
type CanonicalGroupSourceMapV1 = Readonly<{
  captureId: string
  entries: readonly Readonly<{
    target:
      | { kind: 'group'; id: string }
      | { kind: 'content_node'; id: string }
      | { kind: 'question'; id: string }
      | { kind: 'blank'; id: string }
      | { kind: 'option'; id: string }
      | { kind: 'media'; id: string }
    sourceSpanRefs: readonly string[]
    transformationRecordIds: readonly string[]
  }>[]
}>
```

Each persisted semantic target has exactly one source-map entry with at least
one pre-normalization Source Span reference. One entry may have several spans,
and one span may support several targets, but a target cannot have competing
entries. Accepted changed values cite their ordered Transformation Records.
Detailed rules, before/after values, and exactness proof remain in the
Normalization Report rather than being copied here.

`sourceFingerprint` hashes the exact ordered evidence slice closure: capture
and source-document digests, Source Span references, referenced media bytes,
and accepted Transformation Record ids. It answers whether the source evidence
changed.

`semanticDigest` hashes a stable serialization of identity, exact contract
refs, ordered Question/Blank refs, rich content, media semantic bytes and
dimensions, and the family variant. It excludes itself, Source Span
coordinates, capture/artifact locator ids, source fingerprint, diagnostics,
Analysis, and renderer projection. Moving an equivalent source span does not
change semantics; changing literal punctuation, media bytes, choice ownership,
or content order does.

## Validation and one projection seam

Candidates are compiler-internal and never persisted. One validation Module
owns schema closure, id/reference coverage, source-map coverage, table-grid
conformance, family cardinality, option ownership, digest calculation, and
contract compatibility:

```ts
declare function validateCanonicalQuestionGroup(
  candidate: unknown,
  authorityClosure: ExactCanonicalAuthorityClosure,
):
  | Readonly<{
      status: 'valid'
      artifact: CanonicalQuestionGroupArtifactV1
    }>
  | Readonly<{
      status: 'invalid'
      diagnostics: readonly StructuredDiagnostic[]
    }>
```

An invalid candidate never becomes a partial canonical artifact. The whole
paper compiler converts its diagnostics to the already-selected
`needs_review`, `unsupported`, `incomplete_source`, or `answer_conflict`
outcome and exposes no Plan or Groups.

All Screen, Print/PDF, and DOCX paths receive Groups only through the shared
`projectCanonicalPaper(...)` Module selected by the Profile/Plan ticket. Its
group projection preserves the ownership discriminant:

```ts
type ProjectedChoicesV1 =
  | {
      ownership: 'none'
    }
  | {
      ownership: 'per_question'
      sets: readonly {
        questionId: string
        options: readonly CanonicalOptionV1[]
      }[]
    }
  | {
      ownership: 'shared_bank'
      bankId: string
      options: readonly CanonicalOptionV1[]
    }
```

Renderer Adapters must accept this union directly. A projection conformance
check rejects a shared bank copied into any Question, repeated as several
group banks, or combined with per-question sets. There is no fallback such as
`question.options || group.optionBank`; a consumer unable to render the
discriminant fails instead of reshaping it.

## A–D layout boundary

The four-column / two-by-two / one-column choice for per-question A–D sets is
derived downstream from projected option content plus the exact renderer
typography and available measure. It is never captured as source evidence,
stored in a family variant, written into a Canonical Question Group, included
in `semanticDigest`, or persisted in a renderer-neutral projection.

The next dedicated selector ticket owns measurement, safety margin, and the
ephemeral renderer layout plan. Its decision cannot change option identity or
ownership.

## Logic prototype results

The throwaway command
`node .scratch/wayfinder-07-rich-content-prototype.mjs` exercised closed-shape
validation and renderer projection. It finished `PASS 15 / FAIL 0`:

| Scenario | Result |
| --- | --- |
| one Seven Choices A–G bank | projected once at group level |
| one cloze A–D set per Question | preserved per Question |
| shared bank plus per-question sets | rejected |
| shared bank used by cloze | rejected by family contract |
| renderer copies a shared bank into a Question | rejected as duplicated projection |
| flattened table string | rejected |
| nested table | rejected |
| ordered Figure with captured media | accepted |
| Figure with unresolved media | rejected |
| placeholder/punctuation field on Blank node | rejected |
| teacher annotation node | rejected |
| persisted A–D layout field | rejected |
| duplicate Question/Blank identity | rejected |
| source-coordinate-only change | semantic digest stable |
| literal punctuation change | semantic digest changes |

Only this contract answer is retained; the runnable prototype is deleted after
capture.

## Rejected alternatives and follow-through

1. **Optional `question.options` plus optional `group.optionBank`** — rejected
   because it makes duplicate ownership representable and recreates the
   current Seven Choices consumer failure.
2. **One universal recursive document AST** — rejected because lists, styles,
   arbitrary nesting, layout boxes, and annotation nodes would enlarge every
   family and renderer Interface without current evidence.
3. **Flat text plus marker placeholders** — rejected because renderers must
   parse semantics and can hide flattened table content.
4. **Image-only table** — rejected because it loses row/column semantics;
   source-linked media may supplement but not replace a semantic table.
5. **Inline Source Spans on every node** — rejected in favor of one typed
   source map so provenance and semantic digest have separate owners.
6. **Persisted validation status or partial Group** — rejected. Only a valid
   artifact exists; failures remain compiler/report outcomes.

No `CONTEXT.md` change is required. `Canonical Question Group`, Question,
Blank, Option, Analysis, Source Capture, Source Span, and Transformation Record
already carry the domain meanings; rich-content node kinds and projection
shapes are data-contract Interface details rather than new business entities.

No Fog graduates and no new ticket is required. Exact Seven Choices, reading,
application-writing, continuation-writing, rollout, and migration contracts
remain with their existing tickets.
