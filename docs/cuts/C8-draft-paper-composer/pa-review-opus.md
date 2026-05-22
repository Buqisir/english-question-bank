# C8 PA Review — Opus

Reviewer: external Opus PA, acting under `docs/agents/pa-persona.md`.
Cut: C8 — Draft Paper Composer / 草稿卷组卷与个人空间 V1.
PR: #92 (`codex/c8-draft-paper-planning`).
Read before review:

- `AGENTS.md` (current branch head)
- `.kiro/steering/cut-workflow-protocol.md`
- `.kiro/steering/product-scope-discipline.md`
- `docs/agents/pa-persona.md`
- `docs/cuts/C8-draft-paper-composer/pm-spec.md`
- `docs/cuts/C8-draft-paper-composer/decisions.md`
- Existing runtime grounding: `server/api.mjs` (paper-set + export
  endpoints), `server/print-renderer.mjs`, `app/src/paperAssembly/*`
  (Assembly Basket, paper draft model, paper export payload),
  `CONTEXT.md`.

PA mode only. This file is the single artifact this review produces.

---

## 1. Verdict

**APPROVE WITH MUST FIX.**

Direction is sound. C8 is a real, teacher-operable composition loop
that the project needs, the success criterion ("a teacher exports one
usable student paper from selected groups") is concrete, and the PM
spec mostly avoids the "mini Word processor" trap.

But six things must be locked before DEV starts. Three of them are
data-contract questions that, if left to DEV interpretation, will
guarantee rework. The other three are scope / parity questions
without which the print-ready gate, the PDF-vs-preview parity, and
the undo flow are not verifiable.

Open PO decisions count: **3** (below §7 hard-brake threshold). Cut
size is large but tolerable if checkpoint 6 (My Space) is split into
its own PR (see §10).

---

## 2. Product Principle

The draft paper is a **composition workbench, not a mini Word
processor.** The teacher composes at group granularity, sees one A4
page per page, and exports a PDF that matches the preview byte-for-
byte in structure. Everything that does not serve "make a printable
student paper from existing groups" is out.

Two corollaries the PM spec already states; both must hold under DEV
pressure:

- All editing controls live outside the A4 white surface. The A4
  surface is what the PDF will be.
- Group is the minimum unit. Paper is the maximum unit. No single-
  question add/delete in C8, no manual content edits.

---

## 3. Exact UX / Architecture Model

### Domain model — single source of truth

C8 introduces a new `draft_papers` / `draft_paper_items` pair. This
**conflicts with `CONTEXT.md`**, which currently states:

> "There is no separate 'PaperDraft' domain object; draft is a state
> of Paper Set."

Two acceptable resolutions; pick one in MF1 before DEV:

a) **New domain object.** `draft_papers` exists alongside
   `paper_sets`. `Paper Set` becomes "finalized / shareable / scored
   collection." `Draft Paper` becomes "auto-saved working
   composition." `CONTEXT.md` must be updated and an ADR
   (`docs/adr/0006-draft-paper-as-distinct-entity.md` or similar)
   must record the split and the migration story for `paper_sets`.

b) **Same entity, state field.** Reuse `paper_sets` with a new
   `status` column (`draft` / `finalized`), reuse `paper_items` for
   draft items. Add only the columns C8 actually needs
   (`page_break_before` on `paper_items`, `current_marker` on
   `paper_sets`).

I recommend (a) because the auto-save / continuous-renumbering /
group-only constraints of Draft Paper diverge from the existing
`paper_sets` semantics (scored, section-titled, optionally exported),
and conflating them invites cross-contamination. But this is a
product-architecture decision; either is defensible. **DEV must not
choose this implicitly.**

### Assembly Basket retirement

The repo already has an Assembly Basket living in `localStorage`
(`app/src/paperAssembly/basketPersistence.ts`,
`assembly-basket-v1`). C8's "current draft paper" replaces it
semantically. The PM spec does not say what happens to the basket.

The spec must commit, before DEV: **the localStorage Assembly Basket
is retired by C8 and a one-time migration converts any existing
basket items into the user's current draft paper on first open of
C8.** Otherwise teachers with an in-flight basket lose it silently
when C8 ships.

