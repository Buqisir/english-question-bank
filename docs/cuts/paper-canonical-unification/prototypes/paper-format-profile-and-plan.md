# Paper Format Profile / Canonical Paper Plan prototype

## Question and evidence

This logic prototype asks whether one versioned profile/plan contract can
represent NCK1, Zhejiang legacy, and national legacy without turning one real
historical format into another, and without leaking passages, answers,
Analysis, source dialect, typography, physical dimensions, or pagination into
whole-paper assembly.

The current 33-paper census provides three structural proof classes:

- 18 NCK1-shaped papers: 9 active groups
  (`reading×4 + seven + cloze + grammar + writing×2`);
- 6 Zhejiang legacy papers: 8 active groups
  (`reading×3 + seven + cloze + grammar + writing×2`);
- 9 national legacy papers: 7 active groups
  (`reading×4 + seven + cloze + grammar`) and no active writing group.

The representative plans below use `paper-2026-i`,
`paper-zj-2020-jan`, and `paper-2020-jia`. Only ids, roles, counts,
number ranges, scores, and semantic shapes are used; no passage, option,
answer, writing, or listening text is copied.

The prototype also exercises synthetic boundary fixtures for optional omission
and exact renumbering. They are explicitly synthetic because the census is not
evidence that any current v1 profile has an optional active group slot or a
real source-number deviation.

## Decision

Use two orthogonal slot axes:

- `presence: required | optional` says whether source completeness requires
  the slot;
- `activation: canonical_group | inactive_source` says whether the slot links
  a Canonical Question Group or only preserves source evidence in this
  initiative.

`inactive_source` is not a weak or partial Canonical Question Group. It can
never carry `groupRef`, it never reaches Screen/Print/PDF/DOCX, and a required
inactive slot still needs a closed source slice. This represents listening in
all three profiles and the unsupported legacy writing sections in the national
legacy profile without inventing website Question Groups.

The three current v1 profiles intentionally declare no optional slots.
`optional` remains part of the contract because the ticket requires its exact
semantics: omission is legal only when an exact profile version declares it,
and the Plan must record that omission. A producer may not reinterpret a
missing required slot as optional.

## Paper Format Profile v1

A Paper Format Profile owns every reusable fact that defines one legitimate
paper family:

```ts
type PaperFormatProfileV1 = Readonly<{
  schemaVersion: 'paper-format-profile-v1'
  profileId: 'nck1' | 'zhejiang-legacy' | 'national-legacy'
  version: string
  title: string
  totalScore: number
  parts: readonly ProfilePart[]
  instructions: Readonly<Record<InstructionId, StandardInstruction>>
  answerRegions: Readonly<Record<AnswerRegionId, AnswerRegionRule>>
  completeness: Readonly<{
    requireEveryRequiredSlot: true
    allowOptionalOmission: true
    requireInactiveSourceClosure: true
    rejectUnexpectedSlots: true
  }>
}>

type ProfilePart = Readonly<{
  partId: string
  ordinal: number
  titleInstructionRef: InstructionId
  score: number
  sections: readonly ProfileSection[]
}>

type ProfileSection = Readonly<{
  sectionId: string
  ordinal: number
  titleInstructionRef: InstructionId
  score: number
  slots: readonly ProfileSlot[]
}>

type ProfileSlot =
  | Readonly<{
      slotId: string
      presence: 'required' | 'optional'
      activation: 'canonical_group'
      familyContractRef: Readonly<{ id: string; version: string }>
      groupCardinality: 1
      questionCardinality: Readonly<
        | { kind: 'exact'; count: number }
        | { kind: 'family_contract' }
      >
      numberingRule: Readonly<
        | { kind: 'range'; start: number; end: number }
        | { kind: 'none' }
      >
      scoringRule: Readonly<
        | { kind: 'per_question'; points: number; total: number }
        | { kind: 'group_total'; total: number }
      >
      instructionRefs: readonly InstructionId[]
      answerRegionRef: AnswerRegionId
    }>
  | Readonly<{
      slotId: string
      presence: 'required' | 'optional'
      activation: 'inactive_source'
      sourceRole: string
      numberingRule: Readonly<
        | { kind: 'range'; start: number; end: number }
        | { kind: 'source_observed' }
        | { kind: 'none' }
      >
      scoringRule: Readonly<
        | { kind: 'per_question'; points: number; total: number }
        | { kind: 'group_total'; total: number }
      >
      instructionRefs: readonly InstructionId[]
      answerRegionRef: AnswerRegionId
      renderPolicy: 'suppress'
      groupRef?: never
    }>
```

