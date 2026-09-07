#!/usr/bin/env node
// pa-only-add-detail-consistency: the concierge listing (GET /api/question-groups)
// injects canonical paper-asset-only question-group cards — groups that live in
// app/public/paper-assets/ but have no row in the question_groups SQLite table.
// Bug (pre-fix): the listing marked every print-complete PA-only card with
// draftPaperButtonState:'add' / canAddToDraftPaper:true, but the add-to-draft seam
// (draftPaperStore.addGroupToDraftPaper) re-validates groupId against the bank's
// question_groups table via selectQuestionGroupCards with a WHERE clause — a path
// that does NOT inject PA-only cards (injection is gated on the empty-whereClause
// listing path), so the add always 400'd with "questionGroupId not found"; and the
// detail GET /api/question-groups/:id returned 404 because getQuestionGroupDetail
// exited on the PA-blind WHERE-id-? card lookup before findPaperAssetGroup ran.
//
// Fix: (B) the PA card builder now gates addability on the group being promoted
// into the bank, so un-promoted PA cards advertise 'disabled' (the frontend disables
// the "+加入草稿卷" button for draftState==='disabled'), matching the add seam's
// bank-ownership gate; (A-step1) getQuestionGroupDetail now consults
// findPaperAssetGroup before the PA-blind card lookup, so a PA-only id returns a PA
// detail with real material/questions instead of 404.
//
// Boots the real server with disposable tracked V0 seed data and exercises the
// API plus the real React App. Never opens a developer/production database.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const paperAssetsDir = process.env.QUESTION_BANK_PAPER_ASSET_ROOT || path.join(rootDir, 'app/public/paper-assets')

let passed = 0
let failed = 0
function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

console.log('pa-only-add-detail-consistency verify: listing/add/detail alignment for paper-asset-only groups')

if (!existsSync(paperAssetsDir)) {
  console.log(`SKIP: no paper-assets directory at ${paperAssetsDir}`)
  process.exit(2)
}

const apiPort = Number(process.env.QUESTION_BANK_API_PORT || '9321')
const userDataDb = mkdtempSync(path.join(tmpdir(), 'eqb-pa-only-verify-'))
const dbPath = path.join(userDataDb, 'question-bank.sqlite')
const seedDb = new DatabaseSync(dbPath)
seedDb.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
seedDb.exec(readFileSync(path.join(rootDir, 'data/sql/seed-v0.sql'), 'utf8'))
seedDb.close()

