# Seven Choices canonical variant 与双卷 proof 合同

Status: accepted Wayfinder prototype answer
Scope: data-contract and proof-contract prototype only; no production schema,
compiler, migration, publisher, consumer, renderer, PDF, or DOCX change

## Question

Can one Seven Choices family variant express five semantic Question/Blank
pairs, one group-owned A–G option bank, official-answer authority,
punctuation-preserving rich content, and stable anchors so that every renderer
projects the same semantics and repeated/nested option banks become
structurally rejectable?

## Decision

Select one closed `CanonicalSevenChoicesVariantV1` behind the accepted
`CanonicalQuestionGroupArtifactV1` envelope:

```ts
type CanonicalSevenChoicesVariantV1 = Readonly<{
  family: 'seven_choices'

  // Exactly five, in the same semantic order as envelope.questionRefs and
  // envelope.blankRefs. Plan display numbers are not stored here.
  members: readonly Readonly<{
    questionId: string
    blankId: string
    answer: Readonly<{
      optionId: string
      authorityAssertionRef: string
    }>
  }>[]

  choices: Readonly<{
    ownership: 'shared_bank'
    bankId: string
    // Exactly seven non-empty options, ordered and labelled A through G.
    options: readonly CanonicalOptionV1[]
  }>
}>
```

The family validator enforces these invariants together:

1. `questionRefs`, `blankRefs`, and `members` each contain exactly five unique
   identities in the same order.
2. Every member couples one Question to one Seven Choices Blank; every
   Question and Blank occurs exactly once.
3. The rich-content document contains exactly one `blank_ref` for each
   `blankId`, in member order. No raw blank marker, source-local ordinal,
   visible question number, underline run, or blank width survives in
   canonical content.
4. `choices` is the accepted shared-envelope `shared_bank` discriminant.
   The bank contains exactly seven unique option identities with ordered
   labels `A` through `G` and non-empty content.
5. No Question owns an option set. The variant cannot encode a per-blank A–D
   or A–G layer, a second group bank, or a bank nested under a Question.
6. Every answer resolves by `optionId` into that one bank. Labels and option
   text are display/source facts, not the answer join key.

This keeps one deep Module seam: `projectCanonicalPaper(...)` receives a
validated family discriminant and projects it unchanged. Screen, Print/PDF,
and DOCX Adapters do not parse markers, synthesize Questions from display
numbers, fall back from `question.options` to `group.optionBank`, or rebuild
choice ownership.

## Identity, numbering, answer authority, and Analysis

- A Seven Choices Question is the answerable identity; its paired Blank is the
  in-passage location. They are one-to-one but remain separate stable ids
  because Question supplements and blank placement have different anchors.
- Array position owns the five-pair semantic order. The Canonical Paper Plan
  alone maps each `questionId` to the displayed numbers such as 36–40.
  Source-local `(1)`–`(5)` and source plan numbers are compilation evidence,
  not canonical numbering fields.
- `answer.optionId` is supported by one provenance-bearing official-answer
  assertion in the Source Capture closure. The member's existing typed
  Question source-map entry must include both the question/blank evidence and
  the cited official-answer Source Span; `authorityAssertionRef` identifies
  the role-bearing assertion without copying source coordinates into the
  variant.
- A missing official answer is `incomplete_source`; two authoritative answers
  that do not exact-normalize to the same bank option are `answer_conflict`.
- Analysis is a supplement and is never answer authority. A reviewed Analysis
  may attach to `questionId`, `blankId`, `optionId`, and source-backed content
  ranges. Its disagreement may block or stale that Analysis artifact, but it
  cannot change or block an otherwise source-authoritative canonical paper.

## Marker removal and punctuation ownership

The private source Adapter recognizes a registered source dialect, establishes
five ordered marker identities, and emits semantic `blank_ref` nodes. Marker
bytes remain reachable through the Source Map and, when the canonical view
differs, an exact Transformation Record.

Literal punctuation never belongs to a Blank. Text before and after a source
marker is split into adjacent source-backed `text` nodes without rewriting its
characters; commas, full stops, quotation marks, parentheses, and spacing that
carry paper meaning remain in those nodes and in the semantic digest.
Renderers derive the visible underline and Plan display number from the family
and typography contracts.

The compiler must prove the following reconstruction property before
admission:

```text
canonical text nodes + original marker bytes at blank_ref Source Spans
  == exact normalized source observation
```

It may not prove parity by formatting canonical output back into a legacy
placeholder string and reparsing it.

