# C8 Cut Note — Draft Paper Composer

## PR B — My Space Artifact Storage

Status: merged.

Start date: 2026-05-23
Merged date: 2026-05-23
Merged PR: #96
Merge commit: `f2d64a10466334bee1e03e1c6d66ed7b11b96c7f`
PA rounds: 1 total C8 PA before PR A/PR B split.
Big CR rounds: 1 for PR B.
PO QA: passed.

### Shipped In PR B

- My Space stores finished student-paper PDFs as artifacts, not live draft state.
- PDFs are written to `data/user-space/files/<artifactId>.pdf`; DB stores metadata and file path only.
- Server exposes one-level folder CRUD, artifact save/delete, and guarded static PDF download at `/user-space/files/:artifactId.pdf`.
- Draft Paper export menu gains `保存到个人空间` with a compact save dialog.
- New `?view=my-space` page lists folders and saved PDFs, supports download, open source draft, and delete.
- If the source draft is deleted later, the saved PDF remains downloadable and the UI shows `原草稿卷已删除，PDF 仍可下载`.

### Cut Or Deferred

- No answer-paper or teacher-analysis export in PR B.
- No nested folders.
- No single-question composition.
- No source metadata printed inside A4/PDF.
- No global navigation redesign.

### Wrong Assumptions / Corrections

- Saving to My Space should not run a second Vivliostyle PDF generation immediately after download. PR B reuses a same-draft PDF generated within 30 seconds.
- My Space is not a draft editor. It is an artifact cabinet; source draft deletion must not delete saved PDFs.
- Static PDF serving needs a path traversal guard even though artifact IDs are generated server-side, because URLs are user-controlled.

### Should Watch

- Verify that My Space remains a one-level folder cabinet. Do not add tree behavior until a future PA explicitly approves it.
- Watch artifact deletion semantics: delete the artifact row and PDF file only, never the source draft.
- Watch stale-source UX: source draft gone should block only `打开原草稿`, not PDF download.
- Watch repeated saves: multiple artifacts from the same draft are allowed, but names should stay teacher-readable.
- Watch generated files: `data/user-space/files/` must stay gitignored.
- Watch browser cache on `/user-space/files/:artifactId.pdf`; artifact IDs are immutable, so stale cache should not affect regenerated artifacts.
- Watch V0-only artifact atomicity: a process crash between PDF file write and DB insert can leave an orphan file. Add a boot sweep before adding more artifact types.
- Watch static PDF serving: range requests are not implemented because C8 PDFs are small V0 artifacts.
- Watch page count: `countPdfPages` is approximate for compressed PDFs.

## PR B+1 — Current Draft Follow-Up

Status: in progress.

### Why This Exists

Opus PR B Big CR flagged that My Space's `打开原草稿` flow could expose an older
Draft Paper GET behavior: fetching a draft by id should not silently switch the
teacher's current draft. The latest `main` already had the runtime behavior
mostly correct, but the contract was not pinned down by verify.

### Change

- `GET /api/draft-papers/:id` is explicitly read-only.
- `verify-c8-draft-paper-contracts.mjs` now asserts the draft-by-id GET route
  does not call `markCurrentDraftPaper`.
- The same verify script no longer depends on "new file in this PR" diff
  assertions after C8 PR A has merged; it checks the workbench files exist
  instead.

### Validation Target

- `node scripts/verify-c8-draft-paper-contracts.mjs`
- `npm run verify:all`
- `npm run build`
