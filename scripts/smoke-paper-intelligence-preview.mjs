#!/usr/bin/env node
/**
 * Live UI smoke for the Paper Intelligence interactive preview.
 *
 * Locks the V1 + smoke-polish behavior end-to-end against a running
 * dev server. Sole responsibility: every clickable assertion the
 * reviewer cares about now goes through a real browser, not just a
 * regex on the source.
 *
 * Coverage (one route, one fixture):
 *
 *    1. `?view=paper-intelligence&paperId=paper-2024-xkb1-reading`
 *       loads without crashing.
 *    2. `.pi-view` mounts; `.pi-error` is NOT rendered.
 *    3. `.pi-shell` shows the two-column layout (`.pi-main` left,
 *       `.pi-side` right).
 *    4. The right `.pi-side` panel carries `aria-live="polite"` and
 *       `role="region"`.
 *    5. Initial empty hint "点击左侧题目查看解析" is visible inside
 *       `.pi-side`.
 *    6. There are exactly 4 passages (A / B / C / D) and 15 question
 *       cards (`.pi-question-card`) across them.
 *    7. With no active question, no `<mark.pi-ev-highlight>` is
 *       rendered (passage body is plain text).
 *    8. Clicking the first `.pi-question-card`:
 *       - flips its `aria-pressed` to `"true"` and adds the
 *         `pi-question-card--active` class.
 *       - causes ≥ 1 `<mark.pi-ev-highlight--support>` to appear,
 *         scoped to the same `data-pi-question-id`.
 *       - causes ≥ 1 `<mark.pi-ev-highlight--trap>` to appear (the
 *         bundled fixture is built so each question with options has
 *         at least one trap).
 *    9. The right `.pi-side` panel updates in place: the empty hint
 *       disappears and we now see the headers "正确答案",
 *       "干扰项分析", and "同义替换".
 *   10. Auto-scroll: with the left scroller pre-scrolled to its
 *       bottom (so the first support highlight is offscreen), the
 *       click brings that highlight back into view INSIDE
 *       `.pi-main` — and the document scroller stays put.
 *   11. The right panel's data-pi-question-id matches the clicked
 *       card's data-pi-question-id (no cross-talk between questions).
 *   12. Clicking the SAME card again toggles it off:
 *       `aria-pressed` returns to `"false"`, all `<mark>` highlights
 *       disappear, and the empty hint comes back.
 *   13. Clicking a SECOND, different question card flips highlights
 *       and Analysis Panel to the new question (no leftover marks
 *       from the previous selection).
 *   14. Hard regression: never any LinkOverlay svg, never any
 *       `[data-pi-question-id]` mark whose `data-pi-evidence-kind`
 *       is empty, never any old V0 detail row (`.pi-question-detail`).
 *
 * Convention parity with `smoke-reading-analysis.mjs`:
 *   - imports playwright from `app/node_modules/playwright`,
 *   - uses `APP_URL` env var (default http://localhost:5173),
 *   - dumps screenshots into reports/artifacts/smoke-paper-
 *     intelligence-preview/,
 *   - exits non-zero on any failed step.
 *
 * Run:
 *   pnpm --filter app... -r run dev   # in another shell
 *   node scripts/smoke-paper-intelligence-preview.mjs
 *
 * The script is intentionally read-only: it does NOT trigger any
 * model call, it does NOT write to any database, and it touches no
 * file outside the artifact directory.
 */

import { chromium } from '../app/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
const PAPER_ID =
  process.env.PI_SMOKE_PAPER_ID || 'paper-2024-xkb1-reading'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ARTIFACT_DIR = path.resolve(
  HERE,
  '..',
  'reports',
  'artifacts',
  'smoke-paper-intelligence-preview',
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

console.log('=== Paper Intelligence interactive preview smoke ===')
console.log(`APP_URL=${APP_URL}`)
console.log(`paperId=${PAPER_ID}`)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
})
const page = await context.newPage()
page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    issues.push(`console.error: ${msg.text()}`)
  }
})

