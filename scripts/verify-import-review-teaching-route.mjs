#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { loadCompanionAnalysisSource } from '../server/exports/companionAnalysisRenderer.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import { runRoutes } from '../server/router/index.mjs'

const source = loadCompanionAnalysisSource({
  paperAssetsDir: new URL('../app/public/paper-assets', import.meta.url).pathname,
  paperId: 'paper-2025-i',
})
const fixture = structuredClone(source)
const sentinels = {
  reading: 'ROUTE_READING_COMPLETE',
  sevenChoices: 'ROUTE_SEVEN_COMPLETE',
  cloze: 'ROUTE_CLOZE_COMPLETE',
  grammarFill: 'ROUTE_GRAMMAR_COMPLETE',
  writing: 'ROUTE_WRITING_COMPLETE',
  listening: 'ROUTE_LISTENING_COMPLETE',
}
Object.values(fixture.analyses.reading.groups)[0].overview = sentinels.reading
Object.values(fixture.analyses.sevenChoices.groups)[0].overview = sentinels.sevenChoices
Object.values(fixture.analyses.cloze.groups)[0].overview = sentinels.cloze
Object.values(fixture.analyses.grammarFill.groups)[0].overview = sentinels.grammarFill
Object.values(fixture.analyses.writing.groups)[0].writing.modelAnswer = sentinels.writing

const listeningGroupId = 'group:synthetic:listening'
const listeningQuestionId = 'question:synthetic:listening:1'
fixture.paperAsset.content.groups[listeningGroupId] = {
  groupId: listeningGroupId,
  groupType: 'listening',
  title: '合成听力',
  questionIds: [listeningQuestionId],
}
fixture.paperAsset.content.questions[listeningQuestionId] = {
  id: listeningQuestionId,
  questionNo: 1,
  stem: 'Synthetic listening question',
  options: [{ label: 'A', text: 'Synthetic option' }],
}
fixture.paperAsset.answerKey.answers[listeningQuestionId] = { answer: 'A' }
fixture.paperAsset.layoutTree.parts[0].sections[0].groups.unshift({
  groupId: listeningGroupId,
  title: '合成听力',
})
fixture.analyses.listening = {
  materials: {
    synthetic: {
      segmentId: 'synthetic',
      questionIds: [listeningQuestionId],
      topic: { theme: '人与社会', themeGroup: '社会服务', subtopic: '预约安排' },
      summaryZh: sentinels.listening,
      transcript: 'Synthetic transcript with deliberately long representative teaching content.',
      translationZh: '这是一段明确标为自有合成数据的较长听力译文，用于审核页面集成测试。',
    },
  },
  questions: {
    [listeningQuestionId]: {
      officialAnswer: 'A',
      stemTranslationZh: '合成题干',
      optionTranslationsZh: { A: '合成选项', B: '干扰项乙', C: '干扰项丙' },
      evidence: { quote: 'deliberately long representative' },
      reasonZh: '原文直接给出安排。',
      distractors: [{ label: 'B', explanationZh: '时间不符。' }],
    },
  },
}

const sidecars = {
  'reading-choice-analysis-v1.json': fixture.analyses.reading,
  'seven-choices-analysis-v1.json': fixture.analyses.sevenChoices,
  'cloze-analysis-v1.json': fixture.analyses.cloze,
  'grammar-fill-analysis-v1.json': fixture.analyses.grammarFill,
  'writing-analysis-v1.json': fixture.analyses.writing,
  'listening-analysis-v1.json': fixture.analyses.listening,
}
const revisionId = 'revision-teaching-exact'
const routes = createImportReviewRoutes({
  getStore: () => ({
    projectionForRevision(id) {
      assert.equal(id, revisionId)
      return {
        revision: { id, reviewKind: 'candidate' },
        projection: {
          paperId: fixture.paperAsset.paper.paperId,
          reviewKind: 'candidate',
          paperAsset: fixture.paperAsset,
          analysisSidecars: sidecars,
        },
      }
    },
  }),
  buildPrintHtml() {},
})

async function invoke(session) {
  const capture = { status: 0, headers: {}, body: '' }
  const response = {
    writeHead(status, headers = {}) { capture.status = status; capture.headers = headers },
    end(body = '') { capture.body = String(body) },
  }
  const context = {
    session,
    sendJson(target, status, value) {
      target.writeHead(status, { 'content-type': 'application/json' })
      target.end(JSON.stringify(value))
    },
  }
  const pathname = `/api/import-reviews/papers/${fixture.paperAsset.paper.paperId}/revisions/${revisionId}/teaching`
  assert.equal(await runRoutes(routes, {
    request: { method: 'GET', headers: {} }, response, context, url: new URL(pathname, 'http://test'),
  }), true)
  return capture
}

