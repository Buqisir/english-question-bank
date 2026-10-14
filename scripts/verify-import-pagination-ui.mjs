import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { chromium } from '../app/node_modules/playwright/index.mjs'

// Owner no longer embeds pagination UI in OPS. PDF selection lives on the real
// Screen; this fixture guards the compact list, exact links and action states.
const root = path.resolve(import.meta.dirname, '..')
const artifactDir = path.join(root, '.amp/in/artifacts/owner-review')
const paperId = 'paper-owner-review-fixture'
const revisionId = 'revision-owner-review-fixture'
const initial = {
  paperId, paperName: '2026 年高三英语模拟卷（交互演示）', latestRevisionId: revisionId,
  revisionNumber: 2, state: 'awaiting_review', reviewKind: 'candidate',
  bundleDigest: `sha256:${'a'.repeat(64)}`, rendererBuildId: 'fixture-renderer',
  rendererStale: false, unresolvedCount: 0, promotionState: null,
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
  if (url.pathname === '/') return send(response,
    '<!doctype html><meta charset="utf-8"><h1>Screen 链接目标（接口夹具）</h1><p>只验证精确路由，不冒充真实卷面。</p>', 'text/html')
  send(response, { error: 'Fixture route missing' }, 'application/json', 404)
})
await new Promise(resolve => server.listen(process.argv.includes('--serve') ? 5199 : 0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
if (process.argv.includes('--serve')) {
  console.log(`Owner review UI fixture (no real publication) at ${origin}/ops/`)
} else {
  let browser
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
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
    paper = { ...initial, rendererStale: true }
    await page.reload()
    await row.getByText('预览版本已过期，请在 Amp 重新送审。').waitFor()
    assert.equal(await publish.isDisabled(), true)
    paper = { ...initial }
    dropPublishResponse = true
    await page.reload()
    await publish.click()
    await page.getByRole('alert').waitFor()
    assert.equal(await publish.isDisabled(), true)
    await page.getByRole('button', { name: '刷新状态' }).click()
    await row.getByText('发布中', { exact: true }).waitFor()
    assert.equal(await publish.isDisabled(), true)
    assert.equal(publishCount, 2, 'lost response never automatically retries a write')
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
    console.log('PASS compact Owner list: exact Screen link, return/fix, publish, stale, failed, response-loss and mobile states')
  } finally {
    releasePublish?.()
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
}
