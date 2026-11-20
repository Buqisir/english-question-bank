import assert from 'node:assert/strict'
import './lib/reviewTestLockRoot.mjs'
import { readFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from '../app/node_modules/playwright/index.mjs'
import { createServer as createViteServer } from '../app/node_modules/vite/dist/node/index.js'
import { productPdfBytes } from '../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'

// The legacy list links to the real review workspace for publication.
const root = path.resolve(import.meta.dirname, '..')
const appRoot = path.join(root, 'app')
const appHtml = readFileSync(path.join(appRoot, 'index.html'), 'utf8')
const artifactDir = process.env.EQB_OWNER_REVIEW_ARTIFACT_DIR || path.join(root, '.amp/in/artifacts/owner-review')
const paperId = 'paper-owner-review-fixture'
const revisionId = 'revision-owner-review-fixture'
const reviewPath = `/api/import-reviews/papers/${paperId}/revisions/${revisionId}`
const publishPath = `${reviewPath}/publish`
const previewPath = `/api/import-review-preview/revisions/${revisionId}`
const publicationUrl = `/?${new URLSearchParams({ view: 'ops-review', paper: paperId, rev: revisionId })}`
const initial = {
  paperId, paperName: '2026 年高三英语模拟卷（交互演示）', latestRevisionId: revisionId,
  revisionNumber: 2, state: 'awaiting_review', reviewKind: 'candidate',
  bundleDigest: `sha256:${'a'.repeat(64)}`, rendererBuildId: 'fixture-renderer',
  rendererStale: false, unresolvedCount: 0, promotionState: null,
  compatibility: { result: 'equal', pending: false, reasonCode: 'CONTENT_EQUAL' },
}
const previewAsset = {
  schemaVersion: 'paper-asset-v1',
  paper: { paperId, title: initial.paperName, assetVersion: 1 },
  content: { blocks: [], groups: {}, questions: {} },
  answerKey: { answers: {} },
}
let paper = { ...initial }
let issues = []
let publishCount = 0
let publishOutcome
let capturedIssue
let failList = false
const send = (response, body, type = 'application/json', status = 200) => {
  response.writeHead(status, { 'content-type': type })
  response.end(type === 'application/json' ? JSON.stringify(body) : body)
}
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  if (process.argv.includes('--serve') && url.pathname === '/ops/' && url.searchParams.has('compatibility')) {
    const result = url.searchParams.get('compatibility')
    assert(['pending', 'equal', 'different', 'unknown'].includes(result))
    paper = { ...initial, state: 'approved', rendererStale: result === 'equal',
      compatibility: { result, pending: result === 'pending', reasonCode: result === 'unknown' ? 'MISSING_BASELINE' : undefined } }
  }
  const file = new Map([
    ['/ops/', ['index.html', 'text/html']], ['/ops/app.js', ['app.js', 'text/javascript']],
    ['/ops/owner-review.js', ['owner-review.js', 'text/javascript']],
    ['/ops/clipboard.js', ['clipboard.js', 'text/javascript']], ['/ops/styles.css', ['styles.css', 'text/css']],
    ['/ops/source-intakes.css', ['source-intakes.css', 'text/css']],
  ]).get(url.pathname)
  if (file) return send(response, readFileSync(path.join(root, 'import-ops/public', file[0])), file[1])
  if (url.pathname === '/api/auth/me') return send(response, { authRequired: true, user: { username: '演示账号', role: 'owner' } })
  if (url.pathname === '/api/import-reviews') return failList
    ? send(response, { error: '演示网络中断' }, 'application/json', 503)
    : send(response, { papers: [paper] })
  if (url.pathname === `${reviewPath}/answer-corrections`) return send(response, { corrections: [], listeningEdits: [{
    segmentId: 'listening-text-7', start: 10, before: '', after: 'The room was quieter.',
    startSeconds: 20.1, endSeconds: 21.25, evidence: { apple: 'The room was quieter.', 'parakeet-v2': 'The room was quieter.' },
    reason: '两个引擎转写一致。',
  }] })
  if (url.pathname === `${previewPath}/consumption`) {
    return send(response, { disposition: 'ready', paperId, sourceAssetVersion: 1, selections: [] })
  }
  if (url.pathname === `${previewPath}/asset/paper-asset.json`) return send(response, previewAsset)
  if (url.pathname.endsWith('/review-state')) return send(response, { paperId, latestRevisionId: paper.latestRevisionId, issues, discussionThreadId: null })
  if (request.method === 'POST' || request.method === 'PATCH') {
    let body = ''
    for await (const chunk of request) body += chunk
    const input = JSON.parse(body)
    assert.equal(request.headers['x-eqb-csrf'], 'owner-review')
    if (url.pathname === publishPath) {
      assert.deepEqual(input, { intent: 'publish', bundleDigest: initial.bundleDigest, rendererBuildId: initial.rendererBuildId })
      publishCount += 1
      if (publishOutcome === 'different' || publishOutcome === 'unknown') {
        const different = publishOutcome === 'different'
        return send(response, {
          code: 'IMPORT_REVIEW_PUBLICATION_COMPATIBILITY_REJECTED',
          error: different ? '预览内容有变化，未发布。' : '本次核验未完成，未发布。请稍后重试。',
          retryable: !different,
          compatibility: { result: publishOutcome, differences: different
            ? ['/consumer/paperAsset/content/questions/question~1a/stem'] : [] },
        }, 'application/json', different ? 409 : 503)
      }
      if (publishOutcome === 'lost') {
        paper.promotionState = 'publishing'
        // The server accepted the write, but the browser loses the receipt mid-response.
        response.writeHead(200, { 'content-type': 'application/json', 'content-length': 100 })
        return response.write('{"status":', () => response.destroy())
      }
      paper.promotionState = 'published'
      return send(response, { status: 'published' })
    }
    if (url.pathname.endsWith('/issues')) {
      capturedIssue = input
      issues = [{ ...input, id: 'issue-demo', state: 'open' }]
      paper.state = 'changes_requested'
      paper.unresolvedCount = 1
      return send(response, { issues })
    }
    if (url.pathname.endsWith('/issues/issue-demo')) {
      assert.equal(input.revisionId, paper.latestRevisionId)
      issues[0].state = input.action === 'close' ? 'closed' : 'dismissed'
      paper.unresolvedCount = 0
      return send(response, { issues })
    }
  }
  const pdfUrl = `/api/import-review-preview/revisions/${revisionId}/pdf`
  if (url.pathname === pdfUrl) {
    if (url.searchParams.has('download')) response.setHeader('content-disposition', 'attachment; filename="frozen-review.pdf"')
    return send(response, productPdfBytes(1, 'economy8'), 'application/pdf')
  }
  if (url.pathname === '/' && url.searchParams.get('view') === 'ops-review') {
    return send(response, await vite.transformIndexHtml(request.url, appHtml), 'text/html')
  }
  if (url.pathname === '/') return send(response,
    `<!doctype html><meta charset="utf-8"><h1>Screen 链接目标（接口夹具）</h1>
    <p>只验证精确路由，不冒充真实卷面。</p>
    <a href="${pdfUrl}?edition=economy8" target="_blank">查看冻结 PDF</a>
    <a href="${pdfUrl}?edition=economy8&download=1" download>下载冻结 PDF</a>`, 'text/html')
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/paper-assets/')) {
    return send(response, { error: 'Fixture route missing' }, 'application/json', 404)
  }
  vite.middlewares(request, response, () => send(response, { error: 'Fixture route missing' }, 'application/json', 404))
})
const vite = await createViteServer({ root: appRoot, appType: 'custom',
  server: { middlewareMode: true, hmr: { server } }, logLevel: 'error' })
