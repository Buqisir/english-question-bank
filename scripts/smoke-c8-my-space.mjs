#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(rootDir, 'app')] })
const { chromium } = require(playwrightPath)

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-c8-my-space-smoke-'))
const dbPath = path.join(tempRoot, 'question-bank.sqlite')
const userSpaceRoot = path.join(tempRoot, 'user-space-files')
const apiPort = 9899
const vitePort = 5189
const children = []

let passed = 0

function pass(name) {
  passed += 1
  console.log(`PASS ${name}`)
}

function fail(name, details = '') {
  throw new Error(`${name}${details ? `\n${details}` : ''}`)
}

function startProcess(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  child.stdout.on('data', (chunk) => process.stdout.write(`[${options.name}] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[${options.name}] ${chunk}`))
  return child
}

async function waitForHttp(url, timeoutMs = 25_000) {
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
  fail(`Timed out waiting for ${url}`)
}

function seedSmokeDatabase() {
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  db.exec(readFileSync(path.join(rootDir, 'data/sql/seed-v0.sql'), 'utf8'))
  db.exec(`
    INSERT OR REPLACE INTO sources (id, source_type, year, region, paper_name, section, note)
    VALUES ('src-c8-my-space-smoke', 'self_made', 2026, 'C8', 'My Space Smoke', '阅读理解', 'C8 My Space smoke fixture');
    INSERT OR REPLACE INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, difficulty)
    VALUES (
      'passage-c8-my-space-smoke',
      'src-c8-my-space-smoke',
      'Smoke Printable Reading',
      'This printable reading passage exists so the My Space smoke can generate a real student-paper PDF.',
      'Smoke printable reading',
      '人与自我',
      'reading',
      'medium'
    );
    INSERT OR REPLACE INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
    VALUES ('g-c8-my-space-smoke', 'passage-c8-my-space-smoke', 'reading', 'My Space Printable Reading', 'Read and answer.', 199, 2.5, 'medium', 'C8 My Space smoke');
  `)
  const insertQuestion = db.prepare(`
    INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
    VALUES (?, 'g-c8-my-space-smoke', ?, '细节理解', ?, 'A', 'C8 My Space smoke', 'medium', 2.5, ?, '')
  `)
  const insertOption = db.prepare(`
    INSERT OR REPLACE INTO options (id, question_id, label, content, display_order)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (let i = 1; i <= 3; i += 1) {
    const qid = `q-c8-my-space-smoke-${i}`
    insertQuestion.run(qid, String(i), `Smoke My Space stem ${i}.`, i)
    for (const [optionIndex, label] of ['A', 'B', 'C', 'D'].entries()) {
      insertOption.run(`opt-c8-my-space-smoke-${i}-${label}`, qid, label, `Option ${label} for smoke ${i}`, optionIndex + 1)
    }
  }
  db.close()
}

async function main() {
  seedSmokeDatabase()

  startProcess('node', ['server/api.mjs'], {
    cwd: rootDir,
    name: 'api',
    env: {
      ...process.env,
      QUESTION_BANK_DB: dbPath,
      QUESTION_BANK_API_PORT: String(apiPort),
      QUESTION_BANK_USER_SPACE_ROOT: userSpaceRoot,
    },
  })
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)
  pass('API started with temp DB and temp user-space root')

  startProcess('npm', ['run', 'dev:vite', '--', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: path.join(rootDir, 'app'),
    name: 'vite',
    env: {
      ...process.env,
      QUESTION_BANK_API_PORT: String(apiPort),
    },
  })
  await waitForHttp(`http://127.0.0.1:${vitePort}/`)
  pass('Vite app started')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  try {
    await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'networkidle' })
    const draftInfo = await page.evaluate(async () => {
      const response = await fetch('/api/draft-papers/current/items', {
        body: JSON.stringify({ groupId: 'g-c8-my-space-smoke' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      return { ok: response.ok, body: await response.text() }
    })
    if (!draftInfo.ok) fail('Smoke group should be addable to draft', draftInfo.body)
    const draft = JSON.parse(draftInfo.body).draftPaper
    pass('Smoke group added to draft')

    await page.goto(`http://127.0.0.1:${vitePort}/?view=draft-paper&draftPaperId=${draft.id}`, { waitUntil: 'networkidle' })
    await page.locator('.draft-a4-sheet iframe').waitFor({ timeout: 15_000 })
    await page.getByText('导出').click()
    await page.getByRole('button', { name: '保存到个人空间' }).click()
    await page.getByLabel('保存到个人空间').waitFor({ timeout: 10_000 })
    await page.getByPlaceholder('新建文件夹').fill('Smoke 文件夹')
    await page.getByRole('button', { name: '新建' }).click()
    await page.getByRole('button', { name: /^保存$/ }).click()
    const artifactResponse = await page.waitForResponse(
      (response) => response.url().includes('/api/my-space/artifacts') && response.request().method() === 'POST',
      { timeout: 45_000 },
    )
    if (!artifactResponse.ok()) fail('Save to My Space should return success', await artifactResponse.text())
    const artifactPayload = await artifactResponse.json()
    pass('Draft PDF saved to My Space')

    const artifactPath = path.join(userSpaceRoot, `${artifactPayload.artifact.id}.pdf`)
    if (!existsSync(artifactPath)) fail('Saved PDF should exist in temp user-space root')
    pass('Saved PDF exists on disk')

    await page.getByRole('button', { name: '查看个人空间' }).click()
    await page.waitForURL(/view=my-space/)
    await page.getByText('Smoke 文件夹').waitFor({ timeout: 10_000 })
    const artifactTitle = artifactPayload.artifact.title || artifactPayload.artifact.fileName
    await page.locator('.my-space-artifact-row').filter({ hasText: artifactTitle }).first().waitFor({ timeout: 10_000 })
    pass('My Space page lists saved artifact')

    await page.locator('.my-space-folder-row').filter({ hasText: 'Smoke 文件夹' }).getByLabel('删除文件夹').click()
    await page.getByText('文件夹中还有文件，不能删除').waitFor({ timeout: 10_000 })
    pass('Folder with artifacts cannot be deleted')

    const downloadResponsePromise = page.waitForResponse(
      (response) => response.url().includes(`/user-space/files/${artifactPayload.artifact.id}.pdf`),
      { timeout: 10_000 },
    )
    await page.getByRole('button', { name: '下载 PDF' }).first().click()
    const downloadResponse = await downloadResponsePromise
    if (!downloadResponse.ok()) fail('Artifact PDF download should succeed', await downloadResponse.text())
    pass('Artifact PDF downloads from static route')

    const db = new DatabaseSync(dbPath)
    db.prepare("UPDATE draft_papers SET status = 'deleted' WHERE id = ?").run(draft.id)
    db.close()
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '打开原草稿' }).first().click()
    await page.getByText('原草稿卷已删除，PDF 仍可下载').waitFor({ timeout: 10_000 })
    pass('Source-draft-gone state keeps artifact downloadable and blocks source open')

    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('.my-space-artifact-actions').getByRole('button', { name: /删除/ }).first().click()
    await page.getByText('文件已删除。').waitFor({ timeout: 10_000 })
    if (existsSync(artifactPath)) fail('Deleting artifact should remove PDF file')
    pass('Deleting artifact removes PDF file')

    if (pageErrors.length > 0) fail('No page errors expected', pageErrors.join('\n'))
    pass('No page errors')
  } finally {
    await browser.close()
  }
}

main()
  .then(() => {
    console.log(`\nC8 My Space smoke passed: ${passed} passed`)
  })
  .catch((error) => {
    console.error(`\nC8 My Space smoke FAILED\n${error.stack || error.message || error}`)
    process.exitCode = 1
  })
  .finally(() => {
    for (const child of children) child.kill('SIGTERM')
    rmSync(tempRoot, { recursive: true, force: true })
  })
