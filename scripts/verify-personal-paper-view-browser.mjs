#!/usr/bin/env node
// verify-resource: browser-render
// #489 4b-1 paper editing view skeleton, proven end to end in a real browser
// against the real server: the same harness as
// verify-personal-annotations-browser.mjs (temp publication of the
// cloze/grammar Canonical fixture as paper-2026-i, a signed-in account, the
// actual PaperBrowse page). Covers the paper-view entry and switch, the
// layout API request, the srcdoc iframe page count / page-width geometry
// check, EQB Termes font loading inside the iframe, zoom levels that only
// scale the canvas (iframe layout untouched), and the 503 / network error
// states with their 重试 recovery.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { publishCanonicalPaperPublication } from '../server/paper-canonical/publication.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { buildSelectionSourceFromConsumption } from '../shared/paper-selection/sourceProjection.mjs'
import { buildPersonalLayerSource, PERSONAL_LAYER_API_SCHEMA } from '../shared/personal-paper-layer/index.mjs'
import { measurePersonalExportPlan } from '../server/personal-paper-layer/exportPlan.mjs'
import { createPersonalTextDocumentFromPlainText } from '../shared/personal-text/index.mjs'
import { makeClozeGrammarCanonicalReferenceFixture } from '../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const requireFromApp = createRequire(new URL('../app/package.json', import.meta.url))
const { chromium } = requireFromApp('playwright')

const MM_TO_PX = 96 / 25.4

let passed = 0
let failed = 0
function check(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

// Same seed as verify-personal-annotations-browser.mjs: publishes the
// cloze/grammar Canonical fixture into the temp root (paper-2026-i) and drops
// the committed latest paper-asset next to it.
function seedFixture(fixture) {
  const canonical = makeClozeGrammarCanonicalReferenceFixture()
  const asset = JSON.parse(new TextDecoder().decode(canonical.sourceAsset))
  const db = new DatabaseSync(fixture.dbPath)
  const published = publishCanonicalPaperPublication({
    rootDir: fixture.paperAssetsDir,
    db,
    request: canonical.request,
    sourceAssetVersion: 1,
    sourceAsset: canonical.sourceAsset,
  })
  if (published.status !== 'published') {
    throw new Error(`publication failed: ${JSON.stringify(published)}`)
  }
  const committedAsset = readFileSync(
    path.join(rootDir, 'app/public/paper-assets', asset.paper.paperId, 'latest/paper-asset.json'),
  )
  const versionDir = path.join(fixture.paperAssetsDir, asset.paper.paperId, 'versions', published.versionName)
  writeFileSync(path.join(versionDir, 'paper-asset.json'), committedAsset)
  // The real corpus keeps a byte-exact latest/paper-asset.json per paper; the
  // server's paper-asset-only question-group fallback (getQuestionGroupDetail)
  // reads exactly that file, and the natural student prepare refuses the paper
  // (422) when it cannot resolve the published groups through it. The committed
  // fixture asset still carries its legacy group ids, so the aligned shape
  // (canonical slot id -> same-family asset group, exactly what the browser
  // reads below) is what lands in latest/.
  const printConsumption = createCanonicalConsumerRuntime({ rootDir: fixture.paperAssetsDir, db })
    .load({ paperId: asset.paper.paperId, consumerId: 'print_pdf' })
  mkdirSync(path.join(fixture.paperAssetsDir, asset.paper.paperId, 'latest'), { recursive: true })
  writeFileSync(
    path.join(fixture.paperAssetsDir, asset.paper.paperId, 'latest', 'paper-asset.json'),
    canonicalServerAsset(committedAsset, printConsumption),
  )
  // Same binding as verify-personal-paper-layout.mjs: an explicit null plan
  // binding selects the bounded planner for an unplanned import; without this
  // file the natural student prepare refuses the publication (422).
  writeFileSync(path.join(versionDir, 'import-meta.json'), `${JSON.stringify({
    paginationPlanBinding: {
      schemaVersion: 'paper-pagination-binding-v1',
      paperId: asset.paper.paperId,
      sourceAssetVersion: printConsumption.sourceAssetVersion,
      sourceDigest: printConsumption.sourceAssetDigest,
      canonicalSourceDigest: printConsumption.sourceAssetDigest,
      candidateDigest: null,
      planDigest: null,
    },
  })}\n`)
  db.close()
  // The question-bank database the real server boots against carries the
  // shared schema (question groups + v_question_group_cards, which the
  // natural student prepare resolves published groups through). Apply the
  // same single-source schema to the temp database.
  new DatabaseSync(fixture.dbPath).exec(
    readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'),
  )
  return { paperId: asset.paper.paperId, committedAsset }
}

const FAMILY_GROUP_TYPE = {
  reading: 'reading',
  'seven-choices': 'sevenChoices',
  cloze: 'cloze',
  'grammar-fill': 'grammarFill',
  'application-writing': 'writing',
  'continuation-writing': 'writing',
}

function plannedBrowserAsset(committedAsset, consumption) {
  const asset = JSON.parse(committedAsset.toString('utf8'))
  const sourceGroups = Object.values(asset.content.groups)
  const aligned = {}
  for (const selection of consumption.selections) {
    for (const groupId of selection.groupIds) {
      const template = asset.content.groups[groupId]
        ?? sourceGroups.find((group) => group.groupType === FAMILY_GROUP_TYPE[selection.familyContractId])
      if (!template) throw new Error(`no asset template for ${selection.familyContractId}`)
      aligned[groupId] = { ...structuredClone(template), groupId }
    }
  }
  asset.content.groups = aligned
  asset.content.blocks = asset.content.blocks.filter((block) => block.type !== 'group' || aligned[block.groupId])
  const blockGroupIds = new Set(asset.content.blocks.filter((block) => block.type === 'group').map((block) => block.groupId))
  for (const groupId of Object.keys(aligned)) {
    if (!blockGroupIds.has(groupId)) asset.content.blocks.push({ type: 'group', groupId })
  }
  return JSON.stringify(asset)
}

// The server-side mirror of plannedBrowserAsset: the natural student prepare
// resolves published groups through getQuestionGroupDetail, whose paper-asset
// fallback reads exactly `<paperAssetsDir>/<paperId>/latest/paper-asset.json`,
// and print identity (canonicalGroupMatchesPrintDetail) requires the detail's
// question ids to equal the canonical projection's. The committed fixture asset
// carries legacy ids, so this rewrite borrows the same-family asset group per
// canonical slot AND renames its questions positionally to the canonical ids —
// which is what a real import's published asset already looks like.
function canonicalServerAsset(committedAsset, consumption) {
  const asset = JSON.parse(committedAsset.toString('utf8'))
  const sourceGroups = Object.values(asset.content.groups)
  const alignedGroups = {}
  const alignedQuestions = {}
  const alignedAnswers = {}
  for (const selection of consumption.selections) {
    for (const groupId of selection.groupIds) {
      const template = asset.content.groups[groupId]
        ?? sourceGroups.find((group) => group.groupType === FAMILY_GROUP_TYPE[selection.familyContractId])
      if (!template) throw new Error(`no asset template for ${selection.familyContractId}`)
      const canonicalGroup = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      const aligned = { ...structuredClone(template), groupId }
      aligned.questionIds = canonicalGroup.questions.map((question) => question.questionId)
      alignedGroups[groupId] = aligned
      for (const [index, question] of canonicalGroup.questions.entries()) {
        const nativeId = template.questionIds?.[index] ?? null
        alignedQuestions[question.questionId] = {
          questionId: question.questionId,
          questionNo: Number(question.questionNo) || index + 1,
          stem: question.stem ?? '',
        }
        const nativeAnswer = nativeId ? asset.answerKey?.answers?.[nativeId] : null
        if (nativeAnswer) alignedAnswers[question.questionId] = { ...nativeAnswer }
      }
    }
  }
  asset.content.groups = alignedGroups
  asset.content.questions = alignedQuestions
  asset.answerKey.answers = alignedAnswers
  asset.content.blocks = asset.content.blocks.filter((block) => block.type !== 'group' || alignedGroups[block.groupId])
  const blockGroupIds = new Set(asset.content.blocks.filter((block) => block.type === 'group').map((block) => block.groupId))
  for (const groupId of Object.keys(alignedGroups)) {
    if (!blockGroupIds.has(groupId)) asset.content.blocks.push({ type: 'group', groupId })
  }
  return JSON.stringify(asset)
}

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/create-user.mjs', ...args], { cwd: rootDir, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk.toString()))
    child.stderr.on('data', (chunk) => (output += chunk.toString()))
    child.on('exit', (code) => (code === 0 ? resolve(output) : reject(new Error(`create-user exited ${code}: ${output}`))))
  })
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.status) return
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`timed out waiting for ${url}`)
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-personal-paper-view-browser-'))
const fixture = {
  tempRoot,
  dbPath: path.join(tempRoot, 'question-bank.sqlite'),
  userDataDbPath: path.join(tempRoot, 'user-data.sqlite'),
  paperAssetsDir: path.join(tempRoot, 'paper-assets'),
  userSpaceRoot: path.join(tempRoot, 'user-space-files'),
}
mkdirSync(fixture.paperAssetsDir, { recursive: true })
mkdirSync(fixture.userSpaceRoot, { recursive: true })

const apiPort = await freePort()
const appPort = await freePort()
const serverEnv = {
  ...process.env,
  QUESTION_BANK_DB: fixture.dbPath,
  USER_DATA_DB: fixture.userDataDbPath,
  QUESTION_BANK_PAPER_ASSET_ROOT: fixture.paperAssetsDir,
  QUESTION_BANK_USER_SPACE_ROOT: fixture.userSpaceRoot,
  QUESTION_BANK_API_PORT: String(apiPort),
  QUESTION_BANK_PUBLIC_ORIGIN: `http://127.0.0.1:${appPort}`,
}

let server = null
let vite = null
let browser = null

// Reads page geometry straight out of the iframe document (same-origin
// srcdoc): one { width, offsetTop } entry per .pagedjs_page.
async function readIframePages(page) {
  return page.evaluate(() => {
    const iframe = document.querySelector('.paper-personal-paper-iframe')
    if (!iframe) return null
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) return null
    return [...doc.querySelectorAll('.pagedjs_page')].map((element) => {
      const box = element.getBoundingClientRect()
      return { width: box.width, top: box.top + win.scrollY }
    })
  })
}

async function canvasTransform(page) {
  return page.evaluate(() => document.querySelector('.paper-personal-paper-canvas')?.style.transform ?? null)
}

