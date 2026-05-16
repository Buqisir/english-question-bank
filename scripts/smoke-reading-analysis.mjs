#!/usr/bin/env node
/**
 * Live UI smoke for the Reading Analysis PoC (题目 ↔ 原文证据虚线).
 *
 * Drives the standalone demo route (`?demo=reading-analysis`) and checks:
 *   1. demo opens
 *   2. .reading-analysis-view exists
 *   3. .ra-highlight-evidence count >= 1
 *   4. .ra-highlight-trap count >= 1
 *   5. clicking the question stem produces an svg path[data-link-id]
 *   6. clicking the correct option produces a path with data-link-kind=support
 *   7. clicking a wrong option produces a path with data-link-kind=trap
 *   8. scrolling the passage scroller mutates the path's `d` attribute
 *   9. clicking empty space removes the path
 *
 * Screenshots → reports/artifacts/smoke-reading-analysis/
 */

import { chromium } from '../app/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const APP_URL = process.env.APP_URL || 'http://localhost:5173'
const DEMO_URL = `${APP_URL.replace(/\/$/, '')}/?demo=reading-analysis`
const ARTIFACT_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'reports',
  'artifacts',
  'smoke-reading-analysis',
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

console.log('=== Reading Analysis PoC smoke ===')
console.log(`Loading ${DEMO_URL}…`)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()

