# Continuation Writing canonical variant 与 starters 合同

Status: accepted Wayfinder prototype answer
Scope: data-contract and proof-contract prototype only; no production schema,
compiler, profile, migration, publisher, consumer, renderer, PDF, DOCX, paper
asset, or Writing Analysis change

## Question

Can one closed Continuation Writing family seam preserve source-backed
continuation material, exact task instruction, approximate word-count ruling,
ordered paragraph starters, and one answer region while keeping the Writing
Question Group at zero Questions and preventing current legacy starter
contamination from reaching Screen, Print/PDF, or DOCX?

## Decision

Select one closed `CanonicalContinuationWritingVariantV1` behind the accepted
`CanonicalQuestionGroupArtifactV1` envelope. The shared Group has empty
`questionRefs` and `blankRefs`; its rich-content document contains the
continuation material and any source-provided fixed starter content exactly
once. The variant refers to those nodes rather than copying their text:

```ts
type CanonicalContinuationWritingVariantV1 = Readonly<{
  family: 'continuation_writing'
  writingTaskId: string

  // The complete source story/material in display order. Profile-owned task
  // instructions and fixed starter content are not part of this stream.
  materialBlockRefs: readonly string[]

  taskInstruction: Readonly<{
    // Exact catalog entry owned by the selected Paper Format Profile version.
    profileInstructionRef: string
    // Source-backed assertion that this paper uses that task ruling.
    sourceAssertionRef: string
  }>

  wordCountRuling: Readonly<{
    kind: 'approximate_target'
    target: 150
    countScope: 'student_authored_only'
    sourceRef: CanonicalContentRefV1
  }>

  starterProvision: CanonicalContinuationStarterProvisionV1

  choices: Readonly<{ ownership: 'none' }>
  response: Readonly<{
    kind: 'group_level_written_response'
    answerRegionRef: 'writing.continuation-box'
  }>
}>

type CanonicalContinuationStarterProvisionV1 =
  | Readonly<{
      kind: 'ordered_source_starters'
      starters: readonly [
        CanonicalContinuationStarterV1,
        CanonicalContinuationStarterV1,
      ]
    }>
  | Readonly<{
      kind: 'source_proven_none'
      // Affirmative closure of the source task and response region, not an
      // inference from an absent legacy array.
      absenceAssertionRef: string
    }>

type CanonicalContinuationStarterV1 = Readonly<{
  starterId: string
  // Exactly one source-mapped rich-content block containing the fixed text
  // that belongs at the beginning of this response part.
  contentRef: string
}>
```

Array position is the sole semantic order of `materialBlockRefs` and
`starters`; no second ordinal is persisted. The standard starter branch is an
exact two-element tuple, so a renderer cannot silently take the first two
items from a longer array. Starter text remains fixed source-provided response
text. It is excluded from `student_authored_only` word count and never becomes
a Question, Blank, answer, or Analysis field.

The task instruction is not copied into the Group. The selected Profile
version owns its exact standardized instruction and answer-region binding;
the variant binds that catalog entry to this paper's source assertion. A
source wording difference requires an exact Transformation Record or a
different compatible Profile version. Renderers receive the resolved
instruction from the shared whole-paper projection and may not reconstruct it
from `taskType`, starter count, or passage text.

Continuation material uses the accepted minimal rich-content model, so its
paragraphs, tables, and figures keep source order and Source Map coverage.
Starter nodes are outside `materialBlockRefs` and project only inside the
answer region. The same source line therefore cannot appear once as material,
again as a free instruction block, and a third time inside the response box.

## Two executable family contracts

Starter cardinality remains a family-contract fact, not a free Profile or Plan
field. Two exact contracts cover the currently evidenced source meanings:

| Family contract | Accepted starter provision | Compatible Profile shape |
| --- | --- | --- |
| `continuation-writing.two-starter@v1` | exactly two ordered source starters | NCK1 and a two-starter Zhejiang legacy Profile version |
| `continuation-writing.plot-led@v1` | affirmative `source_proven_none` | a plot-led Zhejiang legacy Profile version whose instruction does not claim provided starters |

