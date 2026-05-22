# C8 Draft Paper Composer PM Spec

Status: ready for PA. C8 is a large user-visible cut.

## Summary

C8 builds the first teacher-operable draft-paper composition loop.
Teachers can search structured question groups, add them to the current
draft paper, preview a true A4-style student paper, reorder groups, add
group-level page breaks, export a PDF / browser print, and save the
finished PDF artifact into My Space.

C8 is not an analysis cut. It does not create new AI analysis, answer
pages, or teacher editions. It turns the existing structured question
bank into a printable paper workflow.

## Teacher Task

The teacher wants to assemble a usable student paper from existing
question groups. The product should answer:

```text
Can I find a group, add it to a paper, see what the paper will look
like, adjust order/page breaks, and export a PDF I can use?
```

If C8 does not produce a printable student paper from selected groups,
the cut has failed.

## First Success Path

```text
Open search page
-> find Reading / cloze / other print-ready groups
-> click 加入草稿卷 on several cards
-> current draft entry updates count
-> open ?view=draft-paper
-> see A4 page preview with continuous renumbering
-> reorder groups in right outline
-> accept a page-break suggestion or insert a group-level page break
-> download PDF
-> save the same PDF to My Space in a one-level folder
-> open ?view=my-space
-> download the saved PDF or open the source draft
```

## Product Principle

The draft paper is a composition workbench, not a mini Word processor.

- Group is the minimum editable unit.
- Paper is the maximum output unit.
- The white A4 preview is the printable student paper.
- Editing controls stay outside the A4 page.
- PDF and preview should share one rendering model.
- My Space stores finished artifacts; drafts remain editable workspaces.

## Key Boundaries

### Current Cut

- Add print-ready groups to the current draft paper.
- Persist draft papers and draft items in SQLite.
- Render A4 preview for structured groups.
- Support reorder, delete-with-undo, manual group-level page breaks, and
  light page-break suggestions.
- Re-number draft questions continuously.
- Export student-paper PDF and browser print.
- Save PDF artifact to My Space.
- Build simple My Space page with one-level folders.

### Future Cuts

- Full original-paper print preserving original question numbers.
- Answer paper / teacher analysis paper.
- Better per-question-type print templates.
- Nested My Space folders.
- Draft copy / template workflows.
- Sharing / public links.
- Full mobile composer.
- Manual content editing.

## Data Model

### Draft Paper

Suggested tables:

```text
draft_papers
  id
  title
  subject
  status
  created_at
  updated_at
  last_printed_at
  current_marker

draft_paper_items
  id
  draft_paper_id
  group_id
  source_paper_id
  order_index
  page_break_before
  created_at
  updated_at
```

Rules:

- `status` may reserve `active` / `archived`, but C8 does not need an
  archive UI.
- One draft has at most one item per `group_id`.
- Reorder updates `order_index`.
- Page break lives on the item before which the break applies.
- Current draft is a single-user preference / marker.
- Draft paper title is auto-generated and editable.
- Draft data is the source of truth for workbench state.

### My Space

Suggested tables:

```text
my_space_folders
  id
  name
  created_at
  updated_at

my_space_artifacts
  id
  folder_id
  title
  file_name
  file_path
  artifact_type
  source_draft_paper_id
  page_count
  generated_at
  created_at
  updated_at
```

Rules:

- Folder depth is one level only.
- PDF is stored on disk, not as a DB blob.
- Suggested file path: `data/user-space/files/<artifactId>.pdf`.
- Deleting an artifact deletes the PDF file and DB row.
- Deleting an artifact does not delete the source draft.
- Opening a source draft opens the original editable draft.
- PDF artifact remains unchanged even if the source draft later changes.

## Search / API Model

Search/API derives print availability and current-draft membership.
Cards only consume the fields.

Suggested search fields:

```ts
type QuestionGroupSearchResult = {
  // existing fields
  canAddToDraftPaper: boolean
  draftPaperButtonState: 'add' | 'in_current_draft' | 'disabled'
  currentDraftPaperId?: string
  printUnavailableReason?: string
}
```

Backend add-to-draft API must re-check:

- group exists
- group is print-ready
- current draft exists or can be created
- same group is not already in the draft

## Print-Ready Gate

Only print-ready groups can be added.

V1 may define print-ready conservatively:

- group exists in the structured question bank / paper asset layer
- group has stable group id and question ids
- group has body/content needed by its group type
- objective groups have options where needed
- rendering adapter can produce printable blocks

Do not allow bad groups into draft papers and show error blocks later.
The search action should be disabled or hidden before the teacher adds
bad content.

