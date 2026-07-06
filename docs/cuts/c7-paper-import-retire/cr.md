# CR Review — c7-paper-import-retire

**Verdict: APPROVE (0 Must-Fix, 2 Should-Watch)**

Cold cold-read of the committed diff vs `github/main` @6824db0 (PR #263). Every
KEEP命门 verified zero-diff; every surgical verify edit verified minimal; full-repo
sweep for stranded references done. `verify:all` green (66/1 skip/0 fail), `build`
green. Delete-only, reversible, product-boundary cut. Ships.

---

## What I verified (evidence)

### 1. App.tsx surgery — COMPLETE, no dangling reference
`git diff` shows exactly the 12 deletions the plan lists: import@79, useState@564-570,
the 4 cross-resets (openDraftPaper, openMySpace, and 面A's two handlers), C7 back
handler, C7 open handler, mount block, prop@1895. Post-diff grep for
`paperImportRouteActive|setPaperImportRouteActive|openPaperImportWorkbench|paperImportOnBackToWorkbench|PaperImportWorkbench`
in App.tsx = **ZERO hits**. 面A handlers `paperImportAiOnBackToWorkbench` /
`openPaperImportAiWorkbench` are INTACT — only their single C7 cross-reset line each
was removed (visible in the hunk at @1752 and @1762). `tsc -b`+vite build passes,
so `noUnusedLocals` is satisfied — no orphan.

### 2. DEV deviation (removed assertion in verify-i1-paper-import-route.mjs) — CORRECT, not test-gaming
Removed line: `assert('App keeps C7 paper-import route distinct', appSource.includes("get('view') === 'paper-import'"))`.
- It pinned the OLD behavior this cut deliberately reverses. `grep -c "get('view') === 'paper-import'"` in App.tsx = **0** now → leaving the assertion turns CI red for an intentional removal. Removal is the correct disposition, not gaming.
- Minimal: only that one line; 面A's 18 other assertions in the file untouched. The kept discriminator at L31 (`get('view') === 'paper-import-ai'`) still holds — `'paper-import'` is not a substring of `'paper-import-ai'` (closing quote differs), so no false collision.
- Bare-delete is the right call over an assert-absent flip: this assertion belongs to the deleted C7 surface; "route stays absent" needs no standing guard on a reversible delete-only cut (build+full-surface-delete already cover it). An assert-absent would be over-engineering.

### 3. verify 三类手术 — each surgical, engine/面A refs preserved
- **h1d**: removed L31 `read()` of the deleted route + the 2 asserts that read it (would ENOENT). paperSurfaceAvailability body untouched.
- **i16a**: removed the one C7 entry from `invalidationRouteFiles`, kept `paper-import-ai/routes.mjs`. (Note: i16a self-skips in CI here — off-repo fixture absent — so its edit isn't exercised, but the diff is a trivially-correct single array-entry deletion.)
- **h11a**: removed `paperImport.ts` from `noIpv6Callers`, kept `paperImportAi.ts`. No count assertion on the array (safe).
- **owner-gate**: removed the comment + 3 C7 endpoints, kept the 6 面A endpoints.
- **h1c** (pure delete): file gone, removed from verify-ci registry AND README table row. Confirmed both.
- **c7-contracts / c7-publish**: comment-only diff (KEEP banner added), zero logic change. Correct — these test the ENGINE.
- **splitter hygiene (SW-1)**: removed the now-dead import, `c7Routes = createPaperImportRoutes()`, the 3 C7 route asserts, and the stale forbidden entry (with its `||` chain tail fixed). 面A asserts remain. Clean. Not in CI registry, so cannot affect `verify:all` green.

### 4. api.mjs boundary — correct
Only `createPaperImportRoutes` import@27 + registration@489 removed.
`ensurePaperImportDatabaseShape` (publisher) + storage imports
(`cleanupPaperImportTempArtifacts`/`listPaperAssetVersions`/`resolvePaperAssetReadPaths`)
still present. No C7-only symbol stranded.

### 5. KEEP命门 — byte-for-byte zero diff (confirmed via `git diff --stat`)
`server/paper-import/{publisher,validator,storage,multipart}.mjs`,
`server/paper-import-ai/**`, `data/sql/**` — all zero diff. `verify-c7-*` scripts
comment-only. `EntryModal` untouched. The "页面死引擎活" boundary is fully preserved.

### 6. Full-repo sweep — no stranded reference
Deleted files confirmed gone (feature dir, route file, service, h1c, smoke-c7).
Repo-wide grep for the deleted symbols (excluding 面A) returns exactly two hits,
both inert — see SW-2 below.

---

## Should Watch (non-blocking)

- **SW-1 — inert stale forbidden-entry in `verify-i1-paper-import-analysis.mjs:417`.**
  `assertAllowedScope()` still lists `file === 'app/src/features/paper-import/PaperImportWorkbench.tsx'`
  as a forbidden scope for a file that no longer exists. This is INERT on three
  independent grounds: (a) it's a `===` string compare in a `.filter()` predicate,
  not a `readFileSync` → no ENOENT; (b) `main()` (L608-613) never calls
  `assertAllowedScope()` at all — dead code in the run path; (c) even if called,
  this cut's diff touches no scope-relevant file so `shouldCheckScope=false`
  short-circuits before L417. The plan's Forbidden explicitly told DEV not to touch
  this file ("本刀 diff 不触发其 scope-guard"), so DEV leaving it is *correct per
  contract*. Flagged only as a minor inconsistency: DEV cleaned the *identical*
  stale entry in the sibling `verify-i1-paper-import-splitter.mjs` but not this one.
  Both this file and the splitter reference get deleted wholesale in Cut 2 anyway.
  No action required this cut.

- **SW-2 — inert prose comment `server/draft-paper/analysisText.mjs:49`** mentions
  `paperImportRoutes` in a doc comment ("same lookup paperImportRoutes/api.mjs use
  for…"). Not an import/symbol. Zero build/verify impact. PA pre-flagged this;
  intentionally left. No action.

---

## Data-contract notes
None. Delete-only, reversible, product-boundary. No schema / `data/sql/**` / VIEW /
publisher / validator / storage / migration / teaching-interpretation change.
Engine byte-for-byte KEEP. ADR-0016 命门 preserved.

## Self-Review Blind Spots (for a later Big CR)
- i16a's surgical edit is NOT exercised by CI in this worktree (self-skips on absent
  off-repo fixture). Verified only by static diff-read, not by execution. Low risk
  (single array-entry deletion) but unproven at runtime here.
