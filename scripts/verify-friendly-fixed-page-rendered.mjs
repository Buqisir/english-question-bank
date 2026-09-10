import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '../app/node_modules/playwright/index.mjs'
import { planFixedPagePdf } from '../server/draft-paper/fixedPagePdfPlanner.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'

// Inputs are captured from the actual publication/browser verifier, not a mock
// PDF or manufactured page-count response. Keep intermediate HTML in .scratch.
const inputDir = process.argv[2]
if (!inputDir) throw new Error('Usage: node scripts/verify-friendly-fixed-page-rendered.mjs <LISTENING_QA_ARTIFACT_DIR>')
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const normalize = (text) => text.replace(/\s+/gu, '')
try {
  for (const [name, targetPages, expectedGroups] of [
    ['full-without-listening', 8, 9], ['full-listening', 10, 11],
  ]) {
    const html = readFileSync(path.join(inputDir, `${name}-input.html`), 'utf8')
    const sourcePage = await browser.newPage()
    await sourcePage.setContent(html)
    const expected = await sourcePage.locator('section[data-canonical-group-id]').evaluateAll((groups) =>
      groups.map((group) => [group.getAttribute('data-canonical-group-id'), group.textContent]))
    await sourcePage.close()
    assert.equal(expected.length, expectedGroups)
    const started = performance.now()
    const result = await planFixedPagePdf(html, {
      targetPages,
      render: (candidate, options) => renderPaginatedPaper(candidate, {
        inspect: async (page) => {
          const inspection = await options.inspect(page)
          const actual = await page.locator('.pagedjs_pages section[data-canonical-group-id]').evaluateAll((groups) => {
            const textById = new Map()
            for (const group of groups) {
              const id = group.getAttribute('data-canonical-group-id')
              textById.set(id, (textById.get(id) || '') + group.textContent)
            }
            return [...textById]
          })
          assert.deepEqual(actual.map(([id]) => id), expected.map(([id]) => id), 'all groups retain source order')
          assert.deepEqual(actual.map(([, text]) => normalize(text)), expected.map(([, text]) => normalize(text)), 'all group text retained')
          return inspection
        },
      }),
    })
    assert.equal(result.pageCount, targetPages)
    assert.equal(result.pdfBytes.subarray(0, 4).toString(), '%PDF')
    mkdirSync(inputDir, { recursive: true })
    writeFileSync(path.join(inputDir, `${name}-${targetPages}.pdf`), result.pdfBytes)
    console.log(`PASS ${name}: ${targetPages} actual PDF pages, ${expectedGroups} groups, all text retained, ${result.searchedCandidates} renders, ${Math.round(performance.now() - started)}ms`)
  }
} finally {
  await browser.close()
  await closeChromiumPool()
}