A Profile slot still holds one exact `familyContractRef`. Supporting both
Zhejiang forms therefore requires exact compatible Profile versions, not an
optional `starterCount` flag in a Plan. This preserves the prior decision that
the family contract owns starter cardinality while preventing an NCK1 Plan
from accepting a starter-free task.

`source_proven_none` is a legitimate historical source form only after the
complete task and response region prove that no fixed starter text is
provided. Zero parsed entries, a missing legacy field, or an empty answer box
does not prove this branch.

V1 does not admit a genuine three-starter branch. Complete and unambiguous
evidence for such a task would be `unsupported` until an owner-approved
family contract and compatible Profile version exist. The current corpus's
three-entry array is not that evidence: its source roles remain mixed and it
is `needs_review`.

## Family conformance

The compiler validates these invariants together:

1. The shared Group has zero Questions, zero Blanks, one `writingTaskId`, and
   choice ownership `none`.
2. `materialBlockRefs` is non-empty, ordered, unique, and covers the complete
   continuation material while excluding Profile instructions, fixed
   starters, model answers, and Continuation Design.
3. The selected Profile slot, Profile instruction, family contract, Group
   family-contract reference, and `writing.continuation-box` binding form one
   exact authority closure.
4. V1 accepts one source-backed `approximate_target: 150` ruling with
   `countScope: student_authored_only`; provided fixed starters do not count.
5. `ordered_source_starters` contains exactly two unique starter identities
   and unique content refs. Array position alone establishes response-part
   order.
6. `source_proven_none` contains no starter nodes and carries an affirmative
   absence assertion over a closed source task and answer region.
7. Every material block, task-instruction assertion, word-count ruling,
   starter or starter-absence assertion, answer-region assertion, and Writing
   Task identity has Source Map coverage. Exact source cleanup cites ordered
   Transformation Records.
8. Starter labels or prefixes are not added, removed, or doubled by a
   renderer. Any exact separation of a source label from fixed response text
   is a compiler normalization with source spans and a Transformation Record.
9. `continuationDesign`, Model Answer, official reference answer, Highlight
   Expressions, Writing Analysis, generator audit, and student response
   content are rejected as canonical candidate fields.
10. Screen, Print/PDF, DOCX, and Analysis adapters consume one validated
    projection; none selects the first two legacy entries, parses
    `Paragraph N:`, or derives material/starter boundaries at runtime.

The word-count target is intentionally closed to the currently evidenced 150
words. A clear different ruling is `unsupported`, not coerced to 150. A
missing or conflicting ruling fails closed as described below.

## Fail-closed matrix

| Evidence/candidate condition | Disposition or gate result |
| --- | --- |
| Complete NCK1/two-starter source, exact compatible Profile/contract, two ordered starters, complete material/instruction/count/response evidence | `ready` with `ordered_source_starters` |
| Complete plot-led Zhejiang source, exact compatible Profile/contract, affirmative no-starter closure | `ready` with `source_proven_none` |
| Zero parsed starters but no closed source task/response-region absence assertion | `incomplete_source` |
| Selected two-starter contract but one or both starter source regions are missing, unreadable, truncated, or hash-mismatched | `incomplete_source` |
| Material, task instruction, word-count ruling, response region, Writing Task identity, or required Source Map coverage is missing | `incomplete_source` |
| Source meaning is clearly plot-led but no compatible plot-led family contract/Profile version exists | `unsupported` |
| Source clearly provides a genuine cardinality other than the contract's exact zero or two | `unsupported` |
| Starter candidates overlap material, answer/model content, or each other such that two or more role boundaries remain plausible | `needs_review` |
| Two source locations disagree on starter boundary/order, task instruction, or word-count ruling | `needs_review` |
| A duplicated `Paragraph N:` prefix is source-proven parser duplication | Accept one fixed starter node only through an exact Transformation Record |
| A duplicated prefix cannot be separated from source-authored fixed text exactly | `needs_review` |
| Questions, Blanks, choices, duplicate ids/refs, wrong answer-region ref, or unknown fields enter the candidate | Family conformance rejects the candidate; no canonical Group exists |
| Continuation Design, Model Answer, official reference answer, Highlight Expressions, Writing Analysis, audit, or student response enters the candidate | Family conformance rejects the candidate |
| A model/official response disagrees with the task or with another supplement | Canonical Continuation Group remains unchanged; the relevant supplement is stale or blocked |
| Any consumer slices, fabricates, prefixes, or reclassifies starters after canonical selection | Projection conformance fails; publish/rollout cannot pass |

