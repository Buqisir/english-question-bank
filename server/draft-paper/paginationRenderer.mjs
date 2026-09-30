// draft-desk-b step1 (MF-2/MF-6, plan.md "步1 — 服务器分页渲染器 + 实例池";
// decision.md 路甲: 服务器当唯一排版真源).
//
// Input: a complete print HTML string — the same shape
// draftPaperStore.mjs's buildDraftPrintHtml() already produces
// (the complete buildPrintHtml output, including its standard page footer).
// This module does not build that HTML and
// does not know about draft papers, groups, or scores — it only paginates
// whatever complete print HTML string it is given.
//
// Output: { paginatedHtml, pdfBytes, pageCount }.
//
// HARD CONTRACT (spike-gate-dp1.md DP-1 evidence, all four acceptance
// checks passed): pagination and the PDF are produced from ONE Chromium
// page object, in this exact order:
//   0. prepare(page) — optional caller hook (options.prepare) run before
//      step 1's setContent, so request routes (the personal-export font
//      delivery) exist before the page's first fetch. May only prepare the
//      page (routes, bindings); it never navigates or changes the document.
//   1. page.setContent(printHtml) — load the caller's HTML verbatim
//   2. set window.PagedConfig BEFORE injecting the paged.js polyfill — the
//      polyfill reads window.PagedConfig SYNCHRONOUSLY at script-eval time
//      (spike-gate-dp1.md finding #3); setting it after injection is a
//      no-op, pagination silently runs with default config instead
//   3. inject the paged.js polyfill (page.addScriptTag) — this starts
//      pagination automatically once the document is interactive
//   4. wait for pagination to finish (the PagedConfig.after callback)
//   5.5 compose(page) — optional caller callback (options.compose): runs
//      after step 4's pagination and every layout check (and after the
//      inspect callback), BEFORE the DOM is serialized for step 5 and
//      printed in step 6. This is the sole entry point for
//      private-annotation composition (the personal PDF export draws its
//      marks, note cards and appendix sheet here); a compose callback may
//      add content to the paginated DOM but must not change the base
//      pagination of the underlying print HTML. Omitted (default) = the
//      render is byte-for-byte what this module produced before the
//      callback existed.
//   5. serialize the paginated DOM from THIS SAME page (page.content()),
//      then strip every <script> tag from the returned HTML string —
//      page.content() re-serializes the injected ~900KB paged.js polyfill
//      script tag along with the paginated markup; replaying that
//      un-stripped HTML in a client iframe re-runs pagination a SECOND
//      time and (spike-gate-dp1.md finding #1) roughly doubles the page
//      count (9 pages measured -> 12 after an un-stripped replay)
//   6. page.pdf() from THIS SAME page — NOT a fresh page, NOT a fresh
//      browser
//
// It is FORBIDDEN to call page.pdf() on a page that has not been through
// steps 2-4 above (i.e. an un-paginated / pre-paged.js page). Doing so
// would produce a PDF whose page breaks were never verified to match the
// paginated DOM handed to the screen preview — parity between "what the
// teacher sees" and "what prints" is the entire reason this module exists
// (decision.md, tech-recon.md "parity 现状判断"). Any future caller of this
// module MUST go through renderPaginatedPaper(); do not add a second
// entry point that calls page.pdf() directly on unpaginated content.
//
// Latency budget (plan.md: warm <=1s, cold first-render <=3s). All browser
// routes now use the same pinned full Chromium; the resident BrowserContext
// keeps its per-render setup cost bounded. Measured locally: warm-instance
// single render ~700-800ms end-to-end (still inside the <=1s budget, but
// with materially less margin than spike-gate-dp1.md implied — flagged as
// a Should-Watch, not a blocker: production hardware performance is
// unverified, and PO-2's "重新排版中… loading + debounce" UX already
// assumes non-instant renders). Cold start (chromium.launch() + first
// render) ~1.3-1.5s, comfortably inside the <=3s budget.

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withChromiumPage } from './chromiumPool.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

