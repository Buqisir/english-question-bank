/*
 * The stage-5 compose pass (#489 5c): turns a measured personal-export plan
 * (exportPlan.mjs) into a printable PDF job on top of renderPaginatedPaper.
 * composePersonalExport({ printHtml, plan, layoutRef }) returns
 * { printHtml, compose }:
 *
 *   - printHtml: the base print HTML, extended only where the plan needs it.
 *     With appendix entries the named-page appendix sheet (附页) is appended
 *     before </body> (its style block before </head> — paged.js ignores
 *     stylesheets in the body) together with the versioned overlay styles
 *     and the personal fonts (inlined data URIs — the appendix must be
 *     paginated with its final faces). Without an appendix and without text
 *     cards the bytes come back untouched.
 *
 *   - compose: the callback for renderPaginatedPaper's compose hook
 *     (paginationRenderer.mjs step 5.5). It re-verifies that the freshly
 *     paginated base is still the layout the plan was measured against
 *     (page count, per-page size, per-page text digests, and each mark's
 *     first rect re-measured through the plan's own shared anchor code),
 *     refuses a changed base, then draws the plan's marks, cards and appendix
 *     markers onto the pages as absolutely-positioned, pointer-inert
 *     overlays. It never re-paginates and never touches the base content.
 *
 * A plan that still carries diagnostics is refused before anything renders —
 * the upper layer is expected to refuse as well (double gate).
 */
import { createHash } from 'node:crypto'
import { installPersonalFontRoute, personalFontFaceUrlCss } from './personalFonts.mjs'
import { personalOverlayBrowserScript } from './browserBundle.mjs'
import { measureAnchorRectsInPage } from './anchorMeasureDom.mjs'
import { personalTextStyle } from '../../shared/personal-text/index.mjs'
import {
  PERSONAL_OVERLAY_STYLE_VERSION,
  personalOverlayCss,
} from '../../shared/personal-paper-layer/overlayStyles.mjs'
import { PERSONAL_EXPORT_PLAN_VERSION } from './exportPlan.mjs'

// The paper view renders at CSS 96dpi; every px↔mm conversion shares that.
const PX_PER_MM = 96 / 25.4

// Same size tolerance as the measure pass's layout verification.
const SIZE_TOLERANCE_MM = 0.1
// A plan mark's re-measured rect must land within this of the plan's; past it
// the base moved under the annotations (same-text shifts included).
const POSITION_TOLERANCE_MM = 0.2

function fail(code, message, details) {
  const error = new Error(message)
  error.code = code
  if (details !== undefined) error.details = details
  return error
}

const sha256Text = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

const inlineRootStyle = (style) => (style
  ? ` style="font-family:${escapeHtml(style.fontFamily)};font-size:${style.fontSize};line-height:${style.lineHeight};"`
  : '')

// The appendix sheet lives on a named page so its margins (and its own
// "附页 N" footer) never touch the base pages' @page rules.
const APPENDIX_SHEET_CSS = `
@page personal-appendix {
  margin: 17mm 24mm;
  @bottom-center { content: "附页 " counter(page); }
}

.personal-appendix {
  page: personal-appendix;
  break-before: page;
}

.personal-appendix-title {
  margin: 0 0 8mm;
  font-family: 'EQB Termes', 'EQB Source Han Serif', serif;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
}

.personal-appendix-entry {
  display: flex;
  align-items: flex-start;
  gap: 2mm;
}

.personal-appendix-entry + .personal-appendix-entry {
  margin-top: 5mm;
}

.personal-appendix-entry .eqb-personal-overlay-appendix-marker {
  flex: 0 0 auto;
}

.personal-appendix-body {
  flex: 1 1 0;
  min-width: 0;
}

.personal-appendix-source {
  margin: 0 0 1.5mm;
  font-family: Inter, 'PingFang SC', ui-sans-serif, system-ui, sans-serif;
  font-size: 12px;
  color: #6f6a60;
}
`.trim()

function renderAppendixSection(plan) {
  const entries = plan.appendix.map((entry) => {
    const style = personalTextStyle(entry.presentation)
    return [
      '  <div class="personal-appendix-entry">',
      `    <span class="eqb-personal-overlay-appendix-marker">附${entry.number}</span>`,
      '    <div class="personal-appendix-body">',
      `      <p class="personal-appendix-source">${escapeHtml(entry.sourceLabel ?? '')}</p>`,
      `      <div class="eqb-personal-text"${inlineRootStyle(style)}>${entry.html}</div>`,
      '    </div>',
      '  </div>',
    ].join('\n')
  }).join('\n')
  return `<section class="personal-appendix">\n  <h2 class="personal-appendix-title">附页</h2>\n${entries}\n</section>`
}

