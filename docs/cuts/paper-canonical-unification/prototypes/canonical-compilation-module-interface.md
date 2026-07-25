# Canonical compilation Module Interface prototype

## Question and evidence

This prototype asks which external Interface can place one deep Module between
immutable source evidence and atomic canonical artifacts. The Interface must
hide source-format parsing, executable-standard closure, profile and family
selection, normalization, validation, lineage, fingerprints, semantic
digests, and structured diagnostics. It must remain pure and serve both
new-import prepublish and historical `latest` compilation without exposing
renderer, React, DB, filesystem, AI Analysis, caller mode, or source-dialect
details.

The current implementation spreads those decisions across the package builder,
import validator, group normalizer, sidecar builder, and Screen/Print
compatibility adapters. `normalizePaperGroup(input)` proves that a
discriminated pure result is useful, but its caller still constructs a
source-specific slice, chooses supported families, aggregates group outcomes,
and decides whether a partial sidecar is safe.

The prototype uses existing domain terms without adding a glossary entity.
`Canonical compilation Module` names an implementation shape, while Source
Capture, Canonical Paper Plan, Canonical Question Group, Normalization Report,
Transformation Record, and Source Span keep their meanings from `CONTEXT.md`.

## Alternative A — one-shot evidence compiler

```ts
type Sha256 = `sha256:${string}`

type CanonicalAuthorityRef = Readonly<{
  manifestId: string
  manifestVersion: string
  manifestDigest: Sha256
}>

type SourceDocumentInput = Readonly<{
  inputKey: string
  roles: readonly SourceDocumentRole[]
  bytes: Uint8Array
  declared?: Readonly<{
    originalName?: string
    mediaType?: string
  }>
}>

type CanonicalCompilationRequest = Readonly<{
  authority: CanonicalAuthorityRef
  evidence: Readonly<{
    documents: readonly SourceDocumentInput[]
    operatorAssertions?: readonly OperatorAssertionInput[]
    reviewDecisions?: readonly NormalizationReviewDecision[]
  }>
}>

type BlockingDisposition =
  | 'needs_review'
  | 'unsupported'
  | 'incomplete_source'
  | 'answer_conflict'

type CanonicalCompilationResult =
  | Readonly<{
      disposition: 'ready'
      artifacts: Readonly<{
        sourceCapture: SourceCapture
        canonicalPaper: Readonly<{
          paperPlan: CanonicalPaperPlan
          questionGroups: readonly CanonicalQuestionGroup[]
        }>
        normalizationReport: NormalizationReport
      }>
    }>
  | Readonly<{
      disposition: BlockingDisposition
      artifacts: Readonly<{
        sourceCapture: SourceCapture
        normalizationReport: NormalizationReport
        canonicalPaper?: never
      }>
    }>

declare function compileCanonicalPaper(
  request: CanonicalCompilationRequest,
): CanonicalCompilationResult
```

Interface invariants:

- The caller supplies immutable bytes, document roles, separately identified
  operator assertions, an exact authority identity, and optional prior review
  decisions. Declared file name or media type is evidence, not an adapter
  selector or business identity.
- The Module resolves and validates the exact manifest closure named by
  `authority`. The caller never supplies profile, family, rule, parser, or
  adapter choices. Unknown, missing, or digest-mismatched authority fails
  closed as `unsupported`.
- The Module captures source evidence before interpreting it. Even blocked
  results retain the lossless Source Capture and Normalization Report.
- `ready` is the only branch that contains `canonicalPaper`. Any blocking
  diagnostic removes the whole paper's Plan and Groups from the external
  result; callers cannot publish a partial canonical/legacy mixture.
- Expected source and standard failures are data outcomes, not exceptions.
  For schema-valid request values, the function is total and deterministic.
  Same authority closure, bytes, assertions, and review decisions produce a
  deep-equal result.
