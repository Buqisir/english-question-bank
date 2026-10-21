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
//   1. page.setContent(printHtml) — load the caller's HTML verbatim
//   2. set window.PagedConfig BEFORE injecting the paged.js polyfill — the
//      polyfill reads window.PagedConfig SYNCHRONOUSLY at script-eval time
//      (spike-gate-dp1.md finding #3); setting it after injection is a
//      no-op, pagination silently runs with default config instead
//   3. inject the paged.js polyfill (page.addScriptTag) — this starts
//      pagination automatically once the document is interactive
//   4. wait for pagination to finish (the PagedConfig.after callback)
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
import { abcdLayoutRules } from '../../shared/paper-canonical/abcdLayout.mjs'
import { withChromiumPage } from './chromiumPool.mjs'
import { milliseconds } from './paginationTiming.mjs'

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
export async function renderPaginatedPaper(printHtml, { inspect = null, timing = null } = {}) {
  if (typeof printHtml !== 'string' || !printHtml.trim()) {
    throw new Error('renderPaginatedPaper: printHtml must be a non-empty string')
  }
  const polyfillPath = resolvePagedjsPolyfillPath()

  return withChromiumPage(async (page) => {
    await page.setContent(printHtml, { waitUntil: 'load' })
    // Source-reference PNGs are answer-only frozen content. A load event alone
    // also fires for failed images: require decode and natural dimensions before
    // pagination/PDF, without changing the student renderer's image registry.
    await page.evaluate(async () => {
      for (const image of document.querySelectorAll('[data-reference-figure] img')) {
        await image.decode()
        if (!image.complete || !image.naturalWidth || !image.naturalHeight) {
          throw new Error('Frozen source-reference image failed browser decoding')
        }
      }
    })

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
    const economyBalance = printHtml.includes('data-pdf-economy-balance="v1"')
    if (economyBalance) await page.evaluate(() => {
      // Tag ownership without wrapping nodes or changing any source spacing.
      for (const group of document.querySelectorAll('section[data-canonical-group-id]')) {
        const id = group.getAttribute('data-canonical-group-id')
        group.setAttribute('data-pdf-economy-block', id)
        let chrome = group.previousElementSibling
        while (chrome?.matches('.section-header, .reading-meta-instruction, .page-break')) {
          if (!chrome.matches('.page-break')) chrome.setAttribute('data-pdf-economy-block', id)
          chrome = chrome.previousElementSibling
        }
      }
    })
    const measureOptions = ({ prepare, minimumGutterPx, fitSafetyPx, twipPx }) => {
      const root = prepare ? document : document.querySelector('.pagedjs_pages')
      const failures = []
      for (const options of root.querySelectorAll('.canonical-options,.options-grid--listening')) {
        let overflow = options.scrollWidth > options.clientWidth + 1
        const measuredColumns = getComputedStyle(options).gridTemplateColumns.split(' ').length
        const preserveGutter = measuredColumns > 1 && (options.matches('.options-grid--listening')
          || options.closest('[data-canonical-group-type="reading"]'))
        for (const cell of options.children) {
          const box = cell.getBoundingClientRect()
          const nextBox = cell.nextElementSibling?.getBoundingClientRect()
          const sharesRow = nextBox && Math.abs(nextBox.top - box.top) < 1 && nextBox.left > box.left
          const textLimit = sharesRow ? nextBox.left - minimumGutterPx - fitSafetyPx : box.right - fitSafetyPx
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
          const range = document.createRange()
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue
            range.selectNodeContents(walker.currentNode)
            // Canonical advances round outward to whole twips; Chromium boxes
            // round to subpixels. Keep the gutter without rejecting sub-twip noise.
            if ([...range.getClientRects()].some(rect => rect.left < box.left - 1 || rect.right > box.right + 1
              || (preserveGutter && rect.right > textLimit + twipPx))) overflow = true
          }
        }
        if (!overflow) continue
        if (prepare) options.setAttribute('data-pdf-single-column', '')
        else failures.push(options.closest('[data-canonical-question-id]')?.getAttribute('data-canonical-question-id') || 'options')
      }
      return failures
    }
    const optionSafety = {
      minimumGutterPx: abcdLayoutRules.minimumGutterTwip / 20 * 96 / 72,
      fitSafetyPx: abcdLayoutRules.fitSafetyTwip / 20 * 96 / 72,
      twipPx: 96 / 72 / 20,
    }
    if (studentProduct) await page.evaluate(measureOptions, { ...optionSafety, prepare: true })

    // Answer booklets retain their automatic column widths unless whole-word
    // minimums exceed the A4 content width. Measure with loaded print fonts.
    await page.evaluate(() => {
      if (document.body.dataset.pdfEdition !== 'answerOnly') return
      for (const table of document.querySelectorAll('.answer-keys--5')) {
        const probe = document.createElement('div')
        probe.style.cssText = `position:absolute;visibility:hidden;width:${getComputedStyle(table).getPropertyValue('--answer-content-width')}`
        const copy = table.cloneNode(true)
        probe.append(copy)
        document.body.append(probe)
        if (copy.getBoundingClientRect().width > probe.getBoundingClientRect().width + 1) {
          table.classList.add('answer-keys--bounded')
        }
        probe.remove()
      }
    })

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
    if (economyBalance) await page.evaluate(() => {
      const pages = [...document.querySelectorAll('.pagedjs_page')]
      const blocks = [...document.querySelectorAll('.pagedjs_pages [data-pdf-economy-block]')]
      const hasOtherContent = (content, members) => {
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
          const node = walker.currentNode
          if (!node.textContent.trim() || node.parentElement.closest('style,script')) continue
          if (members.some(member => member.contains(node))) continue
          const range = document.createRange()
          range.selectNodeContents(node)
          if ([...range.getClientRects()].some(rect => rect.width && rect.height)) return true
        }
        for (const node of content.querySelectorAll('img,svg,table,.writing-answer-box')) {
          if (members.some(member => member.contains(node))) continue
          const rect = node.getBoundingClientRect()
          if (rect.width && rect.height) return true
        }
        return false
      }
      for (const group of document.querySelectorAll('.pagedjs_pages section[data-canonical-group-id]')) {
        const id = group.getAttribute('data-canonical-group-id')
        const members = blocks.filter(node => node.getAttribute('data-pdf-economy-block') === id)
        // Never rearrange a split group, a shared page, or the paper opening.
        if (members.filter(node => node.matches('section[data-canonical-group-id]')).length !== 1) continue
        const pageElement = group.closest('.pagedjs_page')
        const content = pageElement.querySelector('.pagedjs_page_content')
        const area = pageElement.querySelector('.pagedjs_area').getBoundingClientRect()
        if (hasOtherContent(content, members)) continue
        const here = members.filter(node => node.closest('.pagedjs_page') === pageElement)
        const orphaned = members.filter(node => !here.includes(node))
        const previousPage = pages[pages.indexOf(pageElement) - 1]
        if (orphaned.some(node => node.closest('.pagedjs_page') !== previousPage
          || !node.matches('.section-header, .reading-meta-instruction'))) continue
        if (orphaned.length && !hasOtherContent(previousPage.querySelector('.pagedjs_page_content'), orphaned)) continue
        // Try bringing only the orphaned chrome into existing spare space.
        // Roll back if this would make the page dense; it is not a keep rule.
        const origins = orphaned.map(node => ({ node, parent: node.parentNode, next: node.nextSibling }))
        for (const node of orphaned) here[0].parentNode.insertBefore(node, here[0])
        const rects = members.flatMap(node => [node, ...node.querySelectorAll('img,svg,table,.writing-answer-box')])
          .map(node => node.getBoundingClientRect())
        const top = Math.min(...rects.map(rect => rect.top))
        const bottom = Math.max(...rects.map(rect => rect.bottom))
        const lineHeight = parseFloat(getComputedStyle(group).lineHeight)
        const topSpace = top - area.top
        const bottomSpace = area.bottom - bottom
        // Keep two lines of lower slack. Redistribute only a quarter of the
        // remaining imbalance, capped at one line: a nudge, not centering.
        const offset = Math.min(lineHeight, (bottomSpace - topSpace - 2 * lineHeight) / 4)
        if (!(offset > 0) || topSpace < -1 || bottomSpace < offset) {
          for (const { node, parent, next } of origins.reverse()) parent.insertBefore(node, next)
          continue
        }
        for (const node of members) {
          node.style.translate = `0 ${offset}px`
          node.setAttribute('data-pdf-vertical-offset-pt', String(offset * 0.75))
        }
      }
    })
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
      const failures = await page.evaluate(measureOptions, { ...optionSafety, prepare: false })
      if (failures.length) throw Object.assign(new Error(`选项文字超出列宽：${failures.join(', ')}`), {
        code: 'PAPER_LAYOUT_OVERFLOW',
      })
    }
    const inspection = typeof inspect === 'function'
      ? await inspect(page)
      : null

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
    const pdfStarted = performance.now()
    let pdfBytes
    try {
      pdfBytes = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
      })
    } finally {
      if (timing) timing.pdfMs = milliseconds(performance.now() - pdfStarted)
    }

    return { paginatedHtml, pdfBytes, pageCount, inspection }
  }, { timing })
}