### Search → add-to-draft contract

```ts
type QuestionGroupSearchResult = {
  // existing fields
  canAddToDraftPaper: boolean
  draftPaperButtonState: 'add' | 'in_current_draft' | 'disabled'
  currentDraftPaperId: string | null      // ← spec says optional; make required-nullable
  printUnavailableReason: string | null
}
```

`currentDraftPaperId` is **null** when no current draft exists, not
absent. UI consumes a 3-valued button-state enum + a nullable id.
Backend creates the draft on first successful add. Search response
must come from one query path; do not derive
`canAddToDraftPaper` in two places.

### Print-ready gate — concrete definition

The PM spec's print-ready definition is too loose. Lock it in MF2 as:

```text
A group is print-ready iff ALL hold:
  - group exists in question_groups
  - group.group_type ∈ {reading, cloze, seven_choices,
                        grammar_cloze, writing, continuation}
  - for each question in group: question.stem is non-empty
  - for objective groups (reading, cloze, seven_choices,
    grammar_cloze): every question has options with non-empty content
  - for writing / continuation groups: passage.material_text or
    explicit writing prompt is non-empty
  - the group's paper-asset (if any) exists and is consistent (no
    dangling questionId references)
```

`listening` groups are explicitly **not** print-ready in C8 (no audio
in print). `printUnavailableReason` returns the first failed clause.

This must be a single function in the search backend, tested by
unit-level verify before any UI consumes it.

### Composition rules — committed

- Same group cannot appear twice in one draft. Enforced by unique
  `(draft_paper_id, group_id)` index.
- Cross-draft duplicates allowed.
- Section heading is **derived, not stored**: each transition in
  `group_type` along `order_index` starts a new section labelled `第N
  部分 {groupTypeLabel}`. Non-merging across non-contiguous blocks of
  the same type is the rule.
- Question numbering is **continuous across the whole draft**,
  starting at 1, no gaps. Source `question_no` is hidden in print
  output.
- Source labels (year, paper name, region) are visible only in the
  right-side outline, never in the A4 page or PDF.

### PDF / preview parity — reuse, don't rewrite

The repo already has `server/print-renderer.mjs::buildPrintHtml`,
which produces semantic HTML for Vivliostyle and accepts:
`title`, `versionType`, `printStyle`, `items`, `blocks`,
`questionNumberStart`. Blocks include `section_header`,
`page_break`, `question_group`. Continuous numbering across blocks
already works (`questionNum` accumulates).

C8 must reuse `buildPrintHtml` with:

- `versionType = 'student'` always
- `printStyle = 'exam'` (or new `printStyle = 'draft'` if PA agrees
  later — out of scope here)
- `blocks` built from `draft_paper_items` order + page-break flags +
  derived section headings
- `questionNumberStart = 1`

**Preview must use the same HTML.** Either:

- Server returns the same HTML string under
  `POST /api/draft-papers/:id/print-html`, client renders it in an
  iframe sized to A4 with a print-emulation CSS link, **or**
- Server returns a JSON `blocks` payload that the client renders with
  the same template (template duplicated between server and client).

Recommended: **first option (single HTML source of truth)**. Avoids
duplicated template drift. The print-HTML endpoint already exists
(`POST /api/exports/print-html`); C8 either reuses it with a new
payload builder, or adds `POST /api/draft-papers/:id/print-html` as a
thin wrapper.

`buildPrintHtml` itself is **not modified** in C8. No new
`printStyle`, no new `versionType`, no new block kind. If C8
discovers a needed template change, that is a separate ADR + PR.

### Page-break suggestion engine — must commit to one mechanism

PM spec's "light page-break suggestion" is undefined. Two viable
mechanisms:

a) **Server pre-measurement.** Server estimates group height from
   text length / option count / passage word count using a
   conservative heuristic. Surfaces suggestion before render.
   Verifiable in unit tests.

b) **Client post-render detection.** Client renders the preview,
   measures actual page overflow, surfaces suggestion based on real
   layout. More accurate but only runs after paint.

