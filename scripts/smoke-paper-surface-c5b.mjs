#!/usr/bin/env node
/**
 * Live UI smoke for the PaperSurface C5b PO QA paths.
 *
 * This is a LIGHTWEIGHT regression gate, not a replacement for PO
 * visual judgment. It automates the deterministic subset of the
 * accepted PaperSurface PO QA contract so a human PO is not asked
 * to re-prove the same DOM-level invariants by hand on every cut.
 *
 * Source of truth (do not drift):
 *   docs/product/paper-surface-c5b-po-qa-contract.md
 *
 * Route under test:
 *   /?view=paper-intelligence&paperId=paper-2024-xkb1-reading&surface=paper
 *
 * What this smoke covers (subset of the PO QA checklist):
 *
 *   A. Route + harness mount.
 *      - The C5b harness shell `.pi-ps-harness` mounts.
 *      - The left insight rail `.pi-ps-insight-rail` is in the DOM.
 *
 *   B. Forbidden-regression DOM guards (must hold at every breakpoint).
 *      - The bottom remote-control strip `.pi-ps-structure-controls`
 *        does NOT exist anywhere in the document. (The contract
 *        forbids restoring the bottom button row.)
 *      - When the structure detail is closed, NO
 *        `.pi-ps-structure-row` element exists. (P1/P2/P3/P4 buttons
 *        are forbidden on the collapsed main rail; rows live ONLY
 *        inside the open detail panel.)
 *      - There is no topbar insight chip fallback at any width
 *        (chips live only inside `.pi-ps-insight-rail`).
 *
 *   C. >=1360px: structure rows + Structure Brace happy paths.
 *      - Open passage A → structure rows render INSIDE
 *        `.pi-ps-insight-detail`.
 *      - Click `篇章` → brace SVG (`svg.pi-ps-structure-brace`) is
 *        present, visible, and `pointer-events: none`.
 *      - Click `P1` → brace remains; row carries
 *        `aria-pressed="true"`.
 *      - Click `P1` again → row deactivates and the brace SVG is
 *        removed from the DOM.
 *
 *   D. 1200px-1359px: tight desktop hides the brace.
 *      - Open passage A, click `P1` → row is `aria-pressed="true"`
 *        AND the brace, if rendered, has computed `display: none`.
 *        (The contract specifies hidden brace at this band; the
 *        paragraph row still acts as a scroll control.)
 *
 *   E. <=1199px: stacked drawer hides the brace entirely.
 *      - Click `P1` → row activates AND the brace SVG is NOT in
 *        the DOM (StructureBraceOverlay returns null when stacked).
 *      - No topbar insight chip fallback appears.
 *
 *   F. Evidence + Structure Brace coexistence (>=1360px).
 *      - Selecting a question paints the evidence line
 *        (`path.pi-line-path`).
 *      - Opening passage structure and clicking `P1` keeps the
 *        evidence line AND adds the brace; both surfaces coexist.
 *
 * Convention parity with `smoke-paper-intelligence-preview.mjs`:
 *   - Imports playwright from `app/node_modules/playwright`.
 *   - Uses `APP_URL` env var (default http://localhost:5173).
 *   - Dumps screenshots into reports/artifacts/smoke-paper-surface-c5b/.
 *   - Exits non-zero on any failed step.
 *
 * Run:
 *   pnpm dev                                # in another shell, from app/
 *   node scripts/smoke-paper-surface-c5b.mjs
 *
 * Override the URL or paper id:
 *   APP_URL=http://127.0.0.1:5174 PI_SMOKE_PAPER_ID=paper-2024-xkb1-reading \
 *     node scripts/smoke-paper-surface-c5b.mjs
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

/**
 * Make sure the rail is locked open so chips and the rail toggle are
 * deterministically clickable. The rail toggle button always lives at
 * `.pi-ps-insight-rail-toggle`. Calling this when the rail is already
 * locked is a no-op (we read `aria-expanded` first).
 */
async function lockRailOpen(page) {
  const toggle = page.locator('.pi-ps-insight-rail-toggle').first()
  const expanded = await toggle.getAttribute('aria-expanded')
  if (expanded !== 'true') {
    await toggle.click({ force: true })
    // aria-expanded reflects railLocked state; wait for it to flip.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.pi-ps-insight-rail-toggle')
        return el && el.getAttribute('aria-expanded') === 'true'
      },
      { timeout: 2000 },
    )
  }
}

