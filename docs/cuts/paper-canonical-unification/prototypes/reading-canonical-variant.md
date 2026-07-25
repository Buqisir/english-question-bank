# Reading canonical variant 与图表 proof 合同

Status: accepted Wayfinder prototype answer
Scope: data-contract and conformance prototype only; no production schema,
compiler, migration, renderer, paper asset, or Analysis changes

## Question answered

Can one closed Reading family variant preserve source-backed passage order,
passage titles/subtitles, Questions, question-owned A-D Options, answers,
semantic tables, source figures, and stable anchors while every renderer
consumes the same projection and Analysis remains strictly supplemental?

**Verdict: yes.** Keep one ordered rich-content document in the shared
Canonical Question Group envelope, add only Reading-specific semantic roles
and Question/answer coupling in the family variant, and make the existing
`projectCanonicalPaper(...)` Module the only semantic projection seam.
Renderer Adapters receive typed blocks plus the accepted ephemeral A-D
placement plan. They never parse flattened passage text, marker strings,
manifest paths, or Analysis to reconstruct paper structure.

The current flattened-table plus placeholder bridge is not a compatibility
shape inside canonical Reading. A source table becomes one native semantic
`table` block. A real source figure becomes one `figure` block backed by
closed immutable media. A screenshot or crop used to prove a table remains
Source Capture / Normalization Report evidence and is not rendered as a
second copy of the table.

## Selected Reading family variant

The shared envelope remains `CanonicalQuestionGroupArtifactV1`. Reading
selects the already-accepted `per_question` choice owner and supplies this
closed variant:

```ts
type CanonicalReadingVariantV1 = Readonly<{
  family: 'reading'

  // Membership only, never a second order owner. Entries are canonically
  // serialized by nodeId; display/source order always comes from
  // artifact.content.blocks.
  passageBlockRoles: readonly Readonly<{
    nodeId: string
    role: 'title' | 'subtitle'
  }>[]

  // Exact order must equal envelope.questionRefs.
  questions: readonly CanonicalReadingQuestionV1[]

  choices: Readonly<{
    ownership: 'per_question'
    // Exact order and coverage must equal questions.
    sets: readonly Readonly<{
      questionId: string
      options: readonly [
        CanonicalOptionV1 & { label: 'A' },
        CanonicalOptionV1 & { label: 'B' },
        CanonicalOptionV1 & { label: 'C' },
        CanonicalOptionV1 & { label: 'D' },
      ]
    }>[]
  }>
}>

type CanonicalReadingQuestionV1 = Readonly<{
  questionId: string
  stem: readonly RichInlineV1[]
  correctOptionId: string
}>
```

Invariants:

- `content.blocks` is the only passage-order owner. Every unmarked block has
  the implicit Reading role `body`.
- A role entry may reference only a `paragraph` block. There is at most one
  `title`; there may be zero or more `subtitle` blocks anywhere in passage
  order.
- Source paper slot labels such as `A`, `B`, `C`, or `D`, section headings,
  standard instructions, display question numbers, scoring, and answer
  regions remain Profile/Plan facts. They are not passage titles.
- A source-backed passage title or subtitle is literal paper content. It is a
  paragraph block plus a Reading role, has its own `content_node` source-map
  entry, and participates in the semantic digest.
- Question order appears once in `questionRefs`; the Reading `questions` and
  `choices.sets` arrays must match it exactly. Display numbers stay in the
  Canonical Paper Plan.
- Every Question has exactly one A-D set owned by that Question and exactly
  one `correctOptionId` that joins an Option in that set. The official-answer
  source assertion is included in that Question's source-map closure and the
  exact join is ledgered when it is not a direct source relation.
- Question stems and Option content use the existing literal inline nodes.
  Layout mode, measured width, line breaks chosen by a renderer, question
  number, answer label display, and Analysis are forbidden fields.
- `additionalProperties: false` applies at every closed object. A group bank,
  marker fallback, `materialText`, `flattenedText`, placeholder, source file
  path, or renderer hint cannot coexist with this variant.

`correctOptionId` is answer authority. Analysis may explain that answer only
after joining by stable `questionId`; it cannot create or change the answer.

## Passage, table, figure, and source-position semantics

Reading uses the accepted minimal rich-content nodes without adding a document
AST:

- `paragraph` is literal passage flow. Its optional Reading role is resolved
  by `passageBlockRoles`.
- `table` is a rectangular semantic grid with stable block, row, cell, and
  inline identities; explicit column count, row/column spans, and
  `header | data` cell roles; and exact source-map coverage.
- `figure` is one ordered passage block referencing one immutable media entry
  with MIME type, sha256, pixel dimensions, and Source Capture artifact
  identity. Its caption is literal inline content.

