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

const fixtureDir = path.join(rootDir, 'test-fixtures/paper-import/paper-2024-jslk-english')
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-c7-smoke-'))
const dbPath = path.join(tempRoot, 'question-bank.sqlite')
const paperAssetsDir = path.join(tempRoot, 'paper-assets')
const apiPort = 9897
const vitePort = 5179
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

function fixtureFiles() {
  return [
    '2024-jslk-english-source.docx',
    'paper-asset.json',
    'answer-key.json',
    'import-meta.json',
    'reading-choice-analysis-v1.json',
  ].map((fileName) => path.join(fixtureDir, fileName))
}

async function main() {
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  db.close()

  startProcess('node', ['server/api.mjs'], {
    cwd: rootDir,
    name: 'api',
    env: {
      ...process.env,
      QUESTION_BANK_DB: dbPath,
      QUESTION_BANK_PAPER_ASSET_ROOT: paperAssetsDir,
      QUESTION_BANK_API_PORT: String(apiPort),
    },
  })
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`)
  pass('API started with temp DB and temp paper asset root')

  startProcess('npm', ['run', 'dev:vite', '--', '--host', '127.0.0.1', '--port', String(vitePort)], {
    cwd: path.join(rootDir, 'app'),
    name: 'vite',
    env: {
      ...process.env,
      QUESTION_BANK_API_PORT: String(apiPort),
    },
  })
  await waitForHttp(`http://127.0.0.1:${vitePort}/?view=paper-import`)
  pass('Vite app started on import route')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } })
  page.on('pageerror', (error) => {
    throw error
  })
  try {
    await page.goto(`http://127.0.0.1:${vitePort}/?view=paper-import`, { waitUntil: 'networkidle' })
    await page.locator('input[type="file"]').setInputFiles(fixtureFiles())
    await page.getByRole('button', { name: '校验' }).click()
    try {
      await page.getByText('校验通过，可以发布。').waitFor({ timeout: 10_000 })
    } catch (error) {
      const bodyText = await page.locator('body').innerText().catch(() => '')
      fail('Workbench validate did not pass', bodyText.slice(0, 2000))
    }
    pass('Workbench validates full fixture package')

    await page.getByRole('button', { name: '发布' }).click()
    await page.getByText('发布完成。').waitFor({ timeout: 10_000 })
    await page.getByRole('link', { name: /Reading D 最新解析/ }).waitFor()
    pass('Workbench publishes and renders Reading A-D QA links')

    await page.getByRole('link', { name: /Reading D 最新解析/ }).click()
    await page.waitForURL(/group-2024-jslk-reading-d/)
    await page.locator('.pi-ps-analysis[data-pi-question-id="q-2024-jslk-032"]').waitFor({ timeout: 15_000 })
    pass('Reading D latest link opens PaperSurface analysis')

    await page.locator('[data-pi-option-label="B"] .pi-ps-analysis-option-row').click()
    await page.locator('[data-pi-option-label="B"].pi-ps-analysis-option-section--active').waitFor()
    await page.locator('[data-paper-evidence-kind="trap"]').first().waitFor({ state: 'attached', timeout: 10_000 })
    pass('Trap option activates trap evidence line on PaperSurface')

    const searchProof = await page.evaluate(async () => {
      const data = await fetch('/api/question-groups').then((response) => response.json())
      const groups = data.questionGroups
      return {
        readingAD: groups
          .filter((group) => /^group-2024-jslk-reading-[abcd]$/.test(group.id))
          .map((group) => ({ id: group.id, has: group.hasPaperSurfaceAnalysis, href: Boolean(group.paperSurfaceHref) })),
        nonReadingAnalysis: groups
          .filter((group) => !/^group-2024-jslk-reading-[abcd]$/.test(group.id) && group.hasPaperSurfaceAnalysis)
          .map((group) => group.id),
      }
    })
    if (searchProof.readingAD.length !== 4 || searchProof.readingAD.some((group) => !group.has || !group.href)) {
      fail('Search proof did not expose 阅读解析 for all Reading A-D', JSON.stringify(searchProof, null, 2))
    }
    if (searchProof.nonReadingAnalysis.length > 0) {
      fail('Search proof exposed fake analysis for non Reading A-D', JSON.stringify(searchProof, null, 2))
    }
    pass('Search API exposes 阅读解析 for Reading A-D only')
  } finally {
    await browser.close()
  }

  if (!existsSync(path.join(paperAssetsDir, 'paper-2024-jslk-english/latest/paper-asset.json'))) {
    fail('Latest paper asset was not written')
  }
  pass('Latest paper asset exists in temp public root')

  console.log(`\nC7 paper import browser smoke PASSED: ${passed} passed`)
}

main()
  .catch((error) => {
    console.error(`\nC7 paper import browser smoke FAILED: ${error instanceof Error ? error.stack : String(error)}`)
    process.exitCode = 1
  })
  .finally(() => {
    for (const child of children) {
      try {
        child.kill()
      } catch {
        // ignore cleanup failures
      }
    }
    rmSync(tempRoot, { recursive: true, force: true })
  })
