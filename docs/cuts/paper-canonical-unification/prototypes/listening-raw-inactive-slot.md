# Listening raw/inactive slot and future activation seam

## Question and evidence boundary

This logic prototype asks what the four existing canonical artifacts must carry
so listening can close a required whole-paper slot without creating a
Canonical Question Group, renderer node, Analysis object, DB record, or
website-visible object. It also asks how missing evidence, absent audio, and a
future active listening contract remain distinguishable.

The only current `latest` listening raw proof is `paper-2026-i`. Its staging
and published copies are byte-identical and have these non-content shapes:

| Raw artifact | Proven shape | SHA-256 |
| --- | --- | --- |
| `questions.json` | section 1: questions 1–5; section 2: questions 6–20; every question has A–C labels | `f845991e03fa494920d91eaae8340084f01154231ce36d9e4df06a67ea1b5610` |
| `answers.json` | one recorded label for every key 1–20; observed labels are A–C | `0a8e9a23c864d9d10db373f98fc0902e240fc3cc8386830588ee874826a958fd` |
| `transcript.json` | ten ordered transcript segments and ten source-supplied timing rows | `28350328ff9aeb5701f41bb8627966a82889b9cc473e8c9cce6d7f0b30030edd` |

The five long-form segment/question relations are explicit in the extracted
`textRef` / `coversQuestions` values. The five short-dialogue relations are
currently implicit in source order: questions 1–5 and transcript Texts 1–5.
An exact compiler may establish those five one-to-one joins only from
source-mapped section/order observations and must ledger the relationship; it
may not use a mutable JSON array index as business identity.

The current source package contains the question PDF and answer/transcript PDF
but no audio artifact. The raw JSON files preserve a useful extraction shape;
they are not themselves a lossless Source Capture because they do not carry
immutable document identity, typed Source Spans for every value, extraction
provenance, or a closed input-artifact inventory. The proof below therefore
uses their counts and relations as a shape fixture, not as a claim that today's
published `latest` directory is already canonical-ready.

## Decision

Keep listening as two required **Inactive Source Slots**:

- `listening.short-dialogue`, questions 1–5, five transcript segments;
- `listening.long-form`, questions 6–20, five transcript segments.

Both use `activation: inactive_source`, `renderPolicy: suppress`, and one
versioned `listening-raw-closure@nck1-v1` requirement. A closed inactive slot is
complete source evidence, not a weak Canonical Question Group. It has no
`groupRef`, emits no Canonical Question Group, and cannot reach
Screen/Print/PDF/DOCX or website/DB consumers.

### Paper Format Profile

The Profile owns reusable admissibility rules, never paper content:

```ts
type ListeningInactiveProfileSlotV1 = Readonly<{
  slotId: 'listening.short-dialogue' | 'listening.long-form'
  presence: 'required'
  activation: 'inactive_source'
  sourceClosureContractRef: Readonly<{
    id: 'listening-raw-closure'
    version: 'nck1-v1'
  }>
  questionRule: Readonly<{
    numbering: Readonly<{ start: number; end: number }>
    cardinality: 5 | 15
    optionLabels: readonly ['A', 'B', 'C']
  }>
  officialAnswerRule: Readonly<{
    exactlyOnePerQuestion: true
    labelMustBelongToQuestionOptions: true
  }>
  transcriptRule: Readonly<{
    segmentCardinality: 5
    everyQuestionCoveredExactlyOnce: true
  }>
  supplementalEvidenceRule: Readonly<{
    timing: 'preserve_exactly_if_supplied'
    audio: 'not_required_for_inactive_closure'
  }>
  renderPolicy: 'suppress'
  groupRef?: never
}>
```

Question ranges, the exact A–C set, answer cardinality, transcript closure, and
the conditional timing/audio policy are Profile facts. Question text, option
text, answer labels, transcript content, timing values, source dialect, file
paths, codecs, duration inference, and playback behavior are not.

