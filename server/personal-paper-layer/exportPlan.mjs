/*
 * The stage-5 measure pass (#489 5b): one Chromium run over the base
 * paginated HTML that resolves every personal object into a pure-data
 * composition plan for the PDF render pass. The DOM work (anchor mapping,
 * card height measurement, ink probing) uses the same shared algorithms and
 * the same versioned overlay styles as the paper editing view's preview —
 * verify-personal-paper-view-browser.mjs proves plan and preview agree
 * positionally. All plan coordinates are page-internal mm, rounded to
 * 0.01mm; the plan carries no px, viewport or DOM references.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { inlinePaperFontsForServer } from './layout.mjs'
import { personalOverlayBrowserScript } from './browserBundle.mjs'
import { personalFontFaceCss } from './personalFonts.mjs'
import {
  appendixMarkerPosition,
  appendixSourceLabel,
  orderAppendixEntries,
  resolveTextAnchor,
} from '../../shared/personal-paper-layer/index.mjs'
import { personalTextStyle, renderPersonalTextHtml } from '../../shared/personal-text/index.mjs'
import { PERSONAL_OVERLAY_STYLE_VERSION, personalOverlayCss } from '../../shared/personal-paper-layer/overlayStyles.mjs'

export const PERSONAL_EXPORT_PLAN_VERSION = 'eqb-personal-export-plan-v1'

// The paper view renders at CSS 96dpi; every px↔mm conversion shares that.
const PX_PER_MM = 96 / 25.4

// Same tolerances as the preview's note layer (PaperNoteLayer.tsx): card
// overflow beyond the page box, 1mm.
const OVERFLOW_TOLERANCE_MM = 1
// Chromium clamps one viewport to its largest single rendering surface; past
// this height elementsFromPoint would silently miss, so the in-page probe
// scrolls in segments instead (see the probe inside resolveAutoNote). A4
// papers only approach this at ~14 pages.
const VIEWPORT_MAX_PX = 16384

function fail(code, message, details) {
  const error = new Error(message)
  error.code = code
  if (details !== undefined) error.details = details
  return error
}

const roundMm = (value) => Math.round(value * 100) / 100

export async function withChromiumPage(run) {
  const requireFromApp = createRequire(new URL('../../app/package.json', import.meta.url))
  const { chromium } = requireFromApp('playwright')
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  try {
    return await run(await browser.newPage())
  } finally {
    await browser.close()
  }
}

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex')
}

/*
 * Renders one temporary overlay card at document px coordinates, measures
 * its border-box height, and removes it before the next probe — the temp
 * cards must never count as ink for a later placement.
 */
const measureCardHostHeight = (page, config) => page.evaluate((injected) => {
  const host = document.createElement('div')
  host.className = injected.className
  host.style.cssText = 'position:absolute;left:' + injected.leftPx + 'px;top:' + injected.topPx
    + 'px;width:' + injected.widthPx + 'px;'
  host.style.fontFamily = injected.rootStyle.fontFamily
  host.style.fontSize = injected.rootStyle.fontSize
  host.style.lineHeight = injected.rootStyle.lineHeight
  const text = document.createElement('div')
  text.className = 'eqb-personal-text'
  text.innerHTML = injected.html
  host.appendChild(text)
  document.body.appendChild(host)
  const height = host.offsetHeight
  host.remove()
  return height
}, config)

