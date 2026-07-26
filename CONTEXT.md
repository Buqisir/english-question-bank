# English Question Bank Workbench

This context defines the domain language for the English question bank workbench (live at eqbank.cc; content production happens in the backend agent, the website only consumes — ADR-0015/0016). The product helps a teacher store passage-centered English tasks, search them, assemble paper sets, and export student or teacher versions.

## Language

**Source**:
The exam paper, mock paper, self-made material, or imported file family that a passage comes from.
_Avoid_: file, origin, paper when referring to provenance broadly

**Source Capture**:
The immutable, traceable evidence package of exactly what one or more Import Files contain before EQB interprets them: original document bytes and digests plus ordered observations, document roles, provenance, and Source Spans. Source correction creates a new capture; normalized text, canonical structure, and Analysis never overwrite it.
_Avoid_: canonical paper, cleaned paper, normalized asset

**Source Span**:
A typed address into one immutable Source Capture observation or binary artifact, bound to its source-document digest and pre-normalization coordinates. Canonical content and Transformation Records point back to Source Spans; normalized-text offsets are not Source Spans.
_Avoid_: canonical path, normalized offset, mutable text range

**Paper Format Profile**:
A reusable, versioned definition of one legitimate paper family: its parts, sections, group slots, numbering, scoring, instructions, and answer regions.
_Avoid_: source format, renderer template, one universal paper shape

**Canonical Paper Plan**:
One paper's validated instantiation of a Paper Format Profile, linking every required active slot to its Canonical Question Group and every Inactive Source Slot to its source closure while fixing paper order, numbering, scoring, instructions, and answer regions.
_Avoid_: paper asset, layout tree, rendered document

**Canonical Paper Publication**:
One immutable, versioned, integrity-closed set that binds a single source paper asset instance to one complete Canonical Paper Plan, its exact Canonical Question Groups, Source Capture closure, Normalization Report, provenance/digests, and executable authority closure. It is admitted or rejected as a whole; its additive sidecars are not independently publishable.
_Avoid_: individual sidecar, mutable latest directory, partially canonical paper

**Inactive Source Slot**:
A Paper Format Profile slot whose required source evidence is closed in a Canonical Paper Plan but deliberately produces no Canonical Question Group and appears on no current consumption surface. It preserves a real part of the source paper without pretending that family is active.
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

**Writing Task**:
The writing-specific information carried by a writing Question Group: the task type (应用文 application / 读后续写 continuation), complete prompt, communicative situation, content requirements, source word-count ruling, and any task-type-specific fixed response text or continuation material. A Writing Task is the attachment point for its Writing Analysis, since a writing group has no Questions to attach analysis to.
_Avoid_: writing question, essay question when referring to this stored object; it is not a Question

**Application Given Skeleton**:
The fixed response text explicitly provided by the source for an application Writing Task, role-labelled as title, salutation, opening, closing, or signature and placed around the student's answer region. It is never inferred merely because the task asks for an email/letter or includes a background letter.
_Avoid_: application format when the source provides no fixed text; inferred greeting; model-answer scaffold

**Writing Analysis**:
The reviewed, display-facing 讲评 for a Writing Task — the writing counterpart of the per-Question Analysis, attached at the writing group / Writing Task level (no Question reference, per ADR-0007). It is display content (read on the paper surface), not a search dimension. Its composition depends on the Writing Task's task type: an application Writing Analysis carries a **Model Answer** plus its **Highlight Expressions**; a continuation Writing Analysis additionally carries a **Continuation Design**. Scoring guidance, common-pitfall notes, and grouped vocabulary banks are out of scope.
_Avoid_: 写作解析 / writing explanation when the stored reviewed object is meant; do not call it a Tag or a derived search dimension

**Model Answer** (范文):
The single universal, attainable-excellent sample response carried by a Writing Analysis — written so a solid (~90-level) student could realistically reproduce it (high-frequency vocabulary, reliable structures, on the word-count target) yet still scores well. Not a native-speaker showcase, and not a set of tiered samples — one Model Answer per Writing Task.
_Avoid_: 范文 used loosely for any sample; sample essay when the curated, attainable one is meant

**Highlight Expression** (亮点表达 / 高分句块):
A reusable, high-scoring sentence chunk lifted from the Model Answer and surfaced on its own so a weaker student can borrow the "good" parts directly. A Writing Analysis carries a few (≈3–5) per Model Answer.
_Avoid_: phrase, sentence when the curated, score-bearing chunk is meant

**Continuation Design** (情节设计思路):
The reviewed design rationale carried only by a continuation Writing Analysis — the theme the continuation must serve, plus, for each given paragraph opening sentence, how that paragraph picks it up and develops or resolves the story toward that theme. It teaches the *how* of continuation writing (plot direction and connection back to the source material), which a Model Answer alone cannot show. It is display 讲评, not a search dimension, and has no application counterpart.
_Avoid_: outline, plot summary when the curated teaching rationale is meant; do not call it a Tag or a derived dimension

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

## Relationships

- A **Source Capture** can compile into one **Canonical Paper Plan**, many **Canonical Question Groups**, and one **Normalization Report**.
- A **Canonical Paper Publication** binds exactly one source paper asset instance, one complete **Canonical Paper Plan**, its exact **Canonical Question Groups**, one **Source Capture** closure, one **Normalization Report**, and one executable authority closure.
- Every source-backed canonical value or relationship either maps directly to one or more **Source Spans** or is justified by an ordered **Transformation Record**.
- A **Paper Format Profile** can be instantiated by many **Canonical Paper Plans**; each Canonical Paper Plan uses exactly one versioned Paper Format Profile.
- A **Canonical Paper Plan** links its active paper slots to **Canonical Question Groups** but does not contain their passage or question content.
- An **Inactive Source Slot** links to one validated source closure instead of a **Canonical Question Group**.
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
- A **Writing Analysis** attaches to a **Writing Task** at group level, with no **Question** reference; it carries one **Model Answer** and its **Highlight Expressions**.
- A **Tag** can attach to a **Passage**, **Question Group**, or **Question**.
- An **AI Tag Suggestion** targets one **Passage**, **Question Group**, or **Question** and becomes a **Tag** only after teacher confirmation.
- A **Draft Paper** contains many **Draft Paper Items**.
- A **Draft Paper Item** points to one **Question Group**.
- An **Assembly Basket** may be migrated once into a **Draft Paper**.
- A **Paper Set** contains many **Paper Items**.
- A **Paper Item** points to one **Question Group** or one **Question**.
- A **Paper Set** can produce a **Student Version** and a **Teacher Version** export.

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
