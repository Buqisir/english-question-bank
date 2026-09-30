#!/usr/bin/env node
// verify-resource: browser-render
// #489 print-DOM anchor round-trip: printDomRangeToSegments must be the exact
// inverse of printSegmentToDomRanges on the real Paged.js output of the same
// Canonical fixture the personal paper view uses — paragraphs, options,
// table cells, a paragraph split across pages by Paged.js, and a
// cross-paragraph selection merge — while a range crossing two streams (or
// covering only presentation text) maps to nothing.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { personalOverlayBrowserScript } from '../server/personal-paper-layer/browserBundle.mjs'
import { publishCanonicalPaperPublication } from '../server/paper-canonical/publication.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { buildPersonalLayerSource } from '../shared/personal-paper-layer/index.mjs'
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

// Same seed as verify-personal-paper-view-browser.mjs (shared fixture, shared
// alignment of the committed asset's legacy group ids to the canonical slots).
const FAMILY_GROUP_TYPE = {
  reading: 'reading',
  'seven-choices': 'sevenChoices',
  cloze: 'cloze',
  'grammar-fill': 'grammarFill',
  'application-writing': 'writing',
  'continuation-writing': 'writing',
}

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

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-personal-anchor-roundtrip-'))
const fixture = {
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
  QUESTION_BANK_PUBLIC_ORIGIN: 'http://127.0.0.1:1',
}

let server = null
let browser = null

