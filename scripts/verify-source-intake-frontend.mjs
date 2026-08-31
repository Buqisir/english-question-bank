#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const threadId = 'T-11111111-1111-4111-8111-111111111111'
const paperId = 'paper-synthetic-status-001'
let listRequestCount = 0
let inactiveOnly = false
let releaseBackgroundRefresh = null

function intake({ id, paperName, state, timestamp, ...detail }) {
  return {
    id,
    paperName,
    state,
    sources: [{
      platform: 'teacher_group',
      sourceName: '匿名英语教研群',
      sourceUrl: null,
    }],
    files: [{
      id: `file-${id}`,
      role: 'question_and_answers',
      extension: '.pdf',
      uploadedAt: timestamp,
    }],
    currentSubmission: {
      id: `submission-${id}`,
      revisionNumber: 1,
      updatedAt: timestamp,
    },
    claim: null,
    orbWorker: null,
    handedOffPaperId: null,
    lastNotification: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...detail,
  }
}

const inactiveIntakes = [
  intake({
    id: 'needs-owner',
    paperName: '匿名状态卷 E',
    state: 'needs_owner',
    timestamp: '2026-08-31T08:05:00.000Z',
  }),
  intake({
    id: 'handed-off',
    paperName: '匿名状态卷 F',
    state: 'handed_off',
    timestamp: '2026-08-31T08:06:00.000Z',
    handedOffPaperId: paperId,
  }),
]

const activeIntakes = [
  intake({
    id: 'notified',
    paperName: '匿名状态卷 A',
    state: 'queued',
    timestamp: '2026-08-31T08:00:00.000Z',
    lastNotification: { state: 'sent', createdAt: '2026-08-31T08:00:30.000Z' },
  }),
  intake({
    id: 'orb-created',
    paperName: '匿名状态卷 B',
    state: 'queued',
    timestamp: '2026-08-31T08:01:00.000Z',
    lastNotification: { state: 'sent', createdAt: '2026-08-31T08:01:15.000Z' },
    orbWorker: {
      state: 'bound',
      ampThreadId: threadId,
      updatedAt: '2026-08-31T08:01:30.000Z',
    },
  }),
  intake({
    id: 'claimed',
    paperName: '匿名状态卷 C',
    state: 'claimed',
    timestamp: '2026-08-31T08:02:00.000Z',
    claim: {
      ampThreadId: threadId,
      heartbeatAt: '2026-08-31T08:02:45.000Z',
    },
    orbWorker: {
      state: 'claimed',
      ampThreadId: threadId,
      updatedAt: '2026-08-31T08:02:30.000Z',
    },
  }),
  intake({
    id: 'notification-failed',
    paperName: '匿名状态卷 D',
    state: 'queued',
    timestamp: '2026-08-31T08:03:00.000Z',
    lastNotification: { state: 'failed', createdAt: '2026-08-31T08:03:30.000Z' },
  }),
  ...inactiveIntakes,
]

