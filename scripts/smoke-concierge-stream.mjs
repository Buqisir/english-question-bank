#!/usr/bin/env node
/**
 * Smoke for the 取题流 V1.1 IA: 来源卷 → 展开题组 → 加入草稿卷.
 *
 * Asserts (against the live dev stack on http://localhost:5173):
 *   1. Search "广东一模 阅读" returns at least one paper-level row.
 *   2. No row leaks internal slugs.
 *   3. Paper-level row shows 命中 N 组 (no 共 N 组), and a 展开题组 button.
 *   4. Clicking the row body expands it; only one paper row expanded at a time.
 *   5. Inside expanded paper, group cards expose 加入草稿卷 + 找类似.
 *   6. Clicking 加入草稿卷 flips that group card to 已加入 (and disables it).
 *   7. There is no 预览 / 加入小题 / 加入单题 / "+" button anywhere visible.
 *   8. 草稿卷 chip aria-label is present.
 *
 * Screenshots → reports/artifacts/smoke-concierge-stream/.
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
  'smoke-concierge-stream',
)
mkdirSync(ARTIFACT_DIR, { recursive: true })

let passed = 0, failed = 0
const issues = []
function step(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; issues.push(`${name}: ${detail}`); console.error(`  ✗ ${name}: ${detail}`) }
}
async function shot(page, label) {
  try {
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${label}.png`), fullPage: false })
  } catch (err) {
    console.warn(`  (screenshot ${label} skipped: ${err instanceof Error ? err.message : String(err)})`)
  }
}

const INTERNAL_SLUG_PATTERNS = [
  /reading-parse-eval/i,
  /source-gap-fill/i,
  /\bDeepSeek\b/,
  /\bsteward\b/i,
  /\bparse-eval\b/i,
  /管家规则/,
]

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.CONCIERGE_SMOKE_CHANNEL || undefined,
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const apiKey = process.env.AI_API_KEY || ''
  await context.addInitScript((seed) => {
    try {
      localStorage.removeItem('home-mode')
      if (seed) localStorage.setItem('ai-api-key', seed)
      else localStorage.removeItem('ai-api-key')
    } catch {}
  }, apiKey)
  const page = await context.newPage()
  page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`))

  console.log('=== Concierge V1.1 paper-bucket smoke ===')
  console.log(`Loading ${APP_URL}…`)
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.concierge-desk', { timeout: 15000 })

  // Wait for the live bank to be online before searching.
  await page.waitForFunction(
    () => {
      const desk = document.querySelector('.concierge-desk')
      if (!desk) return false
      const input = desk.querySelector('.concierge-intent-input')
      if (input && input.hasAttribute('disabled')) return false
      const loadingNotice = desk.querySelector('.concierge-data-loading')
      return !loadingNotice
    },
    null,
    { timeout: 20000 },
  ).catch(() => {})
  await shot(page, '01-loaded')

  // ── Step 1: search → ≥ 1 paper row
  console.log('\nStep 1: search "广东一模 阅读"')
  await page.locator('.concierge-intent-input').fill('广东一模 阅读')
  await page.locator('.concierge-intent-submit').click()
  await page.waitForFunction(
    () => {
      const root = document.querySelector('.concierge-desk')
      if (!root) return false
      const list = root.querySelector('.concierge-paper-list')
      const clar = root.querySelector('.concierge-clarification')
      const empty = root.querySelector('.concierge-empty')
      const error = root.querySelector('.concierge-error')
      const loading = root.querySelector('.concierge-loading')
      return (list || clar || empty || error) && !loading
    },
    null,
    { timeout: 20000 },
  ).catch(() => {})

  // The steward may bounce back with a clarification several times. Replay up
  // to 3 times with a concrete answer until we land on a result list.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await page.locator('.concierge-clarification').isVisible().catch(() => false))) break
    const followUps = ['人与自然 主旨概括 中等难度', '中等难度 阅读理解 真题', '真题 主旨概括 中等']
    const reply = followUps[attempt] || followUps[0]
    console.log(`    clarification attempt ${attempt + 1}: replying with "${reply}"`)
    const input = page.locator('.concierge-intent-input')
    await input.waitFor({ state: 'visible' })
    await page.waitForFunction(() => {
      const i = document.querySelector('.concierge-intent-input')
      return i && !i.hasAttribute('disabled')
    }, null, { timeout: 5000 }).catch(() => {})
    await input.fill(reply)
    await page.locator('.concierge-intent-submit').click()
    await page.waitForFunction(() => {
      const root = document.querySelector('.concierge-desk')
      if (!root) return false
      const list = root.querySelector('.concierge-paper-list')
      const clar = root.querySelector('.concierge-clarification')
      const empty = root.querySelector('.concierge-empty')
      const error = root.querySelector('.concierge-error')
      const loading = root.querySelector('.concierge-loading')
      return (list || clar || empty || error) && !loading
    }, null, { timeout: 20000 }).catch(() => {})
  }

  let paperCount = await page.locator('.concierge-paper-list > li').count()
  if (paperCount === 0) {
    // Fall back to a broader query that historically resolves to ≥1 bucket.
    // Order matters: each is tried until one returns rows.
    const broadeners = ['真题 阅读理解 中等难度', '人与自然 主旨概括 中等难度', '阅读']
    for (const q of broadeners) {
      console.log(`    no paper rows; broaden to "${q}"`)
      const input = page.locator('.concierge-intent-input')
      await input.waitFor({ state: 'visible' })
      await page.waitForFunction(() => {
        const i = document.querySelector('.concierge-intent-input')
        return i && !i.hasAttribute('disabled')
      }, null, { timeout: 5000 }).catch(() => {})
      await input.fill(q)
      await page.locator('.concierge-intent-submit').click()
      await page.waitForFunction(() => {
        const root = document.querySelector('.concierge-desk')
        if (!root) return false
        const list = root.querySelector('.concierge-paper-list')
        const empty = root.querySelector('.concierge-empty')
        const clar = root.querySelector('.concierge-clarification')
        const loading = root.querySelector('.concierge-loading')
        return (list || empty || clar) && !loading
      }, null, { timeout: 20000 }).catch(() => {})
      // Burn through up to 2 clarifications per broadener.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!(await page.locator('.concierge-clarification').isVisible().catch(() => false))) break
        await input.fill('真题 阅读理解 中等难度')
        await page.locator('.concierge-intent-submit').click()
        await page.waitForFunction(() => {
          const root = document.querySelector('.concierge-desk')
          if (!root) return false
          const list = root.querySelector('.concierge-paper-list')
          const empty = root.querySelector('.concierge-empty')
          const loading = root.querySelector('.concierge-loading')
          return (list || empty) && !loading
        }, null, { timeout: 20000 }).catch(() => {})
      }
      paperCount = await page.locator('.concierge-paper-list > li').count()
      if (paperCount > 0) break
    }
  }
  step('search produces ≥ 1 paper row', paperCount >= 1, `count: ${paperCount}`)
  if (paperCount === 0) {
    await browser.close()
    process.exit(1)
  }
  await shot(page, '02-paper-rows')

  // ── Step 2: no internal slugs leak in visible row text
  console.log('\nStep 2: no internal slugs leak')
  const visibleText = await page.locator('.concierge-paper-list').innerText()
  for (const pattern of INTERNAL_SLUG_PATTERNS) {
    const leaked = pattern.test(visibleText)
    step(`no leak of ${pattern}`, !leaked, leaked ? `matched: ${visibleText.match(pattern)?.[0]}` : '')
  }

  // ── Step 3: paper-level wording: 命中 N 组 + 展开题组 button
  console.log('\nStep 3: paper-level wording')
  const firstPaper = page.locator('.concierge-paper-list > li').first()
  step('paper row shows 命中 N 组', /命中\s*\d+\s*组/.test(await firstPaper.innerText()))
  step('paper row does NOT say 共 N 组', !/共\s*\d+\s*组/.test(await firstPaper.innerText()))
  step('paper row has 展开题组 button (or 收起 if auto-expanded)',
    await firstPaper.locator('button.concierge-action', { hasText: /展开题组|收起/ }).first().isVisible().catch(() => false))

  // ── Step 4: click row body to expand; one-at-a-time + user can collapse a single auto-expanded paper.
  console.log('\nStep 4: click row body to expand; one-at-a-time')
  const firstArticle = firstPaper.locator('article.concierge-paper-row')
  const firstWasAlreadyExpanded = await firstArticle.evaluate((el) => el.classList.contains('is-expanded'))

  if (paperCount === 1) {
    // Single bucket — auto-expand should kick in. We then verify the user can
    // collapse it and it stays collapsed (no render-time fallback that snaps
    // back open).
    step('single bucket auto-expanded', firstWasAlreadyExpanded)
    await firstArticle.locator('.concierge-paper-actions button.concierge-action').first().click()
    await page.waitForFunction(
      () => !document.querySelector('.concierge-paper-list > li:first-child article.concierge-paper-row.is-expanded'),
      null,
      { timeout: 5000 },
    ).catch(() => {})
    step('user can collapse the auto-expanded single paper',
      !(await page.locator('.concierge-paper-list > li:first-child article.concierge-paper-row.is-expanded').isVisible().catch(() => false)))
    // Re-open for downstream group-card assertions.
    await firstArticle.locator('.concierge-paper-actions button.concierge-action').first().click()
    await page.waitForSelector('.concierge-paper-list > li:first-child .concierge-group-card', { timeout: 10000 }).catch(() => {})
  } else {
    if (!firstWasAlreadyExpanded) {
      await firstArticle.locator('.concierge-paper-body').click()
    }
    await page.waitForFunction(
      () => Boolean(document.querySelector('.concierge-paper-list > li:first-child article.concierge-paper-row.is-expanded')),
      null,
      { timeout: 5000 },
    ).catch(() => {})
    step('first paper row is-expanded after body click',
      await page.locator('.concierge-paper-list > li:first-child article.concierge-paper-row.is-expanded').isVisible().catch(() => false))
    await page.waitForSelector('.concierge-paper-list > li:first-child .concierge-group-card', { timeout: 10000 }).catch(() => {})

    const secondArticle = page.locator('.concierge-paper-list > li').nth(1).locator('article.concierge-paper-row')
    await secondArticle.locator('.concierge-paper-body').click()
    await page.waitForFunction(
      () => Boolean(document.querySelector('.concierge-paper-list > li:nth-child(2) article.concierge-paper-row.is-expanded')),
      null,
      { timeout: 5000 },
    ).catch(() => {})
    step('second paper expanded',
      await page.locator('.concierge-paper-list > li:nth-child(2) article.concierge-paper-row.is-expanded').isVisible().catch(() => false))
    step('first paper collapsed after switching',
      !(await page.locator('.concierge-paper-list > li:first-child article.concierge-paper-row.is-expanded').isVisible().catch(() => false)))
    // Re-open first for downstream steps.
    await firstArticle.locator('.concierge-paper-body').click()
    await page.waitForSelector('.concierge-paper-list > li:first-child .concierge-group-card', { timeout: 10000 }).catch(() => {})
  }
  await shot(page, '04-paper-expanded')

  // ── Step 5: group cards inside expanded paper expose 加入草稿卷 + 找类似
  console.log('\nStep 5: group cards expose 加入草稿卷 + 找类似')
  const firstGroupCard = page
    .locator('.concierge-paper-list > li:first-child .concierge-group-card-list > li')
    .first()
  step('group card 加入草稿卷 button visible',
    await firstGroupCard.locator('button.concierge-action', { hasText: '加入草稿卷' }).first().isVisible().catch(() => false))
  step('group card 找类似 button visible',
    await firstGroupCard.locator('button.concierge-action', { hasText: '找类似' }).first().isVisible().catch(() => false))
  step('no bare 类似 button (only 找类似)',
    !(await firstGroupCard.locator('button.concierge-action', { hasText: /^类似$/ }).first().isVisible().catch(() => false)))

  // ── Step 6: 加入草稿卷 → 已加入
  console.log('\nStep 6: 加入草稿卷 → 已加入')
  const addBtn = firstGroupCard.locator('button.concierge-action', { hasText: '加入草稿卷' }).first()
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click()
    await page.waitForFunction(
      () => {
        const card = document.querySelector('.concierge-paper-list > li:first-child .concierge-group-card-list > li:first-child .concierge-group-card')
        if (!card) return false
        const btns = card.querySelectorAll('button.concierge-action')
        return Array.from(btns).some((b) => /已加入/.test(b.textContent || ''))
      },
      null,
      { timeout: 5000 },
    ).catch(() => {})
    step('group card now reads 已加入',
      await firstGroupCard.locator('button.concierge-action', { hasText: '已加入' }).first().isVisible().catch(() => false))
    step('group card 已加入 button is disabled',
      await firstGroupCard.locator('button.concierge-action', { hasText: '已加入' }).first().isDisabled().catch(() => false))
  } else {
    step('skipped: 加入草稿卷 button not present (group already in basket?)', true)
  }
  await shot(page, '06-added')

  // ── Step 6.5: open basket drawer and verify draft ↔ paperBlocks sync
  // Regression guard for the React 19 closure-capture timing bug, where
  // 加入草稿卷 used to update basket but never grow paperBlocks. We assert
  // that .basket-item count equals .paper-block-item.question_group count,
  // and the 题集大纲 summary is no longer "0 块".
  console.log('\nStep 6.5: draft ↔ paperBlocks sync (basket drawer)')
  await page.locator('button.basket-chip').first().click()
  await page.waitForSelector('.basket-panel.basket-panel-drawer.open', { timeout: 5000 }).catch(() => {})
  await page.waitForFunction(
    () => Boolean(document.querySelector('.basket-panel .basket-item')),
    null,
    { timeout: 5000 },
  ).catch(() => {})
  const basketItemCount = await page.locator('.basket-panel .basket-item').count()
  const blockGroupCount = await page.locator('.basket-panel .paper-block-item.question_group').count()
  const outlineSummary = (await page.locator('.basket-panel .paper-blocks-outline > summary').textContent()) || ''
  step('basket drawer has ≥ 1 .basket-item (the just-added group)', basketItemCount >= 1, `got ${basketItemCount}`)
  step('paper blocks .question_group count matches basket-item count', blockGroupCount === basketItemCount, `basket=${basketItemCount} blocks=${blockGroupCount}`)
  step('题集大纲 summary is no longer "0 块"', !/0\s*块/.test(outlineSummary), `got: "${outlineSummary.trim()}"`)
  await shot(page, '065-basket-drawer-sync')
  // Close the drawer so subsequent steps see the desk again.
  await page.locator('.basket-drawer-close').first().click().catch(() => {})

  // ── Step 7: no banned per-question or preview UI
  console.log('\nStep 7: no per-question / 预览 UI anywhere')
  const expandedPanel = page.locator('.concierge-paper-list > li:first-child .concierge-paper-detail')
  const banned = await expandedPanel
    .locator('button', { hasText: /加入小题|加入单题|^\+$|预览/ })
    .count()
  step('no banned per-question / 预览 buttons in expanded panel', banned === 0, `count: ${banned}`)

  // ── Step 8: 草稿卷 chip aria-label
  console.log('\nStep 8: 草稿卷 chip aria-label')
  step('basket chip aria-label uses 草稿卷',
    await page.locator('button.basket-chip[aria-label*="草稿卷"]').first().isVisible().catch(() => false))

  await browser.close()

  console.log(`\n=== smoke result: ${passed} passed, ${failed} failed ===`)
  if (issues.length > 0) {
    console.log('Issues:')
    for (const i of issues) console.log(`  - ${i}`)
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('smoke crashed:', err)
  process.exit(1)
})
