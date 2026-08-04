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
const userDataDbPath = path.join(tempRoot, 'user-data.sqlite')
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

function waitForDraftMutation(page, method) {
  return page.waitForResponse(
    (response) =>
      response.url().includes('/api/draft-papers/') &&
      response.request().method() === method,
    { timeout: 10_000 },
  )
}

async function assertOkResponse(name, response) {
  if (response.status() >= 200 && response.status() < 300) return
  fail(name, await response.text().catch(() => `HTTP ${response.status()}`))
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
      USER_DATA_DB: userDataDbPath,
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

  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
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
    await page.waitForFunction(async () => {
      const data = await fetch('/api/question-groups').then((response) => response.json())
      const groups = new Map(data.questionGroups.map((group) => [group.id, group]))
      return [
        'group-2024-jslk-reading-a',
        'group-2024-jslk-reading-b',
        'group-2024-jslk-reading-c',
        'group-2024-jslk-reading-d',
      ].every((groupId) => groups.get(groupId)?.canAddToDraftPaper)
    })
    pass('Paper-asset Reading A-D groups can be added to draft')
    const paperAssetDetail = await page.evaluate(async () => {
      const response = await fetch('/api/question-groups/group-2024-jslk-reading-a')
      const data = await response.json()
      const group = data.questionGroup
      return {
        hasRealMaterial: group.passage.materialText.includes('Yellowstone Poster Exhibition'),
        firstOptionCount: group.questions[0]?.options?.length || 0,
      }
    })
    if (!paperAssetDetail.hasRealMaterial || paperAssetDetail.firstOptionCount !== 4) {
      fail('Paper-asset detail should feed draft preview with real material and options', JSON.stringify(paperAssetDetail))
    }
    pass('Paper-asset detail feeds draft preview with real material and options')
    await page.getByPlaceholder(/找一道|正在连接|比如/).fill('分页建议压力测试')
    await page.getByRole('button', { name: '开始取题' }).click()
    await expandFirstPaperIfNeeded(page)
    const pageBreakCard = page.locator('[data-group-id="g-c8-smoke-pagebreak"]').first()
    await pageBreakCard.waitFor({ timeout: 10_000 })
    await pageBreakCard.getByText('5 题').waitFor({ timeout: 10_000 })
    await pageBreakCard.getByRole('button', { name: '加入草稿卷' }).click()
    const updatedPageBreakCard = pageBreakCard
    await updatedPageBreakCard.getByRole('button', { name: '已在草稿卷中' }).waitFor({ timeout: 10_000 })
    pass('Search add changes card state to already in draft')

    const secondGroupAdd = await page.evaluate(async () => {
      const response = await fetch('/api/draft-papers/current/items', {
        body: JSON.stringify({ groupId: 'g-c8-smoke-reading' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      return { ok: response.ok, status: response.status, body: await response.text() }
    })
    if (!secondGroupAdd.ok) {
      fail('Second smoke group should be addable', secondGroupAdd.body || `HTTP ${secondGroupAdd.status}`)
    }
    const secondGroupDraft = JSON.parse(secondGroupAdd.body)
    if (secondGroupDraft.draftPaper.items.length < 2) {
      fail('Second smoke group should appear in draft API response', secondGroupAdd.body)
    }
    await updatedPageBreakCard.getByRole('button', { name: '已在草稿卷中' }).click()
    await page.waitForURL(/view=draft-paper/)
    await page.locator('.draft-a4-sheet iframe').waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.draft-outline-item').length >= 2)
    pass('Already-added click opens draft-paper route with A4 preview')

    const reorderSaved = waitForDraftMutation(page, 'PATCH')
    await page.getByRole('button', { name: '下移' }).first().click()
    await assertOkResponse('Reorder mutation should succeed', await reorderSaved)
    pass('Reorder control works and auto-saves')

    const firstOutlineItem = page.locator('.draft-outline-item').first()
    const firstItemPageBreakButtons = await firstOutlineItem.getByRole('button', { name: /前置分页/ }).count()
    if (firstItemPageBreakButtons > 0) {
      fail('First draft group must not expose a leading page-break control')
    }
    pass('First draft group cannot create a leading blank page')

    const suggestion = page.getByText(/建议分页|分页建议|题量和选项较多/).first()
    await suggestion.waitFor({ timeout: 10_000 })
    pass('Server-side page break suggestion appears')

    const pageBreakSaved = waitForDraftMutation(page, 'PATCH')
    await page.getByRole('button', { name: /前置分页/ }).first().click()
    await assertOkResponse('Page-break mutation should succeed', await pageBreakSaved)
    await page.getByText('分页').first().waitFor()
    pass('Manual page break can be applied before a group')

    const deleteSaved = waitForDraftMutation(page, 'DELETE')
    await page.getByRole('button', { name: '删除题组' }).first().click()
    await assertOkResponse('Delete mutation should succeed', await deleteSaved)
    const restoreSaved = waitForDraftMutation(page, 'POST')
    await page.getByRole('button', { name: /撤销/ }).click()
    await assertOkResponse('Restore mutation should succeed', await restoreSaved)
    pass('Delete/undo controls work')

    // Orphan tolerance (ADR-0011 / plan.md decision 4): drop a question group that is
    // still referenced by a draft item directly from the bank DB (simulating a bank-file
    // replacement), then confirm the workbench keeps working — list/detail don't crash,
    // the item shows as invalid, and print/export skip it without erroring. Runs before
    // the PDF/print-popup checks below so it does not depend on the vivliostyle binary.
    const orphanedGroupId = 'g-c8-smoke-reading'
    const bankDb = new DatabaseSync(dbPath)
    bankDb.prepare('DELETE FROM question_groups WHERE id = ?').run(orphanedGroupId)
    bankDb.close()

    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('.draft-a4-sheet iframe').waitFor({ timeout: 15_000 })
    const orphanedItem = page.locator(`.draft-outline-item[data-draft-group-id="${orphanedGroupId}"]`)
    await orphanedItem.waitFor({ timeout: 10_000 })
    await orphanedItem.getByText('题组不存在').waitFor({ timeout: 10_000 })
    pass('Orphaned draft item (bank group deleted) renders as invalid without crashing')

    const orphanDraftInfo = await page.evaluate(async () => {
      const response = await fetch('/api/draft-papers/current')
      return { ok: response.ok, body: await response.json() }
    })
    if (!orphanDraftInfo.ok) fail('Draft fetch should not crash with an orphaned item')
    const orphanedApiItem = orphanDraftInfo.body.draftPaper.items.find((item) => item.groupId === orphanedGroupId)
    if (!orphanedApiItem || orphanedApiItem.groupMissing !== true) {
      fail('Orphaned item should be flagged groupMissing: true in the API response', JSON.stringify(orphanedApiItem))
    }
    pass('Draft API flags the orphaned item with groupMissing: true')

    const printHtmlAfterOrphan = await page.evaluate(async (draftPaperId) => {
      const response = await fetch(`/api/draft-papers/${draftPaperId}/print-html`)
      return { ok: response.ok, status: response.status, body: await response.text() }
    }, secondGroupDraft.draftPaper.id)
    if (!printHtmlAfterOrphan.ok) fail('print-html should not crash with an orphaned item present', printHtmlAfterOrphan.body)
    if (printHtmlAfterOrphan.body.includes(orphanedGroupId)) {
      fail('print-html must skip the orphaned item rather than include it', printHtmlAfterOrphan.body)
    }
    pass('print-html skips the orphaned item and does not crash')

    const orphanDeleteResult = await page.evaluate(async ({ draftPaperId, itemId }) => {
      const response = await fetch(`/api/draft-papers/${draftPaperId}/items/${itemId}`, { method: 'DELETE' })
      return { ok: response.ok, body: await response.text() }
    }, { draftPaperId: secondGroupDraft.draftPaper.id, itemId: orphanedApiItem.id })
    if (!orphanDeleteResult.ok) fail('Orphaned item should still be deletable', orphanDeleteResult.body)
    pass('Orphaned draft item can still be deleted')

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