- Fingerprint, digest, Source Map, Transformation Record, diagnostic
  precedence, and stable serialization algorithms stay inside the
  implementation. Their durable results live in the Normalization Report;
  callers persist that report but do not reconstruct or reinterpret it.
- The Module performs no I/O. A caller reads bytes before the call and writes
  returned artifacts after a `ready` result. Authority artifacts are an
  immutable in-process registry keyed by the exact reference.

Representative ready artifact:

```ts
const ready: CanonicalCompilationResult = {
  disposition: 'ready',
  artifacts: {
    sourceCapture: {
      schemaVersion: 'source-capture-v1',
      captureId: 'capture:fixture',
      digest: 'sha256:source',
      documents: [
        {
          documentId: 'document:questions',
          roles: ['question_source'],
          byteLength: 48213,
          sha256: 'sha256:questions',
        },
        {
          documentId: 'document:answers',
          roles: ['official_answer_source'],
          byteLength: 12031,
          sha256: 'sha256:answers',
        },
      ],
    },
    canonicalPaper: {
      paperPlan: {
        schemaVersion: 'canonical-paper-plan-v1',
        profileRef: { id: 'nck1', version: '1' },
        groupRefs: ['group:cloze'],
      },
      questionGroups: [
        {
          schemaVersion: 'canonical-question-group-v1',
          groupId: 'group:cloze',
          familyContractRef: { id: 'cloze', version: '1' },
        },
      ],
    },
    normalizationReport: {
      schemaVersion: 'normalization-report-v1',
      disposition: 'ready',
      authority: {
        manifestId: 'paper-canonical',
        manifestVersion: '1',
        manifestDigest: 'sha256:manifest',
      },
      captureDigest: 'sha256:source',
      sourceFingerprint: 'sha256:fingerprint',
      semanticDigest: 'sha256:semantic',
      directSourceMap: [],
      transformationRecords: [],
      diagnostics: [],
    },
  },
}
```

The Plan and Group fields above are relationship-only placeholders. Their
field-level contracts remain owned by the later profile/plan and family
Wayfinder tickets.

Representative fail-closed artifact:

```ts
const blocked: CanonicalCompilationResult = {
  disposition: 'needs_review',
  artifacts: {
    sourceCapture: {
      schemaVersion: 'source-capture-v1',
      captureId: 'capture:fixture',
      digest: 'sha256:source',
      documents: [
        {
          documentId: 'document:questions',
          roles: ['question_source'],
          byteLength: 48213,
          sha256: 'sha256:questions',
        },
      ],
    },
    normalizationReport: {
      schemaVersion: 'normalization-report-v1',
      disposition: 'needs_review',
      authority: {
        manifestId: 'paper-canonical',
        manifestVersion: '1',
        manifestDigest: 'sha256:manifest',
      },
      captureDigest: 'sha256:source',
      sourceFingerprint: 'sha256:fingerprint',
      diagnostics: [
        {
          code: 'AMBIGUOUS_GROUP_BOUNDARY',
          class: 'semantic_risk',
          sourceSpans: ['source-span:fixture'],
          candidates: ['candidate:a', 'candidate:b'],
          recovery: 'review_decision_required',
        },
      ],
    },
  },
}
```

The blocked result has no `canonicalPaper` and no `semanticDigest`: there is
no accepted whole-paper semantic artifact to hash.

Both current callers use the same Interface:

```ts
const result = compileCanonicalPaper({ authority, evidence })

if (result.disposition !== 'ready') {
  return rejectPrepublish(result.artifacts.normalizationReport)
}

persistAdditiveCanonicalSidecars(result.artifacts)
```

```ts
for (const evidence of historicalLatestEvidence) {
  const result = compileCanonicalPaper({ authority, evidence })
  if (result.disposition === 'ready') {
    migrationWrites.push(result.artifacts)
  } else {
    migrationBlocks.push(result.artifacts.normalizationReport)
  }
}
```