This ruling is intentionally `nck1-v1`. A clearly complete source with a
different option/segment shape is `unsupported` under this Profile rather than
being silently coerced; supporting it requires another proved contract/profile
version.

### Canonical Paper Plan

The Plan carries one paper's binding to a validated closure and nothing more:

```ts
type ListeningInactiveSlotBindingV1 = Readonly<{
  slotId: 'listening.short-dialogue' | 'listening.long-form'
  state: 'inactive'
  sourceSliceRefs: readonly SourceSpanRef[]
  sourceClosureRef: Readonly<{
    reportScopeId: string
    contractId: 'listening-raw-closure'
    contractVersion: 'nck1-v1'
    closureDigest: `sha256:${string}`
  }>
  groupRef?: never
}>
```

The binding does not copy question/option/answer/transcript/timing/audio facts.
The complete-only Plan is exposed only when both listening closures and every
other required slot have passed. A closure reference binds it to the exact
Profile contract, source slice, and Normalization Report result; renderers
continue to suppress it.

### Source Capture

The Source Capture must preserve:

1. immutable bytes/digests and roles for every received question,
   official-answer, transcript/supplement, and supplied attachment document;
2. ordered, source-mapped observations for both listening section
   instructions; every question number/stem; every A–C label/value; every
   official-answer assertion; every transcript segment id/order/content; and
   every timing field actually supplied;
3. typed Source Spans and extraction method/version for all those observations;
4. a closed received-artifact inventory, including a separately identified
   operator assertion that the submitted source package is complete.

`audio not supplied` is not a Source Span claim. It is the result of a closed
input inventory with no audio-role artifact and no captured source reference
to an external audio artifact. Without that closure the compiler cannot
distinguish intentional absence from a dropped file and returns
`incomplete_source`. If audio bytes are supplied, Source Capture keeps the
opaque bytes, media type, length, and digest; this ticket defines no codec,
duration, segmentation, alignment, playback, or derived metadata schema.

### Normalization Report

The Report owns the field-level proof and diagnostics:

```ts
type ListeningInactiveClosureV1 = Readonly<{
  scopeId: string
  slotId: 'listening.short-dialogue' | 'listening.long-form'
  contractRef: Readonly<{
    id: 'listening-raw-closure'
    version: 'nck1-v1'
  }>
  status: 'closed'
  sourceSliceRefs: readonly SourceSpanRef[]
  questionCount: 5 | 15
  optionLabels: readonly ['A', 'B', 'C']
  officialAnswerCount: 5 | 15
  transcriptSegmentCount: 5
  transcriptCoverage: 'exactly_once'
  timing:
    | Readonly<{ disposition: 'not_supplied' }>
    | Readonly<{ disposition: 'supplied'; rowCount: 5 }>
  audio:
    | Readonly<{ disposition: 'not_supplied' }>
    | Readonly<{
        disposition: 'captured_uninterpreted'
        artifactRef: string
        digest: `sha256:${string}`
      }>
  transformationRecordIds: readonly string[]
  closureDigest: `sha256:${string}`
}>
```

The Report retains direct source maps and exact Transformation Records for
question/option/answer/segment joins. It does not repeat source text and cannot
emit a closure on a blocked result. `timing.not_supplied` is valid only when
the relevant transcript source slice is fully observed and contains no timing
table, while `audio.not_supplied` requires a closed artifact inventory and no
captured audio reference.

For `nck1-v1`, a supplied timing table must be preserved literally and cover
the same five segment ids in each slot exactly once; duration, word count, and
words-per-minute values are source observations and are never recomputed.
A different but clearly complete source timing shape needs a new proved
closure contract instead of an inferred rewrite.

## Completeness and fail-closed matrix

