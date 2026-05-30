# CR-Lite — I5 Writing AI Import

Reviewer follows `docs/agents/cr-persona.md` (reviewer ≠ implementer; the DEV
report is input, not truth — re-run verify and read the assertions).

Cut: `I5-writing-ai-import`
PR: pending PO push
Reviewer: 小川 (Sonnet 4.6, fresh session — did not implement this code)
Date: 2026-05-29
Diff under review: `b78f593..HEAD` (DEV commit `fd52a78` + subsequent docs commits)

---

## Changed Scope

11 files changed, 568 insertions, 235 deletions.

**Scripts (substantive)**:
- `scripts/verify-i2-seven-choices-ai-import.mjs` — scope-guard removal (gitLines, changedFiles, assertAllowedScope dead code); writing groups added to scFixtureParseResult() and threaded into 4 builds; 2 new writing-family reject fixtures added.
- `scripts/verify-i3-cloze-ai-import.mjs` — scope-guard dead code removed; assertAllowedScope/assertForbiddenScope calls removed from main().
- `scripts/verify-i4-grammar-fill-ai-import.mjs` — same.
- `scripts/verify-i5-writing-ai-import.mjs` — scope-guard dead code removed; `assertPublishPath()` added and called from main(); new imports (DatabaseSync, publisher, os/fs).
- `scripts/verify-i1-paper-import-route.mjs` — assertAllowedScope() call removed from main() (plan named i2–i5; DEV extended to i1).
- `scripts/verify-i1-paper-import-analysis.mjs` — assertAllowedScope() call removed from main() (same extension).

**Docs only** (no production code changed):
- `docs/agents/cr-persona.md` (new), `docs/agents/review-levels.md` (one-line update), `docs/cuts/I5-writing-ai-import/cr-lite-prompt.md` (new), `docs/cuts/I5-writing-ai-import/dev-prompt.md` (new), `docs/cuts/_templates/cr-lite.md` (minor).

No production runtime code changed. This diff is verify-scripts only.

---

## Findings

### Must Fix

**MF-1 — `verify-ci` exits 1: `verify-i1-paper-import-analysis.mjs::assertPublishPackageBuilder()` throws under six-family enforcement.**

Evidence from independent re-run:
```
node scripts/verify-i1-paper-import-analysis.mjs; echo "EXIT=$?"
... [19 ok lines] ...
[object Object]
EXIT=1

node scripts/verify-ci.mjs > /tmp/vci.txt 2>&1; echo "EXIT=$?"
VERIFY-CI EXIT=1
```

Root cause: `assertPublishPackageBuilder()` (line 446 of verify-i1-analysis) calls `buildPaperImportAiPackageFiles` with a **four-family fixture** — no `applicationGroup` / `continuationGroup` arguments. Under six-family enforcement (`packageBuilder.mjs:209`), this throws a plain `{ status, message }` object (not an Error). The main() catch does `String(error)` → `[object Object]`, sets `process.exitCode = 1`.

