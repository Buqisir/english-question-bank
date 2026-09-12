# Complete analyzed package intake

Status: Implementation authorized by Owner (「开工，加油💪」); in progress.
This status supersedes the earlier paused/read-only wording retained below as
discussion history. Design decisions remain binding; no production deletion,
publication, deployment or Ship is authorized by implementation approval.

## Implementation progress

Baseline advanced to the shipped PR426 `origin/main`; existing partial package
and OPS work remains in place, but is not a complete v1 implementation.

- First slice: remove the three objective-family `teachingNote` generation
  requirements and validation gates; stop projecting it into the active surface
  adapters and teacher-print explanation joins. Historical source files remain
  unchanged. Seven-choices generic explanation now uses `fitSummary`.
- Shared teaching doctrine stops requesting separate notes and selected-expression
  lists; original reasoning, classification, evidence and answer checks remain.
- Grammar personal `path` and static `framework` are removed from generation
  requirements and active surface projection/display; the obsolete framework
  tables and styles are removed. The 22 facet keys/labels, syntactic role,
  `similarityProfile.route` and server-derived answer forms remain unchanged.
- Package transport's correction fixture now reuses the already-created Review
  schema and supplies its required timestamps; no production DB was changed.
- Normalized export now requires one caller-selected sealed revision ID, validates
  every DB-sealed file and rebuilt projection, and emits the same accepted v1
  package for native readback or representable current raw Review. Native packages
  need no original documents; raw conversion uses real content/answers/media/audio
  and explicit external-transcription provenance. ZIP output is rechecked by the
  real archive admission checker. Semantic comparison separates internal
  sourceAssetVersion renumbering from retained-content/resource differences.
- A producer-kit command now freezes the exact package/analysis/annotation schemas,
  raw Sol prompts, runtime/type contracts, shared style and complete topic taxonomy.
  The pinned objective Sol tool receives the full teaching-content schema annex,
  not its name alone.
- Still outstanding: a real Owner-paper producer/export/reimport pilot, Owner QA,
  final all-pack and independent final review/gates. No production paper was read,
  changed, approved, published or deployed by this slice.

### Current introduction/topic persistence contract

- `groups[groupId].overview` remains the canonical introduction name for reading,
  seven choices, cloze and grammar fill. New raw generation uses a 50–80 Chinese
  character soft target; cloze narratives include meaningful event progression.
  Teaching sidecars and `importMeta.groups[groupId].summary` reuse that exact text,
  and publication writes it to `passages.summary`, which is what question-group
  list/search reads. Paragraph summaries/functions and discourse-structure
  summaries remain separate fields. Cloze no longer generates a second
  `similaritySummary`; `affectiveArc` is emitted only when the source truly has
  an independent emotional change.
- External analyzed-package conversion uses the same sidecars to build
  `importMeta.groups`. A package that carries both legacy `similaritySummary` and
  `overview` is accepted only when their trimmed values agree; conflicting values
  fail with `ANALYZED_PACKAGE_INTRODUCTION_CONFLICT` at the legacy field path so
  conversion never silently chooses. Historical published files are not rewritten.
- Listening keeps ten immutable material records in
  `analyses/listening-analysis-v1.json`. Each record has one linked
  `theme/themeGroup/subtopic` triple and one 20–40-character-soft-target
  `summaryZh`; the read projection exposes the same string as both `summaryZh`
  and `similarityText`, without adding a ranking algorithm.
- The authenticated read API is
  `GET /api/papers/:paperId/listening-materials`, with optional exact `theme`,
  `themeGroup`, and `subtopic` query filters. It resolves
  `canonical_paper_publications.is_current` and then reads that immutable version,
  never a draft or an unbound `latest` directory. It returns publication identity
  plus material IDs, question IDs, the linked topic triple and shared summary; it
  deliberately excludes transcript/answer teaching content. Legacy publications
  without the listening sidecar return 404. Existing
  `question_group_topic_labels` and similar-question ranking are unchanged.
- Publication still updates compatibility DB rows in its transaction. Rollback
  now reloads the selected immutable version's paper/import metadata and analysis
  sidecars and re-upserts those rows before switching current/latest, so
  `passages.summary` and the current listening projection return the selected
  older version together. No new DB table or migration is required.

### Verification so far (not final v1 acceptance)