try {
  await page.goto(DEMO_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

  // ── 1 & 2 ────────────────────────────────────────────────────────────────
  console.log('\nStep 1–2: demo route renders the analysis view')
  await page.waitForSelector('.reading-analysis-view', { timeout: 10000 })
  step('.reading-analysis-view present', true)

  // ── 3 & 4 ────────────────────────────────────────────────────────────────
  console.log('\nStep 3–4: passage shows evidence + trap highlights')
  const evidenceCount = await page.locator('.ra-highlight-evidence').count()
  step('.ra-highlight-evidence count ≥ 1', evidenceCount >= 1, `got ${evidenceCount}`)
  const trapCount = await page.locator('.ra-highlight-trap').count()
  step('.ra-highlight-trap count ≥ 1', trapCount >= 1, `got ${trapCount}`)
  await shot(page, '01-initial')

  // Helper to read the active path attributes.
  async function activePath() {
    return page.evaluate(() => {
      const pathEl = document.querySelector('svg.ra-link-overlay path[data-link-id]')
      if (!pathEl) return null
      return {
        id: pathEl.getAttribute('data-link-id'),
        kind: pathEl.getAttribute('data-link-kind'),
        d: pathEl.getAttribute('d') || '',
      }
    })
  }

  // ── 5: click stem → path appears ─────────────────────────────────────────
  console.log('\nStep 5: clicking the stem produces an svg path[data-link-id]')
  await page.locator('.ra-question-stem').first().click()
  await page.waitForSelector('svg.ra-link-overlay path[data-link-id]', { timeout: 5000 })
  const stemPath = await activePath()
  step('stem click renders an svg path[data-link-id]', !!stemPath && stemPath.id.length > 0, JSON.stringify(stemPath))
  step('stem path is a support link (kind=support)', stemPath?.kind === 'support', `kind=${stemPath?.kind}`)
  await shot(page, '02-stem-clicked')

  // ── 6: click correct option → support path to evidence ──────────────────
  console.log('\nStep 6: clicking the correct option draws a support path to evidence')
  await page.locator('.ra-option.ra-option-correct').first().click()
  await page.waitForFunction(
    () => {
      const p = document.querySelector('svg.ra-link-overlay path[data-link-id]')
      return p && p.getAttribute('data-link-kind') === 'support'
    },
    { timeout: 5000 },
  )
  const correctPath = await activePath()
  step('correct option path kind=support', correctPath?.kind === 'support', `kind=${correctPath?.kind}`)
  // Verify it lands on an evidence sentence: the target end of the path's
  // d attribute should be inside the .ra-highlight-evidence span's bbox.
  const correctTargetOk = await page.evaluate(() => {
    const pathEl = document.querySelector('svg.ra-link-overlay path[data-link-id]')
    const view = document.querySelector('.reading-analysis-view')
    if (!pathEl || !view) return false
    const d = pathEl.getAttribute('d') || ''
    // d looks like "M sx sy C c1x c1y, c2x c2y, tx ty" — grab the last pair.
    const match = d.match(/([\d.]+)\s+([\d.]+)\s*$/)
    if (!match) return false
    const tx = Number(match[1])
    const ty = Number(match[2])
    const viewRect = view.getBoundingClientRect()
    const evidenceEls = Array.from(document.querySelectorAll('.ra-highlight-evidence'))
    return evidenceEls.some((el) => {
      const r = el.getBoundingClientRect()
      const left = r.left - viewRect.left
      const right = r.right - viewRect.left
      const top = r.top - viewRect.top
      const bottom = r.bottom - viewRect.top
      // Allow ±2px slop for sub-pixel rounding.
      return tx >= left - 2 && tx <= right + 2 && ty >= top - 2 && ty <= bottom + 2
    })
  })
  step('correct option path lands on an evidence span', correctTargetOk === true, '')
  await shot(page, '03-correct-clicked')

  // ── 7: click wrong option → trap path ───────────────────────────────────
  console.log('\nStep 7: clicking a wrong option draws a trap path')
  await page.locator('.ra-option.ra-option-wrong').first().click()
  await page.waitForFunction(
    () => {
      const p = document.querySelector('svg.ra-link-overlay path[data-link-id]')
      return p && p.getAttribute('data-link-kind') === 'trap'
    },
    { timeout: 5000 },
  )
  const wrongPath = await activePath()
  step('wrong option path kind=trap', wrongPath?.kind === 'trap', `kind=${wrongPath?.kind}`)
  const trapTargetOk = await page.evaluate(() => {
    const pathEl = document.querySelector('svg.ra-link-overlay path[data-link-id]')
    const view = document.querySelector('.reading-analysis-view')
    if (!pathEl || !view) return false
    const d = pathEl.getAttribute('d') || ''
    const match = d.match(/([\d.]+)\s+([\d.]+)\s*$/)
    if (!match) return false
    const tx = Number(match[1])
    const ty = Number(match[2])
    const viewRect = view.getBoundingClientRect()
    const trapEls = Array.from(document.querySelectorAll('.ra-highlight-trap'))
    return trapEls.some((el) => {
      const r = el.getBoundingClientRect()
      const left = r.left - viewRect.left
      const right = r.right - viewRect.left
      const top = r.top - viewRect.top
      const bottom = r.bottom - viewRect.top
      return tx >= left - 2 && tx <= right + 2 && ty >= top - 2 && ty <= bottom + 2
    })
  })
  step('wrong option path lands on a trap span', trapTargetOk === true, '')
  await shot(page, '04-wrong-clicked')

  // ── 8: scroll the passage → path d attribute changes ────────────────────
  console.log('\nStep 8: scrolling the passage panel re-routes the path')
  // Re-select correct so we have a stable target inside the scroller.
  await page.locator('.ra-option.ra-option-correct').first().click()
  await page.waitForFunction(
    () => {
      const p = document.querySelector('svg.ra-link-overlay path[data-link-id]')
      return p && p.getAttribute('data-link-kind') === 'support'
    },
    { timeout: 5000 },
  )
  const dBefore = (await activePath())?.d || ''
  await page.evaluate(() => {
    const sc = document.querySelector('.reading-analysis-passage-scroller')
    if (sc) sc.scrollTop = 60
  })
  // Wait for the layout effect + scroll listener to repaint the SVG.
  await page.waitForFunction(
    (prev) => {
      const p = document.querySelector('svg.ra-link-overlay path[data-link-id]')
      return p && p.getAttribute('d') !== prev
    },
    dBefore,
    { timeout: 5000 },
  )
  const dAfter = (await activePath())?.d || ''
  step('path d attribute changes after scroll', dBefore !== '' && dAfter !== '' && dBefore !== dAfter,
    `before=${dBefore.slice(0, 40)}… after=${dAfter.slice(0, 40)}…`)
  await shot(page, '05-after-scroll')

  // ── 9: click background → path disappears ───────────────────────────────
  console.log('\nStep 9: clicking empty background clears the path')
  // Click the header area (outside any button / sentence).
  await page.locator('.reading-analysis-header').click()
  await page.waitForFunction(
    () => !document.querySelector('svg.ra-link-overlay path[data-link-id]'),
    { timeout: 5000 },
  )
  const cleared = await activePath()
  step('path[data-link-id] removed after background click', cleared === null, JSON.stringify(cleared))
  await shot(page, '06-cleared')
} catch (err) {
  failed++
  issues.push(`fatal: ${err instanceof Error ? err.message : String(err)}`)
  console.error(`\n  ✗ fatal:`, err)
  await shot(page, '99-fatal')
} finally {
  await context.close()
  await browser.close()
}

console.log(`\n=== smoke result: ${passed} passed, ${failed} failed ===`)
if (issues.length > 0) {
  console.error('\nIssues:')
  for (const i of issues) console.error(`  - ${i}`)
}
process.exit(failed > 0 ? 1 : 0)