Block order expresses all title/body/subtitle/table/figure placement. No
second `paragraphOrder`, `tablePosition`, or x/y coordinate is allowed.

Every group, content block, table row/cell/inline, Question, stem inline,
Option, Option inline, and canonical media entry has one stable semantic
identity. The shared Source Map maps those targets to pre-normalization Source
Spans and accepted Transformation Records. A legacy `sourcePosition`,
normalized-text offset, paragraph index, PDF-render pixel coordinate, file
path, or marker string is not a Source Span.

For a source table represented visually in a PDF:

1. Source Capture retains the source PDF bytes/digest and the exact page/region.
2. It records typed row/cell observations or an explicitly reviewed manual
   transcription with page/region spans.
3. The compiler emits one semantic `table` block only after the rectangular
   grid, cell order, spans, roles, and text are exact.
4. A crop used for visual proof remains capture/report evidence. It is not a
   `figure` block and is never rendered beside the native table.

For a true source photograph, diagram, chart, or other non-table image, the
compiler emits one `figure` block. A missing file, digest, dimensions, source
artifact, or resolvable placement blocks canonical output; a renderer never
substitutes `〔表格：见原卷〕` for a `ready` canonical group.

## Fail-closed source and rich-content outcomes

| Evidence state | Disposition | Reading rule |
| --- | --- | --- |
| complete source admits multiple passage/group boundaries, or a short line can plausibly be title/subtitle/body | `needs_review` | retain candidates and spans; do not infer from length, typography alone, `group.title`, or the next passage's letter |
| complete source admits multiple table grids/spans/cell orders, or multiple figure/caption/order relationships | `needs_review` | no flattened or image-only canonical substitute |
| meaning and structure are clear, but the accepted model cannot represent a nested table, block content inside a cell, inline/floating figure, or another unregistered feature | `unsupported` | extend the executable standard before compiling |
| source page/region, structured table observation, media bytes/digest/dimensions, passage slice, or official-answer evidence is absent, corrupt, or hash-mismatched | `incomplete_source` | recapture or complete the evidence; do not generate missing content |
| two provenance-bearing official answers cannot exact-normalize and join to one Option | `answer_conflict` | Analysis, corpus majority, and renderer state have no authority |
| exact registered adapter yields one boundary, role map, grid/media closure, A-D ownership, and answer join | `ready` | produce the atomic Group only after whole-paper validation |

The current `paper-asset-v1` table bridge by itself is
`incomplete_source`: marker + undelimited flattened text + PNG manifest entry
does not establish source-linked cells. For the selected proof, the original
question PDF still exists and can be recaptured; therefore this verdict does
not say the real source is irrecoverable.

The known 49 Reading stems that end in a next-passage letter are
`needs_review` until their source boundary is proven. The compiler may not
strip the suffix or promote it to an answer by regex.

## One semantic projection seam

`projectCanonicalPaper(...)` remains the sole external semantic projection
Module. Its Reading branch returns one exhaustive block stream plus ordered
Questions:

```ts
type ProjectedReadingGroupV1 = Readonly<{
  groupId: string
  blocks: readonly (
    | ProjectedParagraph
    | ProjectedSemanticTable
    | ProjectedSourceFigure
  )[]
  questions: readonly Readonly<{
    questionId: string
    stem: readonly RichInlineV1[]
    options: readonly [
      CanonicalOptionV1 & { label: 'A' },
      CanonicalOptionV1 & { label: 'B' },
      CanonicalOptionV1 & { label: 'C' },
      CanonicalOptionV1 & { label: 'D' },
    ]
    correctOptionId: string
  }>[]
}>
```

The Module hides Profile/Plan joins, Reading validation, source dialects,
source maps, answer joins, digest checks, block roles, and legacy migration.
Detail, PaperSurface, Print/PDF, and DOCX are Adapters at one real seam. Their
Interface contains only the typed semantic stream, version visibility
(`student | teacher`), and renderer presentation dependencies.

Each question-owned A-D set is passed unchanged to the already-selected
renderer-typography Interface `layoutAbcdOptionSet(optionSet)`. The returned
ephemeral `SelectedLayoutPlan` is consumed by every renderer. A renderer may
not measure, select, auto-flow, wrap one dense option independently, or create
a hybrid extra row.

Canonical Reading consumers are therefore forbidden to:

- split `materialText` or paragraph strings to find structure;
- interpret `group.title` as the passage title;
- parse `[表: ...]` / `[图: ...]` markers or scan a figures directory;
- preserve flattened text on one surface while hiding it on others;
- infer table rows/cells from whitespace;
- choose A-D layout from character count, CSS flex/grid auto-placement, or
  DOCX-specific heuristics;
- use Analysis, a DB detail fallback, or renderer output to fill semantics.