- PASS: seven-choice AI import (50 checks), cloze analysis (71), grammar analysis
  (138), cloze surface (51), grammar surface (55), grammar facet regression (68),
  shared teaching style, teacher-analysis joins (164), and seven-choice CLI/surface
  checks. These use local fixtures/stub providers, not a new Sol-generated pilot.
- PASS: source-intake correction/upload checks after fixing the fixture;
  Canonical Cloze/Grammar consumption after removing the retired note from its
  expected teacher supplement. Earlier failures were observed, not suppressed.
- `pnpm -C app verify:changed` selected `unknown-fallback` / `all`: initial run
  reported 173 PASS / 1 SKIP / 2 FAIL. Both failed checks were fixed and rerun
  individually; the complete final candidate has NOT received another all-pack
  run or independent final review. The SKIP is the unavailable external teaching
  dimension search fixture.
- PASS: app TypeScript build. Browser inspected the real grammar adapter + panel
  in an isolated temporary QA mount (non-finite, finite, empty, unpublished,
  evidence expanded/selected; desktop and narrow viewport). The temporary mount
  and its supervised service were removed/stopped. This is component verification,
  not complete Owner QA or Screen/Print/PDF pilot acceptance.
- PASS: actual sidecar → teacher explanation → print HTML preserved reasoning
  and hid a retired-note sentinel; student DOM hid answers/analysis. Inspected
  screenshots remain under `.amp/in/artifacts/`.

## Owner scope clarification: listening completeness is owned here

