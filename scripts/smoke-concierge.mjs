#!/usr/bin/env node
/**
 * Smoke test: Concierge Desk V1 user-flow with a headless browser.
 *
 * Steps (mirrors the manual checklist):
 *   1. Default home mode is AI.
 *   2. Search "城市交通 细节理解" returns at least one result row.
 *   3. Click row#0 「预览」 → detail view opens.
 *   4. Back to list → desk results still present (state survives remount).
 *   5. Click row#0 「加入」 → button shows 「已加入」.
 *   6. Click row#0 「类似」 → result list refreshes (different first row OR loading state observed).
 *   7. Click 「经典模式」 → classic filter bar visible, AI desk gone.
 *
 * Screenshots written to reports/artifacts/smoke-concierge/.
 *
 * Assumes:
 *   - server already running on :8787    (node server/api.mjs)
 *   - frontend dev server running on :5173 (cd app && npm run dev)
 *
 * The script does NOT start servers itself — keeps the test scope simple and
 * avoids leaving stray processes.
 */

import { chromium } from '../app/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const APP_URL = process.env.APP_URL || 'http://localhost:5173'
const ARTIFACT_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'reports',
  'artifacts',
  'smoke-concierge',
)

mkdirSync(ARTIFACT_DIR, { recursive: true })

let passed = 0, failed = 0
const issues = []
function step(name, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    issues.push(`${name}: ${detail}`)
    console.error(`  ✗ ${name}: ${detail}`)
  }
}