try {
  const { paperId } = seedFixture(fixture)
  await runCli(['--username', 'roundtrip-owner', '--role', 'owner', '--password', 'Verify-Pass-123'], serverEnv)
  server = spawn('node', ['server/api.mjs'], { cwd: rootDir, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  let serverLog = ''
  server.stdout.on('data', (chunk) => (serverLog += chunk.toString()))
  server.stderr.on('data', (chunk) => (serverLog += chunk.toString()))
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)

  const login = await fetch(`http://127.0.0.1:${apiPort}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'roundtrip-owner', password: 'Verify-Pass-123' }),
  })
  const token = (login.headers.get('set-cookie') || '').match(/eqb_session=([^;]+)/)?.[1]
  if (login.status !== 200 || !token) throw new Error(`login failed: ${login.status}`)
  const consumption = await (await fetch(
    `http://127.0.0.1:${apiPort}/api/paper-canonical/consumption?paperId=${paperId}`,
    { headers: { cookie: `eqb_session=${token}` } },
  )).json()
  const source = buildPersonalLayerSource(consumption)
  const layout = await (await fetch(
    `http://127.0.0.1:${apiPort}/api/personal-paper-layers/${paperId}/layout?sourceRevision=${encodeURIComponent(source.sourceRevision)}`,
    { headers: { cookie: `eqb_session=${token}` } },
  )).json()
  if (!layout.paginatedHtml) throw new Error(`layout failed: ${JSON.stringify(layout).slice(0, 300)}\n${serverLog.slice(-500)}`)

  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const page = await browser.newPage()
  await page.setContent(layout.paginatedHtml, { waitUntil: 'load' })
  const bundle = await personalOverlayBrowserScript()
  await page.addScriptTag({ content: bundle.code })

  const pageCount = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length)
  check('the paginated layout rendered real pages', pageCount > 0, `pages=${pageCount}`)

  // Round-trip driver: segment -> forward ranges -> reverse segments. The
  // forward mapping yields one range per touched leaf; a multi-leaf segment
  // is reversed through the combined span, exactly the single continuous
  // selection a pen drag produces inside the iframe.
  const run = await page.evaluate((source) => {
    const api = window.__eqbPersonalOverlay
    const doc = document
    const leaves = source.streams.flatMap((stream) => stream.leaves.map((leaf) => ({ stream, leaf })))
    const paragraphLeaves = leaves.filter((item) => item.leaf.kind === 'paragraph' && item.leaf.end - item.leaf.start > 60)
    const optionLeaves = leaves.filter((item) => item.leaf.kind === 'option')
    const cellLeaves = leaves.filter((item) => item.leaf.kind === 'table-cell')

    const reverse = (ranges) => {
      if (!ranges || ranges.length === 0) return { forward: 0, segments: null }
      const combined = doc.createRange()
      combined.setStart(ranges[0].startContainer, ranges[0].startOffset)
      combined.setEnd(ranges[ranges.length - 1].endContainer, ranges[ranges.length - 1].endOffset)
      return { forward: ranges.length, segments: api.printDomRangeToSegments(doc, source, combined) }
    }
    const segmentOf = (stream, start, end) => {
      // Snap boundaries onto non-whitespace characters: anchors ignore
      // whitespace, so a boundary on a space is not a glyph boundary.
      while (start < end && /\s/u.test(stream.text[start])) start += 1
      while (end > start && /\s/u.test(stream.text[end - 1])) end -= 1
      return {
        streamId: stream.streamId,
        start,
        end,
        selectedText: stream.text.slice(start, end),
      }
    }

    const results = {}
    const first = paragraphLeaves[0]
    if (first) {
      const segment = segmentOf(first.stream, first.leaf.start + 10, first.leaf.start + 50)
      results.paragraph = { segment, ...reverse(api.printSegmentToDomRanges(doc, source, segment)) }
    }
    const option = optionLeaves[0]
    if (option) {
      const segment = segmentOf(option.stream, option.leaf.start, Math.min(option.leaf.end, option.leaf.start + 8))
      results.option = { segment, ...reverse(api.printSegmentToDomRanges(doc, source, segment)) }
    }
    const cell = cellLeaves[0]
    if (cell) {
      const segment = segmentOf(cell.stream, cell.leaf.start, cell.leaf.end)
      results.cell = { segment, ...reverse(api.printSegmentToDomRanges(doc, source, segment)) }
    }

    // A paragraph Paged.js split across pages: the same paragraph id renders
    // as several root elements. The full-leaf segment must round-trip through
    // one range spanning the split.
    const splitTargets = []
    for (const { stream, leaf } of paragraphLeaves) {
      const id = leaf.id.replace(/([^a-zA-Z0-9_-])/gu, '\\$1')
      const roots = [...doc.querySelectorAll(`[data-canonical-paragraph-id="${id}"], [data-canonical-block-id="${id}"]`)]
        .filter((element) => !['table', 'figure', 'framed_columns'].includes(element.getAttribute('data-canonical-block-kind') ?? ''))
      if (roots.length > 1) splitTargets.push({ stream, leaf, roots })
    }
    if (splitTargets[0]) {
      const { stream, leaf } = splitTargets[0]
      const segment = segmentOf(stream, leaf.start, leaf.end)
      results.split = { roots: splitTargets[0].roots.length, segment, ...reverse(api.printSegmentToDomRanges(doc, source, segment)) }
    }

    // Adjacent paragraph leaves (single '\n' between them) merge back into
    // one segment through one combined range.
    for (const { stream, leaf } of paragraphLeaves) {
      const next = stream.leaves.find((item) => item.kind === 'paragraph' && item.start === leaf.end + 1)
      if (!next || stream.text.slice(leaf.end, next.start) !== '\n') continue
      const segment = segmentOf(stream, leaf.start + 5, next.end - 5)
      results.bridged = { segment, ...reverse(api.printSegmentToDomRanges(doc, source, segment)) }
      break
    }

    // Unmappable: a range from paragraph text into another stream's option
    // text (unsafe gap), and a range covering only a presentation label.
    if (first && option && option.stream.streamId !== first.stream.streamId) {
      const para = api.printSegmentToDomRanges(doc, source, segmentOf(first.stream, first.leaf.start + 10, first.leaf.start + 30))
      const opt = api.printSegmentToDomRanges(doc, source, segmentOf(option.stream, option.leaf.start, option.leaf.end))
      if (para && opt) {
        const combined = doc.createRange()
        combined.setStart(para[0].startContainer, para[0].startOffset)
        combined.setEnd(opt[opt.length - 1].endContainer, opt[opt.length - 1].endOffset)
        results.crossStream = api.printDomRangeToSegments(doc, source, combined)
      }
    }
    const qnum = doc.querySelector('.qnum')
    if (qnum) {
      const label = doc.createRange()
      label.selectNodeContents(qnum)
      results.labelOnly = api.printDomRangeToSegments(doc, source, label)
    }
    return results
  }, source)

  const same = (segments, segment) => Boolean(segments && segment && segments.length === 1
    && segments[0].streamId === segment.streamId && segments[0].start === segment.start
    && segments[0].end === segment.end && segments[0].selectedText === segment.selectedText)

  check('a paragraph segment round-trips through the print DOM',
    same(run.paragraph?.segments, run.paragraph?.segment),
    JSON.stringify(run.paragraph))
  check('an option segment round-trips through the print DOM',
    same(run.option?.segments, run.option?.segment),
    JSON.stringify(run.option))
  check('a table-cell segment round-trips through the print DOM',
    run.cell == null || same(run.cell.segments, run.cell.segment),
    JSON.stringify(run.cell))
  check('a paragraph split across pages round-trips as one segment',
    run.split != null && run.split.roots > 1 && same(run.split.segments, run.split.segment),
    JSON.stringify(run.split))
  check('two adjacent paragraphs bridge the single newline back into one segment',
    run.bridged != null && same(run.bridged.segments, run.bridged.segment),
    JSON.stringify(run.bridged))
  check('a range crossing into another stream maps to nothing',
    run.crossStream === null,
    JSON.stringify(run.crossStream))
  check('a range covering only a presentation label maps to nothing',
    run.labelOnly === null,
    JSON.stringify(run.labelOnly))
} catch (error) {
  failed += 1
  console.error(`FAIL the round-trip harness ran: ${error.message}`)
} finally {
  if (browser) await browser.close()
  if (server) server.kill()
}
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