## Composition Rules

- Draft paper supports mixed group types.
- Teacher order is respected.
- The system does not force standard English paper order.
- When group type changes, generate a new section heading.
- If the same type appears in separate blocks, do not merge them.
- Section numbering follows appearance order:
  `第一部分`, `第二部分`, `第三部分`, ...
- Student paper question numbers are continuous across the whole draft.
- Original question numbers and source metadata stay internal.
- Source metadata is shown only in the right editing outline, not in the
  A4 preview or PDF.

## Workbench UX

Route:

```text
?view=draft-paper
?view=draft-paper&draftPaperId=...
```

Open behavior:

- without `draftPaperId`: open current draft; create unnamed draft if
  none exists
- with `draftPaperId`: open that draft

Workbench layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ [未命名英语练习卷]     已保存        最近草稿卷  个人空间  导出 ▾ │
├──────────────────────────────────────────────┬─────────────────────┤
│                                              │ 题组目录            │
│  gray desk                                   │ ──────────────────  │
│   ┌──────────────────────────────────────┐   │ 阅读 A       ↑ ↓ ⋮  │
│   │              Page 1                  │   │ 2024 九省联考       │
│   │                                      │   │ 无分页              │
│   │ 第一部分 阅读理解                    │   │                     │
│   │ A                                    │   │ 阅读 B       ↑ ↓ ⋮  │
│   │ [passage / questions]                │   │ 2025 浙江卷         │
│   │                                      │   │ 建议分页 · [采纳]   │
│   └──────────────────────────────────────┘   │                     │
│           建议：阅读 B 从新页开始            │ 七选五       ↑ ↓ ⋮  │
│   ┌──────────────────────────────────────┐   │ 手动分页前          │
│   │              Page 2                  │   │                     │
│   └──────────────────────────────────────┘   │                     │
└──────────────────────────────────────────────┴─────────────────────┘
```

Preview rules:

- one page is one white A4 sheet
- page gaps use gray desk background
- edit controls never appear inside white pages
- page-break hints appear in gray gaps, not in printed content
- narrow viewport shows A4 preview first, then a collapsible outline

Empty draft state:

```text
A4 page:
  未添加题组

Right outline:
  从题库搜索并点击「加入草稿卷」
```

## Search UX

Search result heading:

```text
命中 12 个篇章                         当前草稿卷 · 3
```

Card action row:

```text
加入草稿卷    找类似    阅读解析
```

After joining current draft:

```text
已在草稿卷中  找类似    阅读解析
```

Clicking `已在草稿卷中` opens the draft and scrolls near the group.
Joining does not auto-navigate; this keeps repeated selection fast.

## Export UX

Toolbar export menu:

```text
导出 ▾
  下载 PDF
  浏览器打印
  保存到个人空间
```

Export rules:

- C8 exports student paper only.
- No answer key or explanations.
- No source labels inside the PDF.
- No student info bar.
- Footer: draft paper title + page number.
- PDF generation should use browser rendering / print-to-PDF from the
  workbench print surface.

Save-to-My-Space dialog:

```text
保存到个人空间

文件名   [英语练习卷.pdf]
文件夹   [阅读训练 ▾]   [新建文件夹]

[取消] [保存]
```

No PDF thumbnail or preview in this dialog.

## My Space UX

Route:

```text
?view=my-space
```

Layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ 个人空间                                      新建文件夹     │
├───────────────────┬─────────────────────────────────────────┤
│ 文件夹            │ 阅读训练                                │
│ ───────────────   │ ─────────────────────────────────────── │
│ 全部              │ 英语练习卷.pdf  2026-05-22  4页         │
│ 阅读训练          │ 下载 PDF   打开源草稿   删除            │
│ 周末作业          │                                         │
│ 考前冲刺          │ 周末作业卷.pdf  2026-05-20  6页         │
│                   │ 下载 PDF   打开源草稿   删除            │
└───────────────────┴─────────────────────────────────────────┘
```

Folder actions:

- create
- rename
- delete empty folder

Artifact actions:

- download PDF
- open source draft
- delete artifact, with confirmation

## State / Interaction Rules

### Add Group

```text
click 加入草稿卷
-> API creates current draft if needed
-> API appends group
-> search card becomes 已在草稿卷中
-> current draft entry count increments
-> no route change
```

### Delete Group

```text
click delete in right outline
-> item removed immediately
-> auto-save
-> toast: 已移除 阅读 B    撤销
-> if undo within 8s, restore same position and auto-save
```

### Page Break