`answer_conflict` is not a continuation-family outcome because there is no
canonical student answer. Official/model responses and Continuation Design
remain supplement content, consistent with the existing Writing Analysis
contract.

## One projection and answer-region parity

The shared projector emits one semantic occurrence:

```ts
type ProjectedContinuationWritingOccurrenceV1 = Readonly<{
  groupId: string
  writingTaskId: string
  profileInstructionRef: string
  material: RichContentDocumentV1
  wordCountRuling:
    CanonicalContinuationWritingVariantV1['wordCountRuling']
  answerRegion: Readonly<{
    answerRegionRef: 'writing.continuation-box'
    responseSlotId: string
    starterLines:
      | readonly []
      | readonly [
          CanonicalContinuationStarterV1,
          CanonicalContinuationStarterV1,
        ]
  }>
  anchors: Readonly<{
    contentNodeIds: readonly string[]
    starterIds: readonly string[]
    responseSlotId: string
  }>
}>
```

All surfaces share one signature over the Group/Writing Task identities,
Profile instruction ref, ordered material/content ids, complete word-count
ruling, answer-region ref, response-slot id, and ordered starter ids/content
refs.

| Surface | Required proof |
| --- | --- |
| writing Screen / PaperSurface | Complete material and instruction each appear once; one answer region contains exactly the canonical zero-or-two starter shape; every semantic id resolves without text parsing |
| Print HTML | One continuation occurrence and one Plan-bound answer box; the standard contract prints exactly two source starters in canonical order, while plot-led prints none |
| PDF | Actual PDF text/geometry inspection proves the same material/instruction order, one answer-region occurrence, and exact zero-or-two starter occurrence/order |
| DOCX | OOXML inspection proves one answer-region table/frame with the identical zero-or-two starter occurrence/order; LibreOffice/PDF conversion is secondary visual evidence |

Student and teacher paper occurrences are identical. A teacher surface may
append reviewed Continuation Design, Model Answer, and Highlight Expressions
outside the paper occurrence; those supplements cannot alter its signature.
Box dimensions, row heights, fonts, line breaks, and pagination remain
renderer typography. The semantic contract fixes only which starter content
belongs at each response-part start.

## Two contrasting real proof groups

No continuation passage, starter text, model answer, official answer,
Continuation Design, or student data is copied into this artifact. Proofs
retain only ids, hashes, source positions/shapes, counts, and text digests.

### Standard two-starter proof

`paper-2026-i / group-2026-i-writing-continuation`, source PDF physical page
11:

- question PDF:
  `sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f`,
  11 A4 pages;
- current `paper-asset-v1`:
  `sha256:fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf`;
- zero Questions and zero Blanks;
- four current material paragraphs, one approximate 150-word ruling, and two
  source starters;
- starter text lengths are 69 and 48 characters, with hashes
  `e1a2e2c32634e1477e869d388a4f39e068c534b29e20602f573059f6d27a8379`
  and
  `6301d0d99819cfca5501d8201a235e82e31ec733fb53473041d3c2523a1ac02e`;
- normalized source-page inspection finds each starter exactly once;
- no current `writing-analysis-v1.json`, proving canonical admission is
  independent of Continuation Design and Model Answer.

This proof exercises the NCK1
`continuation-writing.two-starter@v1` contract.

### Plot-led no-starter proof