// pagedjs ships an npm "exports" map that does NOT expose ./dist/* or even
// ./package.json as importable subpaths — `require.resolve('pagedjs/dist/
// paged.polyfill.js')` throws ERR_PACKAGE_PATH_NOT_EXPORTED regardless of
// install layout, so Node's own resolver can't be leaned on for the actual
// polyfill FILE (verified locally against the installed pagedjs@0.4.3).
// This candidate-path lookup mirrors draftPaperStore.mjs's existing
// vivliostyleBin lookup (same repo, same problem shape: multiple possible
// install layouts — hoisted to repo root vs local to server/).
const PAGEDJS_POLYFILL_CANDIDATES = [
  path.join(rootDir, 'server', 'node_modules', 'pagedjs', 'dist', 'paged.polyfill.js'),
  path.join(rootDir, 'node_modules', 'pagedjs', 'dist', 'paged.polyfill.js'),
  path.join(rootDir, 'app', 'node_modules', 'pagedjs', 'dist', 'paged.polyfill.js'),
]

function resolvePagedjsPolyfillPath() {
  for (const candidate of PAGEDJS_POLYFILL_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  const error = new Error(
    'pagedjs polyfill not found (dist/paged.polyfill.js in any of the usual node_modules locations). ' +
      'Install with: npm install pagedjs --prefix server',
  )
  // Typed classifier: route handlers (draftPaperRoutes.mjs sendDraftMutationError)
  // map RENDERER_MISSING to 503 "renderer unavailable" without substring-matching
  // "not found", which would also match the per-item data error
  // "questionGroupId not found: <id>" thrown on the same export path by
  // resolveDraftExportItems (draftPaperStore.mjs).
  error.code = 'RENDERER_MISSING'
  throw error
}

// Spike used the same ceiling (spike-pagedjs-gate.mjs); real renders finish
// in ~130ms of that budget, so this is slack for a cold/loaded machine, not
// an expected normal wait.
const PAGEDJS_TIMEOUT_MS = 45_000

function stripScriptTags(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
}

// Renders `printHtml` through paged.js and returns the paginated DOM (with
// the paged.js polyfill script stripped) plus a same-source PDF and page
// count. See module header for the locked render order this function
// implements.
export async function renderPaginatedPaper(printHtml, { inspect = null, compose = null, prepare = null } = {}) {
  if (typeof printHtml !== 'string' || !printHtml.trim()) {
    throw new Error('renderPaginatedPaper: printHtml must be a non-empty string')
  }
  const polyfillPath = resolvePagedjsPolyfillPath()

  return withChromiumPage(async (page) => {
    // Optional caller hook, run before setContent so request routes (e.g. the
    // personal-export font delivery) exist before the page's first fetch.
    // Like compose, it may not change the print HTML's pagination; it runs
    // before the document exists, so it can only prepare the page itself.
    if (typeof prepare === 'function') await prepare(page)
    await page.setContent(printHtml, { waitUntil: 'load' })

    // Planned exports move a group with its immediately preceding chrome.
    // Natural preview/Print HTML never contains these markers and is untouched.
    await page.evaluate(() => {
      for (const group of document.querySelectorAll('section[data-pdf-planned-break]')) {
        let anchor = group
        while (anchor.previousElementSibling?.matches('.section-header, .reading-meta-instruction, .page-break')) {
          anchor = anchor.previousElementSibling
        }
        if (anchor !== group) {
          group.removeAttribute('data-pdf-planned-break')
          anchor.setAttribute('data-pdf-planned-break', '')
        }
      }
    })

    // FontFaceSet.ready alone resolves even when a face failed. Explicitly
    // load every declared face and reject before measuring page boundaries.
    await page.evaluate(async () => {
      await Promise.all([...document.fonts].map(face => face.load()))
      await document.fonts.ready
    })

    // New student products change body size, so source column hints must be
    // remeasured with the loaded fonts. Historical rendering stays untouched.
    const studentProduct = printHtml.includes('data-pdf-student-product=')
    const measureOptions = (prepare) => {
      const root = prepare ? document : document.querySelector('.pagedjs_pages')
      const failures = []
      for (const options of root.querySelectorAll('.canonical-options,.options-grid--listening')) {
        let overflow = options.scrollWidth > options.clientWidth + 1
        for (const cell of options.children) {
          const box = cell.getBoundingClientRect()
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
          const range = document.createRange()
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue
            range.selectNodeContents(walker.currentNode)
            if ([...range.getClientRects()].some(rect => rect.left < box.left - 1 || rect.right > box.right + 1)) overflow = true
          }
        }
        if (!overflow) continue
        if (prepare) options.setAttribute('data-pdf-single-column', '')
        else failures.push(options.closest('[data-canonical-question-id]')?.getAttribute('data-canonical-question-id') || 'options')
      }
      return failures
    }
    if (studentProduct) await page.evaluate(measureOptions, true)

    // Step 2: PagedConfig BEFORE step 3's polyfill injection — order is load-bearing,
    // see module header + spike-gate-dp1.md finding #3.
    await page.evaluate(() => {
      window.__pagedDone = false
      window.PagedConfig = {
        auto: true,
        after: (flow) => {
          window.__pagedDone = true
          window.__pagedPageCount = flow.pages.length
        },
      }
    })

    // Step 3: inject the polyfill. It reads window.PagedConfig synchronously
    // at script-eval time and (document is already 'load'-complete) starts
    // pagination immediately.
    await page.addScriptTag({ path: polyfillPath })

    // Step 4: wait for pagination to finish.
    try {
      await page.waitForFunction('window.__pagedDone === true', { timeout: PAGEDJS_TIMEOUT_MS })
    } catch (error) {
      throw new Error(
        `renderPaginatedPaper: paged.js pagination did not complete within ${PAGEDJS_TIMEOUT_MS}ms ` +
          `(${error instanceof Error ? error.message : String(error)})`,
      )
    }
    const pageCount = await page.evaluate(() => window.__pagedPageCount)
    // A source-level row count is only a lower bound. Validate the actual
    // paginated boxes before returning either HTML or PDF, including fragments
    // Paged.js created despite break-inside: avoid for oversized content.
    const layoutFailure = await page.evaluate((fixedPage) => {
      const pagesByBlock = new Map()
      const fixedPageAtoms = fixedPage
        ? ', .pagedjs_pages .question, .pagedjs_pages .canonical-option-bank-item' : ''
      for (const element of document.querySelectorAll('.pagedjs_pages .canonical-reading-framed-columns, .pagedjs_pages .canonical-reading-figure, .pagedjs_pages .writing-answer-box, .pagedjs_pages [data-canonical-group-type="listening"] .question' + fixedPageAtoms)) {
        const page = element.closest('.pagedjs_page')
        const area = page.querySelector('.pagedjs_area').getBoundingClientRect()
        const box = element.getBoundingClientRect()
        const id = element.getAttribute('data-canonical-block-id')
          || element.getAttribute('data-ref')
        if (id) {
          const previous = pagesByBlock.get(id)
          if (previous && previous !== page) return { id, reason: 'atomic block split across pages' }
          pagesByBlock.set(id, page)
        }
        if (box.top < area.top - 1 || box.bottom > area.bottom + 1
          || box.left < area.left - 1 || box.right > area.right + 1) {
          return { id, reason: 'block exceeds printable page area' }
        }
        for (const child of [element, ...element.querySelectorAll('td, figcaption, .writing-continuation-row, .writing-starter-line, .canonical-application-given')]) {
          const rect = child.getBoundingClientRect()
          if (child.scrollWidth > child.clientWidth + 1
            || child.scrollHeight > child.clientHeight + 1
            || rect.top < box.top - 1 || rect.bottom > box.bottom + 1
            || rect.left < box.left - 1 || rect.right > box.right + 1) {
            return { id, reason: 'content exceeds its layout box' }
          }
        }
      }
      return null
    }, printHtml.includes('data-pdf-planned-break'))
    if (layoutFailure) {
      throw Object.assign(new Error(`试卷内容超出排版区域：${layoutFailure.id || 'block'} (${layoutFailure.reason})`), {
        code: 'PAPER_LAYOUT_OVERFLOW',
        blockId: layoutFailure.id,
      })
    }
    if (studentProduct) {
      const failures = await page.evaluate(measureOptions, false)
      if (failures.length) throw Object.assign(new Error(`选项文字超出列宽：${failures.join(', ')}`), {
        code: 'PAPER_LAYOUT_OVERFLOW',
      })
    }
    const inspection = typeof inspect === 'function'
      ? await inspect(page)
      : null

    // Step 5.5: the caller's composition hook — see the module header
    // contract. Runs before serialization so whatever it draws appears in
    // both the returned paginated HTML and the step-6 PDF.
    if (typeof compose === 'function') await compose(page)

    // Step 5: serialize from THIS SAME page, then strip every <script> tag —
    // see module header for why an un-stripped replay double-paginates.
    const rawHtml = await page.content()
    const paginatedHtml = stripScriptTags(rawHtml)

    // Sanity check: paged.js's own reported page count should match the
    // number of .pagedjs_page containers actually present in the serialized
    // DOM. A mismatch means something upstream of this function changed
    // (paged.js version bump, a template change touching the pagination
    // container) in a way this module's assumptions no longer cover — fail
    // loudly rather than silently return an inconsistent pageCount. The
    // `<div ` tag prefix (mirroring paginationDomContract.mjs's identical
    // invariant check) targets ONLY real `.pagedjs_page` page containers:
    // paged.js preserves a verbatim copy of the source body inside a hidden
    // `<template data-ref="pagedjs-content">`, and Chromium's `outerHTML`
    // serializer does not re-escape `"` inside text content — so a passage
    // / stem / explanation carrying the literal substring
    // `class="pagedjs_page"` (which buildPrintHtml's escapeHtml HTML-escapes
    // but `"` round-trips back to `"` through parsing) re-serializes as
    // inert text containing `class="pagedjs_page"`. A tag-agnostic regex
    // over-counts these inert text occurrences (one in the preserved
    // template copy + one per rendered page that shows that text) and
    // throws a false "bookkeeping is inconsistent" error on a valid
    // render; the `<div ` prefix skips them because text-content `<` is
    // escaped to `<`. `\b` word-boundary (not just "starts with") so
    // this doesn't depend on "pagedjs_page" being the FIRST class token —
    // it isn't always (e.g. `class="pagedjs_page pagedjs_first_page
    // pagedjs_right_page"` today, but class order is paged.js's internal
    // detail, not a contract this module should assume) — and excludes
    // `pagedjs_pages`/`pagedjs_pagebox` (both share "pagedjs_page" as a
    // literal prefix; `\b` requires a non-word character on both sides,
    // and "s"/"b" are word characters, so neither false-matches).
    const domPageCount = (paginatedHtml.match(/<div class="[^"]*\bpagedjs_page\b[^"]*"/g) || []).length
    if (domPageCount !== pageCount) {
      throw new Error(
        `renderPaginatedPaper: paged.js reported pageCount=${pageCount} but the serialized DOM has ` +
          `${domPageCount} .pagedjs_page elements — pagination bookkeeping is inconsistent`,
      )
    }

    // Step 6: page.pdf() from THIS SAME page — the locked contract this
    // whole module exists to enforce. Do not extract this into a separate
    // function that could be called against an unpaginated page.
    const pdfBytes = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    })

    return { paginatedHtml, pdfBytes, pageCount, inspection }
  })
}
