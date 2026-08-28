# English Question Bank Workbench

This context defines the domain language for the English question bank workbench (live at eqbank.cc; content production happens in the backend agent, the website only consumes — ADR-0015/0016). The product helps a teacher store passage-centered English tasks, search them, assemble paper sets, and export student or teacher versions.

## Language

**Source**:
The exam paper, mock paper, self-made material, or imported file family that a passage comes from.
_Avoid_: file, origin, paper when referring to provenance broadly

**Source Capture**:
The immutable provenance package for one import attempt: exact Import File bytes, whole-file digests, document roles, ordered observations, and any available Source Spans. Source correction creates a new capture; interpreted content and Analysis never overwrite it.
_Avoid_: canonical paper, cleaned paper, normalized asset

**Import Source Type**:
The trusted origin form accepted at the canonical-import seam: a DOCX is a new-import source, while the exact committed Ticket 26 frozen JSON capture is a legacy-migration source; both must derive the same Import Candidate before Teacher Confirmation.
_Avoid_: treating a legacy capture as a missing DOCX or as caller-authored canonical semantics

**Source Span**:
A typed address into one immutable Source Capture observation or binary artifact, bound to its source-document digest and pre-normalization coordinates. It is diagnostic and audit evidence, not a universal per-field admission proof.
_Avoid_: canonical path, normalized offset, mutable text range

**Import Candidate**:
The deterministic, unpublished interpretation derived by a trusted source adapter from one Source Capture, accompanied by validation issues and still requiring Teacher Confirmation before it can become a Canonical Paper.
_Avoid_: canonical paper, caller-authored payload, draft publication

**Teacher Confirmation**:
The explicit, candidate-bound decisions by a teacher that accept or resolve semantic import issues. It is the semantic trust boundary between an Import Candidate and a Canonical Paper.
_Avoid_: parser success, automatic approval, informal review note

**Canonical Paper**:
The complete renderer-neutral paper semantics produced only after deterministic validation and Teacher Confirmation have no unresolved blocking issue. It is the single meaning consumed by Screen, Print, and PDF and is published atomically or not at all.
_Avoid_: import candidate, rendered paper, partial sidecar

**Paper Format Profile**:
A reusable, versioned definition of one legitimate paper family: its parts, sections, group slots, numbering, scoring, instructions, and answer regions.
_Avoid_: source format, renderer template, one universal paper shape

**Canonical Paper Plan**:
One paper's validated instantiation of a Paper Format Profile, linking every required active slot to its Canonical Question Group and every Inactive Source Slot to its source closure while fixing paper order, numbering, scoring, instructions, and answer regions.
_Avoid_: paper asset, layout tree, rendered document

**Canonical Paper Publication**:
One immutable, versioned, integrity-closed set that binds a confirmed Canonical Paper to its Source Capture, Teacher Confirmation, provenance/digests, and executable authority closure. It is admitted or rejected as a whole; its additive sidecars are not independently publishable.
_Avoid_: individual sidecar, mutable latest directory, partially canonical paper

**Inactive Source Slot**:
A Paper Format Profile slot that deliberately produces no Canonical Question Group and appears on no current consumption surface. Its source state is recorded explicitly, including `not_supplied`; activating it later requires a separate source/content contract.
_Avoid_: incomplete Question Group, hidden Question Group, raw group

**Canonical Question Group**:
The source-traceable semantic form of one Question Group after deterministic normalization; each question family has its own variant behind one shared normalization contract.
_Avoid_: raw group, renderer model, analysis payload

**Normalization Report**:
The durable account of direct source lineage, Transformation Records, diagnostics, and fail-closed outcomes for one paper compilation.
_Avoid_: validation report when no transformation provenance is recorded; AI analysis

**Transformation Record**:
One ordered ledger entry showing how source-backed evidence became a changed canonical value or relationship, retaining the versioned rule, exact input Source Spans, before/after state, target, and exactness proof. Heuristic or semantic-risk candidates are review diagnostics, not accepted Transformation Records.
_Avoid_: source edit, cleanup history, AI analysis

