# Application Writing canonical variant 与 given skeleton 合同

Status: accepted Wayfinder prototype answer
Scope: data-contract and proof-contract prototype only; no production schema,
compiler, migration, publisher, consumer, renderer, PDF, DOCX, paper asset, or
Writing Analysis change

## Question

Can one closed Application Writing family variant preserve the complete prompt,
source-backed communicative situation, ordered content requirements, exact
word-count ruling, and explicit given title/salutation/opening/closing/signature
without treating an email/article genre or background letter as proof of a
given skeleton, while projecting one answer-region occurrence to Screen,
Print/PDF, and DOCX?

## Decision

Select one closed `CanonicalApplicationWritingVariantV1` behind the accepted
`CanonicalQuestionGroupArtifactV1` envelope. The shared envelope has empty
`questionRefs` and `blankRefs`; its `content` contains every source-backed
prompt and given-skeleton node exactly once. The Application variant assigns
roles by referring to those nodes rather than copying their text:

```ts
type CanonicalApplicationWritingVariantV1 = Readonly<{
  family: 'application_writing'
  writingTaskId: string

  // Complete source-backed task wording in display order. Standard part and
  // section headings remain Profile/Plan instructions.
  promptBlockRefs: readonly string[]

  situation: Readonly<{
    writerRole: CanonicalContentRefV1
    audienceOrDestination: CanonicalContentRefV1
    deliverable: CanonicalContentRefV1
    communicativePurpose: CanonicalContentRefV1
  }>

  contentRequirements: readonly Readonly<{
    requirementId: string
    contentRef: CanonicalContentRefV1
  }>[]

  wordCountRuling: Readonly<{
    kind: 'approximate_target'
    target: number
    countScope: 'student_authored_only'
    sourceRef: CanonicalContentRefV1
  }>

  givenSkeleton: CanonicalApplicationGivenSkeletonV1

  choices: Readonly<{ ownership: 'none' }>
  response: Readonly<{
    kind: 'group_level_written_response'
    answerRegionRef: 'writing.application-box'
  }>
}>

type CanonicalContentRefV1 = Readonly<{
  blockId: string
  inlineNodeIds: readonly string[]
}>

type CanonicalApplicationGivenSkeletonV1 =
  | Readonly<{
      presence: 'none'
      // A provenance-bearing assertion that the captured source answer region
      // contains no fixed student-visible text.
      answerRegionAbsenceAssertionRef: string
    }>
  | Readonly<{
      presence: 'provided'
      parts: readonly CanonicalApplicationGivenPartV1[]
    }>

type CanonicalApplicationGivenPartV1 = Readonly<{
  givenPartId: string
  role: 'title' | 'salutation' | 'opening' | 'closing' | 'signature'
  placement: 'answer_region_top' | 'answer_region_bottom'
  // Exactly one paragraph block from the shared content document.
  blockRef: string
  authorityAssertionRef: string
}>
```

`promptBlockRefs` is the complete prompt display stream. Situation and
requirement fields are semantic views over that same content, not a second
copy. Given parts also point into the shared content, but are omitted from the
prompt stream and projected inside the Plan-bound answer region. A source line
therefore renders once even when a legacy asset duplicated it under
`instruction` and group passage.

The family validator enforces these invariants together:

1. The shared Group has zero Questions, zero Blanks, and exactly one
   `writingTaskId`.
2. `promptBlockRefs` is non-empty, ordered, unique, and covers all task wording
   after excluding only Profile/Plan instructions and provided given parts.
3. The writer role, audience/destination, deliverable, communicative purpose,
   every ordered requirement, and the word-count ruling resolve to
   source-mapped content ranges inside the complete prompt.
4. V1 accepts only the currently evidenced `approximate_target` ruling. All 24
   current Application groups say approximately 80 words. A default 80 with no
   source ruling is forbidden.
5. `countScope: student_authored_only` means all provided given parts are
   excluded from the student's count. Generation-workflow accepted/recommended
   bands are not paper semantics and do not enter this field.
6. A provided skeleton contains one or more unique parts in the fixed role
   order `title → salutation → opening → closing → signature`. A role may
   repeat when the source supplies several fixed paragraphs, but order may not
   reverse.
7. `title | salutation | opening` project to `answer_region_top`;
   `closing | signature` project to `answer_region_bottom`.
