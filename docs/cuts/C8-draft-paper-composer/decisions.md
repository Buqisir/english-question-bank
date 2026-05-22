# C8 Draft Paper Composer Decisions

Status: PM locked after grill. Ready for external PA review.

This file is the compact decision ledger for C8. Use `pm-spec.md` for
the full product / engineering brief.

## Workflow Decision

- C8 is a large cut.
- Codex owns PM / DEV / CR-lite / local browser QA / RM.
- External Opus PA is used before DEV because C8 is a user-visible
  composition / export / storage flow.
- External Opus big CR may be used after Codex DEV.
- The owner is PO and final product QA, not code reviewer.
- PA prompts for this cut live in the repo so external agents read a
  versioned file instead of a long chat paste.

## Product Scope

- Cut name: C8 — Draft Paper Composer / 草稿卷组卷与个人空间 V1.
- First success standard: a teacher can build and export one printable
  draft paper.
- Main loop:
  `search -> add group to current draft -> draft paper workbench ->
  reorder / page-break -> PDF / print -> optionally save to my space`.
- Minimum unit is always `question group`.
- Maximum unit is always `paper`.
- C8 does not support single-question composition.
- C8 does not create analysis pages, answer sheets, teacher editions,
  or new question-type parsers.

## Draft Paper Model

- C8 introduces Draft Paper as a distinct domain entity. See
  `docs/adr/0006-draft-paper-as-distinct-entity.md`.
- Draft Paper does not reuse `paper_sets` as a stateful paper-set
  subtype.
- Draft papers are saved to SQLite, not localStorage.
- Multiple draft papers are allowed, but the entry is light.
- Opening `?view=draft-paper` loads the current draft paper; if none
  exists, the system creates one unnamed draft.
- Opening `?view=draft-paper&draftPaperId=...` loads that draft.
- Adding a group defaults to the current draft.
- If there is no current draft, adding a group creates an unnamed draft.
- A draft paper auto-saves after title, item order, delete, page-break,
  or other workbench changes.
- Draft title is auto-generated and editable.
- C8 V1 does not build draft-paper copy.
- C8 V1 does not build draft sharing / public links.
- The legacy Assembly Basket is retired by C8.
- On first C8 open, the app reads legacy localStorage key
  `assembly-basket-v1`; if it contains groups and no current draft
  exists, it migrates those groups into a new unnamed Draft Paper.
- The legacy localStorage key is cleared only after server migration
  succeeds.
- After C8 ships, code paths writing to `assembly-basket-v1` are
  removed; only the read-only migration path may remain for one release
  window.
- The earlier "archive draft" idea is replaced by My Space for finished
  artifacts. C8 may reserve status fields, but no archive workflow is
  required in V1.

## Add-To-Draft Behavior

- Search/API layer derives whether a group can be added to a draft.
- Search cards consume fields; they do not infer print readiness.
- Suggested fields:
  - `canAddToDraftPaper: boolean`
  - `draftPaperButtonState: "add" | "in_current_draft" | "disabled"`
  - `currentDraftPaperId: string | null`
  - `printUnavailableReason: string | null`
- Backend add-to-draft API still validates the same constraints.
- `canAddToDraftPaper` and add-to-draft validation both call one shared
  `isGroupPrintReady` backend function.
- `isGroupPrintReady` returns `{ ok: boolean, reason: string | null }`.
- A group is print-ready iff:
  - it exists in `question_groups`
  - `group_type` is one of `reading`, `cloze`, `seven_choices`,
    `grammar_cloze`, `writing`, `continuation`
  - every question in the group has non-empty stem text
  - objective groups (`reading`, `cloze`, `seven_choices`,
    `grammar_cloze`) have non-empty options for every question
  - writing / continuation groups have non-empty passage material or
    explicit prompt text
  - if the group belongs to a paper asset, the paper asset has no
    dangling questionId references for that group
- Listening groups are not print-ready in C8 because print output does
  not include audio.
- `printUnavailableReason` uses the first failed print-ready clause.
- The search card button label is:
  - `加入草稿卷`
  - `已在草稿卷中`
- The add button is a light / text button in the existing card action row,
  same visual tier as `阅读解析` and `找类似`.
- Joining succeeds in place: do not auto-navigate away from search.
- Search page shows a light current-draft entry near the search result
  title area, for example `当前草稿卷 · 3`.
- In one draft, the same group cannot be added twice.
- If already added, the button changes to `已在草稿卷中`.
- Clicking `已在草稿卷中` opens the draft and scrolls near that group.

## Composition Rules

- C8 V1 allows mixed question types, but only existing structured,
  print-ready groups can be added.
- `canAddToDraftPaper=false` means the card must not offer a misleading
  add action.
- Draft paper output re-numbers questions continuously across the whole
  draft.
- Full original-paper print, in a later cut, preserves original numbers.
- Draft-paper print always uses the new continuous numbering.
- Draft paper generates its own section headings; it does not paste
  source paper part / section headings as-is.
- Teacher order is respected. The system does not force standard English
  paper order.
- When the question type changes, a new section heading is generated.
- If the same type appears in two separate blocks, C8 does not merge
  them.
- Section headings are numbered by appearance:
  `第一部分`, `第二部分`, `第三部分`, ...
- Source metadata is retained for teacher-side editing, but it is not
  printed and not shown inside the A4 preview.

## Ordering / Delete / Page Break

- Draft workbench supports both up/down move buttons and drag sorting.
- Deleting a group is immediate and auto-saved.
- Deleting shows an 8-second undo toast. Undo restores the group to its
  previous position and auto-saves again.
