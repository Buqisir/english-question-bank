# Legacy / Curated Teaching Analysis Workflow

This preserves the existing absent-profile / external analyzed-package path.
New `public-paper-v1` imports use summaries and compact metadata instead.
Repository paths below are relative to the repository root; sibling references
are relative to this file.

Before producing or revising any of the ten staged analyses, read and follow:

- `teaching-analysis-style-v1.md` — shared teaching-prose doctrine;
- `teaching-analysis-benchmark-v1.json` — fixed 25-case regression
  set drawn only from tracked project assets;
- `docs/product/similar-question-dimensions.md` — settled type-specific
  similarity fields and the boundary between model-authored analysis, source
  metadata, deterministic derivation, and rebuildable Embedding indexes.

The type-specific prompt owns schema and enum details. The shared doctrine owns
how student-visible prose explains the already-validated reasoning. Keep
internal facets and trap labels complete for matching and QA, but never use an
internal term in `reason`, `note`, `fitSummary`, `explanation`, or similar prose
as a substitute for restoring the context and stating the missing logical step.

Generate teaching prose and similarity support in the same type-specific
analysis pass. The analysis contract owns the machine-facing fields: Reading
questions add `similarityProfile`; Seven Choices reuses its per-blank position,
role, and primary-mechanism facets; Cloze groups add one `similaritySummary`;
Grammar Fill blanks add `similarityProfile` beside their existing facet and
role. Application reuses the complete Writing Task plus ReviewCard, and
Continuation reuses the current source-grounded `continuationAnalysis`; do not
invent duplicate AI summaries for those writing tasks. Never ask the worker to
guess reading slot, year, source identity, authoritative answers, deterministic
grammar answer forms, or Embedding vectors. Those are coordinator/indexer facts.
Similarity fields are not student-facing prose and must not make Screen, Print,
or PDF denser.

Reading A–D, Seven Choices, Cloze, and Grammar Fill also produce the required
student-visible `fullTranslationZh` in that same analysis pass. Seven Choices,
Cloze, and Grammar Fill translate the authoritative answer-completed passage
and retain each exact `[blankNo]` marker once in source-question order. Validate this field with the
type-specific validator's `requireFullTranslation: true` option before accepting
the staged result; never ask a renderer or a second model pass to fabricate it.
The same seven objective groups also produce 1–2 reviewed
`selectedLongSentences` with exact source anchoring, deterministic answer-filled
display text, question links, teacher-style analysis, translation, and sparse
underline spans. Validate them with `requireSelectedLongSentences: true`; PDF
rendering and Paper consumption must read the same sidecar rather than fork it.
Their `groups[groupId].teachingContent` is not a schema-name hint: the coordinator
must append the complete tracked
`schemas/paper-import/objective-teaching-content-v1.schema.json` to every
objective `outputContract`. Preserve that annex verbatim and validate its exact
text, paragraph, range, question, blank, and selected-sentence relations.

Do not ask one model context to draft the whole paper. Split generation by the
ten staged contracts: one focused worker for each Reading passage A–D, and one
each for seven choices, cloze, grammar fill, application, continuation, and the
bounded listening unit.
Each worker reads only its exact source group, authoritative answers, output
contract, and shared doctrine. The paper's single writer remains the
coordinator and writes or accepts one non-overlapping staged file at a time in
the same worktree; concurrent writers require separate worktrees. After all
nine files exist, run the deterministic projection once, then use a separate
read-only checker to look for cross-story contamination, non-exact evidence,
answer/ID drift, repeated stock prose, and density that does not match the
question's difficulty.

Use the Owner-selected B procedure in `docs/import/agent-contract.md`: normal
`create_thread` with `agent_mode: low`, `features: [fast]`, and explicit
`project: user_01M10H0ESEN0415NA8H878PCXJ/english-question-bank-import`.
Use the full Project ref, not a short name. Do not use a no-project Orb or override
its size. Low follows the configured routing; it is not an immutable Terra pin.
Do not call Oracle, `nck1_analyze_group`, `amp.ai.generate`, or another model.
The existing coordinator retains its submission, lease and workspace; only
bounded single-group requests and result files move between threads. Transfer
files explicitly, require matching contract/validator versions, and never
assume a child sees local commits or uncommitted files. Start only after files
are ready. Never copy claim receipts, whole-paper inboxes, or another group's
analysis into the worker. Workers must not invoke import APIs or spawn children.

Before accepting the start message, check actual Node 24 and project Ajv imports.
The project setup installs server dependencies including locked Ajv, but an
earlier setup failure can leave them absent. In the environment preparation
phase use `bash .agents/setup --analysis-only` if needed, then recheck. This
prepares analysis dependencies only, not OCR, ASR, rendering or databases.
Run the existing formal validators, not handwritten substitutes or JSON parsing
alone. All ten group types run
`node scripts/import-pipeline/validate-analysis.mjs request.json analysis-reading-b.json`
(substitute the group filename). The bounded request shapes are documented in
`scripts/import-pipeline/README.md`. This command never writes files. For Grammar
Fill, it runs the exported `stampGrammarFillDerivedFields` normalizer on an
in-memory copy before validation, as the full-paper gate does; do not ask the
model to supply deterministic tense, voice, agreement or answer-form fields.
For reading numeric range errors only, use
`node scripts/import-pipeline/derive-reading-ranges.mjs request.json raw-analysis.json prepared-analysis.json`.
Retain the raw file and never change answers, text or associations to pass.
This range repair is not available for other types. Missing dependencies are an
environment blocker, not permission to install tools or weaken checks mid-import.

Each worker reports path, byte count, SHA256, validation result and limitations,
then ends with final without waiting for acknowledgment. If messaging is absent,
put delivery information in final and stop. The coordinator downloads, checks
digests, revalidates and accepts files serially. Stop on unresolved failure; no
automatic retry, model upgrade, old-child resume or extra polishing pass. Run
`review.mjs verify-analyses <paperId>` for the full paper before Review; any
single-group PASS never replaces this gate or the Owner's teaching-content QA.

Application and Continuation use tracked composed output contracts rather than
scratch-only instructions. Build the Application contract with
`buildApplicationStagedAnalysisContract`; build the Continuation contract with
`buildNarrativeContinuationStagedAnalysisContract`. Each function appends its
tracked staged packaging file to the established type-specific base prompt.
Never pass either base prompt alone, hand-append a one-paper wrapper, or put
paper-specific people, perspective, events, or word counts into the reusable
packaging contract.

Within each staged-analysis shard, use one model pass by default. Do not add a
separate style rewrite pass merely to sound polished. If a fixed benchmark
shows that teaching prose changes facts or evidence, preserve the factual pass
and propose a separate constrained presentation pass before changing the
pipeline.

Before Owner Review:

1. run the normal schema/evidence validators;
2. apply the shared doctrine's silent quality gate;
3. for prompt or style changes, compare affected cases from the fixed benchmark
   on all six scoring dimensions;
4. fail closed on a prettier explanation that weakens evidence, overstates a
   conclusion, or treats a sample writing route as uniquely required.

Do not store commercial answer-book PDFs, copied explanations, or institutional
style imitation instructions in the repository. Distill teaching moves only.