function json(response, status, body) {
  const bytes = Buffer.from(JSON.stringify(body))
  response.writeHead(status, {
    'content-length': bytes.byteLength,
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(bytes)
}

async function waitFor(check, message) {
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.fail(message)
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  const staticFile = {
    '/ops/': ['index.html', 'text/html; charset=utf-8'],
    '/ops/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/ops/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/ops/clipboard.js': ['clipboard.js', 'text/javascript; charset=utf-8'],
    '/ops/source-intakes.js': ['source-intakes.js', 'text/javascript; charset=utf-8'],
    '/ops/styles.css': ['styles.css', 'text/css; charset=utf-8'],
    '/ops/source-intakes.css': ['source-intakes.css', 'text/css; charset=utf-8'],
  }[url.pathname]
  if (staticFile) {
    const bytes = readFileSync(path.join(root, 'import-ops/public', staticFile[0]))
    response.writeHead(200, {
      'content-length': bytes.byteLength,
      'content-type': staticFile[1],
    })
    response.end(bytes)
    return
  }
  if (url.pathname === '/api/auth/me') {
    json(response, 200, {
      authRequired: true,
      user: { role: 'owner', accountKind: 'human', username: 'synthetic-owner' },
    })
    return
  }
  if (url.pathname === '/api/source-intakes') {
    listRequestCount += 1
    if (listRequestCount === 2) {
      await new Promise((resolve) => {
        releaseBackgroundRefresh = resolve
      })
    }
    json(response, 200, { intakes: inactiveOnly ? inactiveIntakes : activeIntakes })
    return
  }
  json(response, 404, { error: 'not found' })
})

let browser = null
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address === 'object')
  const origin = `http://127.0.0.1:${address.port}`
  const playwright = await import('../app/node_modules/playwright/index.js')
  browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.clock.install()
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(value) {
          window.__copiedSourceIntakeText = value
        },
      },
    })
  })
  await page.goto(`${origin}/ops/`)
  await page.getByRole('heading', { name: '题源台账' }).waitFor()

  for (const label of ['已通知 Amp', 'Orb 已创建', '正在导题', '通知失败', '需确认', '等待审核']) {
    assert.equal(
      await page.locator('.intake-status').getByText(label, { exact: true }).count(),
      1,
      `${label} is visible once as a workflow status`,
    )
  }
  const claimedRow = page.getByRole('row').filter({ hasText: '匿名状态卷 C' })
  const threadLink = claimedRow.getByRole('link', { name: '打开 Amp 线程' })
  assert.equal(await threadLink.getAttribute('href'), `https://ampcode.com/threads/${threadId}`)
  assert.equal(await threadLink.getAttribute('target'), '_blank')
  assert.match(await threadLink.getAttribute('rel'), /noreferrer/)
  assert.equal(await claimedRow.getByText('Orb 最近活动', { exact: true }).count(), 1)

  const screenshotDir = process.env.SOURCE_INTAKE_QA_SCREENSHOT_DIR
  if (screenshotDir) {
    mkdirSync(screenshotDir, { recursive: true })
    await page.screenshot({
      fullPage: true,
      path: path.join(screenshotDir, 'source-intake-status-desktop.png'),
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.ledger-scroll').evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await page.screenshot({
      fullPage: true,
      path: path.join(screenshotDir, 'source-intake-status-mobile-actions.png'),
    })
    await page.setViewportSize({ width: 1440, height: 1000 })
  }

  const handedOffRow = page.getByRole('row').filter({ hasText: '匿名状态卷 F' })
  await handedOffRow.getByRole('button', { name: '复制 Paper ID' }).click()
  await page.waitForFunction((expected) => window.__copiedSourceIntakeText === expected, paperId)
  await page.clock.runFor(20)
  assert.equal(await page.getByRole('status').textContent(), 'Paper ID已复制')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    document.execCommand = (command) => {
      if (command !== 'copy') return false
      window.__copiedSourceIntakeText = document.querySelector('textarea')?.value
      return true
    }
  })
  await handedOffRow.getByRole('button', { name: '复制继续口令' }).click()
  await page.waitForFunction(
    (expected) => window.__copiedSourceIntakeText === expected,
    `继续 ${paperId}，处理线上审核反馈`,
  )
  await page.evaluate(() => document.activeElement?.blur())

  inactiveOnly = true
  await page.clock.fastForward(15_100)
  await waitFor(() => listRequestCount === 2, 'active ledger schedules a background refresh')
  assert.equal(await page.locator('.ledger-loading').count(), 0, 'background refresh keeps rows visible')
  assert.equal(await page.getByRole('row').filter({ hasText: '匿名状态卷 C' }).count(), 1)
  releaseBackgroundRefresh()
  await page.getByText('显示 2 条 · 共 2 条题源', { exact: true }).waitFor()
  await page.clock.fastForward(45_000)
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(listRequestCount, 2, 'ledger stops polling when no active intake remains')

  console.log('PASS source intake frontend statuses, Amp thread link, copy controls, and active-only refresh')
} finally {
  if (browser) await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
