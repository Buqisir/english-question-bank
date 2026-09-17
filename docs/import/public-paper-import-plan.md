# Public-paper import: source fidelity, search metadata, and layout-only Owner Review

Status: **implemented locally; focused acceptance passed, Full has reconciled failures and one SKIP**. The local branch implements
`public-paper-v1` with digest-bound paragraph summaries, `public-search-metadata-v1.json` and its
prepare/finalize/verify CLI, immutable Review revisions, explicit promotion, publication/storage,
taxonomy/genre/count projection, and existing reading/seven-choice/cloze/grammar search consumption.
The writing-similarity UI remains pending. No production
cutover, import, promotion, or deployment is authorized, and the historical Full run recorded below
is not green.

## Owner outcome and approval boundary

New NCK1 import remains an AI-assisted source-processing job: OCR/extraction, proofreading,
source-answer transcription checking, and essential search classification are required. Automatic
schema, source, coverage, and answer checks remain publication gates. Missing pages or answers,
ambiguous source roles, answer conflicts, or unresolved source discrepancies fail closed through the
existing Materialization issues, source-answer checks, and validation gates; they are not converted
into layout-review tasks and require no additional factual-exception receipt.

The Owner reviews **only the final rendered layout**. Approval means that the exact immutable
revision's visible paper layout is acceptable; it does not mean the Owner checked summaries,
topics, semantic classifications, source accuracy, or answer mapping. UI, receipts, and promotion
must never describe layout approval as human semantic or answer verification. Source-answer variants
and their provenance remain existing source-authority text, distinct from platform human review and
from AI-generated suggestions; no new alternative schema is needed. AI must never become answer authority.

Keep one or two Chinese sentences per prose-body paragraph as a browsing aid. In parallel, produce
compact structured metadata for search; teaching prose is not a search contract. Do not add new
difficulty/CEFR judgments, translations, teaching explanations, evidence-coordinate spans,
embeddings/Jev, private editor/API billing, model essays, or automatic production calls.

## Deterministic source structure

- Stable ownership is `paperId -> groupId -> paragraphId/questionId` from materialization. Search
  records bind those structural IDs and source/candidate digests; OCR highlight rectangles and quote
  coordinates are evidence, never identity.
- `questionCount` is the count of materialized question IDs owned by the group. Writing groups have
  `questionCount: 0` and `taskCount: 1`. `paragraphCount` counts eligible
  prose body paragraph IDs after excluding title, instructions, options, tables/media, and supplied
  continuation starters. `wordCount` is computed from the exact public source text owned by those
  paragraph IDs: matches of `[A-Za-z]+(?:['’-][A-Za-z]+)*` after joining inline runs (a contraction or
  hyphenated form is one token), excluding blank numbers/prompts, options, chrome, answers, and model
  answers. Store the algorithm/version and text-scope IDs; never ask a model to estimate these counts.
- Paragraph summaries retain exact complete eligible-paragraph coverage. Listening supplementation
  still invalidates the bound sidecar and preserves the old file only as evidence.
- Grammar metadata preserves the target paragraph and the smallest conservative ordered context set
  proven by structural/source dependency; it never blindly prepends “the previous paragraph.” This
  is a validated metadata contract, not a claim that the standalone renderer consumes it today.

## Compact field / producer / consumer contract

