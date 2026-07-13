// draft-desk-b step3 (MF-3, plan.md "步3 — 前端吃分页 HTML + 常驻叠按钮"): the
// server (server/draft-paper/paginationRenderer.mjs +
// server/draft-paper/paginationDomContract.mjs, fetched via
// services/draftPapers.ts's fetchDraftPaperPagination) is now the SOLE
// pagination source. `paginatedHtml` arriving here already carries the frozen
// DOM contract this cut locked down in step2 — every page container carries
// `.preview-page` and every `.question-group` section (including cross-page
// split fragments) carries `data-group-id` — plus paged.js's own generated
// page-box CSS (exact page sizing, `@bottom-center` footer text via
// server/draft-paper/draftPaperStore.mjs's addDraftFooterCss). This module no
// longer re-paginates ANYTHING client-side: the retired greedy client-side
// pagination IIFE this file used to inject (named "paginate" + "A4Preview",
// split here so a source-text scan for the old identifier proves it is truly
// gone rather than just quoted in a comment — see cr-step1-lite.md /
// cr-step2-lite.md / tech-recon.md "屏幕分页管线" for its retired shape and
// why it existed) is gone — its whole reason for existing (screen pagination
// independently guessing where print/PDF would break) is what this cut exists
// to eliminate (decision.md, tech-recon.md "parity 现状判断").
//
// What remains here is a THIN, purely presentational screen stylesheet layered
// on top of the server's HTML so the on-screen desk keeps its existing "resting
// paper card" look (white page background, border, drop shadow, gap between
// stacked pages) — it never touches page sizing/padding/overflow, all of which
// paged.js already computed server-side and which this module must not
// second-guess.
//
// PO-1 (owner 2026-07-12, plan.md "PO 决策"): page-break suggestions display is
// DEFERRED this cut — `pageBreakSuggestions` is not read or injected here (no
// quiet-annotation markup, named "break" + "-hint" in the retired client
// pagination, split here for the same source-scan reason as above). The field
// stays on the DraftPaper domain type/API response, just unconsumed by this
// screen wrapper.
export function buildA4PreviewHtml(paginatedHtml: string): string {
  if (!paginatedHtml) return ''
  const previewCss = `
@media screen {
  html {
    background: transparent;
    min-height: 100%;
  }

  body {
    background: transparent;
    box-sizing: border-box;
    margin: 0;
    min-height: 100vh;
    padding: 24px 0 36px;
    width: auto;
  }

  /* Card treatment only — width/height/padding stay whatever paged.js already
     computed on .pagedjs_page (this class is ADDED alongside it, per
     paginationDomContract.mjs's frozen contract, never replacing it). A 1px
     border under box-sizing:border-box shrinks the content box by a
     sub-pixel amount that cannot move any already-decided page break — it is
     purely a screen decoration layered after pagination happened server-side. */
  .preview-page {
    background: #fff;
    border: 1px solid #bfb6a8;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.9) inset,
      0 18px 36px rgba(41, 35, 27, 0.18),
      0 3px 10px rgba(41, 35, 27, 0.12);
    box-sizing: border-box;
    margin: 0 auto 24px;
    position: relative;
  }
}
`
  return paginatedHtml.includes('</style>')
    ? paginatedHtml.replace('</style>', `${previewCss}\n</style>`)
    : paginatedHtml.replace('</head>', `<style>${previewCss}</style></head>`)
}
