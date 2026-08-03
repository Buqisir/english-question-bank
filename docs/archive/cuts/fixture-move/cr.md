# CR — fixture-move (fresh cold read)

- Reviewer context: fresh, did not implement.
- Worktree: `/Users/huangxuewei/Projects/wt-fixture-move`, branch `fixture-move`.
- HEAD: `174501b`; baseline (merge-base w/ main): `37b96d6`.
- Diff read: `git diff 37b96d6...HEAD` (main has advanced past baseline via draft-docx merge; diffed against merge-base per cut instruction).

## Recommendation

**APPROVE** — no Must Fix. Diff is correct, in scope, and the换锚 / allowlist-retire behaviors are proven, not string-matched. Three non-blocking Should Watch below.

## Changed Scope (22 files, verified from diff)

- 3 fixture files `git mv` to `test-fixtures/paper-assets/paper-2024-jslk-english/` — `git diff -M` reports **R100** (100% rename, zero content bytes changed) on all three. History preserved.
- 15 consumer scripts (12 inline + 3 PAPER_ID-prefix): path-string only, assertion semantics untouched (read every hunk).
- `verify-h1d-analysis-availability.mjs`: one-line `paperAssetsDir` repoint (越单补漏 — see Findings).
- `verify-i16a-teaching-dimension-search.mjs`: +34 corpus-splice (换锚).
- `verify-paper-assets-consistency.mjs`: allowlist retired (-8).
- `scripts/README.md`: exactly line 139 (1/1), the consistency row prose — within the ":139 only" fence.

## Findings

### Must Fix
None.

### Should Watch

- **SW-1 (i16a corpus couples to server fs-walk internals).** The temp-corpus splice (`scripts/verify-i16a-teaching-dimension-search.mjs:47-60`) depends on `createTeachingFacetIndex`'s internal traversal: top-level `entry.isDirectory()` on `corpusDir` children (hence real dirs) plus transparent mid-path symlink resolution one level down (analyses/*.json symlinked). Proven sound today — the positive assertions (`jslk reading-a present`, `seven-choices present`, lines 347-354) pass, which only happens if the analysis files are discovered *through* the symlink layer. But a future refactor of `teachingFacets.mjs` (e.g. `realpath` dedup, or `lstat`/`isFile()` checks on analysis entries) could silently break — or falsely green — this corpus. Test-only blast radius; watch when `teachingFacets` changes. No more-direct approach was available given the top-level `isDirectory()` requirement forces real dirs for every paper, so the mkdtemp+symlink手法 is a reasonable首选 execution of the contract.

- **SW-2 (consistency head comment cites jslk as live example).** `verify-paper-assets-consistency.mjs:8-9` still names `paper-2024-jslk-english` as the "dir unknown to the DB" example. Post-move it is origin-story / historical incident context (why the guard exists), not a current served orphan. Mildly stale but not misleading — acceptable as-is; noted per review axis 5. The load-bearing deletions (KNOWN_FIXTURES set :136 + `continue` branch :147) are gone cleanly; the disk→DB loop now asserts `dbPaperIds.has(paperId)` for every disk dir with no escape hatch = strict "any orphan FAILs" semantics restored. No residual `KNOWN_FIXTURES` reference anywhere in `scripts/`.

- **SW-3 (i16a still depends on gitignored real paper `paper-960d0f8d`).** `:86` `base960` and the 960d0f8d index assertions (:356-372) require that paper present under `app/public/paper-assets/`. It is gitignored; DEV copied it into the worktree for self-verify per the plan's baseline discipline. This is **pre-existing** i16a behavior, unchanged in kind by this cut (the corpus now symlinks whatever served papers exist). Flagged only so a later reader does not mistake the worktree-green for clean-CI-green — see Blind Spots.

### On the h1d 越单 (review axis 3) — mechanical补漏, not overreach

The plan's consumer census (plan.md:26-31) missed `verify-h1d-analysis-availability.mjs`, which reads the jslk fixture via `createPaperSurfaceAnalysisAvailability({ paperAssetsDir })` and **is** registered in `verify-ci.mjs:32`. Left unrepointed it would drop `verify:all` from PASS — violating the plan's own Verification gate ("PASS 不降"). The fix is a single path-string change (`:50`), same-kind as the 15 census scripts, same assertions. This is closing a clerical omission to honor the acceptance gate, not scope expansion. Approve.

## Verification Evidence (re-run by CR, not copied)

