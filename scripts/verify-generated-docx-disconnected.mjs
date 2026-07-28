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
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-docx-disconnected-'))
const dbPath = path.join(tempRoot, 'question-bank.sqlite')
const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
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
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  db.exec(readFileSync(path.join(rootDir, 'data/sql/seed-v0.sql'), 'utf8'))
  db.exec(`
    INSERT OR REPLACE INTO sources (id, source_type, year, region, paper_name, section, note)
    VALUES ('src-ticket-16', 'self_made', 2026, 'T16', 'Ticket 16', '阅读理解', 'public PDF fixture');
    INSERT OR REPLACE INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, difficulty)
    VALUES (
      'passage-ticket-16',
      'src-ticket-16',
      'Ticket 16 passage',
      'This source feeds the direct Chromium PDF public-seam regression.',
      'Ticket 16 passage',
      '人与自我',
      'expository',
      'medium'
    );
    INSERT OR REPLACE INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
    VALUES ('g-ticket-16', 'passage-ticket-16', 'reading', 'Ticket 16 group', 'Choose the best answer.', 1, 1, 'medium', '');
    INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
    VALUES ('q-ticket-16', 'g-ticket-16', '1', '细节理解', 'Ticket 16 PDF marker?', 'A', 'Ticket 16 teacher explanation.', 'medium', 1, 1, '');
  `)
  const insertOption = db.prepare(`
    INSERT OR REPLACE INTO options (id, question_id, label, content, display_order)
    VALUES (?, 'q-ticket-16', ?, ?, ?)
  `)
  for (const [index, label] of ['A', 'B', 'C', 'D'].entries()) {
    insertOption.run(`opt-ticket-16-${label}`, label, `Option ${label}`, index + 1)
  }
  db.close()
}

function startApi() {
  apiProcess = spawn('node', ['server/api.mjs'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      QUESTION_BANK_DB: dbPath,
      USER_DATA_DB: userDataDbPath,
      QUESTION_BANK_API_PORT: String(apiPort),
    },
  })
  apiProcess.stdout.on('data', (chunk) => process.stdout.write(`[api] ${chunk}`))
  apiProcess.stderr.on('data', (chunk) => process.stderr.write(`[api] ${chunk}`))
}

function exportDirectoryEntries() {
  return existsSync(exportDir) ? readdirSync(exportDir).sort() : []
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

  seedDatabase()
  startApi()
  await waitForHttp(`${baseUrl}/api/health`)
  assert('API started with temporary databases', true)

  const addResponse = await post('/api/draft-papers/current/items', { groupId: 'g-ticket-16' })
  const addText = await addResponse.text()
  assert('draft paper fixture created through public API', addResponse.ok, addText)
  const draftPaperId = JSON.parse(addText).draftPaper.id

  for (const pathname of [
    '/api/exports/docx',
    '/api/exports/pdf',
    `/api/draft-papers/${encodeURIComponent(draftPaperId)}/docx`,
  ]) {
    const response = await post(pathname, { versionType: 'student' })
    assert(`${pathname} is not routed`, response.status === 404, `status=${response.status}`)
  }

  const beforeExports = exportDirectoryEntries()
  for (const versionType of ['student', 'teacher']) {
    const response = await post(
      `/api/draft-papers/${encodeURIComponent(draftPaperId)}/print-pdf`,
      { versionType },
    )
    const bytes = Buffer.from(await response.arrayBuffer())
    assert(`${versionType} /print-pdf returns 200`, response.status === 200, `status=${response.status}`)
    assert(`${versionType} /print-pdf returns application/pdf`, response.headers.get('content-type') === 'application/pdf')
    assert(`${versionType} /print-pdf returns real PDF bytes`, bytes.subarray(0, 4).toString() === '%PDF')
  }
  assert(
    'direct /print-pdf writes no DOCX or converted-PDF export artifact',
    JSON.stringify(exportDirectoryEntries()) === JSON.stringify(beforeExports),
  )

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
