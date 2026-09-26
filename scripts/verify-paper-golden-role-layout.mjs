import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from '../app/node_modules/playwright/index.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { planFixedPagePdf, renderExplicitFixedPagePdf } from '../server/draft-paper/fixedPagePdfPlanner.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import { consumerContractRefs, resolveConsumerPresentation } from '../shared/paper-canonical/consumers.mjs'
import { sevenChoicesRhythm } from '../shared/paper-canonical/sevenChoicesRhythm.mjs'
import { grammarFillRhythm } from '../shared/paper-canonical/grammarFillRhythm.mjs'
import { sectionHeadingRuntime } from '../shared/paper-canonical/sectionHeadingContract.mjs'
import { hasSourceBulletLines } from '../shared/papersurface/readingParagraphLayout.mjs'
import historical from '../standards/paper-canonical/consumers/print-pdf-v44.json' with { type: 'json' }

const bulletInlines = [{ text: '● First entry\n● Second' }, { text: ' entry\n● Third entry' }]
assert.equal(hasSourceBulletLines(bulletInlines), true)
assert.equal(hasSourceBulletLines([{ text: '• A single item' }]), true)
for (const text of ['', 'Ordinary ● prose', '● First entry\nOrdinary prose', '●First without a separator']) {
  assert.equal(hasSourceBulletLines([{ text }]), false, text)
}
assert.equal(hasSourceBulletLines([{ text: '● Text' }, { kind: 'media_ref' }]), false)

const marker = 'data-canonical-role-layout="golden_reference_v1"'
for (const ref of Object.values(consumerContractRefs)) {
  assert.equal(resolveConsumerPresentation(ref).policy.roleLayout, 'golden_reference_v1')
}
assert.equal(resolveConsumerPresentation({ id: historical.consumerId, version: historical.version, digest: historical.contractDigest }).policy.roleLayout, undefined)