`paper-zj-2020-jul / group-zj-2020-jul-writing-continuation`:

- question/answer DOCX:
  `sha256:1a447b5dc7bdba349347d61080304eab55815e41db055b5c2ff9b43545b79cdc`;
- current `paper-asset-v1`:
  `sha256:3698679f6e261a111696b8122ed34f66b4e7a29d65379629fb5a2f93fd6d1eb6`;
- zero Questions and zero Blanks;
- eight current material paragraphs, one approximate 150-word ruling, and
  zero current starter entries;
- read-only source WML inspection finds the plot-led task ruling once and no
  `Paragraph 1:` or `Paragraph 2:` label anywhere in the source document;
- the current Writing Analysis is supplement evidence only and does not
  authorize or fill starter text.

This proof exercises a source-proven
`continuation-writing.plot-led@v1` contract and the need for a compatible
plot-led Zhejiang Profile version. It does not treat an empty legacy array as
proof; migration must bind the affirmative ruling and response-region closure
to Source Spans.

## Real negative case: the current three-entry array

`paper-zj-2022-jun / group-zj-2022-jun-writing-continuation` is a fail-closed
fixture, not a third proof contract:

- source DOCX:
  `sha256:a122274be75589b0ba1863d66939f44a699b4ecb23f129f58de54e742164f61a`;
- current `paper-asset-v1`:
  `sha256:929159382b2f3fc3c398487b45d9563223d792486ab6fd8bee70217afdaa586c`;
- current starter-entry lengths are 71, 509, and 447 characters; the latter
  two contain Chinese and multi-sentence response-like content;
- starter-entry hashes are
  `b092268c56e96f9cbd1a39594632ad5a4ab0e6476fda08f15545b7d6e034de3f`,
  `e373cea744a73d61aa4af83b9cea94f6b812a640b40e30306a32e301011aa3b7`,
  and
  `d91f4526f9d46dab9acf5221448cdfb603569c30a2fb3f98a70d397172e380df`;
- read-only WML inspection finds one plot-led instruction, no
  provided-starter instruction, no `Paragraph 1:` label, and one
  `Paragraph 2:` occurrence inside a document that also carries answer
  material.

The current evidence therefore leaves question/answer/starter boundaries
unclosed. The compiler returns `needs_review`; it may not keep all three,
silently take the first two, or reinterpret the last two as fixed response
text. A later source-role review may resolve the task to an already accepted
zero- or two-starter contract, or show a clear unsupported form.

## Prototype result

The throwaway logic prototype command:

```bash
node .scratch/wayfinder-11-continuation-writing-canonical-variant/tui.mjs --all
```

reported `PASS 18 / FAIL 0`. It compiled both real proof shapes, produced
identical semantic signatures for Screen, Print/PDF, and DOCX, and rejected or
blocked:

- the real ambiguous three-entry array;
- a clear but unsupported three-starter source;
- missing required starter evidence;
- zero entries without affirmative source closure;
- Profile/family-contract mismatch;
- missing continuation material;
- conflicting or unsupported word-count rulings;
- Questions, wrong answer-region binding, duplicate starter identity,
  incomplete Source Map coverage, and Writing Analysis intrusion.

It also reproduced the current three-entry cross-surface mismatch: Screen
consumes all legacy entries as `givenTop`, while Print/PDF and DOCX take only
the first two.

Recorded checks:

- `node --check` on both throwaway prototype modules before deletion;
- throwaway logic prototype → `PASS 18 / FAIL 0`;
- `node scripts/verify-i6-writing-render.mjs` → 19 checks passed;
- read-only current corpus recount → 24 Continuation Groups, with legacy
  starter-count distribution `0:1 / 2:22 / 3:1`;
- source hashes for both proof groups and the three-entry negative case match
  their committed asset provenance;
- `git diff --check`.

Prototype digests are diagnostic only; production source fingerprints and
semantic digests remain owned by `compileCanonicalPaper(...)`. The throwaway
code is deleted after this answer is captured.

## Current legacy behavior is negative proof