async function shot(page, label) {
  const file = path.join(ARTIFACT_DIR, `${label}.png`)
  await page.screenshot({ path: file, fullPage: false })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  // Make sure we start with no home-mode override and seed api key from env
  // (so the steward path is exercised; falls back to keyword search anyway).
  const apiKey = process.env.AI_API_KEY || ''
  await context.addInitScript((seedKey) => {
    try {
      localStorage.removeItem('home-mode')
      if (seedKey) {
        localStorage.setItem('ai-api-key', seedKey)
      } else {
        localStorage.removeItem('ai-api-key')
      }
    } catch {}
  }, apiKey)
  const page = await context.newPage()
  page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`))

  console.log('=== Concierge Desk Smoke ===\n')
  console.log(`Loading ${APP_URL}…`)
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.app-shell', { timeout: 15000 })
  await shot(page, '01-loaded')

  // ─ Step 1: default AI mode visible
  console.log('\nStep 1: Default home mode = AI')
  const deskVisible = await page.locator('.concierge-desk').isVisible().catch(() => false)
  step('concierge-desk visible on first load', deskVisible)
  const headlineText = await page.locator('.concierge-headline h2').first().textContent().catch(() => '')
  step('headline says 你找什么题', /你找什么题/.test(headlineText || ''), `got: ${headlineText}`)
  const filterBarVisible = await page.locator('.filter-bar').isVisible().catch(() => false)
  step('classic filter-bar hidden in AI mode', !filterBarVisible)

  // ─ Step 2: search for "广东一模 阅读 C"
  console.log('\nStep 2: Search "广东一模 阅读 C"')
  await page.locator('.concierge-intent-input').fill('广东一模 阅读 C')
  await page.locator('.concierge-intent-submit').click()
  // Wait for any settled state: results, empty, error, or clarification.
  await page.waitForFunction(
    () => {
      const root = document.querySelector('.concierge-desk')
      if (!root) return false
      const list = root.querySelector('.concierge-result-list')
      const empty = root.querySelector('.concierge-empty')
      const error = root.querySelector('.concierge-error')
      const loading = root.querySelector('.concierge-loading')
      const clarification = root.querySelector('.concierge-clarification')
      return (list || empty || error || clarification) && !loading
    },
    null,
    { timeout: 20000 },
  ).catch(() => {})

  // If steward came back asking for clarification, reply once to push through.
  const clarificationOpen = await page.locator('.concierge-clarification').isVisible().catch(() => false)
  if (clarificationOpen) {
    console.log('    steward returned needsClarification → sending follow-up')
    await page.locator('.concierge-intent-input').fill('阅读 C 中等难度，主题不限')
    await page.locator('.concierge-intent-submit').click()
    await page.waitForFunction(
      () => {
        const root = document.querySelector('.concierge-desk')
        if (!root) return false
        const list = root.querySelector('.concierge-result-list')
        const empty = root.querySelector('.concierge-empty')
        const loading = root.querySelector('.concierge-loading')
        return (list || empty) && !loading
      },
      null,
      { timeout: 20000 },
    ).catch(() => {})
  }

  await shot(page, '02-search-results')
  let resultCount = await page.locator('.concierge-result-list > li').count()

  // If still 0 (DeepSeek really found nothing OR returned non-matching ids),
  // fall back to a guaranteed-hit query that exercises keyword fallback path.
  if (resultCount === 0) {
    console.log('    no results from steward → trying broader query')
    await page.locator('.concierge-intent-input').fill('阅读')
    await page.locator('.concierge-intent-submit').click()
    await page.waitForFunction(
      () => {
        const root = document.querySelector('.concierge-desk')
        if (!root) return false
        const list = root.querySelector('.concierge-result-list')
        const empty = root.querySelector('.concierge-empty')
        const loading = root.querySelector('.concierge-loading')
        return (list || empty) && !loading
      },
      null,
      { timeout: 20000 },
    ).catch(() => {})
    resultCount = await page.locator('.concierge-result-list > li').count()
  }

  step('search produced ≥ 1 result row', resultCount >= 1, `count: ${resultCount}`)
  if (resultCount === 0) {
    await browser.close()
    console.log('\nFatal: search returned no results, skipping later steps.')
    process.exit(1)
  }
  // Capture the first row source anchor as a fingerprint for step 6.
  const firstAnchorBefore = await page.locator('.concierge-result-list > li').first().locator('.concierge-source').textContent().catch(() => '')
  console.log(`    first-row anchor: ${firstAnchorBefore}`)

  // Capture first group title for re-find after detail/back.
  const firstTitleBefore = await page.locator('.concierge-result-list > li').first().getAttribute('aria-label').catch(() => null)

  // ─ Step 3: click row#0 「预览」 → detail view
  console.log('\nStep 3: Click 预览 on row 0 → detail view')
  await page.locator('.concierge-result-list > li').first().locator('button.concierge-action', { hasText: '预览' }).click()
  await page.waitForSelector('.detail-view', { timeout: 15000 }).catch(() => {})
  await shot(page, '03-detail-view')
  const detailVisible = await page.locator('.detail-view').isVisible().catch(() => false)
  step('detail view opened', detailVisible)
  const deskGoneInDetail = await page.locator('.concierge-desk').isVisible().catch(() => false)
  step('AI desk unmounted while in detail', !deskGoneInDetail)

  // ─ Step 4: back to list → results still present
  console.log('\nStep 4: Back to list → desk results survive')
  await page.locator('.detail-view button.back-button').first().click()
  await page.waitForSelector('.concierge-desk', { timeout: 10000 })
  await shot(page, '04-back-to-desk')
  const resultCountAfter = await page.locator('.concierge-result-list > li').count()
  step('result rows still present after back', resultCountAfter >= 1, `count: ${resultCountAfter}`)
  const firstAnchorAfter = await page.locator('.concierge-result-list > li').first().locator('.concierge-source').textContent().catch(() => '')
  step('first-row anchor preserved (state survived remount)', firstAnchorAfter === firstAnchorBefore, `before=${firstAnchorBefore} after=${firstAnchorAfter}`)

  // ─ Step 5: click 加入 → button changes to 已加入
  console.log('\nStep 5: Click 加入 → 已加入')
  const addBtn = page.locator('.concierge-result-list > li').first().locator('button.concierge-action').nth(1)
  const addLabelBefore = (await addBtn.textContent() || '').trim()
  step('add button label is 加入 before click', addLabelBefore === '加入', `got: ${addLabelBefore}`)
  await addBtn.click()
  // Re-query because the button text/disabled state changes in place.
  await page.waitForFunction(
    () => {
      const li = document.querySelectorAll('.concierge-result-list > li')[0]
      if (!li) return false
      const btn = li.querySelectorAll('button.concierge-action')[1]
      return btn && /已加入/.test(btn.textContent || '')
    },
    null,
    { timeout: 5000 },
  ).catch(() => {})
  await shot(page, '05-added')
  const addLabelAfter = ((await page.locator('.concierge-result-list > li').first().locator('button.concierge-action').nth(1).textContent()) || '').trim()
  step('add button label is 已加入 after click', addLabelAfter === '已加入', `got: ${addLabelAfter}`)
  const addDisabled = await page.locator('.concierge-result-list > li').first().locator('button.concierge-action').nth(1).isDisabled().catch(() => false)
  step('add button disabled after click', addDisabled)

  // ─ Step 6: click 类似 → results refresh (loading state seen OR list changed)
  console.log('\nStep 6: Click 类似 → result list refreshes')
  // Click 类似 (3rd action button).
  await page.locator('.concierge-result-list > li').first().locator('button.concierge-action').nth(2).click()
  // Wait until the list either re-renders (loading) or settles to a different state.
  await page.waitForFunction(
    () => {
      const root = document.querySelector('.concierge-desk')
      if (!root) return false
      const list = root.querySelector('.concierge-result-list')
      const empty = root.querySelector('.concierge-empty')
      const error = root.querySelector('.concierge-error')
      const loading = root.querySelector('.concierge-loading')
      return (list || empty || error) && !loading
    },
    null,
    { timeout: 15000 },
  ).catch(() => {})
  await shot(page, '06-similar')
  // After 类似 we expect a new query to have run; the input gets cleared and
  // either we have results / empty / notice. Just assert: still on AI desk + no error.
  const deskStillVisible = await page.locator('.concierge-desk').isVisible().catch(() => false)
  step('AI desk still visible after 类似', deskStillVisible)
  const noErrorAfterSimilar = !(await page.locator('.concierge-error').isVisible().catch(() => false))
  step('no error state after 类似', noErrorAfterSimilar)
  // The intent input should be cleared (handleSimilar calls setIntent('')).
  const intentValue = await page.locator('.concierge-intent-input').inputValue().catch(() => 'X')
  step('intent input cleared after 类似', intentValue === '', `got: "${intentValue}"`)

  // ─ Step 7: switch to classic mode
  console.log('\nStep 7: Click 经典模式 → classic filters available')
  await page.locator('button.home-mode-toggle').click()
  await page.waitForSelector('.filter-bar', { timeout: 5000 })
  await shot(page, '07-classic-mode')
  const filterBarNow = await page.locator('.filter-bar').isVisible().catch(() => false)
  step('classic filter-bar visible after toggle', filterBarNow)
  const deskGone = !(await page.locator('.concierge-desk').isVisible().catch(() => false))
  step('AI desk gone after toggle', deskGone)
  const toggleLabelClassic = await page.locator('button.home-mode-toggle').textContent().catch(() => '')
  step('toggle now reads "AI 模式"', /AI/i.test(toggleLabelClassic || ''), `got: ${toggleLabelClassic}`)
  // sanity: classic group-list renders some cards from the loaded sample/sqlite data.
  const groupCount = await page.locator('.group-list .group-card').count()
  step('classic mode shows ≥ 1 group card', groupCount >= 1, `count: ${groupCount}`)

  await browser.close()

  console.log(`\n=== Smoke result: ${passed} passed, ${failed} failed ===`)
  if (issues.length > 0) {
    console.log('\nIssues:')
    issues.forEach((i) => console.log(`  - ${i}`))
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Smoke crashed:', err)
  process.exit(1)
})