| Data | Required producer and validation | Intended consumer | Current local state / gap |
| --- | --- | --- | --- |
| Source identity, bytes, locators, OCR/extracted text, source answers and variants/provenance | materializer + existing Materialization issues and deterministic source/coverage/answer checks | Review render, publication, correction audit | Implemented. Source answer variants remain existing authority text; no new alternative or factual-exception schema is required. Raw answer bytes stay evidence; answer-file model essays remain outside active materialization. |
| Structural ownership and counts | materializer assigns stable group/paragraph/question IDs; program derives versioned `wordCount`, `paragraphCount`, `questionCount`, and `taskCount` from the scopes above | filters, exercise assembly, completeness gates | Implemented through metadata validation and publisher projection. |
| Paragraph summaries | AI, one digest-bound summary per eligible paragraph; mechanical coverage validation | browse/search preview only | Implemented locally for `public-paper-v1`; not human semantically approved. |
| Topic taxonomy | AI selects one or more canonical `topicLabels`; validator rejects values outside the shipped taxonomy, and publisher resolves each label by table to `theme/themeGroup/subtopic` | public search/filter index | Implemented in sidecar, publication projection, and existing search. No invented topic fields. |
| Genre | AI classifies real text genre: `记叙` / `说明` / `议论` / `应用` / `新闻`; it is independent of question/group type | public passage search and publication projection | Implemented for validated public metadata. Legacy publication without metadata preserves an existing value with `COALESCE` semantics and never substitutes `group.groupType`. |
| Reading | AI supplies existing `similarityProfile.family/subtype/detailScope/technique`; program records deterministic A–D passage slot | per-question retrieval/filter | Implemented; existing search reads public metadata directly without requiring analyses. |
| Seven choices | AI supplies existing `positionFacet`, `roleFacet`, `primaryMechanismFacet` | per-blank retrieval and whole-passage practice | Implemented; existing search reads public metadata directly without requiring analyses. |
| Cloze | AI supplies existing per-blank `pos` and `signatureFacet` | blank retrieval plus group candidate retrieval | Implemented and consumed directly. Do not duplicate paragraph summaries into long emotion/event tables. |
| Grammar fill | AI supplies existing hint/source facts and `facetKey` / `role` / `similarityProfile.route/features`; program derives answer forms from authoritative source answers | per-blank retrieval | Implemented and consumed directly. `contextParagraphIds` remain preserved and validated, but the standalone renderer is not claimed to consume them yet. |
| Application writing | preserve full source task; AI classifies compact form/function metadata | whole-task retrieval | Compact sidecar production/validation are implemented; retrieval UI remains pending. Do not generate a model answer. |
| Continuation writing | preserve full source task/material/starters; AI records only minimal source-grounded situation, conflict, and relationships | whole-task retrieval | Compact sidecar production/validation are implemented; retrieval UI remains pending. Do not invent an ending, route, emotion arc, or model essay. |
| Scores and writing constraints | program derives NCK1 standard scores and preserves source writing limits | paper assembly/render/export | Enforce existing standard: reading 21–35 at 2.5, cloze 41–55 at 1, grammar 56–65 at 1.5, application 15, continuation 25; listening/seven-choice remain in their existing numbered section rules. Preserve source word-count/instruction constraints rather than model-normalizing them. |

`docs/product/similar-question-dimensions.md` remains authoritative for controlled subtype values and
ranking semantics. This plan reuses those classifications; it does not silently activate embeddings
or claim that the current search consumer reads them.

## Staged implementation and acceptance

1. **Contract inventory and schemas.** Use the versioned compact public search sidecar and existing
   Materialization/source-answer issue path. Reuse actual enums from existing analyzers/schemas, define topic/genre
   vocabularies and deterministic count/slot/answer-form algorithms, and bind all output to exact
   source/candidate IDs and digests. Do not mutate legacy analysis schemas in place.
2. **Production and validation.** Extend new-import preparation to run extraction/proofreading,
   source-answer transcription comparison, paragraph summaries, and compact metadata. Validate exact
   ID coverage, enum combinations, derivable values, source-answer provenance, and no forbidden
   fields. Existing Materialization/source-answer issues block revision readiness until resolved.
3. **Immutable Review.** Transport source bytes, materialization, summary digest, metadata digest,
   and validation receipt into one revision identity. Render all final paper surfaces. The approval
   action and receipt use the exact field `approvalScope: 'layout_only'`;
   they explicitly disclaim semantic/source/answer review.
