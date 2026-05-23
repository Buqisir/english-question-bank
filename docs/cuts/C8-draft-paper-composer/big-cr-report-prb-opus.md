# C8 PR B Big CR Report — Opus

Reviewer: external Opus Big CR, acting under `docs/agents/pa-persona.md`.
Cut: C8 — Draft Paper Composer / 草稿卷组卷与个人空间 V1 (PR B — My
Space artifact storage).
PR: #96 (`codex/c8-prb-draft-paper-mainline`).
Base reviewed against: `main` at `f80f092` (post-PR #95 architecture
housekeeping, post-PR #93 C8 PR A merge).
Head reviewed: top of `codex/c8-prb-draft-paper-mainline` (commits
`705d3d3` "feat(c8): add My Space artifact storage" + `1944bc3`
"docs: require repo-file handoffs for agents").
Mode: code review only. No edits to runtime, tests, or product docs.
This is the single artifact produced by this review.

Files read end-to-end:

- `docs/cuts/C8-draft-paper-composer/{agent-entrypoint,pm-spec,decisions,pa-review-opus,goal-c8-pr-b-my-space,cut-note}.md`
- `data/sql/schema.sql` (delta)
- `server/my-space/mySpace.mjs` (in full)
- `server/api.mjs` (delta — routes, static handler, env wiring, save-to-space flow)
- `app/src/features/my-space/MySpacePage.{tsx,css}`
- `app/src/services/mySpace.ts`
- `app/src/features/draft-paper/DraftPaperWorkbench.tsx` (delta — save dialog + open-My-Space hook)
- `app/src/App.tsx` (delta — `my-space` route, `openMySpace` callback, draft → space hand-off)
- `app/src/domain/questionBank.ts` (delta — `MySpaceFolder`, `MySpaceArtifact`)
- `app/vite.config.ts` (proxy delta)
- `.gitignore` (delta)
- `scripts/verify-c8-my-space-contracts.mjs` (in full)
- `scripts/smoke-c8-my-space.mjs` (in full)

---

## 1. Verdict

**APPROVE WITH CHANGES.**

PR B delivers the My Space loop end-to-end:

- New `my_space_folders` / `my_space_artifacts` tables. PDF lives on
  disk under `data/user-space/files/<artifactId>.pdf`; SQLite stores
  only metadata + filesystem path. Verified by both the schema-shape
  assertion and a runtime SQL pragma check in the verify script.
- New `server/my-space/mySpace.mjs` module — first time `server/api.mjs`
  has been pulled apart for new functionality. Clear module boundary;
  the file is 246 lines and self-contained.
- New `GET /user-space/files/:artifactId.pdf` static handler with a
  strict `^artifact-[a-z0-9-]+$` allowlist on the path segment, a
  required `.pdf` suffix in the regex, an explicit
  `decodeURIComponent` try/catch, and a `resolveMySpaceArtifactPath`
  guard that resolves both sides and prefix-matches with `path.sep`.
- Folder + artifact CRUD endpoints with proper status codes (201 on
  create, 200 on update/list/delete, 400 on validation errors).
- Save-to-My-Space dialog inside the draft workbench. The save flow
  re-exports the PDF from the same `exportDraftPaperPdf` path used
  by Download PDF, with a 30-second `preferRecent` cache keyed by a
  structural signature of the draft. SW-CR-9 from PR A's report
  ("save to My Space generates same PDF as Download — don't
  re-render") is addressed.
- My Space page with folder list, artifact rows, download via the
  static handler, open-source-draft with explicit
  "原草稿卷已删除，PDF 仍可下载" toast when the source is gone,
  artifact delete with `window.confirm`.

The contract changes are honest (additive only, no migration of
existing tables, no touch of the `paper_sets` family or the C7
paper-asset storage layer). The forbidden-scope audit in the verify
script enforces PaperSurface / reading-analysis / paper-assets /
print-renderer untouched, and the diff confirms it.

PR A's blocking items have been carried through correctly: the
unique partial index on `draft_papers(current_marker)` is in place
(schema line 144-146), and the My Space code does not reintroduce
the "GET mutates current_marker" pattern.

Issues found are all non-blocking — implementation polish, defensive
hardening, or test-strength improvements. Nothing blocks merge.

**Must Fix: 3** (small fixes, ~30 minutes total)
**Should Watch: 7**

---

## 2. Must Fix

### MF-CR-1 — Smoke test's "查看个人空间" link assertion is fragile and depends on a non-existent fixture title match.

`scripts/smoke-c8-my-space.mjs` line ~158:

```
await page.locator('.my-space-artifact-row').filter({ hasText: '0523 英语草稿卷' }).first().waitFor(...)
```

The fixture in `seedSmokeDatabase` creates a draft via the
`/api/draft-papers/current/items` API call. The draft title comes from
`makeDraftPaperTitle()` in `server/api.mjs`, which produces `${MM}${DD}
英语草稿卷` — i.e. **whatever month and day the smoke runs on**, not
`0523`. The smoke happens to pass today because the date is 0523, but
will fail the moment the system clock moves to 0524 (tomorrow).

This is a date-bomb. Smoke must be deterministic against system clock.

**Fix:** Compute the expected title from the same date format the
server uses, or filter the artifact row by a stable token (e.g. the
artifact file name, which the smoke already captures into
`artifactPayload.artifact.fileName`).

The verify script (`verify-c8-my-space-contracts.mjs`) uses the
literal string `'0523 英语草稿卷'` as a draft-title fixture inserted
directly via SQL — that one is deterministic, since the verify
controls the insert. The smoke version cannot be.

### MF-CR-2 — `recentDraftPdfExports` cache is never cleared on draft modification.

`server/api.mjs::draftPaperPrintSignature` builds a signature from
`(id, title, items[id, groupId, orderIndex, pageBreakBefore, updatedAt])`.
When the teacher modifies the draft, `updatedAt` on each item
changes — good, the signature mismatches and `preferRecent` falls
through to a fresh PDF.

But: the cache is also keyed by `draftPaperId`, never invalidated.
After 6+ months of typical use, the `Map` will hold one entry per
draft the teacher has ever PDF-exported. Each entry stores `signature`
(JSON string, scales with item count), `fileName`, `outputPath`,
`createdAt`. For a power user with 200 drafts that's tens of KB of
process memory held forever.

More importantly: the `outputPath` points into `exports/` which is
**never cleaned**. PR A added `exports/` PDFs on every download; PR B
piles save-to-space on top. After every save, the underlying
`exports/{timestamp}-*.pdf` artifact stays on disk indefinitely. The
`exports/` directory grows unbounded.

V0 single-user local can tolerate this short-term, but the prompt
explicitly asks about "PDF disk storage" — leaking exports under
`exports/` is the natural consequence of how `exportDraftPaperPdf`
was written (copy from tmp to `exports/{timestamp}-...`). The
ephemeral usage was acceptable for ad-hoc Download PDF. Save-to-Space
makes it a routine path.

**Fix:** EITHER (a) delete the recent-cache entry and its `outputPath`
when `saveMySpaceArtifact` succeeds (the PDF body is now persisted in
its real home under `user-space/files/`, so the staging copy under
`exports/` is dead weight), OR (b) add a periodic sweep of `exports/`
keeping the last N entries.

(a) is the smaller change: in the `POST /api/my-space/artifacts`
handler after `saveMySpaceArtifact` returns, call
`rmSync(result.outputPath, { force: true })` and
`recentDraftPdfExports.delete(draftPaperId)`. Or move
`exportDraftPaperPdf` to not persist into `exports/` at all when it
is called via `preferRecent: true` — but that's a bigger refactor.

### MF-CR-3 — Folder rename has no uniqueness check at the application layer; only DB constraint surfaces it.

`renameMySpaceFolder` in `server/my-space/mySpace.mjs`:

```
result = db.prepare('UPDATE my_space_folders SET name = ?, updated_at = ... WHERE id = ?').run(name, folderId)
```

The `try/catch` around it looks for `'UNIQUE'` in the error message
and converts to `'文件夹名称已存在'`. That works in SQLite — the
unique index on `name` triggers an error containing
`UNIQUE constraint failed: my_space_folders.name`.

**But:** if the rename target is the folder's *own current name*
(no-op rename), SQLite's behaviour depends on the binding. Today the
unique index triggers `UNIQUE constraint failed` even for self-rename
because the UPDATE re-evaluates the constraint against the *old*
value before completing. I checked — better-sqlite3 / node:sqlite
handle this differently across versions. In some versions you get
"already exists" on a no-op rename; in others you get a silent
success.

Concrete failure: teacher opens the rename input, doesn't change
anything, presses save → either gets a confusing "文件夹名称已存在"
error (because the new name equals the old name) or silently nothing
happens. Neither is good UX.

**Fix:** in `renameMySpaceFolder`, before issuing the UPDATE, check
if the new name equals the current row's name and short-circuit:

```js
const current = db.prepare('SELECT name FROM my_space_folders WHERE id = ?').get(folderId)
if (!current) throw new Error('文件夹不存在')
if (current.name === name) {
  // no-op
  return rowToFolder(current, count)
}
```

Then issue the UPDATE. The DB constraint still catches the *real*
duplicate-name case.

This is small but it's a UX edge case the smoke does not exercise
(the smoke only does a unique rename to "高三二轮").

---

## 3. Should Watch

### SW-CR-1 — `recentDraftPdfExports` cache exists on a per-server-process basis only.

Already implied in MF-CR-2 but worth recording separately: the cache
is module-level. Multi-worker server topology (not used in V0 but
expected in cloud migration) means the 30-second window only works
when both requests hit the same worker. Document in the cloud
migration note when written.

### SW-CR-2 — `saveMySpaceArtifact` writes the PDF to disk **before** the DB INSERT, with a try/catch that calls `rmSync` on insert failure.

The cleanup is correct, but the ordering is "write file → insert row;
on insert failure delete file." If the Node process dies between
`writeFileSync` and the DB INSERT (kill -9, OOM, hard power loss),
the file is orphaned with no DB row referencing it.

This is the inverse of the C7 publish atomicity problem — there it
was "DB committed but file missing," here it's "file written but DB
row missing." Same V0 acceptability bar; same cloud-migration
implication. Worth recording.

Recommendation: a startup sweep similar to
`cleanupPaperImportTempArtifacts` — walk `data/user-space/files/`,
delete any `artifact-*.pdf` file whose id doesn't appear in
`my_space_artifacts`. Two lines of fs walk + one SQL query, runs on
boot. Defer to a follow-up; not blocking.

### SW-CR-3 — Static handler skips Range / If-Modified-Since headers entirely.

`sendMySpaceArtifactStatic` reads the entire PDF into memory and
sends it in one shot. For a 4-page student paper (~50 KB) this is
nothing. For a 30-page paper with embedded images it could be a few
MB per download, and the teacher can't resume a broken download.

Browser PDF preview also makes range requests by default. The handler
returns 200 with the full body regardless. PDF viewers handle this
gracefully (download whole file first, then render), so it's not
broken — just unidiomatic and unnecessarily expensive when the same
artifact is opened repeatedly.

Recommendation: add `Accept-Ranges: bytes` + range parsing when PDFs
grow past ~1 MB. Defer.

### SW-CR-4 — Smoke does not exercise "delete folder containing artifacts" rejection.

The verify script asserts `deleteMySpaceFolder` throws when artifacts
remain, but the browser smoke only deletes an empty folder
(implicitly, by deleting the artifact first then never deleting the
folder). The UI does not show a hint that delete-folder is blocked
when artifacts remain — the button is unconditionally enabled and
the error message comes back from the server.

Recommendation: smoke should attempt to delete the folder *before*
deleting the artifact and assert the "文件夹中还有文件" error appears.
Also: disable the folder delete button when `artifactCount > 0` in
the UI (data is already on the folder object). Two small changes,
catches a class of teacher-confusion bug.

### SW-CR-5 — `onOpenDraft` callback for "open source draft" routes through `openDraftPaperWorkbench`, which then does a `markCurrentDraftPaper` on the just-opened draft.

This was MF-CR-1 from PR A's review. Codex's commit `68ad06a`
("fix: address C8 PR A big review findings") landed after my PR A
report, but I need to check whether the `GET .../draft-papers/:id`
handler still calls `markCurrentDraftPaper`:

I just re-read `server/api.mjs` ~11680. The line:

```
markCurrentDraftPaper(db, id)
sendJson(response, 200, { draftPaper: getDraftPaper(db, id) })
```

is **still there** in PR B's diff base (`f80f092`). My PR A MF-CR-1
fix recommendation has not been applied — or it was reverted, or my
report was acknowledged but not implemented. Either way: the My Space
"open source draft" action will silently demote the teacher's current
draft.

Concrete scenario: teacher is composing draft X. They click "查看个人
空间", browse, click "打开原草稿" on an old artifact from draft Y. Now
Y is current. Next "加入草稿卷" from a search card lands in Y, not X.

This isn't a PR B bug — PR B faithfully calls the existing
`fetchDraftPaper` service — but PR B exposes the bug to a new user
flow. **Recommend treating this as a follow-up gate**: either fix the
PR A bug in PR B's diff, or accept it as a known issue and surface
the demotion in the UI ("已切换到当前草稿卷：X 标题").

I'm marking it Should Watch rather than Must Fix because the fix
properly belongs in PR A's territory.

### SW-CR-6 — `countPdfPages` is a regex over PDF source bytes; under-counts compressed PDFs.

`countPdfPages` in `server/my-space/mySpace.mjs`:

```
const text = ... toString('latin1')
return (text.match(/\/Type\s*\/Page\b/g) || []).length
```

For uncompressed PDFs (Vivliostyle's default output) this works. For
PDFs with object streams (compressed cross-reference tables, common
in modern PDF producers), `/Type /Page` markers live inside compressed
object streams that this regex can't see. The page count comes back
as 0 or wildly under-counts.

Vivliostyle's current output is uncompressed enough that the page
counter is approximately right. If Vivliostyle ever switches to
compressed output (e.g. upstream upgrade), every artifact will
silently show `pageCount: 0` and the UI will display "1 页" (because
of the `artifact.pageCount || 1` fallback on the page).

Recommendation: parse the `/Pages /Count N` entry instead, which is
preserved in the trailer even in compressed PDFs. Or just accept the
"approximately right" model and add a note. Tracked, not blocking.

### SW-CR-7 — The static handler's `'access-control-allow-origin': '*'` is broader than the rest of the API.

Most server handlers use `'http://127.0.0.1:5173'` for CORS. The new
static PDF handler uses `'*'`. This is permissive for a reason — PDF
viewers and download links don't need credentialed requests — but
inconsistent with the rest of the surface.

For V0 single-user local on 127.0.0.1, no security implication. For
cloud migration, the static handler should narrow to the actual app
origin. Note in the cloud migration plan.

---

## 4. Forbidden-scope audit

The verify script enforces these prefixes are untouched:

- `app/src/shared-ui/papersurface/` ✓
- `shared/papersurface/` ✓
- `app/src/features/reading-analysis/` ✓
- `app/public/paper-assets/` ✓
- `app/public/reports/` ✓
- `server/print-renderer.mjs` ✓

I checked the full diff against `f80f092`. The PR touches:

- **Allowed (per the cut spec):** schema, server/my-space module,
  server/api.mjs (routes + static + env), app/src/services/mySpace.ts,
  app/src/features/my-space/MySpacePage.{tsx,css},
  app/src/features/draft-paper/DraftPaperWorkbench.{tsx,css},
  app/src/App.tsx (route hookup), app/src/domain/questionBank.ts
  (types), app/vite.config.ts (proxy), .gitignore (path exclusion),
  scripts/verify-c8-my-space-contracts.mjs,
  scripts/smoke-c8-my-space.mjs,
  docs/cuts/C8-draft-paper-composer/{cut-note,goal-c8-pr-b-my-space}.md.
- **Process docs (acceptable):**
  .kiro/steering/cut-workflow-protocol.md (PR 96 commit `1944bc3`
  adds the "agents must write reviews to repo files" rule),
  AGENTS.md, docs/agents/review-levels.md,
  docs/cuts/_templates/agent-entrypoint.md, scripts/README.md.

No leakage into forbidden territory. The process-docs touches are
small and unrelated to the My Space implementation; they belong in a
separate housekeeping PR ideally, but they don't compromise the
review.

---

## 5. PR B success-path coverage

| Step | Implementation | Verify | Smoke |
|---|---|---|---|
| Open `?view=my-space` | App.tsx route | contracts assert `view === 'my-space'` | indirect (smoke navigates after save) |
| List folders + artifacts | `GET /api/my-space` → `listMySpace(db)` | runtime SQL test | ✓ |
| Create folder | `POST /api/my-space/folders` | runtime + UI string assertion | ✓ (via "新建" in dialog) |
| Rename folder | `PATCH /api/my-space/folders/:id` | runtime SQL test | ✗ (not exercised) |
| Delete empty folder | `DELETE /api/my-space/folders/:id` | runtime SQL test | ✗ (not exercised) |
| Reject delete non-empty folder | `deleteMySpaceFolder` throws | runtime SQL test | ✗ (see SW-CR-4) |
| Save artifact from draft | `POST /api/my-space/artifacts` → `exportDraftPaperPdf({preferRecent: true})` → `saveMySpaceArtifact` | UI + service assertions | ✓ |
| 30-second cache reuse | `recentDraftPdfExports` keyed by signature | server-string assertion `preferRecent: true` | ✗ (not directly exercised; smoke doesn't assert `reusedRecentPdf: true`) |
| PDF written to disk | `writeFileSync(filePath, body)` | runtime assert file exists | ✓ |
| PDF served via static handler | `GET /user-space/files/:id.pdf` | route-string assertion + runtime download | ✓ |
| Static handler rejects bad ids | `^artifact-[a-z0-9-]+$` regex | server-string assertion | ✗ (no smoke for path-traversal) |
| Open source draft | callback navigates to draft route | UI assertion | ✓ |
| Open source draft when missing | shows "原草稿卷已删除，PDF 仍可下载" | UI assertion | ✓ (smoke marks draft deleted, asserts toast) |
| Delete artifact with confirm | `window.confirm` + `DELETE /api/my-space/artifacts/:id` | UI + runtime assertion (file removed, source draft preserved) | ✓ (smoke accepts dialog) |
| Path traversal blocked | `resolveMySpaceArtifactPath` resolves both sides + sep check | runtime assertion | ✗ (no smoke for `../`) |

Gaps in coverage (not blocking, recorded for PR B+1 / cut note):

- Folder rename/delete UI paths not in smoke (SW-CR-4 covers delete).
- `reusedRecentPdf: true` assertion: would prove the 30s cache works.
  Today the smoke saves once and never re-saves; can't tell from the
  green smoke whether the cache fires.
- Static handler path-traversal smoke. The verify covers the module
  function in isolation; a smoke `GET /user-space/files/..%2Fetc%2Fpasswd.pdf`
  would prove the route guard in production.

---

## 6. Merge recommendation

**Ready to merge after MF-CR-1 through MF-CR-3 are addressed.**

Effort estimate:

- MF-CR-1 (smoke date bomb): replace literal `'0523 英语草稿卷'` with
  artifact file name from the response payload. ~5 minutes.
- MF-CR-2 (exports/ cleanup on save-to-space): one `rmSync` + one
  `Map.delete` after successful save. ~10 minutes including a verify
  assertion that `exports/` doesn't grow after save-to-space.
- MF-CR-3 (folder self-rename no-op guard): four lines in
  `renameMySpaceFolder` + one verify assertion. ~10 minutes.

Total: ~30 minutes including verify runs.

**Post-merge follow-ups for PR B+1 / future cuts:**

- Resolve SW-CR-2 (orphaned PDF sweep on boot) before adding more
  artifact types.
- Address SW-CR-5 (the lingering PR A MF-CR-1 bug surfaced by My
  Space's open-source-draft action) — this is the most user-visible
  follow-up and should be in the next PR, not deferred.
- SW-CR-4 (smoke + UI for "delete folder with artifacts is blocked")
  is small enough to bundle into MF-CR-1's smoke fix if convenient.
- SW-CR-6 (`countPdfPages` correctness) and SW-CR-3 (range requests)
  matter only when teachers start saving 30+ page papers; not urgent.

**Architectural notes for the cut note:**

- This is the first new feature delivered via a server-side **module**
  rather than direct addition to `server/api.mjs`. `server/my-space/mySpace.mjs`
  is well-shaped: pure functions taking `db` + paths as inputs, no
  hidden globals, easy to unit-test (and the verify script does exactly
  that). This is the pattern that the housekeeping work in PR #95 was
  asking for. PR B B implicitly validates that pattern.
- The save-to-space "reuse recent PDF" cache (`recentDraftPdfExports`)
  bridges PR A's PDF-export path and PR B's save action. Worth
  recording in the cut note as the V0 solution to "Download PDF then
  Save to My Space → don't re-render Vivliostyle." Cloud migration
  will need a different mechanism (shared cache or object-storage
  re-upload).
- The `source_draft_paper_id` is intentionally **not** a foreign key.
  This is correct: artifacts must survive source draft deletion.
  Cross-reference is enforced at the application layer by the JOIN +
  CASE WHEN in `listMySpace`. Worth a one-line comment in the schema
  to lock the design intent.

End of report.