/**
 * Open passage A's structure detail panel. Returns the chip locator
 * and asserts the detail panel is actually mounted afterwards.
 */
async function openPassageA(page) {
  await lockRailOpen(page)
  const chip = page.locator('button.pi-ps-insight-chip[data-pi-insight-chip="A"]').first()
  const expanded = await chip.getAttribute('aria-expanded')
  if (expanded !== 'true') {
    await chip.click({ force: true })
  }
  await page.waitForSelector(
    '.pi-ps-insight-detail #pi-ps-insight-panel-A',
    { timeout: 2000 },
  )
  return chip
}

/**
 * Read brace state in a single round-trip. Returns:
 *   - inDom: whether the SVG is rendered at all.
 *   - displayNone: whether the SVG has `display: none` computed.
 *   - pointerEvents: computed `pointer-events` value.
 *   - zIndex: numeric z-index (NaN if SVG missing).
 */
async function readBraceState(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('svg.pi-ps-structure-brace')
    if (!svg) {
      return { inDom: false, displayNone: false, pointerEvents: null, zIndex: NaN }
    }
    const cs = window.getComputedStyle(svg)
    return {
      inDom: true,
      displayNone: cs.display === 'none',
      pointerEvents: cs.pointerEvents,
      zIndex: Number(cs.zIndex),
    }
  })
}

/**
 * Read evidence-line state. Mirrors `smoke-paper-intelligence-preview`
 * helper but kept local — this smoke must not import from another
 * smoke script.
 */
async function readEvidenceLineState(page) {
  return page.evaluate(() => {
    const paths = Array.from(document.querySelectorAll('path.pi-line-path'))
    return {
      pathCount: paths.length,
      pathEvidenceIds: paths.map((p) => p.getAttribute('data-pi-evidence-id')),
    }
  })
}

console.log('=== PaperSurface C5b PO QA smoke ===')
console.log(`APP_URL=${APP_URL}`)
console.log(`paperId=${PAPER_ID}`)
console.log(
  'Contract: docs/product/paper-surface-c5b-po-qa-contract.md (regression gate, not PO replacement)',
)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  // Start at a wide-desktop viewport. Subsequent phases resize to
  // tight-desktop and stacked widths to cover the contract bands.
  viewport: { width: 1440, height: 900 },
})
const page = await context.newPage()
page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    issues.push(`console.error: ${msg.text()}`)
  }
})

