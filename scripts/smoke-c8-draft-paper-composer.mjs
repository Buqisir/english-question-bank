#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(rootDir, 'app')] })
const { chromium } = require(playwrightPath)

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-c8-smoke-'))
const dbPath = path.join(tempRoot, 'question-bank.sqlite')
const apiPort = 9898
const vitePort = 5188
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
  fail(`Timed out waiting for ${url}`)
}

async function expandFirstPaperIfNeeded(page) {
  const addButton = page.getByRole('button', { name: '加入草稿卷' }).first()
  if (await addButton.isVisible().catch(() => false)) return
  const expandButton = page.getByRole('button', { name: /展开题组/ }).first()
  await expandButton.waitFor({ timeout: 10_000 })
  await expandButton.click()
}

function seedSmokeDatabase() {
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  db.exec(readFileSync(path.join(rootDir, 'data/sql/seed-v0.sql'), 'utf8'))
  db.exec(`
    INSERT OR REPLACE INTO sources (id, source_type, year, region, paper_name, section, note)
    VALUES ('src-c8-smoke', 'self_made', 2026, 'C8', 'Browser Smoke', '完形填空', 'C8 smoke fixture');
    INSERT OR REPLACE INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, difficulty)
    VALUES (
      'passage-c8-smoke-cloze',
      'src-c8-smoke',
      '分页建议压力测试',
      'This passage intentionally contains enough objective questions and options to trigger the deterministic page break suggestion in the C8 draft paper composer smoke test.',
      '分页建议压力测试',
      '人与自我',
      'cloze',
      'medium'
    );
    INSERT OR REPLACE INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
    VALUES ('g-c8-smoke-pagebreak', 'passage-c8-smoke-cloze', 'cloze', '分页建议压力测试', 'Choose the best answer.', 99, 1, 'medium', 'C8 smoke');
    INSERT OR REPLACE INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
    VALUES ('g-c8-smoke-reading', 'passage-c8-smoke-cloze', 'reading', 'C8 第二题组', 'Read and answer.', 100, 2.5, 'medium', 'C8 smoke');
  `)
  const insertQuestion = db.prepare(`
    INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
    VALUES (?, ?, ?, ?, ?, 'A', 'C8 smoke', 'medium', ?, ?, '')
  `)
  const insertOption = db.prepare(`
    INSERT OR REPLACE INTO options (id, question_id, label, content, display_order)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (let i = 1; i <= 5; i += 1) {
    const qid = `q-c8-smoke-${i}`
    insertQuestion.run(qid, 'g-c8-smoke-pagebreak', String(i), '完形语义', `Smoke stem ${i} with printable content.`, 1, i)
    for (const [optionIndex, label] of ['A', 'B', 'C', 'D'].entries()) {
      insertOption.run(`opt-c8-smoke-${i}-${label}`, qid, label, `Option ${label} for smoke ${i}`, optionIndex + 1)
    }
  }
  insertQuestion.run(
    'q-c8-smoke-reading-1',
    'g-c8-smoke-reading',
    '1',
    '细节理解',
    'Second smoke group stem with printable content.',
    2.5,
    1,
  )
  for (const [optionIndex, label] of ['A', 'B', 'C', 'D'].entries()) {
    insertOption.run(`opt-c8-smoke-reading-${label}`, 'q-c8-smoke-reading-1', label, `Reading option ${label}`, optionIndex + 1)
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
    },
  })
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)
  pass('API started with temp DB')

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
    const questionGroupsLoaded = page
      .waitForResponse(
        (response) => response.url().includes('/api/question-groups') && response.status() === 200,
        { timeout: 10_000 },
      )
      .catch(() => null)
    await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'networkidle' })
    await questionGroupsLoaded
    await page.getByPlaceholder(/找一道|比如/).waitFor()
    await page.waitForFunction(async () => {
      const data = await fetch('/api/question-groups').then((response) => response.json())
      return data.questionGroups.some((group) => group.id === 'g-c8-smoke-pagebreak' && group.canAddToDraftPaper)
    })
    await page.getByPlaceholder(/找一道|正在连接|比如/).fill('分页建议压力测试')
    await page.getByRole('button', { name: '开始取题' }).click()
    await expandFirstPaperIfNeeded(page)
    const pageBreakCard = page.locator('.concierge-group-card').filter({ hasText: '分页建议压力测试' }).first()
    await pageBreakCard.waitFor({ timeout: 10_000 })
    await pageBreakCard.getByRole('button', { name: '加入草稿卷' }).click()
    const updatedPageBreakCard = pageBreakCard
    await updatedPageBreakCard.getByRole('button', { name: '已在草稿卷中' }).waitFor({ timeout: 10_000 })
    pass('Search add changes card state to already in draft')

    await page.evaluate(async () => {
      const response = await fetch('/api/draft-papers/current/items', {
        body: JSON.stringify({ groupId: 'g-c8-smoke-reading' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) throw new Error(await response.text())
    })
    await updatedPageBreakCard.getByRole('button', { name: '已在草稿卷中' }).click()
    await page.waitForURL(/view=draft-paper/)
    await page.locator('.draft-a4-sheet iframe').waitFor()
    pass('Already-added click opens draft-paper route with A4 preview')

    await page.getByRole('button', { name: '下移' }).first().click()
    await page.getByRole('button', { name: '删除题组' }).first().click()
    await page.getByRole('button', { name: /撤销/ }).click()
    pass('Reorder and delete/undo controls work')

    await page.getByRole('button', { name: /前置分页/ }).first().click()
    await page.getByText('分页').first().waitFor()
    pass('Manual page break can be applied before a group')

    const suggestion = page.getByText(/建议分页|分页建议|题量和选项较多/).first()
    await suggestion.waitFor({ timeout: 10_000 })
    pass('Server-side page break suggestion appears')

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
    await page.locator('.draft-export-menu summary').click()
    await page.getByRole('button', { name: /下载 PDF/ }).click()
    await downloadPromise
    pass('PDF download path works')

    const printPopupPromise = page.waitForEvent('popup', { timeout: 10_000 })
    await page.getByRole('button', { name: /浏览器打印/ }).click()
    const printPopup = await printPopupPromise
    await printPopup.waitForLoadState('domcontentloaded')
    await printPopup.close()
    pass('Browser print path opens printable HTML')

    await page.setViewportSize({ width: 1440, height: 920 })
    await page.locator('.draft-a4-sheet iframe').waitFor()
    pass('Zoom 100 style viewport remains readable')

    await page.setViewportSize({ width: 1280, height: 820 })
    await page.locator('.draft-a4-sheet iframe').waitFor()
    pass('Zoom 90-style viewport remains readable')

    await page.setViewportSize({ width: 760, height: 900 })
    await page.locator('.draft-a4-sheet iframe').waitFor()
    await page.locator('.draft-outline-panel').waitFor()
    pass('Narrow viewport keeps preview and outline accessible')

    if (pageErrors.length > 0) {
      fail('No browser page errors expected', pageErrors.join('\n'))
    }
    pass('No page errors')
  } finally {
    await browser.close()
  }

  console.log(`\nC8 draft paper composer smoke passed: ${passed} checks`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    for (const child of children.reverse()) {
      child.kill('SIGTERM')
    }
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true })
  })
