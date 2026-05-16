#!/usr/bin/env node
/**
 * Live UI smoke for the Reading Analysis demo (题目 ↔ 原文证据虚线).
 *
 * Two modes:
 *
 *   default:  opens `?demo=reading-analysis` (hardcoded fixture).
 *             Locks the full interaction loop:
 *               1. demo opens
 *               2. .reading-analysis-view exists
 *               3. source-note shows 示例数据
 *               4. .ra-highlight-evidence count >= 1
 *               5. .ra-highlight-trap count >= 1
 *               6. clicking the question stem produces an svg path[data-link-id]
 *               7. correct option → support path landing on an evidence span
 *               8. wrong option → trap path landing on a trap span
 *               9. scrolling the passage scroller mutates path's `d` attribute
 *              10. clicking empty space removes the path
 *
 *   --real:   iterates `app/src/features/reading-analysis/sidecar/index.json`
 *             and for EACH listed group opens
 *               `?demo=reading-analysis&groupId=<id>&questionNo=<no>`
 *             then asserts the smaller "real data didn't crash" surface:
 *              R1. demo opens
 *              R2. source-note shows 真实数据
 *              R3. real passage title is rendered (not 'When a Phone Box…')
 *              R4. question stem is non-empty
 *              R5. annotation counts read without crashing
 *              R6. if any .ra-highlight-evidence exists, clicking the stem
 *                  may draw an svg path[data-link-id] (not required —
 *                  cross_sentence samples are expected to miss).
 *
 * Screenshots → reports/artifacts/smoke-reading-analysis/
 */

import { chromium } from '../app/node_modules/playwright/index.mjs'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const APP_URL = process.env.APP_URL || 'http://localhost:5173'
const REAL_MODE = process.argv.includes('--real')
const HERE = path.dirname(new URL(import.meta.url).pathname)
const SIDECAR_INDEX = path.resolve(
  HERE,
  '..',
  'app/src/features/reading-analysis/sidecar/index.json',
)