8. `presence: none` is affirmative source closure, not the absence of a parsed
   field. Email, letter, article, report, or speech form never implies fixed
   text.
9. Every prompt block, semantic ref, requirement, given part, word-count
   ruling, response region, and Writing Task identity has exact shared
   Source-Map coverage. Accepted exact deduplication cites a Transformation
   Record.
10. Model Answer, official reference answer, ReviewCard, Highlight Expression,
    Writing Analysis, generator audit, and student-answer content are rejected
    as unknown canonical fields.

This keeps one deep Module seam. The canonical compiler owns source-dialect
interpretation, role assignment, exact deduplication, completeness, and
fail-closed diagnostics. Screen, Print/PDF, DOCX, the reviewed model-answer
workflow, and Analysis adapters consume one validated projection; none parses
`Dear`, `Yours`, a title-looking line, or a group-passage letter at runtime.

## Complete prompt and semantic roles

The prompt is paper content, while its structured semantic views prevent
Analysis from becoming the only place that knows the task:

- `writerRole` says who the source asks to write;
- `audienceOrDestination` says who or which publication/event receives it;
- `deliverable` says what response form the source requires;
- `communicativePurpose` says what the response must accomplish;
- `contentRequirements` preserves the source's ordered required points;
- `wordCountRuling` preserves the source's actual approximate target and its
  student-authored counting scope.

These are not ReviewCard fields. A ReviewCard may later explain the task to a
teacher, but it joins as Analysis and cannot create, repair, reorder, or
override any canonical role or requirement.

Source language may express several roles in one sentence. The compiler
segments that sentence into source-mapped inline nodes or uses one range for
several semantic refs; it does not rewrite the prompt to force one paragraph
per field. If a role has more than one reasonable interpretation,
compilation stops at `needs_review`.

## Given-skeleton ruling

An **Application Given Skeleton** is only fixed, source-provided response text.
Its role is explicit because the same English line can otherwise mean
background material, a quoted message to reply to, an example, or text the
student must preserve.

Accepted evidence is one of:

1. a structured Source Capture observation whose document role identifies
   fixed answer-region text; or
2. exact source layout/semantics establishing that the line is inside the
   application answer region and must remain in the student's response.

A legacy `applicationGiven` object or title string is a migration lead, not
authority by itself. It must still resolve to Source Spans. Conversely, a
source-closed task may legitimately compile with `presence: none` even when
the required deliverable is an email.

The reviewed `applicationWritingWorkflow.mjs` remains useful evidence for the
compiler adapter:

- structured `{top,bottom}` and the legacy title string are recognized leads;
- instruction and group-passage evidence are inspected separately and retain
  source order;
- an English opening or complete group-passage letter without affirmative
  skeleton evidence fails closed;
- descriptive or negated wording is not authorization to preserve a format.

That runtime reconstruction is not the canonical contract. Its current
`SPEC CONTRADICTS` outcome maps to a compiler diagnostic; no inferred skeleton
is published and no precise student word count is reported until canonical
evidence is ready.

## Fail-closed matrix

| Evidence/candidate condition | Disposition or gate result |
| --- | --- |
| Prompt, required situation role, required content point, word-count ruling, answer-region observation, or required Source Span is missing | `incomplete_source` |
| Complete English letter/opening appears in group passage but the source does not establish that it is fixed response text | `needs_review` |
| Two source locations disagree on prompt/given boundary, role, order, content point, or word-count ruling | `needs_review` |
| Exact duplicated instruction/passage content has closed equal source spans | Accept one canonical node plus exact Transformation Record and map it to all supporting spans |
| Task form is email/letter but source closure proves no fixed answer-region text | `ready` with `givenSkeleton.presence: none`; do not fabricate salutation or signature |
| Given format is clear but requires a v1-unrepresentable layout or role | `unsupported` |
| Candidate has empty/duplicate ids, bad role order, top/bottom role mismatch, uncovered refs, Questions/Blanks, options, or unknown fields | Family conformance rejects the candidate; no canonical Group exists |
| Model Answer, official reference answer, ReviewCard, Highlight Expression, audit, or student answer enters the candidate | Family conformance rejects the candidate |
| Official/model answer disagrees with the prompt or one another | Canonical Application Group remains unchanged; the relevant supplement is stale/blocked |
| Legacy consumer reconstructs any skeleton or word-count scope after canonical selection | Projection conformance fails; publish/rollout cannot pass |