const owner = await invoke({ role: 'owner', accountKind: 'human', username: 'owner' })
assert.equal(owner.status, 200)
assert.match(owner.headers['content-type'], /text\/html/u)
for (const sentinel of Object.values(sentinels)) assert.match(owner.body, new RegExp(sentinel, 'u'))
assert.match(owner.body, /完整范文|参考范文/u)
assert.match(owner.body, /听力原文/u)
assert.match(owner.body, /参考译文/u)
assert.match(owner.body, /干扰项辨析/u)

assert.equal((await invoke(null)).status, 403)
assert.equal((await invoke({ role: 'owner', accountKind: 'import_agent', username: 'agent' })).status, 403)

function candidateListRow() {
  return {
    paperId: detail.paperId,
    paperName: detail.paperName,
    latestRevisionId: revisionId,
    revisionNumber: 1,
    state: 'awaiting_review',
    reviewKind: 'candidate',
    bundleDigest: 'sha256:' + 'a'.repeat(64),
    rendererBuildId: 'teaching-route-renderer',
    rendererStale: false,
    promotionState: null,
    unresolvedCount: 0,
  }
}

const publicDir = new URL('../import-ops/public', import.meta.url).pathname
const detail = {
  paperId: fixture.paperAsset.paper.paperId,
  paperName: '自有合成全题型审核卷',
  latestRevisionId: revisionId,
  latest: { id: revisionId, revisionNumber: 1, reviewKind: 'candidate', state: 'awaiting_review', bundleDigest: 'synthetic-digest' },
  revisions: [{ id: revisionId, revisionNumber: 1, reviewKind: 'candidate', state: 'awaiting_review', bundleDigest: 'synthetic-digest' }],
  issues: [], issueMessages: [], files: [], visibleStructure: [], sourceVisuals: [],
  mediaDerivations: [], mediaConfirmations: [], listeningReview: null, promotion: null,
  rendererStale: false, unresolvedCount: 0,
}
const browserServer = createServer((request, response) => {
  const url = new URL(request.url, 'http://test')
  const json = (value) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
  if (url.pathname === '/api/auth/me') return json({ authRequired: true, user: { role: 'owner', accountKind: 'human', username: 'owner' } })
  if (url.pathname === '/api/import-reviews') return json({ papers: [
    candidateListRow(),
    { ...candidateListRow(), paperId: 'paper-teaching-ocr-only', paperName: 'OCR-only 不应进入审核列表', reviewKind: 'ocr' },
  ] })
  if (url.pathname === `/api/import-reviews/papers/${detail.paperId}`) return json(detail)
  if (url.pathname.endsWith('/pagination')) return json({ editions: [] })
  if (url.pathname.endsWith('/teaching')) { response.writeHead(owner.status, owner.headers); response.end(owner.body); return }
  if (url.pathname === '/ops/' || url.pathname === '/ops') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(readFileSync(path.join(publicDir, 'index.html'))); return }
  if (url.pathname.startsWith('/ops/')) {
    const file = path.join(publicDir, path.basename(url.pathname))
    const contentType = file.endsWith('.js') ? 'text/javascript' : 'text/css'
    response.writeHead(200, { 'content-type': contentType }); response.end(readFileSync(file)); return
  }
  response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><p>synthetic review screen</p>')
})
await new Promise((resolve, reject) => { browserServer.once('error', reject); browserServer.listen(0, '127.0.0.1', resolve) })
const address = browserServer.address()
assert(address && typeof address === 'object')
const playwright = await import('../app/node_modules/playwright/index.js')
const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`http://127.0.0.1:${address.port}/ops/`)
  await page.getByRole('heading', { name: '试卷审核' }).waitFor()
  assert.equal(await page.getByText('OCR-only 不应进入审核列表').count(), 0)
  assert.equal(await page.locator('#review-frame, [role="tab"]').count(), 0,
    'Owner review no longer embeds teaching in an iframe or tab')
  const paperLink = page.getByRole('link', { name: detail.paperName })
  const screenHref = new URL(await paperLink.getAttribute('href'), `http://127.0.0.1:${address.port}`)
  assert.equal(screenHref.searchParams.get('view'), 'paper-browse')
  assert.equal(screenHref.searchParams.get('paperId'), detail.paperId)
  assert.equal(screenHref.searchParams.get('reviewRevision'), revisionId)
  assert.equal(await paperLink.getAttribute('target'), '_blank')
  const teaching = await fetch(
    `http://127.0.0.1:${address.port}/api/import-reviews/papers/${detail.paperId}/revisions/${revisionId}/teaching`,
  )
  assert.equal(teaching.status, 200)
  assert.match(teaching.headers.get('content-type') || '', /text\/html/u)
  const teachingHtml = await teaching.text()
  for (const sentinel of Object.values(sentinels)) assert.match(teachingHtml, new RegExp(sentinel, 'u'))
} finally {
  await browser.close()
  await new Promise((resolve) => browserServer.close(resolve))
}
console.log('Import Review teaching route: exact revision companion HTML includes every family; unauthenticated and agent access denied PASS')