// Isolated CSS stress fixtures, using actual production styles (including the
// later Print density overrides). Actual React/Print producer checks live in
// the family verifiers; these exercise the complete role set and old bindings.
const sharedCss = readFileSync('shared/papersurface/paperLayout.css', 'utf8')
const readingCss = readFileSync('shared/papersurface/readingLayout.css', 'utf8')
const screenCss = readFileSync('app/src/shared-ui/papersurface/PaperSurface.css', 'utf8').replace(/^@import[^;]+;/gm, '')
const printHtml = buildPrintHtml({ title: '', versionType: 'student', printStyle: 'exam', items: [], blocks: [] })
const printCss = [...printHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')
const roles = [
  'data-canonical-reading-role="body"',
  'data-canonical-seven-choices-rhythm-role="passage_body_line"',
  'data-canonical-cloze-rhythm-role="passage_body_line"',
  'data-canonical-grammar-fill-rhythm-role="passage_body_line"',
  'data-canonical-application-writing-rhythm-role="prompt_line"',
  'data-canonical-continuation-writing-rhythm-role="material_paragraph"',
]
const prose = 'The deliberately uneven words should share the right edge on ordinary lines, but this short final line must remain natural. '
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
try {
  const page = await browser.newPage()
  // A non-final justified line must expand English word spaces, not the glyphs
  // inside a Chinese gloss. Compare geometry against natural alignment, and
  // require the historical auto-justification control to expose the defect.
  await page.setContent(`<style>${sharedCss}
    .gloss-fixture p{width:300px;font:20px serif;text-indent:0;text-align:justify}
    </style><div class="ps-surface gloss-fixture" ${marker}>
    ${roles.map(role => `<p ${role}>Chinese tea has flourished <span>(繁荣)</span> throughout many years of study and practice.</p>`).join('')}
    </div>`)
  const glossWidths = await page.locator('.gloss-fixture p').evaluateAll(nodes => nodes.map(node => {
    const range = document.createRange()
    range.selectNodeContents(node.querySelector('span'))
    const measured = range.getBoundingClientRect().width
    const policy = getComputedStyle(node).textJustify
    node.style.textAlign = 'left'
    const natural = range.getBoundingClientRect().width
    node.style.textAlign = 'justify'
    node.closest('.ps-surface').removeAttribute('data-canonical-role-layout')
    const historical = range.getBoundingClientRect().width
    node.closest('.ps-surface').setAttribute('data-canonical-role-layout', 'golden_reference_v1')
    return { measured, natural, historical, policy }
  }))
  for (const [index, widths] of glossWidths.entries()) {
    if (index === 4) {
      assert.equal(widths.policy, 'auto', 'Chinese application prompts keep their policy')
      continue
    }
    assert.equal(widths.policy, 'inter-word', roles[index])
    assert(Math.abs(widths.measured - widths.natural) < 0.1, `${roles[index]}: gloss must keep natural width`)
    assert(widths.historical > widths.natural + 5, 'control must exercise actual inter-character expansion')
  }
  // Exercise the real whole-paper flex wrapper and overlapping chrome roles,
  // not just isolated PaperSurface groups. A wrapped final option must measure
  // from its last line; the shell gap must not change either semantic step.
  const browseCss = readFileSync('app/src/features/paper-browse/paperBrowsePage.css', 'utf8').replace(/^@import[^;]+;/gm, '')
  const writingCss = readFileSync('app/src/features/paper-intelligence/writingPaperPage.css', 'utf8').replace(/^@import[^;]+;/gm, '')
  const browseSource = readFileSync('app/src/features/paper-browse/PaperBrowsePage.tsx', 'utf8')
  const gapExpression = browseSource.match(/'--pb-part-boundary-gap':\s*(`[^`]+`)/)?.[1]
  assert(gapExpression, 'production must bind the common part-boundary gap')
  const followingGap = new Function('sectionHeadingRuntime', `return ${gapExpression}`)(sectionHeadingRuntime)
  assert.equal(followingGap, '24px', 'production binding must resolve the pinned two-step Screen edge')
  for (const [rhythm, edgeId] of [
    [sevenChoicesRhythm, 'student_bank_to_next_section_same_page'],
    [grammarFillRhythm, 'student_tail_to_next_section_same_page'],
  ]) assert.equal(rhythm.adjacencyGraph.find(edge => edge.edgeId === edgeId).baselineStepRatio, 2)
  for (const family of ['cloze', 'section-only', 'reading', 'writing', 'generic', 'listening-reading'])
  for (const gap of [16, 28]) for (const lecture of [false, true]) for (const pageHint of [false, true]) {
    const hasPart = family !== 'section-only'
    const writing = family === 'writing'
    const listening = family === 'listening-reading'
    const chrome = family === 'cloze' || !hasPart ? 'data-canonical-cloze-chrome'
      : family === 'reading' || listening ? 'data-canonical-reading-chrome' : ''
    const heading = `${hasPart ? `<h2 class="${writing ? 'pi-writing-part' : 'paper-browse-part-heading'}" ${chrome}
      ${writing ? 'data-canonical-grammar-fill-following-for="grammar"' : family === 'cloze' ? 'data-canonical-seven-choices-following-for="seven"' : ''}
      ${listening ? 'data-canonical-reading-rhythm-role="part_title"' : ''}>下一部分</h2>` : ''}
      ${pageHint && !writing ? '<div class="paper-browse-pagebreak" aria-hidden="true"></div>' : ''}
      <h3 class="${writing ? 'pi-writing-section' : 'paper-browse-section-heading'}" ${chrome}
        ${hasPart ? '' : 'data-canonical-seven-choices-following-for="seven"'}>第一节</h3>
      <p class="${writing ? 'pi-writing-instruction' : 'paper-browse-instruction'}" ${chrome}>阅读下面短文。</p>`
    await page.setContent(`<style>${sharedCss}${screenCss}${writingCss}${browseCss}
      .paper-browse-content{--pb-block-gap:${gap}px;--ps-font-size:14px;--ps-line-height:24px;
        --ps-font-stack:serif;--ps-font-stack-heading:serif;--ps-section-heading-font-stack:serif;
        --ps-section-heading-font-size:14px;--ps-section-heading-line-height:24px;
        --pb-part-boundary-gap:${followingGap};
        --ps-cloze-baseline-step:24px;--ps-part-to-first-section-gap:7.994px;
        --ps-part-to-first-section-glyph-overhang:3px}
      .bank-line{margin:0;font:14px/24px serif}
      </style><div class="${lecture ? 'paper-browse-shell--lecture-open' : ''}"><div class="paper-browse-content"><div class="paper-browse-zoom">
      <div class="paper-browse-group-card" ${listening ? 'data-canonical-group-type="listening"' : ''}><article class="ps-page"><section class="ps-section"><p class="bank-line">A deliberately wrapped final item.<br>Its last line.</p>${writing ? '<ol class="ps-question-list"></ol>' : ''}</section></article></div>
      ${pageHint ? '<div class="paper-browse-pagebreak" aria-hidden="true"></div>' : ''}
      ${writing ? `<div class="paper-browse-group-card paper-browse-group-card--writing"><div class="pi-writing-page pi-writing-page--application">${heading}</div></div>` : heading}
      </div></div></div>`)
    const steps = await page.evaluate(() => {
      const bank = document.querySelector('.bank-line').getBoundingClientRect()
      const part = document.querySelector('.paper-browse-part-heading, .pi-writing-part')
      const section = document.querySelector('.paper-browse-section-heading, .pi-writing-section')
      const following = part || section
      const zoom = Number(getComputedStyle(document.querySelector('.paper-browse-zoom')).zoom)
      const textBottom = node => {
        const range = document.createRange(); range.selectNodeContents(node)
        return range.getClientRects()[0].bottom
      }
      return {
        zoom,
        bankToHeading: (following.getBoundingClientRect().top - bank.bottom) / zoom + 24,
        partToSection: part ? (textBottom(section) - textBottom(part)) / zoom : null,
        sectionToInstruction: (document.querySelector('.paper-browse-instruction, .pi-writing-instruction').getBoundingClientRect().top - section.getBoundingClientRect().top) / zoom,
      }
    })
    assert.equal(steps.zoom, 1, 'CSS defaults to baseline; the browser page supplies adaptive zoom')
    assert(Math.abs(steps.bankToHeading - (listening ? 72 : 48)) < 0.1, `Screen content→part: ${JSON.stringify({ family, gap, lecture, pageHint, steps })}`)
    if (hasPart) assert(Math.abs(steps.partToSection - (24 + 7.994)) < 0.1, `Screen part→section: ${JSON.stringify(steps)}`)
    if (family === 'cloze' || !hasPart || writing) assert(Math.abs(steps.sectionToInstruction - 24) < 0.1, 'Screen section→instruction keeps the 18pt baseline before adaptive zoom')
    const firstVisible = await page.evaluate(() => {
      const emptyList = document.querySelector('.ps-question-list')
      if (emptyList) {
        emptyList.innerHTML = '<li>A real question or listening cue.</li>'
        if (getComputedStyle(emptyList).display === 'none') throw new Error('nonempty question list was hidden')
      }
      document.querySelector('.bank-line').closest('.paper-browse-group-card').remove()
      const sheet = document.querySelector('.paper-browse-zoom')
      sheet.insertAdjacentHTML('afterbegin', '<style></style><div class="paper-browse-pagebreak" aria-hidden="true"></div>')
      const first = sheet.querySelector('.paper-browse-part-heading, .pi-writing-part, .paper-browse-section-heading')
      return (first.getBoundingClientRect().top - sheet.getBoundingClientRect().top) / Number(getComputedStyle(sheet).zoom) - Number.parseFloat(getComputedStyle(sheet).paddingTop)
    })
    assert(Math.abs(firstVisible) < 0.1, `Screen first visible ${family} must not add a boundary before any content`)
  }
  await page.emulateMedia({ media: 'print' })
  assert.equal(await page.locator('.paper-browse-zoom').evaluate(node => getComputedStyle(node).zoom), '1', 'Print must not inherit Screen zoom')
  await page.emulateMedia({ media: 'screen' })
  for (const surface of ['screen', 'print']) for (const current of [true, false]) {
    const css = surface === 'screen' ? sharedCss + screenCss : printCss
    const rootClass = surface === 'screen' ? 'ps-surface' : 'question-group'
    const prefix = surface === 'screen' ? 'ps-' : ''
    await page.setContent(`<style>${css}
      body{font:14px/24px serif} .fixture{width:350px;--ps-passage-indent:28px;--paper-passage-indent:28px;
      --paper-seven-baseline:24px;--paper-cloze-baseline:24px;--paper-grammar-fill-baseline:24px}
      .fixture.ps-surface{padding:0;display:block;min-height:0;font:inherit}
      </style><main class="exam"><div class="fixture ${rootClass}" ${current ? marker : ''}>
      <div class="passage">${roles.map((role, i) => `<p class="ps-paragraph" data-test="body-${i}" ${role}>${prose.repeat(2)}</p>`).join('')}
      <p data-canonical-reading-role="body"><span data-canonical-content-node-id="lines">Opening hours\nClosed on Mondays\nNotes</span></p>
      <p class="ps-paragraph" data-test="bullets" data-canonical-reading-role="body" ${hasSourceBulletLines(bulletInlines) ? 'data-canonical-source-bullet-lines' : ''}><span data-canonical-content-node-id="bullets">${bulletInlines.map(inline => inline.text).join('')}</span></p>
      <table><tr><td data-canonical-cell-id="cell"><span data-canonical-content-node-id="cell-lines">Children\nStudents</span></td></tr></table>
      </div><section class="canonical-continuation-material ${surface === 'screen' ? 'ps-section' : 'passage'}"><p data-test="last-narrative" data-canonical-continuation-writing-rhythm-role="material_paragraph">Final narrative.</p>${surface === 'screen' ? '</section>' : ''}
      <p class="canonical-continuation-notice" data-canonical-continuation-writing-rhythm-role="notice_line">
      <span class="${prefix}canonical-application-notice-line" data-canonical-continuation-notice-line="label">注意：</span><span class="${prefix}canonical-application-notice-line ${prefix}canonical-application-notice-line--instruction" data-canonical-continuation-notice-line="instruction">（1）要求内容应保持一致，较长的要求需要换行，也不应该继承正文的首行缩进。</span></p>${surface === 'screen' ? '' : '</section>'}
      <p data-canonical-reading-role="subtitle">Subtitle</p><p data-test="unrelated">Not a prose role.</p>
      </div></main>`)
    const result = await page.evaluate(() => {
      const style = node => {
        const s = getComputedStyle(node)
        return { align: s.textAlign, last: s.textAlignLast, bottom: s.marginBottom, indent: s.textIndent }
      }
      const notice = document.querySelector('[data-canonical-continuation-writing-rhythm-role="notice_line"]')
      const lineYs = id => {
        const node = document.querySelector(`[data-canonical-content-node-id="${id}"]`).firstChild
        return node.textContent.split('\n').map((line, i, lines) => {
          const offset = lines.slice(0, i).reduce((sum, value) => sum + value.length + 1, 0)
          const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 1)
          return range.getBoundingClientRect().y
        })
      }
      const bulletNode = document.querySelector('[data-canonical-content-node-id="bullets"]').firstChild
      const bulletXs = [...bulletNode.textContent.matchAll(/●/g)].map(match => {
        const range = document.createRange()
        range.setStart(bulletNode, match.index); range.setEnd(bulletNode, match.index + 1)
        return range.getBoundingClientRect().x
      })
      return {
        bodies: [...document.querySelectorAll('[data-test^="body-"]')].map(style),
        bullets: style(document.querySelector('[data-test="bullets"]')), bulletXs,
        notice: style(notice), noticeTop: getComputedStyle(notice).marginTop,
        noticeGap: notice.getBoundingClientRect().top - document.querySelector('[data-test="last-narrative"]').getBoundingClientRect().bottom,
        lines: [...notice.children].map(style),
        section: { margin: getComputedStyle(document.querySelector('section')).marginBottom, padding: getComputedStyle(document.querySelector('section')).paddingBottom },
        lineYs: lineYs('lines'), cellYs: lineYs('cell-lines'),
        subtitleBreak: getComputedStyle(document.querySelector('[data-canonical-reading-role="subtitle"]')).breakAfter,
      }
    })
    if (current) {
      for (const body of result.bodies) assert.deepEqual(body, { align: 'justify', last: 'auto', bottom: '0px', indent: '28px' }, surface)
      assert.equal(result.bullets.indent, '0px', `${surface}: source bullet lines are not prose`)
      assert(result.bulletXs.every(x => Math.abs(x - result.bulletXs[0]) < 0.1), `${surface}: bullet markers must share the same left edge`)
      assert.equal(result.notice.align, 'left'); assert.equal(result.notice.indent, '0px')
      assert.equal(result.noticeTop, '24px')
      assert.equal(result.noticeGap, 24, `${surface}: no extra wrapper gap`)
      assert(result.lines.every(line => line.indent === '0px'))
      if (surface === 'screen') {
        assert.equal(result.section.margin, '0px'); assert.equal(result.section.padding, '0px')
      }
      for (const ys of [result.lineYs, result.cellYs]) assert(ys.every((y, i) => i === 0 || y > ys[i - 1] + 10), `${surface}: semantic lines collapsed`)
      assert.equal(result.subtitleBreak, 'avoid')
    } else {
      assert.equal(result.bullets.indent, '28px', 'historical prose indentation remains unchanged')
      assert.equal(result.lineYs[0], result.lineYs[1], 'historical newline handling unchanged')
      if (surface === 'print') assert.equal(result.bodies[4].align, 'start', 'historical Print remains unchanged')
    }
  }

  for (const surface of ['screen', 'print']) {
    const css = surface === 'screen' ? readingCss + sharedCss + screenCss : printCss
    const tableClass = surface === 'screen' ? 'ps-canonical-reading-table' : 'canonical-reading-table'
    const measurements = []
    for (const current of [false, true]) {
      await page.setContent(`<!doctype html><style>${css}
        .table-fixture{width:612px;font:14px/24px "Times New Roman",serif}
        .table-fixture .short{display:inline-block}
        </style><section class="table-fixture" ${current ? marker : ''}>
        <table class="${tableClass}"><tbody>
        <tr><td><span class="short">25 €</span></td><td>${prose.repeat(3)}</td></tr>
        <tr><td rowspan="2">0 €</td><td data-canonical-cell-id="list"><span data-canonical-content-node-id="list">First category\nSecond category\nThird category</span></td></tr>
        <tr><td>Another category</td></tr><tr><td colspan="2">Merged source note</td></tr>
        </tbody></table></section>`)
      const result = await page.evaluate(() => {
        const table = document.querySelector('table')
        const cell = table.rows[0].cells[0]
        const short = cell.querySelector('.short')
        const rect = element => element.getBoundingClientRect()
        const s = getComputedStyle(cell)
        return {
          width: rect(table).width, height: rect(table).height,
          firstWidth: rect(cell).width, secondWidth: rect(table.rows[0].cells[1]).width,
          layout: getComputedStyle(table).tableLayout, vertical: s.verticalAlign,
          font: s.fontSize, baseline: s.lineHeight,
          centerDelta: Math.abs(rect(short).y + rect(short).height / 2 - rect(cell).y - rect(cell).height / 2),
          spans: [table.rows[1].cells[0].rowSpan, table.rows[3].cells[0].colSpan],
        }
      })
      assert.equal(result.layout, current ? 'auto' : 'fixed', surface)
      assert.equal(result.vertical, current ? 'middle' : 'top', surface)
      assert.deepEqual(result.spans, [2, 2], 'merged source cells remain intact')
      assert.equal(result.font, '14px', 'compact tables never shrink body type')
      assert.equal(result.baseline, '24px', 'compact tables preserve the baseline rhythm')
      assert(result.width <= 613, 'table must remain inside the paper column')
      if (current) {
        assert(result.firstWidth < result.secondWidth / 2, 'short labels must not consume half the table')
        assert(result.centerDelta < 1, 'short content must be geometrically centered in a tall row')
      }
      measurements.push(result)
    }
    assert(measurements[1].height < measurements[0].height, `${surface}: content-aware columns must remove wasted wrapping`)

    // A white-backed icon almost touching a collapsed row border erases the
    // horizontal rule in Chromium's PDF paint order. Exercise the image-sized
    // row, not a text-heavy row whose height would hide this regression.
    const whiteIcon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="56"><rect width="40" height="56" fill="white"/></svg>')}`
    const mediaClass = `${surface === 'screen' ? 'ps-' : ''}canonical-reading-table-media`
    for (const current of [false, true]) {
      await page.setContent(`<!doctype html><style>${css}
        .table-fixture{width:612px;font:14px/24px "Times New Roman",serif}
        </style><section class="table-fixture" ${current ? marker : ''}>
        <table class="${tableClass}"><tbody>
        ${['Bottle', 'Contacts', 'Clock'].map(label => `<tr><td><img class="${mediaClass}" src="${whiteIcon}" alt="" style="width:40px;height:56px"></td><td>${label}</td></tr>`).join('')}
        </tbody></table></section>`)
      const icons = await page.locator(`.${mediaClass}`).evaluateAll(images => images.map(img => {
        const row = img.closest('tr').getBoundingClientRect()
        const image = img.getBoundingClientRect()
        const style = getComputedStyle(img)
        return { top: image.top - row.top, bottom: row.bottom - image.bottom,
          marginTop: style.marginTop, marginBottom: style.marginBottom }
      }))
      if (current) {
        assert(icons.every(gap => gap.top > 2 && gap.bottom > 2),
          `${surface}: white table icons must clear both collapsed row borders: ${JSON.stringify(icons)}`)
      } else {
        assert(icons.every(icon => icon.marginTop === '0px' && icon.marginBottom === '0px'),
          `${surface}: frozen historical tables must not inherit new image spacing: ${JSON.stringify(icons)}`)
      }
    }
  }
} finally {
  await browser.close()
}

// Force each heading close to an A4 page bottom. This checks the actual paged
// engine, not a computed break-after value that may have no pagination effect.
try {
  const html = `<html><head><style>${sharedCss}
    @page{size:A4;margin:20mm} body{margin:0;font:14px/24px serif}
    p,h2{margin:0;font:inherit} .filler{height:930px}
    </style></head><body><div class="filler"></div>
    <h2 class="section-header" ${marker}>Section heading</h2>
    <p class="reading-meta-instruction" ${marker}>Section instruction</p>
    <section class="question-group" ${marker}><div class="passage">
    <p data-canonical-reading-role="subtitle">Passage subtitle</p>
    <p data-canonical-reading-role="body">${prose.repeat(4)}</p></div></section></body></html>`
  const result = await renderPaginatedPaper(html, { inspect: page => page.evaluate(() => {
    const selectors = ['.section-header', '.reading-meta-instruction', '[data-canonical-reading-role="subtitle"]', '[data-canonical-reading-role="body"]']
    return selectors.map(selector => [...document.querySelectorAll('.pagedjs_page')].findIndex(page => page.querySelector(selector)))
  }) })
  assert.equal(result.inspection[0], 1, 'page-bottom pressure must actually move the heading to page two')
  assert(result.inspection.every(index => index === result.inspection[0]), 'heading chain must stay with the first body lines')

  const writingHtml = `<html><head><style>
    @page{size:A4;margin:21mm} body{margin:0;font:14px/24px serif} p{margin:0}
    .prior{height:240mm;break-after:page}.prompt{height:205mm}
    .writing-answer-box{width:144mm;margin:4mm auto 0;break-inside:avoid;border:1px solid;box-sizing:border-box}
    .continuation{break-before:page}.material{height:180mm}
    </style></head><body>${Array.from({ length: 6 }, (_, i) => `<section class="prior" data-canonical-group-id="prior-${i}">Prior page ${i + 1}</section>`).join('')}
    <section data-canonical-group-id="application"><p class="prompt canonical-application-prompt">Application prompt remains on page seven</p><div class="writing-answer-box canonical-application-response" style="height:65mm">Given closing</div></section>
    <section class="continuation" data-canonical-group-id="continuation"><p class="material">Continuation material</p><div class="writing-answer-box canonical-continuation-response" style="height:57mm">Two starters remain unchanged</div></section>
    </body></html>`
  assert.equal((await renderPaginatedPaper(writingHtml)).pageCount, 9, 'uncompressed answer box must force the extra page')
  const fitted = await planFixedPagePdf(writingHtml, { targetPages: 8, render: renderPaginatedPaper })
  assert.equal(fitted.pageCount, 8)
  assert.ok(fitted.answerBoxHeightsMm.application >= 44 && fitted.answerBoxHeightsMm.application <= 46)
  assert.equal(fitted.answerBoxHeightsMm.continuation, undefined, 'do not shrink continuation when application alone fits')
  assert.deepEqual(fitted.inspection.find(group => group.id === 'application').pages, [7])
  assert.equal(fitted.inspection.find(group => group.id === 'application').applicationPromptPage, 7)
  assert.equal(fitted.inspection.find(group => group.id === 'application').applicationAnswerPage, 7)
  assert.deepEqual(fitted.inspection.find(group => group.id === 'continuation').pages, [8])
  const replay = await renderExplicitFixedPagePdf(writingHtml, {
    targetPages: 8, plannedBreakGroupIds: fitted.plannedBreakGroupIds,
    answerBoxHeightsMm: fitted.answerBoxHeightsMm, render: renderPaginatedPaper,
  })
  assert.equal(replay.pageCount, 8)
  assert.deepEqual(replay.inspection, fitted.inspection)
} finally {
  await closeChromiumPool()
}
console.log('PASS golden role layout: six prose roles, notice rhythm/indent, semantic paragraph/table lines, historical controls and actual paged heading chain')