**Passage**:
A complete English text, cloze text, writing prompt, listening script, or task material that provides the context for one or more question groups.
_Avoid_: article, text, material when the database object is meant

**Question Group**:
A set of questions that belongs to one passage and shares one task type or instruction. A writing Question Group is the documented exception: it contains zero Questions and carries a Writing Task instead.
_Avoid_: section, block, exercise when referring to the stored group object

**Question**:
One answerable item inside a question group.
_Avoid_: problem, item when precision matters

**Option**:
One selectable answer choice attached to a question.
_Avoid_: choice when referring to the database object

**Cloze Blank**:
One numbered gap (q41–q55) in a 完形填空 Passage. A Cloze Blank is both a Question and the in-passage gap its answer fills; the two map one to one. Its Options are four same-part-of-speech choices (A–D) attached to that Question.
_Avoid_: 空 alone (ambiguous), gap, gap-fill when the stored object is meant

**Analysis**:
The reviewed, teacher-facing explanation of why each correct answer fits — the 讲评 layer. It attaches per Question / Cloze Blank for objective families, or to a Writing Task for writing. It is never the answer authority and is shown only when complete for the whole group. Cloze Analysis explains each Cloze Blank using collocation reasoning, an optional part-of-speech-specific test point, and highlightable evidence from the passage.
_Avoid_: 解析 / explanation when the stored reviewed object is meant; answer key when only the answer is meant

**Tutor** (小导师):
The teacher-facing, paper-grounded chat loop on eqbank.cc. It reads the current Question Group, its Analysis when published, and teacher-confirmed 配相似 results through object APIs. It is not HKU DeepTutor, not a document knowledge base, and not a student account. Product authority: `docs/cuts/deeptutor-integration/spec.md`.
_Avoid_: DeepTutor when the EQB product is meant; chatbot; knowledge base; treating a Tutor turn as Analysis

**Writing Task**:
The writing-specific information carried by a writing Question Group: the task type (应用文 application / 读后续写 continuation), complete prompt, communicative situation, content requirements, source word-count ruling, and any task-type-specific fixed response text or continuation material. A Writing Task is the attachment point for its Writing Analysis, since a writing group has no Questions to attach analysis to.
_Avoid_: writing question, essay question when referring to this stored object; it is not a Question

**Application Given Skeleton**:
The fixed response text explicitly provided by the source for an application Writing Task, role-labelled as title, salutation, opening, closing, or signature and placed around the student's answer region. It is never inferred merely because the task asks for an email/letter or includes a background letter.
_Avoid_: application format when the source provides no fixed text; inferred greeting; model-answer scaffold

**Writing Analysis**:
The reviewed, display-facing 讲评 for a Writing Task — the writing counterpart of the per-Question Analysis, attached at the writing group / Writing Task level (no Question reference, per ADR-0007). It is display content (read on the paper surface), not a search dimension. The on-disk envelope remains `writing-analysis-v1` (no v2 file). An **application** Writing Analysis carries a **Model Answer**, a **Review Card**, and an optional **Official Model Answer** when the source supplies one; new application work does not require **Highlight Expressions** (historical arrays are kept). New **continuation** work uses **Narrative Continuation Analysis** plus a **Model Answer**; persisted `main` assets may still carry legacy **Continuation Design**. New NCK1 papers persist this envelope during `--publish`; historical papers remain backfillable. Scoring guidance, common-pitfall notes, and grouped vocabulary banks are out of scope.
_Avoid_: 写作解析 / writing explanation when the stored reviewed object is meant; do not call it a Tag or a derived search dimension; do not call the expanded application fields "writing-analysis-v2"

**Model Answer** (范文 / AI 参考范文):
The single universal, attainable-excellent sample response carried by a Writing Analysis as `modelAnswer` — written so a solid (~90-level) student could realistically reproduce it (high-frequency vocabulary, reliable structures, on the word-count target) yet still scores well. Not a native-speaker showcase, not a set of tiered samples, and not the source 下水文.
_Avoid_: 范文 used loosely for any sample; sample essay when the curated, attainable one is meant; official / source model essay