The ordered `parts → sections → slots` tree is the only semantic assembly
order. `layoutTree`, renderer blocks, CSS order, DOCX paragraph order, and
database row order cannot become parallel paper authorities.

### Standard instructions

The profile stores exact part headings, section headings, task instructions,
and answer-region notices as versioned catalog entries:

```ts
type StandardInstruction = Readonly<{
  instructionId: string
  placement:
    | 'part_heading'
    | 'section_heading'
    | 'before_slot'
    | 'after_slot'
  text: string
}>
```

A Plan and renderer refer to catalog ids; they never copy or edit instruction
text. Changing punctuation, score wording, or the instruction itself creates a
new profile version. Source wording that differs from the selected profile is
preserved in Source Capture and may be normalized only through an exact
Transformation Record.

### Semantic answer regions

The profile owns the presence and binding of answer regions, not their visual
geometry:

| Region id | Semantic rule |
| --- | --- |
| `objective.answer-card` | one selected option label per numbered Question |
| `short-answer.answer-card` | one written answer per numbered Question |
| `writing.application-box` | one group-level response region; no answer or Analysis content |
| `writing.continuation-box` | one group-level response region; canonical starters come from the linked continuation Group |
| `inactive.source-only` | preserve the source-backed region; emit no renderer node in this initiative |

Fonts, point sizes, margins, box dimensions, tab stops, pagination, and the
A–D layout selector remain exclusively in Renderer Typography.

## Exact current profile shapes

All slots below have `presence: required`. Active rows have
`activation: canonical_group`; `inactive` rows have
`activation: inactive_source` and `renderPolicy: suppress`.

### NCK1 v1

| Part / section | Slot | State | Numbers | Score | Family / source role |
| --- | --- | --- | --- | --- | --- |
| Listening / short dialogue | `listening.short-dialogue` | inactive | 1–5 | 1.5×5 = 7.5 | `listening_questions_1_5` |
| Listening / long form | `listening.long-form` | inactive | 6–20 | 1.5×15 = 22.5 | `listening_questions_6_20` |
| Reading / choice | `reading.a` | active | 21–23 | 2.5×3 = 7.5 | `reading@v1` |
| Reading / choice | `reading.b` | active | 24–27 | 2.5×4 = 10 | `reading@v1` |
| Reading / choice | `reading.c` | active | 28–31 | 2.5×4 = 10 | `reading@v1` |
| Reading / choice | `reading.d` | active | 32–35 | 2.5×4 = 10 | `reading@v1` |
| Reading / Seven Choices | `reading.seven-choices` | active | 36–40 | 2.5×5 = 12.5 | `seven-choices@v1` |
| Language / cloze | `language.cloze` | active | 41–55 | 1×15 = 15 | `cloze@v1` |
| Language / grammar fill | `language.grammar-fill` | active | 56–65 | 1.5×10 = 15 | `grammar-fill@v1` |
| Writing / application | `writing.application` | active | none | 15 | `application-writing@v1` |
| Writing / continuation | `writing.continuation` | active | none | 25 | `continuation-writing@v1` |

Part totals are 30 / 50 / 30 / 40; paper total is 150.

### Zhejiang legacy v1

| Part / section | Slot | State | Numbers | Score | Family / source role |
| --- | --- | --- | --- | --- | --- |
| Listening / short dialogue | `listening.short-dialogue` | inactive | 1–5 | 1.5×5 = 7.5 | `listening_questions_1_5` |
| Listening / long form | `listening.long-form` | inactive | 6–20 | 1.5×15 = 22.5 | `listening_questions_6_20` |
| Reading / choice | `reading.a` | active | 21–23 | 2.5×3 = 7.5 | `reading@v1` |
| Reading / choice | `reading.b` | active | 24–26 | 2.5×3 = 7.5 | `reading@v1` |
| Reading / choice | `reading.c` | active | 27–30 | 2.5×4 = 10 | `reading@v1` |
| Reading / Seven Choices | `reading.seven-choices` | active | 31–35 | 2×5 = 10 | `seven-choices@v1` |
| Language / cloze | `language.cloze` | active | 36–55 | 1.5×20 = 30 | `cloze@v1` |
| Language / grammar fill | `language.grammar-fill` | active | 56–65 | 1.5×10 = 15 | `grammar-fill@v1` |
| Writing / application | `writing.application` | active | none | 15 | `application-writing@v1` |
| Writing / continuation | `writing.continuation` | active | none | 25 | `continuation-writing@v1` |

Part totals are 30 / 35 / 45 / 40; paper total is 150. A missing Reading D is
therefore not an optional omission; `reading.d` does not exist in this profile.
Continuation-starter cardinality belongs to the continuation family contract,
not to the Profile or Plan.