`answer_conflict` is not an Application Writing family outcome because no
official reference response is the student's canonical answer. Conflicting
reference answers belong to supplement provenance and review.

## One projection and answer-region parity

The shared projector emits one semantic occurrence:

```ts
type ProjectedApplicationWritingOccurrenceV1 = Readonly<{
  groupId: string
  writingTaskId: string
  prompt: RichContentDocumentV1
  situation: CanonicalApplicationWritingVariantV1['situation']
  contentRequirements:
    CanonicalApplicationWritingVariantV1['contentRequirements']
  wordCountRuling:
    CanonicalApplicationWritingVariantV1['wordCountRuling']
  answerRegion: Readonly<{
    answerRegionRef: 'writing.application-box'
    responseSlotId: string
    givenTop: readonly CanonicalApplicationGivenPartV1[]
    givenBottom: readonly CanonicalApplicationGivenPartV1[]
  }>
  anchors: Readonly<{
    contentNodeIds: readonly string[]
    requirementIds: readonly string[]
    givenPartIds: readonly string[]
    responseSlotId: string
  }>
}>
```

All surfaces share one signature over ordered prompt/content ids, situation
refs, ordered requirement ids, the full word-count ruling, answer-region ref,
response-slot id, and ordered given-part ids/roles/placements.

| Surface | Required proof |
| --- | --- |
| writing Screen / PaperSurface | Complete prompt appears once; one answer region contains every `givenTop` part before the student slot and every `givenBottom` part after it; title-only and no-skeleton tasks remain distinct; all semantic ids resolve without text parsing |
| Print HTML | One application occurrence and one Plan-bound answer box; prompt and fixed parts each occur exactly once; top/bottom ordering matches the canonical occurrence |
| PDF | Actual PDF text/geometry inspection proves the same prompt order, fixed-part occurrence counts, and top/body/bottom answer-region order; pagination cannot duplicate or detach a given part |
| DOCX | OOXML inspection proves one answer-region table/frame with the same top/body/bottom order and one occurrence of every given part; LibreOffice/PDF conversion is secondary visual evidence |

Student and teacher versions share this paper occurrence. A teacher surface
may add reviewed Analysis or an official/model reference answer outside the
canonical response region, but that supplement cannot change the occurrence
signature.

The current legacy paths are negative proofs:

- `paper-2026-i` stores the given title as a legacy string. Screen assumes an
  object with `top/bottom`, while API detail, Print/PDF, and DOCX omit the
  application given field, so all four lose the title relative to source.
- `paper-960d0f8d` lets Screen derive two top and two bottom paragraphs from
  group passage text. API detail emits only task type and continuation
  starters, so Print/PDF and DOCX render an empty application box. Screen and
  export no longer share semantics.

The canonical occurrence removes both runtime branches.

## Two contrasting real proof groups

No prompt, given line, model answer, official answer, ReviewCard, or student
data is copied into this artifact. Proofs retain only ids, hashes, source
positions/roles, and structural counts.

### Title-only proof

`paper-2026-i / group-2026-i-writing-application`, source PDF physical page
10:

- question PDF:
  `sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f`,
  11 A4 pages;
- current `paper-asset-v1`:
  `sha256:fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf`;
- answer PDF:
  `sha256:2e4982f8d33e8a8787f270b7cf4fd3cd432fb9dce8d5732876fae149a1c78fc6`,
  supplement evidence only;
- zero Questions and zero Blanks;
- one prompt paragraph, an approximate 80-word ruling, and one provided
  `title` part at `answer_region_top`;
- no salutation, opening, closing, or signature;
- no current `writing-analysis-v1.json`, proving Analysis independence.

### Split letter-skeleton proof

`paper-960d0f8d / group-960d0f8d-writing-application`:

- question DOCX:
  `sha256:960d0f8d6fddc3e6ccff22a15c9044170cb58f59a8b62f9870cf522df8cde25b`;
- current `paper-asset-v1`:
  `sha256:2578eb70e069c6d39a6d92bbc5254a8c23ed08b152287c2c80167d2121df2a14`;
- answer DOCX:
  `sha256:cb59414336068de60c9949ee05e36182775e16d2930ec864975dcfd514bd402a`,
  official-reference supplement evidence only;
