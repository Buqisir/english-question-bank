# C8 Cut Note — Draft Paper Composer

## PR B — My Space Artifact Storage

Status: implementation in progress.

Start date: 2026-05-23
PA rounds: 1 total C8 PA before PR A/PR B split.
Big CR rounds: pending for PR B after Codex CR + browser QA.

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
