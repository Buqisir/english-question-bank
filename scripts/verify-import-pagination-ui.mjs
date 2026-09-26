import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from '../app/node_modules/playwright/index.mjs'

const root = path.resolve(import.meta.dirname, '..')
const artifactDir = path.join(root, '.amp/in/artifacts/import-pagination-qa')
const paperId = 'paper-pagination-ui-fixture'
const revisionId = 'revision-pagination-ui-fixture'
const detail = {
  paperId, paperName: '分页审核交互测试卷', latestRevisionId: revisionId,
  latest: { id: revisionId, revisionNumber: 2, state: 'awaiting_review', reviewKind: 'candidate', bundleDigest: `sha256:${'a'.repeat(64)}` },
  revisions: [], issues: [], issueMessages: [], files: [], visibleStructure: [],
  sourceVisuals: [], mediaDerivations: [], mediaConfirmations: [], unresolvedCount: 0,
  importProfile: 'public-paper-v1',
  ocrCorrectionReport: { entries: [
    { category: 'ocr_misrecognition', sourceLocator: { documentId: '试题原卷', page: 2 },
      before: 'resrvation', after: 'reservation', reason: '测试示例：识别遗漏字母 e。' },
    { category: 'source_layout_error', sourceLocator: { documentId: '试题原卷', page: 3 },
      before: 'Tomorrowmorning.', after: 'Tomorrow morning.', reason: '测试示例：原题两词之间缺少空格。' },
  ] },
}
let hasListening = true
let hasProducts = false
let metadataFailure = false
let capturedIssue
const send = (response, body, type = 'application/json', status = 200) => {
  response.writeHead(status, { 'content-type': type })
  response.end(type === 'application/json' ? JSON.stringify(body) : body)
}
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  const file = new Map([
    ['/ops/', ['index.html', 'text/html']], ['/ops/app.js', ['app.js', 'text/javascript']],
    ['/ops/clipboard.js', ['clipboard.js', 'text/javascript']], ['/ops/styles.css', ['styles.css', 'text/css']],
  ]).get(url.pathname)
  if (file) return send(response, readFileSync(path.join(root, 'import-ops/public', file[0])), file[1])
  if (url.pathname === '/api/auth/me') return send(response, { authRequired: true, user: { id: 'qa', username: 'QA', role: 'owner' } })
  if (url.pathname === '/api/import-reviews') return send(response, { papers: [{ ...detail, revisionNumber: 2, state: 'awaiting_review' }] })
  if (url.pathname === `/api/import-reviews/papers/${paperId}`) return send(response, detail)
  if (url.pathname.endsWith('/pagination')) {
    if (metadataFailure) return send(response, { error: '测试：版式暂不可用' }, 'application/json', 503)
    return send(response, { editions: [
      ...(hasProducts ? [{ edition: 'largeNoListening', mode: 'bounded_auto' }, { edition: 'economy8', mode: 'explicit' },
        ...(hasListening ? [{ edition: 'largeComplete', mode: 'bounded_auto' }] : [])] : []),
      { edition: 'friendly8', mode: 'explicit' },
      ...(hasListening ? [{ edition: 'friendly10', mode: 'bounded_auto' }] : []),
    ] })
  }
  if (url.pathname.endsWith('/issues') && request.method === 'POST') {
    let body = ''
    for await (const chunk of request) body += chunk
    capturedIssue = JSON.parse(body)
    detail.issues = [{ ...capturedIssue, id: 'issue-qa', state: 'open', createdAt: '2026-09-10T00:00:00Z' }]
    return send(response, detail)
  }
  if (url.pathname === '/' || url.pathname.endsWith('/pdf')) {
    return send(response, '<!doctype html><html lang="zh"><body style="font:16px sans-serif;padding:24px">接口夹具：仅验证版式选择和反馈绑定。真实 PDF 由独立渲染测试验证。</body></html>', 'text/html')
  }
  send(response, { error: 'Fixture route missing' }, 'application/json', 404)
})
await new Promise((resolve) => server.listen(process.argv.includes('--serve') ? 5199 : 0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
if (process.argv.includes('--serve')) {
  console.log(`Pagination UI fixture ready at ${origin}/ops/?view=review`)
} else {
  let browser
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' })
    const page = await browser.newPage({ viewport: { width: 1920, height: 1000 }, deviceScaleFactor: 2 })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${origin}/ops/?view=review`)
    await page.locator('#review-frame:not(.is-loading)').waitFor()
    assert.deepEqual(await page.locator('[aria-label="审核表面"] [role="tab"]').allTextContents(), ['Screen', 'PDF'])
    assert.equal(await page.locator('[data-external-listening-check], .paragraph-summaries-section').count(), 0)
    const report = page.locator('details').filter({ has: page.locator(':scope > summary', { hasText: 'OCR 与原题校对报告' }) }).first()
    await report.locator('summary').first().click()
    assert.equal(await report.locator('.correction-list > li').count(), 2)
    assert.match(await report.textContent(), /resrvation.*reservation/s)
    mkdirSync(artifactDir, { recursive: true })
    await report.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifactDir, 'ops-correction-report.png') })
    await page.evaluate(() => {
      window.originalReviewFrame = document.querySelector('#review-frame')
      window.originalReviewDocument = window.originalReviewFrame.contentDocument
    })
    await page.getByRole('button', { name: '沉浸查看', exact: true }).click()
    assert.deepEqual(await page.locator('.surface-stage').evaluate((stage) => {
      const rect = stage.getBoundingClientRect()
      return [rect.x, rect.y, rect.width, rect.height]
    }), [0, 0, 1920, 1000])
    assert.equal(await page.locator('.right-rail').evaluate((rail) => rail.inert), true)
    assert.equal(await page.locator('#toggle-immersive').getAttribute('aria-pressed'), 'true')
    await page.evaluate(() => {
      document.querySelector('#review-frame').contentDocument.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    })
    assert.equal(await page.locator('#toggle-immersive').getAttribute('aria-pressed'), 'false')
    assert.equal(await page.locator('.right-rail').evaluate((rail) => rail.inert), false)
    assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-immersive')
    assert.equal(await page.evaluate(() =>
      window.originalReviewFrame === document.querySelector('#review-frame')
      && window.originalReviewDocument === document.querySelector('#review-frame').contentDocument), true,
    'enter/escape must preserve the iframe and its loaded document')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '沉浸查看', exact: true }).click()
    assert.equal(await page.locator('.surface-stage').evaluate((stage) =>
      stage.getBoundingClientRect().height), 844, 'mobile minimum stage height must not exceed the immersive viewport')
    assert.equal(await page.locator('#toggle-immersive').evaluate((button) => {
      const rect = button.getBoundingClientRect()
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
    }), true, 'immersive exit remains reachable on narrow screens')
    await page.getByRole('button', { name: '退出沉浸 · Esc', exact: true }).click()
    await page.setViewportSize({ width: 1920, height: 1000 })
    await page.getByRole('tab', { name: 'PDF', exact: true }).click()
    assert.equal(await page.getByLabel('交付版式').inputValue(), 'friendly10')
    assert.deepEqual(await page.locator('#pdf-edition option').allTextContents(), ['8 页版', '10 页版', '教师 PDF'])
    assert.match(await page.locator('#review-frame').getAttribute('src'), /version=student&pageLayout=friendly10$/)
    await page.getByLabel('交付版式').selectOption('friendly8')
    assert.match(await page.locator('#review-frame').getAttribute('src'), /version=student&pageLayout=friendly8$/)
    assert.match(await page.locator('#issue-form .field-help').textContent(), /R2.*8 页版/)
    await page.getByText('精确定位（可选）', { exact: true }).click()
    await page.getByLabel('页码', { exact: true }).fill('2')
    await page.getByLabel('要 Agent 改什么').fill('B 篇请在第 2 页完整呈现，避免跨面。')
    await page.getByRole('button', { name: '记录这个问题', exact: true }).click()
    await page.locator('.issue-message').waitFor()
    assert.equal(capturedIssue.edition, 'friendly8')
    assert.equal(capturedIssue.revisionId, revisionId)
    assert.equal(capturedIssue.pageNumber, '2')
    assert.match(await page.locator('.issue-meta').textContent(), /8 页版/)
    mkdirSync(artifactDir, { recursive: true })
    await page.getByLabel('交付版式').scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifactDir, 'review-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByLabel('交付版式').scrollIntoViewIfNeeded()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'narrow layout must not horizontally overflow')
    assert.equal(await page.getByRole('tab', { name: 'PDF', exact: true }).evaluate((button) =>
      button.getBoundingClientRect().right <= innerWidth), true, 'PDF tab must not be clipped after rerender')
    await page.screenshot({ path: path.join(artifactDir, 'review-narrow.png') })
    hasListening = false
    await page.reload()
    await page.getByRole('tab', { name: 'PDF', exact: true }).click()
    assert.equal(await page.getByLabel('交付版式').inputValue(), 'friendly8')
    assert.equal(await page.locator('#pdf-edition option[value="friendly10"]').count(), 0)
    hasProducts = true
    await page.reload()
    await page.getByRole('tab', { name: 'PDF', exact: true }).click()
    assert.equal(await page.getByLabel('交付版式').inputValue(), 'largeNoListening')
    await page.getByLabel('交付版式').selectOption('economy8')
    assert.match(await page.locator('#review-frame').getAttribute('src'), /pageLayout=economy8$/)
    assert.equal(await page.locator('#pdf-edition option[value="largeComplete"]').count(), 0)
    await page.screenshot({ path: path.join(artifactDir, 'review-products-narrow.png') })
    hasListening = true
    await page.reload()
    await page.getByRole('tab', { name: 'PDF', exact: true }).click()
    assert.equal(await page.getByLabel('交付版式').inputValue(), 'largeComplete')
    assert.match(await page.locator('#review-frame').getAttribute('src'), /pageLayout=largeComplete$/)
    await page.getByLabel('交付版式').selectOption('teacher')
    assert.match(await page.locator('#review-frame').getAttribute('src'), /pdf\?version=teacher&pageLayout=natural$/)
    metadataFailure = true
    await page.reload()
    await page.getByRole('tab', { name: 'PDF', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '不能代替定页 QA' }).waitFor()
    await page.setViewportSize({ width: 1920, height: 1000 })
    await page.screenshot({ path: path.join(artifactDir, 'review-unavailable.png') })
    assert.deepEqual(errors, [])
    console.log('PASS PDF8/10 exact student URLs, source edition availability, revision+edition+page feedback, natural compatibility, metadata failure and narrow layout')
  } finally {
    await browser?.close()
    await new Promise((resolve) => server.close(resolve))
  }
}