const ARTIFACT_DIR = path.resolve(
  HERE,
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

console.log(`=== Reading Analysis demo smoke (${REAL_MODE ? 'real' : 'fixture'}) ===`)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()

try {
  if (!REAL_MODE) {
    const fixtureUrl = `${APP_URL.replace(/\/$/, '')}/?demo=reading-analysis`
    console.log(`Loading ${fixtureUrl}…`)
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await runFixtureSmoke(page)
  } else {
    const manifest = JSON.parse(readFileSync(SIDECAR_INDEX, 'utf8'))
    const samples = Array.isArray(manifest.samples) ? manifest.samples : []
    if (samples.length === 0) {
      throw new Error('sidecar index.json has no samples')
    }
    console.log(`Iterating ${samples.length} sidecar sample(s) from index.json`)
    for (const sample of samples) {
      const url =
        `${APP_URL.replace(/\/$/, '')}/?demo=reading-analysis` +
        `&groupId=${encodeURIComponent(sample.groupId)}` +
        `&questionNo=${encodeURIComponent(sample.questionNo || '1')}`
      console.log(`\n── ${sample.case} · ${sample.groupId} ──`)
      console.log(`   ${url}`)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await runRealSmoke(page, sample)
    }
  }
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

/* ─────────────────────────── helpers ─────────────────────────── */

async function activePath(page) {
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

async function runFixtureSmoke(page) {
  // ── 1 & 2 ─────────────────────────────────────────────────────────────
  console.log('\nStep 1–2: demo route renders the analysis view')
  await page.waitForSelector('.reading-analysis-view', { timeout: 10000 })
  step('.reading-analysis-view present', true)

  // Source note (示例数据).
  const note = (await page.locator('[data-ra-source-note]').textContent()) || ''
  step('source note shows 示例数据', /示例数据/.test(note), `got "${note}"`)

  // ── 3 & 4 ─────────────────────────────────────────────────────────────
  console.log('\nStep 3–4: passage shows evidence + trap highlights')
  const evidenceCount = await page.locator('.ra-highlight-evidence').count()
  step('.ra-highlight-evidence count ≥ 1', evidenceCount >= 1, `got ${evidenceCount}`)
  const trapCount = await page.locator('.ra-highlight-trap').count()
  step('.ra-highlight-trap count ≥ 1', trapCount >= 1, `got ${trapCount}`)
  await shot(page, '01-initial')

  // ── 5: stem click → path ──────────────────────────────────────────────
  console.log('\nStep 5: clicking the stem produces an svg path[data-link-id]')
  await page.locator('.ra-question-stem').first().click()
  await page.waitForSelector('svg.ra-link-overlay path[data-link-id]', { timeout: 5000 })
  const stemPath = await activePath(page)
  step('stem click renders an svg path[data-link-id]', !!stemPath && stemPath.id.length > 0, JSON.stringify(stemPath))
  step('stem path is a support link (kind=support)', stemPath?.kind === 'support', `kind=${stemPath?.kind}`)
  await shot(page, '02-stem-clicked')

  // ── 6: correct option → support path lands on evidence ────────────────
  console.log('\nStep 6: clicking the correct option draws a support path to evidence')
  await page.locator('.ra-option.ra-option-correct').first().click()
  await page.waitForFunction(
    () => {
      const p = document.querySelector('svg.ra-link-overlay path[data-link-id]')
      return p && p.getAttribute('data-link-kind') === 'support'
    },
    { timeout: 5000 },
  )
  const correctPath = await activePath(page)
  step('correct option path kind=support', correctPath?.kind === 'support', `kind=${correctPath?.kind}`)
  const correctTargetOk = await pathLandsOn(page, '.ra-highlight-evidence')
  step('correct option path lands on an evidence span', correctTargetOk === true, '')
  await shot(page, '03-correct-clicked')

  // ── 7: wrong option → trap path ───────────────────────────────────────
  console.log('\nStep 7: clicking a wrong option draws a trap path')
  await page.locator('.ra-option.ra-option-wrong').first().click()
  await page.waitForFunction(
    () => {
      const p = document.querySelector('svg.ra-link-overlay path[data-link-id]')
      return p && p.getAttribute('data-link-kind') === 'trap'
    },
    { timeout: 5000 },
  )
  const wrongPath = await activePath(page)
  step('wrong option path kind=trap', wrongPath?.kind === 'trap', `kind=${wrongPath?.kind}`)
  const trapTargetOk = await pathLandsOn(page, '.ra-highlight-trap')
  step('wrong option path lands on a trap span', trapTargetOk === true, '')
  await shot(page, '04-wrong-clicked')

  // ── 8: scroll → path d changes ───────────────────────────────────────
  console.log('\nStep 8: scrolling the passage panel re-routes the path')
  await page.locator('.ra-option.ra-option-correct').first().click()
  await page.waitForFunction(
    () => {
      const p = document.querySelector('svg.ra-link-overlay path[data-link-id]')
      return p && p.getAttribute('data-link-kind') === 'support'
    },
    { timeout: 5000 },
  )
  const dBefore = (await activePath(page))?.d || ''
  await page.evaluate(() => {
    const sc = document.querySelector('.reading-analysis-passage-scroller')
    if (sc) sc.scrollTop = 60
  })
  await page.waitForFunction(
    (prev) => {
      const p = document.querySelector('svg.ra-link-overlay path[data-link-id]')
      return p && p.getAttribute('d') !== prev
    },
    dBefore,
    { timeout: 5000 },
  )
  const dAfter = (await activePath(page))?.d || ''
  step('path d attribute changes after scroll', dBefore !== '' && dAfter !== '' && dBefore !== dAfter,
    `before=${dBefore.slice(0, 40)}… after=${dAfter.slice(0, 40)}…`)
  await shot(page, '05-after-scroll')

  // ── 9: empty click → path cleared ────────────────────────────────────
  console.log('\nStep 9: clicking empty background clears the path')
  await page.locator('.reading-analysis-header').click()
  await page.waitForFunction(
    () => !document.querySelector('svg.ra-link-overlay path[data-link-id]'),
    { timeout: 5000 },
  )
  const cleared = await activePath(page)
  step('path[data-link-id] removed after background click', cleared === null, JSON.stringify(cleared))
  await shot(page, '06-cleared')
}

async function runRealSmoke(page, sample) {
  const tag = `${sample.case}-${sample.groupId.slice(0, 16)}`
  // ── R1 ────────────────────────────────────────────────────────────────
  await page.waitForSelector('.reading-analysis-view', { timeout: 10000 })
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-ra-source-note]')
      if (!el) return false
      const t = el.textContent || ''
      return /真实数据|示例数据（无法加载|示例数据（selector|示例数据（题组/.test(t)
    },
    { timeout: 15000 },
  )
  step(`[${tag}] .reading-analysis-view present`, true)

  // ── R2 ────────────────────────────────────────────────────────────────
  const note = (await page.locator('[data-ra-source-note]').textContent()) || ''
  step(`[${tag}] source note contains 真实数据`, /真实数据/.test(note), `got "${note}"`)
  await shot(page, `real-${tag}-loaded`)

  // ── R3 ────────────────────────────────────────────────────────────────
  const passageTitle = (await page.locator('.ra-passage-title').textContent()) || ''
  step(
    `[${tag}] real passage title is non-empty + not the fixture title`,
    passageTitle.trim().length > 0 && !/Phone Box Becomes a Library/.test(passageTitle),
    `got "${passageTitle}"`,
  )

  // ── R4 ────────────────────────────────────────────────────────────────
  const stem = (await page.locator('.ra-question-stem-text').textContent()) || ''
  step(`[${tag}] question stem is non-empty`, stem.trim().length > 0, `got "${stem}"`)

  // ── R5 / R6 ───────────────────────────────────────────────────────────
  const evidenceCount = await page.locator('.ra-highlight-evidence').count()
  const trapCount = await page.locator('.ra-highlight-trap').count()
  step(
    `[${tag}] annotation counts read without crash`,
    Number.isFinite(evidenceCount) && Number.isFinite(trapCount),
    `evidence=${evidenceCount} trap=${trapCount}`,
  )

  if (evidenceCount > 0) {
    await page.locator('.ra-question-stem').first().click()
    try {
      await page.waitForSelector('svg.ra-link-overlay path[data-link-id]', { timeout: 2500 })
      const real = await activePath(page)
      step(
        `[${tag}] stem click drew a path with kind ∈ {support, trap}`,
        real !== null && (real.kind === 'support' || real.kind === 'trap'),
        JSON.stringify(real),
      )
    } catch {
      // For cross_sentence samples we explicitly accept "no path drawn".
      const acceptable = sample.case === 'cross-sentence'
      step(
        `[${tag}] stem click did NOT draw a path (acceptable for ${sample.case})`,
        acceptable,
        `case=${sample.case}`,
      )
    }
  } else {
    const optionCount = await page.locator('.ra-option').count()
    step(`[${tag}] with zero annotations, 4 options still render`, optionCount === 4, `got ${optionCount}`)
  }
  await shot(page, `real-${tag}-final`)
}

async function pathLandsOn(page, highlightSelector) {
  return page.evaluate((sel) => {
    const pathEl = document.querySelector('svg.ra-link-overlay path[data-link-id]')
    const view = document.querySelector('.reading-analysis-view')
    if (!pathEl || !view) return false
    const d = pathEl.getAttribute('d') || ''
    const match = d.match(/([\d.]+)\s+([\d.]+)\s*$/)
    if (!match) return false
    const tx = Number(match[1])
    const ty = Number(match[2])
    const viewRect = view.getBoundingClientRect()
    const els = Array.from(document.querySelectorAll(sel))
    return els.some((el) => {
      const r = el.getBoundingClientRect()
      const left = r.left - viewRect.left
      const right = r.right - viewRect.left
      const top = r.top - viewRect.top
      const bottom = r.bottom - viewRect.top
      return tx >= left - 2 && tx <= right + 2 && ty >= top - 2 && ty <= bottom + 2
    })
  }, highlightSelector)
}
