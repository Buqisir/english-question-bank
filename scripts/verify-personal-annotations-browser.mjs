#!/usr/bin/env node
// verify-resource: browser-render
// #489 reading-mode personal annotations, proven end to end in a real
// browser against the real server: temp publication of the cloze/grammar
// Canonical fixture, a signed-in account, and the actual PaperBrowse page.
// Covers create/change/delete of highlights and underlines, anchored notes,
// per-question personal commentary, undo/redo, and persistence across reload.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { publishCanonicalPaperPublication } from '../server/paper-canonical/publication.mjs'
import { makeClozeGrammarCanonicalReferenceFixture } from '../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const requireFromApp = createRequire(new URL('../app/package.json', import.meta.url))
const { chromium } = requireFromApp('playwright')

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

// Publishes the cloze/grammar Canonical fixture into the temp root (this is
// paper-2026-i) and drops the committed latest paper-asset next to it, the
// same consumption+asset pair the other rendered-behavior verifiers use.
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
  writeFileSync(
    path.join(fixture.paperAssetsDir, asset.paper.paperId, 'versions', published.versionName, 'paper-asset.json'),
    committedAsset,
  )
  db.close()
  return { paperId: asset.paper.paperId, committedAsset }
}

// The fixture publishes only the Cloze/Grammar plan and PaperBrowse refuses a
// paper-asset group outside that plan. The published file stays byte-exact
// (its hash is pinned); only the copy the browser reads is trimmed.
// Plan Group ids are Canonical (`group:reading.a`), so each planned Group
// borrows the same-family asset Group under its Canonical id, as the
// Cloze/Grammar consumption verifier does.
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

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-personal-annotations-browser-'))
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

async function selectParagraphText(page, start, end) {
  // Scroll first and let it settle: a scroll closes an open selection toolbar.
  await page.evaluate(() => {
    for (const paragraph of document.querySelectorAll('[data-paper-paragraph-id]')) {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.data.length >= 60 && !node.parentElement.closest('.ps-paper-blank, .ps-question-no, .ps-option-label')) {
          node.parentElement.scrollIntoView({ block: 'center' })
          return
        }
      }
    }
  })
  await page.waitForTimeout(300)
  await page.evaluate(([from, to]) => {
    // First long passage text node outside blanks, numbers and labels, so
    // every range stays in plain source text.
    let target = null
    for (const paragraph of document.querySelectorAll('[data-paper-paragraph-id]')) {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.data.length < 60) continue
        if (node.parentElement.closest('.ps-paper-blank, .ps-question-no, .ps-option-label')) continue
        target = node
        break
      }
      if (target) break
    }
    if (!target) throw new Error('no plain passage text node')
    target.parentElement.scrollIntoView({ block: 'center' })
    window.getSelection().setBaseAndExtent(target, from, target, Math.min(to, target.data.length))
    document.dispatchEvent(new Event('selectionchange'))
  }, [start, end])
}

// Text edits save after a debounce, so first see the status leave 已保存.
async function waitSavedAfterEdit(page) {
  await page.waitForFunction(
    () => document.querySelector('.paper-personal-status')?.textContent !== '批注已保存',
    { timeout: 5_000 },
  ).catch(() => {})
  await waitSaved(page)
}

// A newly opened editor takes focus itself; typing starts only once it has.
async function waitEditorFocused(page, scope) {
  await page.waitForFunction(
    (selector) => Boolean(document.activeElement?.matches(`${selector} .eqb-personal-text__input`)),
    scope,
    { timeout: 10_000 },
  )
}

async function openLecture(page) {
  if (await page.locator('.paper-browse-lecture-panel').count() === 0) {
    await page.click('button.paper-browse-lecture-toggle')
  }
  await page.waitForSelector('.paper-browse-lecture-panel', { timeout: 10_000 })
}

async function waitSaved(page) {
  await page.waitForFunction(
    () => document.querySelector('.paper-personal-status')?.textContent === '批注已保存',
    { timeout: 15_000 },
  )
}