### National legacy v1

| Part / section | Slot | State | Numbers | Score | Family / source role |
| --- | --- | --- | --- | --- | --- |
| Listening / short dialogue | `listening.short-dialogue` | inactive | 1–5 | 1.5×5 = 7.5 | `listening_questions_1_5` |
| Listening / long form | `listening.long-form` | inactive | 6–20 | 1.5×15 = 22.5 | `listening_questions_6_20` |
| Reading / choice | `reading.a` | active | 21–23 | 2×3 = 6 | `reading@v1` |
| Reading / choice | `reading.b` | active | 24–27 | 2×4 = 8 | `reading@v1` |
| Reading / choice | `reading.c` | active | 28–31 | 2×4 = 8 | `reading@v1` |
| Reading / choice | `reading.d` | active | 32–35 | 2×4 = 8 | `reading@v1` |
| Reading / Seven Choices | `reading.seven-choices` | active | 36–40 | 2×5 = 10 | `seven-choices@v1` |
| Language / cloze | `language.cloze` | active | 41–60 | 1.5×20 = 30 | `cloze@v1` |
| Language / grammar fill | `language.grammar-fill` | active | 61–70 | 1.5×10 = 15 | `grammar-fill@v1` |
| Writing / correction | `writing.short-error-correction` | inactive | source-observed | 10 | `legacy_short_error_correction` |
| Writing / composition | `writing.guided-writing` | inactive | none | 25 | `legacy_guided_writing` |

Part totals are 30 / 40 / 45 / 35; paper total is 150. The last two slots
preserve real paper structure and evidence without fabricating application or
continuation Groups. A current `latest` asset with seven active groups is
therefore expected, but a new compilation still needs closed source evidence
for the required inactive slots before it can be `ready`.

## Canonical Paper Plan v1

A Plan contains only per-paper instantiation facts:

```ts
type CanonicalPaperPlanV1 = Readonly<{
  schemaVersion: 'canonical-paper-plan-v1'
  planId: string
  paperId: string
  authorityRef: Readonly<{
    manifestId: string
    manifestVersion: string
    manifestDigest: `sha256:${string}`
  }>
  profileRef: Readonly<{
    profileId: string
    profileVersion: string
    profileDigest: `sha256:${string}`
  }>
  slotBindings: readonly SlotBinding[]
  numberingAssignments: readonly Readonly<{
    slotId: string
    groupId: string
    questionId: string
    sourceNumberSpan: SourceSpanRef
    canonicalNumber: number
    transformationRecordId?: string
  }>[]
  sourceConformance: Readonly<{
    status: 'direct' | 'exact_deviations_applied'
    transformationRecordIds: readonly string[]
  }>
  completeness: Readonly<{
    status: 'complete'
    optionalOmissions: readonly string[]
  }>
}>

type SlotBinding =
  | Readonly<{
      slotId: string
      state: 'bound'
      groupRef: Readonly<{ groupId: string }>
    }>
  | Readonly<{
      slotId: string
      state: 'inactive'
      sourceSliceRefs: readonly SourceSpanRef[]
      groupRef?: never
    }>
  | Readonly<{
      slotId: string
      state: 'omitted'
      groupRef?: never
    }>
```

The Plan does not copy profile headings, scores, instruction text, answer
region rules, or family content. Its exact `profileRef` fixes those reusable
facts; its ordered bindings, source-anchor-to-canonical numbering assignments,
and explicit optional omissions fix this paper.

Every `bound` slot links exactly one Canonical Question Group by stable
`groupId`. Semantic conformance proves that the Group's family-contract
reference matches the Profile slot and that every Group appears in exactly one
active slot. Group payload, Passage, Question, Option, answer, Writing Task,
and rich content remain in Canonical Question Groups, never in the Plan.

Detailed source `before/after`, rule identity, proof, and spans remain in the
Normalization Report's Transformation Records. The Plan carries only the
record ids needed to explain accepted source-to-profile deviations; it does
not duplicate the ledger.

### Representative plans

| Paper | Profile | Bound groups | Inactive source slots | Numbering | Completeness |
| --- | --- | ---: | ---: | --- | --- |
| `paper-2026-i` | `nck1@v1` | 9 | 2 listening | 21–65 direct | complete |
| `paper-zj-2020-jan` | `zhejiang-legacy@v1` | 8 | 2 listening | 21–65 direct | complete |
| `paper-2020-jia` | `national-legacy@v1` | 7 | 2 listening + 2 legacy writing | 21–70 direct | complete |

