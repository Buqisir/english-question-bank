# figure-render — PA Review (formal, fresh-context)

Reviewer: PA (Opus, un-anchored). Plan under review: `docs/cuts/figure-render/plan.md` @ b79285b.
Read: pa-persona, review-levels, nck1-paper-standard §8, exam-paper-format-standards,
manifest.json + paper-asset.json (para-2026-i-reading-a-3), PaperSurface.tsx,
print-renderer.mjs, docxRenderer.mjs, draftPaperPreviewHtml.ts, QuestionGroupDetailView.tsx,
PaperBrowsePage.tsx, paperAssetSurfaceAdapter.ts, verify-nck1-standard.mjs, watch-ledger.

---

## Verdict

**DEV NOT READY.**

The direction (kill the raw `[表: …]` token on every visible surface; render the
real figure with a placeholder-card fallback) is correct and worth doing — this is
a genuine P0. But the plan is **not** implementable as scoped, for two structural
reasons that must be resolved before any DEV starts:

1. **The render-face inventory is wrong.** Two of the four surfaces the plan lists
   are mis-attributed, and one real token surface (详情页语篇卡) is a separate file
   the plan never actually targets — and forbids.
2. **The client fix lives entirely inside E3-locked files.** The two client
   surfaces that show the token can only be fixed by editing `PaperBrowsePage.tsx`
   and `QuestionGroupDetailView.tsx`, both on this cut's own Forbidden list. The
   "并行边界…零交集" claim is false. As written the cut cannot reach its own goal in
   parallel with E3.

Neither is a "DEV figures it out" detail; both change the shape of the cut. The
server surfaces (print/PDF/DOCX/draft-preview) are clean and could ship as a first
wave. Recommend splitting, per Must Fix 1.

---

## Product Principle

The teacher/student must never see an internal token on any rendered surface
(PRODUCT 原则 5, 所见即所印). Per §8 保真分级 the target is surface-tiered:

- 试卷面 (A4 preview / print / PDF / DOCX): 真题观感 → show the **image only**,
  the flattened table text is duplication and must be suppressed.
- 网站面 (详情页语篇卡, 整卷卷面 PaperSurface): 语义完整 + 图表在场 + 阅读友好 →
  show the image; keeping the flattened text is acceptable (it is the做题-safe
  double-store), a raw token is not.

The cut's job is to make "图表在场" true on every surface without eating prose and
without silently downgrading the试卷面 below §8.

---

## Exact Architecture Model (corrected inventory)

Verified from code. The single token instance is
`content.groups.group-2026-i-reading-a.passage.paragraphs[2].text` =
`"[表: fig-…-table-1] Los Angeles Rams v … 1:25 PM"`. The marker is
**paragraph-initial** and that paragraph contains **only** the flattened table —
this is the property the whole plan silently depends on (see Must Fix 4).

There are **four distinct render paths**, not the "四处 / 三处同源" the plan draws:

| # | Surface (user-visible) | Actual file / path | Token carrier | Forbidden by this cut? |
|---|---|---|---|---|
| 1 | 整卷卷面 (browse) + 讲评栏 (PI harness) | `PaperSurface.tsx` (shared component) | `textMap.paragraphs[].text` via `paperAssetSurfaceAdapter.ts:171` | PaperSurface **no**; but its mount `PaperBrowsePage.tsx` **YES** |
| 2 | **详情页语篇卡** | `QuestionGroupDetailView.tsx:275-277` — raw `<pre>{passage.materialText}</pre>` | `materialText` (api.mjs `paperAssetParagraphText`, `\n\n`-joined) | **YES** |
| 3 | print / PDF **and** 工作台 A4 预览 **and** 草稿卷预览 | `print-renderer.mjs` (`detail.passage.materialText`.split `\n`) — `draftPaperPreviewHtml.ts` is a pure CSS+pagination wrapper over this HTML (`DraftPaperWorkbench.tsx:212 buildA4PreviewHtml(printHtml)`) | materialText line | **no** |
| 4 | DOCX export | `docxRenderer.mjs` — **4 passage-emit sites** (L618, L688, L775, L843) across `buildExamDocumentXml` (student试卷) + `buildDocumentXml` (teacher含解析) | `normalizeDocxLines(materialText)` | **no** |