## Registered source dialects

Registration is explicit and versioned; a permissive “some underscores around
some digits” regex is not the canonical contract.

| Dialect id | Accepted evidence | Mapping |
| --- | --- | --- |
| `plan-number-double-underscore-v1` | Exactly five ordered `__NN__` markers; current `latest` evidence in 32/33 papers | `NN` must equal the five Plan-assigned Question numbers |
| `plan-number-five-underscore-v1` | Exactly five ordered `_____NN_____` markers; current `paper-960d0f8d` evidence | `NN` must equal the five Plan-assigned Question numbers |
| `source-local-parenthesized-ordinal-v1` | Exactly `(1)` through `(5)` in order inside a positively identified Seven Choices source section | Each local ordinal maps by order to one Question/Blank pair and records an exact Transformation Record to the Plan assignment |

The currently evidenced bank-label source variants `A.`, `A．`, and `A、` are
accepted only when they establish one consecutive, non-empty A–G bank and an
exact section boundary. Label punctuation is not option content.

Full-width underline, non-breaking-space runs, dash runs, bare digits, OCR
gaps, asymmetric wrappers, or any other marker style remain `unsupported`
until an owner-approved family-contract version and proof asset register them.
Legacy Screen/render marker tolerance is compatibility code, not canonical
dialect authority.

## Fail-closed matrix

| Evidence/candidate condition | Disposition or gate result |
| --- | --- |
| Passage, fifth marker, A–G bank item, official answer page/assertion, or required Source Span is missing | `incomplete_source` |
| Duplicate/out-of-order marker, repeated Question/Blank id, marker-to-Plan mismatch, marker followed by a stray local ordinal, or punctuation/boundary with more than one reasonable interpretation | `needs_review` |
| Meaning is clear but the marker/bank/source dialect is not registered | `unsupported` |
| Two provenance-bearing official-answer assertions resolve to different options | `answer_conflict` |
| Analysis suggests a different label | Canonical answer remains ready; Analysis is independently stale/blocked |
| Candidate contains per-question options, two banks, or nested bank ownership | Family conformance rejects the candidate; no canonical Group exists |
| Renderer occurrence contains zero or more than one bank, any per-question choice set, or a nested bank | Projection conformance fails; the publish/rollout gate cannot pass |

The 19 current Seven Choices groups with 95 marker-adjacent local ordinals stay
`needs_review`; they are not bulk-cleaned by regex. Their source context must
prove whether each ordinal is source content, splitter contamination, or a
safe exact transformation.

## One projection and occurrence contract

One **rendered occurrence** means one projection of one Canonical Question
Group into one paper/surface position. If a paper intentionally includes the
same Group twice, each occurrence independently contains exactly one bank;
“one bank” does not mean one bank globally across the whole document.

```ts
type ProjectedSevenChoicesOccurrenceV1 = Readonly<{
  groupId: string
  content: RichContentDocumentV1
  questionBlankPairs: readonly Readonly<{
    questionId: string
    blankId: string
  }>[]
  choices: Readonly<{
    ownership: 'shared_bank'
    bankId: string
    options: readonly CanonicalOptionV1[]
  }>
  anchors: Readonly<{
    contentNodeIds: readonly string[]
    questionIds: readonly string[]
    blankIds: readonly string[]
    optionIds: readonly string[]
  }>
}>
```

All renderer Adapters consume this occurrence shape directly. They may choose
typography and physical placement but may not change content-node order,
Question/Blank coupling, option identity/order, answer joins, or ownership.
The A–D 4/2/1 selector is not applicable to this A–G bank.

## Semantic parity and anchors by surface

Every surface must prove the same semantic projection signature over ordered
content/blank ids, Question/Blank pairs, `bankId`, ordered `optionId`s, and
anchor ids.

| Surface | Required proof |
| --- | --- |
| plain Screen | Five visible semantic blanks derived from Plan numbers; one A–G bank; no per-question rows/options; no Analysis required; blank and option semantic ids remain addressable even when the UI is non-interactive |
| lecture Screen | The exact same paper projection plus Analysis overlays; a blank focus intent resolves directly through `blankId -> questionId`, and option/evidence focus uses `optionId` or source-backed content ranges; rendered numbers are never reparsed as anchors |
| Print HTML | Per occurrence: five blank units, exactly one bank container, A–G each exactly once, zero per-question option containers, and no nested bank |
| PDF | Actual PDF text/geometry inspection proves the same five blank identities and one A–G sequence per occurrence; pagination may move the bank but cannot duplicate or split ownership |
| DOCX | OOXML inspection proves five blank units, one group-level A–G sequence, zero Question-owned option runs/tables, and the same semantic order; LibreOffice/PDF conversion is secondary visual evidence, not semantic authority |

