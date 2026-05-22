# ADR 0006: Draft Paper As A Distinct Entity

Status: Accepted for C8 planning.

## Context

Before C8, the app language treated a saved paper composition as a
Paper Set, and the temporary working area as an Assembly Basket stored
in browser localStorage. `CONTEXT.md` explicitly said there was no
separate PaperDraft domain object.

C8 changes the product workflow. The teacher needs a persistent,
auto-saved composition workbench that can:

- add structured question groups from search
- keep a current draft paper across sessions
- preserve group order and group-level page breaks
- render a student-paper preview
- export PDF / print
- save finished PDF artifacts into My Space

This workflow has different semantics from existing Paper Sets and from
the localStorage Assembly Basket.

## Decision

C8 introduces **Draft Paper** as a distinct domain entity.

Draft Paper is the editable workbench object:

- minimum editable unit: Question Group
- maximum output unit: Paper
- persisted in SQLite
- auto-saved
- group-level ordering and page breaks
- continuous re-numbering for student-paper output

Paper Set remains the broader saved collection concept for older and
future collection/export workflows. C8 does not migrate all Paper Set
features into Draft Paper and does not redefine Paper Set as the C8
workbench.

Assembly Basket is retired by C8. It remains only as a one-time
migration source from the legacy `assembly-basket-v1` localStorage key
into the user's current Draft Paper.

## Consequences

- C8 adds `draft_papers` and `draft_paper_items` rather than extending
  `paper_sets` / `paper_items`.
- The same Question Group cannot appear twice inside one Draft Paper.
- The same Question Group may appear in different Draft Papers.
- Draft Paper output hides original question numbers and uses continuous
  draft-paper numbering.
- Finished PDF files in My Space are artifacts, not Draft Papers.
- Opening a My Space artifact's source draft edits the original Draft
  Paper; the saved PDF remains unchanged.
- If the source Draft Paper no longer exists, the artifact remains
  downloadable and the UI explains that the source draft is gone.

## Migration

On first C8 open, the app checks the legacy localStorage key
`assembly-basket-v1`.

If it contains items and there is no current Draft Paper:

1. Create an unnamed Draft Paper.
2. Add legacy basket groups to it in order.
3. Preserve only data supported by Draft Paper V1.
4. Clear `assembly-basket-v1` only after server migration succeeds.

After C8 ships, code paths that write to `assembly-basket-v1` are
removed. The read-only migration path may remain for one release window.

## Non-Goals

- No single-question composition in C8.
- No full Paper Set migration in C8.
- No teacher-version / answer-version export in C8.
- No Draft Paper sharing or cloud permissions in C8.
