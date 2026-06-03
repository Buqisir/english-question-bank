# CR-lite — I16·A 教学维度检索层（后端，无 UI）

Reviewer: CR-lite (fresh Opus, did not implement). Cold-read of `36b98cd`
(`git diff 05feb2f 36b98cd` + `git diff HEAD`). Branch
`I16a-teaching-dimension-search`, repo root verified, `pwd` matches.

## Verdict

**APPROVE WITH MUST FIX** — 1 Must Fix, 0 Should Fix, 3 Should Watch.

> **Resolution (2026-06-03):** MF-A fixed in `814b19b` — `invalidateTeachingFacetIndex()`
> wired into both non-AI publish sites (`paper-import/paperImportRoutes.mjs` `/publish`
> + `/revalidate-latest`); the fake-green verifier assertion replaced with one that reads
> the route files and requires teaching-invalidation ≥ surface-invalidation per file
> (was red before the fix). `verify-i16a` 66/66, `verify-ci` green. CR now clear to merge.

The core extraction / join / aggregation / query logic is correct, exercises real
data, and is honestly proven by the verifier. Scope is clean (no forbidden file
touched, no staged artifacts). One real runtime defect: the cache invalidation
hook was wired into only one of the three live paper-publish sites, so the
non-AI import path serves stale facets after a re-import — and the verifier is
too weak to catch it.

## Changed Scope

`git diff --name-status 05feb2f 36b98cd` — all six files are inside the PA/plan
allowed set; nothing forbidden:

- `server/search/teachingFacets.mjs` (new) — extractor + index + query + route factory
- `server/api.mjs` — index instance, context wiring, route composition, invalidate fn
- `server/paper-import-ai/routes.mjs` — invalidation hook on AI publish
- `scripts/verify-i16a-teaching-dimension-search.mjs` (new) — verifier
- `scripts/verify-ci.mjs`, `scripts/README.md` — registration

`git show 36b98cd --name-only` scanned for forbidden paths
(analyze*/prompts/contract/registry/schema/QuestionGroupCard/concierge/steward/
paper-assets/launch.json) → none present. `git diff --check` clean. No
`/api/question-groups` or card-contract change. `.claude/launch.json` is an
untracked local file, NOT staged in this commit.

## Findings

### Must Fix

**MF-A — Cache invalidation is wired into only ONE of three live publish sites;
the non-AI import path serves stale facets after re-import.**

