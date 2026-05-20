#!/usr/bin/env node
/**
 * smoke-c5b-paper-surface-po-qa.mjs
 *
 * PaperSurface C5b PO QA browser smoke — automates the accepted
 * checks from `docs/product/paper-surface-c5b-po-qa-contract.md`
 * against a running dev server.
 *
 * This script is a regression GATE, not a replacement for PO visual
 * judgment. It only exercises the deterministic DOM signals the
 * harness already exposes; it does NOT validate brace pixel position,
 * pencil tone, or A4 paper centering — those remain PO visual checks.
 *
 * Coverage (mirrors the contract sections):
 *
 *   A. 1360px And Wider (1440x900):
 *      - Harness shell mounts at `?view=paper-intelligence&surface=paper`.
 *      - Passage chips A/B/C/D render in the left rail.
 *      - Opening chip A reveals the structure detail with
 *        `data-rail-detail-open="true"` and structure rows.
 *      - Click `篇章` row → row aria-pressed flips true and exactly
 *        one `[data-c5b-brace]` SVG becomes visible.
 *      - Click `P1` row → row aria-pressed flips, still exactly one
 *        brace, brace remains visible.
 *      - Click another `P` row → brace count stays 1, the previously
 *        active row is no longer pressed.
 *      - Click the active `P` row again → row aria-pressed=false and
 *        the brace is gone (count 0 OR not visible).
 *
 *   B. 1200px To 1359px (1280x800):
 *      - Open passage A and click P1.
 *      - Structure row becomes active (aria-pressed=true).
 *      - The brace is HIDDEN (CSS `display:none` at <=1359px). The
 *        SVG element may still exist in the DOM; what matters is it
 *        is not visible.
 *
 *   C. 1199px And Below (1100x800):
 *      - Stacked drawer rail is still present and clickable.
 *      - Open passage A, click `篇章`. Row becomes active.
 *      - Brace is NOT visible (the JSX returns null when isStacked,
 *        and CSS also hides it).
 *      - No topbar insight fallback exists (`.pi-ps-insight-topbar-row`
 *        must not be in the DOM).
 *
 *   D. Forbidden regressions (asserted in every band, after open):
 *      - No `.pi-ps-structure-controls` bottom button strip.
 *      - No `[data-c5b-controls]` attribute anywhere.
 *      - No `.pi-ps-insight-topbar-row` topbar fallback.
 *      - When no chip is open, no `.pi-ps-structure-row` is in the
 *        DOM (P buttons must not appear on the collapsed main rail).
 *
 * What this smoke deliberately does NOT do:
 *   - It does not assert exact pixel placement of the brace inside
 *     `.ps-page` left padding. That is a PO visual judgment.
 *   - It does not assert brace stroke color, dash pattern, or shape.
 *     `verify-c5b-structure-brace.mjs` already locks those statically.
 *   - It does not assert "evidence line and brace coexist" pixel
 *     overlay behavior, because reaching the right-panel evidence
 *     buttons requires PaperSurface question selection that this
 *     smoke intentionally keeps out of scope. The contract's
 *     coexistence rule is gated by other suites.
 *
 * Convention parity with `smoke-paper-intelligence-preview.mjs`:
 *   - imports playwright from `app/node_modules/playwright`,
 *   - uses `APP_URL` env var (default http://localhost:5173),
 *   - `PI_SMOKE_PAPER_ID` env override (default
 *     `paper-2024-xkb1-reading` per contract),
 *   - dumps screenshots into
 *     `reports/artifacts/smoke-c5b-paper-surface-po-qa/`,
 *   - exits non-zero on any failed step.
 *
 * Run:
 *   # one-time: install playwright if not already
 *   #   pnpm --filter app install
 *   # in another shell:
 *   pnpm --filter app run dev:vite
 *   # then:
 *   node scripts/smoke-c5b-paper-surface-po-qa.mjs
 *
 * Env overrides:
 *   APP_URL              dev server origin (default http://localhost:5173)
 *   PI_SMOKE_PAPER_ID    paperId fixture (default paper-2024-xkb1-reading)
 *   HEADFUL=1            run headed (default headless)
 *   SLOWMO=<ms>          playwright slow-motion delay
 */