These are shape prototypes, not claims that every existing `latest` directory
already contains the required inactive source slices. Compilation starts from
the immutable Source Capture, not from today's lossy active-group projection.

## Completeness and fail-closed behavior

`CanonicalPaperPlanV1` permits only `completeness.status: complete`. An
incomplete candidate is compiler-internal evidence, not a publishable Plan.
This preserves the whole-paper discriminated union selected by the canonical
compilation Module:

| Condition | Result | Canonical Plan exposed? |
| --- | --- | --- |
| every required active slot has one conforming Group; every required inactive slot has a closed source slice; optional omissions are explicit | `ready` | yes, with `complete` |
| required active Group missing or required inactive source slice missing/damaged | `incomplete_source` | no |
| two plausible profile/slot/numbering interpretations or an unledgered semantic deviation | `needs_review` | no |
| evidence is complete but the Profile/family contract cannot represent it | `unsupported` | no |
| authoritative answer assertions conflict | `answer_conflict` | no |

An exact source deviation can become `ready` only when a registered rule
produces a Transformation Record. The TUI proved a synthetic `1–3 → 21–23`
renumbering succeeds with three record ids and fails as `needs_review` without
them. Source score or instruction differences follow the same rule. A renderer
never sees, approves, or repairs a deviation.

## One renderer consumption seam

Select one renderer-neutral projection Module:

```ts
declare function projectCanonicalPaper(
  canonicalPackage: Readonly<{
    plan: CanonicalPaperPlanV1
    groups: readonly CanonicalQuestionGroup[]
    authorityClosure: ExactCanonicalAuthorityClosure
  }>,
): RendererNeutralPaper
```

Its implementation validates the exact manifest/profile closure, walks the
Profile's one ordered part/section/slot tree, applies the Plan bindings and
number assignments, dereferences standardized instruction and answer-region
ids, verifies Group-family/cardinality compatibility, omits optional and
inactive slots, and returns one semantic stream:

```ts
type RendererNeutralPaper = Readonly<{
  paperId: string
  nodes: readonly (
    | { kind: 'part'; partId: string; instructionId: string }
    | { kind: 'section'; sectionId: string; instructionId: string }
    | { kind: 'instruction'; instructionId: string; text: string }
    | {
        kind: 'group'
        slotId: string
        groupId: string
        numbering: readonly { questionId: string; number: number }[]
        scoringRuleRef: string
      }
    | { kind: 'answer_region'; answerRegionId: string; groupId: string }
  )[]
}>
```

Screen, Print/PDF, and DOCX are three Adapters at one real renderer seam. They
all consume this same semantic stream and the linked Canonical Question Groups.
They may differ only in Renderer Typography and surface-level presentation.
They may not:

- read Source Capture or source-format markers;
- infer a profile from cloze/reading counts;
- renumber from array position;
- recompute scores or headings;
- duplicate a shared option bank;
- activate an inactive slot;
- manufacture an answer region;
- fall back to `layoutTree`, `content.blocks`, DB projection, or legacy source
  when canonical projection fails.

This is a deep Module by the deletion test: removing it would force profile
resolution, order, instructions, numbering, scoring, answer-region binding,
inactive-slot suppression, and conformance checks back into every renderer.

Rejected shapes:

- **Self-contained Plan that copies the whole Profile**: easy for renderers,
  but creates a second owner for headings, scores, instructions, and answer
  regions.
- **Renderer resolves Profile and Plan independently**: repeats the current
  shallow ownership problem across Screen, Print/PDF, and DOCX.
- **Plan stores renderer blocks or layout nodes**: moves typography, physical
  layout, and pagination into canonical semantics.

## Prototype result

The throwaway TUI drove eight cases through a pure profile-instantiation
function:

| Case | Result |
| --- | --- |
| NCK1, Zhejiang legacy, national legacy complete shapes | `ready`; Plan status `complete` |
| synthetic optional active slot omitted | `ready`; omission listed in Plan |
| synthetic exact renumbering with Transformation Records | `ready`; `exact_deviations_applied` |
| required active slot missing | `incomplete_source`; no Plan |
| required inactive source missing | `incomplete_source`; no Plan |
| unledgered renumbering | `needs_review`; no Plan |

The TUI was throwaway and is not part of the durable contract. This file is the
answer retained from the prototype.

No domain glossary change is required. The decision uses the existing Paper
Format Profile, Canonical Paper Plan, Canonical Question Group, Source Capture,
Source Span, Transformation Record, and Normalization Report meanings. No Fog
graduates and no new ticket is needed; the existing family-envelope and
listening tickets own the field-level Group and inactive-listening details.