function collectPresetIds(plan) {
  return [...new Set([...plan.cards, ...plan.appendix]
    .map((item) => item.presentation?.fontPresetId)
    .filter((id) => typeof id === 'string'))]
}

function renderExportStyleBlock(plan, { withAppendix }) {
  const presetIds = collectPresetIds(plan)
  const personalFonts = presetIds.length > 0 ? personalFontFaceUrlCss({ presetIds }) : null
  const parts = [
    // Fonts come first so the faces exist before any text is measured.
    ...(personalFonts?.css ? [personalFonts.css] : []),
    personalOverlayCss(),
    // The overlay layers are drawn inside the page box; paged.js does not
    // guarantee a positioning context on .pagedjs_page.
    '.pagedjs_page { position: relative; }',
    ...(withAppendix ? [APPENDIX_SHEET_CSS] : []),
  ]
  return `<style data-eqb-personal-export="${PERSONAL_OVERLAY_STYLE_VERSION}">\n${parts.join('\n')}\n</style>`
}

export function composePersonalExport({ printHtml, plan, layoutRef, source, objects }) {
  if (typeof printHtml !== 'string' || !printHtml.trim()) {
    throw fail('PERSONAL_EXPORT_COMPOSE_INVALID', 'composePersonalExport 需要基础 printHtml')
  }
  if (!plan || plan.planVersion !== PERSONAL_EXPORT_PLAN_VERSION) {
    throw fail('PERSONAL_EXPORT_PLAN_INVALID', '批注导出计划版本不受支持', plan?.planVersion ?? null)
  }
  if (!Array.isArray(plan.diagnostics) || plan.diagnostics.length > 0) {
    throw fail('PERSONAL_EXPORT_HAS_DIAGNOSTICS', '批注存在未解出的问题，已拒绝导出', plan.diagnostics ?? null)
  }
  if (!Array.isArray(layoutRef?.pages) || layoutRef.pages.length !== plan.pageCount) {
    throw fail('PERSONAL_EXPORT_PLAN_INVALID', 'layoutRef 与批注导出计划的页面数不一致')
  }
  if (plan.marks.length > 0 && (!source || !Array.isArray(objects))) {
    throw fail('PERSONAL_EXPORT_COMPOSE_INVALID', 'composePersonalExport 需要来源与批注对象以复核标记位置')
  }

  const appendixHtml = plan.appendix.length > 0 ? renderAppendixSection(plan) : null
  const hasTextCards = plan.cards.length > 0
  const styleBlock = appendixHtml || hasTextCards
    ? renderExportStyleBlock(plan, { withAppendix: appendixHtml !== null })
    : null
  let composedPrintHtml = printHtml
  if (styleBlock || appendixHtml) {
    // paged.js only picks up stylesheets from <head> — a style block appended
    // at the end of <body> is silently dropped, so the sheet styles and the
    // personal fonts must go before </head> while the appendix section itself
    // joins the flow at the end of <body>.
    let composed = printHtml
    if (styleBlock) {
      composed = /<\/head>/i.test(composed)
        ? composed.replace(/<\/head>/i, () => `${styleBlock}\n</head>`)
        : styleBlock + composed
    }
    if (appendixHtml) {
      composed = /<\/body>/i.test(composed)
        ? composed.replace(/<\/body>/i, () => `${appendixHtml}\n</body>`)
        : composed + appendixHtml
    }
    composedPrintHtml = composed
  }

  const pageIndexById = new Map(plan.pages.map((page, index) => [page.pageId, index]))
  const drawByPageIndex = plan.pages.map(() => ({ marks: [], cards: [], markers: [] }))
  const pageIndexOf = (pageId, label) => {
    const index = pageIndexById.get(pageId)
    if (index === undefined) {
      throw fail('PERSONAL_EXPORT_PLAN_INVALID', `批注导出计划引用了未知页面（${label}）`, pageId)
    }
    return index
  }
  for (const mark of plan.marks) {
    drawByPageIndex[pageIndexOf(mark.pageId, mark.objectId)].marks.push({
      type: mark.type,
      color: mark.color,
      ink: mark.ink,
      rectsMm: mark.rectsMm,
    })
  }
  for (const card of plan.cards) {
    drawByPageIndex[pageIndexOf(card.pageId, card.objectId)].cards.push({
      objectId: card.objectId,
      type: card.type,
      slot: card.slot,
      xMm: card.xMm,
      yMm: card.yMm,
      widthMm: card.widthMm,
      heightMm: card.heightMm,
      rootStyle: personalTextStyle(card.presentation),
      html: card.html,
    })
  }
  for (const marker of plan.markers) {
    drawByPageIndex[pageIndexOf(marker.pageId, marker.objectId)].markers.push({
      objectId: marker.objectId,
      number: marker.number,
      xMm: marker.xMm,
      yMm: marker.yMm,
      centered: marker.centered,
    })
  }

  const presetIds = collectPresetIds(plan)
  const fontFaces = presetIds.length > 0 ? personalFontFaceUrlCss({ presetIds }).faces : []

  const compose = async (page) => {
    // a. 基底完整性核对：页数、每页尺寸、每页正文摘要必须与量测时的基准
    // 一致，否则拒绝导出（绝不将错就错把批注画到另一版卷面上）。
    const observed = await page.evaluate(({ baseCount, pxPerMm }) => {
      const pages = [...document.querySelectorAll('.pagedjs_pages > .pagedjs_page')]
      return {
        count: pages.length,
        sizesMm: pages.slice(0, baseCount).map((element) => {
          const box = element.getBoundingClientRect()
          return { widthMm: box.width / pxPerMm, heightMm: box.height / pxPerMm }
        }),
        // Content-box offset within each page (CSS px): the highlight
        // underlay lives inside .pagedjs_page_content, whose origin sits
        // inside the page margins.
        contents: pages.slice(0, baseCount).map((element) => {
          const content = element.querySelector('.pagedjs_page_content')
          if (!content) return null
          const pageBox = element.getBoundingClientRect()
          const box = content.getBoundingClientRect()
          return { leftPx: box.left - pageBox.left, topPx: box.top - pageBox.top }
        }),
        texts: pages.slice(0, baseCount).map((element) => {
          const clone = element.cloneNode(true)
          clone.querySelectorAll('.pagedjs_margin').forEach((node) => node.remove())
          return clone.textContent.replace(/\s+/gu, ' ').trim()
        }),
      }
    }, { baseCount: plan.pageCount, pxPerMm: PX_PER_MM })

    const mismatches = []
    if (plan.appendix.length > 0 ? observed.count <= plan.pageCount : observed.count !== plan.pageCount) {
      mismatches.push(`pageCount ${observed.count} vs ${plan.pageCount}`)
    }
    for (const [index, size] of observed.sizesMm.entries()) {
      const expected = layoutRef.pages[index]
      if (Math.abs(size.widthMm - expected.widthMm) > SIZE_TOLERANCE_MM
        || Math.abs(size.heightMm - expected.heightMm) > SIZE_TOLERANCE_MM) {
        mismatches.push(`page ${expected.pageId} size ${size.widthMm.toFixed(2)}x${size.heightMm.toFixed(2)}mm`)
      }
    }
    for (const [index, text] of observed.texts.entries()) {
      if (sha256Text(text) !== plan.basePageTextDigests[index]) {
        mismatches.push(`page ${layoutRef.pages[index].pageId} text changed`)
      }
    }
    if (mismatches.length > 0) {
      throw fail('PERSONAL_EXPORT_BASE_CHANGED', '卷面基底与批注量测时不一致，已拒绝导出', mismatches)
    }

    // b. 个人字体：字体已在 printHtml 里内联，这里确认每一张脸真的加载
    // 成功——回退字体打出来的批注版不算数。
    if (fontFaces.length > 0) {
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
        throw fail('PERSONAL_EXPORT_FONT_FAILED', '个人字体加载失败，无法导出批注版', failedFaces)
      }
    }

    // b2. 位置完整性：用与量测遍同一份共享锚点代码重新量测每个计划标记的
    // 首个矩形——基底哪怕只挪动 1mm（文字内容不变也在内），批注就会画错位
    // 置，直接拒绝导出。
    if (plan.marks.length > 0) {
      const bundle = await personalOverlayBrowserScript()
      await page.addScriptTag({ content: bundle.code })
      await page.evaluate((installed) => {
        window.__eqbPersonalSource = installed
      }, source)
      const frames = await page.evaluate(() => (
        [...document.querySelectorAll('.pagedjs_pages > .pagedjs_page')].map((element) => {
          const box = element.getBoundingClientRect()
          return { leftPx: box.left + window.scrollX, topPx: box.top + window.scrollY }
        })
      ))
      const objectsById = new Map(objects.map((object) => [object.id, object]))
      const rectsByObjectId = new Map()
      for (const mark of plan.marks) {
        if (rectsByObjectId.has(mark.objectId)) continue
        const segments = objectsById.get(mark.objectId)?.textAnchor?.segments
        const rects = segments ? await page.evaluate(measureAnchorRectsInPage, segments) : null
        rectsByObjectId.set(mark.objectId, rects ?? [])
      }
      const positionMismatches = []
      for (const mark of plan.marks) {
        const pageIndex = pageIndexById.get(mark.pageId)
        const frame = Number.isInteger(pageIndex) ? frames[pageIndex] : null
        const expected = mark.rectsMm[0]
        // Same page-assignment rule as the measure pass: a rect's page is the
        // page containing its centre.
        const onPage = (rectsByObjectId.get(mark.objectId) ?? []).filter((rect) => {
          if (!frame) return false
          const centreX = rect.left + rect.width / 2
          const centreY = rect.top + rect.height / 2
          return centreX >= frame.leftPx && centreX < frame.leftPx + layoutRef.pages[pageIndex].widthMm * PX_PER_MM
            && centreY >= frame.topPx && centreY < frame.topPx + layoutRef.pages[pageIndex].heightMm * PX_PER_MM
        })
        const measured = onPage[0]
        const deltas = frame && measured && expected
          ? {
              xMm: (measured.left - frame.leftPx) / PX_PER_MM - expected.xMm,
              yMm: (measured.top - frame.topPx) / PX_PER_MM - expected.yMm,
              widthMm: measured.width / PX_PER_MM - expected.widthMm,
              heightMm: measured.height / PX_PER_MM - expected.heightMm,
            }
          : null
        if (!deltas || Math.abs(deltas.xMm) > POSITION_TOLERANCE_MM || Math.abs(deltas.yMm) > POSITION_TOLERANCE_MM
          || Math.abs(deltas.widthMm) > POSITION_TOLERANCE_MM || Math.abs(deltas.heightMm) > POSITION_TOLERANCE_MM) {
          positionMismatches.push(`mark ${mark.objectId} on page ${mark.pageId} no longer sits at its measured rect`)
        }
      }
      if (positionMismatches.length > 0) {
        throw fail('PERSONAL_EXPORT_BASE_CHANGED', '卷面标记位置与量测时不一致，已拒绝导出', positionMismatches)
      }
    }

    // c. 画 overlay：整层 pointer-events:none，绝不影响打印；坐标是
    // 页内 mm，直接换算成 CSS px 绝对定位在 .pagedjs_page 上。
    // 高亮例外：Chromium 的 PDF 丢掉 mix-blend-mode，盖在文字上的高亮会
    // 印成不透明色条把字吃掉。高亮因此画进 .pagedjs_page_content 里的
    // z-index:-1 垫层——in-flow 正文之上（垫层是 positioned）之下（负
    // z-index），字形完整、高亮色留在字间。content 的 z-index:0（配合
    // paged.js 自带的 position:relative）把负值垫层关进本页的堆叠上下文，
    // 不会掉到页面白底后面。下划线、卡片、文字框、标记仍走上层。
    const pagesWithoutUnderlay = drawByPageIndex
      .map((draw, index) => (draw?.marks.some((mark) => mark.type === 'highlight') && !observed.contents[index] ? index : null))
      .filter((index) => index != null)
    if (pagesWithoutUnderlay.length > 0) {
      throw fail('PERSONAL_EXPORT_BASE_CHANGED', '卷面页缺少正文盒，高亮无法画在文字下方，已拒绝导出', pagesWithoutUnderlay)
    }
    await page.addStyleTag({
      content: `${personalOverlayCss()}\n.pagedjs_page { position: relative; }\n`
        + '/* Explicit-Cascade: 覆盖 paged.js 的 z-index:auto——content 必须自建堆叠上下文，-1 高亮垫层才不会沉到页面背景后面。 */\n'
        + '.pagedjs_page_content { z-index: 0; }',
    })
    await page.evaluate((injected) => {
      const pages = [...document.querySelectorAll('.pagedjs_pages > .pagedjs_page')]
      injected.pages.forEach((draw, index) => {
        if (!draw || (!draw.marks.length && !draw.cards.length && !draw.markers.length)) return
        const pageElement = pages[index]
        if (!pageElement) return
        const px = injected.pxPerMm
        const content = injected.contents[index]
        const contentElement = content ? pageElement.querySelector('.pagedjs_page_content') : null
        const highlights = draw.marks.filter((mark) => mark.type === 'highlight')
        if (contentElement && content) {
          const underlay = document.createElement('div')
          underlay.className = 'eqb-personal-export-underlay'
          underlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:-1;pointer-events:none;'
          for (const mark of highlights) {
            for (const rect of mark.rectsMm) {
              const element = document.createElement('div')
              element.className = 'eqb-personal-overlay-mark eqb-personal-overlay-mark--highlight'
              element.setAttribute('data-color', mark.color)
              // 页内 mm → content 盒内坐标：扣掉 content 盒相对页面的偏移。
              element.style.cssText = 'position:absolute;left:' + (rect.xMm * px - content.leftPx) + 'px;top:'
                + (rect.yMm * px - content.topPx) + 'px;width:' + rect.widthMm * px
                + 'px;height:' + rect.heightMm * px + 'px;box-sizing:border-box;'
              underlay.appendChild(element)
            }
          }
          contentElement.appendChild(underlay)
        }
        if (!contentElement && highlights.length > 0) {
          // 没有 content 盒就没有垫层可画；画在上层会把字吃掉，交给外层拒绝导出。
          throw new Error(`PERSONAL_EXPORT_NO_CONTENT_BOX:${index}`)
        }
        const topMarks = draw.marks.filter((mark) => mark.type !== 'highlight')
        if (!topMarks.length && !draw.cards.length && !draw.markers.length) return
        const overlay = document.createElement('div')
        overlay.className = 'eqb-personal-export-overlay'
        overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;'
        for (const mark of topMarks) {
          for (const rect of mark.rectsMm) {
            const element = document.createElement('div')
            element.className = `eqb-personal-overlay-mark eqb-personal-overlay-mark--${mark.type}`
            if (mark.type === 'highlight') element.setAttribute('data-color', mark.color)
            else element.setAttribute('data-ink', mark.ink)
            element.style.cssText = 'position:absolute;left:' + rect.xMm * px + 'px;top:' + rect.yMm * px
              + 'px;width:' + rect.widthMm * px + 'px;height:' + rect.heightMm * px
              + 'px;box-sizing:border-box;'
            overlay.appendChild(element)
          }
        }
        for (const card of draw.cards) {
          const element = document.createElement('div')
          element.className = card.type === 'anchored-note'
            ? 'eqb-personal-overlay-note-card' + (card.slot === 'margin' ? ' eqb-personal-overlay-note-card--margin' : '')
            : 'eqb-personal-overlay-text-box'
          element.style.cssText = 'position:absolute;left:' + card.xMm * px + 'px;top:' + card.yMm * px
            + 'px;width:' + card.widthMm * px + 'px;height:' + card.heightMm * px
            + 'px;overflow:visible;'
          if (card.rootStyle) {
            element.style.fontFamily = card.rootStyle.fontFamily
            element.style.fontSize = card.rootStyle.fontSize
            element.style.lineHeight = card.rootStyle.lineHeight
          }
          const text = document.createElement('div')
          text.className = 'eqb-personal-text'
          text.innerHTML = card.html
          element.appendChild(text)
          overlay.appendChild(element)
        }
        for (const marker of draw.markers) {
          const element = document.createElement('span')
          element.className = 'eqb-personal-overlay-appendix-marker' + (marker.centered ? ' is-centered' : '')
          element.textContent = `附${marker.number}`
          element.style.cssText = 'position:absolute;left:' + marker.xMm * px + 'px;top:' + marker.yMm * px + 'px;'
          overlay.appendChild(element)
        }
        pageElement.appendChild(overlay)
      })
    }, { pages: drawByPageIndex, contents: observed.contents, pxPerMm: PX_PER_MM })
  }

  return { printHtml: composedPrintHtml, compose }
}