There is deliberately no `mode: 'new-import' | 'migration'`. Caller identity
cannot change canonical semantics.

## Alternative B — compile an existing Source Capture

```ts
declare function compileCanonicalPaper(request: Readonly<{
  authority: CanonicalAuthorityRef
  sourceCapture: SourceCapture
  reviewDecisions?: readonly NormalizationReviewDecision[]
}>): CanonicalCompilationResult
```

This is the smallest type surface and preserves a clean domain seam from Source
Capture to canonical artifacts. It is weaker for this ticket because
source-format parsing and capture closure move into a second externally
coordinated Module. New-import and historical callers must each choose or
construct that parsing path before they reach the canonical compiler. Deleting
the compiler would still leave substantial source-dialect complexity spread
across callers, so the requested Module is not as deep.

## Alternative C — authority-bound protocol compiler

```ts
interface BoundCanonicalCompiler {
  compile(subject: Readonly<{
    protocol: string
    artifacts: readonly Uint8Array[]
    reviewDecisions?: readonly NormalizationReviewDecision[]
  }>): CanonicalCompilationResult
}

interface CanonicalCompilationModule {
  bindAuthority(ref: CanonicalAuthorityRef):
    | Readonly<{ status: 'ready'; compiler: BoundCanonicalCompiler }>
    | Readonly<{
        status: 'unsupported'
        normalizationReport: NormalizationReport
      }>
}
```

Binding validates one authority closure once and can be efficient for a
33-paper migration. Its costs are a second external entry point, a bind-before-
compile ordering constraint, and a public `protocol` discriminator that can
become a disguised `docx` / `pdf` / `paper-asset-v1` dialect selector.
Authority-closure reuse is better kept as an implementation memo keyed by the
exact manifest digest; it does not need to enlarge the external Interface.

## Comparison and decision

| Interface | Depth / leverage | Locality | Fail-closed shape | New-import + historical caller compatibility |
| --- | --- | --- | --- | --- |
| A — one-shot evidence compiler | Highest: capture through atomic artifacts behind one function | Parsing, authority, rules, family adapters, validation, lineage, and digests change in one Module | Strong: blocked branches cannot contain Plan/Groups or semantic digest | Same one-step call; no mode or dialect selector |
| B — existing Source Capture | Smallest signature, but capture/parsing leverage remains elsewhere | Canonical rules local; source-format knowledge remains distributed | Strong after capture | Same compile call, but different upstream capture orchestration |
| C — authority-bound protocol compiler | High batch leverage, with an extra lifecycle | Compiler logic local; protocol registry becomes public coupling | Strong after successful bind | Same compile method, but protocol and bind steps differ |

Select **Alternative A — one-shot evidence compiler**.

It wins the deletion test: removing it would force parsing, manifest closure,
normalization, family dispatch, validation, lineage, digest, and disposition
logic back into every caller. Its one external Seam gives the highest caller
leverage and implementation locality. It also meets the strongest fail-closed
rule: a paper is either one atomic ready package or only evidence plus a
Normalization Report.

Source-format Adapter and family Adapter seams remain internal. They are real
seams because multiple implementations exist, but exposing them would make
the Module shallow. Renderer Typography, Screen, Print/PDF, DOCX, React, DB,
filesystem, network, AI Analysis, publication, rollback, and consumer
selection remain outside.

The rough TUI exercised all three Interface shapes against `ready`,
`needs_review`, and `answer_conflict`. Alternative A kept exact authority,
source parsing, source dialect, caller identity, and partial-canonical safety
behind one entry point in every case. Alternative B exposed capture/parsing
coordination; Alternative C exposed ingress protocol and a second lifecycle.
The TUI was throwaway and is not part of the durable Module.

No new Fog graduates from this choice. Later tickets already own Paper Format
Profile / Canonical Paper Plan fields, family variants, publication selection,
rollout, migration, and historical-version scope.