try {
  /* ── 1. Load the route. ─────────────────────────────────────── */
  const url = `${APP_URL}/?view=paper-intelligence&paperId=${encodeURIComponent(PAPER_ID)}`
  console.log(`Loading ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  // The component fetches report.json + input.json after mount; wait for
  // the shell to appear before any DOM read.
  await page.waitForSelector('.pi-shell', { timeout: 15000 })
  step('1. route loads paper-intelligence shell', true)
  await shot(page, '01-loaded')

  /* ── 2. Error state did NOT render. ─────────────────────────── */
  step(
    '2. .pi-error not rendered after load',
    !(await page.locator('.pi-error').first().isVisible().catch(() => false)),
  )

  /* ── 3. Two-column layout present. ──────────────────────────── */
  const hasMain = await page.locator('.pi-main').first().isVisible()
  const hasSide = await page.locator('.pi-side').first().isVisible()
  step('3. .pi-main left scroller present', hasMain)
  step('3. .pi-side right panel present', hasSide)

  /* ── 4. Right panel announces via aria-live="polite". ──────── */
  const ariaLive = await page
    .locator('.pi-side')
    .first()
    .getAttribute('aria-live')
  const role = await page.locator('.pi-side').first().getAttribute('role')
  step('4. right panel aria-live="polite"', ariaLive === 'polite')
  step('4. right panel role="region"', role === 'region')

  /* ── 5. Empty hint visible before any click. ────────────────── */
  const emptyHint = page
    .locator('.pi-side .pi-analysis-empty')
    .first()
  step(
    '5. empty hint "点击左侧题目查看解析" visible',
    (await emptyHint.isVisible().catch(() => false)) &&
      ((await emptyHint.textContent()) || '').includes('点击左侧题目查看解析'),
  )

  /* ── 6. 4 passages, 15 question cards, 0 highlights. ────────── */
  const passageCount = await page.locator('.pi-passage').count()
  step('6. 4 passage sections', passageCount === 4, `got ${passageCount}`)

  const cardCount = await page.locator('.pi-question-card').count()
  step('6. 15 question cards', cardCount === 15, `got ${cardCount}`)

  const initialHighlights = await page.locator('mark.pi-ev-highlight').count()
  step(
    '7. zero highlight marks before any click',
    initialHighlights === 0,
    `got ${initialHighlights}`,
  )

  /* ── 8. Click the first question card. ─────────────────────── */
  const firstCard = page.locator('.pi-question-card').first()
  const firstQid = await firstCard.getAttribute('data-pi-question-id')
  step('8. first card has data-pi-question-id', typeof firstQid === 'string' && firstQid.length > 0)

  /* ── 10 setup. Pre-scroll the left scroller to bottom so the
   *     first support highlight is below the visible region. We
   *     also capture the document's scrollY so we can verify the
   *     window did NOT scroll during the click. ──────────────── */
  const beforeScroll = await page.evaluate(() => {
    const main = document.querySelector('.pi-main')
    if (main) {
      main.scrollTop = main.scrollHeight
    }
    return {
      mainScrollTop: main ? main.scrollTop : -1,
      docScrollY: window.scrollY,
    }
  })
  step(
    '10a. .pi-main scrolled to bottom before click',
    beforeScroll.mainScrollTop > 0,
    `mainScrollTop=${beforeScroll.mainScrollTop}`,
  )

  await firstCard.click()
  // Auto-scroll uses smooth behavior under default motion settings;
  // give the browser a beat to land before reading scroll positions.
  await page.waitForTimeout(450)

  /* ── 8 continued. Active state flipped. ─────────────────────── */
  const ariaPressed = await firstCard.getAttribute('aria-pressed')
  step('8. first card aria-pressed=true', ariaPressed === 'true')
  const cls = (await firstCard.getAttribute('class')) || ''
  step(
    '8. first card has pi-question-card--active class',
    /\bpi-question-card--active\b/.test(cls),
  )

  /* ── 8 continued. Highlights for this question only. ──────── */
  const supportMarks = await page
    .locator(`mark.pi-ev-highlight--support[data-pi-question-id="${firstQid}"]`)
    .count()
  const trapMarks = await page
    .locator(`mark.pi-ev-highlight--trap[data-pi-question-id="${firstQid}"]`)
    .count()
  step(
    '8. ≥ 1 support highlight for active question',
    supportMarks >= 1,
    `got ${supportMarks}`,
  )
  step(
    '8. ≥ 1 trap highlight for active question',
    trapMarks >= 1,
    `got ${trapMarks}`,
  )

  // Bonus: no highlight should belong to a DIFFERENT question.
  const otherMarks = await page.evaluate((activeId) => {
    return Array.from(document.querySelectorAll('mark.pi-ev-highlight')).filter(
      (el) => el.getAttribute('data-pi-question-id') !== activeId,
    ).length
  }, firstQid)
  step(
    '8. no highlights belong to other questions',
    otherMarks === 0,
    `leaked ${otherMarks}`,
  )

  /* ── 9. Right panel updated in place. ───────────────────────── */
  await page.waitForSelector('.pi-side [data-pi-question-id]', { timeout: 5000 })
  const sidePanelQid = await page
    .locator('.pi-side [data-pi-question-id]')
    .first()
    .getAttribute('data-pi-question-id')
  step('9. right panel renders detail block', sidePanelQid !== null)
  step(
    '9. right panel question id matches clicked card',
    sidePanelQid === firstQid,
    `panel=${sidePanelQid} card=${firstQid}`,
  )
  const sideText = (await page.locator('.pi-side').innerText()) || ''
  step(
    '9. right panel includes "正确答案" header',
    sideText.includes('正确答案'),
  )
  step(
    '9. right panel includes "干扰项分析" header',
    sideText.includes('干扰项分析'),
  )
  step(
    '9. right panel includes "同义替换" header',
    sideText.includes('同义替换'),
  )
  step(
    '9. empty hint is gone after click',
    !sideText.includes('点击左侧题目查看解析'),
  )

  /* ── 10. Auto-scroll: target now in view inside .pi-main, and
   *       window did NOT scroll. ──────────────────────────────── */
  const afterScroll = await page.evaluate((activeId) => {
    const main = document.querySelector('.pi-main')
    const target = main
      ? main.querySelector(
          `[data-pi-question-id="${activeId}"][data-pi-evidence-kind="support"]`,
        )
      : null
    if (!main || !target) {
      return {
        ok: false,
        reason: !main ? 'no .pi-main' : 'no support target',
        mainScrollTop: main ? main.scrollTop : -1,
        docScrollY: window.scrollY,
      }
    }
    const mainRect = main.getBoundingClientRect()
    const tRect = target.getBoundingClientRect()
    const visible = tRect.top >= mainRect.top - 1 && tRect.bottom <= mainRect.bottom + 1
    return {
      ok: true,
      visible,
      mainScrollTop: main.scrollTop,
      docScrollY: window.scrollY,
      tTop: tRect.top,
      tBottom: tRect.bottom,
      mTop: mainRect.top,
      mBottom: mainRect.bottom,
    }
  }, firstQid)
  step(
    '10b. first support highlight is inside .pi-main viewport after click',
    afterScroll.ok && afterScroll.visible,
    JSON.stringify(afterScroll),
  )
  step(
    '10c. document scroll position unchanged (window not scrolled)',
    afterScroll.docScrollY === beforeScroll.docScrollY,
    `before=${beforeScroll.docScrollY} after=${afterScroll.docScrollY}`,
  )
  await shot(page, '02-active-q1')

  /* ── 12. Click same card again toggles off. ─────────────────── */
  await firstCard.click()
  await page.waitForTimeout(150)
  const afterToggleOff = await page.evaluate(() => ({
    pressed: document
      .querySelector('.pi-question-card')
      ?.getAttribute('aria-pressed'),
    marks: document.querySelectorAll('mark.pi-ev-highlight').length,
    sideText: document.querySelector('.pi-side')?.textContent || '',
  }))
  step(
    '12. toggle off: aria-pressed=false',
    afterToggleOff.pressed === 'false',
    `got ${afterToggleOff.pressed}`,
  )
  step(
    '12. toggle off: zero highlight marks',
    afterToggleOff.marks === 0,
    `got ${afterToggleOff.marks}`,
  )
  step(
    '12. toggle off: empty hint returns',
    afterToggleOff.sideText.includes('点击左侧题目查看解析'),
  )

  /* ── 13. Click a DIFFERENT question card. ───────────────────── */
  // pick a card from a different passage (use the last one in the list
  // so we know it's not the same question even if A has only 1 card).
  const lastCard = page.locator('.pi-question-card').last()
  const lastQid = await lastCard.getAttribute('data-pi-question-id')
  step('13. last card has a different qid from first', lastQid !== firstQid)
  await lastCard.click()
  await page.waitForTimeout(450)
  const switched = await page.evaluate((activeId) => {
    const allMarks = Array.from(document.querySelectorAll('mark.pi-ev-highlight'))
    const activeMarks = allMarks.filter(
      (el) => el.getAttribute('data-pi-question-id') === activeId,
    )
    const sideQid = document
      .querySelector('.pi-side [data-pi-question-id]')
      ?.getAttribute('data-pi-question-id')
    return {
      totalMarks: allMarks.length,
      activeMarks: activeMarks.length,
      foreignMarks: allMarks.length - activeMarks.length,
      sideQid,
    }
  }, lastQid)
  step(
    '13. switching card removes ALL marks from the previous question',
    switched.foreignMarks === 0,
    `foreign=${switched.foreignMarks}`,
  )
  step(
    '13. switching card surfaces marks for the new question',
    switched.activeMarks >= 1,
    `activeMarks=${switched.activeMarks}`,
  )
  step(
    '13. right panel switches to the new question',
    switched.sideQid === lastQid,
    `panel=${switched.sideQid} expected=${lastQid}`,
  )

  /* ── 14. Hard regressions. ──────────────────────────────────── */
  const linkOverlayCount = await page.locator('svg [data-link-id]').count()
  step(
    '14. no LinkOverlay svg paths drawn',
    linkOverlayCount === 0,
    `linkOverlays=${linkOverlayCount}`,
  )
  const detailRows = await page.locator('.pi-question-detail').count()
  step(
    '14. no V0 .pi-question-detail row exists',
    detailRows === 0,
    `detailRows=${detailRows}`,
  )
  const orphanMarks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('mark.pi-ev-highlight')).filter(
      (el) => {
        const kind = el.getAttribute('data-pi-evidence-kind')
        return kind !== 'support' && kind !== 'trap'
      },
    ).length
  })
  step(
    '14. every highlight mark carries a valid data-pi-evidence-kind',
    orphanMarks === 0,
    `orphans=${orphanMarks}`,
  )

  await shot(page, '03-after-switch')
} catch (err) {
  console.error('smoke crashed:', err)
  failed++
  issues.push(`crash: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  await browser.close()
}

console.log(`\n=== smoke result: ${passed} passed, ${failed} failed ===`)
if (issues.length > 0) {
  console.log('Issues:')
  for (const i of issues) console.log(`  - ${i}`)
}
process.exit(failed > 0 ? 1 : 0)
