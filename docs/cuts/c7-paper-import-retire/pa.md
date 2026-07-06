# PA Review — c7-paper-import-retire

**Verdict: APPROVE**

Cold-read, independent verification against actual code (not the plan's claims).
Every coordinate, sole-importer claim, KEEP命门, and the crux verify three-way
classification was checked against the real files. The plan's DELETE/KEEP boundary
is airtight and `verify:all` will go green. No Must-Fix. Two Should-Watch (hygiene,
non-blocking). DEV may start.

---

## What I verified (evidence)

### 1. The 4 cross-reset call-sites + full App.tsx completeness — VERIFIED COMPLETE

Case-insensitive grep for `paperimport` (excluding `paperimportai`) in `App.tsx`
returns EXACTLY the 12 references the plan lists, no orphans:

- import@79, useState@568-572, cross-resets@**1690 / 1728 / 1779 / 1801**,
  C7 back handler@1750-1764, C7 open handler@1783-1792, mount@1854-1856, prop@1938.
- Read confirms 1779 lives inside `paperImportAiOnBackToWorkbench` (1766-1781) and
  1801 inside `openPaperImportAiWorkbench` (1794-1804) — both 面A handlers that must
  be KEPT, deleting only the single C7 cross-reset line each. Plan states this correctly.
- The C7 handlers (1750-1764, 1783-1792) are distinct, self-contained callbacks —
  cleanly deletable.
- useState@568-572 is a self-contained block; `?view=paper-import` is read ONLY at
  571 (deleted init) and 1786 (deleted open handler) — no other consumer, so the
  fallthrough-to-normal-workbench QA expectation holds. Exact `=== 'paper-import'`
  comparison, no `startsWith` collision with `paper-import-ai`.

This is the exact failure mode that bit ai-enhancement-retire; the plan accounts for
all four. `noUnusedLocals`/`tsc -b` will pass after the listed deletions.

### 2. Verify-script three-way classification — CRUX, ALL CLAIMS VERIFIED

`verify:all` = `node ../scripts/verify-ci.mjs` (app/package.json:13) — a **registry**,
not a glob. Confirmed.

**Pure delete (2):**
- `verify-h1c-paper-import-routes.mjs` — IS in registry (verify-ci.mjs:18). Its whole
  body reads/asserts the deleted route (h1c:28/30/35/53/54). Delete file + registry
  line + README.md:28. Correct.
- `smoke-c7-paper-import-workbench.mjs` — NOT in registry (confirmed absent). Pure
  file delete, no registry edit. Correct.

**Surgical (4, stay in registry, remove only deleted-thing refs):**
- `verify-h1d-analysis-availability.mjs`: `read()` helper (L13-14) is a bare
  `readFileSync` → throws ENOENT. Must delete L31 read + L50 + L51 asserts. Rest of
  script (paperSurfaceAvailability body) untouched. Correct.
- `verify-i16a-teaching-dimension-search.mjs`: `invalidationRouteFiles` L503-506; loop
  L507-508 does `readFileSync` → ENOENT if C7 entry (L505) left. Delete L505, keep
  L504 (面A). Correct.
- `verify-h11a-http-client.mjs`: `noIpv6Callers` L100-103; `read(rel)` (L57-58) bare
  `readFileSync` → ENOENT. Delete L101 (`paperImport.ts`), keep L102 (`paperImportAi.ts`).
  **No `.length`/count assertion on the array** (grep clean) → removing one entry is
  safe. Correct.
- `verify-owner-gate.mjs`: L147 comment + L148-150 (3 C7 endpoints) delete; 面A 6
  endpoints kept. Correct.

**KEY CLAIM — both independently verified:**
- `verify-i1-paper-import-analysis.mjs` (IS in registry, verify-ci:39): needs NO change.
  Confirmed for an even stronger reason than the plan states — its `main()` (L608-613)
  calls `assertStaticContracts` / `assertPublishPackageBuilder` / `assertAnalyzeValidation`
  and **never invokes `assertAllowedScope()`** at all (the scope guard is dead code here).
  Separately, its top-level imports (L8-11) are all 面A/engine KEEP files
  (`paper-import-ai/routes`, `analyzeReading`, `packageBuilder`, `validator`) — it does
  NOT import the deleted `paperImportRoutes.mjs`. Stays green untouched. Plan's conclusion
  correct.
- `verify-i1-paper-import-splitter.mjs` is NOT in the registry (confirmed absent) — never
  run by CI/`verify:all`. Its top-level import L10 `createPaperImportRoutes from
  '../server/paper-import/paperImportRoutes.mjs'` IS a load-time landmine if run directly.
  Plan's hygiene cleanup coordinates all match: import@10, `c7Routes = createPaperImportRoutes()`@156,
  3 C7 asserts@164-166, stale forbidden entry `PaperImportWorkbench.tsx`@143. Removing
  those leaves `assertRouteContract` sound (面A asserts@158-163 remain). Correct — and
  because it is non-gating, even if DEV skips it CI stays green (see SW-1).

**Keep + comment (2):** `verify-c7-paper-import-contracts.mjs` /
`verify-c7-paper-import-publish.mjs` have ZERO ref to the deleted UI/route (grep clean) —
test the engine (publisher/validator). Comment-only change is sufficient. Correct.

**Forbidden correctly protects `verify-i1-paper-import-route.mjs`** (IS in registry,
verify-ci:38): grep confirms it has no ref to any deleted file → leaving it untouched
is right.

### 3. multipart.mjs KEEP — VERIFIED CORRECT

`server/paper-import-ai/routes.mjs:1` imports `parsePaperImportMultipart`, used @89/152.
Deleting `multipart.mjs` this cut would break 面A. KEEP is correct (末刀 deletes it).

### 4. api.mjs boundary — VERIFIED, NO ORPHAN

- Delete: import@27, registration@489.
- KEEP@28 `ensurePaperImportDatabaseShape` (used @922), KEEP@29 storage imports
  (`resolvePaperAssetReadPaths`@353/1538, `listPaperAssetVersions`@625,
  `cleanupPaperImportTempArtifacts`@4417). No C7-only symbol orphaned. Correct.

### 5. Forbidden completeness / full-repo sweep — AIRTIGHT

Repo-wide grep for `paperImportRoutes|createPaperImportRoutes` (excluding 面A):
every hit is accounted for by the plan. Sole-importer claims all confirmed:
`PaperImportWorkbench` ← only App.tsx:79; `services/paperImport.ts` ←
only PaperImportWorkbench.tsx:19; `validatePaperImport`/`publishPaperImport` callers ←
only PaperImportWorkbench; `paperImportWorkbench.css` ← only PaperImportWorkbench.tsx:20;
feature dir empties after the 2 deletions. No missed deletable symbol that would strand
a reference.

---

## Should Watch (non-blocking)

- **SW-1 (verify-i1-paper-import-splitter.mjs is non-gating):** This script is NOT in
  the verify-ci registry, so `verify:all`/CI never runs it and its landmine import
  cannot turn CI red this cut. The plan's cleanup is pure hygiene (prevents a future
  `node scripts/verify-i1-paper-import-splitter.mjs` load-crash and stale forbidden
  entry). Good to do, but if DEV runs short, it is safe to defer — it does NOT gate the
  cut. Do NOT let it block `verify:all` green. (Cut 2 deletes the file wholesale anyway.)

- **SW-2 (inert prose reference):** `server/draft-paper/analysisText.mjs:49` contains a
  code COMMENT mentioning `paperImportRoutes` in prose ("same lookup paperImportRoutes/
  api.mjs use for..."). It is not an import or symbol — zero build/verify impact, no
  action required. Flagged only so CR doesn't mistake it for a missed reference. Optional
  one-word comment touch-up; not in scope.

---

## Data-contract notes

None. This is a delete-only, reversible, product-boundary cut. No schema, no
`data/sql/**`, no VIEW, no publisher/validator/storage logic, no migration, no
teaching-interpretation change. The engine (publisher/validator/storage/multipart +
paper-import-ai analyzers) is byte-for-byte KEEP; `api.mjs` table creation + static
serving untouched. `git diff --stat` self-certifies (plan C2/C5). The "页面死引擎活"
命门 in ADR-0016 is fully preserved.

---

## Must Fix → plan.md checklist

None. No Must-Fix. The plan already records every disposition verified above
(cross-reset list §删除-App.tsx, verify three-way §verify随动, multipart KEEP §D2/C2,
api.mjs boundary §删除-后端, Forbidden list, hygiene splitter §跨刀边界). No plan
edits required before DEV.