Student versions hide answers and Analysis. Teacher versions may project the
official answer and reviewed Analysis in the Profile/Plan-approved answer
regions or lecture supplement, but they still render the same one-bank paper
occurrence.

Export formats need not expose internal ids to readers. Their renderer proof
adapter must retain an occurrence trace from semantic ids to emitted HTML,
PDF, or OOXML structures so conformance can locate every blank and the single
bank without text guessing.

## Repeated/nested-bank regression contract

At the fixed point used for this initiative, the real
`group-2026-i-seven-choices` detail/export path reproduces:

```text
Question option counts: 7, 7, 7, 7, 7
Print HTML label occurrences in one group: A=5 B=5 C=5 D=5 E=5 F=5 G=5
DOCX XML label occurrences in one group:   A=5 B=5 C=5 D=5 E=5 F=5 G=5
```

The earliest wrong layer is the API detail fallback from absent
`question.options` to the group's shared bank. The minimized regression
occurrence is required to fail with all applicable diagnostics:

```text
SEVEN_CHOICES_SHARED_BANK_OCCURRENCE_COUNT
SEVEN_CHOICES_PER_QUESTION_CHOICE_LAYER_FORBIDDEN
SEVEN_CHOICES_NESTED_SHARED_BANK_FORBIDDEN
```

The future green proof is not a source-regex assertion. It must exercise the
public canonical projection and actual Print/PDF/DOCX paths, then prove one
bank occurrence and no Question-owned choice layer. A historical observation
that the invalid layer once stopped at A–D is not currently reproducible; the
current A–G×5 failure is the bound regression fixture. A future pure-A–D
reproduction may be added as another bad projection but cannot be fabricated.

## Two contrasting real proof groups

No passage, option text, or answer value is copied into this artifact. The
proofs bind to exact source/asset hashes and record only ids and structural
facts.

| Proof | Contrast | Exact evidence | Expected canonical shape |
| --- | --- | --- | --- |
| `paper-2026-i / group-2026-i-seven-choices` | Real PDF source; standard double-underscore plan-number dialect; reproduces the current repeated-bank export failure | source sha256 `31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f`; asset sha256 `fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf` | 5 paragraphs, 5 markers, 5 Question/Blank pairs, 7 options, 5 authoritative answers, one bank |
| `paper-960d0f8d / group-960d0f8d-seven-choices` | DOCX simulated paper; unique five-underscore plan-number dialect; asset exists without a committed import config | source sha256 `960d0f8d6fddc3e6ccff22a15c9044170cb58f59a8b62f9870cf522df8cde25b`; asset sha256 `2578eb70e069c6d39a6d92bbc5254a8c23ed08b152287c2c80167d2121df2a14` | 5 paragraphs, 5 markers, 5 Question/Blank pairs, 7 options, 5 authoritative answers, one bank |

The prototype compiled both real groups to `ready`. Across plain/lecture
Screen, Print HTML, PDF, and DOCX projections, each proof produced one
semantic signature, one bank occurrence, zero per-question sets, five
Question/Blank pairs, and 17 semantic anchors (5 Question + 5 Blank + 7
Option). The prototype digests are diagnostic only; production digests remain
owned by the canonical compiler.

## New-import hard gate

Once the Seven Choices family vertical slice is enabled for new imports:

1. `compileCanonicalPaper(request)` must return whole-paper
   `disposition: ready`; its package must contain the complete compatible
   Profile, Plan, this family variant, Source Map, Normalization Report,
   source fingerprint, and semantic digests.
2. Family schema/conformance must prove five pairs, one shared A–G bank,
   five authoritative answer joins, exact source-map coverage, registered
   dialect use, no raw marker semantics, and no Question-owned options.
3. The shared projector and every enabled renderer occurrence must pass the
   one-bank/no-per-question/no-nesting conformance check.
4. Any `needs_review`, `unsupported`, `incomplete_source`,
   `answer_conflict`, invalid candidate, incompatible package, or projection
   failure is **zero-write** for paper publication: no DB rows, version
   exposure, `latest` swap, or partial canonical sidecar.
