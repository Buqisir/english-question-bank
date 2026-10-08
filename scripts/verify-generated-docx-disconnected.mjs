#!/usr/bin/env node
// Ticket 16: public-seam proof that generated DOCX and the obsolete
// DOCX-to-LibreOffice PDF path are gone while draft-paper /print-pdf still
// returns direct Chromium/Playwright PDF bytes.
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import {
  publishCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import {
  makeClozeGrammarCanonicalReferenceFixture,
} from '../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-docx-disconnected-'))
const dbPath = path.join(tempRoot, 'question-bank.sqlite')
const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
const paperAssetsDir = path.join(tempRoot, 'paper-assets')
const userSpaceRoot = path.join(tempRoot, 'user-space')
const apiPort = 9895
const baseUrl = `http://127.0.0.1:${apiPort}`
const exportDir = path.join(rootDir, 'exports')

let passed = 0
let failed = 0
let apiProcess = null

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Keep waiting for the local API.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function seedDatabase() {
  const fixture = makeClozeGrammarCanonicalReferenceFixture()
  const asset = JSON.parse(new TextDecoder().decode(fixture.sourceAsset))
  const groupIds = [
    'group-2026-i-cloze',
    'group-2026-i-grammar-fill',
  ]
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  db.exec(`
    INSERT INTO sources (id, source_type, year, region, paper_name, section, note)
    VALUES ('src-ticket-16-canonical', 'self_made', 2026, 'T16', 'Ticket 16 Canonical', '语法填空', 'direct Print/PDF fixture');
  `)
  const insertPassage = db.prepare(`
    INSERT INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, difficulty)
    VALUES (?, 'src-ticket-16-canonical', ?, ?, ?, '人与自我', ?, 'medium')
  `)
  const insertGroup = db.prepare(`
    INSERT INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
    VALUES (?, ?, ?, ?, 'Canonical fixture', ?, 1, 'medium', 'direct Print/PDF fixture')
  `)
  const insertQuestion = db.prepare(`
    INSERT INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
    VALUES (?, ?, ?, 'Canonical fixture', ?, 'A', 'direct Print/PDF fixture', 'medium', 1, ?, '')
  `)
  const insertOption = db.prepare(`
    INSERT INTO options (id, question_id, label, content, display_order)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (const [groupIndex, groupId] of groupIds.entries()) {
    const group = asset.content.groups[groupId]
    if (!group) throw new Error(`Canonical fixture group is missing: ${groupId}`)
    const passageId = `passage-ticket-16-canonical-${groupIndex + 1}`
    const paragraphs = group.passage?.paragraphs ?? []
    insertPassage.run(
      passageId,
      group.title,
      paragraphs.map((paragraph) => paragraph.text).join('\n'),
      group.title,
      group.groupType,
    )
    insertGroup.run(
      groupId,
      passageId,
      group.groupType === 'grammarFill' ? 'grammar_cloze' : group.groupType,
      group.title,
      groupIndex + 1,
    )
    for (const [questionIndex, questionId] of group.questionIds.entries()) {
      const question = asset.content.questions[questionId]
      if (!question) throw new Error(`Canonical fixture question is missing: ${questionId}`)
      insertQuestion.run(
        questionId,
        groupId,
        String(question.questionNo),
        String(question.stem ?? question.questionNo),
        questionIndex + 1,
      )
      for (const [optionIndex, option] of (question.options ?? []).entries()) {
        insertOption.run(
          `${questionId}-${option.label}`,
          questionId,
          option.label,
          option.text,
          optionIndex + 1,
        )
      }
    }
  }
  const published = publishCanonicalPaperPublication({
    rootDir: paperAssetsDir,
    db,
    request: fixture.request,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  if (published.status !== 'published') {
    throw new Error(`Canonical fixture publication failed: ${JSON.stringify(published)}`)
  }
  writeFileSync(
    path.join(
      paperAssetsDir,
      asset.paper.paperId,
      'versions',
      published.versionName,
      'paper-asset.json',
    ),
    fixture.sourceAsset,
  )
  db.close()
  return { groupIds: [groupIds[1], groupIds[0]] }
}

function startApi() {
  apiProcess = spawn('node', ['server/api.mjs'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      QUESTION_BANK_DB: dbPath,
      USER_DATA_DB: userDataDbPath,
      QUESTION_BANK_PAPER_ASSET_ROOT: paperAssetsDir,
      QUESTION_BANK_USER_SPACE_ROOT: userSpaceRoot,
      QUESTION_BANK_API_PORT: String(apiPort),
    },
  })
  apiProcess.stdout.on('data', (chunk) => process.stdout.write(`[api] ${chunk}`))
  apiProcess.stderr.on('data', (chunk) => process.stderr.write(`[api] ${chunk}`))
}

function exportDirectoryEntries() {
  return existsSync(exportDir) ? readdirSync(exportDir).sort() : []
}

function temporaryArtifactEntries() {
  return existsSync(tempRoot) ? readdirSync(tempRoot, { recursive: true }).sort() : []
}

function artifactRows() {
  const db = new DatabaseSync(userDataDbPath, { readOnly: true })
  try {
    return db.prepare('SELECT * FROM my_space_artifacts ORDER BY id').all()
  } finally {
    db.close()
  }
}

async function post(pathname, body = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

async function main() {
  const workbench = read('app/src/features/draft-paper/DraftPaperWorkbench.tsx')
  const draftService = read('app/src/services/draftPapers.ts')
  const questionGroupService = read('app/src/services/questionGroups.ts')
  const paperExports = read('app/src/paperAssembly/usePaperExports.ts')
  const paperExportPayload = read('app/src/paperAssembly/paperExportPayload.ts')
  const questionBankDomain = read('app/src/domain/questionBank.ts')
  const exportRoutes = read('server/exports/exportRoutes.mjs')
  const draftRoutes = read('server/draft-paper/draftPaperRoutes.mjs')
  const draftStore = read('server/draft-paper/draftPaperStore.mjs')
  const paginationRenderer = read('server/draft-paper/paginationRenderer.mjs')

  assert('teacher UI has no generated-DOCX control', !/下载 DOCX|导出 DOCX/.test(workbench))
  assert('draft client has no generated-DOCX call', !draftService.includes('downloadDraftPaperDocx') && !draftService.includes('/docx'))
  assert('general client has no generated-DOCX call', !questionGroupService.includes('exportDocx') && !questionGroupService.includes('/api/exports/docx'))
  assert('general client has no obsolete converted-PDF call', !questionGroupService.includes('exportPdf') && !questionGroupService.includes('/api/exports/pdf'))
  assert('export state has no generated-DOCX or converted-PDF action', !/exportDocx|exportPdf|docxStatus|pdfStatus/.test(paperExports))
  assert('live Print state uses a renderer-neutral payload builder', paperExports.includes('buildPrintPayload') && !paperExports.includes('buildDocxPayload'))
  assert('client payload contract has no generated-DOCX name', !/ExportDocx|buildDocxPayload|buildPdfPayload/.test(paperExportPayload))
  assert('client domain exposes only renderer-neutral Print export types', /PrintExportInput|PrintExportResult/.test(questionBankDomain) && !/ExportDocx|ExportPdf/.test(questionBankDomain))
  assert('general output router exposes no DOCX or converted-PDF route', !exportRoutes.includes('/api\\/exports\\/docx$') && !exportRoutes.includes('/api\\/exports\\/pdf$'))
  assert('draft router exposes no generated-DOCX route', !draftRoutes.includes('\\/docx$'))
  assert('draft store exposes no generated-DOCX entry point', !/exportDraftPaperDocx/.test(draftStore))

  const draftPdfStart = draftStore.indexOf('async function exportDraftPaperPdf')
  const draftPdfEnd = draftStore.indexOf('\n  // draft-desk-b step2/3', draftPdfStart)
  const draftPdfSource = draftPdfStart >= 0 && draftPdfEnd > draftPdfStart
    ? draftStore.slice(draftPdfStart, draftPdfEnd)
    : ''
  assert('draft PDF entry point is present', Boolean(draftPdfSource))
  assert('draft PDF consumes pagination PDF bytes', /getDraftPaperPagination[\s\S]*pagination\.pdfBytes/.test(draftPdfSource))
  assert('draft PDF entry point never calls DOCX or LibreOffice', !/docx|libreoffice|soffice|convert/i.test(draftPdfSource))
  assert('pagination renderer generates PDF with Playwright page.pdf', /await page\.pdf\(\{/.test(paginationRenderer))
  assert('pagination renderer pins Chromium CSS page geometry', /preferCSSPageSize:\s*true/.test(paginationRenderer))

  const { groupIds } = seedDatabase()
  startApi()
  await waitForHttp(`${baseUrl}/api/health`)
  assert('API started with temporary databases', true)

  const addGrammarResponse = await post('/api/draft-papers/current/items', { groupId: groupIds[0] })
  const addGrammarBody = await addGrammarResponse.json()
  assert('confirmed Canonical grammar group enters the draft', addGrammarResponse.status === 201, JSON.stringify(addGrammarBody))
  const addClozeResponse = await post('/api/draft-papers/current/items', { groupId: groupIds[1] })
  const addClozeBody = await addClozeResponse.json()
  assert('confirmed Canonical cloze group enters the draft', addClozeResponse.status === 201, JSON.stringify(addClozeBody))
  const draftPaperId = addClozeBody?.draftPaper?.id
  assert('confirmed Canonical additions identify one draft', typeof draftPaperId === 'string' && draftPaperId.length > 0)

  const exportsBefore = exportDirectoryEntries()
  const temporaryEntriesBefore = temporaryArtifactEntries()
  const artifactRowsBefore = artifactRows()
  const printHtmlResponse = await fetch(`${baseUrl}/api/draft-papers/${encodeURIComponent(draftPaperId)}/print-html?edition=largeNoListening`)
  const printHtml = await printHtmlResponse.text()
  assert(
    'direct draft Print HTML uses confirmed Canonical content',
    printHtmlResponse.status === 200 && printHtml.includes('data-canonical-group-id'),
    printHtml.slice(0, 500),
  )
  const printPdfResponse = await post(`/api/draft-papers/${encodeURIComponent(draftPaperId)}/print-pdf`, { edition: 'largeNoListening' })
  const printPdfBytes = new Uint8Array(await printPdfResponse.arrayBuffer())
  assert(
    'direct draft Print/PDF returns Chromium PDF bytes',
    printPdfResponse.status === 200 && new TextDecoder().decode(printPdfBytes.slice(0, 4)) === '%PDF',
    `status=${printPdfResponse.status}`,
  )
  assert('direct Print/PDF leaves no export directory artifact', JSON.stringify(exportDirectoryEntries()) === JSON.stringify(exportsBefore))
  assert('direct Print/PDF leaves no temporary DOCX/PDF/converted artifact', JSON.stringify(temporaryArtifactEntries()) === JSON.stringify(temporaryEntriesBefore))
  assert('direct Print/PDF leaves no My Space artifact row', JSON.stringify(artifactRows()) === JSON.stringify(artifactRowsBefore))

  for (const pathname of [
    '/api/exports/docx',
    '/api/exports/pdf',
    `/api/draft-papers/${encodeURIComponent(draftPaperId)}/docx`,
  ]) {
    const response = await post(pathname, { versionType: 'student' })
    assert(`${pathname} is not routed`, response.status === 404, `status=${response.status}`)
  }

  if (failed > 0) throw new Error(`${failed} check(s) failed`)
  console.log(`\nTicket 16 generated-DOCX disconnect verify passed: ${passed} checks`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    if (apiProcess) apiProcess.kill('SIGKILL')
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true })
  })