```text
click add page break before group
-> page_break_before=true
-> preview repaginates
-> gray gap marker appears
```

### Page-Break Suggestion

```text
layout engine detects ugly group split risk
-> right outline: 建议分页 · 采纳
-> gray page gap hint appears
-> teacher clicks 采纳
-> page_break_before=true
```

## Implementation Checkpoints

PA may challenge these, but PM recommends this order:

1. C8-1 draft paper data/API/search button states
2. C8-2 printable draft paper model and continuous renumbering
3. C8-3 workbench UI with A4 preview, outline, reorder, delete/undo
4. C8-4 page-breaks and page-break suggestions
5. C8-5 PDF/browser print export
6. C8-6 My Space storage and page
7. C8-7 browser smoke, product docs, cut note

C8 may become multiple PRs. Do not force all checkpoints into one PR if
state/API, PDF export, or My Space proves independently risky.

## Allowed Files

Planning / docs:

```text
docs/cuts/C8-draft-paper-composer/**
docs/adr/*c8*.md
docs/product/**
```

Likely runtime files:

```text
server/api.mjs
server/draft-paper/**
server/my-space/**
data/sql/schema.sql
data/sql/migrations/**
app/src/concierge/conciergeSearch.ts
app/src/concierge/ConciergeGroupCard.tsx
app/src/features/draft-paper/**
app/src/features/my-space/**
app/src/services/draftPaper.ts
app/src/services/mySpace.ts
app/src/App.tsx
app/src/domain/questionBank.ts
scripts/verify-c8-*.mjs
scripts/smoke-c8-*.mjs
```

PDF export may require either:

```text
server/print-renderer.mjs
```

or a new C8-specific print module. PA should decide which boundary is
cleaner.

## Forbidden Files

```text
app/src/shared-ui/papersurface/PaperSurface.tsx
app/src/shared-ui/papersurface/PaperSurface.css
shared/papersurface/**
app/src/features/reading-analysis/**
app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts
app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx
app/public/reports/**
app/public/paper-assets/**
```

Do not change imported source paper assets to make draft rendering pass.
C8 consumes existing structured assets; it does not rewrite them.

## Static Verify Requirements

Suggested scripts:

```text
scripts/verify-c8-draft-paper-contracts.mjs
scripts/verify-c8-draft-paper-render-model.mjs
scripts/verify-c8-my-space-contracts.mjs
scripts/verify-c8-forbidden-scope.mjs
```

Required assertions:

- draft tables / API routes exist
- add-to-draft rejects non-print-ready groups
- same group cannot be added twice to one draft
- search results expose `canAddToDraftPaper` and button state
- draft items preserve order
- deleting with undo restores original position
- manual page break lives only before group
- continuous renumbering produces no gaps
- source metadata does not render inside student paper
- export artifact type is `student-paper`
- My Space PDF files live outside SQLite blob storage
- artifact delete does not delete source draft
- forbidden PaperSurface / reading-analysis / paper-asset fixture scopes
  are untouched

## Browser QA Matrix

| # | Scenario | Expected |
|---|---|---|
| 1 | Search shows print-ready group | `加入草稿卷` visible |
| 2 | Click add | Card becomes `已在草稿卷中`, current draft count increments |
| 3 | Click `已在草稿卷中` | Opens draft and scrolls near group |
| 4 | Open `?view=draft-paper` with no draft | Creates unnamed draft and shows empty state |
| 5 | Add mixed groups | A4 preview shows sections by teacher order |
| 6 | Reorder via buttons | Preview and outline update, auto-save shown |
| 7 | Reorder via drag | Same as button reorder |
| 8 | Delete group | Group removed, undo toast appears |
| 9 | Undo within 8s | Group returns to previous position |
| 10 | Add manual page break | Break appears before group, gray-gap marker visible |
| 11 | Accept page-break suggestion | `page_break_before` set, preview repaginates |
| 12 | Download PDF | PDF exists, student paper only, footer/page numbers present |
| 13 | Browser print | Opens/uses same print surface without edit controls |
| 14 | Save to My Space | Select folder, saves PDF artifact |
| 15 | My Space page | Folder list and PDF rows render |
| 16 | Download artifact from My Space | Downloads saved PDF |
| 17 | Open source draft from artifact | Opens editable source draft |
| 18 | Delete artifact | Confirms, deletes artifact/PDF, source draft remains |
| 19 | Narrow viewport | A4 preview above, outline collapsible below |
| 20 | Source metadata | Visible in outline, absent from A4/PDF |

## Open PO Decisions

None after PM grill. PA should still challenge if any decision is
contradictory or unverifiable.
