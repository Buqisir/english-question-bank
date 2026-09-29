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
import { PERSONAL_LAYER_API_SCHEMA } from '../shared/personal-paper-layer/index.mjs'
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
  const sourceRevision = buildSelectionSourceFromConsumption(consumption).sourceRevision
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