The current production paths do not implement this contract:

1. `packageBuilder.mjs` accepts a starter-free early Zhejiang group through a
   producer profile flag, but then emits the same standard two-starter
   instruction block for every continuation Group. The 2020 plot-led source
   therefore acquires a semantic instruction it did not provide.
2. The same builder stores every parsed starter candidate but creates one
   display instruction from only the first two.
3. Screen's `writingPageModel.mjs` sends the whole legacy starter array into
   `givenTop`; Print/PDF and DOCX accept `length >= 2` and slice `[0], [1]`.
   The real three-entry asset therefore has different response semantics
   across surfaces.
4. API detail projects only `taskType + continuationStarters` from the Writing
   Task. Complete task-instruction, material-role, word-count, and
   answer-region semantics do not travel as one occurrence.
5. Runtime doubled-prefix collapse and first-two slicing are compatibility
   guards, not canonical normalization or parity proof.

The accepted occurrence removes those branches. A consumer receives either
one compatible canonical Continuation occurrence or the whole legacy family
path; it cannot combine canonical material with legacy starter selection or
instruction fabrication.

## New-import hard gate

Once the Continuation Writing vertical slice is enabled for new imports:

1. `compileCanonicalPaper(request)` must return whole-paper
   `disposition: ready` with a compatible exact Profile, Plan, Continuation
   Group, Source Map, Normalization Report, source fingerprint, and semantic
   digests.
2. Family conformance must prove zero Questions/Blanks, complete material,
   source-bound Profile instruction, a valid approximate 150-word ruling,
   one exact starter-provision branch, exclusive no-choice ownership, and the
   Plan-bound continuation response region.
3. The shared projector and every enabled renderer must pass occurrence,
   anchor, and zero-or-two starter parity with no runtime parsing or slicing.
4. Any `needs_review`, `unsupported`, `incomplete_source`, invalid candidate,
   incompatible package, or projection failure is zero-write for paper
   publication.
5. New imports may not fall back to legacy starter arrays, producer profile
   booleans, `Paragraph N:` regexes, first-two slicing, duplicated-prefix
   cleanup, default 150-word targets, or material/Analysis inference.
6. Writing Analysis completeness remains outside canonical admission.

Atomic sidecar write/swap, retry, and consumer-selector mechanics stay with
the dedicated publication ticket.

## Historical compatibility before legacy retirement

The legacy Continuation interpretation may retire only after:

1. Recompute the actual `latest` corpus by bytes: currently 24 active
   Continuation Groups with starter-count leads `0:1 / 2:22 / 3:1`.
2. Treat those counts and current Profile flags as migration leads, not source
   truth. Bind every material, instruction, count ruling, answer region, and
   starter/absence decision to Source Capture.
3. Resolve the known starter-free and three-entry assets, doubled-prefix
   assets, and any source/answer boundary contamination through exact source
   roles, Source Spans, and Transformation Records.
4. Compile all 24 Groups to `ready` or retain each unresolved Group explicitly
   blocked; first-two slicing and empty-box fallback never count as migrated
   coverage.
5. Run both exact proof groups through real-click Screen, actual Print HTML and
   PDF, and actual DOCX/OOXML. Each must preserve one material stream, one task
   instruction, one answer region, and the identical zero-or-two starter
   signature.
6. Keep historical fallback whole-family and explicit until coverage is
   complete: one consumer occurrence receives either one compatible canonical
   Continuation projection or the whole legacy path.
7. Remove producer starter flags, fabricated instruction branches, Screen
   `givenTop` reconstruction, first-two slicing, and prefix cleanup only after
   all 24 `latest` Groups, required independent review, full suite, owner QA,
   and release gates pass.

No `CONTEXT.md` change is required: Writing Task already owns continuation
material and task-specific fixed response text, Writing Question Groups
already contain zero Questions, and Continuation Design and Model Answer
already belong exclusively to Writing Analysis. No Fog graduates and no new
Wayfinder ticket is required; the existing listening ticket remains the
declared successor.
