# CR-lite — I16·C 语法填空·动词教学维度（时态 / 语态 / 主谓一致）

Fresh independent CR-lite, cold read of commit `8a6d152` against base `457ea42`
(plan+PA docs) / main `8b7740b`. Reviewer: 小川 (CR), 2026-06-03.
Branch `i16c-grammar-verb-axes`. Repo verified `/Users/huangxuewei/Projects/english-question-bank`.

## Recommendation

**APPROVE** — no Must Fix. Additive, isolated, deterministic-first classifier is
correct on the cases I probed (incl. several NOT in the verifier), all 5 PA Must
Fix dispositions are honored in code, forbidden scope is untouched and unstaged,
verify scripts genuinely exercise behavior, and the live headline demo works.

## Changed Scope

14 files, +1060. All inside the PA Allowed list:
- New: `grammar-fill-verb-axes-v1.json` (registry), `prompts/grammar-fill-verb-profile-v1.md`,
  `analyzeGrammarFillVerbProfile.mjs`, `verbProfileSidecar.mjs`, `backfillVerbProfiles.mjs`,
  `verbProfileBackfillService.mjs`, `verbProfileBackfillRoutes.mjs`, `scripts/verify-i16c-*.mjs`.
- Extended: `server/search/teachingFacets.mjs` (3-axis merge + filter wiring), `server/api.mjs`
  (route spread), `CONTEXT.md`, `scripts/README.md`, `scripts/verify-ci.mjs`, plan.md (MF-2 annotation only).
- `git show --stat 8a6d152` confirms NO `app/public/paper-assets/**`, NO `.env`, NO `.claude/launch.json` staged.

## Findings

### Must Fix
None.

### Should Watch (non-blocking)

- **SW-A `paperId` vs dir-name coupling.** `writeVerbProfileSidecar` resolves its
  write dir via `resolvePaperAssetReadPaths(paperAssetsDir, group.paperId)` where
  `group.paperId = analysis.paperId`. The index walks `readdirSync` *dir names*.
  These coincide today (verified both live papers: `dir == paper.paperId`), and
  the service comments the assumption explicitly. If a future paper's
  `analysis.paperId` ever differs from its directory name, the sidecar would be
  written under a non-existent dir and the index would never read it — a silent
  no-op, not a crash. Same assumption #180 retrieval already makes; acceptable for
  V0, watch when import paths change. (verbProfileBackfillService.mjs:70-73,
  verbProfileSidecar.mjs:20-23)

- **SW-B have-led forms discard a decidable tense/voice to AI.**
  `classifyFiniteVerbFormDeterministic({answer:'have been built'})` → `null` →
  AI, because `have` cannot fix subject number (have for I/you/we/they). Tense
  (present-perfect) and voice (passive) ARE decidable from the form, but the
  classifier returns null for the WHOLE triple, so the AI re-derives all three.
  This is the documented MF-4 design (agreement needs the subject) and is correct,
  not a bug — just a minor cost: a present-perfect-passive-plural answer costs one
  AI call it could partly avoid. `has been built` (number-fixing `has`) stays
  fully deterministic. (analyzeGrammarFillVerbProfile.mjs:87-92)

- **SW-C two provider call shapes.** The analyzer's *default* caller is
  `callDeepSeekJson` (env-key, ignores apiKey); the production service injects
  `makeDeepSeekProviderCaller` using `callChatCompletionsJson` with the
  client-supplied key. The route always injects, so the default is dead in prod —
  harmless, but the two shapes could confuse a future maintainer. No action.

- **SW-D / SW-1 (PA) re-import staleness.** Re-import rewrites the main analysis
  but not the sidecar → stale axes if blanks change. Already a recorded V0
  limitation; sidecar carries `paperId` but no `sourceAssetVersion`. No action.

## MF Disposition Audit (verified in code, not prose)

| MF | Claim | Verified |
| --- | --- | --- |
| MF-1 | sidecar lands in resolved baseDir (`versions/v1`, no phantom `latest/`) | TRUE. Both writer and index call `resolvePaperAssetReadPaths(dir, paperId)` with no version → identical baseDir resolution order (version→latest→highest vN→flat). verify Req7 asserts no `latest/` created; live sidecar confirmed at `versions/v1/analyses/`. |
| MF-2 | merge preserves existing facetKeys/blankTypes/roles/groupType + cross-type, adds 3 axes; no clobber | TRUE. Implemented as a dedicated `mergeVerbProfileAxes` pass that only `.add()`s to an *existing* bucket (`index.get(groupId)`); orphan sidecar (no main analysis) skipped, never creates a bucket. `extractGroupFacets` signature untouched → #180 verify still green (66). verify Req9 asserts all preserved + reading bucket untouched. |
| MF-3 | sidecar in tracked path must not be staged | TRUE. Forbidden honored: commit stages no paper-assets. Live sidecar lands in `versions/v1/` which IS gitignored (`*/versions/`); `git check-ignore` confirms; `git status` shows no verb-profile file. |
| MF-4 | agreement from subject context; prompt carries it | TRUE. have-led / bare verbs → null → AI; `buildVerbProfileMessages` forwards `subjectSignals` from `evidence` + `reason`. Prompt rule 2 names subject-derivation explicitly. verify Req4 asserts the subject signal reaches the prompt and method='ai'. |
| MF-5 | coverage honest = 1 group / 1 finite / 0 passive; passive by fixture | TRUE. Live run: `?tense=present&voice=active&agreement=plural` hits the one real group; `?voice=passive` returns empty. Summary counts profiledGroups/profiledBlanks honestly. verify Req11 proves passive via fixture only. |