Plan errors this table fixes:
- Plan says 详情页语篇卡 = PaperSurface. **False** — it is a `<pre>` dump in
  `QuestionGroupDetailView.tsx`. Fixing PaperSurface leaves the detail token intact.
- Plan says 工作台 A4 预览 = PaperSurface. **False** — it is print HTML
  (`buildA4PreviewHtml(printHtml)`). The real PaperSurface 3rd mount is the PI
  讲评 harness.
- Plan lists "草稿卷预览 → draftPaperPreviewHtml.ts (若独立合成)" as an open DEV
  question. **Answered now:** it is NOT an independent synthesizer and needs no
  figure logic. Fixing print-renderer.mjs fixes surface 3 in full. DEV must not
  touch draftPaperPreviewHtml.ts for tokens (but see Should Watch: overflow clip).
- Plan says "DOCX one face". **False** — 4 emit sites; all must be handled.

Good news: fixing `print-renderer.mjs` collapses three of the plan's rows into one,
and fixing `PaperSurface.tsx` covers both browse and讲评 harness. The bad news is
the wiring and the detail `<pre>` (Must Fix 1–2).

---

## Must Fix Before DEV

### MF-1 — Boundary conflict with E3: the client fix is inside Forbidden files. Split the cut.
The two client surfaces (整卷 PaperSurface, 详情页 `<pre>`) can only be fixed by
editing `PaperBrowsePage.tsx` (to fetch manifest.json and thread a new
figures/assetBase input into `paperAssetSurfaceAdapter` / the `<PaperSurface>` mount
at L1110) and `QuestionGroupDetailView.tsx` (the `<pre>` at L275). **Both are on
this cut's own Forbidden list** (E3 owns them). `PaperBrowsePage` already holds
`assetBase` (L282/L432) but the adapter is pure and cannot fetch, so the page must
pass the manifest — an unavoidable edit. `PaperSurface.tsx` itself is editable; its
mount owners are not.
- **Risk:** DEV either (a) edits E3-locked files and corrupts the parallel merge, or
  (b) ships PaperSurface/print/docx changes and the token **remains** on the detail
  page and browse卷面 — the P0 is declared closed while two user-visible surfaces
  still print the token. Fake availability.
- **Required disposition:** Restructure into two waves. **Wave A (parallelizable
  now):** server surfaces only — `print-renderer.mjs` + `docxRenderer.mjs`
  (touches zero Forbidden files; fixes PDF + 工作台 A4 预览 + 草稿卷预览 + DOCX).
  **Wave B (serialized AFTER E3 merges + unlock):** client surfaces —
  `PaperSurface.tsx` + `PaperBrowsePage.tsx` + `QuestionGroupDetailView.tsx`. Record
  the wave split, the E3-after ordering, and the rebase owner in `plan.md`. The
  single-cut/parallel framing must go.

### MF-2 — 详情页语篇卡 (`<pre>{materialText}</pre>`) is a token surface the plan never targets.
The audit's own P0 names 详情页 as a token surface; the code confirms it is a raw
`<pre>` dump, not PaperSurface. The plan's render-face table has no row that fixes it,
and its Forbidden list blocks the file that renders it.
- **Risk:** the most-inspected teacher surface keeps showing `[表: fig-…]` after the
  cut "completes".
- **Required disposition:** Add 详情页 as an explicit surface in `plan.md`'s
  inventory, assigned to Wave B, with `QuestionGroupDetailView.tsx` moved from
  Forbidden to Allowed (post-E3). Per §8 网站面 tier it must show the image
  (图表在场); keeping the trailing flattened text is acceptable. If owner instead
  wants 详情页 out of scope, that is a PO decision (below) — but "P0 closed" cannot
  be claimed while it still emits a token.

### MF-3 — DOCX has 4 passage-emit sites and zero existing image capability; "no silent降级".
`docxRenderer.mjs` emits the passage at L618/L688/L775/L843 (student试卷 + teacher
doc). No `ImageRun`/media import exists today — DOCX embed is greenfield. §8 保真分级
requires the试卷面 (student DOCX) to reach真题观感; a text-placeholder降级 on that
surface **violates the standard**.
- **Risk:** DEV spikes embed, finds it fiddly, and silently ships a text降级 that
  breaks §8 without owner knowledge; or fixes one emit site and leaves the other
  three printing the token.