- zero Questions and zero Blanks;
- eight current prompt/passage paragraphs and an approximate 80-word ruling;
- two provided top parts (`salutation`, `opening`) and two bottom parts
  (`closing`, `signature`), each a distinct source DOCX paragraph;
- current asset has no structured `applicationGiven`; exact duplicated
  instruction/passage content must compile once with complete provenance;
- approved Analysis contains Model Answer, official reference answer, and
  ReviewCard, none of which enters canonical semantics.

The title proof exercises a non-letter answer region with one fixed top line.
The letter proof exercises both answer-region edges and exact student-word
count subtraction across four fixed parts.

## Prototype result

The throwaway logic prototype command:

```bash
node .scratch/wayfinder-10-application-writing-canonical-variant/tui.mjs --all
```

reported `PASS 18 / FAIL 0`. It compiled both real proof shapes and a
source-proven no-skeleton email, produced identical semantic signatures for
Screen, Print HTML, PDF, and DOCX, and rejected:

- ambiguous group-passage letters;
- opening-only unstructured candidates;
- genre-only skeleton inference;
- missing requirements or word-count evidence;
- conflicting word-count rulings;
- invalid given-part order;
- Model Answer, official reference answer, and ReviewCard intrusion.

It also reproduced the legacy title-loss and letter cross-surface mismatch.
Prototype digests are diagnostic only; production digests remain owned by the
canonical compiler. The throwaway code was deleted after this answer was
captured.

## New-import hard gate

Once the Application Writing vertical slice is enabled for new imports:

1. `compileCanonicalPaper(request)` must return whole-paper
   `disposition: ready` with a complete compatible Profile, Plan, Application
   Group, Source Map, Normalization Report, source fingerprint, and semantic
   digests.
2. Family conformance must prove zero Questions/Blanks, complete prompt and
   semantic roles, at least one ordered content requirement, a source-backed
   word-count ruling, a closed given-skeleton presence decision, exclusive
   no-choice ownership, and the Plan-bound application response region.
3. The shared projector and every enabled renderer must pass occurrence,
   anchor, and answer-region parity with no legacy reconstruction.
4. Any `needs_review`, `unsupported`, `incomplete_source`, invalid candidate,
   incompatible package, or projection failure is zero-write for paper
   publication.
5. New imports may not fall back to legacy `applicationGiven`, English-line
   regexes, title heuristics, group-passage inference, or default word counts.
6. Writing Analysis completeness remains outside canonical admission.

Atomic sidecar write/swap, retry, and consumer-selector mechanics stay with
the dedicated publication ticket.

## Historical compatibility before legacy retirement

The legacy Application interpretation may retire only after:

1. Recompute the actual `latest` corpus by bytes: 24 active Application
   Groups, all with zero Questions and an 80-word target; 23 currently lack
   `applicationGiven`, one stores a legacy title string, and the current
   Screen heuristic recognizes a letter-like scaffold in only 7.
2. Treat those field/regex counts as migration hazards, not semantic truth.
   Bind every candidate to original Source Capture and distinguish a
   source-proven no-skeleton task from lost or ambiguous fixed text.
3. Resolve known split/contamination cases, including fixed text joined to an
   instruction paragraph and combined closing/signature lines, through source
   evidence and exact Transformation Records rather than broad cleanup regexes.
4. Compile all 24 Groups to `ready` or retain each unresolved Group explicitly
   blocked; no partially reconstructed skeleton counts as migrated coverage.
5. Run both exact proof groups through real-click Screen, actual Print HTML and
   PDF, and actual DOCX/OOXML. Each must preserve one complete prompt, one
   response region, and the same fixed-part occurrence/order signature.
6. Keep historical fallback whole-family and explicit until coverage is
   complete: one consumer occurrence receives either one compatible canonical
   Application projection or the whole legacy path, never canonical prompt
   plus legacy skeleton/answer box.
7. Remove Screen extraction, API omission workarounds, export title/type
   heuristics, and model-answer workflow reconstruction only after all 24
   `latest` Groups, required independent review, full suite, owner QA, and
   release closeout pass. Historical `versions/vN` remain outside the first
   migration scope.

Later publication, rollout, and migration tickets own exact sequencing,
atomicity, browser provisioning, suite commands, review lineage, and deletion.
This ticket supplies only the Application family acceptance contract.