Context: at baseline b78f593 verify-ci also exited 1, but for a different reason: verify-i1-analysis's `assertAllowedScope()` was finding I5 docs files (e.g. `docs/cuts/I5-writing-ai-import/`) not in its allowedPrefixes, causing assertion failure before `assertPublishPackageBuilder()` ran. DEV's scope-guard removal from verify-i1 (an extension beyond the plan's "i2/i3/i4/i5") was correct in principle (PA ruling: no per-cut scope guards in verify:all) but incomplete — it exposed the broken four-family fixture without fixing it. The failure mode changed; the failure did not.

Plan requires verify-ci green. It is not.

**Fix required**: In `verify-i1-paper-import-analysis.mjs::assertPublishPackageBuilder()`, add writing groups to the fixture call and thread `applicationGroup` / `continuationGroup` into `buildPaperImportAiPackageFiles`, matching the verify-i2 task-1 pattern. The fixture needs six families to pass the six-family gate and reach the behavioral checks the function is actually testing.

---

### Should Watch

**SW-1 — `github/main...HEAD` dead code in verify-i1 files.**

`assertAllowedScope()` function bodies and `changedFiles()` helpers still exist in `verify-i1-paper-import-route.mjs` (line 59) and `verify-i1-paper-import-analysis.mjs` (line 78) — they reference `github/main...HEAD` but are no longer called from main(). The grep check mandated by the plan technically fails:

```
grep -r "github/main\.\.\.HEAD" scripts/verify-i1-paper-import-*.mjs
scripts/verify-i1-paper-import-route.mjs:59:  ...gitLines(['diff', '--name-only', 'github/main...HEAD'])
scripts/verify-i1-paper-import-analysis.mjs:78:  ...gitLines(['diff', '--name-only', 'github/main...HEAD'])
```

The dead code does not run and does not affect behavior. Not a blocker, but inconsistent with the cleanup intent and will confuse a future reader. Does not block this merge.

**SW-2 — verify-i4 / verify-i5 not in verify-ci registry; `assertPublishPath()` ungated in CI.**

`verify-ci.mjs` registers only i1, i2, i3 (lines 34-37). verify-i4 and verify-i5 pass by manual invocation only. The writing publish-path protection (`assertPublishPath()` in verify-i5, the only proof that writing groups persist at `group_type='writing'` and writing QA links lack questionId) would not be caught by CI if a future change to packageBuilder.mjs, publisher.mjs, or schema.sql regressed the writing publish path.

Decision: **Should Watch / Follow-up Gate**, not Must Fix for this cut. The plan does not task DEV with registering i4/i5 in verify-ci, and doing so without a plan is scope expansion. But it must be named: a protection the gate never runs protects nothing.

---

## Self-Review Blind Spots

1. **`assertPublishPath` QA-link URL structure.** The filter `!l.latestHref.includes('questionId=')` correctly identifies writing QA links only if no other family ever produces a link without `questionId=`. I confirmed from the PA report that "every other family sets questionId" and from the verify output that exactly 2 links pass the filter — but I did not read `publisher.mjs` directly to verify the URL construction path for cloze/grammar-fill links. If a future DEV changes those families to omit questionId, the assertion would pass with more than 2 writing links, masking a regression.

2. **`assertPublishPackageBuilder()` in verify-i1 was already broken at baseline.** I confirmed the failure is pre-existing by tracing the `assertAllowedScope()` logic, but I did not run the baseline binary to confirm this. If the pre-existing analysis is wrong (e.g., `assertAllowedScope()` passed at baseline and `assertPublishPackageBuilder()` was also failing), the bug's origin would be earlier than DEV's commit. This does not change the Must Fix requirement, but could change who owns the repair.

3. **The verify-i5 `i5PackageFixture()` in `assertPublishPath`.** I confirmed the fixture includes `applicationGroup` and `continuationGroup` by reading the code (lines 171-). I did not trace every field of the fixture through `buildPaperImportAiPackageFiles` to confirm it satisfies all six-family gate checks. The test passes, which is evidence but not proof of full fixture correctness.

---

## Verification Evidence

| Script | Result | Checks |
|---|---|---|
| `verify-i2` | **PASS** | 55 |
| `verify-i3` | **PASS** | 26 |
| `verify-i4` | **PASS** | 45 |
| `verify-i5` | **PASS** | 82 (incl. 4 assertPublishPath assertions) |
| `verify-c7-paper-import-publish` | **PASS** | 36 |
| `verify-ci` | **FAIL** | EXIT 1 (verify-i1-analysis exits 1) |
| `git diff --check` | **PASS** | clean |

assertPublishPath assertions confirmed green individually:
- `I5 publish six-family package succeeds` ✓
- `I5 writing groups persisted at group_type writing` ✓
- `I5 publish produces 2 writing QA links without questionId` ✓
- `I5 writing QA links reference paper asset` ✓

`grep github/main...HEAD` over verify-ci scripts:
- **Technically fails**: strings remain in dead code in verify-i1-route.mjs and verify-i1-analysis.mjs (see SW-1).
- **Functionally clean**: the strings are inside non-called functions and do not execute.

Browser QA: not run (later gate per plan).

---

## Named Focus Results

**Focus 1 — Scope-guard removal didn't drop a behavioural assertion: PASS.**

From the diff: in every edited verify script (i2/i3/i4/i5), the ONLY removals are `gitLines()`, `changedFiles()`, `assertAllowedScope()`, and `assertForbiddenScope()` — all dead scope-guard infrastructure. Every behavioral/contract assertion function (assertSplitterTextFixture, assertPackageBuilder, assertRouteContract, assertPublishPath, etc.) remains intact and is still called from main(). The green-ness of these scripts comes from fixing the cause (six-family fixture) and removing dead guards, not from weakening any behavioral check.

**Focus 2 — verify-i1 extension (DEV Note 1): IN-SCOPE, but incomplete.**

The PA principle states no per-cut scope guards should run inside verify:all. verify-i1-route and verify-i1-analysis are in verify-ci. Extending the scope-guard removal to verify-i1 is consistent with the PA ruling. However, the extension was incomplete: removing the scope guard from verify-i1-analysis exposed `assertPublishPackageBuilder()`'s four-family fixture failure that the scope guard was previously masking. DEV removed the guard; DEV should have also fixed the now-exposed fixture. This is the Must Fix.

**Focus 3 — assertPublishPath is not a fake green: PASS — genuine behavioral test.**

- (a) Uses `DatabaseSync` + real `schema.sql`: exercises the actual CHECK constraint `group_type IN ('reading','writing',...)`.
- (b) Calls `publishPaperImportPackage({ files, db, paperAssetsDir })` — the real publish code path, not a mock.
- (c) Queries `question_groups WHERE group_type='writing'` directly from the DB. If writing groups aren't persisted with the correct type, count would be 0 → assertion fails.
- (d) Filters `!l.latestHref.includes('questionId=')` and asserts length === 2. If writing QA links gain a questionId param or the count changes, the assertion fails.
- Each assertion would fail on regression. This is not a regex match, not dead code, not a vacuous pass.

**Focus 4 — Coverage gap, verify-i4/i5 not in verify-ci: Should Watch / Follow-up Gate.**

The assertPublishPath test is the only write-to-DB proof for the writing publish path. It passes by manual invocation but is not registered in verify-ci. A future change to shared publish code (packageBuilder, publisher, schema) could silently break it. Registering i4/i5 in verify-ci is out of scope for this DEV task (plan does not name it), but must be a named follow-up before relying on CI to gate writing-publish regressions.

**Focus 5 — Forbidden scope confirmed from diff: PASS.**

From the diff file list: no touch to `shared/papersurface/`, `app/src/shared-ui/papersurface/`, `schemas/paper-import/*`, `app/src/domain/paperAsset.ts`. `packageBuilder.mjs` is not in the diff — six-family enforcement (`packageBuilder.mjs:209-212`) is untouched. No sibling whitelist was re-added to any verify script.

---

## Failure / Attack Angle

1. **The verify-ci gate is red — this is the live attack surface.** If MF-1 is not fixed, the feature ships with a broken CI gate. A future maintainer who relies on verify-ci to catch regressions will get a false signal: they'll see verify-ci failing but assume it's "the I5 issue" when in fact CI is not protecting the writing publish path at all.

2. **Scope-guard removal + incomplete fixture update = a class of hidden four-family tests.** The removal of scope guards from verify-i1 revealed one broken test. There may be other tests in verify-i1 that rely on building a four-family package and would also fail under six-family enforcement. `assertPublishPackageBuilder()` is the only one I identified, but a future DEV who reads "verify-i1 passes" (when it does, after MF-1 is fixed) may not realize the fixture was patched rather than the tests redesigned. The four-family happy-path fixture is now a liability: it must always be kept six-family-complete or it will quietly break on the next enforcement tightening.

3. **Writing QA link filter is polarity-based.** The assertPublishPath assertion identifies writing links by what they *lack* (`questionId=`), not by what they *have*. If a bug in a future cut causes reading/cloze/grammar-fill links to also lose their questionId, `writingLinks.length` would appear inflated (e.g., 8 instead of 2), and the assertion would pass vacuously with a number > 2. The assertion checks `=== 2`, so this specific attack would actually *fail* the assertion (length 8 ≠ 2). But if exactly 2 non-writing links also lost questionId, the test would still pass despite the regression. This is a narrow attack angle — noted for the Big CR if one is ever run.

4. **assertPublishPath in verify-i5 runs AFTER assertRealDocx.** If the real-DOCX test (`assertRealDocx`) fails (e.g., on a machine without the owner's DOCX file), it exits early and `assertPublishPath` still ran before it (main() calls `assertPublishPath()` first, then `assertRealDocx()`). Confirmed from the diff: the order is assertRouteContract → assertPublishPath → assertRealDocx. So the publish test is not skipped when DOCX is unavailable. ✓

---

## Residual Risk

1. **verify-ci still broken post-merge if MF-1 is not addressed.** The plan gate cannot be considered satisfied until verify-ci exits 0.
2. **assertPublishPath is not in CI.** The writing publish protection is proven by a manual-only script. Regressions on the publish path would not be caught automatically until follow-up adds verify-i5 to verify-ci.
3. **Browser QA not yet run.** Browser QA matrix (plan §Verification, items 1–6) is a later gate and is not a CR blocker, but must run before RM. Specifically: the real DOCX parsing test (QA #6) on the PO's machine is the only validation of the writing splitter against a real exam.
4. **`assertAllowedScope` dead code in verify-i1.** Not a runtime risk but a maintenance risk: a future agent may mistake the dead function for an active guard.

---

## Recommendation

**APPROVE WITH MUST FIX — 1 item.**

The core correctness of all three PA Must Fix items is sound:
- verify-i2 is genuinely green at six families with the right reject ordering.
- Scope guards are gone from i2/i3/i4/i5 with no behavioral assertions lost.
- assertPublishPath is a real behavioral test that exercises the DB publish path.

One Must Fix blocks merge: **MF-1 — verify-ci exits 1** due to the broken four-family fixture in verify-i1-analysis. This is not a structural defect or a wrong-direction issue; it is a straightforward fixture update that matches the pattern DEV already applied to verify-i2.

This merge is NOT approved until MF-1 is closed and verify-ci exits 0.