| Evidence condition | Disposition |
| --- | --- |
| exact required question range; every stem and A–C value is non-empty and source-mapped | continue |
| missing question/stem/option/label/span | `incomplete_source` |
| clearly complete option/segment shape outside `nck1-v1` | `unsupported` |
| exactly one source-mapped official answer per question and its label belongs to that question's options | continue |
| missing official answer/source role/span | `incomplete_source` |
| authoritative question and answer evidence disagree, or two authoritative answers disagree | `answer_conflict` |
| five non-empty, source-mapped transcript segments per slot; every question covered exactly once | continue |
| missing segment/content/span or uncovered question | `incomplete_source` |
| multiple plausible question/segment joins or overlapping coverage | `needs_review` |
| timing not supplied, the transcript source slice is fully observed, and no timing table occurs | continue with `timing.not_supplied` |
| timing supplied, literal, source-mapped, and one row covers each segment exactly once | continue with `timing.supplied` |
| supplied timing row missing/corrupt/hash-mismatched or recomputed instead of copied | `incomplete_source` |
| no audio supplied, input inventory is closed, and no source audio reference occurs | continue with `audio.not_supplied` |
| audio supplied and captured opaquely with bytes/media type/length/digest | continue with `audio.captured_uninterpreted` |
| audio referenced/supplied but bytes or digest missing | `incomplete_source` |
| inventory is not closed, so absent timing/audio may actually be missing | `incomplete_source` |

Only after both inactive slot closures pass may the whole-paper compiler expose
a `ready` package and complete Plan. It still exposes zero listening Canonical
Question Groups.

## Future activation seam

The public Module remains the existing pure
`compileCanonicalPaper(request)`. Do not add a listening-specific public
function or plugin port now: only one inactive implementation exists, so such
a port would be a hypothetical seam.

Future activation must cross the existing Profile/Plan/family seam explicitly:

1. publish a new Profile version that changes the listening slot from
   `activation: inactive_source` to `activation: canonical_group` and names a
   versioned active listening family contract;
2. add one private family compiler that consumes Source Capture observations,
   not the current raw JSON or renderer output, and returns a source-mapped
   Canonical Question Group conforming to that exact family contract;
3. decide in that active contract which transcript/timing/audio semantics are
   required; this ticket's opaque audio capture does not pre-decide them;
4. bind the admitted Group in a new complete Canonical Paper Plan and include
   it in the package semantic digest/conformance checks;
5. separately add and verify website, Screen/Print/PDF/DOCX, and Analysis
   consumers before any surface may expose the active slot.

Activation may not mutate an existing Profile version, reinterpret an
inactive Plan, manufacture missing audio/timing, or turn the inactive closure
itself into a Canonical Question Group. This keeps source capture reusable
while forcing the future model to prove its own semantics and consumers.

## Prototype result

A throwaway pure closure function plus terminal driver exercised eleven
scenarios against the real `paper-2026-i` raw shape:

| Scenario class | Observed result |
| --- | --- |
| complete supplied timing + audio not supplied | `ready`, two inactive closures, zero Groups |
| timing not supplied under a closed inventory | `ready` |
| missing option, answer, transcript segment, timing row, or inventory closure | `incomplete_source` |
| complete A–D shape under the A–C Profile | `unsupported` |
| authoritative answer outside the question option set | `answer_conflict` |
| overlapping segment coverage | `needs_review` |
| referenced audio with missing bytes | `incomplete_source` |

The prototype reported `PASS 11 / FAIL 0` and is deleted after this decision
is captured. The shipped `verify-nck1-standard.mjs` currently checks only broad
counts and supplied timing-row scalar presence; it does not prove the source
lineage, option-label/value closure, answer membership/conflict, transcript
coverage, input-inventory closure, or audio disposition defined here. This
ticket changes no production gate.

The new **Inactive Source Slot** glossary entry records the resolved domain
language. No ADR is needed because the Wayfinder ticket and this linked
contract are the durable decision. The active listening model remains in Fog;
no Fog patch graduates and no new ticket is created.
