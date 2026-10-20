#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { publicPaperReviewDetail } from '../server/import-review/importReviewRoutes.mjs'
import { chromium } from '../app/node_modules/playwright/index.mjs'

const sourceDigest = `sha256:${'1'.repeat(64)}`
const candidateDigest = `sha256:${'2'.repeat(64)}`
const summaryDigest = `sha256:${'3'.repeat(64)}`
const publicProjection = {
  paperId: 'public-paper',
  importProfile: 'public-paper-v1',
  sourceDigest,
  candidateDigest,
  paragraphSummariesDigest: summaryDigest,
  materialization: { groups: [{
    groupId: 'group:reading-a',
    blocks: [{
      kind: 'paragraph', blockId: 'paragraph:reading-a:1',
      content: [{ kind: 'text', text: 'A source paragraph visible beside its summary.' }],
    }],
  }] },
  paragraphSummaries: {
    schemaVersion: 'paragraph-summaries-v1', paperId: 'public-paper', sourceDigest, candidateDigest,
    groups: [{ groupId: 'group:reading-a', paragraphs: [{
      paragraphId: 'paragraph:reading-a:1', summary: '这是一段与来源段落精确对应的摘要。',
    }] }],
  },
}
const baseDetail = {
  paperId: 'public-paper', paperName: '公开卷审核 fixture', latestRevisionId: 'revision-public',
  latest: { id: 'revision-public', revisionNumber: 1, state: 'awaiting_review', bundleDigest: summaryDigest },
  revisions: [], issues: [], issueMessages: [], files: [], visibleStructure: [], sourceVisuals: [],
  mediaDerivations: [], mediaConfirmations: [], promotion: null, rendererStale: false, unresolvedCount: 0,
  compatibility: { result: 'equal', pending: false, reasonCode: 'CONTENT_EQUAL' },
}
const projected = publicPaperReviewDetail({
  paperDetail: () => structuredClone(baseDetail),
  projectionForRevision: () => ({ revision: baseDetail.latest, projection: publicProjection }),
}, 'public-paper')
assert.equal(projected.importProfile, 'public-paper-v1')
assert.equal(projected.paragraphSummaries.groups[0].paragraphs[0].sourceText,
  'A source paragraph visible beside its summary.')
assert.deepEqual(projected.paragraphSummaryBinding, { sourceDigest, candidateDigest })

const oldDetail = { ...structuredClone(baseDetail), paperId: 'old-analyzed', paperName: '旧解析卷 fixture' }
const oldProjected = publicPaperReviewDetail({
  paperDetail: () => oldDetail,
  projectionForRevision: () => ({ revision: oldDetail.latest, projection: { importProfile: null } }),
}, 'old-analyzed')
assert.equal(oldProjected, oldDetail, 'old analyzed detail remains unchanged')

const publicDir = path.resolve(import.meta.dirname, '../import-ops/public')
const html = readFileSync(path.join(publicDir, 'index.html'))
const app = readFileSync(path.join(publicDir, 'app.js'))
const css = readFileSync(path.join(publicDir, 'styles.css'))
const clipboard = readFileSync(path.join(publicDir, 'clipboard.js'))
let mode = 'public'
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture')
  const send = (status, type, body) => { response.writeHead(status, { 'content-type': type }); response.end(body) }
  if (url.pathname === '/ops/' || url.pathname === '/ops/index.html') return send(200, 'text/html', html)
  if (url.pathname === '/ops/app.js') return send(200, 'text/javascript', app)
  if (url.pathname === '/ops/owner-review.js') return send(200, 'text/javascript', readFileSync(path.join(publicDir, 'owner-review.js')))
  if (url.pathname === '/ops/styles.css') return send(200, 'text/css', css)
  if (url.pathname === '/ops/clipboard.js') return send(200, 'text/javascript', clipboard)
  if (url.pathname === '/api/auth/me') return send(200, 'application/json', JSON.stringify({ authRequired: true, user: { username: 'fixture-owner', role: 'owner', accountKind: 'human' } }))
  if (url.pathname === '/api/import-reviews') return send(200, 'application/json', JSON.stringify({ papers: [{
    paperId: mode === 'public' ? 'public-paper' : 'old-analyzed',
    paperName: mode === 'public' ? baseDetail.paperName : oldDetail.paperName,
    latestRevisionId: 'revision-public', revisionNumber: 1, reviewKind: 'candidate',
    state: 'awaiting_review', bundleDigest: summaryDigest, rendererBuildId: 'fixture-renderer',
    rendererStale: false, unresolvedCount: 0, promotionState: null,
    compatibility: { result: 'equal', pending: false, reasonCode: 'CONTENT_EQUAL' },
  }] }))
  if (url.pathname.startsWith('/api/import-reviews/papers/')) return send(200, 'application/json', JSON.stringify(mode === 'public' ? projected : oldDetail))
  if (url.pathname.includes('/pagination')) return send(200, 'application/json', JSON.stringify({ editions: [] }))
  if (url.searchParams.get('view') === 'paper-browse') return send(200, 'text/html', '<p tabindex="-1" data-canonical-block-id="paragraph:reading-a:1">A source paragraph visible beside its summary.</p>')
  send(404, 'text/plain', 'not found')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const origin = `http://127.0.0.1:${server.address().port}`
  await page.goto(`${origin}/ops/?view=review`)
  await page.getByRole('link', { name: baseDetail.paperName }).waitFor()
  assert.equal(await page.getByRole('heading', { name: '逐段摘要' }).count(), 0)
  assert.equal(await page.locator('.paragraph-summaries-section').count(), 0)
  assert.equal(await page.locator('iframe, [role="tab"], .approval-check').count(), 0)
  assert.equal(await page.getByRole('button', { name: '发布到题库' }).isEnabled(), true)
  assert.match(await page.getByRole('link', { name: baseDetail.paperName }).getAttribute('href'), /reviewRevision=revision-public/)
  if (process.env.EQB_REVIEW_SCREENSHOT) await page.screenshot({ path: process.env.EQB_REVIEW_SCREENSHOT, fullPage: true })

  mode = 'old'
  await page.reload()
  await page.getByRole('link', { name: '旧解析卷 fixture' }).waitFor()
  assert.equal(await page.getByRole('heading', { name: '逐段摘要' }).count(), 0)
  assert.equal(await page.locator('iframe, [role="tab"], .approval-check').count(), 0)
  assert.equal(await page.getByRole('button', { name: '发布到题库' }).isEnabled(), true)
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}

console.log('PASS public-paper summary bindings remain internal; both profiles use direct Screen links and Owner publication without embedded review panels')