Recommend (a) for V1: deterministic, testable, server-derived,
matches the "preview ≈ PDF" model. A conservative threshold (e.g.
"reading group with > 600 words OR > 4 options × 4 questions →
suggest page break before") is enough for V1. Heuristic tuning is a
follow-up.

This must be picked in MF3.

### Delete-with-undo — soft delete with TTL tombstone

PM spec says "8-second undo. Undo restores group to previous
position." Two implementations:

a) **In-memory tombstone.** Server hard-deletes the row immediately
   on click; client holds the deleted row in memory for 8s; undo
   re-POSTs an add with the original `order_index`. Cross-tab undo
   does not work.

b) **Soft delete.** Row gets `deleted_at`; query filters out
   deleted; undo clears `deleted_at`. Server-side garbage collector
   sweeps deleted rows older than 60s. Cross-tab undo works.

(a) is enough for V1. The spec must commit so DEV does not pick (b)
and then drop the GC.

### My Space artifact storage — outside `app/public/`

Stored at `data/user-space/files/<artifactId>.pdf` per spec.
Implications:

- A new server static handler at `GET /user-space/files/:artifactId`
  is needed (mirrors `sendPaperAssetStatic` from C7). Must enforce
  path-traversal guards (compare resolved paths, not joined paths).
- Vite dev-server proxy needs `/user-space` route added (mirrors C7's
  `/paper-assets` addition).
- `.gitignore` must exclude `data/user-space/files/` (binary files,
  not source of truth).
- Server boot must `mkdirSync` the dir.

### Draft delete + artifact "open source draft" — fail-graceful

When a teacher deletes the source draft after saving an artifact,
the artifact's `source_draft_paper_id` becomes a dangling reference.
Required behavior:

- "Open source draft" button shows a confirmation toast: "原草稿卷
  已删除，PDF 仍可下载" when the source is missing.
- Artifact row is **not** deleted in cascade. PDF stays valid.
- Deleting a draft does not delete its artifacts (FK is logical, not
  cascading).

---

## 4. Must Fix Before DEV

### MF1 — Domain model split decision + `CONTEXT.md` reconciliation.

Pick exactly one:

- (a) New `draft_papers` entity. Add ADR
  `docs/adr/0006-draft-paper-as-distinct-entity.md` explaining why
  this differs from `paper_sets`. Update `CONTEXT.md` "Relationships"
  and "Language" sections.
- (b) Reuse `paper_sets` with `status` column. Add migration in
  `data/sql/migrations/` adding `status`, `current_marker`, and
  `page_break_before` (on `paper_items`).

Without this, DEV will pick one silently and the other half of the
codebase will diverge.

### MF2 — Lock the print-ready definition as code, not prose.

Add `isGroupPrintReady(group): { ok: boolean, reason?: string }` as a
single exported function (likely in `server/draft-paper/printReady.mjs`
or `app/src/services/draftPaper.ts`). Search backend and
add-to-draft API both call it. Definition follows §3 above.

Without this, "print-ready" becomes a moving target and the disabled
state on cards becomes a fake gate.

### MF3 — Commit to page-break suggestion mechanism + heuristic.

Spec must state in `decisions.md`: "C8 uses server-side
pre-measurement. Heuristic v1: ..." with the actual threshold rules.
DEV implements that heuristic, no more.

Without this, "suggestion" becomes whatever pattern DEV finds
plausible, and teachers learn to ignore it.

### MF4 — Assembly Basket retirement / migration plan.

`decisions.md` must add:

- Whether the `assembly-basket-v1` localStorage key is retired on C8
  ship. **Recommend: yes, retired.**
- One-time migration on first C8 open: read existing basket,
  POST-add each group to a new unnamed draft, clear localStorage on
  success.
- After C8 ship, code paths writing to `assembly-basket-v1` are
  removed in the same PR; only the read-on-first-open migration
  path remains.

Without this, teachers lose in-flight baskets on the day C8 ships.

### MF5 — Preview = PDF rendering parity, single source of truth.

`decisions.md` must commit to:

- Preview renders the **same HTML** that PDF generation consumes.
- The HTML comes from `server/print-renderer.mjs::buildPrintHtml`
  (existing function, used unchanged).
- Client mounts that HTML inside an iframe with a print-stylesheet,
  not a parallel React template.

