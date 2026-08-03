# C7 Big CR Report — Opus

Reviewer: external high-reasoning CR (Opus, via Plan Architect persona).
Cut: C7 — Whole Paper Import Workbench / 整卷导入工作台.
PR: #91 (`codex/c7-import-workbench`).
Base: `main` at `a84df1f` (post PR #90 merge).
Head reviewed: `5a28af9` (`test(C7): harden publish atomicity proofs`).
The body of the diff was first read at `279b0c2`; the single
follow-up commit `5a28af9` was re-read and the relevant findings
below were updated.
Mode: code review only. No code edits, no implementation suggestions
beyond the minimal-fix sketch needed to describe each finding.

Scope read for this review:

- `docs/cuts/C7-whole-paper-import-workbench/{pm-spec,decisions,dev-plan,pa-review,big-cr-prompt}.md`
- `docs/adr/0004-c7-paper-import-atomicity.md`
- `docs/adr/0005-c7-versioned-file-protocol.md`
- `schemas/paper-import/*.schema.json`
- `server/paper-import/{validator,publisher,storage,multipart}.mjs`
- `server/api.mjs` diff (paper-import endpoints, static handler,
  availability cache)
- `app/src/services/paperImport.ts`
- `app/src/features/paper-import/PaperImportWorkbench.tsx`
- `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`
  diff
- `app/src/features/paper-intelligence/paperIntelligenceRoute.ts` diff
- `app/vite.config.ts` diff
- `data/sql/schema.sql` diff
- `scripts/verify-c7-paper-import-contracts.mjs`
- `scripts/verify-c7-paper-import-publish.mjs`
- `scripts/smoke-c7-paper-import-workbench.mjs`
- Fixtures under `test-fixtures/paper-import/paper-2024-jslk-english/`

---

## 1. Verdict

**REQUEST CHANGES.**

Data-contract layer and atomicity scaffolding are sound. The seven
hard gates from the prior PA round are mostly visible in the diff:

- G1 (schema + offline validator standalone) — present;
  `verify-c7-paper-import-contracts.mjs` covers it.
- G2 (validate API performs no persistence) — confirmed.
- G3/G4 (atomicity tests + simulated DB failure leaves latest intact)
  — present; `publisher.publishPaperImportPackage` exposes
  `forceDbFailure` and `verify-c7-paper-import-publish.mjs` asserts
  versioned dir removed, latest preserved, DB row count unchanged.
- G5 (temp public root + temp DB smoke) — present;
  `smoke-c7-paper-import-workbench.mjs` uses `mkdtempSync` and the new
  `QUESTION_BANK_PAPER_ASSET_ROOT` env.
- G6 (`paperAsset.ts` frozen) — confirmed by diff.

Blocking issues fall into two clusters: (a) the latest-swap is not
atomic and does not match ADR 0004's "latest changes last and stays
usable on failure" contract, and (b) the version-number lifecycle
between failed and successful publishes is ambiguous between the code
and ADR 0004. Forbidden-scope audit also surfaces two touches that
need to be acknowledged explicitly rather than absorbed silently.

Implementation quality is acceptable. The corrections requested are
edge-of-protocol corrections, not direction changes.

---

## 2. Must Fix (blocking)

### MF1 — `swapPaperImportLatest` is not atomic; the "latest is always readable" invariant in ADR 0004 can be violated.

`server/paper-import/storage.mjs::swapPaperImportLatest`:

```
if (existsSync(latestDir)) {
  renameSync(latestDir, previousLatest)   // step A
  movedPrevious = true
}
renameSync(tempLatest, latestDir)         // step B
```

Between step A and step B there is a window in which `latest/` does
not exist on disk. During that window:

- `sendPaperAssetStatic` returns 404 to PaperSurface fetches.
- `getPaperSurfaceAnalysisAvailabilityByGroupId` (when its cache is
  null, e.g. immediately after a publish-driven invalidation) `continue`s
  past this paper, hiding the `阅读解析` entry from search cards.

V0 is single-user/local and the window is short, so the probability of
observing it is low. But ADR 0004 explicitly promises:

> "The latest directory is the teacher-facing file view. It changes
> last."

and:

> "A failed publish cannot make teacher links point at half-published
> latest files."

The current code can produce a transient state where `latest/` is
missing entirely, which is strictly worse than "half-published" — it
is "no published". That is the contract this ADR is meant to forbid.

Minimum fix sketch (pick one; do not implement here):

1. Single-rename strategy: write the new contents into a sibling temp
   dir, then perform a single `renameSync(tempLatest, latestDir)`. On
   POSIX this is atomic for files but for directories it requires the
   destination to be empty or non-existent. Practically: remove
   `latest/` first into a `.latest-prev-*` *after* writing the new
   `latest/` succeeds — i.e. invert the order so the window has
   `latest/` always present, never absent.
2. Pointer file: keep `latest/` as a tiny file (e.g. `current.txt`)
   pointing at `versions/vN`; teachers' code reads through that
   pointer. `latest/` directory becomes a pure read-through.
3. Reader-side fallback: if `latest/` is missing, both
   `sendPaperAssetStatic` and `getPaperSurfaceAnalysisAvailabilityByGroupId`
   fall back to `versions/v{maxN}/`. Document the fallback in
   ADR 0004 as the official swap-window cover.

Whichever option is chosen must be reflected in ADR 0004 so the code
and the contract converge. If option 3 is chosen, both reader code
paths must be updated; today neither does this fallback.

### MF2 — Failed publish silently consumes a version number; ADR 0004 and the implementation disagree.

`publisher.publishPaperImportPackage`:

```
const version = computeNextPaperAssetVersion(paperAssetsDir, paperId)
...
writtenVersion = writePaperImportVersion({ ..., version })   // creates versions/vN/
db.exec('BEGIN')
...
upsertPaperAssetToDb(db, ..., version)
...
catch (error) {
  db.exec('ROLLBACK')
  if (writtenVersion) {
    removePaperImportVersion({ paperAssetsDir, paperId, versionName: writtenVersion.versionName })
  }
  ...
  // paper_import_runs row written with status='failed' and asset_version=N
}
```

Behaviour today: a failed publish writes a `paper_import_runs` row
with `status='failed'` and `asset_version=N`, but removes the on-disk
`versions/vN/`. The next publish calls
`computeNextPaperAssetVersion`, which scans `versions/` directory
entries — N is missing, so the next publish *reuses* N.

The previous PA round (E1 on PR #90) recommended:

> "If versioned file writing fails midway, C7 must delete any
> partially written files under `versions/vN/` and not retain a
> failed-publish artifact under that version number. Version number
> `vN` is consumed only on success. Failed publish attempts produce a
> publish report under `versions/vN-failed-{timestamp}/` outside the
> canonical version sequence."

ADR 0004 in this PR does not encode that decision. The code path
above is the second strategy ("vN is reusable on failure"). Both
strategies are defensible; the problem is that **the DB row and the
filesystem disagree about which one is in force**:

- DB believes `(paper_id=X, asset_version=N, status='failed')` exists,
  then a later success row writes `(paper_id=X, asset_version=N,
  status='published')` via `ON CONFLICT(paper_id, asset_version) DO
  UPDATE SET ... status='published'`. The failed row is silently
  overwritten — no audit trail of the prior failure.
- Filesystem behaviour is "vN reusable" (consistent with the DB
  overwrite).
- ADR 0004 reads as "version is consumed once" (consistent with E1
  language from PA review).

Minimum fix sketch:

- Pick one rule and write it into ADR 0004 explicitly.
- Make `paper_import_runs` carry a separate `run_id`/`attempt_no` so
  failed attempts are preserved even if their `asset_version` is
  reused.
- If "vN reusable" wins, the DB `ON CONFLICT DO UPDATE` is fine but
  must be documented as intentional overwrite of a prior failed row.
- If "vN consumed" wins, then `computeNextPaperAssetVersion` must
  consult both the filesystem *and* `paper_import_runs.asset_version`
  to compute max+1, and failed publishes must leave behind a marker
  (`versions/vN-failed-{ts}/publish-report.json` per E1).

### MF3 — `paper_asset_versions` upsert can quietly promote a failed row to published; tied to MF2.

`publisher.mjs` line 285:

```
INSERT INTO paper_asset_versions (...) VALUES (..., 'published')
ON CONFLICT(paper_id, asset_version) DO UPDATE SET ... status = 'published'
```

Today the failure branch of `publishPaperImportPackage` does not write
to `paper_asset_versions`, only to `paper_import_runs`. So the
`ON CONFLICT DO UPDATE` clause has no observable victim in the current
control flow. It is, however, dead code that paints over future
failure marks if MF2 is resolved by making the failure path write to
`paper_asset_versions` as a marker.

Minimum fix sketch:

- If MF2 is resolved by "vN reusable, failed attempts leave no
  on-disk marker": change the upsert to `ON CONFLICT DO NOTHING` and
  raise a clear error if the row already exists with
  `status='published'` (republish over self is then a true error,
  not a silent rewrite).
- If MF2 is resolved by "vN consumed, failed attempts leave a
  marker": failure branch writes a `paper_asset_versions` row with
  `status='failed'`; success branch must `ON CONFLICT DO UPDATE` only
  when `status='failed'`, and explicitly refuse to overwrite a
  `status='published'` row.

In either case the implicit "rewrite failed to published" semantics
must go.

### MF4 — Cleanup gaps leave `.latest-prev-*` / `.latest-tmp-*` and `versions/.tmp-*` residue on disk after some failures.

`storage.swapPaperImportLatest` catch block:

```
try {
  if (existsSync(tempLatest)) rmSync(tempLatest, { recursive: true, force: true })
  if (movedPrevious && existsSync(previousLatest) && !existsSync(latestDir)) {
    renameSync(previousLatest, latestDir)
  }
} catch {
  // Preserve the original swap failure.
}
```

Two leakage cases:

1. If `renameSync(tempLatest, latestDir)` partially succeeds (rare but
   possible across filesystems), `previousLatest` may remain on disk
   indefinitely. Its name is randomised (`.latest-prev-${randomUUID()}`),
   so it will never be reclaimed by a later publish.
2. `writePaperImportVersion` creates a `.tmp-vN-${randomUUID()}` dir
   under `versions/`. If the process crashes between `mkdirSync(tempDir)`
   and `renameSync(tempDir, versionDir)`, that tmp dir remains; no
   later code path scans for or cleans it.

V0 single-user local, so disk consumption is small. But these
artifacts have non-deterministic names — they cannot be cleaned by a
later "skip if already exists" check, and they accumulate over
re-publish iterations during development.

Minimum fix sketch:

- On `ensurePaperImportDatabaseShape` (or a dedicated startup hook in
  `server/api.mjs`), walk
  `app/public/paper-assets/*/{.latest-tmp-*,.latest-prev-*}` and
  `app/public/paper-assets/*/versions/.tmp-*`, remove them.
- Or rename to fixed names (`.latest-prev`, `.latest-tmp`, one-per-
  paper) so a subsequent publish reclaims them deterministically. This
  also makes concurrent publish behaviour explicit (fails fast when a
  prior in-flight publish left a tmp dir).

---

## 3. Should Watch (non-blocking)

### SW1 — `sendPaperAssetStatic` path-traversal check is asymmetric.

```
if (!relativePath || relativePath.includes('..') || path.isAbsolute(relativePath)) { ... }
const filePath = path.join(paperAssetsDir, relativePath)
if (!filePath.startsWith(path.resolve(paperAssetsDir)) || ...) { ... }
```

`filePath` is built with `path.join` (not resolved), but the prefix
check resolves `paperAssetsDir`. If `paperAssetsDir` is a symlink or a
non-canonical absolute path, the `startsWith` comparison can disagree.
Low risk in practice (the env default is a resolved absolute path),
but resolving both sides is one line and removes the foot-gun.

### SW2 — `parseJsonStrict` code-fence detection is intentionally shallow; document it.

```
if (trimmed.startsWith('```') || trimmed.endsWith('```')) {
  throw new Error('JSON 文件不能包含 Markdown code fence。')
}
```

This is correct for the failure modes the spec calls out (AI-emitted
fences). It will not flag fences inside a JSON string value, which is
the right call (those are legal JSON). Worth one line of comment
above the check so a later contributor does not "harden" it into
something that breaks legal fixtures.

### SW3 — `validateReadingAnalysisBundle` treats `unsupportedClaim` purely via `option.trap?.primaryType`.

If a wrong option arrives with **no** `trap` field but a non-empty
`trapEvidence` array, the unsupportedClaim branch is not entered, and
each `trapEvidence` row is treated as ordinary evidence subject to
paragraphId/quote resolution. That is technically schema-legal (schema
does not require `trap` on wrong options) but semantically muddy —
the design contract is "wrong options either have `trap` or are
unanalysed".

Recommendation: emit a `warning` (or `blocking`, PM call) when a wrong
option in Reading A-D has `trapEvidence` but no `trap`. Currently it
silently flows through.

### SW4 — `import-meta.groups` keys are not cross-checked against `paper-asset.content.groups`.

`publisher.upsertPaperAssetToDb` reads `importMeta.groups?.[group.groupId] || {}`;
an import-meta with a typoed `groupId` silently degrades to no
overrides, with no surfaced warning. Suggest a warning when an
`importMeta.groups[*]` key has no corresponding paper-asset group.

### SW5 — `paper_import_runs.validation_report_json` carries the full public validation report; can grow large per row.

`publisher.mjs`:

```
... INSERT INTO paper_import_runs (..., validation_report_json, ...)
VALUES (..., ?, ...)
JSON.stringify(publicValidation)
```

For a real paper this serialises every evidence quote, every trap
explanation, etc. V0 local is fine, but the row is not query-shaped
— it is audit data — and the full report is already mirrored in
`versions/vN/validation-report.json`. Worth either capping the JSON
size or storing only issue counts in the DB row, and treating the
file as the canonical audit artifact. Cloud-migration note.

### SW6 — `paperSurfaceAnalysisAvailabilityByGroupIdCache` is in-process; future multi-process deployment will desync.

`server/api.mjs` invalidates the cache to `null` on every successful
publish and `revalidate-latest`. V0 is single-process, so this is
fine. Cloud migration with multiple API workers will need either a
shared cache or per-request rebuild. Record in the cloud migration
note (ADR or doc, when written).

### SW7 — `app/src/services/paperImport.ts` hardcodes `API_ORIGIN = 'http://127.0.0.1:8787'` for non-localhost hosts.

Acceptable for V0 (it is gated behind a hostname check), but mark as
a V0 constraint in a code comment so future cloud / staging
deployments do not silently route through localhost.

### SW8 — `PaperImportWorkbench.handleValidate` and `handlePublish` do not reset previous `publishResult` before retry on the same files.

If validate passes, publish succeeds, then the user uploads a *new*
file without removing old ones, `publishResult` from the prior round
stays mounted in UI state until a new publish completes. Minor UX
sharp edge; only flag because it can confuse PO QA. (The current
`addFiles` / `removeFile` already reset `validation` and
`publishResult`, but the "user re-validates without changing files"
flow does not — by design — clear the publish result. Fine, but
document.)

---

## 4. Test / verify gaps (false-positive and missing-proof risks)

### TG1 — `verify-c7-paper-import-publish.mjs` does not exercise a successful second publish.

The script tests: validate failure → write failure (since `5a28af9`)
→ first publish succeeds → forced DB failure → assert latest
unchanged (`latestBeforeFailureBytes` byte-compare added in
`5a28af9`). It does **not** test: first publish → second publish of
the same fixture → assert v2 created, latest swapped to v2, DB shows
two version rows. Dev-plan lists this in the manual browser QA matrix
only.

This remains the single most important automated gap — `5a28af9`
strengthened the failure proofs but did not add the successful
republish case. Republish is the core repeat-use case and the place
MF2/MF3 will bite.

Recommendation: extend the verify script with one more
`publishPaperImportPackage` call after the forced-failure case, and
assert:

- `versions/v2/paper-asset.json` exists, `assetVersion === 2`
- `latest/paper-asset.json` reflects v2
- `paper_asset_versions` has rows for v1 and v2 both
  `status='published'`
- `paper_import_runs` has the expected sequence of runs (success,
  fail, success, plus the new validate-failure and write-failure
  rows produced earlier in the script).

### TG2 — System-derived `assetVersion` overrides user-supplied value silently.

`writePaperImportVersion::makeVersionedArtifacts` does
`paperAsset.paper.assetVersion = version`, with `version` from
`computeNextPaperAssetVersion`. The fixture's `paper.assetVersion: 1`
is correct for first publish but on republish the input file's value
is overridden without surfacing this to the validator's warnings
list. Suggest a `warning` when `importMeta.paper.year`/`paperName`
imply a republish but the input asset version disagrees with system
derivation. (Low priority; record only.)

### TG3 — `verify-c7-paper-import-contracts.mjs::forbidden scope` uses `git diff --name-only github/main`.

That assumes a remote named `github` exists locally and points at
`main`. CI / fresh clones may not have that remote. If the script
fails to run on a clean checkout, the forbidden-scope gate silently
disappears. Either:

- Pin the verify script to `git diff --name-only $(git merge-base HEAD origin/main)..HEAD`
  (with fallback), or
- Document the prerequisite in dev-plan and CI.

### TG4 — Smoke test does not cover republish swap interruption.

The smoke covers happy path + DB failure (indirectly via the verify
script). It does not simulate `swapPaperImportLatest` failing
mid-rename. Given MF1, this is the most material gap; recommend at
least a unit-style test in `verify-c7-paper-import-publish.mjs` that
monkey-patches one of the rename steps to throw, then asserts old
latest contents are preserved byte-for-byte.

### TG5 — No assertion that PaperSurface harness `version` route does **not** fall back to legacy on a real paper.

`PaperIntelligencePaperSurfaceHarness` adds a "legacy root fallback"
branch when `initialVersion` is absent. Tests confirm latest and
versioned URLs load. They do not confirm the fallback only triggers
on missing files — a regression that hides a 404 inside the fallback
would not be caught by current tests. Suggest one assertion: when
both `/latest/paper-asset.json` and `/paper-assets/<id>/paper-asset.json`
exist, the latest path wins.

---

## 5. Forbidden-scope audit

### Frozen surfaces — confirmed untouched

- `app/src/shared-ui/papersurface/**` — clean.
- `shared/papersurface/**` — clean.
- `server/print-renderer.mjs` — clean.
- `app/src/domain/paperAsset.ts` — clean.
- `app/src/features/reading-analysis/**` — clean.

### Boundary touches that need explicit acknowledgement

**FB1 — `app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx`** was modified (+18, −4).

The prior PA round listed this file in the forbidden set. The actual
change here is narrow:

- Adds optional `version?: string | null` prop.
- Switches the fetch base URL between `/latest/` and `/versions/vN/`.
- Adds a legacy-path fallback when the new layout is missing.

The change does not touch PaperSurface rendering or PaperAssetV1
types. It is in fact required for the version-pinned QA link contract
to work end-to-end (otherwise `?version=v1` links cannot load), and
the legacy fallback protects G7 ("existing entries do not disappear
during signal-source switch").

Recommendation: **accept this exception**, but the PR description
should explicitly call it out, and the relevant PA doc
(`pa-review.md`) should note that the harness file is forbidden
*except for URL routing and version-param plumbing*. Without that
written exception the next agent will read the forbidden list and
think a rule was broken.

**FB2 — `data/sql/schema.sql`** was modified (+25 lines).

Two new tables (`paper_asset_versions`, `paper_import_runs`) and two
indexes. No ALTER on existing tables. View
`v_question_group_cards` unchanged.

The migration is purely additive and uses `CREATE TABLE IF NOT
EXISTS`. `ensurePaperImportDatabaseShape` runs the same statements
inside `server/api.mjs::ensureDatabaseShape`, so an existing local
database gets the new tables on next server boot.

Recommendation: **accept**, but document the addition in ADR 0005 (or
a small follow-up ADR) so a future cloud migration plan does not miss
the schema delta. The current ADR 0005 says nothing about DB schema
changes.

---

## 6. Merge recommendation

**Do not merge yet.** The blocking items are localised — `storage.mjs`
swap logic plus the version-lifecycle contract — and do not require
re-architecting. Recommended next steps for Codex:

1. Pick a resolution for MF2 (vN reusable vs. vN consumed) and write
   it into ADR 0004 as a normative paragraph. This unblocks MF3 (DB
   semantics follow the choice).
2. Fix MF1 by either inverting the rename order, switching to a
   pointer-style latest, or adding a documented reader-side fallback
   for the swap window. Update ADR 0004 to match.
3. Fix MF4 with a startup sweep or fixed-name tmp/prev directories.
4. Extend `verify-c7-paper-import-publish.mjs` with the second
   successful publish case (TG1) and a swap-interruption case (TG4).
5. Add a one-paragraph "forbidden-scope exceptions" note to `pa-review.md`
   covering FB1 and FB2 so future reviewers do not re-litigate.
6. (Optional, can be follow-up) SW1, SW3, SW4 are small and would
   make the validator/server more honest about edge cases; would
   prefer them in this PR but they are not blocking.

After those land, this PR is ready to ship. The architecture choices
in C7 are correct; the issues are protocol-edge corrections, not
direction changes.

### Note on follow-up commit `5a28af9`

While this report was being drafted, branch head advanced from
`279b0c2` to `5a28af9` (`test(C7): harden publish atomicity proofs`).
That commit:

- Adds two new pre-existing publish proofs to
  `verify-c7-paper-import-publish.mjs`: validate-failure (no files,
  no DB tables) and write-failure (paperAssetsDir set to a regular
  file, throws before DB transaction, no DB tables).
- Tightens the latest-bytes assertion after forced DB failure with a
  byte-compare against the pre-failure snapshot.
- Moves the `paper_import_runs` failure-row insert in
  `server/paper-import/publisher.mjs` inside the `if (writtenVersion)`
  branch, so a publish that fails before any version files are
  written no longer leaves a `paper_import_runs` row referencing a
  never-existed version.

What `5a28af9` does **not** change relative to this report's findings:

- MF1 (swap atomicity window) — `swapPaperImportLatest` is unchanged.
- MF2 / MF3 (version-number lifecycle, `ON CONFLICT DO UPDATE`
  semantics) — unchanged.
- MF4 (`.latest-tmp-*` / `.latest-prev-*` / `.tmp-vN-*` residue) —
  unchanged.
- The forbidden-scope touches in §5 (FB1, FB2) — unchanged.

The relocation of the failure-row insert (point 3 above) is a small
positive: it means the failure log now reflects "version files were
attempted" rather than "validation passed but everything else might
have happened". It does not resolve MF2: the
`paper_import_runs(paper_id, asset_version, status='failed')` row
still records `asset_version=N` for the failed attempt, while the
on-disk `versions/vN/` is removed and a subsequent publish reuses
that same N — the contract still needs to be nailed down in ADR 0004.

---

Reviewer note on PR shape: PR #91 fuses validate, publish, UI, search
proof, and smoke into one PR. The prior PA round flagged this as the
boundary where a three-PR split was non-negotiable. The fused PR is
reviewable in this case — the diff is large but coherent — but the
trade-off shows up here: every Must Fix above sits in the publish /
storage layer, and revert costs are correspondingly higher than they
would be with the three-PR boundary. Recording for the cut note; not
a merge blocker per se.

End of report.
