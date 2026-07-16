# Cut Note — grammar-facets-v2 (D1)

Cut: grammar-facets-v2 (D1)
Start date: 2026-07-15
Merge date: (pending)
PA rounds: 1 (docs/cuts/grammar-facets-v2/pa.md, shared PA session with similar-v2-engine/E5)
Big CR rounds: (pending)
Must Fix count: (see pa.md)
Token / cost notes: (main agent to fill at closeout)

This note is opened by DEV mid-cut (step 2 = plan steps 3–6) to record
disposition decisions that a fresh CR needs to judge, per coordinator
instruction (2026-07-15) — not yet a full closeout note.

## Shipped (this DEV segment)

- 33 `grammar-fill-analysis-v1.json` files rewritten in place to
  `schemaVersion: grammar-fill-analysis-v2` (facetKey八向/三新类/谓语三字段/
  role七格/form), each with a `.bak` pre-migration backup.
- `analysisConfigs` (teachingFacets.mjs, paperSurfaceAvailability.mjs)
  authenticate v2 / reject v1, same commit as the 33-file rewrite.
- I16·C verb-profile sidecar subsystem fully retired: `verbProfileSidecar.mjs`,
  `verbProfileBackfillService.mjs`, `verbProfileBackfillRoutes.mjs`,
  `backfillVerbProfiles.mjs` (discovered as a 4th in-scope file — the routes
  file's sole other dependency, orphaned once the route is gone),
  `scripts/import-pipeline/vp-driver.mjs`, `scripts/verify-i16c-grammar-verb-axes.mjs`
  deleted; the 11 on-disk `grammar-fill-verb-profile-v1.json` sidecars deleted
  (each `.bak`'d first); `POST /api/grammar-fill/verb-profiles/backfill` route
  wiring removed from `server/api.mjs`; `teachingFacets.mjs`'s
  `mergeVerbProfileAxes` removed — tense/voice/agreementSensitive now read
  straight off the v2 blank entry inside `extractGrammarFillFacets`.
- Import gate (step 4): `validator.mjs`'s `PAPER_IMPORT_SCHEMA_VERSIONS`
  swaps v1→v2 (any v1-shaped upload now hits `json.schemaVersionUnknown`);
  `packageBuilder.mjs`'s hardcoded output `schemaVersion`/`promptVersion`
  bumped to v2; `analyzeGrammarFill.mjs` points at a new 22-leaf
  `grammar-fill-facets-v2.json` registry and stamps
  `tense`/`voice`/`agreementSensitive`/`form` server-side (deterministic,
  never AI-authored) via a small `stampVerbAxes` addition.
- `grammarFillFacetRegistry.ts` (frontend data table) and
  `grammarFillAnalysisSurfaceAdapter.ts` (schemaVersion contract) updated to
  v2 — UI components themselves untouched (MF-3 boundary).
- New `scripts/verify-grammar-facets-v2.mjs` (67 assertions) registered in
  `verify-ci.mjs` + `scripts/README.md`.
- `docs/import/agent-runbook.md` grammar-fill hard-gate bullet updated to v2.

## Disposition items for CR judgement

1. **Prompt file naming (coordinator 2026-07-15, non-blocking, logged here
   per instruction):** `prompts/grammar-fill-analysis-v1.md` keeps its `v1`
   filename suffix but its content (leaf list, decision tables, schemaVersion
   example) was updated to v2 semantics — same pattern as every other
   analysis-file *filename* in this cut (`grammar-fill-analysis-v1.json` on
   disk also keeps its v1-suffixed name while its `schemaVersion` field says
   v2). The prompt edit was deliberately kept to a **minimal word-list-teaching
   replacement** (leaf key list, given/noun/adjective decision branches,
   schemaVersion/promptVersion examples, role 七格 clarification) rather than
   a full prose rewrite. CR should decide: rename the prompt file to
   `grammar-fill-analysis-v2.md` (sweep the one reference in
   `analyzeGrammarFill.mjs:8`) for naming consistency with the *content*
   version, or leave it — no functional difference either way, since the
   file is located by a fixed path, not by convention-matching.

2. **`server/paper-import-ai/analyzeGrammarFillVerbProfile.mjs` — NOT
   merged/reused, left as-is.** Plan's "复用指针" (PA C-1) named this file's
   `classifyFiniteVerbFormDeterministic`/`extractFiniteVerbBlanks` as the
   reuse target for the new v2 tense/voice/agreementSensitive derivation.
   Step 1 already diverged from it (built an independent derivation in
   `scripts/grammar-facets-v2-migrate.mjs` because touching consumer paths
   was forbidden at that step) and that step-1 derivation is what's now
   frozen into the 33 migrated files (owner-verified against
   `step1-samples.md`). For step 3/4, a **second, small, independent copy**
   of the same rules was added directly inside `analyzeGrammarFill.mjs`
   (`stampVerbAxes`) for new imports, rather than either (a) importing from
   `analyzeGrammarFillVerbProfile.mjs` (whose `agreement` axis is a
   different, 3-value subject-context enum — not the new boolean
   `agreementSensitive` — so it isn't a drop-in reuse anyway), or (b)
   reaching back into the already-verified migrate script (risk of shifting
   its frozen, owner-approved output post-hoc). Net effect: **three**
   independent copies of the same deterministic verb-axis rules now exist in
   the repo (migrate script, `analyzeGrammarFill.mjs`, and the untouched
   `analyzeGrammarFillVerbProfile.mjs`, which has zero live callers once the
   sidecar subsystem is retired — its only remaining consumer was its own
   verify script, `scripts/verify-i16c-grammar-verb-axes.mjs`, now deleted).
   `analyzeGrammarFillVerbProfile.mjs` itself was left completely untouched
   (not deleted — plan didn't name it for retirement, only the sidecar
   wrapper trio). This is a real, disclosed duplication tradeoff — CR should
   decide whether a follow-up cut should consolidate the two *live* copies
   (migrate script + analyzeGrammarFill.mjs) behind one shared module, or
   whether `verify-grammar-facets-v2.mjs`'s distribution/whitelist
   assertions are sufficient ongoing protection against drift.

3. **`.claude/contract-unlock` main-repo marker**: created once (by DEV) to
   pass the `PreToolUse` contract-file hook for the
   `grammarFillAnalysisSurfaceAdapter.ts` edit, which the hook resolves
   against the *main repo* path even while the session runs in the worktree.
   Coordinator ruled the edit itself in-scope and valid; the marker is the
   main agent's to remove at closeout (not DEV's), per corrected unlock
   discipline (dispatch-protocols: unlock/closeout are main-agent-only).

## Wrong Assumptions Found

- None discovered in the plan's locked semantics — all 8 owner-decided
  suspect dispositions matched the migrate script's own default proposal
  exactly (verified by direct comparison before writing), so no re-litigation
  was needed.
- One scope-size surprise (not a wrong assumption, a genuine ripple): step
  4's "publisher/analyzer 出口改 v2" required touching the AI facet registry
  + prompt content + 3 pre-existing verify scripts' (`i13`/`i4`/`i1`) stub
  literals to stay green — larger than a first read suggested, but confirmed
  in-scope by the coordinator (2026-07-15) rather than split off.

## Verify And QA

- Static verify: `pnpm -C app run verify:all` → 78 passed / 1 skip
  (pre-existing, unrelated off-repo fixture — `verify-i16a-teaching-dimension-search.mjs`,
  moved off the served path by an earlier `fixture-move` cut) / 0 failed.
  `npx tsc -b` (app) → 0 errors.
- Browser QA / D1→E5 real-DB QA: see `docs/cuts/grammar-facets-v2/qa-step2.md`.

## Watch / Follow-Up

- Follow-up gate: consider consolidating the 3 verb-axis derivation copies
  (see disposition item 2 above) into one shared module in a future cut.
- Prompt filename (`v1.md` vs v2 content) — CR call, item 1 above.

## Next Cut

- Step 6 (production sync) is prepared as an apply runbook only in this
  segment — no production write. See `docs/cuts/grammar-facets-v2/apply-runbook.md`.
