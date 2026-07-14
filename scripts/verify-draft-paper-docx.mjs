#!/usr/bin/env node
// draft-docx cut (docs/cuts/draft-docx/plan.md, Verification): behavior-first
// check of POST /api/draft-papers/:id/docx — the new draft-paper DOCX export
// endpoint that reuses the integral-paper exportDocx/docxRenderer pipeline
// (server/exports/docxRenderer.mjs — untouched, only consumed; see plan.md
// Forbidden). Mirrors the temp-DB smoke pattern in smoke-c8-draft-paper-composer.mjs
// / smoke-golden-path.mjs, API-only (no browser needed — this is a plain
// fetch/response-shape contract, not a UI interaction).
//
// Port 9895 — reserved lane per plan.md (avoids 9897-9899/5187-5189 used by
// other smoke/verify scripts and the concurrent fixture-move cut).
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-draft-docx-verify-'))
const dbPath = path.join(tempRoot, 'question-bank.sqlite')
const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
const apiPort = 9895
const baseUrl = `http://127.0.0.1:${apiPort}`

let passed = 0
let failed = 0
let apiProcess = null

function pass(name) {
  passed += 1
  console.log(`PASS ${name}`)
}

function fail(name, details = '') {
  failed += 1
  console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
}

function assert(name, condition, details = '') {
  if (condition) pass(name)
  else fail(name, details)
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // keep waiting
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
    VALUES ('src-draft-docx-verify', 'self_made', 2026, 'DOCXV', 'Draft DOCX Verify', '完形填空', 'draft-docx verify fixture');
    INSERT OR REPLACE INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, difficulty)
    VALUES (
      'passage-draft-docx-verify',
      'src-draft-docx-verify',
      'Draft DOCX 验证篇',
      'This passage exists only to feed the draft-paper DOCX export verify script.',
      'Draft DOCX 验证篇',
      '人与自我',
      'expository',
      'medium'
    );
    INSERT OR REPLACE INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
    VALUES ('g-draft-docx-verify', 'passage-draft-docx-verify', 'reading', 'Draft DOCX 验证题组', 'Choose the best answer.', 1, 1, 'medium', 'draft-docx verify');
  `)
  const insertQuestion = db.prepare(`
    INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
    VALUES (?, ?, ?, ?, ?, 'A', ?, 'medium', ?, ?, '')
  `)
  const insertOption = db.prepare(`
    INSERT OR REPLACE INTO options (id, question_id, label, content, display_order)
    VALUES (?, ?, ?, ?, ?)
  `)
  insertQuestion.run(
    'q-draft-docx-verify-1',
    'g-draft-docx-verify',
    '1',
    '细节理解',
    'Draft docx verify stem marker one.',
    'Draft docx verify explanation marker.',
    1,
    1,
  )
  for (const [optionIndex, label] of ['A', 'B', 'C', 'D'].entries()) {
    insertOption.run(`opt-draft-docx-verify-${label}`, 'q-draft-docx-verify-1', label, `Option ${label}`, optionIndex + 1)
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

function isPkZip(buffer) {
  return buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4b
}

function readDocumentXml(buffer) {
  const docxPath = path.join(tempRoot, `probe-${Date.now()}-${Math.random().toString(36).slice(2)}.docx`)
  writeFileSync(docxPath, buffer)
  try {
    return execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], { encoding: 'utf8' })
  } finally {
    rmSync(docxPath, { force: true })
  }
}

async function requestDocx(draftPaperId, versionType) {
  const response = await fetch(`${baseUrl}/api/draft-papers/${encodeURIComponent(draftPaperId)}/docx`, {
    body: JSON.stringify({ versionType }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  return response
}

async function main() {
  seedDatabase()
  startApi()
  await waitForHttp(`${baseUrl}/api/health`)
  pass('API started with temp DB')

  // Build a draft paper for the default (bootstrap-open, user_id 'local') user.
  const addResult = await fetch(`${baseUrl}/api/draft-papers/current/items`, {
    body: JSON.stringify({ groupId: 'g-draft-docx-verify' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const addResultText = await addResult.text()
  if (!addResult.ok) fail('seed draft paper item', addResultText)
  const addBody = JSON.parse(addResultText)
  const draftPaperId = addBody.draftPaper.id
  assert('draft paper created via current/items', typeof draftPaperId === 'string' && draftPaperId.length > 0)

  // Student version
  const studentResponse = await requestDocx(draftPaperId, 'student')
  assert('student docx: 200 response', studentResponse.status === 200, `status=${studentResponse.status}`)
  const studentBuffer = Buffer.from(await studentResponse.arrayBuffer())
  assert('student docx: response is a PK zip (DOCX magic)', isPkZip(studentBuffer))
  assert(
    'student docx: content-type is wordprocessingml',
    studentResponse.headers.get('content-type') === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  assert(
    'student docx: content-disposition carries a .docx filename',
    /\.docx"/.test(studentResponse.headers.get('content-disposition') || ''),
  )
  const studentXml = readDocumentXml(studentBuffer)
  assert('student docx: document.xml contains the question stem', studentXml.includes('Draft docx verify stem marker one.'))
  assert('student docx: document.xml contains the section-header group-type label', studentXml.includes('阅读理解'))
  assert('student docx: document.xml has no 解析 marker (teacher-only)', !studentXml.includes('【解析】'))

  // Teacher version
  const teacherResponse = await requestDocx(draftPaperId, 'teacher')
  assert('teacher docx: 200 response', teacherResponse.status === 200, `status=${teacherResponse.status}`)
  const teacherBuffer = Buffer.from(await teacherResponse.arrayBuffer())
  assert('teacher docx: response is a PK zip (DOCX magic)', isPkZip(teacherBuffer))
  const teacherXml = readDocumentXml(teacherBuffer)
  assert('teacher docx: document.xml contains the question stem', teacherXml.includes('Draft docx verify stem marker one.'))
  assert('teacher docx: document.xml contains the 解析 marker', teacherXml.includes('【解析】'))
  assert('teacher docx: 解析 marker carries the seeded explanation text', teacherXml.includes('Draft docx verify explanation marker.'))

  // 404: unknown draftPaperId
  const unknownResponse = await requestDocx('draft-paper-does-not-exist', 'student')
  assert('unknown draftPaperId: 404', unknownResponse.status === 404, `status=${unknownResponse.status}`)

  // 404: draft paper exists but belongs to a different user (ownership boundary,
  // same not-found-shaped 404 as print-pdf per plan.md's "同文件 print-pdf 完全同款").
  const userDb = new DatabaseSync(userDataDbPath)
  userDb.exec(`
    INSERT INTO draft_papers (id, user_id, title, status, current_marker)
    VALUES ('draft-paper-other-user', 'user-other', 'Someone else''s draft', 'active', 0);
    INSERT INTO draft_paper_items (id, draft_paper_id, group_id, order_index)
    VALUES ('draft-item-other-user', 'draft-paper-other-user', 'g-draft-docx-verify', 0);
  `)
  userDb.close()
  const otherUserResponse = await requestDocx('draft-paper-other-user', 'student')
  assert('cross-user draftPaperId: 404 (not 400/403, mirrors print-pdf)', otherUserResponse.status === 404, `status=${otherUserResponse.status}`)

  if (failed > 0) {
    throw new Error(`${failed} check(s) failed`)
  }
  console.log(`\ndraft-docx verify passed: ${passed} checks`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    if (apiProcess) apiProcess.kill('SIGTERM')
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true })
  })