import { mkdirSync } from 'node:fs'
import path from 'node:path'

// ─── Lazy import playwright with a friendly missing-dep message ────
//
// Convention from the existing smokes: import from the app workspace
// rather than rooting a new dependency. If playwright is not yet
// installed (e.g. fresh checkout), surface a clear remediation step
// instead of a noisy module-resolution stack trace.
let chromium
try {
  ;({ chromium } = await import('../app/node_modules/playwright/index.mjs'))
} catch (err) {
  console.error('Failed to load playwright from app/node_modules.')
  console.error('Run `pnpm --filter app install` first, then retry.')
  console.error(`Underlying error: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(2)
}

const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
const PAPER_ID = process.env.PI_SMOKE_PAPER_ID || 'paper-2024-xkb1-reading'
const HEADFUL = process.env.HEADFUL === '1'
const SLOWMO = Number(process.env.SLOWMO || 0)

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ARTIFACT_DIR = path.resolve(
  HERE,
  '..',
  'reports',
  'artifacts',
  'smoke-c5b-paper-surface-po-qa',
)
mkdirSync(ARTIFACT_DIR, { recursive: true })

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

const PAPER_URL =
  `${APP_URL}/?view=paper-intelligence` +
  `&paperId=${encodeURIComponent(PAPER_ID)}&surface=paper`

console.log('=== PaperSurface C5b PO QA smoke ===')
console.log(`APP_URL=${APP_URL}`)
console.log(`paperId=${PAPER_ID}`)
console.log(`url=${PAPER_URL}`)

// ─── Helpers ───────────────────────────────────────────────────

/** Open passage chip by section id and wait for its detail panel. */
async function openPassage(page, section) {
  const chip = page.locator(`.pi-ps-insight-chip[data-pi-insight-chip="${section}"]`)
  await chip.waitFor({ state: 'visible', timeout: 10000 })
  // Hover first so the rail expands (no `[data-rail-locked]` needed).
  await chip.hover()
  await chip.click()
  await page.waitForSelector(
    `.pi-ps-insight-rail[data-rail-detail-open="true"]`,
    { timeout: 5000 },
  )
  await page.waitForSelector(`.pi-ps-structure-rows`, { timeout: 5000 })
}

/** Count visible braces in the DOM. Returns 0 / 1 / >=2. */
async function visibleBraceCount(page) {
  const braces = page.locator('.pi-ps-structure-brace[data-c5b-brace="true"]')
  const total = await braces.count()
  let visible = 0
  for (let i = 0; i < total; i++) {
    const isVisible = await braces.nth(i).isVisible().catch(() => false)
    if (isVisible) visible++
  }
  return { total, visible }
}

/** Assert the contract's persistent forbidden regressions. */
async function assertForbiddenRegressions(page, bandLabel) {
  const controlsCount = await page.locator('.pi-ps-structure-controls').count()
  step(
    `[${bandLabel}] no bottom .pi-ps-structure-controls strip`,
    controlsCount === 0,
    `found ${controlsCount}`,
  )

  const dataControls = await page.locator('[data-c5b-controls]').count()
  step(
    `[${bandLabel}] no [data-c5b-controls] attribute`,
    dataControls === 0,
    `found ${dataControls}`,
  )

  const topbarRow = await page.locator('.pi-ps-insight-topbar-row').count()
  step(
    `[${bandLabel}] no topbar insight fallback row`,
    topbarRow === 0,
    `found ${topbarRow}`,
  )
}

// ─── Browser session ───────────────────────────────────────────

const browser = await chromium.launch({
  headless: !HEADFUL,
  slowMo: SLOWMO,
})
const context = await browser.newContext()
const page = await context.newPage()

page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    // Surface but do not auto-fail on every console.error; many noisy
    // errors come from third-party dev tooling. We record them so
    // they show up in the run summary for human inspection.
    issues.push(`console.error: ${msg.text()}`)
  }
})

try {
  // ─── Band A: 1360px and wider ──────────────────────────────
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(PAPER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

  await page.waitForSelector('.pi-ps-harness', { timeout: 15000 })
  step('A1. harness mounts at surface=paper', true)
  // The harness renders a loading state first, then the shell.
  await page.waitForSelector('.pi-ps-harness-shell', { timeout: 15000 })
  step('A2. harness shell present', true)
  await shot(page, '01-1440-loaded')

  // Before opening any chip, the collapsed rail must not show P buttons.
  const preOpenRows = await page.locator('.pi-ps-structure-row').count()
  step(
    'A3. no P buttons on collapsed main rail (no chip open)',
    preOpenRows === 0,
    `found ${preOpenRows} structure rows`,
  )

  // Passage chips A/B/C/D are present.
  const chipCount = await page.locator('.pi-ps-insight-chip[data-pi-insight-chip]').count()
  step(
    'A4. at least 4 passage chips (A/B/C/D)',
    chipCount >= 4,
    `found ${chipCount}`,
  )

  await assertForbiddenRegressions(page, '1440')

  // Open passage A.
  await openPassage(page, 'A')
  step('A5. opening passage A reveals structure detail', true)
  await shot(page, '02-1440-passage-A-open')

  // Structure rows include 篇章 and at least one paragraph.
  const passageRow = page.locator(
    '.pi-ps-structure-row[data-structure-row-mode="passage"]',
  )
  const paragraphRows = page.locator(
    '.pi-ps-structure-row[data-structure-row-mode="paragraph"]',
  )
  step(
    'A6. 篇章 row exists in detail panel',
    (await passageRow.count()) >= 1,
  )
  const paragraphRowCount = await paragraphRows.count()
  step(
    'A6. at least one paragraph row exists in detail panel',
    paragraphRowCount >= 1,
    `found ${paragraphRowCount}`,
  )

  // Click 篇章 — brace appears.
  await passageRow.first().click()
  await page.waitForSelector(
    '.pi-ps-structure-brace[data-c5b-brace="true"]',
    { state: 'visible', timeout: 5000 },
  )
  let pressed = await passageRow.first().getAttribute('aria-pressed')
  step('A7. 篇章 row aria-pressed=true after click', pressed === 'true')
  let cnt = await visibleBraceCount(page)
  step(
    'A7. exactly one visible brace after 篇章 click',
    cnt.visible === 1,
    `visible=${cnt.visible} total=${cnt.total}`,
  )
  await shot(page, '03-1440-brace-passage')

  // Click P1 (first paragraph row).
  await paragraphRows.nth(0).click()
  await page.waitForTimeout(200) // brace re-measure on next render
  pressed = await paragraphRows.nth(0).getAttribute('aria-pressed')
  step('A8. P1 row aria-pressed=true after click', pressed === 'true')
  cnt = await visibleBraceCount(page)
  step(
    'A8. still exactly one visible brace after P1 click',
    cnt.visible === 1,
    `visible=${cnt.visible} total=${cnt.total}`,
  )
  await shot(page, '04-1440-brace-P1')

  // Click another P row (P2 if present, otherwise re-click P1 to skip).
  if (paragraphRowCount >= 2) {
    await paragraphRows.nth(1).click()
    await page.waitForTimeout(200)
    const p1Pressed = await paragraphRows.nth(0).getAttribute('aria-pressed')
    const p2Pressed = await paragraphRows.nth(1).getAttribute('aria-pressed')
    step(
      'A9. switching to P2 transfers aria-pressed to P2',
      p1Pressed === 'false' && p2Pressed === 'true',
      `P1=${p1Pressed} P2=${p2Pressed}`,
    )
    cnt = await visibleBraceCount(page)
    step(
      'A9. still exactly one visible brace after P2 click',
      cnt.visible === 1,
      `visible=${cnt.visible} total=${cnt.total}`,
    )
    await shot(page, '05-1440-brace-P2')

    // Click the active row again — brace clears.
    await paragraphRows.nth(1).click()
    await page.waitForTimeout(200)
    const p2PressedAfter = await paragraphRows.nth(1).getAttribute('aria-pressed')
    step(
      'A10. clicking active P2 again deactivates it',
      p2PressedAfter === 'false',
      `aria-pressed=${p2PressedAfter}`,
    )
    cnt = await visibleBraceCount(page)
    step(
      'A10. brace disappears after toggle-off (no visible brace)',
      cnt.visible === 0,
      `visible=${cnt.visible} total=${cnt.total}`,
    )
  } else {
    // Single-paragraph passage fallback: toggle P1 off.
    await paragraphRows.nth(0).click()
    await page.waitForTimeout(200)
    const p1PressedAfter = await paragraphRows.nth(0).getAttribute('aria-pressed')
    step(
      'A10. clicking active P1 again deactivates it',
      p1PressedAfter === 'false',
      `aria-pressed=${p1PressedAfter}`,
    )
    cnt = await visibleBraceCount(page)
    step(
      'A10. brace disappears after toggle-off (no visible brace)',
      cnt.visible === 0,
      `visible=${cnt.visible} total=${cnt.total}`,
    )
  }

  // ─── Band B: 1200px–1359px ─────────────────────────────────
  await page.setViewportSize({ width: 1280, height: 800 })
  // Re-open the page to get a clean state for this band.
  await page.goto(PAPER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.pi-ps-harness-shell', { timeout: 15000 })

  await assertForbiddenRegressions(page, '1280')

  await openPassage(page, 'A')
  await shot(page, '06-1280-passage-A-open')
  // Click P1.
  const tightP = page.locator(
    '.pi-ps-structure-row[data-structure-row-mode="paragraph"]',
  )
  await tightP.first().click()
  await page.waitForTimeout(200)
  const tightPressed = await tightP.first().getAttribute('aria-pressed')
  step(
    'B1. at 1280px, P1 row activates (aria-pressed=true)',
    tightPressed === 'true',
    `aria-pressed=${tightPressed}`,
  )

  // Brace must be hidden. The SVG may still exist (CSS display:none),
  // we only care that nothing is visible.
  const tightCnt = await visibleBraceCount(page)
  step(
    'B2. at 1280px, brace is NOT visible (PO contract: hidden 1200–1359)',
    tightCnt.visible === 0,
    `visible=${tightCnt.visible} total=${tightCnt.total}`,
  )
  await shot(page, '07-1280-brace-hidden')

  // ─── Band C: 1199px and below ──────────────────────────────
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.goto(PAPER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.pi-ps-harness-shell', { timeout: 15000 })

  await assertForbiddenRegressions(page, '1100')

  // Stacked rail still mounts.
  const stackedRail = await page
    .locator('.pi-ps-insight-rail')
    .first()
    .isVisible()
    .catch(() => false)
  step('C1. stacked rail is still mounted at <=1199px', stackedRail)

  await openPassage(page, 'A')
  await shot(page, '08-1100-passage-A-open')

  const stackedRow = page.locator(
    '.pi-ps-structure-row[data-structure-row-mode="passage"]',
  )
  await stackedRow.first().click()
  await page.waitForTimeout(200)
  const stackedPressed = await stackedRow.first().getAttribute('aria-pressed')
  step(
    'C2. 篇章 row activates in stacked mode (aria-pressed=true)',
    stackedPressed === 'true',
    `aria-pressed=${stackedPressed}`,
  )

  const stackedCnt = await visibleBraceCount(page)
  step(
    'C3. brace is NOT visible at <=1199px',
    stackedCnt.visible === 0,
    `visible=${stackedCnt.visible} total=${stackedCnt.total}`,
  )

  // Contract: "No topbar insight fallback appears."
  const topbarFallback = await page.locator('.pi-ps-insight-topbar-row').count()
  step(
    'C4. no topbar insight fallback at <=1199px',
    topbarFallback === 0,
    `found ${topbarFallback}`,
  )
  await shot(page, '09-1100-brace-hidden')
} catch (err) {
  failed++
  const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
  issues.push(`unexpected error: ${msg}`)
  console.error(`\nUnexpected error: ${msg}`)
  try {
    await shot(page, '99-error')
  } catch {
    /* ignore */
  }
} finally {
  await context.close()
  await browser.close()
}

// ─── Summary ────────────────────────────────────────────────
console.log('')
console.log('═'.repeat(50))
console.log(`  C5b PO QA smoke: ${passed} passed, ${failed} failed`)
console.log('═'.repeat(50))
if (issues.length) {
  console.log('\nIssues:')
  for (const it of issues) console.log(`  - ${it}`)
}
process.exit(failed > 0 ? 1 : 0)
