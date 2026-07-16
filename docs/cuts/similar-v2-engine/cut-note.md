# cut-note — similar-v2-engine (E5)

DEV implementation record. plan.md / pa.md in this same directory are the
execution contract; this note carries closeout facts the plan didn't need:
the retired verify's disposition, ledger items, and a discovered
plan-assumption contradiction.

## 1. `scripts/verify-similar-questions.mjs` (E1, 35 `assert(` calls) — disposition

Retired outright (`git rm`) and replaced by `scripts/verify-similar-v2.mjs`.
Registrations in `scripts/verify-ci.mjs` and `scripts/README.md` swapped in
the same commit. Every one of the 35 assertions is accounted for below —
none silently dropped.

Rationale for the file-level retirement (not a line-by-line patch): the old
file is real-DB/real-paper-asset-dependent (`SKIP` exit 2 off-repo), which
fit v1's density-scoring behavior but cannot exercise v2's branch-specific
paths (verb-vector, non-finite role incl. `predicative` — absent from the
real DB until D1 lands, SF-4 mixed-branch 400, honest-empty passages state)
without fixture data the real DB doesn't have yet. The new file builds its
own in-memory sqlite + temp paper-assets tree so it is green today, not only
after D1 merges.

| # | Old assertion (verify-similar-questions.mjs) | Disposition | New home |
|---|---|---|---|
| 1 | grammar seed: returns results | RETIRE | density concept removed entirely |
| 2 | grammar seed: seedProfile.groupType is grammar_cloze | RETIRE | redundant with branch-specific v2 fixtures |
| 3 | grammar seed: top result has a facet-density reason | RETIRE | `facet-density` kind removed from v2 vocabulary |
| 4 | grammar seed: excludes the seed's own group | MIGRATE | pool self-exclusion re-asserted generically across all v2 branch fixtures |
| 5 | grammar seed: excludes same-source-paper groups | MIGRATE | same-paper exclusion re-asserted (poolStats independent-recompute assertion) |
| 6 | grammar seed: top density >= tail density (ranked) | RETIRE | density concept removed entirely |
| 7 | reading seed: returns results | RETIRE | reading small-question is now boolean hit, not density |
| 8 | reading seed: all results are reading groups | MIGRATE | pool groupType purity implicit in reading small-question fixture (only reading groups ever entered into that pool) |
| 9 | reading seed: some result has a facet-density (skill) reason | RETIRE | kind renamed `facet-hit`, re-asserted under new name |
| 10 | reading seed: word-count neighborhood ordering | RETIRE | word-count proxy fully removed (program.md v2) |
| 11 | reading slot: independently recomputes to slot 3 | MIGRATE | rewritten for `/api/similar-passages` fixture (own SQL recompute of the same `(year,region,paper_name)` slot key) |
| 12 | reading slot: seed group resolves to slot 2 | MIGRATE | same as #11, fixture-driven |
| 13 | reading tier: decoded **secondary** value falls in tier range | MIGRATE+REWRITE | tier moved from secondary to **primary** layer in v2 (PA C-3); new assertions decode `Math.floor(score/10000)` instead |
| 14 | reading tier: worst same-slot secondary beats best adjacent-slot secondary | MIGRATE+REWRITE | rewritten as the 分层不翻转 assertion (worst same-tier mock_exam vs best adjacent-tier real_exam) |
| 15 | cloze seed: pool has both matched/unmatched (discourse_type non-constant) | RETIRE | cloze small-question retired entirely (400) |
| 16 | sevenChoices bonus = topic density + 8*discourse | RETIRE | sevenChoices small-question retired entirely (400); bonus layer removed from small-question skeleton |
| 17 | multi-seed: two runs byte-identical | MIGRATE | determinism re-asserted with two finite-verb seeds in the same group |
| 18 | multi-seed: seedProfile facetKey union has both blanks' facetKeys | MIGRATE+REWRITE | seedProfile shape is now branch-specific; re-asserted via the finite-branch `tense`/`voice`/`agreementSensitive` union |
| 19 | empty seeds → 400 | MIGRATE | unchanged validation, re-asserted verbatim |
| 20 | unknown questionId → 400 | MIGRATE | unchanged validation, re-asserted verbatim |
| 21 | writing seed → 400 | MIGRATE | unchanged behavior; fixture DB now includes a writing group directly (no separate isolated memDb needed since the whole DB is already a fixture) |
| 22 | poolStats.totalInPool matches independent recompute | MIGRATE+REWRITE | pool definition changed to a hard gate (dimension-hit); recompute updated to the v2 gate (finite-branch presence test) |
| 23 | poolStats.returned equals results.length | MIGRATE | unchanged invariant |
| 24 | AI daily-limit used count unchanged | MIGRATE | unchanged property, re-asserted verbatim |
| 25 | route: POST /api/similar-questions is registered | MIGRATE | re-asserted, plus a new sibling check for `/api/similar-passages` |
| 26 | route round-trip: 200 status | MIGRATE | rewritten against v2 fixture seed |
| 27 | route round-trip: body has results array | MIGRATE | rewritten, plus a passages-route counterpart |
| 28 | api.mjs imports createSimilarQuestionsStore | MIGRATE | unchanged — api.mjs was **not touched** this cut (both routes/methods added inside the existing factory functions) |
| 29 | api.mjs imports createSimilarQuestionsRoutes | MIGRATE | same as #28 |
| 30 | api.mjs adds createSimilarQuestionsRoutes() to serverRoutes | MIGRATE | same as #28 |
| 31 | api.mjs exposes similarQuestionsStore on serverContext | MIGRATE | same as #28 |
| 32 | verify-ci.mjs registers verify-similar-questions.mjs | MIGRATE (rewritten filename) | now asserts registration of `verify-similar-v2.mjs` **and** absence of the retired filename |
| 33 | scripts/README.md documents verify-similar-questions.mjs | MIGRATE (rewritten filename) | now asserts `verify-similar-v2.mjs` is documented |
| 34 | analysisConfigs still has exactly the 4 known groupTypes | MIGRATE | unchanged property; protects the Forbidden boundary (teachingFacets.mjs untouched) |
| 35 | teachingFacets.mjs GET /api/teaching-facets route text unchanged | MIGRATE | unchanged property; same Forbidden-boundary protection |

