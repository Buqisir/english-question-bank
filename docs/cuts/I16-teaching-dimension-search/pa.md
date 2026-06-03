# PA Review — I16·A 教学维度检索层（后端，无 UI）

Reviewer: PA (fresh Opus, un-anchored). Branch `I16a-teaching-dimension-search`,
plan committed at `86b5eb2`. Cold-read; every code/data claim verified by path.

## Verdict

**APPROVE WITH MUST FIX** — 3 Must Fix, 2 Open PO Decisions.

The premise is **true** (a prior cut in this initiative was rejected on a false
premise; this one is not). I verified every load-bearing claim against real data:

- All four facet container shapes are exactly as the plan states (grammar/cloze
  keyed by questionId under `blanks{}`; seven/reading under `questions{}`), with
  the named fields present (`facetKey`/`blankType`/`role`, `roleFacet`/
  `positionFacet`/`primaryMechanismFacet`, `pos`/`signatureFacet`,
  `skill.{primary,secondary}`).
- `targetGroups` is present on every analysis file (length 1 for grammar/seven/
  cloze, length 4 for reading).
- The questionId→group join via `content.groups[].questionIds` is **total** on
  both real papers: reading's 15 questions split cleanly 3+4+4+4 across reading
  a/b/c/d with **zero orphans** on `paper-960d0f8d` and `paper-2024-jslk-english`.
- `resolvePaperAssetReadPaths` handles both on-disk layouts that actually exist
  (`versions/v1/` for 960d0f8d; bare paper-dir for 2024-jslk), so the reuse holds.
- Enums are fixed/enumerable in the generators+prompts+registry (cloze
  `VALID_POS` at `analyzeCloze.mjs:13`; seven roleFacet incl. `role.bridge`=承上启下
  at `prompts/seven-choices-analysis-v1.md:181`; reading skill object-enforced at
  `analyzeReading.mjs:146`). The retrieval layer only reads them.

The direction is right, the cut is correctly sliced (single medium backend cut,
no UI), and the TDD/verifier seam matches repo convention. Three data-contract
gaps must be closed in the plan before DEV, and two product decisions belong to
the PO. None invalidate the cut.

## Product Principle

Teacher task being enabled: "find me question groups that teach X" where X is a
**pedagogical** facet the teacher already thinks in (承上启下, 非谓语作状语, 推理题,
名词词性), not a bibliographic one (year/region/paper). Cut A builds only the
backend retrieval over already-structured analysis facets, group-level, query API,
no UI. Coverage = analyzed groups only, stated honestly. This is the smallest
self-contained slice that makes 找题-by-teaching real, and it generates no new
data and touches no contract — correct first cut.

## Exact Architecture Model

- **Source of truth**: on-disk analysis JSON under each paper-asset, read via the
  same walk `paperSurfaceAvailability.mjs` already uses (`readdirSync` over
  `paperAssetsDir` → `resolvePaperAssetReadPaths` → read `paper-asset.json` →
  read `analyses/<type>-analysis-v1.json`).