## Classifier Correctness (probed beyond the verifier)

Ran `classifyFiniteVerbFormDeterministic` on forms NOT in verify; all correct:
`is made`→present/passive/sg, `were told`→past/passive/pl, `has been built`→
present-perfect/passive/sg, `is being built`→progressive/passive/sg, `was/were`
(be-hint)→past/active, `are present`(be-hint)→active (not passive — rule 5 honored),
`will be built`→other/passive/na, `had been told`→past-perfect/passive/na,
`is interested`/`are born`→passive by FORM (matches owner's 标全形态 A). Undecidable
forms (`means`,`broke`,`does`,`goes`,`being`,`been`,`cleaned`,`have *`) correctly
return null → AI. No misclassification or wrong null/non-null found.

## Verification Evidence (re-run myself)

- `node scripts/verify-i16c-grammar-verb-axes.mjs` → **63 passed, 0 failed** (exit 0).
- `node scripts/verify-i16a-teaching-dimension-search.mjs` → **66 passed, 0 failed** (#180 regression green).
- `node scripts/verify-ci.mjs` → **12 checks, 12 passed** (verifier IS registered in the CI gate).
- Forbidden files: `git diff 457ea42 8a6d152 --stat` on
  `grammar-fill-analysis-v1.md` / `analyzeGrammarFill.mjs` / `grammar-fill-facets-v1.json`
  / `deepseek.mjs` / `schema.sql` → empty (untouched). Provider helpers pre-exist.
- Live end-to-end: backfill (idempotent: re-run skipped=1), sidecar roundtrip,
  index merge, and the headline query all behave as claimed against the real corpus.
- The verifier exercises real code paths (builds a real index from a disk fixture
  with a paper that has `versions/v1` + NO `latest/`, runs the real merge + real
  `queryGroupsByTeaching`), not string-matching — it would fail if the merge
  clobbered or the filter mis-ANDed.

## Failure / Attack Angle

- **Could the merge clobber a bucket?** No — it never calls `index.set`; it only
  `.add()`s to an existing Set. An orphan sidecar is skipped. The only way to lose
  a facet would be the per-config `index.set` overwriting, but verb-profile is NOT
  a config — it runs after all configs. Verified Req9 + #180 green.
- **Could the endpoint break #180 backward compat?** No — `url?.searchParams`
  undefined → `{}` → `queryGroupsByTeaching(index, {})` returns all groups (live: 12).
  Router always supplies a real URL object (`router/index.mjs:26`).
- **Fake green?** The verifier's regression assertions (Req9/Req10) run the real
  index build + real query; they would fail on a clobber or a mis-filter. Req13
  diff-fence asserts the frozen registry/validator/schema/deepseek are untouched
  by string — weak as a fence (greps source) but corroborated by the empty
  forbidden diff above, so not load-bearing alone.
- **Misleading-on-clean-machine?** The live grammar-fill analysis is in a
  gitignored `versions/` path, so a fresh checkout has 0 grammar-fill data and the
  backfill is a no-op — but this is the honestly-stated MF-5 reality, and passive
  correctness is fixture-proven in the registered CI verifier, so the protection
  travels with CI. No branch-local green.

## Self-Review Blind Spots

- **AI fallback path on real DeepSeek.** I only exercised the deterministic path
  end-to-end (live "are" needs no AI). The AI branch (undecided blanks → prompt →
  parse → validate) is covered by injected-stub verify (Req4/Req5) but never hit a
  real DeepSeek response shape. If DeepSeek returns a `blanks` map missing a
  questionId, `assertValidProfile(questionId, undefined)` throws "缺少动词三轴" and
  the whole group fails into `failed[]` — reasonable, but unproven against a real
  model's quirks. Acceptable for backend V0; Big CR could probe if AI volume grows.
- **`agreement: 'na'` semantics breadth.** I confirmed `had`/modals → na and
  number-fixing leads → sg/pl, but did not exhaustively audit imperative /
  1st-2nd-person mapping (SW-5 in plan) — the registry+prompt define it; relies on
  AI for the ambiguous ones. Not a current-corpus risk (0 such data).
- **Concurrency of sidecar write under real load.** temp+rename with a uuid temp
  name is atomic per-write; I did not test two simultaneous backfills on the same
  paper. Single-user local tool, low risk.

## Residual Risk

Low. Backend-only, additive, no schema change, no UI, frozen contracts untouched,
zero #180 regression. The thin live coverage (1/1/0) is honestly stated and the
backfill is idempotent, so importing real grammar-fill 真题 later lights it up with
a re-run. Mergeable as-is.
