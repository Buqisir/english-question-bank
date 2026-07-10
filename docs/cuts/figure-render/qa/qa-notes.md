# figure-render QA notes (fig-token P0)

Real-click browser QA + real exported-artifact inspection, run against the
worktree's own local server (`QUESTION_BANK_API_PORT=8799 PORT=5199`,
worktree's own gitignored sqlite copies), logged in as `qa-local-owner`
(password reset via `node scripts/create-user.mjs --reset-password`).
Fixture: paper-2026-i, group-2026-i-reading-a (the one real figure in the
repo today, `fig-paper-2026-i-reading-a-table-1`).

## Matrix (plan.md's 8 checkpoints)

1. **详情页语篇卡** — PASS. Table image renders above the flattened text;
   flattened text below has the marker stripped (fixed during QA — see
   Findings). No raw token anywhere.
2. **整卷卷面 (PaperBrowsePage)** — PASS. Table image renders, no
   flattened text duplication, no raw token. Screenshot evidence not
   locally saved (harness screenshot path not filesystem-accessible from
   this session) — re-derivable by opening
   `?view=paper-browse&paperId=paper-2026-i&focusGroupId=group-2026-i-reading-a`.
3. **讲评 harness** — PASS. Same PaperSurface mount as item 2 (讲评栏
   opened alongside it); table image present, no token.
4. **工作台 A4 预览 (draft workbench)** — PASS. Table image renders full,
   not clipped (SW-1), no flattened-text duplication.
5. **print 预览** — PASS, verified via `POST /api/exports/print-html`
   directly (same `buildPrintHtml` output the browser-rendered A4/print
   preview consumes) — see `05-print-html-export.html`. `<img
   src="/paper-assets/paper-2026-i/latest/figures/reading-a-table-1.png">`
   present, zero raw tokens.
6. **导出 PDF** — PASS, after a real bug fix (see Findings). Verified by
   clicking 导出 → 下载 PDF（学生版） in the draft workbench, then
   rasterizing the real downloaded PDF (`pdftoppm`) — see
   `06-print-pdf-export.pdf` / `06-print-pdf-page3-table.png`. Table
   image renders correctly, fits within the page margin (SW-2: ≤162mm,
   confirmed visually — no overflow), does not split across the page
   boundary.
7. **导出 DOCX 学生版** — PASS, verified via direct `POST
   /api/exports/docx` (versionType: student) against the real running
   server — **no UI button currently calls this route** (see Findings).
   Unzipped the real .docx: `word/media/image1.png` present, byte-size
   identical to the source PNG, `document.xml.rels` declares the image
   relationship, zero raw tokens in `document.xml`. Also converted via
   real LibreOffice (`soffice --headless --convert-to pdf`) and
   rasterized — see `07-docx-student-export.docx` /
   `07-docx-student-page1-table.png`. Table renders correctly.
8. **导出 DOCX 教师版** — PASS, same method as item 7 (versionType:
   teacher) — see `08-docx-teacher-export.docx` /
   `08-docx-teacher-page1-table.png`. Table renders correctly alongside
   answers/explanations.

SW-1 (draft A4 preview clipping tall figures): not applicable at real
severity — the one real figure is a wide, short landscape table; visually
confirmed un-clipped in item 4.
SW-2 (print/PDF figure width + page-break): confirmed in item 6's
screenshot — image width stays within the page margin, no cross-page
split.

## Findings (bugs caught by this QA pass, both fixed in the same cut)

1. **PDF broken-image bug.** The original design used an absolute
   `file://<real path>` URL for the Vivliostyle-CLI PDF path. The HTML
   *looked* correct (a text-only assertion would have passed), but the
   actual generated PDF showed a broken-image icon — Chromium's default
   file:// security policy blocks a file:// page from loading a resource
   OUTSIDE its own directory. Fixed by emitting a bare relative filename
   and having the PDF caller copy the real PNG into the SAME tempdir as
   the HTML before invoking Vivliostyle (verified this workaround
   directly against vivliostyle CLI before rolling it into the fix).
   `scripts/verify-figure-render.mjs` now builds a real PDF with vs
   without the copy and asserts a meaningful byte-size delta, so this
   exact class of bug cannot silently regress.
2. **Marker leak in the detail-page flattened-text sidecar.** The
   PO-2 double-store text under the image still showed the raw
   `[表: fig-...]` prefix verbatim. Stripped it — the marker is
   import-time locator metadata, not table content.

## Known gap unrelated to this cut

DOCX export (`usePaperExports.ts` / `services/questionGroups.ts
exportDocx`) has no live UI entry point in the current app — grep confirms
`paperExports.exportDocx` is never wired to a click handler in App.tsx.
This predates this cut (classic-retire-2/3 removed the print-preview /
basket-panel UI that used to call it) and this cut does not restore it —
items 7/8 above were verified by calling the real server route directly,
which exercises the identical `docxRenderer.mjs` code path.