export async function measurePersonalExportPlan({
  paginatedHtml,
  layoutId,
  layoutRef,
  source,
  objects,
  withPage = withChromiumPage,
}) {
  const layoutPages = layoutRef?.pages
  if (!Array.isArray(layoutPages) || layoutPages.length === 0 || !layoutRef?.product) {
    throw fail('PERSONAL_EXPORT_PLAN_INVALID', 'layoutRef 没有可用的页面几何')
  }
  // The cached paginated HTML points its paper fonts at the app origin; the
  // bare measure page has none, so the bytes come back inline first.
  const html = inlinePaperFontsForServer(paginatedHtml)

  return withPage(async (page) => {
    await page.setContent(html, { waitUntil: 'load' })
    const bundle = await personalOverlayBrowserScript()
    await page.addScriptTag({ content: bundle.code })
    await page.addStyleTag({ content: personalOverlayCss() })
    await page.evaluate((installed) => {
      window.__eqbPersonalSource = installed
    }, source)

    // Personal fonts for the text presets actually in use (no text objects →
    // no personal css at all). Every face must load before anything is
    // measured; a fallback face would measure the wrong heights.
    const textObjects = objects.filter((object) => object.type === 'anchored-note' || object.type === 'text-box')
    const presetIds = [...new Set(textObjects.map((object) => object.document.presentation.fontPresetId))]
    let fontFaces = []
    if (presetIds.length > 0) {
      const personalFonts = personalFontFaceCss({ presetIds })
      if (personalFonts.css) await page.addStyleTag({ content: personalFonts.css })
      fontFaces = personalFonts.faces
    }
    const failedFaces = await page.evaluate(async (faces) => {
      const failures = []
      for (const face of faces) {
        try {
          await document.fonts.load(`${face.weight} 16px "${face.family}"`)
        } catch {
          failures.push(face)
        }
      }
      await document.fonts.ready
      for (const face of faces) {
        if (!document.fonts.check(`${face.weight} 16px "${face.family}"`)) failures.push(face)
      }
      return failures
    }, fontFaces)
    if (failedFaces.length > 0) {
      throw fail('PERSONAL_EXPORT_FONT_FAILED', '个人字体加载失败，无法量测批注版', failedFaces)
    }

    const pageGeometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      pages: [...document.querySelectorAll('.pagedjs_pages > .pagedjs_page')].map((element) => {
        const box = element.getBoundingClientRect()
        const area = element.querySelector('.pagedjs_area') ?? element.querySelector('.pagedjs_page_content')
        const areaBox = area?.getBoundingClientRect() ?? null
        return {
          left: box.left + window.scrollX,
          top: box.top + window.scrollY,
          width: box.width,
          height: box.height,
          contentLeft: areaBox ? areaBox.left + window.scrollX : null,
          contentRight: areaBox ? areaBox.right + window.scrollX : null,
          contentTop: areaBox ? areaBox.top + window.scrollY : null,
          contentBottom: areaBox ? areaBox.bottom + window.scrollY : null,
        }
      }),
    }))

    // 版面核对：页数与每页尺寸必须与批注基准一致，绝不将错就错。
    if (pageGeometry.pages.length !== layoutPages.length) {
      throw fail('PERSONAL_EXPORT_LAYOUT_MISMATCH', '渲染出的页数与批注基准不一致', {
        rendered: pageGeometry.pages.length,
        expected: layoutPages.length,
      })
    }
    for (const [index, rendered] of pageGeometry.pages.entries()) {
      const expected = layoutPages[index]
      const widthMm = rendered.width / PX_PER_MM
      const heightMm = rendered.height / PX_PER_MM
      if (Math.abs(widthMm - expected.widthMm) > 0.1 || Math.abs(heightMm - expected.heightMm) > 0.1) {
        throw fail('PERSONAL_EXPORT_LAYOUT_MISMATCH', '渲染出的页面尺寸与批注基准不一致', {
          pageId: expected.pageId,
          rendered: { widthMm: roundMm(widthMm), heightMm: roundMm(heightMm) },
          expected: { widthMm: expected.widthMm, heightMm: expected.heightMm },
        })
      }
    }

    const frames = pageGeometry.pages.map((rendered, index) => ({
      pageId: layoutPages[index].pageId,
      leftPx: rendered.left,
      topPx: rendered.top,
      widthMm: layoutPages[index].widthMm,
      heightMm: layoutPages[index].heightMm,
    }))
    const contentBoxes = pageGeometry.pages
      .map((rendered, index) => rendered.contentLeft == null ? null : {
        pageId: layoutPages[index].pageId,
        leftPx: rendered.contentLeft,
        rightPx: rendered.contentRight,
        topPx: rendered.contentTop,
        bottomPx: rendered.contentBottom,
      })
      .filter(Boolean)
    const frameByPageId = new Map(frames.map((frame) => [frame.pageId, frame]))

    // Same 「高度等于全文、永不滚动」 contract as the preview iframe: one
    // viewport over the whole document keeps elementsFromPoint's viewport
    // coordinates equal to the document coordinates the frames use. Only a
    // document taller than Chromium's viewport cap leaves the tail
    // unreachable in one screen; the in-page probe below then scrolls in
    // segments and translates the rect before sampling.
    await page.setViewportSize({
      width: Math.min(VIEWPORT_MAX_PX, Math.ceil(pageGeometry.scrollWidth)),
      height: Math.min(VIEWPORT_MAX_PX, Math.ceil(pageGeometry.scrollHeight)),
    })
    await page.evaluate(() => window.scrollTo(0, 0))

    // Per page: the body textContent (page margin boxes stripped), blank-run
    // normalized. The render pass re-hashes the composed base against these.
    const basePageTextDigests = (await page.evaluate(() => (
      [...document.querySelectorAll('.pagedjs_pages > .pagedjs_page')].map((element) => {
        const clone = element.cloneNode(true)
        clone.querySelectorAll('.pagedjs_margin').forEach((node) => node.remove())
        return clone.textContent.replace(/\s+/gu, ' ').trim()
      })
    ))).map((text) => `sha256:${sha256Text(text)}`)

    // One anchor measurement per object, exactly like the preview's
    // usePaperAnchorGeometry: per-text-node rects, merged per line.
    const anchorRectsByObjectId = new Map()
    for (const object of objects) {
      if (!('textAnchor' in object)) continue
      const rects = await page.evaluate((segments) => {
        const overlay = window.__eqbPersonalOverlay
        const anchorSource = window.__eqbPersonalSource
        const ranges = []
        for (const segment of segments) {
          const segmentRanges = overlay.printSegmentToDomRanges(document, anchorSource, segment)
          if (!segmentRanges) return null
          ranges.push(...segmentRanges)
        }
        const rects = []
        for (const range of ranges) {
          for (const rect of overlay.textRects(range)) {
            if (rect.width < 0.5 || rect.height < 0.5) continue
            rects.push({
              left: rect.left + window.scrollX,
              top: rect.top + window.scrollY,
              width: rect.width,
              height: rect.height,
            })
          }
        }
        return rects.length > 0 ? overlay.mergeLineRects(rects) : null
      }, object.textAnchor.segments)
      if (rects) anchorRectsByObjectId.set(object.id, rects)
    }

    const diagnostics = []
    const diagnosed = new Set()
    const diagnose = (objectId, code, details) => {
      const key = `${objectId}:${code}`
      if (diagnosed.has(key)) return
      diagnosed.add(key)
      diagnostics.push(details === undefined ? { objectId, code } : { objectId, code, details })
    }
    const marks = []
    const cards = []
    const appendixRaw = []

    const measureCardHeight = async ({ pageId, xMm, yMm, widthMm, noteCard }, object) => {
      const frame = frameByPageId.get(pageId)
      const style = personalTextStyle(object.document.presentation)
      return roundMm(await measureCardHostHeight(page, {
        className: noteCard ? 'eqb-personal-overlay-note-card' : 'eqb-personal-overlay-text-box',
        leftPx: frame.leftPx + xMm * PX_PER_MM,
        topPx: frame.topPx + yMm * PX_PER_MM,
        widthPx: widthMm * PX_PER_MM,
        rootStyle: style ?? {},
        html: renderPersonalTextHtml(object.document),
      }) / PX_PER_MM)
    }

    // Auto placement with the real rendered height of the candidate slot.
    // placeNoteNearAnchor's probe is synchronous by contract, so the whole
    // resolve → measure → re-resolve convergence runs inside one page
    // evaluate: the bundle's placeNoteNearAnchor drives the bundle's
    // inkFreeRect directly, and the temp card is rendered and measured in
    // the same document (and removed before the next probe).
    const resolveAutoNote = async (object, anchorRects, contentBox, occupied) => {
      const style = personalTextStyle(object.document.presentation)
      return page.evaluate((injected) => {
        const overlay = window.__eqbPersonalOverlay
        const PX = 96 / 25.4
        const measureAt = (pageId, xMm, yMm, widthMm, slot) => {
          const frame = injected.frames.find((candidate) => candidate.pageId === pageId)
          const host = document.createElement('div')
          // Margin cards carry the preview's narrower inner padding — the
          // wrap count (and with it the measured height) depends on it.
          host.className = slot === 'margin'
            ? 'eqb-personal-overlay-note-card eqb-personal-overlay-note-card--margin'
            : 'eqb-personal-overlay-note-card'
          host.style.cssText = 'position:absolute;left:' + (frame.leftPx + xMm * PX) + 'px;top:'
            + (frame.topPx + yMm * PX) + 'px;width:' + widthMm * PX + 'px;'
          host.style.fontFamily = injected.rootStyle.fontFamily
          host.style.fontSize = injected.rootStyle.fontSize
          host.style.lineHeight = injected.rootStyle.lineHeight
          const text = document.createElement('div')
          text.className = 'eqb-personal-text'
          text.innerHTML = injected.html
          host.appendChild(text)
          document.body.appendChild(host)
          const height = host.offsetHeight
          host.remove()
          return height / PX
        }
        // Keep the sampled band inside the viewport for elementsFromPoint
        // (a no-op while the viewport spans the whole document).
        const probe = (rect) => {
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight
          const target = Math.max(0, Math.min(rect.top - 400, maxScroll))
          if (Math.abs(window.scrollY - target) > 1) window.scrollTo(0, target)
          const shifted = { ...rect, left: rect.left - window.scrollX, top: rect.top - window.scrollY }
          return overlay.inkFreeRect(document, shifted, 12)
        }
        const heights = { margin: 40, flow: 24 }
        const resolve = (heightMm) => overlay.placeNoteNearAnchor({
          anchorRects: injected.anchorRects,
          frames: injected.frames,
          flowWidthMm: 56,
          heightMm,
          probe,
          contentBox: injected.contentBox,
          occupied: injected.occupied,
        })
        let candidate = resolve(heights)
        let measuredHeight = null
        for (let round = 0; candidate && candidate.fits && round < 4; round += 1) {
          const frame = injected.frames.find((item) => item.pageId === candidate.pageId)
          const realHeight = measureAt(
            candidate.pageId,
            candidate.xMm - frame.leftPx / PX,
            candidate.yMm - frame.topPx / PX,
            candidate.widthMm,
            candidate.slot,
          )
          measuredHeight = realHeight
          // Same 1mm settle rule as the preview: only a bigger gap re-resolves.
          if (Math.abs(realHeight - heights[candidate.slot]) <= 1) {
            heights[candidate.slot] = realHeight
            break
          }
          heights[candidate.slot] = realHeight
          const next = resolve(heights)
          const settled = next && next.pageId === candidate.pageId && next.slot === candidate.slot
            && next.xMm === candidate.xMm && next.yMm === candidate.yMm
          candidate = next
          if (settled) break
        }
        return { candidate, heightMm: measuredHeight }
      }, {
        anchorRects,
        frames,
        contentBox,
        occupied,
        rootStyle: style ?? {},
        html: renderPersonalTextHtml(object.document),
      })
    }

    for (const object of objects) {
      if (object.type === 'commentary') continue

      if ('textAnchor' in object) {
        const resolution = resolveTextAnchor(source, object.textAnchor)
        if (resolution.status === 'needs-reanchor') {
          diagnose(object.id, 'anchor-unresolved', { reasons: resolution.reasons })
        }
        const groupId = object.textAnchor.groupId
        if (groupId && !layoutRef.product.groupIds.includes(groupId)) {
          diagnose(object.id, 'target-not-in-layout', { groupId })
        }
      }

      if (object.type === 'highlight' || object.type === 'underline') {
        const rects = anchorRectsByObjectId.get(object.id)
        if (!rects) {
          diagnose(object.id, 'anchor-unresolved')
          continue
        }
        // One marks entry per page: a rect's page is the page containing its
        // centre, the same assignment the overlay layers imply.
        const byPage = new Map()
        for (const rect of rects) {
          const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          const frame = frames.find((candidate) => (
            centre.x >= candidate.leftPx && centre.x < candidate.leftPx + candidate.widthMm * PX_PER_MM
            && centre.y >= candidate.topPx && centre.y < candidate.topPx + candidate.heightMm * PX_PER_MM
          ))
          if (!frame) continue
          if (!byPage.has(frame.pageId)) byPage.set(frame.pageId, [])
          byPage.get(frame.pageId).push({
            xMm: roundMm((rect.left - frame.leftPx) / PX_PER_MM),
            yMm: roundMm((rect.top - frame.topPx) / PX_PER_MM),
            widthMm: roundMm(rect.width / PX_PER_MM),
            heightMm: roundMm(rect.height / PX_PER_MM),
          })
        }
        for (const [pageId, rectsMm] of byPage) {
          marks.push({
            objectId: object.id,
            type: object.type,
            ...(object.type === 'highlight' ? { color: object.style.color } : {}),
            ...(object.type === 'underline' ? { ink: object.style.ink } : {}),
            pageId,
            rectsMm,
          })
        }
        continue
      }

      if (object.type === 'anchored-note') {
        if (object.placement.kind === 'page-position') {
          if (object.placement.layoutId !== layoutId || !frameByPageId.get(object.placement.pageId)) {
            diagnose(object.id, 'layout-mismatch', { layoutId: object.placement.layoutId })
            continue
          }
          const heightMm = await measureCardHeight({
            pageId: object.placement.pageId,
            xMm: object.placement.xMm,
            yMm: object.placement.yMm,
            widthMm: object.placement.widthMm,
            noteCard: true,
          }, object)
          const frame = frameByPageId.get(object.placement.pageId)
          const bottomMm = object.placement.yMm + heightMm
          const rightMm = object.placement.xMm + object.placement.widthMm
          if (bottomMm > frame.heightMm + OVERFLOW_TOLERANCE_MM || rightMm > frame.widthMm + OVERFLOW_TOLERANCE_MM) {
            diagnose(object.id, 'overflow', { bottomMm: roundMm(bottomMm), rightMm: roundMm(rightMm), pageId: frame.pageId })
          }
          cards.push({
            objectId: object.id,
            type: 'anchored-note',
            pageId: frame.pageId,
            xMm: object.placement.xMm,
            yMm: object.placement.yMm,
            widthMm: object.placement.widthMm,
            heightMm,
            slot: 'flow',
            presentation: object.document.presentation,
            html: renderPersonalTextHtml(object.document),
          })
          continue
        }
        if (object.placement.kind === 'auto-near-anchor') {
          const anchorRects = anchorRectsByObjectId.get(object.id)
          if (!anchorRects) {
            diagnose(object.id, 'anchor-unresolved')
            continue
          }
          const sorted = [...anchorRects].sort((a, b) => a.top - b.top || a.left - b.left)
          const first = sorted[0]
          const anchorPage = frames.find((frame) => (
            first.left + 1 >= frame.leftPx && first.left + 1 < frame.leftPx + frame.widthMm * PX_PER_MM
            && first.top + 1 >= frame.topPx && first.top + 1 < frame.topPx + frame.heightMm * PX_PER_MM
          ))
          const contentBox = contentBoxes.find((box) => box.pageId === anchorPage?.pageId)
          const occupied = cards
            .filter((card) => card.type === 'anchored-note')
            .map((card) => {
              const cardFrame = frameByPageId.get(card.pageId)
              return {
                left: cardFrame.leftPx + card.xMm * PX_PER_MM,
                top: cardFrame.topPx + card.yMm * PX_PER_MM,
                width: card.widthMm * PX_PER_MM,
                height: card.heightMm * PX_PER_MM,
              }
            })
          const { candidate, heightMm } = await resolveAutoNote(object, anchorRects, contentBox, occupied)
          if (!candidate || !candidate.fits) {
            diagnose(object.id, 'no-space')
            continue
          }
          const frame = frameByPageId.get(candidate.pageId)
          cards.push({
            objectId: object.id,
            type: 'anchored-note',
            pageId: frame.pageId,
            xMm: roundMm(candidate.xMm - frame.leftPx / PX_PER_MM),
            yMm: roundMm(candidate.yMm - frame.topPx / PX_PER_MM),
            widthMm: candidate.widthMm,
            heightMm: roundMm(heightMm),
            slot: candidate.slot,
            presentation: object.document.presentation,
            html: renderPersonalTextHtml(object.document),
          })
        }
        // placement.kind === 'appendix' falls through to the appendix section
        // at the bottom of the loop.
      }

      if (object.type === 'text-box' && object.placement.kind === 'page-position') {
        if (object.placement.layoutId !== layoutId || !frameByPageId.get(object.placement.pageId)) {
          diagnose(object.id, 'layout-mismatch', { layoutId: object.placement.layoutId })
          continue
        }
        const heightMm = await measureCardHeight({
          pageId: object.placement.pageId,
          xMm: object.placement.xMm,
          yMm: object.placement.yMm,
          widthMm: object.placement.widthMm,
          noteCard: false,
        }, object)
        const frame = frameByPageId.get(object.placement.pageId)
        const bottomMm = object.placement.yMm + heightMm
        const rightMm = object.placement.xMm + object.placement.widthMm
        if (bottomMm > frame.heightMm + OVERFLOW_TOLERANCE_MM || rightMm > frame.widthMm + OVERFLOW_TOLERANCE_MM) {
          diagnose(object.id, 'overflow', { bottomMm: roundMm(bottomMm), rightMm: roundMm(rightMm), pageId: frame.pageId })
        }
        cards.push({
          objectId: object.id,
          type: 'text-box',
          pageId: frame.pageId,
          xMm: object.placement.xMm,
          yMm: object.placement.yMm,
          widthMm: object.placement.widthMm,
          heightMm,
          presentation: object.document.presentation,
          html: renderPersonalTextHtml(object.document),
        })
        continue
      }

      // Appendix entries (anchored notes with placement.kind === 'appendix'
      // and text boxes with placement.kind === 'appendix'): the ordering
      // spot follows the preview — the note's anchor first line, the text
      // box's origin (current layout only).
      if (object.placement?.kind !== 'appendix') continue
      if (object.type === 'anchored-note') {
        const rects = anchorRectsByObjectId.get(object.id)
        const first = rects ? [...rects].sort((a, b) => a.top - b.top || a.left - b.left)[0] ?? null : null
        const frame = first ? frames.find((candidate) => (
          first.left + 1 >= candidate.leftPx && first.left + 1 < candidate.leftPx + candidate.widthMm * PX_PER_MM
          && first.top + 1 >= candidate.topPx && first.top + 1 < candidate.topPx + candidate.heightMm * PX_PER_MM
        )) : null
        appendixRaw.push(frame && first ? {
          objectId: object.id,
          pageIndex: frames.indexOf(frame),
          yMm: roundMm((first.top - frame.topPx) / PX_PER_MM),
          xMm: roundMm((first.left - frame.leftPx) / PX_PER_MM),
          anchorRectMm: {
            leftMm: roundMm((first.left - frame.leftPx) / PX_PER_MM),
            topMm: roundMm((first.top - frame.topPx) / PX_PER_MM),
          },
          origin: null,
          pageId: frame.pageId,
        } : { objectId: object.id, pageIndex: null, yMm: null, xMm: null, anchorRectMm: null, origin: null, pageId: null })
        continue
      }
      if (object.type === 'text-box') {
        const origin = object.placement.origin
        if (!origin || origin.layoutId !== layoutId || !frameByPageId.get(origin.pageId)) {
          appendixRaw.push({ objectId: object.id, pageIndex: null, yMm: null, xMm: null, anchorRectMm: null, origin: null, pageId: null })
          continue
        }
        appendixRaw.push({
          objectId: object.id,
          pageIndex: frames.indexOf(frameByPageId.get(origin.pageId)),
          yMm: origin.yMm,
          xMm: origin.xMm,
          anchorRectMm: null,
          origin: { xMm: origin.xMm, yMm: origin.yMm },
          pageId: origin.pageId,
        })
      }
    }

    // Appendix ordering and numbering — the same shared call the preview uses,
    // so markers, appendix entries and preview numbers always agree.
    const orderedIds = orderAppendixEntries(appendixRaw.map(({ objectId, pageIndex, yMm, xMm }) => ({
      id: objectId, pageIndex, yMm, xMm,
    })))
    const rawByObjectId = new Map(appendixRaw.map((entry) => [entry.objectId, entry]))
    // Markers dodge the page's placed cards and the markers already placed:
    // occupied rects accumulate in appendix-number order, so the result is
    // deterministic and two markers on one line never overlap.
    const occupiedByPage = new Map()
    const pushOccupied = (pageId, rectMm) => {
      if (!occupiedByPage.has(pageId)) occupiedByPage.set(pageId, [])
      occupiedByPage.get(pageId).push(rectMm)
    }
    for (const card of cards) pushOccupied(card.pageId, { xMm: card.xMm, yMm: card.yMm, widthMm: card.widthMm, heightMm: card.heightMm })
    const markers = []
    const appendix = []
    for (const [index, entryId] of orderedIds.entries()) {
      const number = index + 1
      const raw = rawByObjectId.get(entryId)
      const object = objects.find((candidate) => candidate.id === entryId)
      if (raw.pageId) {
        const frame = frameByPageId.get(raw.pageId)
        const box = contentBoxes.find((candidate) => candidate.pageId === raw.pageId)
        const position = appendixMarkerPosition({
          origin: raw.origin,
          anchorRectMm: raw.anchorRectMm,
          contentBoxLeftMm: box ? roundMm((box.leftPx - frame.leftPx) / PX_PER_MM) : null,
          contentBoxRightMm: box ? roundMm((box.rightPx - frame.leftPx) / PX_PER_MM) : null,
          contentBoxTopMm: box ? roundMm((box.topPx - frame.topPx) / PX_PER_MM) : null,
          contentBoxBottomMm: box ? roundMm((box.bottomPx - frame.topPx) / PX_PER_MM) : null,
          pageWidthMm: frame?.widthMm ?? null,
          occupiedRectsMm: occupiedByPage.get(raw.pageId) ?? [],
        })
        if (position) {
          // blocked stays on the marker (position kept, collision reported) —
          // never a diagnostic, which would refuse the whole export.
          markers.push({
            objectId: entryId,
            number,
            pageId: raw.pageId,
            xMm: roundMm(position.xMm),
            yMm: roundMm(position.yMm),
            centered: position.centered,
            moved: position.moved,
            blocked: position.blocked,
          })
          pushOccupied(raw.pageId, position.rectMm)
        }
      }
      appendix.push({
        objectId: entryId,
        number,
        type: object.type,
        sourceLabel: appendixSourceLabel({
          type: object.type,
          pageIndex: raw.pageIndex,
          exactText: object.type === 'anchored-note' ? object.textAnchor.segments[0]?.exactText ?? '' : undefined,
        }),
        presentation: object.document.presentation,
        html: renderPersonalTextHtml(object.document),
      })
    }

    return {
      planVersion: PERSONAL_EXPORT_PLAN_VERSION,
      overlayStyleVersion: PERSONAL_OVERLAY_STYLE_VERSION,
      layoutId,
      pageCount: frames.length,
      // Content-box offsets (page-internal mm) ride along: the composer draws
      // highlight underlays inside .pagedjs_page_content (origin = content
      // box, not page box), and the PDF verifier's pixel checks bound their
      // unhighlighted control bands by the text column.
      pages: frames.map((frame) => {
        const box = contentBoxes.find((candidate) => candidate.pageId === frame.pageId)
        return {
          pageId: frame.pageId,
          widthMm: frame.widthMm,
          heightMm: frame.heightMm,
          ...(box ? {
            contentLeftMm: roundMm((box.leftPx - frame.leftPx) / PX_PER_MM),
            contentRightMm: roundMm((box.rightPx - frame.leftPx) / PX_PER_MM),
            contentTopMm: roundMm((box.topPx - frame.topPx) / PX_PER_MM),
          } : {}),
        }
      }),
      basePageTextDigests,
      marks,
      cards,
      markers,
      appendix,
      diagnostics,
    }
  })
}
