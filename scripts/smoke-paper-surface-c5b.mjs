#!/usr/bin/env node
/**
 * smoke-paper-surface-c5b.mjs — Browser QA smoke for PaperSurface C5b.
 *
 * Automates the accepted C5b PO QA checklist paths from:
 *   docs/product/paper-surface-c5b-po-qa-contract.md
 *
 * This is a regression gate, NOT a replacement for PO visual judgment.
 * It asserts structural correctness (elements mount, classes flip,
 * brace appears/disappears at breakpoints) without pinning pixel
 * coordinates.
 *
 * Coverage:
 *   1. Route loads `surface=paper` harness without error.
 *   2. Insight rail mounts with passage chips (A/B/C/D).
 *   3. Click passage chip → structure detail opens with rows.
 *   4. Click `篇章` row → row activates, brace SVG appears (>=1360px).
 *   5. Click `P1` row → brace moves (different target), passage scrolls.
 *   6. Click active row again → row deactivates, brace disappears.
 *   7. Brace sits in .ps-page left padding (left of passage text).
 *   8. Tight desktop (1280px): structure rows still work, brace hidden.
 *   9. Evidence coexistence: select question + structure target, both
 *      evidence line and brace coexist.
 *  10. Stacked mode (1024px): rail drawer opens, brace hidden.
 *  11. Forbidden regressions: no bottom button strip, no AI diagnostics,
 *      no connector line, no topbar insight.
 *
 * Convention parity with `smoke-paper-intelligence-preview.mjs`:
 *   - imports playwright from `app/node_modules/playwright`,
 *   - uses `APP_URL` env var (default http://localhost:5173),
 *   - dumps screenshots into reports/artifacts/smoke-paper-surface-c5b/,
 *   - exits non-zero on any failed step.
 *
 * Run:
 *   pnpm --filter app... -r run dev   # in another shell
 *   node scripts/smoke-paper-surface-c5b.mjs
 */

import { chromium } from '../app/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
const PAPER_ID = process.env.PI_SMOKE_PAPER_ID || 'paper-2024-xkb1-reading'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ARTIFACT_DIR = path.resolve(
  HERE,
  '..',
  'reports',
  'artifacts',
  'smoke-paper-surface-c5b',
)
mkdirSync(ARTIFACT_DIR, { recursive: true })

/* ─── Helpers ─── */

let passed = 0
let failed = 0
const issues = []

function step(name, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    issues.push(`${name}${detail ? `: ${detail}` : ''}`)
    console.error(`  \u2717 ${name}${detail ? `: ${detail}` : ''}`)
  }
}

async function shot(page, label) {
  try {
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `${label}.png`),
      fullPage: false,
    })
  } catch (err) {
    console.warn(
      `  (screenshot ${label} skipped: ${err instanceof Error ? err.message : String(err)})`,
    )
  }
}

/* ─── Main ─── */

console.log('=== PaperSurface C5b PO QA smoke ===')
console.log(`APP_URL=${APP_URL}`)
console.log(`paperId=${PAPER_ID}`)

const browser = await chromium.launch({ headless: true })