**Official Model Answer** (官方范文):
The source-supplied 下水文 / 评分参考范文 stored on an application Writing Analysis as `officialModelAnswer`. Optional: omit when the source has none; never invent or AI-rewrite it; never attach it to continuation.
_Avoid_: treating Model Answer as the official essay; filling this field by solving the prompt

**Review Card** (审题卡):
The application-only structured 审题 fields on a Writing Analysis (`form`, `topic`, `reader`, `person`, `tense`, `type`, two `points`, `readerWho`, `readerCares`, `readerWants`, `value`). Required for a complete application lecture; forbidden on continuation. Generation also follows `docs/product/application-writing-doctrine-v1.md` §3.3 交际对象推演 (relationship, prior contribution, core communicative act, relationship risk, minimal relationship moves, order); that pass is a generation decision and does not add ReviewCard schema fields.
_Avoid_: using it as continuation plot design; treating it as a Tag; adding relationship-move fields onto ReviewCard

**Highlight Expression** (亮点表达 / 高分句块):
A reusable, high-scoring sentence chunk lifted from the Model Answer. Historical continuation Writing Analysis still carries 3–5; new application and new narrative continuation work do not persist them (legacy application arrays may still exist). New narrative continuation work uses **Narrative Continuation Analysis**, not highlights.
_Avoid_: phrase, sentence when the curated, score-bearing chunk is meant; requiring highlights on new application work

**Continuation Design** (情节设计思路):
The legacy shallow display field on historical continuation Writing Analyses: one theme plus one free-text note for each paragraph starter. It remains a current asset fact on `main` but is not the analysis authority for new continuation work.
_Avoid_: using it as the new continuation analysis contract; treating its theme or paragraph notes as independently evidenced constraints

**Narrative Continuation Analysis** (记叙型读后续写解析):
The reviewed, source-grounded interpretation of one narrative continuation Writing Task (`continuationAnalysis` / `continuation-analysis-v1`): story understanding, hard/soft/open continuation constraints, causal character development, source-aligned language guidance, and one two-paragraph response blueprint. Product authority: `docs/product/continuation-writing-analysis-contract-v1.md`. It supports later Model Answer generation but is neither an answer key nor a score prediction. Expository or argumentative continuation is out of V1 and must stop.
_Avoid_: Continuation Design; universal story template; automatic scoring rubric

**Tag**:
A teacher-confirmed label used for search, filtering, teaching intent, topic, discourse feature, question type, or difficulty support.
_Avoid_: keyword when the label is curated

**AI Tag Suggestion**:
A proposed tag generated by AI that has no official effect until a teacher accepts it.
_Avoid_: auto tag, final tag

**Draft Paper**:
An auto-saved composition workbench where a teacher assembles print-ready question groups into one student paper. A Draft Paper owns group order, group-level page breaks, continuous re-numbering, and export settings for the student-paper output.
_Avoid_: paper set when referring to the C8 workbench; basket after it has been persisted

**Paper Set**:
A saved collection of selected question groups or questions for broader paper, handout, training-set, or collection workflows. Paper Set remains distinct from the C8 Draft Paper workbench.
_Avoid_: draft paper when referring to older saved collection/export workflows

**Assembly Basket**:
Legacy localStorage-only temporary selection state. C8 retires Assembly Basket in favor of persisted Draft Paper, with a one-time migration from `assembly-basket-v1`.
_Avoid_: current draft after C8

**Paper Item**:
One selected question group or question inside a paper set.
_Avoid_: row, selected thing

**Draft Paper Item**:
One selected question group inside a Draft Paper. C8 keeps group as the minimum item unit; it does not support single-question draft items.
_Avoid_: question item when composing a draft paper

**Student Version**:
An export view that includes passages, stems, options, and answer space but hides answers and explanations.
_Avoid_: blank version