Verify script must include a structural snapshot: same draft → same
blocks → same `buildPrintHtml` output between "preview HTML" and
"PDF HTML." If they differ by even one block boundary, the spec is
broken.

Without this, DEV will write a client template and the PDF will
silently drift from the preview within two cuts.

### MF6 — Static file path security + new `/user-space` static route.

`decisions.md` and the dev-plan must include:

- New server static handler `GET /user-space/files/:artifactId.pdf`
  with the same path-resolution guard pattern as
  `sendPaperAssetStatic` (compare `path.resolve(root)` against
  `path.resolve(filePath)`; reject `..` in input).
- Vite dev-server proxy adds `/user-space` route.
- `.gitignore` excludes `data/user-space/files/`.
- `data/user-space/files/` is created on server boot if missing.

Without this, My Space file URLs either 404 in dev or accidentally
serve outside the intended root.

---

## 5. Should Watch

- **SW1** — Current-draft entry "当前草稿卷 · 3" in search heading
  area. Spec is silent on whether this is clickable. Make it
  clickable to open `?view=draft-paper`. Record as polish, not Must
  Fix.
- **SW2** — Two browser tabs open with the same current draft, both
  add a group. The second tab's "in_current_draft" badge does not
  update without refresh. V0 single-user local, acceptable, but note
  in cut note.
- **SW3** — Vivliostyle CLI install: the existing PDF path requires
  `@vivliostyle/cli` under `node_modules/.bin/vivliostyle`. C8 smoke
  must verify it is installed (fail loudly with the existing error
  message). The error path already exists in `server/api.mjs`; C8
  just inherits it.
- **SW4** — PDF generation latency. Vivliostyle on a 4-page paper
  takes seconds. UI must show a spinner with a clear "正在生成 PDF…"
  state to avoid teachers double-clicking export.
- **SW5** — Mixed-type composition: when a teacher adds Reading +
  Writing + Listening (excluded), the listening card is
  `disabled`. Make sure search visibly groups disabled cards
  differently or shows the reason on hover; otherwise teachers
  retry-click.
- **SW6** — Page-break-before suggestion: when the teacher accepts a
  suggestion, the same suggestion should not re-suggest itself next
  render. Track "user dismissed / accepted" client-side; do not let
  the right outline nag.
- **SW7** — Section headings auto-renumber on reorder. A teacher
  drags Reading from position 1 to position 3, where Cloze was
  第一部分; section labels rotate. Make sure this re-derivation
  happens client-side after every order change and survives
  auto-save round-trip.
- **SW8** — PDF footer "draft title + page number" — if the draft is
  unnamed, what does the footer show? Spec doesn't say. Recommend:
  empty title + "第 N 页" only, not "未命名英语练习卷 · 第 N 页"
  which leaks UI placeholder into print. Polish, not blocking.
- **SW9** — Save-to-My-Space generates the same PDF as Download. Do
  not re-render. Cache the PDF blob for ~30s after first generation
  and reuse for the save action. Saves Vivliostyle invocation cost.

---

## 6. Allowed Files

```
docs/cuts/C8-draft-paper-composer/**
docs/adr/0006-draft-paper-as-distinct-entity.md   (or equivalent)
docs/product/**

server/api.mjs
server/draft-paper/**                              (new)
server/my-space/**                                 (new)
server/print-renderer.mjs                          (READ-ONLY: payload
                                                    builders may call
                                                    buildPrintHtml, but
                                                    the function itself
                                                    is not modified)

data/sql/schema.sql
data/sql/migrations/**                             (new)

app/src/concierge/conciergeSearch.ts
app/src/concierge/ConciergeGroupCard.tsx
app/src/concierge/ConciergeDesk.tsx                (current-draft entry
                                                    in search heading)
app/src/features/draft-paper/**                    (new)
app/src/features/my-space/**                       (new)
app/src/services/draftPaper.ts                     (new)
app/src/services/mySpace.ts                        (new)
app/src/App.tsx                                    (route hookup only)
app/src/domain/questionBank.ts                     (draft-paper types
                                                    only)
app/src/paperAssembly/basketPersistence.ts         (READ-ONLY +
                                                    deletion of write
                                                    paths after
                                                    migration)

app/vite.config.ts                                 (proxy /user-space)
.gitignore                                         (exclude
                                                    data/user-space/files/)

scripts/verify-c8-*.mjs                            (new)
scripts/smoke-c8-*.mjs                             (new)
```