## Semantic and anchor parity

For a fixed Plan binding and version type, the projector emits one ordered
semantic event stream. Every event carries its stable canonical identity:

- Group;
- paragraph/table/figure block;
- table row and cell;
- Question;
- Option;
- teacher-version answer occurrence derived from the Question/Option join.

`semanticSignature` covers ordered kinds, identities, roles, literal semantic
content/digests, table geometry, media identity, Question/Option order, and
answer joins. `anchorSignature` covers the ordered stable identities and
occurrence counts. It excludes Source Span coordinates, renderer geometry,
Analysis, and A-D mode.

Each Adapter exposes a conformance trace at its public seam so verification can
compare the actual detail DOM, PaperSurface DOM, Print/PDF result, and DOCX
result against the same signatures. The concrete artifact may encode anchors
differently, but the Adapter cannot manufacture or drop identities. A
student-version comparison excludes answer occurrences on every surface; a
teacher-version comparison includes exactly one answer occurrence per
Question on every surface.

Analysis is attached later as `ReadingAnalysisSupplementV1` keyed only by
stable Question/content anchors. Absent, complete, incomplete, or rejected
Analysis must leave canonical semantic digest, block order, Question/Option
order, answers, A-D plans, and canonical anchor signature unchanged.
Incomplete group Analysis is omitted as a whole under the existing product
rule; it never causes a paper-semantic fallback.

## Real proof groups

Both proofs are bound to the same current real source closure without copying
passage or option text into this artifact:

- question PDF:
  `sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f`,
  11 A4 pages;
- current `paper-asset-v1`:
  `sha256:fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf`;
- table proof crop:
  `sha256:bd12fcedbb71fb608210ffeaf84864c8aa3d9096a71d955cfd1e5db2aec53b35`,
  1780×348 pixels.

### Prose-only proof

`paper-2026-i / group-2026-i-reading-c`, source PDF physical page 6:

- source slot label `C` is Plan presentation, not a passage title;
- six ordered prose paragraphs;
- Questions `q-2026-i-028` through `q-2026-i-031`;
- four exact question-owned A-D sets and four official-answer joins;
- no title, subtitle, table, or figure block.

Using the accepted 10.5pt Times New Roman shaping seed, integer-twip rules,
fixed tabs, gutter, and safety margin:

| Question | A/B/C/D measured advance (twip) | Selected whole-set mode |
| --- | --- | --- |
| `q-2026-i-028` | 3384 / 3546 / 3375 / 3614 | `two_by_two` |
| `q-2026-i-029` | 3902 / 3931 / 4200 / 4118 | `one_column` |
| `q-2026-i-030` | 1371 / 1231 / 1103 / 1663 | `four_columns` |
| `q-2026-i-031` | 2776 / 3366 / 2865 / 3394 | `two_by_two` |

This one real group exercises all three accepted Reading A-D layouts. The
four-surface logical signatures were identical for every set. A mutated
placement that moved only D to a late third row was rejected as
`hybrid_option_layout`.

### Table-bearing proof

`paper-2026-i / group-2026-i-reading-a`, source PDF physical page 4:

- source slot label `A` remains Plan presentation;
- one source passage title;
- three source passage subtitles;
- three body paragraphs;
- one 4-row × 3-column table, twelve data cells, no header row and no spans;
- Questions `q-2026-i-021` through `q-2026-i-023`, each with one A-D set.

The canonical passage is eight ordered blocks:

```text
title -> body -> subtitle -> table -> subtitle -> body -> subtitle -> body
```

The current asset instead has seven flattened paragraph records: it omits the
source passage title as a semantic role and stores the table marker plus all
cell text in one undelimited string. The current manifest also leaves
`pixelWidth`, `pixelHeight`, and `sha256` null even though the PNG exists.
Those facts make the current bridge a negative proof; they are not promoted
as canonical semantics.

The prototype's redacted 4×3 contract witness produced one table occurrence,
four row anchors, twelve cell anchors, three Questions, and twelve Options.
It never rendered the proof crop as a second figure.

## Prototype result

The throwaway command:

```bash
node .scratch/wayfinder-09-reading-canonical-variant/tui.mjs --all
```

completed with:

- prose contract: `ready`, 27 semantic/anchor occurrences, four-surface
  projection parity `true`;
- table contract witness: `ready`, 40 semantic/anchor occurrences,
  four-surface projection parity `true`;
- real q28-q31 selector decisions:
  `two_by_two / one_column / four_columns / two_by_two`;
- flattened-table marker bridge: rejected;
- Analysis inside the canonical candidate: rejected;
- hybrid late-row A-D placement: rejected;
- fail-closed matrix:
  `needs_review / unsupported / incomplete_source / answer_conflict` as
  specified above.