**Teacher Version**:
An export view that includes everything in the student version plus answers and explanations.
_Avoid_: answer version when it could mean only an answer key

**Import File**:
A locally archived DOCX, PDF, image, or other source file brought into the workbench for later review or parsing.
_Avoid_: source file when it would confuse provenance with Source

**导题后台** (Import Ops Console):
The owner-only local web surface for watching NCK1 import progress and running the human pre-ship QA stop. It is separate from the consumer website runtime and is not a revival of website import UI; agents produce folder artifacts, and this console reads them. Content ship to production is not a console button: after QA, the owner must explicitly tell an agent to run the existing content-push script.
_Avoid_: 管理后台 when a generic admin/ops surface is meant; Import Console as the sole English product name (Chinese name is canonical); treating QA-pass as automatic production push

**AI Answer Transcription Check**:
An agent-only pass that compares transcribed / split `answerKey` (and analysis correct-option labels) against the source answer markings. It never invents answers by solving items and never replaces the human pre-ship QA stop.
_Avoid_: human answer-grid review; AI 解题; treating Analysis as the answer authority

**Agent Contract**:
The single entry document any local coding agent reads to import one NCK1 paper (`docs/import/agent-contract.md`). It names start inputs, folder probes, hard gates, retry limits, and stop/help signals. Mechanical how-to stays in the runbook/README; this contract is the agent↔导题后台 interface.
_Avoid_: treating the runbook as the only entry; a website import API

**Import Signal**:
A small JSON receipt under `scripts/import-pipeline/papers/<paperId>/signals/` that the 导题后台 reads in addition to product artifacts. Named files: `ai-answer-check.json` (transcription check passed), `blocked.json` (hard stop with a reason code), `help-needed.json` (owner decision required, not routine pre-ship QA), `qa-accepted.json` (owner said pre-ship QA passed), `shipped.json` (local ship receipt after an authorized whole-library push). `ship_failed` is a `blocked.json` reason code. The executable ship checklist is `scripts/import-pipeline/ship-checklist.mjs`; it does not itself push. Local publish success is still `app/public/paper-assets/<paperId>/latest`, not process exit codes.
_Avoid_: a parallel status database; treating `--publish` exit 0 as published