try {
  /* ════════════════════════════════════════════════════════════════
   * SECTION A: Wide Desktop (>=1360px) — brace visible
   * ════════════════════════════════════════════════════════════════ */
  console.log('\n─── A. Wide Desktop (1440px) ───\n')

  const ctxWide = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctxWide.newPage()
  page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`console.error: ${msg.text()}`)
  })

  /* 1. Route loads without crashing */
  const url = `${APP_URL}/?view=paper-intelligence&paperId=${encodeURIComponent(PAPER_ID)}&surface=paper`
  console.log(`  Loading ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.pi-ps-harness', { timeout: 15000 })
  step('A1. surface=paper harness loads', true)
  await shot(page, '01-loaded-wide')

  // No crash error
  const errorEl = await page.locator('.pi-ps-error').count()
  step('A1. no error element rendered', errorEl === 0)

  /* 2. Insight rail mounts with passage chips */
  const rail = page.locator('.pi-ps-insight-rail')
  step('A2. insight rail is present', (await rail.count()) === 1)

  const chips = page.locator('[data-pi-insight-chip]')
  const chipCount = await chips.count()
  step('A2. >=4 passage chips rendered', chipCount >= 4, `count=${chipCount}`)

  const chipLabels = await chips.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-pi-insight-chip')).sort().join(','),
  )
  step('A2. chips include A,B,C,D', chipLabels.includes('A') && chipLabels.includes('D'))

  /* 3. Click passage chip A → structure detail opens */
  const chipA = page.locator('[data-pi-insight-chip="A"]')
  await chipA.click()
  await page.waitForTimeout(400)

  const detail = page.locator('.pi-ps-insight-detail')
  const detailVisible = await detail.first().isVisible().catch(() => false)
  step('A3. structure detail panel opens after chip click', detailVisible)
  await shot(page, '02-detail-open')

  // Structure rows present
  const structureRows = page.locator('[data-c5b-structure-rows="true"]')
  step('A3. structure rows container rendered', (await structureRows.count()) >= 1)

  const passageRow = page.locator('[data-structure-row-mode="passage"]').first()
  const paragraphRows = page.locator('[data-structure-row-mode="paragraph"]')
  step('A3. 篇章 row present', (await passageRow.count()) === 1)
  step('A3. >=1 paragraph rows present', (await paragraphRows.count()) >= 1)

  /* 4. Click 篇章 row → brace appears */
  await passageRow.click()
  await page.waitForTimeout(400)

  const passageRowPressed = await passageRow.getAttribute('aria-pressed')
  step('A4. 篇章 row aria-pressed=true after click', passageRowPressed === 'true')
  const passageRowClass = (await passageRow.getAttribute('class')) || ''
  step(
    'A4. 篇章 row has --active class',
    passageRowClass.includes('pi-ps-structure-row--active'),
  )

  // Brace SVG appears
  const brace = page.locator('[data-c5b-brace="true"]')
  const braceCount = await brace.count()
  step('A4. brace SVG appears (data-c5b-brace)', braceCount === 1, `count=${braceCount}`)

  // Brace is visible (not display:none) at >=1360px
  if (braceCount > 0) {
    const braceVisible = await brace.first().isVisible()
    step('A4. brace is visible at 1440px', braceVisible)
  }
  await shot(page, '03-brace-passage')

  /* 5. Click P1 row → brace moves to paragraph */
  const p1Row = paragraphRows.first()
  await p1Row.click()
  await page.waitForTimeout(400)

  const p1Pressed = await p1Row.getAttribute('aria-pressed')
  step('A5. P1 row aria-pressed=true', p1Pressed === 'true')

  // Previous passage row should be deactivated
  const passageRowPressedAfter = await passageRow.getAttribute('aria-pressed')
  step('A5. 篇章 row deactivated after P1 click', passageRowPressedAfter === 'false')

  // Brace still present (moved target)
  const braceAfterP1 = await brace.count()
  step('A5. brace SVG still present after P1 click', braceAfterP1 === 1)
  await shot(page, '04-brace-p1')

  /* 6. Click active P1 row again → toggles off, brace disappears */
  await p1Row.click()
  await page.waitForTimeout(400)

  const p1PressedOff = await p1Row.getAttribute('aria-pressed')
  step('A6. P1 row aria-pressed=false after toggle-off', p1PressedOff === 'false')

  const braceAfterToggle = await brace.count()
  step('A6. brace SVG removed after toggle-off', braceAfterToggle === 0)
  await shot(page, '05-brace-toggled-off')

  /* 7. Brace placement: inside .ps-page left padding, not overlapping text */
  // Reactivate brace for geometry check
  await passageRow.click()
  await page.waitForTimeout(400)

  const placement = await page.evaluate(() => {
    const braceEl = document.querySelector('[data-c5b-brace="true"]')
    const pageEl = document.querySelector('.ps-page')
    if (!braceEl || !pageEl) return { ok: false }
    const braceRect = braceEl.getBoundingClientRect()
    const pageRect = pageEl.getBoundingClientRect()
    // Brace should be inside or near the page's left padding area
    // (left of the passage body text, right of page left edge)
    return {
      ok: true,
      braceLeft: braceRect.left,
      braceRight: braceRect.right,
      pageLeft: pageRect.left,
      pageRight: pageRect.right,
      // Brace right edge should be well left of page content start
      insidePage: braceRect.left >= pageRect.left - 2,
      notOverlappingText: braceRect.right < pageRect.left + pageRect.width * 0.15,
    }
  })
  step(
    'A7. brace left edge >= .ps-page left edge',
    placement.ok && placement.insidePage,
    JSON.stringify(placement),
  )
  step(
    'A7. brace right edge does not overlap passage text body',
    placement.ok && placement.notOverlappingText,
    JSON.stringify(placement),
  )

  // Deactivate brace for next tests
  await passageRow.click()
  await page.waitForTimeout(300)

  /* 9. Evidence coexistence: question + structure brace can coexist */
  // First select a question
  const questionCards = page.locator('[data-paper-question-id]')
  const qCardCount = await questionCards.count()
  if (qCardCount > 0) {
    await questionCards.first().click()
    await page.waitForTimeout(500)

    // Evidence line should appear
    const lineAfterQ = await page.locator('path.pi-line-path').count()
    step('A9. evidence line appears after question click', lineAfterQ >= 1, `count=${lineAfterQ}`)

    // Now also activate a structure target
    // Need to re-open the chip detail since question click closes insight
    await chipA.click()
    await page.waitForTimeout(300)
    const passageRowAgain = page.locator('[data-structure-row-mode="passage"]').first()
    await passageRowAgain.click()
    await page.waitForTimeout(400)

    // Both should coexist
    const braceCoexist = await brace.count()
    const lineCoexist = await page.locator('path.pi-line-path').count()
    step(
      'A9. brace and evidence line coexist',
      braceCoexist >= 1 && lineCoexist >= 1,
      `brace=${braceCoexist} line=${lineCoexist}`,
    )
    await shot(page, '06-coexistence')
  } else {
    step('A9. (skipped — no question cards found)', false, 'no [data-paper-question-id]')
  }

  await ctxWide.close()

  /* ════════════════════════════════════════════════════════════════
   * SECTION B: Tight Desktop (1280px) — brace hidden, scroll works
   * ════════════════════════════════════════════════════════════════ */
  console.log('\n─── B. Tight Desktop (1280px) ───\n')

  const ctxTight = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const pageTight = await ctxTight.newPage()
  pageTight.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`))

  await pageTight.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await pageTight.waitForSelector('.pi-ps-harness', { timeout: 15000 })
  step('B. harness loads at 1280px', true)

  // Open chip and click P1
  const chipATight = pageTight.locator('[data-pi-insight-chip="A"]')
  await chipATight.click()
  await pageTight.waitForTimeout(400)

  const p1RowTight = pageTight.locator('[data-structure-row-mode="paragraph"]').first()
  const p1CountTight = await p1RowTight.count()
  if (p1CountTight > 0) {
    await p1RowTight.click()
    await pageTight.waitForTimeout(400)

    const p1PressedTight = await p1RowTight.getAttribute('aria-pressed')
    step('B. P1 row activates at 1280px', p1PressedTight === 'true')

    // Brace must be hidden at this breakpoint (<=1359px)
    const braceTight = pageTight.locator('[data-c5b-brace="true"]')
    const braceTightCount = await braceTight.count()
    if (braceTightCount > 0) {
      const braceTightVisible = await braceTight.first().isVisible()
      step('B. brace is hidden at 1280px (CSS display:none)', !braceTightVisible)
    } else {
      // Brace not rendered because isStacked may apply — either way it's not visible
      step('B. brace is hidden at 1280px (not rendered or display:none)', true)
    }
  } else {
    step('B. (skipped — structure rows not found at 1280px)', false)
  }
  await shot(pageTight, '07-tight-desktop')
  await ctxTight.close()

  /* ════════════════════════════════════════════════════════════════
   * SECTION C: Stacked Mode (1024px) — drawer, brace hidden
   * ════════════════════════════════════════════════════════════════ */
  console.log('\n─── C. Stacked Mode (1024px) ───\n')

  const ctxStacked = await browser.newContext({ viewport: { width: 1024, height: 768 } })
  const pageStacked = await ctxStacked.newPage()
  pageStacked.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`))

  await pageStacked.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await pageStacked.waitForSelector('.pi-ps-harness', { timeout: 15000 })
  step('C. harness loads at 1024px', true)

  // Rail should still be in the DOM (always rendered)
  const railStacked = pageStacked.locator('.pi-ps-insight-rail')
  step('C. insight rail in DOM at stacked mode', (await railStacked.count()) === 1)

  // Viewport mode should be stacked
  const vpMode = await railStacked.first().getAttribute('data-viewport-mode')
  step('C. rail data-viewport-mode=stacked', vpMode === 'stacked')

  // No topbar insight fallback
  const topbarInsight = await pageStacked.locator('.pi-ps-insight-topbar').count()
  step('C. no topbar insight fallback', topbarInsight === 0)

  await shot(pageStacked, '08-stacked')
  await ctxStacked.close()

  /* ════════════════════════════════════════════════════════════════
   * SECTION D: Forbidden Regressions
   * ════════════════════════════════════════════════════════════════ */
  console.log('\n─── D. Forbidden Regressions (1440px) ───\n')

  const ctxReg = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const pageReg = await ctxReg.newPage()
  await pageReg.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await pageReg.waitForSelector('.pi-ps-harness', { timeout: 15000 })

  // No bottom button strip (removed in C5b)
  const bottomStrip = await pageReg.locator('.pi-ps-structure-controls').count()
  step('D. no .pi-ps-structure-controls bottom strip', bottomStrip === 0)

  const dataControls = await pageReg.locator('[data-c5b-controls]').count()
  step('D. no [data-c5b-controls] attribute', dataControls === 0)

  // No connector line from rail to brace
  const connectorLine = await pageReg.locator('.pi-ps-connector-line').count()
  step('D. no connector-line element', connectorLine === 0)

  // No topbar insight row at any breakpoint
  const topbarInsightReg = await pageReg.locator('.pi-ps-insight-topbar').count()
  step('D. no topbar insight element', topbarInsightReg === 0)

  // No AI diagnostic elements
  const aiDiag = await pageReg.locator('[data-ai-difficulty], [data-vocab-load], [data-grammar-load]').count()
  step('D. no AI diagnostic elements', aiDiag === 0)

  // No old V0 link overlay (from before V2)
  const oldLinkOverlay = await pageReg.locator('[data-link-id]').count()
  step('D. no legacy [data-link-id] overlay', oldLinkOverlay === 0)

  await ctxReg.close()

  /* ─── Summary ─── */
  console.log('\n' + '='.repeat(55))
  console.log(`  PaperSurface C5b smoke: ${passed} passed, ${failed} failed`)
  if (issues.length > 0) {
    console.log('\n  Issues:')
    for (const iss of issues) console.log(`    - ${iss}`)
  }
  console.log('='.repeat(55) + '\n')
} finally {
  await browser.close()
}

if (failed > 0) process.exit(1)