---

## 7. Forbidden Files

```
app/src/shared-ui/papersurface/**
shared/papersurface/**
app/src/features/reading-analysis/**
app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts
app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx
app/src/features/paper-intelligence/**             (PaperSurface harness
                                                    is forbidden; PI
                                                    route plumbing is
                                                    forbidden)
app/public/reports/**
app/public/paper-assets/**                         (C7 import territory;
                                                    do not retroactively
                                                    edit imported assets
                                                    to make rendering
                                                    pass)
CONTEXT.md                                         (READ-ONLY unless MF1
                                                    chooses option (a),
                                                    in which case it is
                                                    edited via ADR 0006
                                                    in the same PR)
```

`server/print-renderer.mjs::buildPrintHtml` body is logically
forbidden even though the file is allowed. Adding a new `printStyle`,
new `versionType`, or new block kind requires a separate ADR.

---

## 8. Static Verify Requirements

Required scripts and assertions:

### `verify-c8-draft-paper-contracts.mjs`

- `draft_papers` and `draft_paper_items` (or `paper_sets` + `status`
  per MF1 outcome) exist in `data/sql/schema.sql`.
- API endpoints exist: `POST /api/draft-papers`,
  `GET /api/draft-papers/:id`, `PUT /api/draft-papers/:id/items`,
  `DELETE /api/draft-papers/:id/items/:itemId`,
  `POST /api/draft-papers/:id/items/:itemId/undo`,
  `POST /api/draft-papers/:id/print-html`,
  `POST /api/draft-papers/:id/pdf`.
- Search response shape contains `canAddToDraftPaper`,
  `draftPaperButtonState`, `currentDraftPaperId`,
  `printUnavailableReason`.
- Add-to-draft API rejects: non-print-ready group, group already in
  draft, missing draft.
- Same group cannot be inserted twice into one draft (DB constraint
  asserted).
- Item order is preserved across PUT items array order.
- Page-break suggestions API returns deterministic output for the
  fixture draft.

### `verify-c8-draft-paper-render-model.mjs`

- Build a fixture draft with mixed groups (reading + cloze +
  seven_choices).
- Assert `buildPrintHtml` output contains:
  - `第一部分`, `第二部分`, `第三部分` section headers in derivation
    order.
  - Continuous question numbering: questions are numbered 1, 2, 3,
    ... with no gaps and no original `question_no` leakage.
  - No `data-source-*` / `data-paper-asset-*` / source-label
    attributes inside the print HTML.
  - Page break inserts a `<div class="page-break">` between blocks.
- **Preview-vs-PDF parity:** same draft, render via the preview
  endpoint and via the PDF endpoint. Strip Vivliostyle-specific
  wrapper. Assert the body block structure is identical.

### `verify-c8-my-space-contracts.mjs`

- `my_space_folders` and `my_space_artifacts` tables exist.
- `POST /api/my-space/folders`, `PATCH .../folders/:id`,
  `DELETE .../folders/:id`, `POST /api/my-space/artifacts`,
  `GET /api/my-space/artifacts`,
  `DELETE /api/my-space/artifacts/:id` exist.
- Artifact PDF lives at `data/user-space/files/<artifactId>.pdf`,
  not in DB blob.
- Deleting an artifact deletes both the file and the row.
- Deleting an artifact does not affect `draft_papers` rows.
- Static handler `/user-space/files/:artifactId.pdf` resolves to the
  same file.
- Path-traversal guard: requesting `/user-space/files/../foo` returns
  400/404.

### `verify-c8-print-ready-gate.mjs`

- `isGroupPrintReady` returns `{ok: false, reason: ...}` for each
  failure mode listed in §3 (listening, missing options, missing
  stem, missing passage for writing, dangling questionId).
- Returns `{ok: true}` for fixture groups: a reviewed reading group,
  a seven-choices group, a cloze group, a grammar-cloze group.

### `verify-c8-forbidden-scope.mjs`