- **Required disposition:** `plan.md` must (a) enumerate all 4 emit sites as
  in-scope, (b) lock a rule: DOCX student-试卷 must embed the PNG; if embed proves
  infeasible, **STOP and escalate to owner** —降级 is not a DEV-chosen fallback
  (see PO-1). The teacher解析 doc may use the same embed or the placeholder card, but
  never a raw token.

### MF-4 — The "hide flattened text after marker" rule rests on an unenforced convention. Scope it to the paragraph and lock the invariant.
The plan hides "marker 之后的拍平文本" but never defines where that text ends. The
only safe delimiter is the paragraph/line boundary, and that only works because the
marker currently occupies its own paragraph. `verify-nck1-standard.mjs` F1 (L207-228)
asserts only `materialText.includes(placeholderMarker)` — it does **not** enforce
"marker is paragraph-initial / its paragraph is figure-only". The manifest `note` is a
one-time comment, not a checked contract.
- **Risk:** a future paper with `[marker] <table text> <real prose>` in one
  paragraph, or a marker mid-paragraph, causes the renderer to silently eat prose the
  student needs — a data-loss regression that ships green.
- **Required disposition:** (a) Implement replacement at **paragraph granularity**
  (client) / **line granularity** (print/docx `\n`-split): a paragraph/line whose
  trimmed text *starts with* a manifest marker → replace the whole unit with the
  figure. Never a substring "hide everything after the marker inside a mixed unit".
  (b) Add a verify assertion (in the new verifier or extending F1) that every
  manifest `placeholderMarker` sits at the **start of a paragraph** and that
  paragraph carries no non-figure prose. If violated → hard fail, so the renderer
  never silently trims. (c) A `[表:`/`[图:` token with **no** manifest hit → fallback
  card, never a silent hide (plan already says this; keep it).

---

## Must Fix → Plan Disposition Checklist

| MF | What `plan.md` must record |
|---|---|
| MF-1 | Two-wave restructure: Wave A = print+docx (parallel-safe); Wave B = client, serialized after E3 merge+unlock. Remove "single cut / 与 E3 零交集". Name rebase owner + ordering. |
| MF-2 | Add 详情页语篇卡 (`QuestionGroupDetailView.tsx:275`) as a Wave-B surface; move that file Forbidden→Allowed (post-E3). §8 网站面 = image present; flattened text may stay. |
| MF-3 | List all 4 docxRenderer emit sites in-scope; lock "student DOCX must embed PNG; embed-infeasible ⇒ escalate to owner, no silent降级"; teacher doc may use card. |
| MF-4 | Paragraph/line-granularity replacement rule (no substring hide); new verify assertion that markers are paragraph-initial + figure-only; no-manifest token ⇒ fallback card. |

---

## Should Watch (non-blocking)

- **SW-1 — draft A4 preview clips tall figures.** `draftPaperPreviewHtml.ts` sets
  `.preview-page { overflow: hidden }` and paginates by moving whole nodes. A figure
  taller than the page content area is placed alone and **silently clipped**, not
  broken cleanly. Non-blocking (the one real figure is a wide landscape table, likely
  short in height) but must be a QA checkpoint. Does not justify touching
  draftPaperPreviewHtml.ts now.
- **SW-2 — print/PDF figure page-break.** print-renderer has no figure styling; a
  figure `<img>` needs `max-width:100%` (≤版心 162mm/459pt, exam-format §1) and
  `break-inside: avoid` (§3b/§9 阅读原子不跨页). QA the PDF at the page boundary.
- **SW-3 — PaperSurface prop additivity.** The new figures/assetBase input to
  PaperSurface must be optional/defaulted so the PI harness, existing mounts, and
  every PaperSurface verify snapshot stay byte-for-byte unchanged for non-figure
  paragraphs — mirror the I15 `blankFocusMode` gating discipline. Watch-ledger has no
  figure entry; a new paragraph-level figure branch does not collide with the
  evidence-line / rail / z-index items, but keep the branch gated.
