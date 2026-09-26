import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from '../app/node_modules/playwright/index.mjs'
import { consumerContractRefs, resolveConsumerPresentation } from '../shared/paper-canonical/consumers.mjs'
import { canonicalAuthorityRef, nck1MaterializationCandidateAuthorityRef } from '../shared/paper-canonical/authority.mjs'
import { listeningOpening } from '../shared/paper-canonical/listeningPresentation.mjs'

assert.equal(canonicalAuthorityRef.manifestVersion, '36')
assert.equal(nck1MaterializationCandidateAuthorityRef.manifestVersion, '57')
for (const ref of Object.values(consumerContractRefs)) {
  assert.equal(resolveConsumerPresentation(ref).policy.version, '3')
}
const sharedCss = readFileSync('shared/papersurface/paperLayout.css', 'utf8')
const screenCss = readFileSync('app/src/features/paper-browse/paperBrowsePage.css', 'utf8')
  .replace(/^@import[^;]+;/gm, '')
const cover = `<header class="canonical-paper-opening"><h1 class="canonical-paper-cover-title">英 语</h1>
  <div class="canonical-paper-cover-notices"><strong>注意事项：</strong><ol>${listeningOpening.notices.map(text => `<li>${text}</li>`).join('')}</ol></div></header>`
// Synthetic CSS fixtures only: these do not invoke React, the print producer, or PDF output.
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  for (const surface of ['screen', 'student-print', 'teacher-print']) {
    const screen = surface === 'screen'
    const prefix = screen ? 'ps' : 'canonical'
    await page.setContent(`<style>${sharedCss}${screen ? screenCss : ''}
      body{margin:0;font-size:16px} .paper-browse-content{--ps-font-size:14px;--ps-font-stack:serif;--ps-font-stack-heading:serif}
      .paper-print{font-family:serif;font-size:10.5pt;width:612px;margin:0 91px}
      </style><div class="${screen ? 'paper-browse-page paper-browse-page--review' : 'paper-print'}">
      ${screen ? '<div class="paper-browse-shell"><nav class="paper-browse-rail"></nav><div class="paper-browse-content"><div class="paper-browse-zoom">' : ''}
      ${cover}<header class="${prefix}-listening-chrome"><h2 class="${prefix}-listening-part">第一部分 听力</h2>
      <p class="canonical-listening-transfer-notice">${listeningOpening.transferNotice}</p>
      <h3 class="${prefix}-listening-section">第一节（共5小题）</h3></header>
      ${screen ? '<section><h3 class="pi-writing-section">第一节</h3><div class="pi-writing-passage">Application</div></section><section><h3 class="pi-writing-section">第二节</h3><p class="pi-writing-instruction">Continuation</p></section>' : ''}
      ${screen ? '</div></div></div>' : ''}</div>`)
    const measured = await page.evaluate((prefix) => {
      const css = selector => getComputedStyle(document.querySelector(selector))
      const list = document.querySelectorAll('.canonical-paper-cover-notices li')
      // Use actual glyph geometry to catch a hanging list indent, not just CSS declarations.
      const lines = []
      const node = list[1].firstChild
      for (let i = 0; i < node.textContent.length; i++) {
        const range = document.createRange()
        range.setStart(node, i); range.setEnd(node, i + 1)
        const rect = range.getBoundingClientRect()
        if (!lines.some(line => Math.abs(line.y - rect.y) < 1)) lines.push({ x: rect.x, y: rect.y })
      }
      return {
        size: css('.canonical-paper-cover-notices').fontSize,
        labelWeight: css('.canonical-paper-cover-notices strong').fontWeight,
        noticeWeights: [...list].map(li => getComputedStyle(li).fontWeight),
        indents: [...list].map(li => getComputedStyle(li).textIndent),
        lineHeight: css('.canonical-paper-cover-notices').lineHeight,
        sectionWeight: css(`.${prefix}-listening-section`).fontWeight,
        transferIndent: css('.canonical-listening-transfer-notice').textIndent,
        coverTop: css('.canonical-paper-opening').paddingTop,
        labelX: document.querySelector('.canonical-paper-cover-notices strong').getBoundingClientRect().x,
        lines,
        width: document.querySelector('.paper-browse-zoom')?.getBoundingClientRect().width,
        titleSize: css('.canonical-paper-cover-title').fontSize,
      }
    }, prefix)
    assert.equal(measured.size, '14px', surface)
    assert.equal(measured.labelWeight, '700', surface)
    assert.deepEqual(measured.noticeWeights, ['400', '400', '400'], surface)
    assert.deepEqual(measured.indents, ['28px', '28px', '28px'], surface)
    assert.equal(measured.lineHeight, '24px', surface)
    assert.equal(measured.sectionWeight, '400', surface)
    assert.equal(measured.transferIndent, '28px', surface)
    assert.equal(measured.coverTop, '0px', surface)
    assert(Math.abs(parseFloat(measured.titleSize) - 26.6667) < 0.01, surface)
    assert(measured.lines.length >= 3, 'long notice must exercise continuation lines')
    assert(measured.lines[0].x > measured.labelX + 28, 'first text follows the indented number')
    for (const line of measured.lines.slice(1)) assert(Math.abs(line.x - measured.labelX) < 0.5, `${surface}: continuation aligns with label`)
    if (screen) {
      const cutLines = () => page.locator('.pi-writing-section + *').evaluateAll(
        nodes => nodes.map(node => getComputedStyle(node, '::before').display),
      )
      assert.deepEqual(await cutLines(), ['none', 'none'], 'Review hides both writing selection lines')
      await page.locator('.paper-browse-page').evaluate(node => node.classList.remove('paper-browse-page--review'))
      assert.deepEqual(await cutLines(), ['block', 'block'], 'normal question selection retains both writing lines')
      await page.locator('.paper-browse-page').evaluate(node => node.classList.add('paper-browse-page--review'))
      assert.equal(measured.width, 794, '1280px viewport must not squeeze A4 proof width')
      for (const width of [1439, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 })
        assert.equal(await page.locator('.paper-browse-zoom').evaluate(node => node.getBoundingClientRect().width),
          794, `paper width on either side of docking breakpoint: ${width}`)
      }
      await page.setViewportSize({ width: 1280, height: 900 })
    }
  }
  console.log('PASS v56 synthetic cover CSS fixtures: 14px roles, 2em first lines, flush continuations, 794px width, unchanged 20pt title; actual Screen/Print/PDF verification is separate')
} finally {
  await browser.close()
}
