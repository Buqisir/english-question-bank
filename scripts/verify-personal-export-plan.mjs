#!/usr/bin/env node
// verify-resource: browser-render
// #489 5b measure pass: seeds a personal layer covering every object shape
// (marks, auto/fixed/overflow/no-space notes, text boxes, appendix entries,
// a foreign-layout box) against the real server and the cloze/grammar
// fixture, then runs measurePersonalExportPlan in-process and asserts the
// plan's pure-data output — cards, marks, appendix numbering, diagnostics,
// base digests, and run-to-run determinism.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { publishCanonicalPaperPublication } from '../server/paper-canonical/publication.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { buildPersonalLayerSource, PERSONAL_LAYER_API_SCHEMA } from '../shared/personal-paper-layer/index.mjs'
import { measurePersonalExportPlan, PERSONAL_EXPORT_PLAN_VERSION } from '../server/personal-paper-layer/exportPlan.mjs'
import { createPersonalTextDocumentFromPlainText } from '../shared/personal-text/index.mjs'
import { makeClozeGrammarCanonicalReferenceFixture } from '../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

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

// ---- the fixture harness from verify-personal-paper-view-browser.mjs ----------

const FAMILY_GROUP_TYPE = {
  reading: 'reading',
  'seven-choices': 'sevenChoices',
  cloze: 'cloze',
  'grammar-fill': 'grammarFill',
  'application-writing': 'writing',
  'continuation-writing': 'writing',
}

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
  const printConsumption = createCanonicalConsumerRuntime({ rootDir: fixture.paperAssetsDir, db })
    .load({ paperId: asset.paper.paperId, consumerId: 'print_pdf' })
  mkdirSync(path.join(fixture.paperAssetsDir, asset.paper.paperId, 'latest'), { recursive: true })
  writeFileSync(
    path.join(fixture.paperAssetsDir, asset.paper.paperId, 'latest', 'paper-asset.json'),
    canonicalServerAsset(committedAsset, printConsumption),
  )
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
  new DatabaseSync(fixture.dbPath).exec(
    readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'),
  )
  return { paperId: asset.paper.paperId }
}

// The server-side mirror of the browser asset rewrite (same as
// verify-personal-paper-view-browser.mjs): the natural student prepare
// resolves published groups through getQuestionGroupDetail, whose
// paper-asset fallback reads exactly
// `<paperAssetsDir>/<paperId>/latest/paper-asset.json`, and print identity
// requires the detail's question ids to equal the canonical projection's.
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

// ---- run ---------------------------------------------------------------------

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-personal-export-plan-'))
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
const serverEnv = {
  ...process.env,
  QUESTION_BANK_DB: fixture.dbPath,
  USER_DATA_DB: fixture.userDataDbPath,
  QUESTION_BANK_PAPER_ASSET_ROOT: fixture.paperAssetsDir,
  QUESTION_BANK_USER_SPACE_ROOT: fixture.userSpaceRoot,
  QUESTION_BANK_API_PORT: String(apiPort),
  QUESTION_BANK_PUBLIC_ORIGIN: `http://127.0.0.1:${apiPort}`,
}