- **SW-4 — manifest `caption` is ops metadata.** `caption` contains
  "…source paper.pdf p.4". Correct call (plan already leans this way): **do not
  render caption on any student/试卷 surface.** Confirmed disposition, not open.

---

## Allowed Files

- Wave A: `server/print-renderer.mjs`, `server/exports/docxRenderer.mjs`, new
  `scripts/verify-figure-render.mjs`, and the docx image-embed helper if extracted.
- Wave B (post-E3): `app/src/shared-ui/papersurface/PaperSurface.tsx`,
  `app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts`,
  `app/src/features/paper-browse/PaperBrowsePage.tsx`,
  `app/src/features/question-detail/QuestionGroupDetailView.tsx`, related CSS.
- Optionally `scripts/import-pipeline/verify-nck1-standard.mjs` for the MF-4 invariant
  (coordinate — E3 does not own it, but confirm no import-cut collision).

## Forbidden Files

- Data side: `paper-asset.json`, `figures/**`, `figures/manifest.json` (read-only).
- E3 boundary during Wave A: `App.tsx`, `PaperBrowsePage.tsx`,
  `QuestionGroupDetailView.tsx`, `app/src/concierge/**`,
  `QuestionGroupDetailView.tsx`, and E3's verify scripts (per plan header). These
  unlock for Wave B only after E3 merges.
- Do not touch `draftPaperPreviewHtml.ts` for token logic (it is not a figure site).
- Do not implement 表格结构化 / adapters input-output contract changes / the
  "含图不可入草稿卷" ban.

## Static Verify Requirements

- New `scripts/verify-figure-render.mjs`, manifest-driven (zero hardcoded figure id):
  - For each paper with `figures/manifest.json`: assert each surface's rendered
    output contains the image reference (`<img …file>` for print HTML / PaperSurface;
    an ImageRun/media part for DOCX) **and** contains no `placeholderMarker` raw token.
  - Whole-library anti-pattern: **no** render output (all four paths) contains
    `[表: fig-` or `[图: fig-`. Must exercise the **detail `<pre>` path** and **all 4
    docx emit sites**, not only PaperSurface + print — otherwise it cannot prove the
    risk it names.
  - Zero-figure papers ⇒ zero assertions, zero failures.
- MF-4 invariant: assert every manifest marker is paragraph-initial + figure-only
  (extend F1 or add here).
- `verify:all` green; `tsc` clean.

## Browser QA Matrix (owner + orchestrator)

paper-2026-i Reading A, table present, no token, no duplicated flattened text on
试卷面, layout intact — across: (1) 详情页语篇卡, (2) 整卷卷面 PaperSurface,
(3) 讲评 harness, (4) 工作台 A4 预览, (5) print 预览, (6) 导出 PDF (check page-boundary
non-split), (7) 导出 DOCX student, (8) 导出 DOCX teacher. Confirm SW-1 (no clip) and
SW-2 (width ≤版心, no cross-page split).

## DEV Readiness

Not ready. Blocked on: correct surface inventory (MF-2), E3 boundary/wave split
(MF-1), DOCX emit-site + 降级 rule (MF-3), safe hide-rule + invariant lock (MF-4).
Wave A alone could reach readiness quickly once `plan.md` records MF-1/MF-3/MF-4 for
the server surfaces; Wave B waits on E3.

## Open PO Decisions (≤3)

1. **PO-1 (conditional):** If DEV's spike shows DOCX PNG embedding is infeasible/too
   costly, is a text-placeholder降级 on the student DOCX试卷面 acceptable for v1?
   This **violates §8 保真分级** (试卷面须达真题观感) — owner must knowingly accept or
   reject. Default per standard: reject → escalate, do not ship降级.
2. **PO-2:** 详情页语篇卡 — after the image renders, keep the flattened table text
   below it (double-store, 做题-safe) or hide it? Recommend **keep** (§8 网站面 =
   语义完整); non-blocking, but confirm so DEV doesn't guess.

(2 open decisions — under the hard-brake threshold. The blockers here are structural
Must Fixes, not undecided product questions.)