await new Promise(resolve => server.listen(process.argv.includes('--serve') ? 5199 : 0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
if (process.argv.includes('--serve')) {
  console.log(`Owner review UI fixture (no real publication) at ${origin}/ops/`)
  process.once('SIGTERM', () => server.close(async () => { await vite.close(); process.exit(0) }))
} else {
  let browser
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${origin}/ops/`)
    const row = page.locator(`[data-review-paper="${paperId}"]`)
    const publish = row.getByRole('link', { name: '前往发布' })
    const publishDisabled = row.getByRole('button', { name: '前往发布' })
    await row.waitFor()
    assert.equal(await page.locator('iframe, [role="tab"], #approval-check').count(), 0)
    const [screen] = await Promise.all([
      page.waitForEvent('popup'), row.getByRole('link', { name: initial.paperName }).click(),
    ])
    await screen.waitForLoadState()
    const target = new URL(screen.url())
    assert.equal(target.searchParams.get('paperId'), paperId)
    assert.equal(target.searchParams.get('reviewRevision'), revisionId)
    await screen.close()
    mkdirSync(artifactDir, { recursive: true })
    await page.screenshot({ path: path.join(artifactDir, 'default.png') })
    assert.equal(await page.getByRole('button', { name: '核对候选图' }).count(), 0,
      'ordinary papers keep only publish and return actions')
    await row.getByRole('button', { name: '退回修改' }).click()
    await page.getByLabel('需要修改什么？').fill('仅针对旧版的草稿')
    await page.getByRole('button', { name: '刷新状态' }).click()
    await row.getByRole('button', { name: '退回修改' }).click()
    assert.equal(await page.getByLabel('需要修改什么？').inputValue(), '仅针对旧版的草稿')
    paper = { ...initial, latestRevisionId: 'revision-new', revisionNumber: 3,
      bundleDigest: `sha256:${'b'.repeat(64)}` }
    await page.getByRole('button', { name: '刷新状态' }).click()
    await page.getByRole('status').filter({ hasText: '旧版反馈草稿未带入新版' }).waitFor()
    await row.getByRole('button', { name: '退回修改' }).click()
    assert.equal(await page.getByLabel('需要修改什么？').inputValue(), '')
    await page.getByLabel('需要修改什么？').fill('查看新版后的反馈')
    await page.getByRole('button', { name: '提交退回' }).click()
    await row.getByText('待修改', { exact: true }).waitFor()
    assert.equal(capturedIssue.revisionId, 'revision-new')
    assert.equal(capturedIssue.bundleDigest, `sha256:${'b'.repeat(64)}`)
    assert.equal(capturedIssue.message, '查看新版后的反馈')
    paper = { ...initial }
    issues = []
    await page.reload()
    await row.getByRole('button', { name: '退回修改' }).click()
    await page.getByLabel('需要修改什么？').fill('第 3 题的选项被遮挡，请调整。')
    await page.screenshot({ path: path.join(artifactDir, 'return.png') })
    await page.getByRole('button', { name: '提交退回' }).click()
    await row.getByText('待修改', { exact: true }).waitFor()
    assert.equal(capturedIssue.surface, 'paper')
    assert.equal(capturedIssue.revisionId, revisionId)
    assert.equal(capturedIssue.bundleDigest, initial.bundleDigest)
    assert.equal(await publishDisabled.isDisabled(), true)
    issues[0].state = 'fixed_pending_review'
    await row.getByRole('button', { name: '查看反馈' }).click()
    await page.getByRole('button', { name: '确认已解决' }).click()
    await page.getByRole('status').filter({ hasText: '反馈已更新' }).waitFor()
    await Promise.all([page.waitForURL(`${origin}${publicationUrl}`), publish.click()])
    const listeningSummary = page.getByRole('region', { name: '听力原文更正' })
    await listeningSummary.getByText('listening-text-7 · 20.10–21.25 秒').waitFor()
    assert.ok(await listeningSummary.getByText('（缺文） → The room was quieter.').isVisible())
    assert.ok(await listeningSummary.getByText('apple：The room was quieter.').isVisible())
    assert.ok(await listeningSummary.getByText('parakeet-v2：The room was quieter.').isVisible())
    assert.equal(publishCount, 0)
    paper.promotionState = 'publishing'
    await page.goto(`${origin}/ops/`)
    await row.getByText('发布中', { exact: true }).waitFor()
    assert.equal(await publishDisabled.isDisabled(), true)
    await page.screenshot({ path: path.join(artifactDir, 'publishing.png') })
    paper.promotionState = 'published'
    await page.getByRole('button', { name: '刷新状态' }).click()
    await row.getByText('已发布', { exact: true }).waitFor()
    assert.equal(await publish.count(), 0)
    assert.equal(await row.getByRole('link', { name: '查看已发布' }).count(), 1)
    await page.screenshot({ path: path.join(artifactDir, 'published.png') })
    for (const result of ['pending', 'equal', 'different', 'unknown', 'backfill_pending']) {
      const backfillPending = result === 'backfill_pending'
      paper = { ...initial, state: 'approved', rendererStale: result === 'equal',
        compatibility: { result: backfillPending ? 'unknown' : result, pending: result === 'pending',
          reasonCode: backfillPending ? 'BACKFILL_PENDING' : 'MISSING_BASELINE' } }
      await page.reload()
      await row.getByText('已批准', { exact: true }).waitFor()
      assert.equal(await publish.getAttribute('href'), publicationUrl)
      const [frozenScreen] = await Promise.all([
        page.waitForEvent('popup'), row.getByRole('link', { name: initial.paperName }).click(),
      ])
      await frozenScreen.waitForLoadState()
      const [download] = await Promise.all([
        frozenScreen.waitForEvent('download'), frozenScreen.getByRole('link', { name: '下载冻结 PDF' }).click(),
      ])
      const downloadPath = path.join(artifactDir, `${result}-frozen.pdf`)
      await download.saveAs(downloadPath)
      assert.deepEqual(readFileSync(downloadPath), productPdfBytes(1, 'economy8'))
      await frozenScreen.close()
      await page.screenshot({ path: path.join(artifactDir, `${result}.png`) })
    }
    paper = { ...initial, compatibility: { result: 'unknown', reasonCode: 'MISSING_BASELINE',
      fallback: true, guard: 'legacy_renderer', eligible: true, legacyRendererStale: false } }
    await page.reload()
    assert.equal(await publish.getAttribute('href'), publicationUrl)
    assert.equal(await row.locator('.owner-review-hint').count(), 0)
    paper = { ...initial, compatibility: undefined }
    await page.reload()
    await row.waitFor()
    assert.equal(await publish.getAttribute('href'), publicationUrl)
    paper.promotionState = 'failed'
    await page.getByRole('button', { name: '刷新状态' }).click()
    await row.getByText('发布失败', { exact: true }).waitFor()
    assert.equal(await publishDisabled.isDisabled(), true)
    await page.screenshot({ path: path.join(artifactDir, 'failed.png') })
    failList = true
    await page.getByRole('button', { name: '刷新状态' }).click()
    await page.getByRole('alert').filter({ hasText: '状态读取失败' }).waitFor()
    assert.equal(await publishDisabled.isDisabled(), true)
    failList = false
    paper = { ...initial }
    await page.reload()
    await row.waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: path.join(artifactDir, 'mobile.png') })
    assert.deepEqual(errors, [])
    console.log('PASS compact Owner list: publication navigates to the exact revision; frozen PDF, feedback and mobile states remain intact')

    await page.setViewportSize({ width: 1440, height: 900 })
    const publishButton = page.getByRole('button', { name: '发布到题库', exact: true })
    const publishedLink = page.getByRole('link', { name: '查看已发布', exact: true })
    const isPublish = request => request.method() === 'POST' && new URL(request.url()).pathname === publishPath
    for (const [outcome, status, message] of [
      ['different', 409, '预览内容有变化，未发布。'],
      ['unknown', 503, '本次核验未完成，未发布。请稍后重试。'],
    ]) {
      paper = { ...initial }
      publishOutcome = outcome
      await page.goto(`${origin}${publicationUrl}`)
      const before = publishCount
      const [rejected] = await Promise.all([
        page.waitForResponse(response => isPublish(response.request())), publishButton.click(),
      ])
      assert.equal(rejected.status(), status)
      await page.getByRole('alert').filter({ hasText: message }).waitFor()
      assert.equal(await publishedLink.count(), 0)
      assert.equal(await publishButton.isEnabled(), true)
      assert.equal(publishCount, before + 1)

      publishOutcome = 'success'
      await publishButton.click()
      await publishedLink.waitFor()
      assert.equal(publishCount, before + 2)
    }

    paper = { ...initial }
    publishOutcome = 'lost'
    await page.goto(`${origin}${publicationUrl}`)
    const before = publishCount
    let browserPublishes = 0
    page.on('request', request => { if (isPublish(request)) browserPublishes += 1 })
    await publishButton.click()
    await page.getByRole('alert').filter({ hasText: '操作结果需核实' }).waitFor()
    assert.equal(await publishButton.isDisabled(), true)
    await page.getByRole('button', { name: '刷新状态' }).click()
    await page.getByText('服务器正在发布，请刷新查看状态。').waitFor()
    assert.equal(await publishButton.isDisabled(), true)
    await page.reload()
    await page.getByText('服务器正在发布，请刷新查看状态。').waitFor()
    assert.equal(browserPublishes, 1)
    assert.equal(publishCount, before + 1)
    assert.deepEqual(errors, [])
    console.log('PASS review workspace: 409 and 503 show rejection, an explicit retry publishes, and refreshing a lost response never resubmits')
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
    await vite.close()
  }
}