**Teaching Axis** (教学轴):
A structured, enumerable search dimension bound to ONE question type — capturing what
that type teaches or how it is solved. Each type carries its own set: 语法填空 has 语法点
facets plus the Verb Teaching Axis (时态/语态/主谓一致); 七选五 has 承上启下 机制/角色/位置;
完形 has 词性 + 语义特征; 阅读 has 设问技能. A blank or question may carry several axis
values at once (multi-tag). Teaching Axes are derived teaching dimensions (ADR-0008,
backfillable) headed for the ADR-0009 generic attribute store; Verb Teaching Axis is the
first fully-built instance.
_Avoid_: using 考点 as a single catch-all dimension (each type's axes differ in kind);
calling a cross-type topic label a Teaching Axis (topic is universal, not type-bound);
conflating it with a free-form Tag.

**Verb Teaching Axis** (动词教学维度):
Three orthogonal structured dimensions a teacher uses to find 语法填空 finite-verb
questions: **Tense** (时态: 一般现在/一般过去/现在完成/过去完成/进行/其他),
**Voice** (语态: 主动/被动), **Subject-Verb Agreement** (主谓一致: 单数/复数/不涉及).
A single finite-verb blank carries one value on EACH axis at once (e.g. `was built` =
past + passive + singular), so the axes are multi-tag, not a single choice. They deepen
the `grammar-fill.given.verb.finite` facet, which alone only says "this is a finite-verb
blank". Persisted in a per-paper verb-profile sidecar, never in the frozen analysis.
_Avoid_: conflating Voice with Tense; treating 主谓一致 as a tense sub-value (it is its
own light axis); using "考点" loosely when one of these specific axes is meant.

**Vocabulary Program** (词汇课程):
A versioned, ordered teaching sequence that arranges vocabulary by stage, week, group, and source order. It preserves the curriculum route independently of any one teacher's review progress.
_Avoid_: word list, review run, vocabulary set

**Vocabulary Group** (词汇组):
One contiguous unit inside a Vocabulary Program, identified by its stage, week, and group number and containing ordered Vocabulary Entries.
_Avoid_: review batch, export set, day when the product does not require calendar use

**Vocabulary Entry** (词条):
One curriculum-positioned English headword in a Vocabulary Group, carrying its source-backed spelling, pronunciation, candidate meanings, and source position. The same headword may be a different entry in another Vocabulary Program.
_Avoid_: word when the stored curriculum object is meant; teaching sense; review decision

**Teaching Sense** (教学释义):
The compact, teacher-approved meaning or meanings shown for a Vocabulary Entry on review cards and exports. It is selected from source-backed candidates and never changes the entry's original source meanings.
_Avoid_: dictionary dump, AI-selected final meaning, source meaning

**Vocabulary Review Run** (过词轮次):
A resumable traversal of a Vocabulary Program in source order, with a collection target and a current cursor. It owns Review Decisions but does not alter the program.
_Avoid_: vocabulary group, vocabulary set, quiz

**Review Decision** (过词判断):
One teacher-recorded `known` or `unfamiliar` outcome for a Vocabulary Entry inside a Vocabulary Review Run. Returning to a word may replace that run's decision without changing the entry.
_Avoid_: score, mastery level, permanent student record

**Vocabulary Set** (生词集):
The frozen, ordered unfamiliar entries collected from one Vocabulary Review Run for export and playback. Later edits to the program or another run do not silently change an existing set.
_Avoid_: review run, vocabulary group, live filter result

**Vocabulary Set Entry Snapshot** (生词集词条快照):
The immutable, ordered copy of one Vocabulary Entry's teacher-facing learning content and bound asset versions inside a Vocabulary Set. It keeps a printed sheet and shared listening page stable even when the source Vocabulary Program is revised later.
_Avoid_: live vocabulary entry, cache, review decision

**Vocabulary Share** (生词集分享):
A revocable public capability that exposes exactly one frozen Vocabulary Set for read-only listening through an unguessable identifier. It does not expose the owning teacher, Review Run, progress, or any other Vocabulary Set.
_Avoid_: user account, live review link, public vocabulary program

## Relationships

- A trusted adapter derives one **Import Candidate** and its deterministic issues from one **Source Capture**; callers do not author the candidate's semantics.
- **Teacher Confirmation** binds to one exact **Import Candidate** and either yields one complete **Canonical Paper** or leaves explicit unresolved issues.
- A **Canonical Paper** contains one complete **Canonical Paper Plan** and its exact **Canonical Question Groups**.
- A **Canonical Paper Publication** binds exactly one confirmed **Canonical Paper**, its **Source Capture**, its **Teacher Confirmation**, and one executable authority closure.
- **Source Spans** and **Transformation Records** support diagnosis and audit without becoming a universal per-field admission requirement.
- A **Paper Format Profile** can be instantiated by many **Canonical Paper Plans**; each Canonical Paper Plan uses exactly one versioned Paper Format Profile.
- A **Canonical Paper Plan** links its active paper slots to **Canonical Question Groups** but does not contain their passage or question content.
- An **Inactive Source Slot** links to an explicit source state such as `not_supplied` instead of a **Canonical Question Group**.
- A **Normalization Report** records the source-to-canonical outcome without becoming paper content or Analysis.
- A **Source** can contain many **Passages**.
- A **Passage** belongs to exactly one **Source** in V0.
- A **Passage** can contain many **Question Groups**.
- A **Question Group** belongs to exactly one **Passage**.
- A **Question Group** contains many **Questions**.
- A writing **Question Group** contains zero **Questions** and carries one **Writing Task**.
- An application **Writing Task** may carry one source-provided **Application Given Skeleton**; its absence must not be filled from task genre or background material.
- A **Question** can have zero or more **Options**.
- A cloze **Question Group** contains many **Cloze Blanks**; each **Cloze Blank** maps one to one to one **Question**.
- An **Analysis** attaches per **Question** / **Cloze Blank**, or to a **Writing Task**; it is never the answer authority.
- A **Tutor** turn is grounded in one current **Question Group** and may read that group's **Analysis**; it does not become Analysis.
- A **Writing Analysis** attaches to a **Writing Task** at group level, with no **Question** reference. Application carries a **Model Answer**, **Review Card**, and optional **Official Model Answer**. New continuation carries **Narrative Continuation Analysis** plus a **Model Answer**.
- A **Narrative Continuation Analysis** derives only from one complete narrative continuation **Writing Task** and preserves source constraints separately from open author choices.
- A **Tag** can attach to a **Passage**, **Question Group**, or **Question**.
- An **AI Tag Suggestion** targets one **Passage**, **Question Group**, or **Question** and becomes a **Tag** only after teacher confirmation.
- A **Draft Paper** contains many **Draft Paper Items**.
- A **Draft Paper Item** points to one **Question Group**.
- An **Assembly Basket** may be migrated once into a **Draft Paper**.
- A **Paper Set** contains many **Paper Items**.
- A **Paper Item** points to one **Question Group** or one **Question**.
- A **Paper Set** can produce a **Student Version** and a **Teacher Version** export.
- A **Vocabulary Program** contains ordered **Vocabulary Groups**; each Vocabulary Group contains ordered **Vocabulary Entries**.
- A **Vocabulary Entry** retains source candidate meanings and may expose one teacher-approved **Teaching Sense** without overwriting those candidates.
- A **Vocabulary Review Run** traverses one Vocabulary Program and records at most one current **Review Decision** per Vocabulary Entry.
- Completing a Vocabulary Review Run's collection target may freeze its unfamiliar entries into one ordered **Vocabulary Set**.
- A **Vocabulary Set** owns ordered **Vocabulary Set Entry Snapshots** rather than a live filter over its source Vocabulary Program.
- A **Vocabulary Share** grants read-only public access to exactly one Vocabulary Set and may be revoked without deleting that Set.

## Example Dialogue

> **Dev:** "When the teacher adds a reading B task from a mock paper, do we store each question separately?"
> **Domain expert:** "No. First create the **Source**, then the **Passage**, then a **Question Group** for the reading task. The individual **Questions** live inside that group."
>
> **Dev:** "If AI suggests '生态智慧' as a label, can search use it immediately?"
> **Domain expert:** "Not as an official **Tag**. It is an **AI Tag Suggestion** until the teacher accepts it."
>
> **Dev:** "Is the current C8 workbench just the old basket?"
> **Domain expert:** "No. C8 uses a persisted **Draft Paper**. The old **Assembly Basket** only exists as a migration source."

## Flagged Ambiguities

- "题目" can mean **Question**, **Question Group**, or even a whole **Passage** in casual Chinese. In product and code, use the precise term.
- "材料" can mean **Passage** or **Import File**. Use **Passage** for reviewed content and **Import File** for archived originals.
- "题集" can mean a temporary selection, a **Draft Paper**, or a **Paper Set**. Use **Draft Paper** for the C8 group-composition workbench and **Paper Set** for older broader saved collections.
- "空" can mean a **Cloze Blank**, a 七选五 blank, or a 语法填空 blank. Use **Cloze Blank** for 完形填空; qualify the others by family.
- "组" can mean a source-backed **Vocabulary Group** or a temporary review batch. Use Vocabulary Group for the durable curriculum unit and Vocabulary Review Run for the teacher's live traversal.
- "生词" can mean one unfamiliar Review Decision or an exported entry. Use **Review Decision** while reviewing and **Vocabulary Set** after the selected entries are frozen for export.
- "DeepTutor" in casual talk may mean HKU's engine or EQB's **Tutor**. In product and code, **Tutor** / 小导师 is the EQB loop; HKU DeepTutor is only a reference implementation.