function startServer() {
  return spawn('node', ['server/api.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      QUESTION_BANK_API_PORT: String(apiPort),
      QUESTION_BANK_DB: dbPath,
      QUESTION_BANK_PAPER_ASSET_ROOT: paperAssetsDir,
      USER_DATA_DB: path.join(userDataDb, 'user-data.sqlite'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitForServer(server, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/health`)
      if (response.ok) return
    } catch {
      // server not up yet
    }
    await sleep(200)
  }
  throw new Error(`server did not come up on port ${apiPort}`)
}

async function getJson(pathname) {
  const response = await fetch(`http://127.0.0.1:${apiPort}${pathname}`)
  let body = null
  try { body = await response.json() } catch { body = await response.text() }
  return { status: response.status, body }
}

const PA_ONLY_TARGET = 'group-2020-bing-reading-a'
const UNKNOWN_ID = 'group-does-not-exist-anywhere-zzz'

const server = startServer()
server.stdout.on('data', (chunk) => process.stdout.write(chunk))
server.stderr.on('data', (chunk) => process.stderr.write(chunk))

let listing = null
let dbGroupIds = null

try {
  await waitForServer(server)
  assert('server up', true)

  // Sanity: the target PA-only id really has no question_groups row in the dev seed
  // (this is the bug's precondition — if it ever gets promoted, the test id must be
  // changed so the PA-only assertion below stays meaningful).
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const targetRow = db.prepare('SELECT id FROM question_groups WHERE id = ?').get(PA_ONLY_TARGET)
  dbGroupIds = new Set(db.prepare('SELECT id FROM question_groups').all().map((row) => row.id))
  db.close()
  assert(
    `PA-only target ${PA_ONLY_TARGET} is absent from question_groups (precondition)`,
    !targetRow,
    `expected ${PA_ONLY_TARGET} to have no question_groups row; found ${JSON.stringify(targetRow)}`,
  )

  // --- listing: PA-only cards are no longer advertised as addable ---
  const listRes = await getJson('/api/question-groups')
  assert('GET /api/question-groups status 200', listRes.status === 200, `got ${listRes.status}`)
  listing = Array.isArray(listRes.body?.questionGroups) ? listRes.body.questionGroups : []
  assert('listing returned cards', listing.length > 0, `got ${listing.length} cards`)

  const targetCard = listing.find((card) => card.id === PA_ONLY_TARGET)
  assert(`listing contains PA-only card ${PA_ONLY_TARGET}`, !!targetCard, 'PA-only card missing from listing')
  if (targetCard) {
    assert(
      `PA-only card ${PA_ONLY_TARGET} draftPaperButtonState === 'disabled'`,
      targetCard.draftPaperButtonState === 'disabled',
      `got draftPaperButtonState=${JSON.stringify(targetCard.draftPaperButtonState)}`,
    )
    assert(
      `PA-only card ${PA_ONLY_TARGET} canAddToDraftPaper === false`,
      targetCard.canAddToDraftPaper === false,
      `got canAddToDraftPaper=${JSON.stringify(targetCard.canAddToDraftPaper)}`,
    )
    assert(
      `PA-only card ${PA_ONLY_TARGET} carries a printUnavailableReason`,
      typeof targetCard.printUnavailableReason === 'string' && targetCard.printUnavailableReason.length > 0,
      `got printUnavailableReason=${JSON.stringify(targetCard.printUnavailableReason)}`,
    )
  }

  // --- cardinality sweep: ZERO PA-only ids are advertised as addable (Fix B) ---
  const dbBackedCards = listing.filter((card) => dbGroupIds.has(card.id))
  const paOnlyCards = listing.filter((card) => !dbGroupIds.has(card.id))
  assert('listing still injects PA-only cards (browse surface)', paOnlyCards.length > 0, 'no PA-only cards in listing')
  const paOnlyAdvertisedAddable = paOnlyCards.filter(
    (card) => card.draftPaperButtonState === 'add' || card.canAddToDraftPaper === true,
  )
  assert(
    `no PA-only card is advertised as addable (swept ${paOnlyCards.length} PA-only cards)`,
    paOnlyAdvertisedAddable.length === 0,
    `${paOnlyAdvertisedAddable.length} PA-only cards still advertise addable: ${paOnlyAdvertisedAddable.slice(0, 5).map((c) => c.id).join(', ')}`,
  )
  const paOnlyDisabled = paOnlyCards.filter((card) => card.draftPaperButtonState === 'disabled')
  assert(
    `all PA-only cards are 'disabled' (swept ${paOnlyCards.length})`,
    paOnlyDisabled.length === paOnlyCards.length,
    `${paOnlyDisabled.length}/${paOnlyCards.length} PA-only cards are 'disabled'`,
  )

  // --- detail: PA-only id now returns 200 with real material (Fix A step 1) ---
  const detailRes = await getJson(`/api/question-groups/${PA_ONLY_TARGET}`)
  assert(`GET /api/question-groups/${PA_ONLY_TARGET} status 200`, detailRes.status === 200, `got ${detailRes.status} ${JSON.stringify(detailRes.body)}`)
  if (detailRes.status === 200) {
    const detail = detailRes.body?.questionGroup
    assert('PA-only detail has id', !!detail?.id && detail.id === PA_ONLY_TARGET, `got id=${JSON.stringify(detail?.id)}`)
    assert('PA-only detail explicitly denies edit/delete support', detail?.canEdit === false)
    assert('PA-only detail has non-empty passage.materialText', typeof detail?.passage?.materialText === 'string' && detail.passage.materialText.length > 0, `materialText=${JSON.stringify(detail?.passage?.materialText)?.slice(0, 80)}`)
    assert('PA-only detail has a populated questions array', Array.isArray(detail?.questions) && detail.questions.length > 0, `questions=${JSON.stringify(detail?.questions?.length)}`)
    assert('PA-only detail questions carry options (reading)', Array.isArray(detail?.questions?.[0]?.options) && detail.questions[0].options.length >= 2, `options=${JSON.stringify(detail?.questions?.[0]?.options?.length)}`)
    assert('PA-only detail has paperId from the asset', typeof detail?.paperId === 'string' && detail.paperId.length > 0, `paperId=${JSON.stringify(detail?.paperId)}`)
    assert('PA-only detail addability matches listing (disabled)', detail.draftPaperButtonState === 'disabled' && detail.canAddToDraftPaper === false, `state=${JSON.stringify(detail.draftPaperButtonState)}/${JSON.stringify(detail.canAddToDraftPaper)}`)
  }

  // --- no regression: a genuinely unknown id still returns 404 ---
  const unknownRes = await getJson(`/api/question-groups/${UNKNOWN_ID}`)
  assert(`GET /api/question-groups/<unknown> status 404 (no regression)`, unknownRes.status === 404, `got ${unknownRes.status} ${JSON.stringify(unknownRes.body)}`)

  // --- no regression: each DB-backed group's detail still resolves ---
  for (const dbGroup of dbBackedCards.slice(0, Math.min(4, dbBackedCards.length))) {
    const res = await getJson(`/api/question-groups/${dbGroup.id}`)
    assert(`DB-backed detail ${dbGroup.id} status 200 (no regression)`, res.status === 200, `got ${res.status} ${JSON.stringify(res.body)?.slice(0, 120)}`)
    assert(`DB-backed detail ${dbGroup.id} supports edit/delete`, res.body?.questionGroup?.canEdit === true)
  }

  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({ root: path.join(rootDir, 'app'), server: { host: '127.0.0.1', port: 0 } })
  await viteServer.listen()
  const { default: { chromium } } = await import('../app/node_modules/playwright/index.js')
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  try {
    const page = await browser.newPage()
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/auth/me') {
        return route.fulfill({ json: { authRequired: false, user: null } })
      }
      const response = await route.fetch({ url: `http://127.0.0.1:${apiPort}${url.pathname}${url.search}` })
      return route.fulfill({ response })
    })
    const openDetail = async (id) => {
      await page.goto(`${viteServer.resolvedUrls.local[0]}?view=detail&groupId=${encodeURIComponent(id)}`)
      await page.locator('.peek-hero').waitFor()
    }
    await openDetail(PA_ONLY_TARGET)
    assert('React App: PA-only detail hides mutation menu', await page.locator('.peek-actions-menu').count() === 0)
    assert('React App: PA-only add control remains disabled', await page.getByRole('button', { name: '暂不可组卷', exact: true }).isDisabled())
    const unprintable = dbBackedCards.find((card) => card.draftPaperButtonState === 'disabled')
    assert('fixture includes unprintable DB group', !!unprintable)
    const ordinary = dbBackedCards.find((card) => card.id !== unprintable?.id)
    assert('fixture includes another ordinary DB group', !!ordinary)
    for (const card of [ordinary, unprintable].filter(Boolean)) {
      await openDetail(card.id)
      await page.locator('.peek-actions-menu button').click()
      await page.getByRole('menuitem', { name: '编辑', exact: true }).click()
      await page.getByRole('dialog', { name: '录题' }).waitFor()
      assert(`React App: DB ${card.id} opens edit dialog (draft=${card.draftPaperButtonState})`, true)
      await page.getByRole('button', { name: '关闭录题面板' }).click()
      await page.locator('.peek-actions-menu button').click()
      const dialogPromise = page.waitForEvent('dialog').then(async (dialog) => {
        assert(`React App: DB ${card.id} reaches delete confirmation`, dialog.type() === 'confirm')
        await dialog.dismiss()
      })
      await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      await dialogPromise
    }
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: {
      authRequired: true, user: { id: 'fixture-member', username: 'fixture-member', role: 'member' },
    } }))
    await openDetail(ordinary.id)
    assert('React App: member cannot edit/delete a DB-backed detail', await page.locator('.peek-actions-menu').count() === 0)
  } finally {
    await browser.close()
    await viteServer.close()
  }

  // --- add seam: a direct POST with a PA-only id is still rejected (the listing no
  // longer advertises it, so this path is no longer user-reachable via the UI; the
  // add seam remains bank-ownership-gated by design). Assert it 400s cleanly rather
  // than 500s, so the rejected id never leaves a partial draft mutation behind. ---
  const addRes = await fetch(`http://127.0.0.1:${apiPort}/api/draft-papers/current/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ groupId: PA_ONLY_TARGET }),
  })
  assert(
    'direct POST add of PA-only id is rejected with 4xx (no partial mutation)',
    addRes.status >= 400 && addRes.status < 500,
    `got ${addRes.status}`,
  )
  const addBody = await addRes.text().catch(() => '')
  assert(
    'rejected add body carries an error message (no silent success)',
    /"error"\s*:/.test(addBody),
    `body=${addBody.slice(0, 200)}`,
  )
} finally {
  const stopped = once(server, 'exit')
  server.kill('SIGTERM')
  await stopped
  try { rmSync(userDataDb, { recursive: true, force: true }) } catch { /* best effort */ }
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
