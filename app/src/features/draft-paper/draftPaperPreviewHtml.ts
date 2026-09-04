// draft-desk-b step3 (MF-3, plan.md "步3 — 前端吃分页 HTML + 常驻叠按钮"): the
// server (server/draft-paper/paginationRenderer.mjs +
// server/draft-paper/paginationDomContract.mjs, fetched via
// services/draftPapers.ts's fetchDraftPaperPagination) is now the SOLE
// pagination source. `paginatedHtml` arriving here already carries the frozen
// DOM contract this cut locked down in step2 — every page container carries
// `.preview-page` and every `.question-group` section (including cross-page
// split fragments) carries `data-group-id` — plus paged.js's own generated
// page-box CSS (exact page sizing and the print-renderer-owned standard
// `@bottom-center` footer text). This module no
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
// PO-1 (owner 2026-07-12, plan.md "PO 决策") — collected by the print-form cut
// (docs/cuts/print-form/plan.md Must Do 5): page-break suggestions now render
// as a quiet annotation badge, but NOT here — this module stays a thin,
// purely presentational screen-CSS wrapper around the server's already-final
// paginatedHtml string. The badge lives in DraftPaperWorkbench.tsx instead
// (a React overlay anchored via the same groupAnchors mechanism the persistent
// per-group action buttons already use), fed by `pageBreakSuggestions` on the
// `/pagination` route response (server/draft-paper/draftPaperStore.mjs's
// derivePageBreakSuggestions) — never injected into this HTML string.
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
     paginationDomContract.mjs's frozen contract, never replacing it).
     卷边跟看整卷 .paper-browse-zoom 同一条：1px 浅唇 + 软投影，不描边。 */
  .preview-page {
    background: #fff;
    border: 0;
    box-shadow: 0 1px 0 #00000010, 0 12px 32px #00000014;
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

// a3-imposition (plan.md Must Do 1/2, 裁点1/2/4): a SECOND, opt-in
// transform layered on top of buildA4PreviewHtml's already-final output —
// never called unless printForm==='a3' (DraftPaperWorkbench.tsx composes
// `applyA3Imposition(buildA4PreviewHtml(paginatedHtml))` only in that
// branch), so the a4 path stays 100% untouched code (裁点4's zero-diff
// requirement is satisfied by never running this function at all, not by
// this function being careful). This is the ONLY place in the codebase that
// reparses the preview HTML into a real DOM (DOMParser) rather than doing a
// string replace like buildA4PreviewHtml above — safe here because this
// output only ever feeds the on-screen srcDoc iframe (never
// browserPrint/exportPdf, which both read the raw `paginatedHtml` state
// directly — see DraftPaperWorkbench.tsx) and because it MUST NOT touch
// paged.js's own page-box sizing (buildA4PreviewHtml's header comment) —
// it only regroups whole `.preview-page` elements (and everything
// underneath them, incl. every `data-group-id` tag) into a face/sheet
// wrapper structure; it never edits a page's own subtree.
//
// Face pairing: two consecutive `.preview-page` elements per face (面),
// two faces per sheet (张) — front then back — matching prototype.html's
// 方案C (owner 2026-07-13 裁点1). A trailing odd page renders alone with a
// "（此半面留白）" placeholder half (裁点1 Must Do 1 tail case); a sheet
// that only has a front face (no back at all) simply has no back face
// markup and no flip-seam after it.
//
// Suggestion-badge anchor (Must Do 3, 裁点2 "徽标挪到缝上"): this module
// does NOT know about `pageBreakSuggestions` (that's React state, fetched
// per-render — baking it into a memoized HTML string would go stale). It
// instead tags every seam with `data-seam-before-group` = the groupId of
// the FIRST `[data-group-id]` found inside the page immediately following
// that seam — i.e. the group whose content actually straddles that exact
// page boundary (a continuing group's split fragment always renders first
// on the page it continues onto). DraftPaperWorkbench.tsx's seam-anchor
// effect queries `[data-seam-before-group="<groupId>"]` and renders the
// suggestion pill there when `pageBreakSuggestions` contains a matching
// groupId (server-side evaluatePageBreakAcrossPages already guarantees an
// a3 suggestion's groupId only ever lands on a real face/sheet boundary,
// never a same-face internal one — see draftPaperStore.mjs).
export const A3_FACE_NATIVE_WIDTH_PX = 1612

const A3_IMPOSITION_CSS = `
@media screen {
  .a3-imposition-wrap {
    display: block;
    padding: 8px 0 24px;
  }

  .a3-sheet {
    margin: 0 auto 28px;
  }

  .a3-sheet-label {
    text-align: center;
    font-size: 12px;
    color: #8a857a;
    letter-spacing: 0.05em;
    margin: 0 0 10px;
  }

  .a3-face {
    margin: 0 auto 14px;
    width: ${A3_FACE_NATIVE_WIDTH_PX}px;
    max-width: 100%;
  }

  .a3-face-label {
    align-items: center;
    color: #8a857a;
    display: flex;
    font-size: 12px;
    gap: 8px;
    margin: 0 0 6px;
  }

  .a3-face-label .a3-face-chip {
    background: #fff;
    border: 1px solid #e3ded2;
    border-radius: 999px;
    font-size: 11px;
    padding: 1px 10px;
  }

  .a3-face-paper {
    align-items: flex-start;
    display: flex;
    gap: 24px;
    position: relative;
  }

  .a3-half {
    flex: 0 0 794px;
    min-width: 0;
    position: relative;
  }

  .a3-half + .a3-half {
    border-left: 1px dashed #c9c2b2;
    margin-left: -1px;
    padding-left: 23px;
  }

  .a3-foldtag {
    background: #edeae0;
    border: 1px solid #e3ded2;
    border-radius: 999px;
    color: #8a857a;
    font-size: 10px;
    left: 50%;
    padding: 0 8px;
    position: absolute;
    top: -9px;
    transform: translateX(-50%);
    z-index: 1;
  }

  .a3-half-blank {
    align-items: center;
    background: repeating-linear-gradient(45deg, transparent 0 10px, rgba(0, 0, 0, 0.02) 10px 20px);
    border: 1px dashed #d8d2c2;
    color: #c6c0b2;
    display: flex;
    font-size: 12px;
    justify-content: center;
    min-height: 300px;
  }

  .a3-seam {
    align-items: center;
    color: #8a857a;
    display: flex;
    font-size: 12px;
    gap: 10px;
    margin: 6px 0 20px;
  }

  .a3-seam::before,
  .a3-seam::after {
    border-top: 1px dotted #c9c2b2;
    content: '';
    flex: 1;
  }
}
`

function findSeamGroupId(pages: HTMLElement[], nextPageIndex: number): string | null {
  const page = pages[nextPageIndex]
  if (!page) return null
  const el = page.querySelector('[data-group-id]')
  return el ? el.getAttribute('data-group-id') : null
}

function buildSeam(doc: Document, kind: 'flip' | 'cut', groupId: string | null): HTMLElement {
  const seam = doc.createElement('div')
  seam.className = `a3-seam a3-seam-${kind}`
  if (groupId) seam.setAttribute('data-seam-before-group', groupId)
  const label = doc.createElement('span')
  label.textContent = kind === 'flip' ? '翻面' : '换张'
  seam.appendChild(label)
  return seam
}

function buildFace(doc: Document, pages: HTMLElement[], startIndex: number, sheetNumber: number, faceName: string): HTMLElement {
  const face = doc.createElement('div')
  face.className = 'a3-face'

  const label = doc.createElement('div')
  label.className = 'a3-face-label'
  const chip = doc.createElement('span')
  chip.className = 'a3-face-chip'
  chip.textContent = `第 ${sheetNumber} 张 · ${faceName}`
  label.appendChild(chip)

  const page1 = pages[startIndex]
  const page2 = pages[startIndex + 1]
  const rangeText = doc.createElement('span')
  rangeText.textContent = page2 ? `版 ${startIndex + 1} + 版 ${startIndex + 2}` : `版 ${startIndex + 1} + 留白`
  label.appendChild(rangeText)
  face.appendChild(label)

  const paper = doc.createElement('div')
  paper.className = 'a3-face-paper'
  const fold = doc.createElement('div')
  fold.className = 'a3-foldtag'
  fold.textContent = '对折线'
  paper.appendChild(fold)

  const half1 = doc.createElement('div')
  half1.className = 'a3-half'
  if (page1) half1.appendChild(page1)
  paper.appendChild(half1)

  const half2 = doc.createElement('div')
  half2.className = 'a3-half'
  if (page2) {
    half2.appendChild(page2)
  } else {
    half2.classList.add('a3-half-blank')
    half2.textContent = '（此半面留白）'
  }
  paper.appendChild(half2)

  face.appendChild(paper)
  return face
}

export function applyA3Imposition(previewHtml: string): string {
  if (!previewHtml) return previewHtml
  const doc = new DOMParser().parseFromString(previewHtml, 'text/html')
  const pages = Array.from(doc.querySelectorAll('.preview-page')) as HTMLElement[]
  if (pages.length === 0) return previewHtml
  const container = pages[0].parentElement
  if (!container) return previewHtml

  const style = doc.createElement('style')
  style.textContent = A3_IMPOSITION_CSS
  ;(doc.head ?? doc.documentElement).appendChild(style)

  const wrap = doc.createElement('div')
  wrap.className = 'a3-imposition-wrap'
  // Insert the (still-empty) wrapper at page 1's current position, THEN move
  // pages into it below — `appendChild` on a node already in the document
  // detaches it from wherever it was, so no manual removal is needed and any
  // non-page sibling (e.g. paged.js's own hidden `<template>` master copy)
  // is left exactly where it was.
  container.insertBefore(wrap, pages[0])

  const totalFaces = Math.ceil(pages.length / 2)
  for (let f = 0; f < totalFaces; f += 1) {
    const sheetNumber = Math.floor(f / 2) + 1
    const isFront = f % 2 === 0
    if (isFront) {
      if (f > 0) wrap.appendChild(buildSeam(doc, 'cut', findSeamGroupId(pages, f * 2)))
      const sheet = doc.createElement('div')
      sheet.className = 'a3-sheet'
      const sheetLabel = doc.createElement('div')
      sheetLabel.className = 'a3-sheet-label'
      sheetLabel.textContent = `─── 第 ${sheetNumber} 张 A3 ───`
      sheet.appendChild(sheetLabel)
      wrap.appendChild(sheet)
    } else {
      wrap.lastElementChild?.appendChild(buildSeam(doc, 'flip', findSeamGroupId(pages, f * 2)))
    }
    wrap.lastElementChild?.appendChild(buildFace(doc, pages, f * 2, sheetNumber, isFront ? '正面' : '背面'))
  }

  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
}