Owner explicitly requires this task to finish listening wherever the existing
system falls short of the agreed standard, not to defer it as another project's
problem. Background: [Listening PR3 thread](https://ampcode.com/threads/T-01a07a24-1ad6-7524-88d7-e6d1803aa255).
That thread reports a shipped audio/evidence/publication/playback/print foundation,
not listening teaching analysis. Current local `nck1AnalysisProjection.mjs` still
lists nine non-listening staged analyses and five sidecars, confirming this seam.

Required work includes ten-material identity/coverage, transcript translations,
stem/option translations, official-answer evidence and reasoning, necessary
distractor explanations, complete three-level topics and one-sentence summaries,
plus generation/package admission, persistence, Review, Paper teaching and companion
PDF consumption. Preserve the existing whole-paper player and private audio/ASR
evidence protections; do not leak transcripts/answers into student exam payloads.
No slicing, waveform or per-question audio jumping is required by this clarification.
Historical thread deployment and real-paper blockers are background reports, not
fresh production verification or authorization to resume that paper's import.

Current design delivery: [统一合同v1、外部提示词草案与pilot计划](./contract-v1-design.md).
It is not a live interface. Owner confirmed that complete packages need not attach
original PDF/DOCX files: complete questions, official answer transcriptions with
provenance, analyses and required resources suffice for admission and Owner Review.
Originals are optional comparison attachments, uploaded once with the package,
without restarting OCR or full analysis. This does not claim source-text fidelity
has been mechanically proven or silently remove audio safety gates. Implementation
remains paused.

Owner review inventory: [统一内容与解析字段表](./unified-field-matrix.md).
It separates confirmed requirements, current code/data evidence and remaining
decisions; it is not a frozen package or analysis schema.

Follow-up design: [一写两用教学解析补充蒸馏](./teaching-distillation-supplement.md).
Owner requested deeper distillation of the reference PDF and existing doctrine
before freezing the contract and confirmed the direction: shared question/source/
translation-range links, distinct answer-insertion and sentence-structure marks,
complete reasoning at both consumers, and separate pilot review of the first page.
Exact encoding, interactions and visual layout remain unfrozen; implementation
remains paused and prior field decisions remain valid.

## Owner-confirmed teaching-style baseline

Use `.agents/skills/importing-nck1-papers/reference/teaching-analysis-style-v1.md`
as the baseline for subsequent style work, excluding its retired `teachingNote`
and selected-expression requirements (including the writing 2–3-expression lists).
Keep the existing analysis direction, evidence, reasoning and question-family
boundaries. Distill only how to explain clearly, naturally and sufficiently;
do not replace the analysis system with the reference answer booklet's approach.
Annotation and PDF layout decisions are separate content-association/presentation
requirements, not permission to change reasoning under the name of style.

This records the Owner's design instruction. The live shared prompt still has
the old requirements; align it during the authorized implementation phase rather
than claiming that this note has changed the generation pipeline.

## Latest Owner confirmation: field review closure

The five closure decisions in the inventory's section 12 are now confirmed and
supersede earlier pending proposals in this note:

- Reading, seven choices, cloze and grammar fill reuse one content introduction
  across list and teaching, with a 50–80 Chinese-character soft target. Preserve
  paragraph summaries and article organization separately. Reuse the introduction
  for cloze similarity, including the meaningful event development, instead of
  generating a duplicate retrieval summary. Listening keeps its 20–40 target.
- Teaching pages and companion analysis PDFs deliver the agreed complete teaching
  content. Ordinary teacher papers may use short explanations; Owner Review must
  allow full content inspection without squeezing it into the exam pagination.
- Retire continuation `highlightExpressions` and legacy `continuationDesign`
  from new generation, package requirements and active display/export, not merely
  default visibility. Preserve historical files without bulk rewriting; compatibility
  reads must not revive the retired content. Keep the new continuation analysis.
- Each listening material has one main topic with all three linked levels:
  theme, theme group and subtopic. Do not reduce it to a top-level theme or discard
  ancestors, or interpret the levels as three independent topics. Encoding and
  similarity scoring remain subsequent design work.

Only design notes change; this confirmation does not resume implementation.

## Owner-confirmed scope: one content and analysis standard, two inputs

- The question-family decisions recorded here define the shared content and
  teaching-analysis standard, not a package-only standard. They apply both to
  EQB analysis generated from original papers and to externally analyzed packages.
- The original-paper path must generate against that standard; the complete-package
  path must admit and convert supplied content against the same standard without
  silently rerunning full analysis. Neither path bypasses Review or publication.
- Design the shared standard first, then the package transport/admission contract
  and the changes required in existing generation prompts and checks. Persistence,
  teacher-facing consumption and retrieval mappings need explicit acceptance;
  requiring a generated field alone is not evidence that it reaches a consumer.
- Earlier package-specific wording and nine-analysis deliverables below describe
  the earlier scope, not a frozen successor contract. Reconcile them with the
  listening teaching layer and shared standard before implementation.

## Owner-confirmed shared standard: four layers and field acceptance

Both input paths deliver the same four logical content layers. These are design
boundaries, not a decision to create four new storage objects or schemas.

1. Original questions: materials, paragraphs, stems, options, writing instructions,
   given text, images and audio. Preserve source meaning; AI analysis must not
   rewrite the original question content.
2. Official answers: objective answers and official reference compositions when
   supplied. Keep them distinct from generated content; never label an AI-written
   model composition as an official reference composition.
3. Teaching analysis: the translations, evidence, reasoning, passage analysis,
   writing guidance and generated compositions agreed for each question family.
   Preserve family-specific structures rather than forcing identical fields.
4. Classification and retrieval: topics, question skills, grammar facets and the
   agreed similarity inputs. Reuse existing semantic content instead of generating
   a duplicate introduction or story summary just for retrieval. For example, a
   listening material has one summary shared by teaching and similarity consumers.

For each field, the successor standard must specify:

- Presence: required, conditionally applicable or optional. A cloze emotional arc
  is applicable only when the passage actually has one; do not pad missing meaning.
- Content quality: explain what constitutes useful, accurate content. A nonempty
  reasoning field alone does not show how evidence leads to the answer.
- Persistence and consumers: identify how the field is saved and whether Review,
  teacher-facing teaching/PDF, search or similarity reads it. Not every field must
  appear on every surface; required consumers need explicit acceptance evidence.

Programmatic checks establish structural completeness and valid associations;
Owner Review assesses explanatory accuracy and usefulness. External packages do
not require a second full AI solution pass as admission. This records the agreed
design only; implementation and final field/schema freezing remain paused.

## Owner-confirmed supplement: reading summaries and organization

This supplements the existing reading analysis; it does not replace its other
fields or approve implementation. Owner confirmed both paragraph summaries and
article organization are wanted, then requested this decision be recorded.

- Reuse `groups[groupId].discourseStructure.paragraphs[].paragraphId` to bind
  each entry to an existing source paragraph. It is an identity, not an AI-created
  paragraph or a classification input.
- `paragraphs[].summary`: briefly describe what this paragraph says. Keep content
  summary separate from organizational judgments such as introducing what follows.
- `paragraphs[].function`: explain how this paragraph participates in the article's
  development and relates to relevant paragraphs. Say what it connects or advances;
  labels such as “承上启下” or “深化主题” alone are insufficient.
- `discourseStructure.summary`: describe the whole article's organization,
  identifying paragraphs that work together and how those parts connect. Do not
  repeat the overall content overview or force a fixed organizational template.
- Constrain the questions the AI must answer, not its conclusions. Allow parallel
  sections and several paragraphs serving one shared function; do not require a
  unique function for every paragraph or progression where the source has none.
- Do not add a fixed paragraph-function or article-structure label taxonomy at
  this stage. The purpose is teacher understanding, not a new classification system.
- These explanations are intended for teacher-facing use, not storage alone.
  Exact display placement and implementation remain pending design confirmation.

Observed before implementation: the current reading surface adapter maps the
  overall structure summary and per-paragraph summaries, but does not read
  per-paragraph `function`; the companion analysis PDF does not consume this
  discourse-structure object. Recording the desired behavior does not claim it
  is already implemented. Other reading fields remain under discussion.

## Owner-confirmed supplement: reading, seven-choices and cloze introductions

Owner requested recording the proposed length and purpose of the list-facing
reading passage introduction (`summary`), then explicitly confirmed that
seven-choices and cloze introductions should follow the same standard:

- Aim for 50–80 Chinese characters, preferably one sentence; use two short
  sentences when necessary. This is a writing target, not a hard admission range.
- Help teachers quickly identify the passage content and decide whether to
  select it. Cover the main subject plus the core event or information; add the
  passage's distinctive angle only when useful.
- Simple passages may use fewer than 50 characters; do not pad to meet a minimum.
  Keep complex passages within 80 characters where practical.
- Do not force a statement of thematic value or an elevated moral, introduce
  unnecessary detail, or use empty openings such as “本文主要讲了”.
- Keep this whole-passage introduction distinct from each paragraph's summary
  and from the article's organizational account. It does not replace either.
- For seven choices and cloze, summarize the passage's main subject and core content; do
  not explain individual blank answers or include cohesion analysis in the
  introduction. This agreement covers reading, seven choices and cloze, not an
  automatic extension to all other question families.

Current implementation remains unchanged: the passage-summary prompt requests
80–140 Chinese characters in one sentence or two short sentences; its normalizer
caps text at 240 characters rather than enforcing that requested range. This note
does not modify the prompt, validator, UI, or stored data, or resume implementation.

## Owner-confirmed reading completeness requirements

Owner agreed to the following three points when closing the reading discussion:

1. New complete packages must include full passage translation and 1–2 selected
   long-sentence analyses per reading group, as required by the existing new-paper
   contract. Their absence from historical assets does not lower the new-package
   standard. This does not authorize backfilling historical papers.
2. Each question needs complete teaching explanations, not just an answer and a
   classification: stem translation, all four option translations, the official
   correct answer, supporting source evidence, explanations for all three wrong
   options, and source/option correspondences. Reuse the existing reading contract;
   require specific explanations and accurate quotations, not a new label system.
3. Specify required persistence separately from required display and retrieval
   consumption. Package presence alone is not acceptance: teachers must be able to
   access the intended teaching content, and topic/search/similarity data must reach
   their actual consumers. Current paragraph-function display and separate topic
   storage are known integration seams; exact surface mappings remain to be listed
   in the design, not assumed to exist.

The additional suggestion to unify the list-facing `summary` and analysis
`overview` was outside those three points. It remains a proposal, not an
Owner-confirmed field merge or deletion. Reading discussion closure does not
freeze the full package contract or authorize implementation.

## Owner-confirmed retirement: teaching hints

Owner explicitly decided to retire `teachingNote` in seven choices, cloze and
grammar fill, rather than leave it as an optional new-package teaching field.

- Remove it from future generation requirements and active teaching consumption;
  align prompts, validators and projection/adapter requirements when implementation
  resumes. Do not merely hide a field that generators still have to produce.
- Remove the remaining `点拨` join from teacher draft exports as part of that
  retirement. The three lecture panels already deliberately omit the field;
  companion analysis PDF and similarity matching do not consume it.
- Preserve existing historical files for compatibility; this decision does not
  authorize bulk data rewriting or deletion. Existing values must not reintroduce
  the retired teaching hint into active display/export.
- This supersedes earlier inventory claims that the three lecture panels display
  `teachingNote`: their adapters retain data, but the panels explicitly do not
  render it. The current validators still require it until implementation changes.

## Owner-confirmed cloze supplement: emotional development

- Include `affectiveArc` only when the passage actually has a discernible emotional
  development. Do not force an emotional arc onto an event-, action- or cause-led
  passage, or invent a “先抑后扬” pattern to fill the field.
- Absence of a genuine emotional arc is not a completeness failure. Exact optional
  encoding remains for the later contract design.
- Cloze introductions use the shared 50–80-character target above.

These are confirmed design decisions, not a resumption of implementation. No
prompt, validator, UI, export code or historical paper is changed by these notes.

## Owner-confirmed grammar-fill supplement: shared introduction and public explanations

Owner confirmed the distinction between the personal teaching framework and
question-specific explanations, and requested recording the following direction:

- Produce one grammar-fill passage introduction for both the selection list and
  the lecture view. Do not ask AI to independently write a list-facing `summary`
  and an analysis `overview` with substantially the same purpose. Existing field
  compatibility and the eventual storage mapping remain implementation decisions.
  This confirms reuse for grammar fill, not the separate pending reading-field
  merge proposal above.
- Retain fine-grained grammar classifications for identifying tested knowledge
  and matching similar questions. Readers should not have to learn the Owner's
  personal classification or procedural vocabulary to understand an explanation.
- Retire the student-facing personal `framework` (the fixed per-facet steps and
  transformation table) and the `path` fast/slow labels. Stop requiring AI to
  generate or organize its explanations around that personal method; coordinate
  prompt, validation and consumer changes when implementation resumes rather than
  merely hiding the labels while retaining mandatory generation.
- Keep `reason` as the specific question's explanation, currently displayed under
  “代入”. Explain naturally and accurately why the official answer fits this
  sentence: short explanations for simple items and sufficient detail for difficult
  ones, without forcing a fixed step sequence or a general grammar lecture.
- Keep `role`: subject, attributive, adverbial and other syntactic roles describe
  actual grammar and support existing non-finite similarity matching. Do not remove
  it along with the personal fast/slow `path` convention.
- The already confirmed `teachingNote` retirement still applies. No historical
  asset rewrite is authorized, and these notes do not resume implementation or
  freeze the complete package contract.

## Owner-confirmed application-writing supplement: retire selected expressions

Owner explicitly retired application-writing `highlightExpressions` (精选表达).
The new staged application prompt already forbids generating it; implementation
must also remove the remaining application display/export consumption rather
than treating historical presence as a new-package requirement. Preserve historical
files for compatibility, without bulk rewriting. This decision is scoped to
application writing; continuation-specific legacy fields remain separately reviewed.
No implementation resumes as a result of this design note.

## Owner-confirmed application-writing supplement: three groups, eight items

Owner corrected the initial seven-item proposal: preserve the three presentation
groups (基本审题、内容要求、读者意识) and retain 价值落点 separately from 读者需要.
The resulting eight items below supersede the earlier seven-item merge of `value`.
These are semantic requirements, not frozen JSON field names. Present the groups
and their items in the following order:

| Group | Item | Required meaning | Relationship to existing fields |
| --- | --- | --- | --- |
| 基本审题 | 写作形式 | Identify the requested form, such as email, notice, report or speech. | Keep the purpose of `form`; do not separately require the overlapping display item `type`. |
| 基本审题 | 主题与目的 | State the subject and communicative purpose, including the intended reader response. | Combine `topic` and the communicative purpose in `readerWants`. |
| 基本审题 | 人称 | Explain the principal person and why it fits the task. | Retain `person`. |
| 基本审题 | 时态 | Explain the principal tense and any necessary shifts. | Retain `tense`. |
| 内容要求 | 内容要点 | Cover the task's explicit requirements and explain how each can be realized concretely. | Retain the purpose of `points`, but use the actual requirements rather than exactly two entries. |
| 读者意识 | 读者与关系 | Identify the actual reader and the relationship between writer and reader. | Combine `reader` and `readerWho`. |
| 读者意识 | 读者需要 | Explain what information the reader needs to understand, judge or respond to the communication. | Retain the purpose of `readerCares`, separate from `value`. |
| 读者意识 | 价值落点 | Explain the concrete help or meaning the communication delivers to the reader, grounded in the task and content. | Retain `value` separately; do not force elevated moral claims. |

- Keep explicit content requirements separate from reader-oriented additions.
  Required points must not be omitted; suggested details must not be presented as
  requirements or facts supplied by the source.
- For example, an invitation may explicitly require a programme introduction and
  interview topics, while timing, duration or how to confirm attendance may be
  useful additions. When the source does not provide these, label them as reasonable
  suggestions, not known facts.
- Each item should answer a distinct question. Keep simple items brief; do not
  manufacture content merely to fill the card.
- Value may be as practical as helping the reader complete registration or offering
  an actionable solution. Do not manufacture a grand theme. Simplifying the visible
  review card does not itself remove internal composition-planning judgments; the
  model-answer production prompt is being reviewed separately.
- This supplements the selected-expression retirement above. Exact schema mapping,
  old-data compatibility, prompt/validator updates and display changes remain for
  implementation after design confirmation; none are implemented by this note.

## Owner-confirmed continuation supplement: four teaching sections

Owner approved consolidating the teacher/student-facing continuation explanation
into four sections. This reduces repeated presentation, not the reasoning or
source-grounding required to generate a sound continuation.

| Section | Content and boundary |
| --- | --- |
| 故事理解 | Core situation, characters and motivations, source ending state and unresolved problem. Explain established motivations here rather than duplicating a separate motivation inventory later. |
| 续写边界 | Source facts, hard requirements imposed by both paragraph starters, forbidden contradictions and legitimate creative freedom. Do not repeat the full proposed plot here. |
| 两段发展方案 | One selected route; each paragraph's cause → action → result, necessary emotional development, clue payoffs, the bridge between paragraphs and the ending. Merge narrative development and paragraph blueprint responsibilities rather than producing duplicate event chains, state changes and final effects. |
| 完整参考范文 | Two complete English paragraphs consistent with the selected route. If an official model answer exists, show it separately and clearly distinguish its authority from the generated reference. Avoid an additional repetitive commentary on the model answer. |

- Retain language alignment as a generation requirement: person, tense, voice/style,
  dialogue and description still matter. Do not default to displaying a separate
  long checklist of narrative distance, cohesion plans and function-led language.
  A genuinely task-specific language reminder may appear briefly at the relevant
  point in the two-paragraph plan, without a new mandatory field family.
- Distinguish source-imposed requirements from the selected optional route. A
  starter-imposed arrival state is not equivalent to an invented choice such as
  seeking help by phone; do not present that choice as the only valid continuation.
- Include emotional or relationship changes only when the story warrants them.
  Do not require every story to feature gratitude, personal growth or elevated
  relationship meaning.
- Ground key judgments in source evidence and make them checkable, without
  repeatedly quoting the same passage across sections.
- This is a presentation/content-organization decision, not authorization to
  delete source evidence or historical analysis fields. Exact persistence mapping,
  generation/output contracts and Screen/PDF implementation remain pending the
  complete design; this note makes no code or prompt changes.

## Writing similarity: recorded inputs and proposed ranking priorities

Owner requested retaining this discussion for the future similarity consumer.
Application and continuation similarity are not implemented by these notes.
Preserve the following source-grounded information through later schema/display
changes; reuse existing analysis rather than generating a second redundant
similarity essay. The desired result distinguishes degrees of similarity rather
than treating every match as equivalent. Priorities below are proposals for later
evaluation, not fixed numeric weights, thresholds or approved hard filters.

### Application writing

- Inputs: topic and communicative purpose; writing form; reader and relationship;
  explicit content requirements. These correspond to the confirmed review card.
- Keep topic and purpose separately identifiable for matching even though the
  card presents them together. Do not treat shared topic as shared purpose.
- Proposed order: topic + purpose first, form second, then reader/relationship and
  required content actions as supporting dimensions. Do not yet impose an order
  between those last two dimensions or freeze weights within topic + purpose.
- For example, inviting a teacher to an English festival versus a campus interview
  should generally outrank a news report on the same festival: shared subject alone
  does not outweigh a different communicative task.
- Reader needs and value remain teaching content, not primary ranking inputs;
  person and tense are not primary matching conditions. Generic claims such as
  “促进交流” must not manufacture a strong match.

### Narrative continuation

- Use `storyUnderstanding.centralSituation` for topic/event context,
  `storyUnderstanding.meaningDirection` (including its evidence/confidence) for
  supported thematic meaning, `storyUnderstanding.unresolvedProblem` for the
  unfinished conflict, and `continuationContract.paragraphs` for paragraph-entry
  states, required moves and required exit states imposed by the source/starters.
- Owner explicitly requires topic relevance: a generic difficulty → resolution
  pattern is not enough. First establish meaningful topic/context or concretely
  supported thematic proximity, then compare the unresolved problem and required
  paragraph progression. Exact gating and relative weights remain undecided.
- Do not primarily match AI-selected plots, generated model-answer wording or
  optional development routes. Different valid continuations of the same source
  must not change what the source task fundamentally resembles.
- Context and meaning-direction fields are free text, not the existing controlled
  three-level topic taxonomy. Exact taxonomy filtering needs an explicit mapping;
  do not claim that mapping or classification already exists.

Before freezing scoring, compare representative pairs that separate topic, task,
form and structural resemblance, and verify that high-ranked results offer real
teaching transfer. A future score/level should have identifiable matching reasons;
numeric calibration and user-facing score format remain open. No implementation,
new index, model calls or publication are authorized by this record.

## Owner-confirmed listening supplement: teaching analysis and material-level topic

Owner explicitly included listening teaching analysis in the complete product,
not just playback and source checking, and requested “一个材料一个话题”.

- Include a Chinese translation of each dialogue/monologue material, translations
  of each question stem and its three options, and source-grounded answer evidence.
- Explain why the official answer follows from what was heard, including relevant
  paraphrase, inference or calculation rather than merely restating the answer.
- Include distractor discrimination when needed, especially for competing times,
  places or people and corrections/negations in the recording. Do not require three
  mechanically padded wrong-option explanations (listening has only two wrong
  options per question), reading-style discourse analysis, long-sentence analysis
  or a revived `teachingNote` field.
- The topic unit is one complete dialogue or monologue, not the whole listening
  section and not each question independently. In the current NCK1 shape this
  means ten material-level topic assignments; several questions covered by one
  material share its one main topic. Different materials may share the same topic.
- Preserve material identity and its question coverage so translation, topic,
  evidence and questions stay associated. Do not mistake the two listening section
  groups for the ten individual materials.
- Exact topic taxonomy, field names, persistence and display/search consumers are
  still to be mapped. The initial similarity direction is recorded below; it does
  not imply that existing group-level topic storage already suffices.
- Keep official transcripts, audio transcriptions and generated teaching analysis
  distinguishable. A transcription must not be presented as an official transcript.

These are design requirements only; no generation, schema, UI, audio-processing or
historical-data implementation is performed by this note.

## Owner-confirmed listening similarity: topic first, one-sentence summary second

- Use the individual dialogue/monologue as the retrieval unit: ten materials in
  the current NCK1 paper, each with its own main topic and one-sentence summary.
  Multiple questions belonging to a material share that material's retrieval data.
- Add a source-grounded one-sentence material summary as a similarity dimension.
  It summarizes the material, not its answer list or per-question explanations.
- For the initial listening similarity design, use topic first to identify related
  candidate materials, then compare their one-sentence summaries for finer semantic
  similarity. Do not reverse the priority or treat generic summary resemblance as
  a substitute for topic relevance.
- Record this topic → summary order for the later index/search consumer. Exact
  taxonomy matching granularity, hard-filter versus ranking behavior,
  scoring, thresholds and indexing technique remain undecided. Do not
  automatically import the 50–80-character passage-introduction target or claim
  that embeddings or a listening similarity index already exist.
- Keep topic, summary, transcript and covered question IDs bound to the same stable
  material identity through persistence and later export. No implementation or
  additional model call is authorized by this design record.

### Owner-confirmed listening closure

- Aim for a one-sentence summary of about 20–40 Chinese characters, identifying
  the participants, situation and main content when relevant. Longer dialogues
  may need more; this is not a hard admission limit or an answer-list summary.
- Distinguish whole-paper audio from individual-material audio. Do not require
  ten separate audio files; preserve supplied segments or timestamps without
  inventing missing ones. Playback/localization depends on supplied resources.
- Each question requires stem/option translations, the official answer, source
  evidence and reasoning from that evidence. Explain distractors when necessary,
  without mechanically requiring a paragraph for each wrong option.

## Goal

Keep two production paths in the existing private OPS source ledger:

1. Raw question and official-answer documents retain the existing import and
   Sol analysis workflow.
2. A complete externally analyzed package is validated and deterministically
   integrated without OCR, document splitting, image re-extraction, or full
   Sol analysis generation.

Both paths produce unpublished Candidates and use the existing immutable
Review revisions, Owner QA, explicit promotion, publication and rollback.
An external package is not an approval or a Canonical publication.

The Owner supplies official answers to the external tool. Answers are
transcriptions of that authority, never model-generated solutions. Content
and explanations remain subject to Owner Review.

## Deliverables

- A versioned package contract, an external-agent entry prompt, and a local
  validation command. Reuse the existing nine analysis contracts rather than
  creating a second explanation schema.
- One archive containing paper metadata, source observations, official answers,
  nine complete analyses, media with explicit references, and original question
  and answer documents. The Owner uploads once; no manual file assembly or
  second original-document upload is required.
- A package selection in the existing OPS new-paper drawer, upload validation,
  durable mode binding and worker dispatch. Keep the listening-supplement path.
- A deterministic package adapter with explicit source semantics, not a flag
  that disables raw-source verification. File digests and reference closure
  remain checked; external content must not claim EQB source-extraction proof.
- Corrected package upload targeting an existing Review paper and producing a
  new immutable revision. Preserve issues, current-revision identity and the
  existing approval/publication boundary.
- Actionable errors naming the file and field. Rejected packages do not fall
  back to an automatic full-paper analysis run.

## Existing code seams and constraints

- `import-ops/public/source-intakes.js` owns the upload drawer and sequential
  manifest/byte uploads. The consumer application does not own this UI.
- `server/source-intake/sourceIntakeStore.mjs` owns source file admission,
  readiness, immutable snapshots, leases and handoff. Existing snapshots without
  a mode mean raw new-paper intake and must remain readable.
- `scripts/import-pipeline/source-intake.mjs` currently routes all non-listening
  submissions through universal raw-source init. Its initialization receipt
  compares uploaded files directly with captured originals; package inventory
  needs its own exact binding rather than disabling this check.
- `server/import-review/nck1AnalysisProjection.mjs` reads nine staged analyses,
  validates answer/ID/source-version closure and derives five display sidecars.
  It does not regenerate analysis or require an external Sol envelope.
- `server/import-review/revisionProjection.mjs` calls the materialization
  adapter during projection, not only during initial import. Finalize and
  promotion reproject immutable bytes. The package source policy must therefore
  survive server reconstruction and publication recovery, not merely local init.
- `server/paper-canonical/nck1MaterializationAdapter.mjs` currently replays DOCX
  paragraphs, some PDF measurements and media extraction recipes. Merely
  skipping the raw producer does not meet the no-reprocessing Goal.

## Shared format work

Reuse the unified content ownership and format validators being developed in
thread T-01a07ebd-ffde-7649-b1f7-b1461cadca6b. Do not introduce a separate rule
set for notices, passage text, writing givens or pagination. Coordinate before
editing shared materialization/Review modules; integrate a stable baseline
before final verification.

External tools supply semantic content, not paper CSS, final PDF pagination,
Teacher Confirmation, approval receipts or publication identities. EQB derives
its internal manifests and digests from the actual submitted bytes.

For an external package with Listening, Review exposes the authenticated sealed
MP3 and supplied transcript on the exact revision. Approval additionally requires
the Owner to affirm playback/transcript agreement, whole-section cohesion across
all segments/questions/official answers, and suitability/safety based on actual
audio. EQB persists those human-review facts (not ASR or invented comparison
scores) in its normal approval receipt. Publication authority is minted only by
server-side readback after current revision bytes, renderer, approval identities,
and the audio digest are revalidated; a package-authored or serialized receipt is
data only and cannot authorize publication. Approval does not auto-publish.

## Verification

- Exercise a complete package through actual OPS upload to Review, feedback and
  corrected revision. Inspect representative UI states and real rendered paper.
- Reject missing official answers, incomplete analyses, wrong answer labels,
  dangling/cross-paper references, missing media and unsafe archive entries.
- Test duplicate delivery/submission and stale corrected-package targets through
  the durable public seam; they must not create unintended papers or overwrite
  a finalized revision.
- Prove package intake does not invoke OCR, raw materialization, media extraction
  or model generation. Do not mistake absence of a UI spinner for this evidence.
- Regress raw source intake and listening supplement behavior.
- Test publication/recovery/rollback in an isolated fixture environment. No
  production promotion is authorized by this development Goal.
- Run affected checks during development, then the repository-required shared
  contract/persistence final gates and independent Standards/Spec review.

## Non-goals

No deletion or withdrawal of existing papers, production DB/R2 mutation,
deployment, production paper publication, broad OPS redesign, new renderer,
batch migration, arbitrary exam profiles or per-question publication.

The Owner's eventual system-wide 0.8 milestone includes layout, analysis,
import, QA and other capabilities; this task is only its package-intake slice.