try {
  const seeded = seedFixture(fixture)
  const { paperId } = seeded
  await runCli(['--username', 'verify-paper-view-owner', '--role', 'owner', '--password', 'Verify-Pass-123'], serverEnv)

  server = spawn('node', ['server/api.mjs'], { cwd: rootDir, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  let serverLog = ''
  server.stdout.on('data', (chunk) => (serverLog += chunk))
  server.stderr.on('data', (chunk) => (serverLog += chunk))
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)

  const login = await fetch(`http://127.0.0.1:${apiPort}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'verify-paper-view-owner', password: 'Verify-Pass-123' }),
  })
  const cookie = login.headers.get('set-cookie') || ''
  const token = cookie.match(/eqb_session=([^;]+)/)?.[1]
  if (login.status !== 200 || !token) throw new Error(`login failed: ${login.status} ${cookie}`)
  const consumptionResponse = await fetch(
    `http://127.0.0.1:${apiPort}/api/paper-canonical/consumption?paperId=${paperId}`,
    { headers: { cookie: `eqb_session=${token}` } },
  )
  if (consumptionResponse.status !== 200) throw new Error(`consumption failed: ${consumptionResponse.status} ${await consumptionResponse.text()}`)
  const consumption = await consumptionResponse.json()
  const source = buildSelectionSourceFromConsumption(consumption)
  const sourceRevision = source.sourceRevision
  const browserAsset = plannedBrowserAsset(seeded.committedAsset, consumption)

  process.env.QUESTION_BANK_API_PORT = String(apiPort)
  const { createServer } = await import('../app/node_modules/vite/dist/node/index.js')
  vite = await createServer({ root: path.join(rootDir, 'app'), logLevel: 'error', server: { host: '127.0.0.1' } })
  await vite.listen(appPort)

  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addCookies([{ name: 'eqb_session', value: token, domain: '127.0.0.1', path: '/' }])
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.route('**/paper-assets/**/paper-asset.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: browserAsset,
  }))

  const layoutRequests = []
  page.on('request', (request) => {
    if (/\/api\/personal-paper-layers\/[^/]+\/layout/.test(new URL(request.url()).pathname)) {
      layoutRequests.push(request.url())
    }
  })

  await page.goto(`http://127.0.0.1:${appPort}/canonical-consumption-qa.html?paperId=${paperId}&personalAccount=verify-paper-view-owner`, { waitUntil: 'domcontentloaded' })
  try {
    // A cold Vite compile of the whole-paper page can exceed 30s under load.
    await page.waitForSelector('[data-paper-paragraph-id]', { timeout: 90_000 })
  } catch (error) {
    throw new Error(
      `PaperBrowse did not mount: ${(await page.locator('body').innerText()).slice(0, 500)}\n${pageErrors.join('\n').slice(0, 500)}\n${serverLog.slice(-800)}`,
      { cause: error },
    )
  }
  check('the reading view opens for a signed-in teacher with the 纸张 entry', await page.locator('button.ghost-button:has-text("纸张")').count() === 1)

  // ---- enter the paper view ---------------------------------------------------
  await page.click('button.ghost-button:has-text("纸张")')
  await page.waitForSelector('.paper-browse-editing-toolbar', { timeout: 10_000 })
  check('the paper view toolbar shows the 阅读/纸张 switch', await page.locator('.paper-browse-view-switch button').count() === 2)
  check('the paper view toolbar shows the zoom levels', await page.locator('.paper-browse-zoom-option').count() === 5)

  // First server render is real Paged.js pagination — allow up to a minute.
  try {
    await page.waitForSelector('.paper-personal-paper-iframe', { timeout: 90_000 })
  } catch (error) {
    const state = await page.evaluate(() => ({
      view: document.querySelector('.paper-personal-paper-view')?.textContent ?? null,
      shell: document.querySelector('.paper-browse-shell')?.className ?? null,
      layoutRequests: undefined,
    }))
    throw new Error(`iframe never appeared: ${JSON.stringify(state)}\nlayout requests: ${layoutRequests.join(' | ')}\n${pageErrors.join('\n').slice(0, 500)}\n${serverLog.slice(-1500)}`, { cause: error })
  }
  await page.waitForSelector('[data-paper-page-overlay]', { timeout: 30_000 })
  check('entering the paper view requests the layout API with sourceRevision',
    layoutRequests.length === 1 && layoutRequests[0].includes('sourceRevision='),
    layoutRequests.join(' | '))

  // The authoritative pages list comes from the layout API itself.
  const layout = await page.evaluate(async (id) => (await fetch(`/api/personal-paper-layers/${id}/layout`)).json(), paperId)
  check('the layout API answers for the fixture paper', Array.isArray(layout?.pages) && layout.pages.length > 0, JSON.stringify(layout?.pages?.slice(0, 1)))

  const iframePages = await readIframePages(page)
  check('the iframe renders one .pagedjs_page per layout page',
    iframePages?.length === layout.pages.length,
    `iframe=${iframePages?.length ?? 'null'} api=${layout.pages.length}`)
  const widthDrift = iframePages
    ? Math.max(...iframePages.map((box, index) => Math.abs(box.width - layout.pages[index].widthMm * MM_TO_PX)))
    : Number.POSITIVE_INFINITY
  check('every rendered page width matches the API mm measurement within 2px', widthDrift < 2, `max drift ${widthDrift.toFixed(3)}px`)
  check('one overlay mount point per page', await page.locator('[data-paper-page-overlay]').count() === layout.pages.length)
  check('the paper view fills the content column (not a collapsed grid column)',
    await page.evaluate(() => (document.querySelector('.paper-personal-paper-view')?.clientWidth ?? 0) > 1000),
    `clientWidth=${await page.evaluate(() => document.querySelector('.paper-personal-paper-view')?.clientWidth ?? 0)}`)
  const fitFill = await page.evaluate(() => {
    const view = document.querySelector('.paper-personal-paper-view')
    const canvas = document.querySelector('.paper-personal-paper-canvas')
    if (!view || !canvas) return null
    return { viewWidth: view.clientWidth, canvasWidth: canvas.getBoundingClientRect().width }
  })
  check('适应宽度 fills the content column with the paper', fitFill !== null && Math.abs(fitFill.canvasWidth - fitFill.viewWidth) < 8, JSON.stringify(fitFill))

  // 字体是异步 @font-face，等 iframe 里 EQB Termes 真正就位再断言。
  await page.waitForFunction(() => {
    const iframe = document.querySelector('.paper-personal-paper-iframe')
    return Boolean(iframe?.contentDocument?.fonts.check('16px "EQB Termes"'))
  }, undefined, { timeout: 30_000 })
  const fontState = await page.evaluate(() => {
    const iframe = document.querySelector('.paper-personal-paper-iframe')
    return iframe?.contentDocument
      ? { termes: iframe.contentDocument.fonts.check('16px "EQB Termes"'), status: iframe.contentDocument.fonts.status }
      : null
  })
  check('the iframe loaded the EQB Termes paper font', fontState?.termes === true, JSON.stringify(fontState))

  // ---- zoom changes scale only, never the iframe layout ------------------------
  const pagesAtFit = await readIframePages(page)
  const widthsAtFit = pagesAtFit.map(({ width }) => width)
  const topsAtFit = pagesAtFit.map(({ top }) => top)
  await page.click('.paper-browse-zoom-option:has-text("100%")')
  await page.waitForFunction(() => document.querySelector('.paper-personal-paper-canvas')?.style.transform === 'scale(1)')
  const widthsAt100 = (await readIframePages(page))?.map((box) => box.width)
  check('zoom 100% leaves iframe page count and widths untouched',
    JSON.stringify(widthsAt100) === JSON.stringify(widthsAtFit) && widthsAt100?.length === layout.pages.length,
    `fit=${JSON.stringify(widthsAtFit)} 100%=${JSON.stringify(widthsAt100)}`)
  const unclipped = await page.evaluate(() => {
    const view = document.querySelector('.paper-personal-paper-view')
    const canvas = document.querySelector('.paper-personal-paper-canvas')
    const box = canvas?.getBoundingClientRect()
    const viewBox = view?.getBoundingClientRect()
    if (!box || !viewBox) return null
    return {
      width: box.width,
      leftGap: box.left - viewBox.left,
      rightGap: viewBox.right - box.right,
    }
  })
  check('zoom 100% shows the whole 794px page unclipped and centered',
    unclipped !== null && unclipped.width > 700 && unclipped.leftGap > -1 && unclipped.rightGap > -1,
    JSON.stringify(unclipped))

  await page.click('.paper-browse-zoom-option:has-text("150%")')
  await page.waitForFunction(() => document.querySelector('.paper-personal-paper-canvas')?.style.transform === 'scale(1.5)')
  const pagesAt150 = await readIframePages(page)
  check('zoom 150% still reflows nothing inside the iframe',
    JSON.stringify(pagesAt150?.map(({ width }) => width)) === JSON.stringify(widthsAtFit)
    && pagesAt150?.length === pagesAtFit.length
    && JSON.stringify(pagesAt150.map(({ top }) => top)) === JSON.stringify(topsAtFit))
  check('the sizer reserves the scaled footprint so the canvas is not clipped',
    await page.evaluate(() => {
      const sizer = document.querySelector('.paper-personal-paper-zoom')
      const canvas = document.querySelector('.paper-personal-paper-canvas')
      if (!sizer || !canvas) return false
      // getBoundingClientRect already includes the canvas transform, so the
      // sizer must match the VISUAL size exactly (no clipping, no overflow).
      const sizerBox = sizer.getBoundingClientRect()
      const canvasBox = canvas.getBoundingClientRect()
      return Math.abs(sizerBox.width - canvasBox.width) < 1
        && Math.abs(sizerBox.height - canvasBox.height) < 1
    }))

  // ---- 503 renders the renderer-failure error state with 重试 -------------------
  await page.route('**/api/personal-paper-layers/**/layout*', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: '纸张版暂时生成失败，稍后重试', code: 'PERSONAL_LAYOUT_RENDER_FAILED' }),
  }))
  await page.click('.paper-browse-view-switch button:has-text("阅读")')
  await page.waitForSelector('button.ghost-button:has-text("纸张")', { timeout: 10_000 })
  await page.click('button.ghost-button:has-text("纸张")')
  await page.waitForSelector('.paper-personal-paper-state--error', { timeout: 15_000 })
  check('a 503 shows the renderer-failure copy', (await page.locator('.paper-personal-paper-state--error').textContent()).includes('纸张版暂时生成失败，稍后重试'))
  check('the 503 error state offers 重试', await page.locator('.paper-personal-paper-state--error button:has-text("重试")').count() === 1)

  // ---- a dead route shows the network error copy --------------------------------
  await page.unroute('**/api/personal-paper-layers/**/layout*')
  await page.route('**/api/personal-paper-layers/**/layout*', (route) => route.abort())
  await page.click('.paper-browse-view-switch button:has-text("阅读")')
  await page.click('button.ghost-button:has-text("纸张")')
  await page.waitForSelector('.paper-personal-paper-state--error', { timeout: 15_000 })
  check('a dead route shows the network error copy', (await page.locator('.paper-personal-paper-state--error').textContent()).includes('纸张版暂时打不开'))

  // ---- recovery after errors ------------------------------------------------------
  await page.unroute('**/api/personal-paper-layers/**/layout*')
  await page.click('.paper-browse-view-switch button:has-text("阅读")')
  await page.click('button.ghost-button:has-text("纸张")')
  await page.waitForSelector('[data-paper-page-overlay]', { timeout: 90_000 })
  check('the paper view recovers after error states', true)
  const finalZoomState = await page.evaluate(() => ({
    url: new URL(window.location.href).searchParams.get('paperView'),
  }))
  check('the paper view is mirrored into the URL as paperView=paper', finalZoomState.url === 'paper')

  // ---- regression: the loading state also fills the content column -------------
  // 延迟放行 layout 响应，让「纸张生成中…」停住可量——首帧渲染太快时该状态
  // 一闪而过，直接量会漏检塌缩回归。
  await page.click('.paper-browse-view-switch button:has-text("阅读")')
  await page.route('**/api/personal-paper-layers/**/layout*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000))
    await route.continue()
  })
  await page.click('button.ghost-button:has-text("纸张")')
  await page.waitForSelector('.paper-personal-paper-state', { timeout: 10_000 })
  const loadingWidth = await page.evaluate(() => document.querySelector('.paper-personal-paper-view')?.clientWidth ?? 0)
  check('the loading state fills the content column (not a collapsed grid column)',
    loadingWidth > 1000, `clientWidth=${loadingWidth}`)
  await page.unroute('**/api/personal-paper-layers/**/layout*')
  await page.waitForSelector('[data-paper-page-overlay]', { timeout: 90_000 })

  // ---- text boxes on the paper view (#489 step C) ---------------------------------
  // Real interaction pack: arm + click + type, zoom invariance, drag/undo/redo,
  // nudge merging, duplicate, deselect, overflow warning and the old-layout
  // re-place flow. Same patterns as .scratch/ui-shot-4b2.mjs.

  // Autosave debounces 600ms; a fixed wait covers one flush plus round trip.
  const flushAutosave = () => page.waitForTimeout(2500)

  const readLayer = async () => {
    const response = await fetch(
      `http://127.0.0.1:${apiPort}/api/personal-paper-layers/${paperId}?sourceRevision=${encodeURIComponent(sourceRevision)}`,
      { headers: { cookie: `eqb_session=${token}` } },
    )
    if (response.status !== 200) throw new Error(`layer read failed: ${response.status}`)
    return response.json()
  }
  const storedTextBoxes = async () => (await readLayer()).layer?.objects?.filter((object) => object.type === 'text-box') ?? []
  // Server-side writes race the page's own autosave flushes; re-read the
  // version and retry a few times on the conflict response.
  const postOperations = async (operations, tag) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await readLayer()
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/personal-paper-layers/${paperId}/operations`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `eqb_session=${token}`,
          origin: `http://127.0.0.1:${apiPort}`,
        },
        body: JSON.stringify({
          schemaVersion: PERSONAL_LAYER_API_SCHEMA,
          paperId,
          sourceRevision,
          expectedVersion: current.layer?.version ?? 0,
          clientMutationId: `${tag}-${Date.now()}-${attempt}`,
          operations,
        }),
      })
      if (response.status === 200) return
      if (response.status !== 409) throw new Error(`${tag} failed: ${response.status} ${await response.text()}`)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(`${tag} kept hitting version conflicts`)
  }
  const storedVersion = async () => (await readLayer()).layer?.version ?? null

  const armAddText = async () => {
    await page.click('.paper-browse-add-text-option')
    await page.waitForFunction(() => document.querySelector('.paper-personal-text-box-layer')?.classList.contains('is-armed'))
  }

  const setZoom = async (label, transform) => {
    await page.click(`.paper-browse-zoom-option:has-text("${label}")`)
    await page.waitForFunction((expected) => document.querySelector('.paper-personal-paper-canvas')?.style.transform === expected, transform)
  }

  // Viewport-safe page click: bring the point over the page into the middle of
  // the viewport, then mouse.click it (off-screen clicks silently do nothing).
  const clickOnPageAt = async (offsetXpx, offsetYpx) => {
    await page.evaluate(([ox, oy]) => {
      const overlay = document.querySelector('[data-paper-page-overlay="p1"]')
      const scrolling = document.scrollingElement
      if (!overlay || !scrolling) return
      const top = overlay.getBoundingClientRect().top + scrolling.scrollTop
      scrolling.scrollTo(0, top + oy - window.innerHeight / 2)
    }, [offsetXpx, offsetYpx])
    const box = await page.locator('[data-paper-page-overlay="p1"]').boundingBox()
    if (!box) throw new Error('p1 overlay not found')
    const x = box.x + offsetXpx
    const y = box.y + offsetYpx
    if (x < 0 || x > 1440 || y < 0 || y > 900) throw new Error(`click point (${x}, ${y}) outside the 1440x900 viewport`)
    await page.mouse.click(x, y)
  }

  // Seeds a text box from a defunct layout straight into the server layer, as
  // another device would have left it behind (expectedVersion + unique id).
  const seedForeignTextBox = async () => {
    const current = await readLayer()
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/personal-paper-layers/${paperId}/operations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `eqb_session=${token}`,
        // Same-origin guard accepts the API host itself as Origin.
        origin: `http://127.0.0.1:${apiPort}`,
      },
      body: JSON.stringify({
        schemaVersion: PERSONAL_LAYER_API_SCHEMA,
        paperId,
        sourceRevision,
        expectedVersion: current.layer?.version ?? 0,
        clientMutationId: `verify-foreign-${Date.now()}`,
        operations: [{
          op: 'create',
          object: {
            id: `foreign-box-${Date.now()}`,
            type: 'text-box',
            document: createPersonalTextDocumentFromPlainText('旧版式文字框'),
            placement: { kind: 'page-position', layoutId: 'old-layout-1990', pageId: 'p1', xMm: 30, yMm: 30, widthMm: 60 },
          },
        }],
      }),
    })
    if (response.status !== 200) throw new Error(`foreign seed failed: ${response.status} ${await response.text()}`)
  }

  // Seeds one highlight + one underline through the same operations endpoint,
  // anchored to the first long passage-body stream, as another device would
  // have left them. Returns the anchored text so the over-words check can
  // compare against the real passage characters.
  let markStreamText = null
  const seedMarks = async () => {
    const stream = source.streams.find((item) => item.role === 'passage-body' && item.text.length > 40)
    if (!stream) throw new Error('no passage-body stream long enough to seed marks')
    markStreamText = stream.text
    const current = await readLayer()
    const anchor = (start, end) => ({
      paperId,
      sourceRevision: source.sourceRevision,
      sourceProjectionVersion: source.sourceProjectionVersion,
      segments: [{ streamId: stream.streamId, start, end, exactText: stream.text.slice(start, end) }],
    })
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/personal-paper-layers/${paperId}/operations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `eqb_session=${token}`,
        origin: `http://127.0.0.1:${apiPort}`,
      },
      body: JSON.stringify({
        schemaVersion: PERSONAL_LAYER_API_SCHEMA,
        paperId,
        sourceRevision,
        expectedVersion: current.layer?.version ?? 0,
        clientMutationId: `verify-marks-${Date.now()}`,
        operations: [
          {
            op: 'create',
            object: {
              id: `verify-hl-${Date.now()}`,
              type: 'highlight',
              style: { color: 'yellow' },
              textAnchor: anchor(0, 20),
            },
          },
          {
            op: 'create',
            object: {
              id: `verify-ul-${Date.now()}`,
              type: 'underline',
              style: { ink: 'red' },
              textAnchor: anchor(25, 40),
            },
          },
        ],
      }),
    })
    if (response.status !== 200) throw new Error(`mark seed failed: ${response.status} ${await response.text()}`)
  }

  const openPaperView = async () => {
    await page.goto(`http://127.0.0.1:${appPort}/canonical-consumption-qa.html?paperId=${paperId}&personalAccount=verify-paper-view-owner`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-paper-paragraph-id]', { timeout: 90_000 })
    await page.click('button.ghost-button:has-text("纸张")')
    await page.waitForSelector('[data-paper-page-overlay]', { timeout: 90_000 })
    await setZoom('100%', 'scale(1)')
  }

  await openPaperView()

  // (a) create a box by arming + click + typing; the server stores it on the
  // current layout within 1mm of the click point.
  await armAddText()
  await clickOnPageAt(300, 200)
  await page.waitForSelector('.paper-personal-text-box.is-editing [contenteditable="true"]', { timeout: 10_000 })
  // Tiptap focuses through a rAF after mount; wait so the keystrokes land.
  await page.waitForFunction(() => document.activeElement?.classList.contains('eqb-personal-text__input'), undefined, { timeout: 5_000 })
  await page.keyboard.type('Hello 纸上的字')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await flushAutosave()
  const storedA = await storedTextBoxes()
  check('a created text box lands on the current layout within 1mm of the click',
    storedA.length === 1
    && storedA[0].placement.layoutId === layout.layoutId
    && storedA[0].placement.pageId === 'p1'
    && Math.abs(storedA[0].placement.xMm - 300 / MM_TO_PX) < 1
    && Math.abs(storedA[0].placement.yMm - 200 / MM_TO_PX) < 1,
    JSON.stringify(storedA.map((object) => object.placement)))

  // (b) arm + click + Escape without typing: nothing is saved.
  await armAddText()
  await clickOnPageAt(500, 320)
  await page.waitForSelector('.paper-personal-text-box.is-editing [contenteditable="true"]', { timeout: 10_000 })
  // Same rAF-autofocus wait as (a): without it Escape can land on BODY (where
  // the editing draft intentionally stays open) and flake the DOM count.
  await page.waitForFunction(() => document.activeElement?.classList.contains('eqb-personal-text__input'), undefined, { timeout: 5_000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await flushAutosave()
  const storedB = await storedTextBoxes()
  check('arm + click + Escape without typing saves zero text boxes',
    storedB.length === 1 && await page.locator('.paper-personal-text-box').count() === 1,
    `server=${storedB.length} dom=${await page.locator('.paper-personal-text-box').count()} ${JSON.stringify(storedB.map((object) => object.placement))}`)

  // (c) zoom 150% then 75%: stored mm and the layer version stay untouched.
  const placementBeforeZoom = await storedTextBoxes()
  const versionBeforeZoom = await storedVersion()
  await setZoom('150%', 'scale(1.5)')
  await setZoom('75%', 'scale(0.75)')
  const placementAfterZoom = await storedTextBoxes()
  const versionAfterZoom = await storedVersion()
  check('zoom changes never touch stored mm or the layer version',
    placementBeforeZoom.length === 1 && placementAfterZoom.length === 1
    && placementAfterZoom[0].placement.xMm === placementBeforeZoom[0].placement.xMm
    && placementAfterZoom[0].placement.yMm === placementBeforeZoom[0].placement.yMm
    && placementAfterZoom[0].placement.widthMm === placementBeforeZoom[0].placement.widthMm
    && versionAfterZoom === versionBeforeZoom,
    `version ${versionBeforeZoom} -> ${versionAfterZoom}`)
  await setZoom('100%', 'scale(1)')

  // (d) drag +60px/+40px at 100%: exactly one version bump with the matching
  // mm delta, then undo/redo restores and reapplies.
  await page.locator('.paper-personal-text-box').first().click()
  const versionBeforeDrag = await storedVersion()
  const boxBeforeDrag = await page.locator('.paper-personal-text-box').first().boundingBox()
  await page.mouse.move(boxBeforeDrag.x + boxBeforeDrag.width / 2, boxBeforeDrag.y + 10)
  await page.mouse.down()
  await page.mouse.move(boxBeforeDrag.x + boxBeforeDrag.width / 2 + 60, boxBeforeDrag.y + 10 + 40, { steps: 10 })
  await page.mouse.up()
  await flushAutosave()
  const dragged = (await storedTextBoxes())[0]?.placement
  check('a drag commits exactly one version bump with the mm delta of px/MM_TO_PX',
    (await storedVersion()) === versionBeforeDrag + 1
    && dragged
    && Math.abs(dragged.xMm - (placementBeforeZoom[0].placement.xMm + 60 / MM_TO_PX)) < 0.5
    && Math.abs(dragged.yMm - (placementBeforeZoom[0].placement.yMm + 40 / MM_TO_PX)) < 0.5,
    `version ${versionBeforeDrag} -> ${await storedVersion()}, placement ${JSON.stringify(dragged)}`)
  await page.keyboard.press('ControlOrMeta+z')
  await flushAutosave()
  const undoneDrag = (await storedTextBoxes())[0]?.placement
  check('Cmd/Ctrl+Z restores the pre-drag placement',
    (await storedVersion()) === versionBeforeDrag + 2
    && undoneDrag?.xMm === placementBeforeZoom[0].placement.xMm
    && undoneDrag?.yMm === placementBeforeZoom[0].placement.yMm,
    JSON.stringify(undoneDrag))
  await page.keyboard.press('Shift+ControlOrMeta+z')
  await flushAutosave()
  const redone = (await storedTextBoxes())[0]?.placement
  check('Shift+Cmd/Ctrl+Z reapplies the drag',
    (await storedVersion()) === versionBeforeDrag + 3
    && redone?.xMm === dragged?.xMm && redone?.yMm === dragged?.yMm,
    JSON.stringify(redone))

  // (e) ArrowRight x3 merges into one +3mm version; one undo reverts all three.
  await page.locator('.paper-personal-text-box').first().click()
  const versionBeforeNudge = await storedVersion()
  const xBeforeNudge = (await storedTextBoxes())[0]?.placement.xMm
  for (let nudge = 0; nudge < 3; nudge += 1) {
    await page.keyboard.press('ArrowRight')
    // Let each nudge's re-render land so the next press reads fresh state.
    await page.waitForTimeout(80)
  }
  await flushAutosave()
  const nudged = (await storedTextBoxes())[0]?.placement
  check('ArrowRight x3 nudges +3mm in one merged version',
    (await storedVersion()) === versionBeforeNudge + 1
    && Math.abs(nudged.xMm - (xBeforeNudge + 3)) < 0.05,
    `version ${versionBeforeNudge} -> ${await storedVersion()}, xMm ${xBeforeNudge} -> ${nudged?.xMm}`)
  await page.keyboard.press('ControlOrMeta+z')
  await flushAutosave()
  const undoneNudge = (await storedTextBoxes())[0]?.placement
  check('one undo reverts all three nudges',
    (await storedVersion()) === versionBeforeNudge + 2 && undoneNudge?.xMm === xBeforeNudge,
    JSON.stringify(undoneNudge))

  // (f) 复制文字框 duplicates into a second box with its own id.
  await page.locator('.paper-personal-text-box').first().click()
  await page.waitForSelector('.paper-personal-text-box__strip', { timeout: 10_000 })
  await page.click('.paper-personal-text-box__strip-action[aria-label="复制文字框"]')
  await flushAutosave()
  const duplicated = await storedTextBoxes()
  check('复制文字框 creates two boxes with distinct ids',
    duplicated.length === 2
      && duplicated[0].id !== duplicated[1].id
      && duplicated.every((object) => object.placement.layoutId === layout.layoutId),
    JSON.stringify(duplicated.map((object) => object.placement)))

  // (g) clicking blank paper deselects.
  await clickOnPageAt(40, 30)
  await page.waitForTimeout(300)
  check('clicking blank paper deselects the selected box',
    await page.locator('.paper-personal-text-box.is-selected').count() === 0)

  // (h) many typed lines in a box near the page bottom overflow the page.
  await page.locator('.paper-personal-text-box').first().click()
  // Shift+Arrow = 5mm: nudge the box toward the page bottom. Each press must
  // observe the previous render's placement, so poll until it sits below the
  // 280mm line instead of counting a fixed number of presses (fast presses
  // can otherwise compute from a stale placement and stall partway).
  const nudgeTargetPx = await page.evaluate((mmToPx) => {
    const overlay = document.querySelector('[data-paper-page-overlay="p1"]')
    return overlay ? parseFloat(overlay.style.top) + 280 * mmToPx : Number.POSITIVE_INFINITY
  }, MM_TO_PX)
  for (let nudge = 0; nudge < 120; nudge += 1) {
    const topPx = await page.locator('.paper-personal-text-box').first().evaluate((node) => parseFloat(node.style.top))
    if (topPx >= nudgeTargetPx) break
    await page.keyboard.press('Shift+ArrowDown')
    await page.waitForTimeout(40)
  }
  await page.keyboard.press('Enter')
  await page.waitForSelector('.paper-personal-text-box.is-editing [contenteditable="true"]', { timeout: 10_000 })
  await page.waitForFunction(() => document.activeElement?.classList.contains('eqb-personal-text__input'), undefined, { timeout: 5_000 })
  await page.keyboard.type('第一行长一点的文字内容\n第二行也很长\n第三行继续加长\n第四行再加一段')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.paper-personal-text-box[data-overflow="true"]', { timeout: 5_000 })
  check('a box grown past the page bottom is flagged data-overflow',
    await page.locator('.paper-personal-text-box[data-overflow="true"]').count() === 1)
  const overflowNotice = page.locator('.paper-personal-paper-notice:has-text("超出纸张")')
  check('the overflow notice appears above the paper', (await overflowNotice.count()) === 1 && (await overflowNotice.textContent()).includes('有 1 个'),
    await overflowNotice.count() ? await overflowNotice.textContent() : 'notice missing')
  check('the overflow box never clips its text',
    await page.locator('.paper-personal-text-box[data-overflow="true"]').evaluate((node) => getComputedStyle(node).overflow) !== 'hidden')
  // Clean up for the old-layout section: the overflowing box stays selected.
  await page.keyboard.press('Delete')
  await flushAutosave()

  // (i) a box from an old layout is never rendered and asks to be re-placed.
  await seedForeignTextBox()
  await openPaperView()
  const foreignNotice = page.locator('.paper-personal-paper-notice:has-text("旧的纸张版式")')
  await foreignNotice.waitFor({ timeout: 15_000 })
  check('a foreign-layout box shows the old-layout notice',
    (await foreignNotice.count()) === 1 && (await foreignNotice.textContent()).includes('1 个文字框属于旧的纸张版式'),
    await foreignNotice.textContent())
  check('the old-layout box does not render on the current paper',
    await page.locator('.paper-personal-text-box').count() === 1)
  await page.click('.paper-personal-paper-notice button:has-text("逐个摆放")')
  await page.waitForSelector('.paper-personal-text-box-hit', { timeout: 5_000 })
  check('re-place mode turns the page hit surfaces into crosshairs',
    await page.locator('.paper-personal-text-box-hit').evaluateAll((nodes) => nodes.length > 0 && nodes.every((node) => getComputedStyle(node).cursor === 'crosshair')))
  await page.keyboard.press('Escape')
  check('Escape cancels re-place mode but keeps the notice',
    await page.locator('.paper-personal-text-box-hit').count() === 0
    && (await foreignNotice.count()) === 1)
  await page.click('.paper-personal-paper-notice button:has-text("逐个摆放")')
  await clickOnPageAt(400, 150)
  await flushAutosave()
  const foreignBox = (await storedTextBoxes()).find((object) => object.id.startsWith('foreign-box-'))
  check('逐个摆放 + one page click re-homes the box to the current layout',
    foreignBox
    && foreignBox.placement.layoutId === layout.layoutId
    && foreignBox.placement.pageId === 'p1'
    && Math.abs(foreignBox.placement.xMm - 400 / MM_TO_PX) < 1
    && Math.abs(foreignBox.placement.yMm - 150 / MM_TO_PX) < 1
    && foreignBox.placement.widthMm === 60,
    JSON.stringify(foreignBox?.placement))
  check('the old-layout notice is gone once every box is re-homed',
    await page.locator('.paper-personal-paper-notice:has-text("旧的纸张版式")').count() === 0)
  await page.keyboard.press('ControlOrMeta+z')
  await flushAutosave()
  const undoneForeign = (await storedTextBoxes()).find((object) => object.id.startsWith('foreign-box-'))
  check('undo after re-homing restores the old foreign placement',
    undoneForeign?.placement.layoutId === 'old-layout-1990'
    && undoneForeign?.placement.xMm === 30 && undoneForeign?.placement.yMm === 30,
    JSON.stringify(undoneForeign?.placement))

  // ---- stored marks are drawn over the paper view's words (#489 4c-1) -------------
  await seedMarks()
  await openPaperView()
  await page.locator('.paper-personal-paper-mark.paper-personal-mark--highlight').first().waitFor({ timeout: 15_000 })
  check('a stored highlight is drawn on the paper view',
    await page.locator('.paper-personal-paper-mark.paper-personal-mark--highlight').count() >= 1
    && await page.locator('.paper-personal-paper-mark.paper-personal-mark--highlight[data-color="yellow"]').count() >= 1)
  // Mark rects are iframe-document px; elementFromPoint wants viewport coords,
  // so the center is offset by the iframe's own scroll first.
  const highlightHit = await page.evaluate(() => {
    const mark = document.querySelector('.paper-personal-paper-mark.paper-personal-mark--highlight')
    const iframe = document.querySelector('.paper-personal-paper-iframe')
    const doc = iframe?.contentDocument
    const win = iframe?.contentWindow
    if (!mark || !doc || !win) return null
    const cx = parseFloat(mark.style.left) + parseFloat(mark.style.width) / 2 - win.scrollX
    const cy = parseFloat(mark.style.top) + parseFloat(mark.style.height) / 2 - win.scrollY
    return doc.elementFromPoint(cx, cy)?.textContent ?? null
  })
  check('the highlight sits over its words',
    typeof highlightHit === 'string' && highlightHit.includes(markStreamText.slice(2, 12)),
    JSON.stringify(typeof highlightHit === 'string' ? highlightHit.slice(0, 60) : highlightHit))
  check('a stored underline is drawn with its ink',
    await page.locator('.paper-personal-paper-mark.paper-personal-mark--underline[data-ink="red"]').count() >= 1)
  check('no unplaced-mark notice for mappable anchors',
    await page.locator('.paper-personal-paper-notice:has-text("找不到原文")').count() === 0)

  // ---- paper marks open the shared popover (#489 4c-2) -----------------------------
  // The mark rects live in the parent-document overlay, so a real mouse click
  // on the first fragment's center must reach the div itself (pointer-events
  // re-enabled per fragment) and open the same popover the reading view uses.
  const clickMarkCenter = async (selector) => {
    const mark = page.locator(selector).first()
    await mark.scrollIntoViewIfNeeded()
    const box = await mark.boundingBox()
    if (!box) throw new Error(`mark not visible: ${selector}`)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }

  await clickMarkCenter('.paper-personal-paper-mark.paper-personal-mark--highlight')
  await page.waitForSelector('.paper-personal-popover', { timeout: 5_000 })
  check('clicking a paper highlight opens its popover',
    await page.locator('.paper-personal-popover').count() === 1
    && await page.locator('.paper-personal-popover .paper-personal-swatch[aria-label="改成黄色"]').count() === 1)
  await page.click('.paper-personal-popover .paper-personal-swatch[aria-label="改成绿色"]')
  await page.waitForFunction(
    () => {
      const marks = [...document.querySelectorAll('.paper-personal-paper-mark.paper-personal-mark--highlight')]
      return marks.length >= 1 && marks.every((node) => node.dataset.color === 'green')
    },
    undefined,
    { timeout: 5_000 },
  )
  check('the popover recolors the paper mark',
    await page.locator('.paper-personal-paper-mark.paper-personal-mark--highlight[data-color="green"]').count() >= 1)
  await flushAutosave()

  const toolbarBox = await page.locator('.paper-browse-editing-toolbar').boundingBox()
  await page.mouse.click(toolbarBox.x + 4, toolbarBox.y + toolbarBox.height / 2)
  await page.waitForFunction(() => document.querySelectorAll('.paper-personal-popover').length === 0, undefined, { timeout: 5_000 })
  check('clicking outside closes the popover',
    await page.locator('.paper-personal-popover').count() === 0)

  await clickMarkCenter('.paper-personal-paper-mark.paper-personal-mark--underline')
  await page.waitForSelector('.paper-personal-popover', { timeout: 5_000 })
  await page.click('.paper-personal-popover button:has-text("删除")')
  await page.waitForFunction(
    () => document.querySelectorAll('.paper-personal-paper-mark.paper-personal-mark--underline').length === 0,
    undefined,
    { timeout: 5_000 },
  )
  check('deleting from the popover removes the paper mark',
    await page.locator('.paper-personal-paper-mark.paper-personal-mark--underline').count() === 0)
  await flushAutosave()

  // ---- anchored-note cards on the paper view (#489 step 4) -------------------------
  // Same fixture and anchor texts as .scratch/ui-shot-4c.mjs. Each group seeds
  // what it needs through the operations endpoint and cleans up with undo or
  // delete, like the sections above; nothing here weakens earlier checks.
  const noteStream = source.streams.find((item) => item.role === 'passage-body' && item.text.length > 260)
  if (!noteStream) throw new Error('no long passage-body stream for note anchors')
  const noteAnchor = (text) => {
    const start = noteStream.text.indexOf(text)
    if (start < 0) throw new Error(`note anchor text missing: ${text}`)
    return {
      paperId,
      sourceRevision: source.sourceRevision,
      sourceProjectionVersion: source.sourceProjectionVersion,
      segments: [{ streamId: noteStream.streamId, start, end: start + text.length, exactText: text }],
    }
  }
  const storedNotes = async () => (await readLayer()).layer?.objects?.filter((object) => object.type === 'anchored-note') ?? []
  const seedObjects = async (objects) => {
    await postOperations(objects.map((object) => ({ op: 'create', object })), 'verify-notes')
  }
  const noteCard = (noteId) => page.locator(`.paper-personal-paper-note[data-note-key="${noteId}"]`)
  const selectNote = async (noteId) => {
    const card = noteCard(noteId)
    await card.scrollIntoViewIfNeeded()
    const box = await card.boundingBox()
    if (!box) throw new Error(`note card not visible: ${noteId}`)
    await page.mouse.click(box.x + 8, box.y + 8)
    await page.waitForFunction(
      (id) => document.querySelector(`.paper-personal-paper-note[data-note-key="${id}"]`)?.classList.contains('is-selected'),
      noteId,
      { timeout: 5_000 },
    )
    // A second real click lands on the already-selected card, whose pointerdown
    // is the drag guard; the card must still take focus for Enter-to-edit.
    await page.mouse.click(box.x + 8, box.y + 8)
    await page.waitForFunction(
      (id) => document.activeElement?.matches?.(`.paper-personal-paper-note[data-note-key="${id}"]`),
      noteId,
      { timeout: 5_000 },
    )
  }

  await seedObjects([
    {
      id: 'verify-note-1',
      type: 'anchored-note',
      document: createPersonalTextDocumentFromPlainText('这是正式测试旁注一。'),
      textAnchor: noteAnchor('as a whole different world'),
      placement: { kind: 'auto-near-anchor' },
    },
    {
      id: 'verify-note-2',
      type: 'anchored-note',
      document: createPersonalTextDocumentFromPlainText('这是正式测试旁注二。'),
      textAnchor: noteAnchor('most of my classmates thought of Ohio'),
      placement: { kind: 'auto-near-anchor' },
    },
  ])
  await openPaperView()
  await page.waitForFunction(() => document.querySelectorAll('.paper-personal-paper-note[data-note-key]').length >= 2, undefined, { timeout: 15_000 })

  check('auto-near-anchor note cards render with the margin slot',
    await noteCard('verify-note-1').getAttribute('data-note-slot') === 'margin'
    && await noteCard('verify-note-2').getAttribute('data-note-slot') === 'margin')

  // The 常规 preset renders with the bundled paper faces: PaperFontGate has
  // loaded and sha-verified the pinned bytes before the page mounted, so the
  // default-preset card's computed font must name both families — never a
  // host fallback, or the preview would measure different glyphs than the
  // export.
  const defaultNoteFont = await page.evaluate(() => {
    const text = document.querySelector('.paper-personal-paper-note[data-note-key="verify-note-1"] .eqb-personal-text')
    return {
      computed: text ? getComputedStyle(text).fontFamily : null,
      termes: document.fonts.check('16px "EQB Termes"'),
      hanSerif: document.fonts.check('16px "EQB Source Han Serif"'),
    }
  })
  check('a default-preset note card resolves to the bundled paper faces, loaded in the page',
    Boolean(defaultNoteFont.computed?.includes('EQB Termes') && defaultNoteFont.computed?.includes('EQB Source Han Serif'))
    && defaultNoteFont.termes && defaultNoteFont.hanSerif,
    JSON.stringify(defaultNoteFont))

  // Sample every 8px inside each card rect and ask the iframe document what
  // sits under the card: no element there may directly own non-whitespace
  // text, i.e. the card never covers body text. Main-page px map to iframe
  // document px by subtracting the iframe rect and dividing out the canvas
  // scale (getBoundingClientRect already carries the transform).
  await page.evaluate(() => {
    const card = document.querySelector('.paper-personal-paper-note[data-note-key="verify-note-1"]')
    if (card) card.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(200)
  const coveredTextSamples = await page.evaluate(() => {
    const iframe = document.querySelector('.paper-personal-paper-iframe')
    const doc = iframe?.contentDocument
    if (!doc || !iframe) return null
    const frameRect = iframe.getBoundingClientRect()
    const scale = frameRect.width / iframe.offsetWidth
    const ownsText = (node) => [...node.childNodes].some((child) => child.nodeType === 3 && /\S/.test(child.textContent ?? ''))
    const samples = []
    for (const card of document.querySelectorAll('.paper-personal-paper-note[data-note-key]')) {
      const box = card.getBoundingClientRect()
      for (let x = box.left + 4; x < box.right; x += 8) {
        for (let y = box.top + 4; y < box.bottom; y += 8) samples.push([x, y])
      }
    }
    const hits = []
    for (const [px, py] of samples) {
      const cx = (px - frameRect.left) / scale
      const cy = (py - frameRect.top) / scale
      const stack = doc.elementsFromPoint(cx, cy)
      if (stack.some((element) => ownsText(element))) hits.push(`${Math.round(px)},${Math.round(py)}`)
    }
    return { samples: samples.length, hits }
  })
  check('note cards never cover body text (8px elementsFromPoint grid under every card)',
    coveredTextSamples !== null && coveredTextSamples.samples > 0 && coveredTextSamples.hits.length === 0,
    JSON.stringify(coveredTextSamples))

  const noteRects = await page.evaluate(() => {
    // Cards live in one layer above the page stack, so a card's page is the
    // overlay whose top interval contains the card's style.top (both in
    // unscaled canvas px).
    const pageOf = (card) => {
      const top = parseFloat(card.style.top)
      const overlay = [...document.querySelectorAll('[data-paper-page-overlay]')]
        .find((node) => top >= parseFloat(node.style.top) && top < parseFloat(node.style.top) + node.offsetHeight)
      return overlay?.getAttribute('data-paper-page-overlay') ?? null
    }
    return [...document.querySelectorAll('.paper-personal-paper-note[data-note-key]')].map((card) => ({
      id: card.getAttribute('data-note-key'),
      page: pageOf(card),
      box: card.getBoundingClientRect(),
    }))
  })
  const overlaps = noteRects.flatMap((a, i) => noteRects.slice(i + 1).flatMap((b) => {
    if (a.page !== b.page || a.page === null) return []
    const width = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left)
    const height = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top)
    return width > 0.5 && height > 0.5 ? [`${a.id}~${b.id}`] : []
  }))
  check('same-page note card rects do not intersect',
    noteRects.length >= 2 && overlaps.length === 0,
    `${JSON.stringify(noteRects.map(({ id, page, box }) => ({ id, page, w: Math.round(box.width), h: Math.round(box.height) })))} overlaps=${JSON.stringify(overlaps)}`)

  // A 40-line auto note has no margin slot big enough: no card, pending notice,
  // then 逐个摆放 + one blank-page click re-homes it to page-position.
  await seedObjects([{
    id: 'verify-note-3',
    type: 'anchored-note',
    document: createPersonalTextDocumentFromPlainText(Array.from({ length: 40 }, (_, line) => `第四条旁注第${line + 1}行`).join('\n')),
    textAnchor: noteAnchor('as a whole different world'),
    placement: { kind: 'auto-near-anchor' },
  }])
  await openPaperView()
  const notePendingNotice = page.locator('.paper-personal-paper-notice:has-text("条旁注在纸上没有空位")')
  await notePendingNotice.waitFor({ timeout: 15_000 })
  check('a 40-line auto note renders no card and shows the no-room notice',
    await noteCard('verify-note-3').count() === 0 && (await notePendingNotice.textContent()).includes('1 条旁注在纸上没有空位'),
    await notePendingNotice.textContent())
  // Both the text-box layer and the note layer can show a 逐个摆放 notice at
  // once; pin the click to the note notice's own copy.
  await page.click('.paper-personal-paper-notice:has-text("条旁注在纸上没有空位") button:has-text("逐个摆放")')
  await page.waitForFunction(() => document.querySelector('.paper-personal-paper-note-layer')?.classList.contains('is-placing'), undefined, { timeout: 5_000 })
  await clickOnPageAt(400, 150)
  await page.waitForSelector('.paper-personal-paper-note[data-note-key="verify-note-3"]', { timeout: 5_000 })
  await flushAutosave()
  const placedNote3 = (await storedNotes()).find((object) => object.id === 'verify-note-3')
  check('逐个摆放 + one page click re-homes the pending note to page-position',
    placedNote3?.placement.kind === 'page-position'
    && placedNote3?.placement.layoutId === layout.layoutId
    && placedNote3?.placement.pageId === 'p1'
    && Math.abs(placedNote3?.placement.xMm - 400 / MM_TO_PX) < 1
    && Math.abs(placedNote3?.placement.yMm - 150 / MM_TO_PX) < 1,
    JSON.stringify(placedNote3?.placement))
  check('the no-room notice is gone once every note is placed',
    await page.locator('.paper-personal-paper-notice:has-text("条旁注在纸上没有空位")').count() === 0)

  // Opening a note card closes an open mark popover and shows the strip.
  await clickMarkCenter('.paper-personal-paper-mark.paper-personal-mark--highlight')
  await page.waitForSelector('.paper-personal-popover', { timeout: 5_000 })
  await selectNote('verify-note-1')
  check('selecting a note card closes the mark popover and opens the note strip',
    await page.locator('.paper-personal-popover').count() === 0
    && await page.locator('.paper-personal-paper-note.is-selected .paper-personal-text-box__strip[aria-label="旁注操作"]').count() === 1)

  // Enter edits in place; Escape commits; emptying the document keeps the note.
  await page.keyboard.press('Enter')
  await page.waitForSelector('.paper-personal-paper-note.is-editing [contenteditable="true"]', { timeout: 5_000 })
  await page.waitForFunction(() => document.activeElement?.classList.contains('eqb-personal-text__input'), undefined, { timeout: 5_000 })
  await page.keyboard.type(' 追加正式测试')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await flushAutosave()
  const editedNote = (await storedNotes()).find((object) => object.id === 'verify-note-1')
  check('Enter + typing + Escape commits the edited note document',
    JSON.stringify(editedNote?.document ?? null).includes('追加正式测试'),
    JSON.stringify(editedNote?.document ?? null))
  await selectNote('verify-note-1')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.paper-personal-paper-note.is-editing [contenteditable="true"]', { timeout: 5_000 })
  await page.waitForFunction(() => document.activeElement?.classList.contains('eqb-personal-text__input'), undefined, { timeout: 5_000 })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await flushAutosave()
  const emptiedNotes = await storedNotes()
  const emptiedNote = emptiedNotes.find((object) => object.id === 'verify-note-1')
  // A blank exit commits nothing: the note survives with its pre-edit text.
  check('emptying a note and exiting keeps the note and restores its text',
    emptiedNote !== undefined
    && await noteCard('verify-note-1').count() === 1
    && JSON.stringify(emptiedNote.document).includes('追加正式测试'),
    `server notes=${emptiedNotes.length} dom=${await page.locator('.paper-personal-paper-note').count()} doc=${JSON.stringify(emptiedNote?.document ?? null)}`)

  // Drag: one version bump, auto -> page-position, rendered width preserved.
  await selectNote('verify-note-1')
  const versionBeforeNoteDrag = await storedVersion()
  const noteWidthMmBefore = await noteCard('verify-note-1').evaluate((node, mmToPx) => parseFloat(node.style.width) / mmToPx, MM_TO_PX)
  const noteDragBox = await noteCard('verify-note-1').boundingBox()
  await page.mouse.move(noteDragBox.x + noteDragBox.width / 2, noteDragBox.y + noteDragBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(noteDragBox.x + noteDragBox.width / 2 + 60, noteDragBox.y + noteDragBox.height / 2 + 40, { steps: 10 })
  await page.mouse.up()
  await flushAutosave()
  const draggedNote = (await storedNotes()).find((object) => object.id === 'verify-note-1')
  check('dragging a note commits one version bump, page-position, and the rendered width',
    (await storedVersion()) === versionBeforeNoteDrag + 1
    && draggedNote?.placement.kind === 'page-position'
    && Math.abs(draggedNote.placement.widthMm - noteWidthMmBefore) < 0.1,
    `version ${versionBeforeNoteDrag} -> ${await storedVersion()}, widthMm ${draggedNote?.placement.widthMm} vs rendered ${noteWidthMmBefore}`)
  await page.keyboard.press('ControlOrMeta+z')
  await flushAutosave()
  const undoneNoteDrag = (await storedNotes()).find((object) => object.id === 'verify-note-1')
  check('undo after a note drag restores the auto-near-anchor placement',
    undoneNoteDrag?.placement.kind === 'auto-near-anchor',
    JSON.stringify(undoneNoteDrag?.placement))

  // Arrow keys: 1mm steps merged into one version; Shift moves 10mm.
  await selectNote('verify-note-1')
  const versionBeforeNoteNudge = await storedVersion()
  // style.left carries the page offset too, but the +3mm delta cancels it.
  const noteXBefore = await noteCard('verify-note-1').evaluate((node, mmToPx) => parseFloat(node.style.left) / mmToPx, MM_TO_PX)
  for (let nudge = 0; nudge < 3; nudge += 1) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(80)
  }
  await flushAutosave()
  const nudgedNote = (await storedNotes()).find((object) => object.id === 'verify-note-1')
  check('ArrowRight x3 nudges the note +3mm in one merged version',
    (await storedVersion()) === versionBeforeNoteNudge + 1
    && Math.abs(nudgedNote?.placement.xMm - (noteXBefore + 3)) < 0.05,
    `version ${versionBeforeNoteNudge} -> ${await storedVersion()}, xMm ${noteXBefore} -> ${nudgedNote?.placement.xMm}`)
  await page.keyboard.press('Shift+ArrowDown')
  await flushAutosave()
  const shiftedNote = (await storedNotes()).find((object) => object.id === 'verify-note-1')
  check('Shift+ArrowDown nudges the note +10mm',
    (await storedVersion()) === versionBeforeNoteNudge + 2
    && Math.abs(shiftedNote?.placement.yMm - (nudgedNote?.placement.yMm + 10)) < 0.05,
    `yMm ${nudgedNote?.placement.yMm} -> ${shiftedNote?.placement.yMm}`)

  // 复制 duplicates with the same anchor at +5mm/+5mm.
  await selectNote('verify-note-1')
  await page.waitForSelector('.paper-personal-paper-note.is-selected .paper-personal-text-box__strip', { timeout: 5_000 })
  await page.click('.paper-personal-paper-note.is-selected .paper-personal-text-box__strip-action[aria-label="复制旁注"]')
  await flushAutosave()
  const notesAfterCopy = await storedNotes()
  const originalNote = notesAfterCopy.find((object) => object.id === 'verify-note-1')
  const copiedNote = notesAfterCopy.find((object) => object.id === 'verify-note-1-copy')
    ?? notesAfterCopy.find((object) => object.id !== 'verify-note-1' && object.id !== 'verify-note-2' && object.id !== 'verify-note-3')
  check('复制旁注 adds one note with the same anchor at +5mm/+5mm',
    notesAfterCopy.length === 4
    && copiedNote
    && JSON.stringify(copiedNote.textAnchor) === JSON.stringify(originalNote.textAnchor)
    && Math.abs(copiedNote.placement.xMm - (originalNote.placement.xMm + 5)) < 0.05
    && Math.abs(copiedNote.placement.yMm - (originalNote.placement.yMm + 5)) < 0.05,
    JSON.stringify({ count: notesAfterCopy.length, copied: copiedNote?.placement }))

  // Resize +20px: width grows and stores at the server's 0.01mm precision.
  await selectNote('verify-note-1')
  const versionBeforeNoteResize = await storedVersion()
  const widthBeforeResize = await noteCard('verify-note-1').evaluate((node, mmToPx) => parseFloat(node.style.width) / mmToPx, MM_TO_PX)
  const handle = page.locator('.paper-personal-paper-note[data-note-key="verify-note-1"].is-selected .paper-personal-text-box__resize-handle')
  const handleBox = await handle.boundingBox()
  if (!handleBox) throw new Error('note resize handle not visible')
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 20, handleBox.y + handleBox.height / 2, { steps: 5 })
  await page.mouse.up()
  await flushAutosave()
  const resizedNote = (await storedNotes()).find((object) => object.id === 'verify-note-1')
  const resizedWidth = resizedNote?.placement.widthMm ?? 0
  check('the note resize handle grows the width and stores two-decimal mm',
    (await storedVersion()) === versionBeforeNoteResize + 1
    && resizedWidth > widthBeforeResize && resizedWidth - widthBeforeResize < 6.5
    && Math.abs(resizedWidth * 100 - Math.round(resizedWidth * 100)) < 1e-6,
    `version ${versionBeforeNoteResize} -> ${await storedVersion()}, widthMm ${widthBeforeResize} -> ${resizedWidth}`)

  // 删除 + undo. Undo re-creates the deleted object under a fresh server id
  // (same restore semantics as the text-box layer's undo), so the restored
  // note is found by its pre-delete placement from here on.
  const notesBeforeDelete = await storedNotes()
  const note1BeforeDelete = notesBeforeDelete.find((object) => object.id === 'verify-note-1')
  await page.click('.paper-personal-paper-note.is-selected .paper-personal-text-box__strip-action[aria-label="删除旁注"]')
  await flushAutosave()
  const notesAfterDelete = await storedNotes()
  check('删除旁注 removes the selected note',
    notesAfterDelete.length === notesBeforeDelete.length - 1 && !notesAfterDelete.some((object) => object.id === 'verify-note-1'),
    `${notesBeforeDelete.length} -> ${notesAfterDelete.length}`)
  await page.keyboard.press('ControlOrMeta+z')
  await flushAutosave()
  const notesAfterUndoDelete = await storedNotes()
  const restoredNote = notesAfterUndoDelete.find((object) => object.id !== 'verify-note-1'
    && JSON.stringify(object.placement) === JSON.stringify(note1BeforeDelete?.placement ?? null))
  check('undo restores the deleted note',
    restoredNote !== undefined && notesAfterUndoDelete.length === notesBeforeDelete.length,
    JSON.stringify(notesAfterUndoDelete.map((object) => object.id)))

  // 回到原文 flashes the note's anchor mark on the paper.
  const restoredNoteId = restoredNote?.id ?? null
  await selectNote(restoredNoteId)
  await page.click('.paper-personal-paper-note.is-selected .paper-personal-text-box__strip-action[aria-label="回到原文"]')
  await page.waitForFunction(
    (noteId) => document.querySelector(`.paper-personal-paper-mark[data-paper-mark-id="${noteId}"]`)?.classList.contains('is-flash'),
    restoredNoteId,
    { timeout: 5_000 },
  )
  check('回到原文 flashes the note anchor mark with is-flash',
    await page.locator(`.paper-personal-paper-mark[data-paper-mark-id="${restoredNoteId}"].is-flash`).count() === 1)

  // Zoom 75%: stored mm, version, and the rendered page-relative position stay.
  const zoomedNotePlacement = async () => (await storedNotes()).find((object) => object.id === restoredNoteId)?.placement ?? null
  const restoredNotePageId = restoredNote?.placement.pageId ?? null
  const zoomedNoteOffsetPx = () => page.evaluate(({ noteId, pageId }) => {
    const card = document.querySelector(`.paper-personal-paper-note[data-note-key="${noteId}"]`)
    // Cards live in one layer above the page stack; the page overlay is found
    // by the placement's pageId, not by DOM containment.
    const overlay = pageId ? document.querySelector(`[data-paper-page-overlay="${pageId}"]`) : null
    if (!card || !overlay) return null
    const cardBox = card.getBoundingClientRect()
    const overlayBox = overlay.getBoundingClientRect()
    const scale = overlayBox.width / overlay.offsetWidth
    return { x: (cardBox.left - overlayBox.left) / scale, y: (cardBox.top - overlayBox.top) / scale }
  }, { noteId: restoredNoteId, pageId: restoredNotePageId })
  const zoomedNoteStyle = () => noteCard(restoredNoteId).evaluate((node) => ({ left: node.style.left, top: node.style.top, width: node.style.width }))
  const noteZoomBefore = {
    version: await storedVersion(),
    placement: await zoomedNotePlacement(),
    style: await zoomedNoteStyle(),
    offsetPx: await zoomedNoteOffsetPx(),
  }
  await setZoom('75%', 'scale(0.75)')
  const noteZoomAfter = {
    version: await storedVersion(),
    placement: await zoomedNotePlacement(),
    style: await zoomedNoteStyle(),
    offsetPx: await zoomedNoteOffsetPx(),
  }
  check('zoom 75% keeps the note placement mm, version, and page-relative position',
    noteZoomBefore.placement !== null
    && noteZoomAfter.version === noteZoomBefore.version
    && JSON.stringify(noteZoomAfter.placement) === JSON.stringify(noteZoomBefore.placement)
    && JSON.stringify(noteZoomAfter.style) === JSON.stringify(noteZoomBefore.style)
    && noteZoomBefore.offsetPx !== null && noteZoomAfter.offsetPx !== null
    && Math.abs(noteZoomAfter.offsetPx.x - noteZoomBefore.offsetPx.x) < 1
    && Math.abs(noteZoomAfter.offsetPx.y - noteZoomBefore.offsetPx.y) < 1,
    JSON.stringify({ before: noteZoomBefore, after: noteZoomAfter }))
  await setZoom('100%', 'scale(1)')

  // The appendix preview must never widen the paper view's scroll area (the
  // horizontal-scroll regression the 4d-A screenshots caught). The shell's
  // own chrome can already overflow the viewport on this QA page, so the
  // assertion is relative: the scroll width must not grow when the appendix
  // appears, and no horizontal scroll may be left behind.
  const scrollAreaState = () => page.evaluate(() => {
    // The paper view scrolls on the document (no inner scrollable ancestor).
    const element = document.scrollingElement
    return { scrollWidth: element?.scrollWidth ?? 0, clientWidth: element?.clientWidth ?? 0, scrollLeft: element?.scrollLeft ?? 0 }
  })
  await selectNote(restoredNoteId)
  const scrollBeforeAppendix = await scrollAreaState()
  await page.click('.paper-personal-paper-note.is-selected .paper-personal-text-box__strip-action[aria-label="转到附页"]')
  await page.waitForSelector('.paper-personal-appendix-preview', { timeout: 5_000 })
  const scrollAfterAppendix = await scrollAreaState()
  check('the appendix preview never widens the paper view scroll area',
    scrollAfterAppendix.scrollWidth <= Math.max(scrollBeforeAppendix.scrollWidth, scrollAfterAppendix.clientWidth) + 1
    && scrollAfterAppendix.scrollLeft === 0,
    `scrollWidth ${scrollBeforeAppendix.scrollWidth} -> ${scrollAfterAppendix.scrollWidth}, clientWidth ${scrollAfterAppendix.clientWidth}, scrollLeft ${scrollAfterAppendix.scrollLeft}`)

  // ---- appendix finish-up (#489 4d-B) ----------------------------------------
  // Both strips' 转到附页, the notice shortcuts, entry editing, numbering,
  // return flows and undo — against the real server like every section above.
  // The 4d-A check left one appendix object behind; start from an empty
  // appendix so entry numbers are deterministic.
  const storedAppendix = async () => (await readLayer()).layer?.objects?.filter((object) => object.placement?.kind === 'appendix') ?? []
  const deleteObjects = async (objects) => {
    if (objects.length === 0) return
    await postOperations(objects.map((object) => ({ op: 'delete', objectId: object.id })), 'verify-cleanup')
  }
  // The 4d-A check's 转到附页 op may still ride the autosave debounce; flush
  // before reading the appendix, or the cleanup below misses it.
  await flushAutosave()
  await deleteObjects(await storedAppendix())
  const scrollBaseline = await scrollAreaState()

  // (a) the note strip's 转到附页.
  await seedObjects([{
    id: 'verify-appendix-note-1',
    type: 'anchored-note',
    document: createPersonalTextDocumentFromPlainText('转附页测试旁注。'),
    textAnchor: noteAnchor('as a whole different world'),
    placement: { kind: 'auto-near-anchor' },
  }])
  await openPaperView()
  await selectNote('verify-appendix-note-1')
  await page.click('.paper-personal-paper-note.is-selected .paper-personal-text-box__strip-action[aria-label="转到附页"]')
  await page.waitForSelector('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="verify-appendix-note-1"]', { timeout: 5_000 })
  await flushAutosave()
  const appendixNote = (await storedNotes()).find((object) => object.id === 'verify-appendix-note-1')
  check('the note strip 转到附页 stores an appendix placement with a page-position origin',
    appendixNote?.placement.kind === 'appendix' && appendixNote?.placement.origin?.kind === 'page-position',
    JSON.stringify(appendixNote?.placement))
  check('转到附页 removes the paper card and leaves the 附1 marker',
    await noteCard('verify-appendix-note-1').count() === 0
    && (await page.locator('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="verify-appendix-note-1"]').textContent()) === '附1')
  check('the appendix preview shows exactly one entry numbered 附1',
    await page.locator('.paper-personal-appendix-preview').count() === 1
    && await page.locator('.paper-personal-appendix-entry').count() === 1
    && (await page.locator('.paper-personal-appendix-entry > .paper-personal-appendix-marker').textContent()) === '附1')

  // (b) the text-box strip's 转到附页 keeps the whole placement as the origin;
  // the paper marker sits at that origin.
  await seedObjects([{
    id: 'verify-appendix-box-1',
    type: 'text-box',
    document: createPersonalTextDocumentFromPlainText('转附页测试文字框'),
    placement: { kind: 'page-position', layoutId: layout.layoutId, pageId: 'p1', xMm: 30, yMm: 40, widthMm: 60 },
  }])
  await openPaperView()
  await page.locator('.paper-personal-text-box[data-box-key="verify-appendix-box-1"]').click()
  await page.waitForSelector('.paper-personal-text-box.is-selected .paper-personal-text-box__strip', { timeout: 5_000 })
  await page.click('.paper-personal-text-box.is-selected .paper-personal-text-box__strip-action[aria-label="转到附页"]')
  await page.waitForSelector('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="verify-appendix-box-1"]', { timeout: 5_000 })
  await flushAutosave()
  const appendixBox = (await storedTextBoxes()).find((object) => object.id === 'verify-appendix-box-1')
  check('the text-box strip 转到附页 keeps the whole placement as the origin',
    appendixBox?.placement.kind === 'appendix'
    && appendixBox?.placement.origin?.layoutId === layout.layoutId
    && appendixBox?.placement.origin?.pageId === 'p1'
    && appendixBox?.placement.origin?.xMm === 30
    && appendixBox?.placement.origin?.yMm === 40
    && appendixBox?.placement.origin?.widthMm === 60,
    JSON.stringify(appendixBox?.placement))
  const boxMarkerMm = await page.evaluate(({ mmToPx }) => {
    const marker = document.querySelector('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="verify-appendix-box-1"]')
    const overlay = document.querySelector('[data-paper-page-overlay="p1"]')
    if (!marker || !overlay) return null
    return {
      xMm: (parseFloat(marker.style.left) - parseFloat(overlay.style.left)) / mmToPx,
      yMm: (parseFloat(marker.style.top) - parseFloat(overlay.style.top)) / mmToPx,
    }
  }, { mmToPx: MM_TO_PX })
  check('the text-box appendix marker sits at the confirmed origin (±1mm)',
    boxMarkerMm !== null && Math.abs(boxMarkerMm.xMm - 30) < 1 && Math.abs(boxMarkerMm.yMm - 40) < 1,
    JSON.stringify(boxMarkerMm))

  // (c) numbering follows the sources' page order and renumbers live.
  const pageTwoId = layout.pages[1]?.pageId
  if (!pageTwoId) throw new Error('fixture layout has fewer than two pages')
  await seedObjects([{
    id: 'verify-appendix-box-2',
    type: 'text-box',
    document: createPersonalTextDocumentFromPlainText('第二条附页文字框'),
    placement: { kind: 'appendix', origin: { kind: 'page-position', layoutId: layout.layoutId, pageId: pageTwoId, xMm: 30, yMm: 40, widthMm: 60 } },
  }])
  await openPaperView()
  const entryNumber = async (objectId) => {
    const label = await page.locator(`[data-appendix-entry="${objectId}"] > .paper-personal-appendix-marker`).textContent()
    return Number((label ?? '').slice(1))
  }
  const appendixNumber1 = await entryNumber('verify-appendix-box-1')
  const appendixNumber2 = await entryNumber('verify-appendix-box-2')
  check('appendix numbering follows the page order of the source placements',
    appendixNumber1 >= 1 && appendixNumber2 > appendixNumber1,
    `box-1=附${appendixNumber1} box-2=附${appendixNumber2}`)

  // (d) 移回卷面: box → origin placement, note → auto-near-anchor; the numbers
  // renumber live and the empty appendix dismisses the preview.
  await page.click('[data-appendix-entry="verify-appendix-box-1"] button:has-text("移回卷面")')
  await flushAutosave()
  const movedBackBox = (await storedTextBoxes()).find((object) => object.id === 'verify-appendix-box-1')
  check('移回卷面 puts the text box back at its origin placement',
    movedBackBox?.placement.kind === 'page-position'
    && movedBackBox?.placement.layoutId === layout.layoutId
    && movedBackBox?.placement.pageId === 'p1'
    && movedBackBox?.placement.xMm === 30
    && movedBackBox?.placement.yMm === 40
    && movedBackBox?.placement.widthMm === 60,
    JSON.stringify(movedBackBox?.placement))
  const renumbered = await entryNumber('verify-appendix-box-2')
  check('移回卷面 renumbers the remaining entries',
    renumbered === appendixNumber2 - 1 && renumbered >= 1,
    `box-2 附${appendixNumber2} -> 附${renumbered}`)
  await page.click('[data-appendix-entry="verify-appendix-note-1"] button:has-text("移回卷面")')
  await flushAutosave()
  const movedBackNote = (await storedNotes()).find((object) => object.id === 'verify-appendix-note-1')
  check('移回卷面 restores the note as auto-near-anchor and the card reappears',
    movedBackNote?.placement.kind === 'auto-near-anchor'
    && await noteCard('verify-appendix-note-1').count() === 1,
    JSON.stringify(movedBackNote?.placement))
  check('the last remaining entry renumbers to 附1',
    (await page.locator('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="verify-appendix-box-2"]').textContent()) === '附1')
  await page.click('[data-appendix-entry="verify-appendix-box-2"] button:has-text("移回卷面")')
  await flushAutosave()
  const movedBackBox2 = (await storedTextBoxes()).find((object) => object.id === 'verify-appendix-box-2')
  check('the second box returns to its origin placement too',
    movedBackBox2?.placement.kind === 'page-position' && movedBackBox2?.placement.pageId === pageTwoId
    && movedBackBox2?.placement.xMm === 30 && movedBackBox2?.placement.yMm === 40,
    JSON.stringify(movedBackBox2?.placement))
  check('an empty appendix dismisses the preview',
    await page.locator('.paper-personal-appendix-preview').count() === 0
    && (await storedAppendix()).length === 0)

  // (e) 转到附页 is one undoable placement op.
  const boxPlacement = async () => (await storedTextBoxes()).find((object) => object.id === 'verify-appendix-box-1')?.placement ?? null
  await page.locator('.paper-personal-text-box[data-box-key="verify-appendix-box-1"]').click()
  await page.waitForSelector('.paper-personal-text-box.is-selected .paper-personal-text-box__strip', { timeout: 5_000 })
  await page.click('.paper-personal-text-box.is-selected .paper-personal-text-box__strip-action[aria-label="转到附页"]')
  await flushAutosave()
  check('转到附页 stores the appendix placement again', (await boxPlacement())?.kind === 'appendix', JSON.stringify(await boxPlacement()))
  await page.keyboard.press('ControlOrMeta+z')
  await flushAutosave()
  const undoneAppendix = await boxPlacement()
  check('undo reverts 转到附页 to the origin placement',
    undoneAppendix?.kind === 'page-position'
    && undoneAppendix?.layoutId === layout.layoutId && undoneAppendix?.pageId === 'p1'
    && undoneAppendix?.xMm === 30 && undoneAppendix?.yMm === 40 && undoneAppendix?.widthMm === 60,
    JSON.stringify(undoneAppendix))
  await page.keyboard.press('Shift+ControlOrMeta+z')
  await flushAutosave()
  check('redo reapplies 转到附页', (await boxPlacement())?.kind === 'appendix', JSON.stringify(await boxPlacement()))

  // (f) clicking the paper marker selects the preview entry, vertical only.
  await page.evaluate((objectId) => {
    const marker = document.querySelector(`.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="${objectId}"]`)
    if (!marker) return
    const rect = marker.getBoundingClientRect()
    window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight / 2 })
  }, 'verify-appendix-box-1')
  const appendixMarkerBox = await page.locator('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="verify-appendix-box-1"]').boundingBox()
  if (!appendixMarkerBox) throw new Error('appendix marker not visible')
  await page.mouse.click(appendixMarkerBox.x + appendixMarkerBox.width / 2, appendixMarkerBox.y + appendixMarkerBox.height / 2)
  await page.waitForFunction(() => document.querySelector('[data-appendix-entry="verify-appendix-box-1"]')?.classList.contains('is-selected'), undefined, { timeout: 5_000 })
  check('clicking the paper marker selects the preview entry without horizontal scroll',
    await page.locator('[data-appendix-entry="verify-appendix-box-1"].is-selected').count() === 1
    && await page.evaluate(() => document.scrollingElement?.scrollLeft ?? 0) === 0)

  // (g) 回到原处 flashes the paper marker.
  await page.click('[data-appendix-entry="verify-appendix-box-1"] button:has-text("回到原处")')
  await page.waitForFunction((objectId) => document.querySelector(`.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="${objectId}"]`)?.classList.contains('is-flash'), 'verify-appendix-box-1', { timeout: 5_000 })
  check('回到原处 flashes the paper marker with is-flash',
    await page.locator('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="verify-appendix-box-1"].is-flash').count() === 1)

  // (h) in-place entry editing: double-click opens, Escape commits, emptying
  // the editor restores the stored text.
  await page.click('[data-appendix-entry="verify-appendix-box-1"] .paper-personal-appendix-entry-body', { clickCount: 2 })
  await page.waitForSelector('.paper-personal-appendix-entry.is-editing [contenteditable="true"]', { timeout: 5_000 })
  await page.waitForFunction(() => document.activeElement?.classList.contains('eqb-personal-text__input'), undefined, { timeout: 5_000 })
  await page.keyboard.type('附页增补测试')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await flushAutosave()
  const editedAppendixBox = (await storedTextBoxes()).find((object) => object.id === 'verify-appendix-box-1')
  check('double-click opens the entry editor and Escape commits the text',
    JSON.stringify(editedAppendixBox?.document ?? null).includes('附页增补测试'),
    JSON.stringify(editedAppendixBox?.document ?? null))
  await page.click('[data-appendix-entry="verify-appendix-box-1"] .paper-personal-appendix-entry-body', { clickCount: 2 })
  await page.waitForSelector('.paper-personal-appendix-entry.is-editing [contenteditable="true"]', { timeout: 5_000 })
  await page.waitForFunction(() => document.activeElement?.classList.contains('eqb-personal-text__input'), undefined, { timeout: 5_000 })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await flushAutosave()
  const emptiedAppendixBox = (await storedTextBoxes()).find((object) => object.id === 'verify-appendix-box-1')
  check('emptying the entry editor and exiting restores the stored text',
    emptiedAppendixBox !== undefined
    && JSON.stringify(emptiedAppendixBox.document).includes('附页增补测试')
    && await page.locator('[data-appendix-entry="verify-appendix-box-1"]').count() === 1,
    JSON.stringify(emptiedAppendixBox?.document ?? null))

  // (i) Delete removes the selected appendix object with its marker and entry.
  await page.click('[data-appendix-entry="verify-appendix-box-1"] .paper-personal-appendix-entry-body')
  await page.waitForFunction(() => document.querySelector('[data-appendix-entry="verify-appendix-box-1"]')?.classList.contains('is-selected'), undefined, { timeout: 5_000 })
  await page.keyboard.press('Delete')
  await flushAutosave()
  check('Delete removes the selected appendix entry and its paper marker',
    !(await storedTextBoxes()).some((object) => object.id === 'verify-appendix-box-1')
    && await page.locator('[data-appendix-entry="verify-appendix-box-1"]').count() === 0
    && await page.locator('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="verify-appendix-box-1"]').count() === 0)

  // (j) a hand-placed note past the page bottom gets the overflow flag and
  // notice; the notice's 转到附页 moves the first overflowing note.
  await seedObjects([{
    id: 'verify-note-overflow',
    type: 'anchored-note',
    document: createPersonalTextDocumentFromPlainText(Array.from({ length: 12 }, (_, line) => `溢出旁注第${line + 1}行，这一行故意写得比较长以便撑高卡片。`).join('\n')),
    textAnchor: noteAnchor('as a whole different world'),
    placement: { kind: 'page-position', layoutId: layout.layoutId, pageId: 'p1', xMm: 20, yMm: 275, widthMm: 56 },
  }])
  await openPaperView()
  const noteOverflowNotice = page.locator('.paper-personal-paper-notice:has-text("条旁注超出纸张")')
  await noteOverflowNotice.waitFor({ timeout: 15_000 })
  check('a page-position note past the page bottom is flagged and counted',
    await page.locator('.paper-personal-paper-note[data-note-key="verify-note-overflow"][data-overflow="true"]').count() === 1
    && (await noteOverflowNotice.textContent()).includes('1 条旁注超出纸张'),
    await noteOverflowNotice.textContent())
  await page.click('.paper-personal-paper-notice:has-text("条旁注超出纸张") button:has-text("转到附页")')
  await flushAutosave()
  await page.waitForFunction(() => !(document.querySelector('.paper-personal-paper-notice')?.textContent ?? '').includes('条旁注超出纸张'), undefined, { timeout: 5_000 })
  const movedOverflowNote = (await storedNotes()).find((object) => object.id === 'verify-note-overflow')
  check('the overflow notice 转到附页 moves the first overflowing note to the appendix',
    movedOverflowNote?.placement.kind === 'appendix'
    && movedOverflowNote?.placement.origin?.kind === 'page-position'
    && await page.locator('.paper-personal-paper-note[data-overflow="true"]').count() === 0
    && await noteOverflowNotice.count() === 0,
    JSON.stringify(movedOverflowNote?.placement))

  // (k) the no-room notice's 转到附页 moves the first pending note without an
  // origin; the anchor still maps, so the marker and page number stay.
  await seedObjects([{
    id: 'verify-note-pending',
    type: 'anchored-note',
    document: createPersonalTextDocumentFromPlainText(Array.from({ length: 40 }, (_, line) => `没有空位旁注第${line + 1}行`).join('\n')),
    textAnchor: noteAnchor('most of my classmates thought of Ohio'),
    placement: { kind: 'auto-near-anchor' },
  }])
  await openPaperView()
  const pendingNoticeAgain = page.locator('.paper-personal-paper-notice:has-text("条旁注在纸上没有空位")')
  await pendingNoticeAgain.waitFor({ timeout: 15_000 })
  await page.click('.paper-personal-paper-notice:has-text("条旁注在纸上没有空位") button:has-text("转到附页")')
  await flushAutosave()
  await page.waitForFunction(() => !(document.querySelector('.paper-personal-paper-notice')?.textContent ?? '').includes('条旁注在纸上没有空位'), undefined, { timeout: 5_000 })
  const movedPendingNote = (await storedNotes()).find((object) => object.id === 'verify-note-pending')
  check('the no-room notice 转到附页 moves the first pending note with a null origin',
    movedPendingNote?.placement.kind === 'appendix' && movedPendingNote?.placement.origin === null,
    JSON.stringify(movedPendingNote?.placement))
  const pendingSourceLine = await page.locator('[data-appendix-entry="verify-note-pending"] .paper-personal-appendix-entry-source').textContent()
  check('the no-origin appendix note still gets a marker and a page number from its anchor',
    await page.locator('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="verify-note-pending"]').count() === 1
    && /^第 \d+ 页/.test(pendingSourceLine ?? ''),
    `source=${JSON.stringify(pendingSourceLine)}`)

  // (l) the appendix preview still never widens the paper view scroll area.
  const scrollAreaAtEnd = await scrollAreaState()
  check('the appendix preview still never widens the paper view scroll area',
    scrollAreaAtEnd.scrollWidth <= Math.max(scrollBaseline.scrollWidth, scrollAreaAtEnd.clientWidth) + 1
    && scrollAreaAtEnd.scrollLeft === 0,
    `scrollWidth ${scrollBaseline.scrollWidth} -> ${scrollAreaAtEnd.scrollWidth}, scrollLeft ${scrollAreaAtEnd.scrollLeft}`)

  // (m) an appendix marker whose margin spot is taken by a remaining note
  // card dodges the card instead of stacking on it (5c fix). Measure the
  // marker's resting rect first, park a note card exactly on it, then the
  // marker must re-render clear of that card.
  await seedObjects([{
    id: 'verify-appendix-marker-dodge',
    type: 'anchored-note',
    document: createPersonalTextDocumentFromPlainText('标记默认位被占的旁注。'),
    textAnchor: noteAnchor('most of my classmates thought of Ohio'),
    placement: { kind: 'appendix', origin: null },
  }])
  await openPaperView()
  const restingMarkerRect = await page.evaluate(({ mmToPx }) => {
    const marker = document.querySelector('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="verify-appendix-marker-dodge"]')
    if (!marker) return null
    // Page-internal mm via the marker's own page overlay (the anchor can sit
    // on any page; document px alone would point at the wrong one).
    const overlays = [...document.querySelectorAll('[data-paper-page-overlay]')].map((node) => ({
      pageId: node.getAttribute('data-paper-page-overlay'),
      left: parseFloat(node.style.left),
      top: parseFloat(node.style.top),
      width: node.offsetWidth,
      height: node.offsetHeight,
    }))
    const left = parseFloat(marker.style.left)
    const top = parseFloat(marker.style.top)
    const overlay = overlays.find((o) => top >= o.top && top < o.top + o.height && left >= o.left && left < o.left + o.width)
    if (!overlay) return null
    return {
      pageId: overlay.pageId,
      xMm: (left - overlay.left) / mmToPx,
      yMm: (top - overlay.top) / mmToPx,
    }
  }, { mmToPx: MM_TO_PX })
  if (!restingMarkerRect) throw new Error('dodge marker did not render a resting rect')
  // The parked card starts at the marker rect's left/top and is far bigger
  // than the chip, so the un-avoided marker sits fully inside it.
  await seedObjects([{
    id: 'verify-note-marker-block',
    type: 'anchored-note',
    document: createPersonalTextDocumentFromPlainText('占住标记默认位的旁注。'),
    textAnchor: noteAnchor('as a whole different world'),
    placement: { kind: 'page-position', layoutId: layout.layoutId, pageId: restingMarkerRect.pageId, xMm: restingMarkerRect.xMm, yMm: restingMarkerRect.yMm, widthMm: 56 },
  }])
  await openPaperView()
  const dodgeState = await page.evaluate(({ mmToPx }) => {
    const marker = document.querySelector('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker="verify-appendix-marker-dodge"]')
    const card = document.querySelector('.paper-personal-paper-note[data-note-key="verify-note-marker-block"]')
    if (!marker || !card) return null
    const overlays = [...document.querySelectorAll('[data-paper-page-overlay]')].map((node) => ({
      pageId: node.getAttribute('data-paper-page-overlay'),
      left: parseFloat(node.style.left),
      top: parseFloat(node.style.top),
      width: node.offsetWidth,
      height: node.offsetHeight,
    }))
    // Both rects on the card's own page (its data-page-id), unscaled layout
    // px, 1mm clearance on all sides.
    const overlay = overlays.find((o) => o.pageId === card.getAttribute('data-page-id'))
    if (!overlay) return null
    const gapPx = mmToPx
    const m = { left: parseFloat(marker.style.left), top: parseFloat(marker.style.top), width: marker.offsetWidth, height: marker.offsetHeight }
    const c = { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight }
    const clear = m.left + m.width + gapPx <= c.left || c.left + c.width + gapPx <= m.left
      || m.top + m.height + gapPx <= c.top || c.top + c.height + gapPx <= m.top
    return {
      clear,
      markerMm: { xMm: (m.left - overlay.left) / mmToPx, yMm: (m.top - overlay.top) / mmToPx },
      cardMm: { xMm: (c.left - overlay.left) / mmToPx, yMm: (c.top - overlay.top) / mmToPx, widthMm: c.width / mmToPx, heightMm: c.height / mmToPx },
    }
  }, { mmToPx: MM_TO_PX })
  check('an appendix marker whose spot a note card occupies renders clear of that card',
    dodgeState != null && dodgeState.clear
    && (dodgeState.markerMm.yMm !== restingMarkerRect.yMm || dodgeState.markerMm.xMm !== restingMarkerRect.xMm),
    JSON.stringify({ resting: restingMarkerRect, ...dodgeState }))

  // ---- 5b alignment: the export measure pass agrees with the preview -----------
  // The spec's strongest guarantee: the same paginatedHtml and the same
  // stored objects run through measurePersonalExportPlan must place cards,
  // markers and highlight rects within a fraction of a millimetre of the
  // preview the teacher is looking at.
  const exportPlan = await measurePersonalExportPlan({
    paginatedHtml: layout.paginatedHtml,
    layoutId: layout.layoutId,
    layoutRef: layout.layoutRef,
    source: buildPersonalLayerSource(consumption),
    objects: (await readLayer()).layer.objects,
  })
  const previewGeometry = await page.evaluate(({ mmToPx }) => {
    const overlays = [...document.querySelectorAll('[data-paper-page-overlay]')].map((node) => ({
      pageId: node.getAttribute('data-paper-page-overlay'),
      left: parseFloat(node.style.left),
      top: parseFloat(node.style.top),
      width: node.offsetWidth,
      height: node.offsetHeight,
    }))
    // Card style.left/top carry the page offset (document px); the page is
    // the overlay whose interval contains the point. offsetHeight/offsetWidth
    // are unscaled layout px at every zoom level.
    const rel = (node) => {
      const left = parseFloat(node.style.left)
      const top = parseFloat(node.style.top)
      const overlay = overlays.find((o) => top >= o.top && top < o.top + o.height
        && left >= o.left && left < o.left + o.width)
      if (!overlay) return null
      return {
        pageId: overlay.pageId,
        xMm: (left - overlay.left) / mmToPx,
        yMm: (top - overlay.top) / mmToPx,
        widthMm: parseFloat(node.style.width) / mmToPx,
        heightMm: node.offsetHeight / mmToPx,
      }
    }
    return {
      cards: [...document.querySelectorAll('.paper-personal-paper-note[data-note-key], .paper-personal-text-box[data-box-key]')]
        .map((node) => ({ objectId: node.getAttribute('data-note-key') ?? node.getAttribute('data-box-key'), box: rel(node) })),
      markers: [...document.querySelectorAll('.paper-personal-paper-appendix-layer .paper-personal-appendix-marker[data-paper-appendix-marker]')]
        .map((node) => ({ objectId: node.getAttribute('data-paper-appendix-marker'), label: node.textContent, box: rel(node) })),
      marks: [...document.querySelectorAll('.paper-personal-paper-mark[data-paper-mark-id]')]
        .map((node) => ({ objectId: node.getAttribute('data-paper-mark-id'), box: rel(node) })),
    }
  }, { mmToPx: MM_TO_PX })

  const cardDrift = { pos: 0, height: 0 }
  const missingCards = []
  for (const previewCard of previewGeometry.cards) {
    const planCard = exportPlan.cards.find((card) => card.objectId === previewCard.objectId)
    if (!previewCard.box || !planCard) {
      missingCards.push(previewCard.objectId)
      continue
    }
    cardDrift.pos = Math.max(
      cardDrift.pos,
      Math.abs(planCard.xMm - previewCard.box.xMm),
      Math.abs(planCard.yMm - previewCard.box.yMm),
      Math.abs(planCard.widthMm - previewCard.box.widthMm),
    )
    cardDrift.height = Math.max(cardDrift.height, Math.abs(planCard.heightMm - previewCard.box.heightMm))
  }
  check('every preview card appears in the export plan at the same page',
    previewGeometry.cards.length > 0 && missingCards.length === 0
    && previewGeometry.cards.every((card) => card.box != null)
    && previewGeometry.cards.every((card) => exportPlan.cards.find((plan) => plan.objectId === card.objectId)?.pageId === card.box.pageId),
    JSON.stringify({ preview: previewGeometry.cards.map((card) => card.objectId), plan: exportPlan.cards.map((card) => card.objectId), missing: missingCards }))
  check('export plan cards match the preview within 0.2mm (height 0.5mm)',
    cardDrift.pos <= 0.2 && cardDrift.height <= 0.5,
    `max pos/width Δ ${cardDrift.pos.toFixed(3)}mm, height Δ ${cardDrift.height.toFixed(3)}mm\n${previewGeometry.cards.map((card) => {
      const planCard = exportPlan.cards.find((plan) => plan.objectId === card.objectId)
      return `${card.objectId}: preview=${JSON.stringify(card.box && { w: card.box.widthMm, h: card.box.heightMm })} plan=${planCard ? JSON.stringify({ w: planCard.widthMm, h: planCard.heightMm }) : 'MISSING'}`
    }).join('\n')}`)

  const markerDrift = { pos: 0, numbers: [] }
  const missingMarkers = []
  for (const previewMarker of previewGeometry.markers) {
    const planMarker = exportPlan.markers.find((marker) => marker.objectId === previewMarker.objectId)
    if (!previewMarker.box || !planMarker) {
      missingMarkers.push(previewMarker.objectId)
      continue
    }
    markerDrift.pos = Math.max(
      markerDrift.pos,
      Math.abs(planMarker.xMm - previewMarker.box.xMm),
      Math.abs(planMarker.yMm - previewMarker.box.yMm),
    )
    if (Number(previewMarker.label?.slice(1)) !== planMarker.number) {
      markerDrift.numbers.push(`${previewMarker.label} vs 附${planMarker.number}`)
    }
  }
  check('export plan markers match the preview markers within 0.2mm and same numbers',
    previewGeometry.markers.length > 0 && missingMarkers.length === 0
      && markerDrift.pos <= 0.2 && markerDrift.numbers.length === 0,
    JSON.stringify({ missing: missingMarkers, ...markerDrift }))

  const previewMarksByObject = new Map()
  for (const mark of previewGeometry.marks) {
    if (!mark.box) continue
    if (!previewMarksByObject.has(mark.objectId)) previewMarksByObject.set(mark.objectId, [])
    previewMarksByObject.get(mark.objectId).push(mark.box)
  }
  const markDrift = { pos: 0, countMismatches: [] }
  const comparedMarks = []
  for (const planMark of exportPlan.marks) {
    const previewRects = (previewMarksByObject.get(planMark.objectId) ?? [])
      .sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm)
    const planRects = [...planMark.rectsMm].sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm)
    if (previewRects.length !== planRects.length) {
      markDrift.countMismatches.push(`${planMark.objectId}: preview ${previewRects.length} vs plan ${planRects.length}`)
      continue
    }
    comparedMarks.push(planMark.objectId)
    for (const [index, planRect] of planRects.entries()) {
      markDrift.pos = Math.max(
        markDrift.pos,
        Math.abs(planRect.xMm - previewRects[index].xMm),
        Math.abs(planRect.yMm - previewRects[index].yMm),
        Math.abs(planRect.widthMm - previewRects[index].widthMm),
        Math.abs(planRect.heightMm - previewRects[index].heightMm),
      )
    }
  }
  check('export plan mark rects match the preview fragments within 0.2mm',
    comparedMarks.length > 0 && markDrift.pos <= 0.2 && markDrift.countMismatches.length === 0,
    JSON.stringify({ compared: comparedMarks, ...markDrift }))
  console.log(`export-plan alignment: cards/markers/marks max Δ ${Math.max(cardDrift.pos, markerDrift.pos, markDrift.pos).toFixed(3)}mm`)

  // ---- 5d-2 export button flow -------------------------------------------------
  // 导出前先等自动保存落定（绝不悄悄导出较旧的已保存版本），成功触发真实下
  // 载并报出文件对应的版本；离线阻止导出；422 逐对象诊断可以「查看」跳回对象。
  const exportPosts = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/personal-paper-layers\/[^/]+\/exports$/.test(new URL(request.url()).pathname)) {
      exportPosts.push(JSON.parse(request.postData() ?? '{}'))
    }
  })
  const exportButton = page.locator('.paper-browse-export-option')
  check('the paper view toolbar shows 导出我的批注版', await exportButton.count() === 1)

  // 工具条高度与纸张首页顶部（文档坐标）在任何导出提示出现前后都必须一致。
  const toolbarMetrics = () => page.evaluate(() => {
    const toolbar = document.querySelector('.paper-browse-editing-toolbar')?.getBoundingClientRect()
    const firstPage = document.querySelector('[data-paper-page-overlay]')?.getBoundingClientRect()
    const scrolling = document.scrollingElement
    return {
      toolbarHeight: toolbar?.height ?? null,
      pageTop: firstPage && scrolling ? firstPage.top + scrolling.scrollTop : null,
    }
  })
  const metricsClose = (a, b) => a !== null && b !== null
    && Math.abs(a.toolbarHeight - b.toolbarHeight) < 0.5
    && Math.abs(a.pageTop - b.pageTop) < 1

  // The undo checks deliberately left a foreign-layout box in the layer; the
  // export refuses it by design (layout-mismatch). Remove it so the happy
  // path below can produce a file, and reload to drop the old-layout notice.
  await deleteObjects((await readLayer()).layer.objects.filter((object) => object.placement?.layoutId === 'old-layout-1990'))
  await openPaperView()

  // An unsaved edit is flushed first: the nudge is still inside the autosave
  // debounce when the export starts, so the POST must carry versionAtClick + 1.
  await page.locator('.paper-personal-paper-note[data-note-key]').first().click()
  const versionAtClick = await storedVersion()
  await page.keyboard.press('ArrowRight')
  const metricsIdle = await toolbarMetrics()
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
  await exportButton.click()
  const download = await downloadPromise
  check('exporting fires a real download whose file name ends with 我的批注版.pdf',
    download.suggestedFilename().endsWith('我的批注版.pdf'), download.suggestedFilename())
  const exportBodySent = exportPosts.at(-1)
  check('the export POST carries the flushed layerVersion, sourceRevision and layoutId',
    exportBodySent
    && exportBodySent.layerVersion === versionAtClick + 1
    && exportBodySent.sourceRevision === sourceRevision
    && exportBodySent.layoutId === layout.layoutId,
    JSON.stringify({ sent: exportBodySent, versionAtClick }))
  const successNotice = page.locator('.paper-personal-paper-notice:has-text("已导出第")')
  await successNotice.waitFor({ timeout: 10_000 })
  const successVersion = (await successNotice.textContent())?.match(/已导出第 (\d+) 版批注/)?.[1]
  check('the success notice names the saved version',
    successVersion != null && Number(successVersion) === await storedVersion(),
    await successNotice.textContent())
  check('the one-line success notice does not shift the toolbar or the paper',
    metricsClose(metricsIdle, await toolbarMetrics()),
    JSON.stringify({ idle: metricsIdle, withSuccess: await toolbarMetrics() }))

  // An edit after the export must leave the notice without claiming currency.
  await page.locator('.paper-personal-paper-note[data-note-key]').first().click()
  await page.keyboard.press('ArrowRight')
  const staleExportNotice = page.locator('.paper-personal-paper-notice:has-text("不含之后的修改")')
  await staleExportNotice.waitFor({ timeout: 5_000 })
  check('an edit after the export rewords the notice to an earlier version',
    await staleExportNotice.count() === 1
    && (await staleExportNotice.textContent()).includes(`第 ${successVersion} 版`),
    await staleExportNotice.textContent())
  await flushAutosave()

  // Offline blocks the export before any POST (the nudge below is unsaved).
  await context.setOffline(true)
  await page.locator('.paper-personal-paper-note[data-note-key]').first().click()
  await page.keyboard.press('ArrowRight')
  const exportPostsBeforeOffline = exportPosts.length
  await exportButton.click()
  const offlineNotice = page.locator('.paper-personal-paper-notice:has-text("网络已断开")')
  await offlineNotice.waitFor({ timeout: 5_000 })
  check('offline blocks the export with a next-step notice and no POST',
    await offlineNotice.count() === 1 && exportPosts.length === exportPostsBeforeOffline,
    JSON.stringify({
      noticeCount: await offlineNotice.count(),
      noticeText: await offlineNotice.textContent(),
      posts: exportPosts.length,
      before: exportPostsBeforeOffline,
    }))
  await context.setOffline(false)
  await flushAutosave()

  // 422 diagnostics: a floating panel under the export button lists one row
  // per object with a human reason, 查看 selects the object and scrolls it
  // into view (vertical only), Escape closes and refocuses the button, and
  // nothing in the toolbar row moves while the panel is open.
  const lastPageId = layout.pages[layout.pages.length - 1].pageId
  await seedObjects([{
    id: 'verify-export-diag',
    type: 'text-box',
    document: createPersonalTextDocumentFromPlainText('导出诊断定位用文字框'),
    placement: { kind: 'page-position', layoutId: layout.layoutId, pageId: lastPageId, xMm: 30, yMm: 40, widthMm: 60 },
  }])
  await openPaperView()
  await page.route('**/api/personal-paper-layers/**/exports', (route) => route.fulfill({
    status: 422,
    contentType: 'application/json',
    body: JSON.stringify({
      error: '批注存在未解出的问题，已拒绝导出',
      code: 'PERSONAL_EXPORT_HAS_DIAGNOSTICS',
      diagnostics: [{ objectId: 'verify-export-diag', code: 'anchor-unresolved' }],
    }),
  }))
  await page.evaluate(() => window.scrollTo(0, 0))
  const metricsBeforePanel = await toolbarMetrics()
  await exportButton.click()
  const diagnosticsPanel = page.locator('.paper-personal-export-diagnostics')
  await diagnosticsPanel.waitFor({ timeout: 5_000 })
  check('a 422 opens a floating panel listing one row per problem object with a human reason',
    await diagnosticsPanel.count() === 1
    && (await diagnosticsPanel.textContent()).includes('导出没有完成：先处理这些批注')
    && (await diagnosticsPanel.textContent()).includes('文字框：找不到对应的原文位置'),
    JSON.stringify({ count: await diagnosticsPanel.count(), text: await diagnosticsPanel.textContent() }))
  check('the diagnostics panel never shifts the toolbar or the paper',
    metricsClose(metricsBeforePanel, await toolbarMetrics()),
    JSON.stringify({ before: metricsBeforePanel, withPanel: await toolbarMetrics() }))
  await page.click('.paper-personal-export-diagnostics button:has-text("查看")')
  await page.waitForFunction(() => document.querySelector('[data-box-key="verify-export-diag"]')?.classList.contains('is-selected'), undefined, { timeout: 5_000 })
  await page.waitForFunction(() => (document.scrollingElement?.scrollTop ?? 0) > 0, undefined, { timeout: 5_000 })
  check('查看 selects the object and scrolls vertically only',
    await page.evaluate(() => document.scrollingElement?.scrollLeft ?? 0) === 0,
    JSON.stringify(await page.evaluate(() => ({ top: document.scrollingElement?.scrollTop, left: document.scrollingElement?.scrollLeft }))))
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.querySelectorAll('.paper-personal-export-diagnostics').length === 0, undefined, { timeout: 5_000 })
  check('Escape closes the diagnostics panel and refocuses the export button',
    await page.evaluate(() => document.activeElement?.classList.contains('paper-browse-export-option') ?? false))
  await page.unroute('**/api/personal-paper-layers/**/exports')

  // 409 layout mismatch: the notice names what changed and 重新加载 walks the
  // existing layout reload path (fresh layout GET, view recovers).
  await page.route('**/api/personal-paper-layers/**/exports', (route) => route.fulfill({
    status: 409,
    contentType: 'application/json',
    body: JSON.stringify({
      error: '卷子或纸张版已经变化，请重新核对批注位置',
      code: 'PERSONAL_EXPORT_LAYOUT_MISMATCH',
      details: { currentLayoutId: layout.layoutId },
    }),
  }))
  await exportButton.click()
  const mismatchNotice = page.locator('.paper-personal-paper-notice:has-text("纸张版式已经变化")')
  await mismatchNotice.waitFor({ timeout: 5_000 })
  check('a 409 layout mismatch tells the teacher the paper layout changed',
    await mismatchNotice.count() === 1, await mismatchNotice.textContent())
  const layoutRequestsBeforeReload = layoutRequests.length
  await page.click('.paper-personal-paper-notice button:has-text("重新加载")')
  for (let waited = 0; layoutRequests.length === layoutRequestsBeforeReload && waited < 10_000; waited += 200) {
    await page.waitForTimeout(200)
  }
  await page.waitForSelector('[data-paper-page-overlay]', { timeout: 90_000 })
  check('重新加载 reloads the layout through the existing path',
    layoutRequests.length > layoutRequestsBeforeReload
    && await page.locator('.paper-personal-paper-notice:has-text("纸张版式已经变化")').count() === 0,
    `layout requests ${layoutRequestsBeforeReload} -> ${layoutRequests.length}`)
  await page.unroute('**/api/personal-paper-layers/**/exports')


  // ---- without a personal account there is no entry and no switch ------------------
  const anonymousPage = await context.newPage()
  await anonymousPage.route('**/paper-assets/**/paper-asset.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: browserAsset,
  }))
  await anonymousPage.goto(`http://127.0.0.1:${appPort}/canonical-consumption-qa.html?paperId=${paperId}`, { waitUntil: 'domcontentloaded' })
  await anonymousPage.waitForSelector('[data-paper-paragraph-id]', { timeout: 90_000 })
  check('without a personal account the 纸张 entry is hidden',
    await anonymousPage.locator('button:has-text("纸张")').count() === 0)
  await anonymousPage.close()

  check('no page errors', pageErrors.length === 0, pageErrors.join('\n').slice(0, 500))
  if (serverLog.includes('Error')) console.log('server log tail:', serverLog.slice(-400))
} finally {
  if (browser) await browser.close()
  if (vite) await vite.close()
  if (server) server.kill()
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log(failed === 0 ? `\n${passed} browser checks passed` : `\n${failed} browser checks failed (${passed} passed)`)
process.exit(failed === 0 ? 0 : 1)