- Manual page breaks are allowed only before a question group.
- Page breaks must never split inside a group.
- C8 includes light page-break suggestions from a server-side
  pre-measurement heuristic, not client-only post-render guessing.
- Heuristic v1 suggests a page break before a group when any is true:
  - the group is reading or seven_choices and its passage/material text
    is over 600 English words
  - the group has more than 4 questions and total option count is over
    16
  - the estimated group block exceeds 70% of one A4 page after the
    previous block estimate
- The heuristic is intentionally conservative and deterministic.
- A page-break suggestion is advisory. The teacher confirms whether to
  adopt it.
- Suggestions may only become page breaks before a group.

## Preview / Print / Export

- Draft workbench preview is a true A4-style preview, not a card list.
- Preview and print/PDF must use the same rendering model as much as
  possible.
- C8 V1 exports only a student paper.
- No answers, answer key, or explanations appear in the student paper.
- Future artifact types are reserved:
  - `student-paper`
  - `answer-paper`
  - `teacher-analysis-paper`
- Export menu contains:
  - download PDF
  - browser print
  - save to My Space
- PDF is generated by browser rendering / print-to-PDF from the draft
  preview surface, not by hand-building a second PDF layout engine.
- Preview and PDF use one HTML source of truth.
- The HTML source is `server/print-renderer.mjs::buildPrintHtml`.
- C8 must call `buildPrintHtml` without modifying its body, adding a
  `printStyle`, adding a `versionType`, or adding new block kinds.
- The client preview mounts the returned HTML in an iframe or equivalent
  print-surface container; it does not implement a parallel React print
  template.
- Browser print remains available as a fast path.
- PDF / print has a simple footer with draft title and page number.
- C8 V1 does not include student info fields such as name, class, score,
  or exam number.

## My Space

- My Space stores finished artifact records, not live draft state.
- Artifact record includes:
  - PDF file
  - title / file name
  - one-level folder id
  - source draft paper id
  - generated timestamp
  - artifact type (`student-paper` in C8 V1)
- PDF files live on the file system.
- SQLite stores metadata and file path.
- Suggested storage path:
  `data/user-space/files/<artifactId>.pdf`.
- `data/user-space/files/` is gitignored and created on server boot.
- PDFs are served by a new static handler:
  `GET /user-space/files/:artifactId.pdf`.
- The static handler must use path-resolution guards and reject path
  traversal; compare `path.resolve(root)` to `path.resolve(filePath)`.
- Vite dev proxy must include `/user-space`.
- My Space V1 supports one folder level only.
- No nested folder tree in C8.
- Save-to-My-Space flow is available from the export menu.
- `Download PDF` and `Save to My Space` both use the same PDF generation
  path.
- Saving to My Space does not require downloading first.
- My Space route: `?view=my-space`.
- My Space page has folder list on the left and artifact list on the
  right.
- My Space entry is a light entry from search and draft-paper pages; do
  not redesign global navigation in C8.
- Folder operations:
  - create folder
  - rename folder
  - delete empty folder
- Artifact operations:
  - download PDF
  - open source draft
  - delete artifact record
- Deleting an artifact record deletes its PDF file but does not delete
  the source draft.
- Deleting an artifact requires confirmation.
- Opening source draft edits the original draft. The PDF artifact remains
  a stable historical file.
- If the source draft has been deleted, the artifact remains visible and
  downloadable; clicking open-source-draft shows a toast:
  `原草稿卷已删除，PDF 仍可下载`.
- C8 V1 does not warn when source draft has changed after artifact
  generation.

## UI Decisions

- Draft workbench uses a print-workbench layout:
  top toolbar, center A4 preview, right compact outline/control panel.
- Right panel is a compact operation list, not cards.
- A4 preview must not show edit buttons or hover controls.
- All editing operations live in the right panel / toolbar.
- A4 preview is page-based: one white A4 page per page, separated by a
  gray desk background.
- Page-break suggestions show in the right panel and as light hints in
  the gray page gap, never inside the white page.
- Manual page-break marks show in the right panel and gray page gap,
  never inside the white page.
- Toolbar contains:
  - editable title
  - save status
  - recent draft papers
  - My Space
  - export menu
- Export is a dropdown, not three primary buttons.
- Save-to-My-Space dialog contains file name, folder select, new-folder
  affordance, and save button. It does not show PDF preview.
- My Space uses a file-cabinet layout: folder list + dense artifact rows.
- Search page current-draft entry sits in the search-result heading area.
- Narrow viewport: A4 preview first; outline/control panel moves below
  as a collapsible section. C8 does not attempt a full mobile composer.
- C8 PM spec must include wireframes / text diagrams.

## Out Of Scope

- Single-question add / delete / reorder
- Full paper print from source paper
- Answer sheet / teacher edition / analysis PDF
- Source display inside student paper
- Source index appendix
- Student information fields
- Copy draft paper
- Draft sharing / public links
- Nested My Space folders
- My Space search, tags, sorting, bulk operations, or sharing
- Full mobile composer
- New AI generation
- New question-type parsing / analysis
- Manual editing of question text, passage text, options, answers, or
  analysis facts

## Open PO Decisions

None after PM grill + Opus PA compression. Opus left three decisions;
PM/PO accepted the recommended choices:

- Draft Paper is a distinct entity; see ADR 0006.
- Assembly Basket is retired with one-time migration.
- My Space artifact stays valid when the source draft is deleted.