- **Join**: build `questionId → groupId` from `content.groups[].questionIds`,
  then for each analysis entry (keyed by questionId) resolve its group and union
  its facets into that group's bucket. Per-type `entryMapKey` (blanks vs questions)
  must be honored exactly as `paperSurfaceAvailability.mjs` already does (a prior
  cut, MF-1 in that file's comment, was bitten by assuming `questions`).
- **Aggregation**: `Map<groupId, GroupTeachingFacets>` where each field is a
  distinct set, populated only with the facets relevant to that group's type.
- **Query**: `queryGroupsByTeaching(index, filters)`; filters are per-type-domain,
  multi-value; empty filter returns all analyzed groups.
- **Exposure**: a new read-only route, registered through a route **factory**
  (the `serverRoutes` array at `api.mjs:419` is composed of `create*Routes()`
  factories — you do not push a literal into it; see MF-3).

## Must Fix Before DEV

### MF-1 — `signatureFacet` is sparse; do not market it as a co-equal cloze dimension
Verified on real data: **13 of 15 cloze blanks on paper-960d0f8d have NO
`signatureFacet`** (all four populated pos values are noun/verb/adj/adv, none are
`other`). `pos` is fully populated; `signatureFacet` is optional and mostly absent.
The plan lists cloze depth as "词性 `pos` + 考点 `signatureFacet`" as if equal.

Risk: (a) the extractor will crash or mis-bucket if it assumes `signatureFacet`
present; (b) a future find UI that surfaces "cloze by signatureFacet" returns
near-empty results, making the feature look broken. Also note: `pos==='other'`
is contractually forbidden from carrying `signatureFacet` (`analyzeCloze.mjs:209`),
so the extractor must tolerate its absence in two distinct cases.

Required disposition: plan must (1) state `signatureFacet` is optional/sparse and
the extractor skips it when absent (no crash, no synthetic value); (2) downgrade
`signatureFacet` to a best-effort secondary dimension in the objective text, with
`pos` as the reliable cloze dimension; (3) add a verifier assertion that the cloze
extractor produces correct `pos` for all blanks AND does not error on blanks
lacking `signatureFacet`.

### MF-2 — Coverage emptiness is real; the index must be honest about analyzed-vs-not
Verified: only **2 of 3** on-disk paper dirs have any analyses
(`paper-fe8e7a65` is an empty stray dir; `paper-2024-jslk-english` has only
seven-choices + reading, NOT cloze/grammar even though those groups exist in its
`content.groups`). So in live data the cloze/grammar facet index covers exactly
ONE paper. A query for "cloze pos=noun" returns one paper's groups; this is
correct but the index must distinguish "group exists but is not analyzed" from
"group analyzed, no such facet."

Risk: a downstream find UI cannot tell "no results because not yet analyzed" from
"no results, genuinely none" — that produces a false-empty experience and a
support burden. This is exactly the "fake availability" failure the PA charter
names.

Required disposition: plan must lock that the index surfaces ONLY analyzed groups
(an unanalyzed group is absent, never present-with-empty-facets), and that the
query result is honest — it never implies coverage it does not have. Add a
verifier case asserting: a group that exists in `content.groups` but has no
analysis file on disk (e.g. `paper-2024-jslk-english` grammar-fill) does NOT
appear in the index. Decide and record whether the response carries a coverage
note (this is also PO Decision #1 below — pick one and lock it).

### MF-3 — Route registration path in the plan is imprecise; lock the real seam
The plan says "注册进 `serverRoutes`，`api.mjs:419`." Verified: `serverRoutes` at
`:419` is `[...h1Routes, ...createMySpaceRoutes(), ... ...createQuestionGroupRoutes()]`
— a composition of route **factories**, not a literal array you append a route
object to. The availability reader is also wired with an `invalidate()` +
`getPaperSurfaceAnalysisAvailabilityByGroupId()` lazy-cache wrapper
(`api.mjs:262-267`) that DEV must mirror for the teaching index, or the cache
will go stale on re-import.

Risk: DEV either edits the wrong place (breaking the factory pattern) or ships an
index with no invalidation hook, silently serving stale facets after a paper
re-import.

Required disposition: plan must name the concrete seam — register the new
read-only route via its own `createTeachingFacetRoutes()` factory added to the
`serverRoutes` composition (or inside an existing factory), AND require an
`invalidate()` lazy-cache wrapper mirroring `paperSurfaceAnalysisAvailability`
(`api.mjs:46`, `:262-267`), wired to the same import/publish path that already
calls `paperSurfaceAnalysisAvailability.invalidate()`. Add a verifier/route
smoke assertion that the new endpoint is reachable.

## Must Fix -> Plan Disposition Checklist

| Must Fix | `plan.md` required disposition |
| --- | --- |
| MF-1 `signatureFacet` sparse | Locked decision: `signatureFacet` optional/sparse, `pos` is the reliable cloze dim; extractor skips when absent (incl. `pos==='other'`); add verifier assertion (pos for all blanks + no error on missing signatureFacet). Soften objective line 14. |
| MF-2 coverage honesty | Locked decision: index surfaces analyzed groups only; never present-with-empty; query never implies uncovered coverage. Add verifier case: unanalyzed group (jslk grammar-fill) absent from index. Resolve PO Decision #1 (coverage note in payload yes/no) and record. |
| MF-3 route seam + invalidation | Must Do step: register via route factory in `serverRoutes` composition (NOT literal append at :419); add lazy-cache `invalidate()` wrapper mirroring `api.mjs:262-267`, wired to the existing import/publish invalidation path. Add route-reachable verifier assertion. |

## Should Watch

- **SW-1 Reuse is real but thinner than "same module."** `paperSurfaceAvailability.mjs`
  checks *availability* (does every question have an analysis entry) and does not
  *extract* facet values; it also filters on `group.groupType === config.groupType`
  (line 73). DEV should copy the walk + entryMapKey + targetGroups pattern but will
  write new extraction logic. Treat as pattern reuse, not function reuse. Keep the
  groupType guard — it prevents cross-type mis-binding.
- **SW-2 Duplication with `listPaperAssetAnalysisGroupCards` (`api.mjs:1301`).** It
  runs the identical `readdirSync` + `resolvePaperAssetReadPaths` walk. Not a
  blocker (different output), but flag for CR-lite so the two walkers don't drift;
  a shared low-level "list analyzed paper-assets" helper could later dedupe.
- **SW-3 reading `skill` legacy array form.** The prompt shows both `["detail"]`
  (deprecated) and `{primary,secondary}`; the generator enforces object
  (`analyzeReading.mjs:146`) and both real files use object. Extractor should read
  the object form and ignore/skip anything else rather than assume — cheap defense.
- **SW-4 seven roleFacet real coverage < enum.** Real 960d0f8d has cohesion/topic/
  bridge but not `summary`; that is fine (coverage = analyzed). Don't let the
  verifier assert the full enum is present — assert only `cohesion`/`bridge` exist
  (as the plan already does). No action unless the verifier overreaches.
- **SW-5 dir-name vs paperId.** The walker keys by `asset.paper.paperId`, which on
  both real papers equals the dir name — but don't assume equality; use the
  asset's paperId for the analysis `paperId` match, as `paperSurfaceAvailability`
  already does (line 113, 68).

## Allowed Files

- `server/search/teachingFacets.mjs` (new — extractor + index + query)
- `server/api.mjs` (route factory registration + lazy-cache/invalidate wrapper)
- `scripts/verify-i16a-teaching-dimension-search.mjs` (new)
- `scripts/verify-ci.mjs` (append script path to the flat array, ~`:15`)
- `scripts/README.md` (document the new verifier)
- `app/src/domain/questionBank.ts` — ONLY if a read-only optional facet type is
  needed for a future consumer; type-only, no data-fetch change.

## Forbidden Files

- `server/paper-import-ai/analyze*.mjs`, `prompts/*-analysis-v1.md`, any
  `*.contract.md`, `grammarFillFacetRegistry.ts`, schema — read-only, no edits.
- `QuestionGroupCard` core fields / existing `/api/question-groups` response shape
  — facet index must be a separate endpoint (see PO Decision #2).
- Existing server search / steward / concierge.
- `app/public/paper-assets/**`, `.claude/launch.json` — never staged; no `git add -A`.

## Static Verify Requirements

`scripts/verify-i16a-teaching-dimension-search.mjs` (tsx/node, real samples), must
assert:
1. **Extractor per type, real 960d0f8d**: seven group's `roleFacets` includes
   `seven-choices.role.cohesion` AND `...role.bridge`; grammar group's `facetKeys`
   has >1 distinct incl. a `...non-finite` and `...coordinating`; grammar `role`
   captures the non-null `object`; cloze group's `pos` includes noun/verb/adj/adv.
2. **MF-1**: cloze extractor produces `pos` for ALL 15 blanks and does NOT throw on
   the 13 blanks lacking `signatureFacet`.
3. **Reading multi-group join**: each of reading a/b/c/d gets its own
   `skill.primary` set via questionId→group; 15 questions resolve 3+4+4+4 with no
   orphan; assert no question is dropped or double-counted.
4. **MF-2 coverage honesty**: a group present in `content.groups` with no analysis
   file on disk (e.g. `paper-2024-jslk-english` grammar-fill / cloze) is ABSENT
   from the index — not present-with-empty.
5. **Query**: `roleFacet=bridge` returns the seven group; `pos=noun` returns the
   cloze group; multi-dim AND narrows correctly; unanalyzed groups never appear;
   empty filter returns all analyzed groups.
6. **MF-3**: new route is registered and reachable (route-table presence or a
   minimal request smoke); `invalidate()` clears the cache.
7. Registered in `verify-ci.mjs`; `node scripts/verify-ci.mjs` green; no regression
   to `verify-h1d-analysis-availability` or paper-surface verifiers.

## Browser QA Matrix

None — this cut ships no UI surface. All behavior is proven by the verifier above.
(Confirm with PM that "no browser face" is acceptable for the gate; the plan
already states QA = query-behavior verification.)

## DEV Readiness

DEV-ready after the 3 Must Fix are recorded in plan.md and the 2 PO decisions are
locked. The teacher action (find groups by teaching facet), before/after, cut
boundary (backend index+query only), future boundary (B 主题, C 语态, 难度, UI all
out), allowed/forbidden files, verify script, and (empty) browser matrix are all
statable. Premise is verified true on real data — DEV is not building on sand.

## Open PO Decisions

Max 3 allowed; **2** open (under the limit):

1. **Coverage-note in payload?** Should the query response carry an explicit
   "these groups are unanalyzed / coverage = analyzed-only" signal, or is silent
   absence enough for cut A? (Engineering read: silent absence is fine for the
   backend; a one-line `coverage: 'analyzed-only'` marker is cheap insurance for
   the future UI. Recommend including it.) Resolution feeds MF-2.

2. **Endpoint vs attach (plan PA-ask #3).** Independent `GET /api/teaching-facets`
   vs augmenting `/api/question-groups` with optional `teachingFacets?`.
   (Engineering read: **independent endpoint**. Reasons: `/api/question-groups`
   cards are DB-sourced (`v_question_group_cards`, `api.mjs:1327`) with paper-asset
   cards only appended as a fallback; the facet index is disk-sourced and keyed by
   the same `groupId`, so a future find UI can join them client-side or via a
   dedicated query without touching the card contract. Attaching would couple a
   sparse, disk-derived structure to the primary card payload and risk the
   "no fake availability" rule. Recommend independent endpoint; this is also why
   `QuestionGroupCard` stays forbidden.) PO to confirm.

Note on plan PA-asks already resolved by PA (no PO needed):
- ask #1 (group-level distinct union as the FIND semantic): **correct** — you
  assemble a 题组, so "this group has a blank teaching 承上启下 ⇒ hit" is the right
  granularity for cut A. Question-level drill-down is a future-UI concern, not a
  contract change; leave it out now.
- ask #2 (reading multi-group join reliability): **verified total**, zero orphans
  on both real papers; the "skip gracefully if a questionId has no group" guard is
  still required (cheap) but no live case triggers it.
- ask #5 (forward-compat for cross-type B/bibliographic dims): the query interface
  is keyed by `groupId` and already shaped as `{ <domain>?: value[] }`. Since
  bibliographic dims (year/region/source/difficulty) live in the DB card keyed by
  the same groupId, B and the card dims compose at the consumer by groupId join —
  cut A does **not** need to pre-build a cross-type filter slot. Keep the contract
  minimal; do not pre-shape for B (avoid speculative generality). Record this as a
  locked non-decision so it isn't reopened.
