# H3-B Dev Notes — Draft Paper Outline Locality

Date: 2026-05-24
Status: implemented

## Scope

H3-B extracts the Draft Paper right-side outline UI out of the main workbench
component.

This slice covers only the outline / reorder / page-break / delete UI. It does
not extract the My Space dialog.

## Changed

- Added `app/src/features/draft-paper/DraftPaperOutline.tsx`.
- Moved outline rendering, source metadata display, page-break suggestions,
  page-break controls, drag/drop handlers, move buttons, and delete buttons out
  of `DraftPaperWorkbench.tsx`.
- Kept `DraftPaperWorkbench.tsx` as the owner of draft state, persistence,
  optimistic updates, deletion undo state, and API calls.
- Updated `scripts/verify-c8-draft-paper-render-model.mjs` so it verifies:
  - the workbench imports and renders `DraftPaperOutline`;
  - the outline component still owns source metadata display;
  - page-break controls remain hidden for the first group;
  - page-break markers only render when page breaks are allowed;
  - the workbench no longer owns outline rendering details.

## Behavior

No product behavior changed.

The following remain unchanged:

- right-side outline labels and source metadata;
- up/down reorder;
- drag reorder;
- page-break suggestion button;
- page-break toggle / cancel;
- delete and undo;
- A4 preview reflecting order and page-break state;
- existing Draft Paper CSS class names.

## Verification

- `node scripts/verify-c8-draft-paper-render-model.mjs`
- `npm run build --prefix app`
- `npm run verify:all --prefix app`
- `git diff --check`

## Browser QA

Ran local dev server with `scripts/dev.sh` and opened:

```text
http://127.0.0.1:5173/?view=draft-paper
```

QA setup added two printable Reading groups to the current draft paper through
the local Draft Paper API.

Checked:

- draft page opened and outline rendered both groups;
- up button reordered the second group above the first group;
- A4 preview reflected the new order;
- page-break toggle added the outline marker and changed the action to
  `取消分页`;
- delete removed a group and updated the A4 preview count;
- undo restored the deleted group;
- drag reorder moved the first group below the second group;
- A4 preview reflected the drag reorder.

No browser console errors were observed after the draft had an active current
paper. The first empty-current-paper load can produce the existing expected
`/api/draft-papers/current` 404 before `create=1` creates a draft.

## Not Done

My Space dialog extraction was intentionally left out. The current dialog still
looks more like workbench-owned export state than a separate deep module. Do
not extract it unless the next slice finds a smaller interface than the code it
would move.
