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
}
let hasListening = true
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
    await page.getByRole('tab', { name: 'PDF', exact: true }).click()
    assert.equal(await page.getByLabel('交付版式').inputValue(), 'friendly10')
    assert.match(await page.locator('#review-frame').getAttribute('src'), /version=student&pageLayout=friendly10$/)
    await page.getByLabel('交付版式').selectOption('friendly8')
    assert.match(await page.locator('#review-frame').getAttribute('src'), /version=student&pageLayout=friendly8$/)
    assert.match(await page.locator('#issue-form .field-help').textContent(), /R2.*8 页无听力学生卷/)
    await page.getByLabel('页码', { exact: true }).fill('2')
    await page.getByLabel('要 Agent 改什么').fill('B 篇请在第 2 页完整呈现，避免跨面。')
    await page.getByRole('button', { name: '记录这个问题', exact: true }).click()
    await page.locator('.issue-message').waitFor()
    assert.equal(capturedIssue.edition, 'friendly8')
    assert.equal(capturedIssue.revisionId, revisionId)
    assert.equal(capturedIssue.pageNumber, '2')
    assert.match(await page.locator('.issue-meta').textContent(), /8 页无听力学生卷/)
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
    await page.getByLabel('交付版式').selectOption('natural')
    assert.match(await page.locator('#review-frame').getAttribute('src'), /pdf\?version=teacher$/)
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
