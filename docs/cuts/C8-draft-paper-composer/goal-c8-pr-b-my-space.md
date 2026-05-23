# C8 PR B Goal Prompt — My Space Artifact Storage

Use this file as the durable goal prompt for C8 PR B. It assumes C8 total PA
has already happened and PR A has shipped the draft-paper composition / preview /
PDF loop.

```text
/goal Implement C8 PR B: My Space artifact storage for Draft Paper Composer.

Context:
C8 total PA is already done. PR A has shipped search -> add groups -> draft
workbench -> A4 preview -> PDF/browser print. PR B scope is the remaining C8
success-path tail: save the generated student-paper PDF to My Space, manage
one-level folders, download artifacts, open source draft, and preserve artifacts
even if the source draft is later gone.

Before coding:
- Read docs/cuts/C8-draft-paper-composer/agent-entrypoint.md
- Read docs/cuts/C8-draft-paper-composer/pm-spec.md sections "My Space",
  "Export UX", "Verify Requirements", "Browser QA Matrix"
- Read docs/cuts/C8-draft-paper-composer/pa-review-opus.md My Space sections
- Inspect current worktree first. If there are existing uncommitted My Space
  edits, review them carefully and keep useful work; do not blindly revert
  user/Codex changes.

Scope:
Implement C8 PR B only.

1. Server/storage
- Add my_space_folders and my_space_artifacts tables.
- Store PDFs on disk under data/user-space/files/<artifactId>.pdf, not DB blobs.
- Create data/user-space/files on server boot and gitignore it.
- Add safe static route GET /user-space/files/:artifactId.pdf with path
  traversal guard.
- Add My Space APIs:
  GET /api/my-space
  POST /api/my-space/folders
  PATCH /api/my-space/folders/:id
  DELETE /api/my-space/folders/:id
  POST /api/my-space/artifacts
  DELETE /api/my-space/artifacts/:id
- Save-to-My-Space uses the same PDF generation path as Download PDF. If a fresh
  PDF was generated within 30s for the same unchanged draft, reuse it instead of
  invoking Vivliostyle again.

2. Frontend
- Add services for My Space.
- Add "保存到个人空间" to the DraftPaper export menu.
- Add a compact save dialog: file name, folder select, new folder, cancel/save.
- Add route ?view=my-space.
- Add My Space page: one-level folder list + artifact rows.
- Artifact actions: download PDF, open source draft, delete artifact with
  confirmation.
- If source draft no longer exists, artifact remains downloadable; open-source
  shows "原草稿卷已删除，PDF 仍可下载".

3. Verification/docs
- Add scripts/verify-c8-my-space-contracts.mjs.
- Update stable/targeted verify docs if needed, but do not force cut-specific
  scripts into verify:all unless stable.
- Add/complete docs/cuts/C8-draft-paper-composer/cut-note.md for PR B or update
  an existing C8 cut note section.
- Copy PR B Should Watch items into cut note or ledger.

Forbidden:
- Do not change PaperSurface renderer/shared/papersurface.
- Do not change reading-analysis legacy.
- Do not add answer paper or teacher-analysis export.
- Do not implement nested folders.
- Do not implement single-question composition.
- Do not print source metadata inside A4/PDF.
- Do not redesign global navigation.
- Do not refactor server/api.mjs broadly; only add the minimum routing glue and
  put reusable My Space logic in server/my-space/.

Small-cut discipline inside this goal:

Checkpoint 1: server schema/API/storage/static route.
- Run targeted server/contract verify.
- Do Codex self-CR for storage safety: path traversal, artifact deletion, source
  draft independence, no DB blob, no source draft deletion side effects.
- Fix must-fix issues before moving on.

Checkpoint 2: frontend save dialog + My Space page/route.
- Run build/typecheck.
- Do Codex self-CR for UX: no edit controls inside A4, save dialog is compact,
  folder actions are one-level only, source-gone state is graceful.
- Fix must-fix issues before moving on.

Checkpoint 3: verify/smoke/docs.
- Add targeted verify and browser smoke coverage.
- Do Codex self-CR for false positives: verify must fail if artifact file is not
  written, if path traversal is accepted, if delete artifact leaves file behind,
  or if source draft deletion deletes artifact.
- Fix must-fix issues before moving on.

Final Codex CR:
- Review the full PR in code-review mode.
- Findings first, with file/line references.
- Include an "attacker view" section: path traversal, unsafe file delete, stale
  artifact URL, duplicate folder, source draft gone.
- Fix all Codex must-fix findings.
- Run:
  npm run build
  npm run verify:all
  node scripts/verify-c8-my-space-contracts.mjs
  relevant C8 verify scripts
  git diff --check
- Run browser QA on the local app for:
  save to My Space
  create folder
  download artifact
  open source draft
  delete artifact
  delete empty/non-empty folder behavior
  source draft gone -> artifact still downloads
- Open PR for C8 PR B.
- Stop after PR is ready and provide PR URL + verification summary + browser QA
  notes. Do not merge. Next step will be external Opus Big CR.
```