- Forbidden file list from §7 is untouched in the PR diff vs `main`.
- `buildPrintHtml` body byte-identical to `main`.
- No new `printStyle` / `versionType` / block kind.
- `CONTEXT.md` changed only if ADR 0006 is present in the same PR.

---

## 9. Browser QA Matrix

PM spec's 20-scenario matrix is mostly sufficient. Required
additions:

| #  | Scenario | Expected |
|----|----------|----------|
| 21 | Download PDF, save to disk, reopen | PDF visually matches preview block-for-block, page break in same position |
| 22 | Browser zoom 90% | A4 preview readable, outline does not overlap A4, page-break gap clear |
| 23 | Browser zoom 100% | Same as 22 |
| 24 | Delete current draft, then click 加入草稿卷 on a card | New unnamed draft created, badge becomes 已在草稿卷中 |
| 25 | Two tabs of `?view=draft-paper`, add group in tab A, refresh tab B | Tab B shows added group |
| 26 | Listening group card | Add button hidden or disabled with visible reason |
| 27 | Reading group with dangling questionId (manufactured) | Add button disabled with reason |
| 28 | Save to My Space, then delete source draft, return to My Space | Artifact still visible, "open source draft" shows toast that source is gone, download still works |
| 29 | Generate PDF, then click Save to My Space within 30s | No second Vivliostyle invocation observable (use server log timing) |
| 30 | Vivliostyle CLI absent | Export menu shows actionable error, not a stack trace |
| 31 | Folder with 0 artifacts | Delete folder succeeds |
| 32 | Folder with 1+ artifacts | Delete folder blocked with reason |
| 33 | Empty draft, click Download PDF | Disabled or shows "请先添加题组" |

PM spec scenarios 1–20 are kept as-is.

---

## 10. DEV Readiness

**Not yet, until MF1–MF6 are committed in `pm-spec.md` /
`decisions.md` / ADR 0006.** Once committed, **DEV is ready**.

**PR shape recommendation:**

The PM spec's 7 checkpoints are correctly ordered. Split as follows
to keep individual PRs reviewable:

- **PR A — Composer + PDF.** Checkpoints C8-1 → C8-5.
  - draft-paper schema, API, search button states (C8-1)
  - render model + continuous renumbering (C8-2)
  - workbench UI: A4 preview, outline, reorder, delete/undo (C8-3)
  - page breaks + suggestions (C8-4)
  - PDF/print export (C8-5)

  This PR ships a complete user-visible loop (search → compose →
  PDF). It is large but coherent: every checkpoint depends on the
  previous. Splitting C8-1 from C8-5 would ship partial value.

- **PR B — My Space + smoke + cut note.** Checkpoints C8-6 → C8-7.
  - My Space schema, API, page (C8-6)
  - browser smoke covering both PRs, product docs, cut note (C8-7)

  My Space depends on PDF export (the artifact source), but its UI,
  schema, and storage path are independent. Splitting it lets PR A
  ship the composer loop without storage-related rework risk
  blocking it.

  Smoke covers both PRs; runs in PR B.

PR B must not start until PR A is merged. Codex may internally
checkpoint within each PR.

C7's lesson: a single PR covering validate + publish + UI + smoke
was reviewable but every Must Fix landed in the storage / atomicity
layer, raising revert cost. C8 should not repeat that. The PR split
above is the minimum that keeps blast radius bounded.

---

## 11. Open PO Decisions

**3 decisions remain. Below the §7 hard-brake threshold; DEV can
start once PM closes them.**

### PO-1 — Domain model: new `Draft Paper` entity or `Paper Set` state?

PA recommends option (a) — new `draft_papers` entity, ADR 0006
documents the split. PM closes this in MF1.

### PO-2 — Assembly Basket retirement.

Recommend: kill the localStorage `assembly-basket-v1` write paths on
C8 ship, with a one-time read-and-migrate on first C8 open. PM
closes this in MF4.

### PO-3 — Behavior when artifact's source draft has been deleted.

Recommend: artifact stays valid, "open source draft" shows a
"原草稿卷已删除" toast, PDF download remains functional. PM commits
this in `decisions.md`.

---

End of report.
