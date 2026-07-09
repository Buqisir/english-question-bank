# my-space-shelf — plan.md

cut size: medium; touches schema/data contract/product boundary/teaching
interpretation: no (pure front-end render-layer rework, no server/domain
change).

Note on process: this plan.md is written by the same DEV session that
implements it (owner delegated both in one task). It exists to satisfy the
"medium cuts require a committed plan.md before DEV" rule and to make the
judgment calls below inspectable before CR. No PA — this cut is reversible,
UI-only, does not touch schema/contract/migrations.

## Background

See owner brief (verbatim in the dispatch prompt): individual page
(`app/src/features/my-space/MySpacePage.tsx` + `.css`) was scored as an
admin-file-manager wireframe (folder tree + file rows + triple heading +
palette hardcoded, 0 token usage). Owner direction: rebuild as a card-based
"备课成果" shelf, matching the Concierge card/chip family already shipped on
the home page. This document records the concrete rendering decisions and
flags two judgment calls the owner brief left implicit.

## Locked Decisions (from owner brief, not re-litigated)

1. Single-column layout: header (title + `共 N 份` count) → optional filter
   chip row → card grid. No two-column folder-tree/file-list layout.
2. Folder dimension (if real) downgrades to a filter-chip row; renders
   nothing when 0 or 1 folders exist.
3. Card = title (primary weight) → one muted meta line → action row.
4. Actions: 下载 PDF (primary, solid green) / 打开原草稿 (ghost) / 删除
   (danger ghost, red-on-hover). Delete confirmation is a custom modal, not
   `window.confirm`.
5. Empty state: one centered block (existing copy + green CTA), not two
   panels.
6. Zero hardcoded palette hex in `MySpacePage.css`; only `var(--eqb-*)`
   tokens (+ `color-mix()` for washes, precedented in
   `app/src/shared-ui/papersurface/PaperSurface.css`).
7. Keep `AppTopbar`, `fetchMySpace`/download/delete-artifact business logic
   (function signatures unchanged), aria semantics not downgraded.
8. Forbidden: `server/**`, `app/src/App.tsx`, `tokens.css`, `App.css`,
   `shared/**`, `draft-paper/**` (other cut in flight). No new features
   (rename/move/multi-select).

## Judgment Calls (flagging for CR/owner — not silently assumed)

### JC-1: Folder create/rename/delete UI is dropped from this page

The owner brief's target layout (§1) only describes folders as a
**select-only** filter chip row ("全部 / 各文件夹名"). The "keep unchanged"
list in §5 of the brief names *fetch* and *delete/download artifact* logic
specifically — it does not name folder create/rename/delete. Checked the
data model to confirm this is safe to drop, not just convenient:

- `server/my-space/mySpace.mjs` has no default/auto-created folder; folders
  are 100% user-created via `POST /api/my-space/folders`.
- That creation path already lives in
  `app/src/features/draft-paper/DraftPaperWorkbench.tsx`'s "保存到个人空间"
  dialog (`createFolderInDialog`, `spaceDialogOpen` block) — forbidden scope
  for this cut, untouched, and it keeps working after this change.
- So teachers keep the ability to create a folder (while saving a PDF); they
  lose in-place rename/delete-folder on this page specifically.

Decision: `MySpacePage.tsx` drops `createMySpaceFolder` /
`renameMySpaceFolder` / `deleteMySpaceFolder` imports and their handlers.
Folders render as pure select filters (`selectFolder`, already existing,
signature unchanged). `app/src/services/mySpace.ts` is left untouched
(those functions stay exported for `DraftPaperWorkbench.tsx`'s use).

Consequence: `scripts/verify-error-copy-mainline.mjs` hardcodes
`mySpaceCount === 6` (describeError call-site count from the 2026-07 error
copy cut, when the page still had 3 folder-CRUD handlers). Dropping those 3
handlers drops the count to 3. This assertion is updated in this cut (see
Verify Scope below) — the safety property it exists for (no raw
`error.message`/`String(error)` leaking into UI copy) is the adjacent
negative-regex assertion in the same script, untouched.

If the owner wants folder rename/delete kept reachable from this page after
seeing it, the straightforward follow-up is a small icon affordance next to
the chip label (own future cut) — not restored inline in this pass.

### JC-2: Card meta line drops "版本" (no such field exists)

The brief's target card meta line is "日期 · 页数 · 版本". `MySpaceArtifact`
(domain/questionBank.ts) has no version field — only `generatedAt`,
`pageCount`, `sourceDraftTitle`/`sourceDraftExists`. Per the cut's own red
line ("若现有 props 不够用宁可少显示信息也不改接口，报告回来"), the meta
line uses the same three segments the old UI already had: date · page count
· source-draft status (title, or "原草稿卷已删除"). No interface change.

## Verify Scope (explicitly assigned here, per AGENTS.md's "verify scripts
are contract-level, only touchable when a committed plan.md assigns that
scope")

1. New `scripts/verify-my-space-shelf.mjs` (registered `yes` in
   `scripts/verify-ci.mjs` + `scripts/README.md`): palette-hex-zero audit of
   `MySpacePage.css` (empty allowlist), no `window.confirm` in
   `MySpacePage.tsx`, custom confirm-dialog markup present, card-grid class
   present with the `repeat(auto-fill, minmax(280px, 1fr))` track, primary
   action class (solid `var(--eqb-color-primary)`) and danger action class
   (`var(--eqb-color-danger)`) present, triple-heading text (`个 PDF`) gone,
   filter-chip row conditional on `folders.length > 0`.
2. `scripts/verify-error-copy-mainline.mjs` (already registered `yes`):
   update the hardcoded `mySpaceCount === 6` to `=== 3` (JC-1 above); the
   negative-regex / retry-button / dedup assertions in the same file are
   unchanged and still enforced.
3. `scripts/verify-c8-my-space-contracts.mjs` (unregistered, `no` in
   README — does not gate `verify:all`, but still a real script people may
   run): update the `window.confirm` assertion to match the new custom
   dialog, since it directly encodes the exact interaction this cut
   intentionally replaces. `my-space-folders` class-name assertion is kept
   green by keeping that class name on the new chip-row container.

Known un-addressed: `scripts/smoke-c8-my-space.mjs` (Playwright smoke, not
in README/verify-ci, effectively orphaned) references
`.my-space-folder-row` + "删除文件夹" aria-label, which no longer exist.
Left as-is — out of this cut's registered acceptance scope; flagged as a
known risk in the completion report.

## Must Do

- Rewrite `MySpacePage.tsx` render tree per Locked Decisions + JC-1/JC-2.
- Rewrite `MySpacePage.css` token-only, card/chip/modal classes.
- Add `scripts/verify-my-space-shelf.mjs`, register in `verify-ci.mjs` +
  `scripts/README.md`.
- Update `verify-error-copy-mainline.mjs` count (3) and
  `verify-c8-my-space-contracts.mjs` confirm-dialog assertion.
- `pnpm -C app run verify:all` green, build clean.
- Browser QA: has-files state + empty state screenshots, delete-confirm
  flow, download button green, visual family match vs. home page.

## Forbidden (restated)

`server/**`, `app/src/App.tsx`, `app/src/shared-ui/tokens.css`,
`app/src/App.css`, `shared/**`, `app/src/features/draft-paper/**`,
`app/src/services/mySpace.ts` (left untouched, not forbidden by the brief,
but no reason to touch it).