**Totals: 9 RETIRE / 26 MIGRATE (of which 5 required a rewrite, not a verbatim port), 0 silently dropped.**

## 2. reasons/chips contract table

See `docs/cuts/similar-v2-engine/reasons-chips-table.md` — the single
kind→recipe→example-label table required by plan.md §4, kept next to (not
inside) the engine source since it also documents the passages endpoint's
recipe, which has no chip-consuming UI yet.

## 3. Ledger item — frontend `SimilarQuestionReasonKind` type is now stale

`app/src/domain/questionBank.ts` (lines ~619-657) declares
`SimilarQuestionReasonKind` as the six v1 kind values
(`facet-density | topic-match | pos-density | secondary | position-slot |
topic-diff`) and a `SimilarQuestionsResponse`/`SimilarQuestionResult` shape
matching v1. The v2 engine now emits a different five-value vocabulary
(`topic-match | position-slot | authentic-source | facet-hit |
verb-vector`) and the small-question response no longer carries a `bonus`
layer.

This is **not** fixed in this cut — `app/src/domain/` is a hard-guarded
contract path (`.claude/hooks/guard-contract-files.mjs`) and this cut's
Forbidden list is explicit: "不动 UI 组件... UI 改动留给 E6/E7". Checked the
actual runtime risk before leaving it alone:
`SimilarQuestionsRailView.tsx` renders every `reason.label` unconditionally
(no `switch`/whitelist on `reason.kind` — the SW-1 constant-discourse
filter was already removed in engine-rewire), so the type staleness is a
**documentation drift**, not a runtime crash or silent-drop risk today. E6/E7
should update the type + add a `verb-vector`/`authentic-source`/`facet-hit`
chip treatment (and add a passages-response type) when it wires the UI to
the new endpoints.

## 4. Discovered contradiction — plan's "端点无 UI 消费者时上线无害" is false for `/api/similar-questions`

plan.md §收口 assumes shipping ahead of E6/E7 is harmless "when the endpoint
has no UI consumer." That holds for the **new** `/api/similar-passages`
endpoint (grepped `app/src` — zero references anywhere). It does **not**
hold for the **rewritten** `/api/similar-questions`:

- `PaperBrowsePage.tsx:257` — `SIMILAR_SUPPORTED_GROUP_TYPES = new Set(['reading', 'cloze', 'sevenChoices', 'grammarFill'])`
  still gates the live "配相似" CTA on all four group types, including
  cloze/sevenChoices.
- Clicking "配相似" on a cloze/sevenChoices question still POSTs to
  `/api/similar-questions` (`app/src/services/similarQuestions.ts`, unchanged
  this cut) — which this cut now makes return `400` with message
  "完形/七选五的小题相似已下线，该题型走篇章相似" for those two group
  types.
- `SimilarQuestionsRailView.tsx`'s error branch renders that message with a
  "重试" button — **not a crash**, but a dead-end retry loop: the button
  never succeeds until the CTA is retargeted to `/api/similar-passages`
  (program.md: "讲评态旧「配相似」钮保留、改指篇章相似" — explicitly E6/E7
  scope, out of bounds here per Forbidden).

**Net effect if this ships standalone (ahead of E6/E7):** every teacher
who clicks "配相似" on a cloze or sevenChoices question sees a coherent but
permanently-stuck error state, until E6/E7's CTA retarget lands. Reading and
grammarFill small-question CTAs keep working (their recipes changed
mechanics but not the 400/200 shape the UI already handles).

This is a genuine sequencing risk, not something DEV can resolve within this
cut's Forbidden boundary — flagging for owner/PM: either gate the deploy on
E6/E7 landing together (plan's other stated option: "部署随 E6/E7 同批"), or
accept the temporary degraded CTA for cloze/sevenChoices as a known,
short-lived rollout gap.