4. **Publication and consumers.** Promotion remains a later explicit action and atomically checks the
   approved revision/digests. Topic taxonomy, genre, counts, and type-specific fields are projected;
   existing reading/seven-choice/cloze/grammar retrieval reads public metadata directly. Exercise old analyzed and new public revisions
   without fabricating missing fields or silently reclassifying legacy reviewed assets.
5. **Acceptance.** Fixtures cover OCR corrections, missing/conflicting answers, existing answer variants,
   stale bindings, invalid taxonomy/genre, exact paragraph/question ownership and counts, A–D slots,
   grammar cross-paragraph context, all writing constraints, altered approved bytes, explicit
   promotion, and rollback. Verify Screen/Student Print/Teacher Print/PDF layout and prove that layout
   approval alone cannot satisfy factual gates. Run the risk-classified final gates required by
   `AGENTS.md`; report every skip/failure literally.

## Current implementation and historical verification record

Local code initializes new raw sources as `public-paper-v1`, validates digest-bound paragraph
summaries and compact public search metadata, preserves immutable revision bindings, keeps historical
absent-profile/external analyzed assets on their prior `analysisDigest`, invalidates both sidecars
after a listening supplement, and requires explicit promotion. Publication/storage and current
non-writing search projection are implemented without analyses. Writing-similarity UI remains pending;
embeddings remain deferred. The local acceptance evidence and remaining limitation follow.

The earlier summary-only `pnpm -C app verify:all` invocation was **180 PASS, 1 SKIP, 1 FAIL**. A later
focused routing check passed after adjusting its pack assertion, but that does not turn the Full run
green. The skip lacked an off-repository fixture. Historical local browser checks and `git diff
--check` passed, but no paid experiment, semantic certification, live Owner acceptance, GitHub CI,
production cutover, or deployment is claimed.

### Search-metadata acceptance, 2026-09-17

- `pnpm -C app verify:all`: **179 PASS / 1 SKIP / 3 FAIL**, 1571.7 seconds.
  Original failures remain recorded, not relabelled: the image-source test expected the old
  summary-only readiness status, genre verification required literal NULL, and the new verifier
  was missing from the script index. After corrections each failed command passed independently:
  `verify-universal-nck1-image-source-bundle.mjs` PASS (including metadata CLI and real paper
  surfaces), `verify-genre-truth.mjs` 21 PASS, and `verify-architecture-housekeeping.mjs` 81 PASS.
  No second complete Full run is claimed.
- `verify-i16a-teaching-dimension-search.mjs`: **SKIP**, missing the explicit off-repository
  `paper-960d0f8d/versions/v1` fixture. Self-contained `verify-similar-v2.mjs` passed 90 checks,
  including metadata-only retrieval and stale-candidate rejection, but does not erase this skip.
- `verify-public-search-metadata-v1.mjs`, `verify-paragraph-summaries-v1.mjs`,
  `verify-public-paper-review-consumer.mjs`, `verify-universal-nck1-publish.mjs`,
  `verify-analyzed-package-review-e2e.mjs`, and `verify-import-paper-routing.mjs`: PASS.
  Public Review DOM checks confirm summaries default collapsed and approval is layout-only;
  the expanded reference-summary state was captured and visually inspected.
- All six local Actions E2E commands passed: draft pagination renderer (25), pagination DOM
  contract (32), A3 imposition (32), reorder suggestions (30), grammar-fill geometry, and golden
  path (19). Reorder and golden-path first attempts hit existing port listeners; isolated port
  overrides passed without stopping unknown processes or changing product code.
- Independent Standards/Spec review found published-source binding and explicit approval-scope
  defects. Fixes and targeted tests were independently rechecked: both source/candidate digests
  bind to published import metadata, malformed present metadata cannot fall back to stale analyses,
  and public approval requires explicit `approvalScope: 'layout_only'`.
- `git diff --check`: PASS. Logs are under `.scratch/public-search-metadata-acceptance/`.
  These checks establish local behavior, not AI semantic accuracy, Owner QA acceptance, a green
  natural Actions run, production migration, or permission to ship.
