import assert from 'node:assert/strict'
import './lib/reviewTestLockRoot.mjs'
import { readFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from '../app/node_modules/playwright/index.mjs'
import { productPdfBytes } from '../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'

// Owner no longer embeds pagination UI in OPS. PDF selection lives on the real
// Screen; this fixture guards the compact list, exact links and action states.
const root = path.resolve(import.meta.dirname, '..')
const artifactDir = process.env.EQB_OWNER_REVIEW_ARTIFACT_DIR || path.join(root, '.amp/in/artifacts/owner-review')
const paperId = 'paper-owner-review-fixture'
const revisionId = 'revision-owner-review-fixture'
const initial = {
  paperId, paperName: '2026 年高三英语模拟卷（交互演示）', latestRevisionId: revisionId,
  revisionNumber: 2, state: 'awaiting_review', reviewKind: 'candidate',
  bundleDigest: `sha256:${'a'.repeat(64)}`, rendererBuildId: 'fixture-renderer',
  rendererStale: false, unresolvedCount: 0, promotionState: null,
  compatibility: { result: 'equal', pending: false, reasonCode: 'CONTENT_EQUAL' },
}
let paper = { ...initial }
let issues = []
let publishCount = 0
let capturedIssue
let failList = false
let dropPublishResponse = false
let releasePublish
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
  if (url.pathname.endsWith('/review-state')) return send(response, { paperId, latestRevisionId: paper.latestRevisionId, issues, discussionThreadId: null })
  if (request.method === 'POST' || request.method === 'PATCH') {
    let body = ''
    for await (const chunk of request) body += chunk
    const input = JSON.parse(body)
    assert.equal(request.headers['x-eqb-csrf'], 'owner-review')
    if (url.pathname.endsWith('/publish')) {
      assert.equal(paper.compatibility.result, 'equal')
      assert.equal(input.intent, 'publish')
      assert.equal(input.bundleDigest, initial.bundleDigest)
      assert.equal(input.rendererBuildId, initial.rendererBuildId)
      assert(url.pathname.includes(`/revisions/${revisionId}/`))
      publishCount += 1
      paper.promotionState = 'publishing'
      if (dropPublishResponse) { response.destroy(); return }
      if (!process.argv.includes('--serve')) await new Promise(resolve => { releasePublish = resolve })
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
  if (url.pathname === '/') return send(response,
    `<!doctype html><meta charset="utf-8"><h1>Screen 链接目标（接口夹具）</h1>
    <p>只验证精确路由，不冒充真实卷面。</p>
    <a href="${pdfUrl}?edition=economy8" target="_blank">查看冻结 PDF</a>
    <a href="${pdfUrl}?edition=economy8&download=1" download>下载冻结 PDF</a>`, 'text/html')
  send(response, { error: 'Fixture route missing' }, 'application/json', 404)
})
await new Promise(resolve => server.listen(process.argv.includes('--serve') ? 5199 : 0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
if (process.argv.includes('--serve')) {
  console.log(`Owner review UI fixture (no real publication) at ${origin}/ops/`)
  process.once('SIGTERM', () => server.close(() => process.exit(0)))
} else {
  let browser
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      window.ownerPublishFetches = 0
      const fetch = window.fetch.bind(window)
      window.fetch = (input, init) => {
        if (String(input).endsWith('/publish') && init?.method === 'POST') window.ownerPublishFetches += 1
        return fetch(input, init)
      }
    })
    await page.goto(`${origin}/ops/`)
    const row = page.locator(`[data-review-paper="${paperId}"]`)
    const publish = row.getByRole('button', { name: '发布到题库', exact: true })
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
    assert.equal(await publish.isDisabled(), true)
    issues[0].state = 'fixed_pending_review'
    await row.getByRole('button', { name: '查看反馈' }).click()
    await page.getByRole('button', { name: '确认已解决' }).click()
    await page.getByRole('status').filter({ hasText: '反馈已更新' }).waitFor()
    assert.equal(await publish.isEnabled(), true)
    await publish.click()
    await page.getByText('正在发布，请勿重复提交…', { exact: true }).waitFor()
    assert.equal(await publish.isDisabled(), true)
    await page.screenshot({ path: path.join(artifactDir, 'publishing.png') })
    releasePublish()
    await row.getByText('已发布', { exact: true }).waitFor()
    assert.equal(publishCount, 1)
    assert.equal(await publish.count(), 0)
    assert.equal(await row.getByRole('link', { name: '查看已发布' }).count(), 1)
    await page.screenshot({ path: path.join(artifactDir, 'published.png') })
    const messages = {
      pending: '正在核验预览版本…', equal: '',
      backfill_pending: '正在核验预览版本…',
      different: '预览内容有变化，请在 Droid 中核验后重新送审',
      unknown: '无法核验原预览版本，请在 Droid 中核验后重新送审（缺少原预览记录）',
    }
    for (const result of ['pending', 'equal', 'different', 'unknown', 'backfill_pending']) {
      const backfillPending = result === 'backfill_pending'
      paper = { ...initial, state: 'approved', rendererStale: result === 'equal',
        compatibility: { result: backfillPending ? 'unknown' : result, pending: result === 'pending',
          reasonCode: backfillPending ? 'BACKFILL_PENDING' : 'MISSING_BASELINE' } }
      await page.reload()
      await row.getByText('已批准', { exact: true }).waitFor()
      assert.equal(await publish.isEnabled(), result === 'equal')
      if (messages[result]) await row.getByText(messages[result], { exact: true }).waitFor()
      else assert.equal(await row.locator('.owner-review-hint').count(), 0)
      if (backfillPending) assert.equal(await row.getByText(/重新送审/).count(), 0,
        'backfill pending shows verification in progress without asking for resubmission')
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
    assert.equal(publishCount, 1, 'blocked compatibility states never issue a publication')
    paper = { ...initial, compatibility: undefined }
    await page.reload()
    await row.waitFor()
    assert.equal(await publish.isDisabled(), true, 'missing compatibility never falls back to rendererStale')
    paper = { ...initial }
    dropPublishResponse = true
    await page.reload()
    await publish.click()
    await page.getByRole('alert').waitFor()
    assert.equal(await publish.isDisabled(), true)
    await page.getByRole('button', { name: '刷新状态' }).click()
    await row.getByText('发布中', { exact: true }).waitFor()
    assert.equal(await publish.isDisabled(), true)
    // Chromium can retry a closed socket below fetch. Count application calls;
    // the real publisher's duplicate-request guard is covered by its route tests.
    assert.equal(await page.evaluate(() => window.ownerPublishFetches), 1,
      'lost response and status refresh never cause an application-level publish retry')
    paper.promotionState = 'failed'
    await page.getByRole('button', { name: '刷新状态' }).click()
    await row.getByText('发布失败', { exact: true }).waitFor()
    assert.equal(await publish.isDisabled(), true)
    await page.screenshot({ path: path.join(artifactDir, 'failed.png') })
    failList = true
    await page.getByRole('button', { name: '刷新状态' }).click()
    await page.getByRole('alert').filter({ hasText: '状态读取失败' }).waitFor()
    assert.equal(await publish.isDisabled(), true)
    failList = false
    paper = { ...initial }
    await page.reload()
    await row.waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: path.join(artifactDir, 'mobile.png') })
    assert.deepEqual(errors, [])
    console.log('PASS compact Owner list: four compatibility states and unknown/BACKFILL_PENDING preserve approval and frozen PDF downloads; backfill waits without resubmission or publication; exact Screen link, return/fix, publish, failed, response-loss and mobile states')
  } finally {
    releasePublish?.()
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
}