let server = null
try {
  const { paperId } = seedFixture(fixture)
  await runCli(['--username', 'verify-export-plan-owner', '--role', 'owner', '--password', 'Verify-Pass-123'], serverEnv)

  server = spawn('node', ['server/api.mjs'], { cwd: rootDir, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  let serverLog = ''
  server.stdout.on('data', (chunk) => (serverLog += chunk))
  server.stderr.on('data', (chunk) => (serverLog += chunk))
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)

  const login = await fetch(`http://127.0.0.1:${apiPort}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'verify-export-plan-owner', password: 'Verify-Pass-123' }),
  })
  const cookie = (login.headers.get('set-cookie') || '').match(/eqb_session=([^;]+)/)?.[1]
  if (login.status !== 200 || !cookie) throw new Error(`login failed: ${login.status}`)
  const headers = { cookie: `eqb_session=${cookie}` }

  const consumptionResponse = await fetch(
    `http://127.0.0.1:${apiPort}/api/paper-canonical/consumption?paperId=${paperId}`,
    { headers },
  )
  if (consumptionResponse.status !== 200) throw new Error(`consumption failed: ${consumptionResponse.status}`)
  const consumption = await consumptionResponse.json()
  const source = buildPersonalLayerSource(consumption)
  const sourceRevision = source.sourceRevision

  const layout = await (await fetch(
    `http://127.0.0.1:${apiPort}/api/personal-paper-layers/${paperId}/layout?sourceRevision=${encodeURIComponent(sourceRevision)}`,
    { headers },
  )).json()
  if (!layout?.paginatedHtml) throw new Error(`layout failed: ${JSON.stringify(layout).slice(0, 400)}\n${serverLog.slice(-600)}`)
  check('the layout API returns the paginated base and its reference',
    layout.layoutId.length > 0 && layout.layoutRef.pages.length === layout.pages.length
    && layout.paginatedHtml.includes('pagedjs_page'))

  const readLayer = async () => {
    const response = await fetch(
      `http://127.0.0.1:${apiPort}/api/personal-paper-layers/${paperId}?sourceRevision=${encodeURIComponent(sourceRevision)}`,
      { headers },
    )
    if (response.status !== 200) throw new Error(`layer read failed: ${response.status}`)
    return response.json()
  }
  const postOperations = async (operations, tag) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await readLayer()
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/personal-paper-layers/${paperId}/operations`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json', origin: `http://127.0.0.1:${apiPort}` },
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

  // Anchors: the long passage-body stream the view-browser seeds against, so
  // the fixture's known sentences resolve.
  const noteStream = source.streams.find((item) => item.role === 'passage-body' && item.text.length > 260)
  if (!noteStream) throw new Error('no long passage-body stream for anchors')
  const anchor = (start, end) => ({
    paperId,
    sourceRevision: source.sourceRevision,
    sourceProjectionVersion: source.sourceProjectionVersion,
    segments: [{ streamId: noteStream.streamId, start, end, exactText: noteStream.text.slice(start, end) }],
  })
  const anchorText = (text) => {
    const start = noteStream.text.indexOf(text)
    if (start < 0) throw new Error(`anchor text missing: ${text}`)
    return anchor(start, start + text.length)
  }
  const doc = (text) => createPersonalTextDocumentFromPlainText(text)
  const pageOne = layout.pages[0].pageId
  const pageTwo = layout.pages[1]?.pageId ?? pageOne

  const seedObjects = [
    {
      id: 'plan-hl-crossline',
      type: 'highlight',
      style: { color: 'yellow' },
      textAnchor: anchor(0, 60),
    },
    {
      id: 'plan-ul-red',
      type: 'underline',
      style: { ink: 'red' },
      textAnchor: anchor(70, 90),
    },
    {
      id: 'plan-note-auto-1',
      type: 'anchored-note',
      document: doc('第一条量测旁注。'),
      textAnchor: anchorText('as a whole different world'),
      placement: { kind: 'auto-near-anchor' },
    },
    {
      id: 'plan-note-auto-2',
      type: 'anchored-note',
      document: doc('第二条量测旁注。'),
      textAnchor: anchorText('most of my classmates thought of Ohio'),
      placement: { kind: 'auto-near-anchor' },
    },
    {
      id: 'plan-note-fixed',
      type: 'anchored-note',
      document: doc('手摆旁注，位置固定。'),
      textAnchor: anchorText('as a whole different world'),
      placement: { kind: 'page-position', layoutId: layout.layoutId, pageId: pageOne, xMm: 20, yMm: 250, widthMm: 56 },
    },
    {
      id: 'plan-box-1',
      type: 'text-box',
      document: doc('量测文字框'),
      placement: { kind: 'page-position', layoutId: layout.layoutId, pageId: pageOne, xMm: 30, yMm: 40, widthMm: 60 },
    },
    {
      id: 'plan-appendix-note',
      type: 'anchored-note',
      document: doc('转附页旁注。'),
      textAnchor: anchorText('most of my classmates thought of Ohio'),
      placement: {
        kind: 'appendix',
        origin: { kind: 'page-position', layoutId: layout.layoutId, pageId: pageTwo, xMm: 30, yMm: 30, widthMm: 56 },
      },
    },
    {
      id: 'plan-appendix-box',
      type: 'text-box',
      document: doc('旧出处文字框'),
      // A text box in the appendix always keeps a page origin (server rule);
      // a foreign-layout origin leaves it unpositioned — entry, no marker.
      placement: {
        kind: 'appendix',
        origin: { kind: 'page-position', layoutId: 'old-layout-1990', pageId: pageOne, xMm: 30, yMm: 30, widthMm: 60 },
      },
    },
    {
      id: 'plan-note-overflow',
      type: 'anchored-note',
      document: doc(Array.from({ length: 6 }, (_, line) => `溢出旁注第${line + 1}行，故意写得比较长以便撑出页底。`).join('\n')),
      textAnchor: anchorText('as a whole different world'),
      placement: { kind: 'page-position', layoutId: layout.layoutId, pageId: pageOne, xMm: 20, yMm: 285, widthMm: 56 },
    },
    {
      id: 'plan-note-nospace',
      type: 'anchored-note',
      document: doc(Array.from({ length: 40 }, (_, line) => `没有空位旁注第${line + 1}行`).join('\n')),
      textAnchor: anchorText('most of my classmates thought of Ohio'),
      placement: { kind: 'auto-near-anchor' },
    },
    {
      id: 'plan-box-old',
      type: 'text-box',
      document: doc('旧版式文字框'),
      placement: { kind: 'page-position', layoutId: 'old-layout-1990', pageId: pageOne, xMm: 30, yMm: 30, widthMm: 60 },
    },
  ]
  await postOperations(seedObjects.map((object) => ({ op: 'create', object })), 'plan-seed')
  const objects = (await readLayer()).layer.objects

  const coldStartedAt = Date.now()
  const plan = await measurePersonalExportPlan({
    paginatedHtml: layout.paginatedHtml,
    layoutId: layout.layoutId,
    layoutRef: layout.layoutRef,
    source,
    objects,
  })
  const coldMs = Date.now() - coldStartedAt
  const hotStartedAt = Date.now()
  const planAgain = await measurePersonalExportPlan({
    paginatedHtml: layout.paginatedHtml,
    layoutId: layout.layoutId,
    layoutRef: layout.layoutRef,
    source,
    objects,
  })
  const hotMs = Date.now() - hotStartedAt

  const planJson = JSON.stringify(plan)
  check('the measure pass is deterministic across runs', planJson === JSON.stringify(planAgain))
  check('the plan carries the versioned pure-data shape',
    plan.planVersion === PERSONAL_EXPORT_PLAN_VERSION
    && plan.layoutId === layout.layoutId
    && plan.pageCount === layout.pages.length
    && JSON.stringify(plan.pages) === JSON.stringify(layout.pages.map(({ pageId, widthMm, heightMm }) => ({ pageId, widthMm, heightMm })))
    && !/P[px]\b|viewport|getElement|querySelector/.test(planJson.replace(/planVersion|pageCount/g, '')),
    planJson.slice(0, 200))
  check('base page digests cover every page',
    plan.basePageTextDigests.length === layout.pages.length
    && plan.basePageTextDigests.every((digest) => /^sha256:[0-9a-f]{64}$/u.test(digest)))
  console.log(`plan: ${coldMs} ms cold / ${hotMs} ms hot, ${(planJson.length / 1024).toFixed(1)} KB`)

  // ---- marks -------------------------------------------------------------------
  const hlMark = plan.marks.find((mark) => mark.objectId === 'plan-hl-crossline')
  const hlPage = plan.pages.find((page) => page.pageId === hlMark?.pageId)
  check('the cross-line highlight maps to per-line rects on its anchor page',
    hlMark && hlMark.type === 'highlight' && hlMark.color === 'yellow' && hlPage
    && hlMark.rectsMm.length >= 1
    && hlMark.rectsMm.every((rect) => rect.widthMm > 0 && rect.heightMm > 0
      && rect.xMm >= 0 && rect.xMm + rect.widthMm <= hlPage.widthMm
      && rect.yMm >= 0 && rect.yMm + rect.heightMm <= hlPage.heightMm),
    JSON.stringify(hlMark))
  const ulMark = plan.marks.find((mark) => mark.objectId === 'plan-ul-red')
  check('the underline maps with its ink',
    ulMark && ulMark.type === 'underline' && ulMark.ink === 'red' && ulMark.rectsMm.length >= 1,
    JSON.stringify(ulMark))

  // ---- cards -------------------------------------------------------------------
  const cardById = new Map(plan.cards.map((card) => [card.objectId, card]))
  const fixedCard = cardById.get('plan-note-fixed')
  check('the page-position note card keeps its exact placement and measured height',
    fixedCard && fixedCard.pageId === pageOne && fixedCard.xMm === 20 && fixedCard.yMm === 250
      && fixedCard.widthMm === 56 && fixedCard.heightMm > 0 && fixedCard.slot === 'flow'
      && fixedCard.html.includes('手摆旁注'),
    JSON.stringify(fixedCard))
  const boxCard = cardById.get('plan-box-1')
  check('the text-box card keeps its exact placement and renders the html',
    boxCard && boxCard.type === 'text-box' && boxCard.pageId === pageOne && boxCard.xMm === 30
      && boxCard.yMm === 40 && boxCard.widthMm === 60 && boxCard.heightMm > 0
      && boxCard.html.includes('量测文字框') && !boxCard.slot,
    JSON.stringify(boxCard))
  const autoOne = cardById.get('plan-note-auto-1')
  const autoTwo = cardById.get('plan-note-auto-2')
  check('both auto notes resolve onto the paper without overlapping the fixed card',
    autoOne && autoTwo
    && (autoOne.slot === 'margin' || autoOne.slot === 'flow')
    && (autoTwo.slot === 'margin' || autoTwo.slot === 'flow')
    && !(Math.abs(autoOne.xMm - autoTwo.xMm) < 56 && Math.abs(autoOne.yMm - autoTwo.yMm) < 1),
    JSON.stringify({ autoOne, autoTwo }))
  check('overflowing and no-space and foreign-layout cards stay out of the plan',
    !cardById.has('plan-note-overflow') === false && !cardById.has('plan-note-nospace') && !cardById.has('plan-box-old'),
    JSON.stringify([...cardById.keys()]))
  check('the overflow card still reports its measured geometry',
    cardById.get('plan-note-overflow')?.heightMm > 0,
    JSON.stringify(cardById.get('plan-note-overflow')))

  // ---- appendix ----------------------------------------------------------------
  check('the appendix orders the positioned note first with 附1',
    plan.appendix.length === 2
    && plan.appendix[0].objectId === 'plan-appendix-note' && plan.appendix[0].number === 1
    && plan.appendix[1].objectId === 'plan-appendix-box' && plan.appendix[1].number === 2,
    JSON.stringify(plan.appendix.map(({ objectId, number }) => ({ objectId, number }))))
  check('the appendix source labels quote the anchor and name the text box',
    /^第 \d+ 页 · “/.test(plan.appendix[0].sourceLabel ?? '')
    && plan.appendix[1].sourceLabel === '文字框',
    JSON.stringify(plan.appendix.map((entry) => entry.sourceLabel)))
  const marker = plan.markers.find((entry) => entry.objectId === 'plan-appendix-note')
  const markerPage = plan.pages.find((page) => page.pageId === marker?.pageId)
  check('the appendix note marker hangs centered in the margin of its anchor page',
    marker && marker.number === 1 && marker.centered === true && markerPage
      && marker.xMm > 0 && marker.xMm < markerPage.widthMm && marker.yMm > 0 && marker.yMm < markerPage.heightMm,
    JSON.stringify({ marker, page: markerPage }))
  check('the originless text box gets an entry but no marker',
    plan.markers.every((entry) => entry.objectId !== 'plan-appendix-box'),
    JSON.stringify(plan.markers))

  // ---- diagnostics ---------------------------------------------------------------
  const codeFor = (objectId) => plan.diagnostics.filter((entry) => entry.objectId === objectId).map((entry) => entry.code)
  check('the overflow note is diagnosed overflow', codeFor('plan-note-overflow').includes('overflow'), JSON.stringify(plan.diagnostics))
  check('the 40-line auto note is diagnosed no-space', codeFor('plan-note-nospace').includes('no-space'), JSON.stringify(plan.diagnostics))
  check('the foreign-layout text box is diagnosed layout-mismatch',
    codeFor('plan-box-old').includes('layout-mismatch'), JSON.stringify(plan.diagnostics))
  check('the healthy objects carry no diagnostics',
    ['plan-hl-crossline', 'plan-note-fixed', 'plan-box-1', 'plan-appendix-note']
      .every((objectId) => codeFor(objectId).length === 0),
    JSON.stringify(plan.diagnostics))

  if (serverLog.includes('Error')) console.log('server log tail:', serverLog.slice(-400))
} finally {
  if (server) server.kill()
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log(failed === 0 ? `\nverify-personal-export-plan: all checks passed` : `\nverify-personal-export-plan: ${failed} failed (${passed} passed)`)
process.exit(failed === 0 ? 0 : 1)