5. New imports may not fall back to legacy Seven Choices interpretation.
   Atomic sidecar write/swap, retry, and consumer-selector mechanics remain
   owned by the dedicated publication ticket.

Analysis completeness is not a canonical admission requirement. If product
policy still requires reviewed Analysis for a separate teacher-facing
publication, that is an additional supplement gate and cannot become answer
authority or reconstruct paper semantics.

## Historical compatibility before legacy retirement

The legacy interpretation may retire only after all of the following evidence
is green:

1. Recompute the actual 33 `latest` corpus by asset bytes, not committed
   configs or DB version paths: 33 Seven Choices Groups, 165 Question/Blank
   pairs, 231 group-owned options, zero source Question-owned option sets.
2. Bind every migrated result to its exact asset/source fingerprints and
   Profile/Plan authority closure. `paper-960d0f8d` must compile from actual
   `latest` evidence despite its missing config; `paper-2026-i` must retain
   the real PDF media type despite the legacy `docx` field name.
3. Resolve or explicitly retain as blocked all 19 groups with 95
   marker-adjacent local ordinals. They cannot count as migrated canonical
   coverage while an automatic regex silently removes the digits.
4. For every ready group, prove semantic parity of ordered paragraphs,
   punctuation, five Blank/Question identities, one A–G bank, option order,
   official-answer joins, and Plan numbering without preserving or reparsing
   raw markers.
5. Run the two exact proof groups above through real-click plain/lecture
   Screen QA, actual Print HTML and PDF, and actual DOCX/OOXML. Each rendered
   occurrence must contain exactly one A–G bank, no per-question choice layer,
   and stable anchor resolution.
6. Keep historical fallback whole-family and explicit until coverage is
   complete: one consumer occurrence receives either one compatible canonical
   Seven Choices projection or the whole legacy path, never partial canonical
   paragraphs with legacy Questions/options.
7. Remove the API shared-bank fallback and family-specific legacy marker
   interpretation only after all 33 `latest` groups, required independent
   review, full suite, owner QA, and release closeout pass. Historical
   `versions/vN` remain outside the first migration scope.

The later publication, rollout, and migration tickets own exact sequencing,
atomicity, browser provisioning, suite commands, review lineage, and final
retirement deletion. This ticket supplies their Seven Choices family
acceptance contract.

## Prototype result

The throwaway logic prototype used the two real assets without persistence or
production imports:

```text
node .scratch/wayfinder-08-seven-choices-prototype.mjs --all
PASS
```

It exercised:

- both registered real marker dialects;
- five semantic surface projections per proof with signature parity;
- the current A–G×5 repeated/per-question/nested-bank failure;
- unregistered dialect → `unsupported`;
- missing marker/bank/answer → `incomplete_source`;
- duplicate marker and stray local ordinal → `needs_review`;
- conflicting official answers → `answer_conflict`;
- Analysis disagreement leaving the canonical answer authoritative.

The throwaway TUI/logic files are deleted after this answer is captured. This
linked contract, not the prototype code or its diagnostic digest, is the
durable result.

## Rejected alternatives

1. **Five Questions with optional `options`, plus an optional group bank** —
   rejected because it directly represents the current failure.
2. **Five zero-stem Questions whose number strings are reparsed as blanks** —
   rejected because display numbering belongs to the Plan and is not a stable
   anchor.
3. **Persist raw `__NN__` or underline markers in canonical paragraphs** —
   rejected because every consumer must interpret source dialect and
   punctuation again.
4. **Copy the bank once per Blank “for renderer convenience”** — rejected;
   renderer convenience cannot change semantic ownership.
5. **Treat Analysis labels as answer authority** — rejected because Analysis
   is a reviewed teaching supplement.
6. **Accept every wrapper tolerated by the current Screen adapter** —
   rejected without source-corpus evidence, an executable family-contract
   version, and fail-closed proof.
7. **Retire legacy after only the two proof groups pass** — rejected; the
   proofs establish contrasting family behavior, while retirement requires
   complete 33-`latest` migration evidence.

## Follow-through

No `CONTEXT.md` update is required. “Question”, “Blank”, “Option”, “Canonical
Question Group”, “Analysis”, “Source Capture”, “Source Span”, and
“Transformation Record” retain their accepted domain meanings; the family
variant, occurrence, and anchor structures are Interface details.

No Fog patch graduates and no new Wayfinder ticket is required. The existing
reading, sidecar/publication, rollout, and migration tickets retain their
declared scope.