- Rename integrity: `git diff -M --name-status` → 3× `R100`. Source dir `app/public/paper-assets/paper-2024-jslk-english` gone; new home has `paper-asset.json` + `analyses/{reading-choice,seven-choices}-analysis-v1.json`.
- Forbidden scope: `git diff --name-only` grep for `paper-import|docs/sources|verify-ci|backup-|server/|app/src|draftPapers|draft-paper` → **NONE**. (Those files appear inside the c6a/c6b scope-guard *output* only because those guards diff against advanced `main`, which carries draft-docx — a diff-base artifact, not a touch by this cut.)
- CI-registered affected scripts, re-run independently:
  - `verify-h1d-analysis-availability.mjs` → 25 passed / 0 failed (exit 0), repointed to `test-fixtures/paper-assets`.
  - `verify-paper-assets-consistency.mjs` → 166 passed (exit 0), strict form, no allowlist.
  - `verify-i16a-teaching-dimension-search.mjs` → 64 passed / 0 failed (exit 0); the 4 换锚 assertions intact: 2 negative (grammar-fill/cloze absent — genuinely exercised, jslk declares those groups but ships no analysis file) + 2 positive (reading-a/seven-choices present).
- Non-CI consumer spot-check (isolate fixture-load from scope-guard noise): `verify-i0e-seven-choices-entry.mjs` → 48 passed / 0 failed via the new path (copyFixturePaperAsset + readJson repointed). `verify-c6b2` / `verify-c6a-2` failures are **100% "changed-file-in-scope" guard hits — zero ENOENT / fixture-not-found** = repoint resolves correctly; the red is the known scope-guard reacting to any branch diff, matching the main agent's既有烂账 finding.
- Machine facts accepted from main agent (not re-run): verify:all 78 PASS/0 SKIP/0 FAIL in worktree; 13 non-CI c6a*/c6b* smoke red = scope-guard + main-line既有 functional failures.
- Commit hygiene: single squashed commit `174501b` since merge-base; working tree clean.

## Failure / Attack Angle

1. **Fake-green on the换锚 negative sample.** If the corpus splice failed to include jslk, the two "absent" assertions would pass *vacuously* (a missing paper is also absent from the index) — a false green hiding a broken corpus. Ruled out: the two *positive* jslk assertions (reading-a / seven-choices present) share the same corpus and would fail if jslk were missing; both pass. The honesty check genuinely exercises "declared group + no analysis file → absent."
2. **Weakened gate masquerading as cleanup.** The consistency allowlist deletion could have been a silent loosening. It is the opposite: it *removes* an escape hatch, restoring strict orphan-FAIL. Confirmed the `continue` is gone and no replacement allowlist exists.
3. **Stale served path left reachable.** A missed consumer would 404/ENOENT on the moved fixture. Grep for `app/public/paper-assets/paper-2024-jslk` across `scripts/` → NONE remain; every consumer re-runs clean or fails only on scope-guard.
4. **Branch-local green.** i16a/h1d self-verify leaned on gitignored real papers copied into the worktree — see Blind Spots; pre-existing, not introduced here.

## Self-Review Blind Spots

- **Clean-CI parity of i16a unverified.** I verified in the worktree, which contains DEV-copied gitignored papers (`paper-960d0f8d`). I did not stand up a pristine CI checkout, so i16a's green in the *actual* CI environment (which must seed those papers somehow) is unconfirmed. This predates the cut — jslk was git-tracked and always present, but the 960d0f8d assertions already depended on gitignored content before the move — so it is not a regression this cut introduced. Big CR / RM should confirm CI seeds `paper-960d0f8d` if i16a's CI history is not already known-green.
- **Destructive orphan-FAIL proof skipped.** I did not physically create a disk orphan to watch consistency FAIL (avoiding dirtying the worktree). The assertion structure (direct `dbPaperIds.has`, no allowlist) makes the failure path unambiguous by reading, but it is read-proven, not run-proven.
- **verify:all full re-run not performed by CR** (accepted as stated machine fact); I re-ran only the 3 CI-registered affected scripts + 3 consumer spot-checks.

## Residual Risk

Low. Pure scripts+fixtures cut; no runtime/server/schema/export surface touched (confirmed from diff). The one judgment call (i16a corpus splice) is proven behaviorally and contained to a test file. Production residual-dir deletion (DP-3) correctly remains a main-agent SSH step, outside this diff.