The plan (Step 3) and PA MF-3 both require the new index's `invalidate()` to be
called **everywhere** the existing `paperSurfaceAnalysisAvailability.invalidate()`
is called ("已调 `paperSurfaceAnalysisAvailability.invalidate()` 的地方一并调本索引
invalidate" / "wired to the same import/publish path that already calls
`paperSurfaceAnalysisAvailability.invalidate()`").

There are three such live call sites:
- `server/paper-import-ai/routes.mjs:185` — **wired** (this commit added
  `context.invalidateTeachingFacetIndex()` here). Good.
- `server/paper-import/paperImportRoutes.mjs:35` (`POST /api/paper-import/publish`)
  — **NOT wired**.
- `server/paper-import/paperImportRoutes.mjs:43`
  (`POST /api/paper-import/revalidate-latest`) — **NOT wired**.

Both missed routes are mounted in `serverRoutes` (`api.mjs:436`,
`...createPaperImportRoutes()`), so they are live, reachable endpoints. The non-AI
publisher writes the same `analyses/<type>-analysis-v1.json` files this index reads
(`server/paper-import/storage.mjs:133-141` writes all four analysis files via
`writePaperImportVersion`/`writeLatest`; `publisher.mjs:460` `publishPaperImportPackage`).
Therefore: publish a paper through `/api/paper-import/publish` (or
`/revalidate-latest`) → on-disk analysis changes → `paperSurfaceAnalysisAvailability`
is refreshed, but `/api/teaching-facets` keeps serving the cached pre-import facet
index until the process restarts. This is precisely the "silently serving stale
facets after re-import" risk PA MF-3 was written to prevent.

Required change (DEV, not CR): add `context.invalidateTeachingFacetIndex()`
alongside `context.invalidatePaperSurfaceAnalysisAvailability()` at
`paperImportRoutes.mjs:35` and `:43`. The context already exposes
`invalidateTeachingFacetIndex` (`api.mjs:85`), so no further wiring is needed.

Also tighten the verifier so this cannot regress (see Failure / Attack Angle):
the current assertion is a fake-green (it greps the wrong file and never reaches
the publish handlers).

## Should Watch

- **SW-A (verifier fake-green) — the MF-3 invalidation assertion proves nothing.**
  `verify-i16a-...mjs:493-496` asserts `apiSource.includes('invalidateTeachingFacetIndex')
  || apiSource.includes('invalidatePaperSurfaceAnalysisAvailability')`, reading
  `server/api.mjs`. The wiring it claims to verify ("paper-import-ai routes invalidate
  ... too") lives in `routes.mjs` / `paperImportRoutes.mjs`, which the assertion
  never reads; the `||` also makes it pass on the pre-existing availability symbol
  in `api.mjs` regardless of the teaching index. It passes vacuously and missed
  MF-A entirely. Folded into MF-A's required change: assert each of the three
  route files actually calls `invalidateTeachingFacetIndex` on its publish path.
  Listed as SW because it is a verifier weakness, not a runtime defect on its own;
  but it must be fixed together with MF-A to prevent re-regression.

- **SW-2 (duplicate walk, carried from PA) — third copy of the paper-asset walk.**
  `teachingFacets.mjs:202-247` is the third `readdirSync(...withFileTypes) +
  resolvePaperAssetReadPaths` walk, alongside `paperSurfaceAvailability.mjs:104`
  and `api.mjs:1317` (`listPaperAssetAnalysisGroupCards`). Output differs (facet
  extraction vs availability vs cards), so not a blocker and correctly out of this
  cut's scope. No drift introduced; record so a future cut can extract a shared
  "list analyzed paper-assets" helper.

- **SW-B (theoretical present-with-empty) — does not occur on real data, low risk.**
  A group enters the index only when at least one analysis entry joins to it
  (bucket created lazily, `teachingFacets.mjs:92`), so "group present but no
  analysis" (the MF-2 contract) cannot happen — verified absent for jslk
  grammar-fill/cloze. A group whose every joined entry had all-null facets would
  serialize to just `{groupType}`; this does not arise on real data (grammar
  `facetKey` / cloze `pos` / reading `skill.primary` / seven `roleFacet` are
  reliably populated). The index still correctly means "analyzed", so MF-2 holds.
  No action; note for a future UI that renders facet chips.

## Self-Review Blind Spots

- I confirmed the non-AI publisher writes analysis files and that the two missed
  routes are mounted, but I did not run an end-to-end publish to observe the stale
  read live (no fixture for a full multipart publish in this session). The
  conclusion rests on static call-graph + file-write evidence, which is strong but
  not an executed reproduction.
- I did not independently re-derive the full grammar `facetKey` / seven `roleFacet`
  enum coverage on real data; I trusted PA's data-shape verification plus the
  verifier's concrete value assertions (`non-finite`, `coordinating`, `bridge`,
  `cohesion`, noun/verb/adjective/adverb), which do read the real files.
- `queryGroupsByTeaching` filters are single-value per key (`filters.facetKey` is
  one value, not an array), despite the plan/PA language about "multi-value"
  per-domain filters. This is a contract-shape question for the future UI, not a
  correctness defect in this read-only cut; flagging here so Big CR / the UI cut
  decides whether `value | value[]` is wanted before the endpoint has consumers.

## Verification Evidence

- `node scripts/verify-i16a-teaching-dimension-search.mjs` → **65 passed, 0 failed**
  (re-run, numbers mine, not copied from the report).
- `node scripts/verify-ci.mjs` → **CI verify passed** (includes the new verifier).
- `git diff 05feb2f 36b98cd --check` → clean.
- Cold-read of the extractor/join/MF-1/MF-2/query assertions: they exercise the
  real code on real `paper-960d0f8d` + `paper-2024-jslk-english` data and would
  fail on regression (MF-2 absence checks `!indexMap.has('group-2024-jslk-grammar-fill')`;
  MF-1 checks 13/15 without `signatureFacet` and `pos` populated; reading join
  asserts 3+4+4+4 with 0 orphans). These are genuine, not vacuous.
- Per-type `entryMapKey` honored: cloze/grammar read `blanks`, seven/reading read
  `questions` (`teachingFacets.mjs:22-49`) — not "questions everywhere".
- `groupType` guard present (`:88`) — prevents cross-type mis-binding (SW-1).
- Analysis matched by `asset.paper.paperId`, not dir name (`:211, :234`) — SW-5 honored.
- Orphan questionId → `continue`, no crash (`:86`); reading legacy array `skill`
  skipped (`:171`); `signatureFacet` absent → skipped, no synthetic value
  (`:162-165`) — MF-1 honored in code.
- Did NOT re-run `npm run build --prefix app` (no app/ source changed in this
  commit; pure server + scripts). Build risk is nil for this diff.

## Failure / Attack Angle

The concrete failure: a teacher (or the future find UI) re-imports a paper via the
non-AI `/api/paper-import/publish`, the analysis facets on disk change, and
`/api/teaching-facets` keeps returning the old index for the life of the process —
a "find by teaching dimension" result that silently disagrees with the published
paper. This hides behind a green verifier because the one assertion meant to guard
it (`verify-i16a:493`) reads the wrong file and is satisfied by an unrelated
pre-existing symbol — a textbook misleading green: the gate that should run never
reaches the publish handlers. A future agent reading "invalidation wired, 65/65
green" would reasonably assume all publish paths are covered; they are not.

Second-order misuse: because the query filters are single-value and there is no
HTTP-level smoke (only route-table presence), a future UI that passes
`facetKey=[...]` arrays would silently get zero matches with no error. Out of scope
to fix now, but the endpoint should not gain consumers before this is decided.

## Residual Risk

After MF-A (wire the two missed sites + fix the verifier assertion to read the
route files), residual risk is low. The cut is read-only, generates no data,
touches no contract, and the extraction/join is proven on both real papers. No
escalation to Big CR is warranted: the defect is a single missed call on an
existing, already-understood invalidation seam, not a data-contract or persistence
design flaw.

## Recommendation

**APPROVE WITH MUST FIX.** Mergeable once MF-A is closed:
1. add `context.invalidateTeachingFacetIndex()` at
   `server/paper-import/paperImportRoutes.mjs:35` and `:43`;
2. replace the `verify-i16a` invalidation assertion (`:493-496`) with one that
   reads `routes.mjs` AND `paperImportRoutes.mjs` and confirms each publish path
   calls `invalidateTeachingFacetIndex`.
SW-2 / SW-B / the multi-value-filter question are recorded, non-blocking.