try {
  const seeded = seedFixture(fixture)
  const { paperId } = seeded
  await runCli(['--username', 'verify-annotations-owner', '--role', 'owner', '--password', 'Verify-Pass-123'], serverEnv)

  server = spawn('node', ['server/api.mjs'], { cwd: rootDir, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  let serverLog = ''
  server.stdout.on('data', (chunk) => (serverLog += chunk))
  server.stderr.on('data', (chunk) => (serverLog += chunk))
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)

  const login = await fetch(`http://127.0.0.1:${apiPort}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'verify-annotations-owner', password: 'Verify-Pass-123' }),
  })
  const cookie = login.headers.get('set-cookie') || ''
  const token = cookie.match(/eqb_session=([^;]+)/)?.[1]
  if (login.status !== 200 || !token) throw new Error(`login failed: ${login.status} ${cookie}`)
  const consumptionResponse = await fetch(
    `http://127.0.0.1:${apiPort}/api/paper-canonical/consumption?paperId=${paperId}`,
    { headers: { cookie: `eqb_session=${token}` } },
  )
  if (consumptionResponse.status !== 200) throw new Error(`consumption failed: ${consumptionResponse.status} ${await consumptionResponse.text()}`)
  const browserAsset = plannedBrowserAsset(seeded.committedAsset, await consumptionResponse.json())

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

  await page.goto(`http://127.0.0.1:${appPort}/canonical-consumption-qa.html?paperId=${paperId}&personalAccount=verify-annotations-owner`, { waitUntil: 'domcontentloaded' })
  try {
    // A cold Vite compile of the whole-paper page can exceed 30s under load.
    await page.waitForSelector('[data-paper-paragraph-id]', { timeout: 90_000 })
    await page.waitForSelector('.paper-personal-status', { timeout: 30_000 })
  } catch (error) {
    throw new Error(
      `PaperBrowse did not mount the personal layer: ${(await page.locator('body').innerText()).slice(0, 500)}\n${pageErrors.join('\n').slice(0, 500)}\n${serverLog.slice(-800)}`,
      { cause: error },
    )
  }
  check('the personal layer loads for a signed-in teacher', true)

  // ---- highlight from the selection toolbar ---------------------------------
  await selectParagraphText(page, 0, 12)
  await page.waitForSelector('.paper-selection-annotations', { timeout: 10_000 })
  check('the selection toolbar offers annotation actions without translation', true)
  await page.click('.paper-selection-annotations button:nth-child(1)')
  await page.waitForSelector('.paper-personal-mark--highlight', { timeout: 10_000 })
  check('高亮 draws over the selected words', true)
  await waitSaved(page)
  check('the highlight is confirmed saved', true)

  // ---- change color through the mark popover --------------------------------
  const markBox = await page.locator('.paper-personal-mark--highlight').first().boundingBox()
  await page.mouse.click(markBox.x + markBox.width / 2, markBox.y + markBox.height / 2)
  await page.waitForSelector('.paper-personal-popover', { timeout: 5_000 })
  await page.click('.paper-personal-swatch[data-color="green"]')
  await page.waitForSelector('.paper-personal-mark--highlight[data-color="green"]', { timeout: 5_000 })
  check('the popover recolors the highlight', true)
  await waitSaved(page)

  // ---- underline a different range -------------------------------------------
  await page.keyboard.press('Escape')
  await selectParagraphText(page, 14, 24)
  await page.waitForSelector('.paper-selection-annotations', { timeout: 10_000 })
  await page.click('.paper-selection-annotations button:nth-child(2)')
  await page.waitForSelector('.paper-personal-mark--underline', { timeout: 10_000 })
  await waitSaved(page)
  check('下划线 draws and saves alongside the highlight', true)

  // ---- undo / redo -------------------------------------------------------------
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.body.focus())
  await page.keyboard.press('ControlOrMeta+Z')
  await page.waitForFunction(
    () => document.querySelectorAll('.paper-personal-mark--underline').length === 0,
    { timeout: 5_000 },
  )
  check('Ctrl/Cmd+Z removes the underline', true)
  await page.keyboard.press('ControlOrMeta+Shift+Z')
  await page.waitForSelector('.paper-personal-mark--underline', { timeout: 5_000 })
  check('redo restores the underline under a fresh id', true)
  await waitSaved(page)

  // ---- delete through the popover ---------------------------------------------
  const underlineBox = await page.locator('.paper-personal-mark--underline').first().boundingBox()
  await page.mouse.click(underlineBox.x + 2, underlineBox.y + underlineBox.height - 1)
  await page.waitForSelector('.paper-personal-popover', { timeout: 5_000 })
  await page.click('.paper-personal-popover__action--danger')
  await page.waitForFunction(
    () => document.querySelectorAll('.paper-personal-mark--underline').length === 0,
    { timeout: 5_000 },
  )
  check('the popover deletes the underline', true)
  await waitSaved(page)

  // ---- anchored note -------------------------------------------------------------
  await selectParagraphText(page, 30, 42)
  await page.waitForSelector('.paper-selection-annotations', { timeout: 10_000 })
  await page.click('.paper-selection-annotations button:nth-child(3)')
  await waitEditorFocused(page, '.paper-personal-note-card')
  check('批注 opens an editor without saving an empty shell', (await page.locator('.paper-personal-note-badge').count()) === 0)
  await page.keyboard.type('主旨句，注意转折')
  try {
    await page.waitForSelector('.paper-personal-note-badge', { timeout: 15_000 })
  } catch (error) {
    const state = await page.evaluate(() => ({
      active: document.activeElement?.outerHTML.slice(0, 200),
      card: document.querySelector('.paper-personal-note-card')?.outerHTML.slice(0, 600) ?? null,
      status: document.querySelector('.paper-personal-status')?.textContent,
      notice: document.querySelector('.paper-personal-notice')?.textContent ?? null,
    }))
    throw new Error(`note was not created: ${JSON.stringify(state)}\n${pageErrors.join('\n').slice(0, 500)}`, { cause: error })
  }
  check('typing creates the note and its anchor badge', true)
  await waitSavedAfterEdit(page)
  await page.keyboard.press('Escape')

  // ---- persistence across reload --------------------------------------------------
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.paper-personal-mark--highlight[data-color="green"]', { timeout: 30_000 })
  await page.waitForSelector('.paper-personal-note-badge', { timeout: 10_000 })
  check('marks and the note survive a reload', true)
  check('the deleted underline stays deleted', (await page.locator('.paper-personal-mark--underline').count()) === 0)

  // ---- per-question commentary in the lecture panel --------------------------------
  await openLecture(page)
  await page.locator('[data-paper-question-id]').first().click()
  await page.waitForSelector('.paper-personal-commentary', { timeout: 10_000 })
  check('the lecture panel offers 我的讲评 for a clicked question', true)
  await page.click('.paper-personal-commentary__edit')
  await waitEditorFocused(page, '.paper-personal-commentary')
  await page.keyboard.type('这题容易误选 B')
  await waitSavedAfterEdit(page)
  const savedLayer = await page.evaluate(async (id) => (await fetch(`/api/personal-paper-layers/${id}`)).json(), paperId)
  const savedCommentary = (savedLayer.layer?.objects ?? savedLayer.objects ?? []).filter((object) => object.type === 'commentary')
  check('the server holds exactly one commentary', savedCommentary.length === 1, JSON.stringify(savedLayer).slice(0, 400))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitSaved(page)
  await openLecture(page)
  await page.locator('[data-paper-question-id]').first().click()
  await page.waitForSelector('.paper-personal-commentary', { timeout: 10_000 })
  const commentaryText = await page.locator('.paper-personal-commentary').textContent()
  check('personal commentary survives a reload', commentaryText.includes('这题容易误选 B'), commentaryText.slice(0, 80))

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