try {
  /* ── A. Route + harness mount. ─────────────────────────────── */
  const url =
    `${APP_URL}/?view=paper-intelligence` +
    `&paperId=${encodeURIComponent(PAPER_ID)}&surface=paper`
  console.log(`Loading ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.pi-ps-harness', { timeout: 15000 })
  await page.waitForSelector('.pi-ps-harness-shell', { timeout: 5000 })
  step('A1. C5b harness shell mounts', true)

  step(
    'A2. left insight rail is in the DOM',
    (await page.locator('.pi-ps-insight-rail').count()) === 1,
  )
  await shot(page, '01-loaded-1440')

  /* ── B. Forbidden-regression DOM guards. ───────────────────── */
  // No bottom remote-control strip.
  step(
    'B1. no `.pi-ps-structure-controls` exists (forbidden bottom strip removed)',
    (await page.locator('.pi-ps-structure-controls').count()) === 0,
  )

  // No structure rows on the collapsed rail (detail not yet open).
  step(
    'B2. no `.pi-ps-structure-row` rendered before any chip is opened',
    (await page.locator('.pi-ps-structure-row').count()) === 0,
  )

  // No topbar insight chip fallback. Chips live only inside the rail.
  const chipsOutsideRail = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[data-pi-insight-chip]'))
    return all.filter((el) => !el.closest('.pi-ps-insight-rail')).length
  })
  step(
    'B3. no insight chip exists outside `.pi-ps-insight-rail` (no topbar fallback)',
    chipsOutsideRail === 0,
    `chipsOutsideRail=${chipsOutsideRail}`,
  )

  /* ── C. >=1360px happy paths. ──────────────────────────────── */
  await openPassageA(page)
  step(
    'C1. passage A insight detail mounts on chip click',
    (await page.locator('#pi-ps-insight-panel-A').count()) === 1,
  )

  // Structure rows render INSIDE the open detail panel.
  const rowsInsideDetail = await page.locator(
    '.pi-ps-insight-detail .pi-ps-structure-rows .pi-ps-structure-row',
  ).count()
  step(
    'C2. structure rows render inside `.pi-ps-insight-detail`',
    rowsInsideDetail >= 2,
    `rowsInsideDetail=${rowsInsideDetail}`,
  )

  // No structure rows leaked outside the detail (e.g. onto the rail).
  const rowsOutsideDetail = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('.pi-ps-structure-row'))
    return all.filter((el) => !el.closest('.pi-ps-insight-detail')).length
  })
  step(
    'C3. no `.pi-ps-structure-row` leaked outside detail panel',
    rowsOutsideDetail === 0,
    `rowsOutsideDetail=${rowsOutsideDetail}`,
  )

  // Click `篇章` row → brace appears.
  const passageRow = page.locator(
    '.pi-ps-insight-detail .pi-ps-structure-row[data-structure-row-mode="passage"]',
  ).first()
  await passageRow.click()
  await page.waitForSelector('svg.pi-ps-structure-brace', { timeout: 2000 })
  {
    const b = await readBraceState(page)
    step('C4. clicking 篇章 row paints the Structure Brace', b.inDom && !b.displayNone)
    step(
      'C4. brace is `pointer-events: none`',
      b.pointerEvents === 'none',
      `pointer-events=${b.pointerEvents}`,
    )
    step(
      'C4. brace z-index < 5 (below evidence line)',
      Number.isFinite(b.zIndex) && b.zIndex < 5,
      `z-index=${b.zIndex}`,
    )
    step(
      'C4. 篇章 row reports aria-pressed=true',
      (await passageRow.getAttribute('aria-pressed')) === 'true',
    )
  }
  await shot(page, '02-passage-brace-1440')

  // Click first paragraph row (P1) → brace stays, target shifts.
  const paragraphRows = page.locator(
    '.pi-ps-insight-detail .pi-ps-structure-row[data-structure-row-mode="paragraph"]',
  )
  const paragraphRowCount = await paragraphRows.count()
  step(
    'C5. passage A renders ≥1 paragraph row',
    paragraphRowCount >= 1,
    `count=${paragraphRowCount}`,
  )
  const p1Row = paragraphRows.first()
  await p1Row.click()
  await page.waitForTimeout(150)
  {
    const b = await readBraceState(page)
    step('C5. clicking P1 keeps the Structure Brace painted', b.inDom && !b.displayNone)
    step(
      'C5. P1 row reports aria-pressed=true',
      (await p1Row.getAttribute('aria-pressed')) === 'true',
    )
    step(
      'C5. 篇章 row reports aria-pressed=false (single active row)',
      (await passageRow.getAttribute('aria-pressed')) === 'false',
    )
  }
  await shot(page, '03-paragraph-brace-1440')

  // Click the same active P1 row again → brace disappears.
  await p1Row.click()
  await page.waitForTimeout(150)
  {
    const b = await readBraceState(page)
    step(
      'C6. clicking active P1 again removes the Structure Brace from DOM',
      b.inDom === false,
      `inDom=${b.inDom}`,
    )
    step(
      'C6. P1 row deactivates (aria-pressed=false)',
      (await p1Row.getAttribute('aria-pressed')) === 'false',
    )
  }

  /* ── D. 1200px-1359px: tight desktop hides the brace. ──────── */
  await page.setViewportSize({ width: 1280, height: 900 })
  // The harness clears any active brace on resize (PO decision); we
  // need to re-open the detail because the rail-lock and detail-open
  // state also clear on breakpoint cross.
  await page.waitForTimeout(200)
  await openPassageA(page)
  const p1RowTight = page.locator(
    '.pi-ps-insight-detail .pi-ps-structure-row[data-structure-row-mode="paragraph"]',
  ).first()
  await p1RowTight.click()
  await page.waitForTimeout(200)
  {
    const b = await readBraceState(page)
    step(
      'D1. P1 row activates at 1280px (still works as scroll control)',
      (await p1RowTight.getAttribute('aria-pressed')) === 'true',
    )
    // Either the SVG is not painted (overlay returns null because
    // measurement found no rect) OR it is painted but CSS hides it.
    // The contract requires the brace be invisible; both states
    // satisfy that contract.
    const hidden = b.inDom === false || b.displayNone === true
    step(
      'D1. brace is NOT visible at 1280px (display:none or unmounted)',
      hidden,
      `inDom=${b.inDom} displayNone=${b.displayNone}`,
    )
  }
  await shot(page, '04-tight-1280')

  /* ── E. <=1199px: stacked drawer, brace not rendered. ──────── */
  await page.setViewportSize({ width: 1100, height: 900 })
  await page.waitForTimeout(200)
  await openPassageA(page)
  const p1RowStacked = page.locator(
    '.pi-ps-insight-detail .pi-ps-structure-row[data-structure-row-mode="paragraph"]',
  ).first()
  await p1RowStacked.click({ force: true })
  await page.waitForTimeout(200)
  {
    const b = await readBraceState(page)
    step(
      'E1. P1 row activates at 1100px (stacked drawer still works)',
      (await p1RowStacked.getAttribute('aria-pressed')) === 'true',
    )
    step(
      'E1. brace SVG is NOT in the DOM at 1100px (stacked overlay returns null)',
      b.inDom === false,
      `inDom=${b.inDom}`,
    )
    const stackedChipsOutside = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('[data-pi-insight-chip]'))
      return all.filter((el) => !el.closest('.pi-ps-insight-rail')).length
    })
    step(
      'E2. no topbar insight chip fallback at 1100px',
      stackedChipsOutside === 0,
      `chipsOutsideRail=${stackedChipsOutside}`,
    )
  }
  await shot(page, '05-stacked-1100')

  /* ── F. Evidence + Structure Brace coexistence (>=1360px). ── */
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(200)

  // Click the first PaperSurface question card to seed the evidence
  // line. PaperSurface emits `<li class="ps-question" data-paper-question-id>`
  // whose outer element is the click target.
  const firstQuestion = page.locator('.ps-question[data-paper-question-id]').first()
  await firstQuestion.waitFor({ timeout: 5000 })
  await firstQuestion.click()
  // Give the harness a tick to seed activeEvidenceId from analysisView
  // and for PaperIntelligenceEvidenceLine to draw the path.
  await page.waitForFunction(
    () => document.querySelectorAll('path.pi-line-path').length >= 1,
    { timeout: 3000 },
  )
  {
    const ls = await readEvidenceLineState(page)
    step(
      'F1. selecting a question paints the evidence line (≥1 path)',
      ls.pathCount >= 1,
      `pathCount=${ls.pathCount}`,
    )
  }

  // Now open passage structure and click P1 — both surfaces should
  // coexist (evidence line stays AND brace appears).
  await openPassageA(page)
  const p1RowCoexist = page.locator(
    '.pi-ps-insight-detail .pi-ps-structure-row[data-structure-row-mode="paragraph"]',
  ).first()
  await p1RowCoexist.click()
  await page.waitForTimeout(200)
  {
    const b = await readBraceState(page)
    const ls = await readEvidenceLineState(page)
    step(
      'F2. evidence line still drawn after opening passage structure',
      ls.pathCount >= 1,
      `pathCount=${ls.pathCount}`,
    )
    step(
      'F2. Structure Brace painted alongside evidence line',
      b.inDom && !b.displayNone,
      `inDom=${b.inDom} displayNone=${b.displayNone}`,
    )
  }
  await shot(page, '06-coexistence-1440')

  /* ── Final summary. ────────────────────────────────────────── */
  console.log(`\nResult: ${passed} passed, ${failed} failed.`)
  if (issues.length > 0) {
    console.error('\nIssues:')
    for (const i of issues) console.error(`  - ${i}`)
  }
  console.log(`\nScreenshots: ${ARTIFACT_DIR}`)
} catch (err) {
  failed++
  issues.push(`fatal: ${err instanceof Error ? err.message : String(err)}`)
  console.error(`\nFATAL: ${err instanceof Error ? err.stack : String(err)}`)
} finally {
  await browser.close()
}

if (failed > 0) {
  process.exit(1)
}