The table witness validates the contract shape only. It is not a migrated
canonical artifact and does not replace the required real Source Capture,
typed cell observations, exact Source Spans, and Transformation Records.

## Evidence required before Reading consumers stop rebuilding structure

### New-import gate

1. A real Source Capture closes question source, official-answer source, all
   Reading page/region spans, and every referenced media artifact.
2. `compileCanonicalPaper(...)` returns whole-paper `ready`; a blocked Reading
   group exposes no partial canonical paper and causes zero publication
   writes.
3. Closed schema and semantic conformance prove exact block/role order,
   Question/A-D/answer joins, source-map coverage, digests, table geometry,
   and media closure.
4. A canonical-only fixture deliberately omits `materialText`, legacy
   `group.title`, marker strings, flattened table text, figure paths, and
   renderer hints. All consumers must still render it through the public
   projection seam.

### Real renderer proof

For both selected proof groups, verify actual detail, PaperSurface,
Print/PDF, and DOCX outputs rather than only projector JSON:

1. Semantic and version-specific anchor signatures equal the canonical
   projection on every surface; every anchor occurs exactly once unless the
   Plan legitimately repeats the whole Group.
2. Passage block order, title/subtitle roles, Question order, Option labels,
   answer visibility, and student/teacher boundaries match.
3. The table proof renders one native 4×3 table with twelve cells on every
   surface; source page visual comparison confirms order and spans; no raw
   marker, placeholder, flattened duplicate, hidden cell text, or duplicate
   proof image appears.
4. Any true figure proof renders one hash-verified media occurrence at its
   canonical block position and retains its caption; a missing or mismatched
   file blocks instead of showing a placeholder.
5. The prose proof exercises real q28-q31 through the shared selector:
   `2×2 / 1-column / 4-column / 2×2`. All four surfaces share mode, row/order,
   and start-twip signatures; dense modes have zero wrapping and no hybrid
   row. Actual PDF and rendered DOCX geometry is inspected, not only
   HTML/OOXML source.
6. Absent, complete, and invalid/incomplete Analysis runs leave the canonical
   signatures and paper output semantics unchanged; only the permitted
   teacher supplement changes.
7. Real-click browser QA covers detail and PaperSurface. Owner acceptance
   remains required for the user-visible migration ticket, not this contract
   prototype.

### Historical compatibility and retirement gate

Before removing the legacy Reading interpretation:

1. Compile all 126 current Reading groups / 465 Reading Questions from the 33
   `latest` papers against their exact source closures.
2. Resolve or block every source-boundary diagnostic, including the known 49
   heading-suffix cases; no group silently falls back to legacy semantics.
3. Prove exact Question/A-D/answer coverage, block/source-map closure, semantic
   digest stability, and cross-renderer semantic/anchor parity for every
   compiled group.
4. Run the real proof outputs above plus corpus structural conformance. A
   green legacy asset schema gate is not sufficient.
5. Inventory every Reading consumer and prove it accepts only the shared
   projection. The current marker/flattened-text, char-count layout,
   figures-directory scan, and detail/DB reconstruction paths may remain
   reachable only for not-yet-migrated legacy assets during rollout.
6. Retire those paths only after all 33 `latest` assets select canonical
   Reading and the migration/release/owner-QA gates pass.

## Rejected alternatives

1. **Persist passage order again inside the Reading variant** — rejected;
   `content.blocks` already owns order.
2. **Treat `Reading A/C` as passage title** — rejected; it is Plan slot
   presentation. Source-backed titles/subtitles require their own content
   nodes and spans.
3. **Flat passage text plus marker replacement** — rejected; it loses title,
   table, cell, and figure identity and makes each renderer a parser.
4. **Render semantic table plus source crop** — rejected; it duplicates one
   source fact. The crop is proof evidence unless it is independently a true
   source figure.
5. **Image-only table or one-surface flattened sidecar** — rejected; neither
   supplies native cell semantics and anchor parity.
6. **Renderer-specific A-D decisions** — rejected; they recreate drift and
   hybrid wrapping.
7. **Analysis-assisted semantics or answers** — rejected; Analysis is a
   removable supplement with no construction authority.
8. **Persisted renderer anchors or layout in canonical semantics** — rejected;
   canonical identities generate conformance anchors, while geometry remains
   ephemeral renderer presentation.

No `CONTEXT.md` update is required. `Canonical Question Group`, Passage,
Question, Option, Analysis, Source Capture, Source Span, Transformation Record,
Module, Interface, seam, and Adapter already carry the required meanings.
`title` / `subtitle` are Reading content roles, not new domain entities.

No Fog graduates and no new ticket is required. Existing application-writing,
continuation-writing, listening, sidecar, rollout, migration, and synthesis
tickets retain their declared scope.
