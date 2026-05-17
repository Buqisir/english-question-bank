#!/usr/bin/env node
/**
 * Live UI smoke for the Paper Intelligence interactive preview.
 *
 * Locks V1 + V2 behavior end-to-end against a running dev server.
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
 *       rendered AND no `<path.pi-line-path>` is drawn (overlay sits
 *       in the DOM with `data-empty="true"`).
 *    8. Clicking the first `.pi-question-card`:
 *       - flips its `aria-pressed` to `"true"` and adds the
 *         `pi-question-card--active` class.
 *       - causes ≥ 1 `<mark.pi-ev-highlight--support>` to appear,
 *         scoped to the same `data-pi-question-id`.
 *       - causes ≥ 1 `<mark.pi-ev-highlight--trap>` to appear.
 *       - causes EXACTLY ONE `<path.pi-line-path>` to be drawn.
 *       - that path's `data-pi-evidence-id` matches the question's
 *         support evidence id (the "answer evidence" connector
 *         appears by default).
 *    9. The right `.pi-side` panel updates in place with section
 *       header "选项解析" and 4 option blocks (A/B/C/D) containing
 *       English option text, "正确" tag, and "同义替换".
 *   10. Auto-scroll: with the left scroller pre-scrolled to its
 *       bottom, the click brings the support highlight back into
 *       view INSIDE `.pi-main` and the document scroller stays put.
 *   11. The right panel's `data-pi-question-id` matches the clicked
 *       card's id (no cross-talk between questions).
 *   12. Clicking a quoted distractor option block button in the right panel:
 *       - keeps the question active.
 *       - keeps EXACTLY ONE `<path.pi-line-path>` (line never multiplies).
 *       - the path's `data-pi-evidence-id` switches to the distractor's
 *         evidence id.
 *   13. Clicking a text-only distractor (the no-quote case) does NOT
 *       leave the page in a broken state. The line behavior is
 *       locked: text-only rows are NOT rendered as buttons in the
 *       first place, so they cannot be clicked to update
 *       `activeEvidenceId`. We assert that any element marked with
 *       `data-pi-quote-text-only="true"` is NOT a `<button>`.
 *   14. Clicking the SAME card again toggles it off:
 *       `aria-pressed` returns to `"false"`, all `<mark>` highlights
 *       AND the `<path.pi-line-path>` disappear, the empty hint
 *       comes back.
 *   15. Clicking a SECOND, different question card:
 *       - flips highlights and Analysis Panel to the new question.
 *       - the line returns and now anchors to the NEW question's
 *         support evidence id (default reseed).
 *   16. Scrolling the `.pi-main` scroller after a line is drawn does
 *       not crash and the line still has exactly one `<path>`. Path
 *       coordinates may change (we don't pin them); we only check
 *       the path is still present and points at the same evidence
 *       id.
 *   17. Small-screen viewport (e.g. 700px wide): the overlay is
 *       hidden (CSS rule), but highlights and right panel still
 *       work.
 *   18. Hard regressions: never any LinkOverlay svg with
 *       `data-link-id`, never any old V0 `.pi-question-detail` row.
 *   19. Cut B passage-header basket action: each passage surfaces a
 *       `.pi-passage-action` with `data-pi-add-state`; clicking the
 *       first addable button shows the `.pi-toast`, flips that
 *       passage's state to `in-basket`, and does NOT disturb the
 *       teacher's active question or evidence line.
 *   20. Cut C top bar: `[← 返回工作台]` button + tagline + `草稿卷 N`
 *       trigger button. Issue #20: the basket entry is now an
 *       interactive `<button>` with `aria-haspopup="dialog"` and
 *       `aria-expanded` toggling. Clicking it opens the basket preview
 *       popover; clicking again / pressing Esc / clicking outside
 *       closes it. Opening the popover does NOT change activeQuestionId
 *       or the evidence line. The popover lists the items in the
 *       basket, and on an empty basket renders a "草稿卷还是空的"
 *       hint.
 *   21. Cut C return-to-workbench: clicking the back button
 *       - strips `view=paper-intelligence` and `paperId=…` from the
 *         URL via `history.replaceState` (no full page reload),
 *       - unmounts `.pi-view`,
 *       - mounts the workbench shell (`.app-shell` topbar) without
 *         a navigation event,
 *       - preserves `localStorage` `english-question-bank.assembly-basket-v1`
 *         so the just-added passage is still in the draft after a hard
 *         reload.
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

async function readLineState(page) {
  return page.evaluate(() => {
    const paths = Array.from(document.querySelectorAll('path.pi-line-path'))
    const overlay = document.querySelector('.pi-line-overlay')
    return {
      pathCount: paths.length,
      pathEvidenceIds: paths.map((p) => p.getAttribute('data-pi-evidence-id')),
      overlayDataEmpty: overlay
        ? overlay.getAttribute('data-empty')
        : null,
      overlayDisplay: overlay
        ? window.getComputedStyle(overlay).display
        : null,
    }
  })
}

console.log('=== Paper Intelligence interactive preview smoke (V2) ===')
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
  await page.waitForSelector('.pi-shell', { timeout: 15000 })
  step('1. route loads paper-intelligence shell', true)
  await shot(page, '01-loaded')

  /* ── 2. Error state did NOT render. ─────────────────────────── */
  step(
    '2. .pi-error not rendered after load',
    !(await page.locator('.pi-error').first().isVisible().catch(() => false)),
  )

  /* ── 3. Two-column layout present. ──────────────────────────── */
  step('3. .pi-main left scroller present', await page.locator('.pi-main').first().isVisible())
  step('3. .pi-side right panel present', await page.locator('.pi-side').first().isVisible())

  /* ── 4. Right panel announces via aria-live="polite". ──────── */
  const ariaLive = await page.locator('.pi-side').first().getAttribute('aria-live')
  const role = await page.locator('.pi-side').first().getAttribute('role')
  step('4. right panel aria-live="polite"', ariaLive === 'polite')
  step('4. right panel role="region"', role === 'region')

  /* ── 5. Empty hint visible before any click. ────────────────── */
  const emptyHint = page.locator('.pi-side .pi-analysis-empty').first()
  step(
    '5. empty hint "点击左侧题目查看解析" visible',
    (await emptyHint.isVisible().catch(() => false)) &&
      ((await emptyHint.textContent()) || '').includes('点击左侧题目查看解析'),
  )

  /* ── 6. 4 passages, 15 question cards. ──────────────────────── */
  step('6. 4 passage sections', (await page.locator('.pi-passage').count()) === 4)
  step('6. 15 question cards', (await page.locator('.pi-question-card').count()) === 15)

  /* ── 7. No highlights, overlay present but empty. ───────────── */
  step(
    '7. zero highlight marks before any click',
    (await page.locator('mark.pi-ev-highlight').count()) === 0,
  )
  {
    const ls = await readLineState(page)
    step(
      '7. no <path.pi-line-path> drawn before any click',
      ls.pathCount === 0,
      `pathCount=${ls.pathCount}`,
    )
    step(
      '7. .pi-line-overlay sits in DOM with data-empty="true"',
      ls.overlayDataEmpty === 'true',
      `data-empty=${ls.overlayDataEmpty}`,
    )
  }

  /* ── 8. Click the first question card. ─────────────────────── */
  const firstCard = page.locator('.pi-question-card').first()
  const firstQid = await firstCard.getAttribute('data-pi-question-id')
  step(
    '8. first card has data-pi-question-id',
    typeof firstQid === 'string' && firstQid.length > 0,
  )

  // Pre-scroll setup (V1 auto-scroll + V2 line baseline)
  const beforeScroll = await page.evaluate(() => {
    const main = document.querySelector('.pi-main')
    if (main) main.scrollTop = main.scrollHeight
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
  await page.waitForTimeout(500)

  /* Active state flipped */
  step('8. first card aria-pressed=true', (await firstCard.getAttribute('aria-pressed')) === 'true')
  const cls = (await firstCard.getAttribute('class')) || ''
  step('8. first card has pi-question-card--active class', /\bpi-question-card--active\b/.test(cls))

  /* Highlights for this question only */
  const supportMarks = await page
    .locator(`mark.pi-ev-highlight--support[data-pi-question-id="${firstQid}"]`)
    .count()
  const trapMarks = await page
    .locator(`mark.pi-ev-highlight--trap[data-pi-question-id="${firstQid}"]`)
    .count()
  step('8. ≥ 1 support highlight for active question', supportMarks >= 1, `got ${supportMarks}`)
  step('8. ≥ 1 trap highlight for active question', trapMarks >= 1, `got ${trapMarks}`)
  const otherMarks = await page.evaluate((activeId) => {
    return Array.from(document.querySelectorAll('mark.pi-ev-highlight')).filter(
      (el) => el.getAttribute('data-pi-question-id') !== activeId,
    ).length
  }, firstQid)
  step('8. no highlights belong to other questions', otherMarks === 0, `leaked ${otherMarks}`)

  /* V2 line is drawn, exactly one, anchored to support evidence */
  const sideSupportEvidenceId = await page.evaluate(() => {
    const btn = document.querySelector(
      '.pi-side button[data-pi-evidence-kind="support"]',
    )
    return btn ? btn.getAttribute('data-pi-evidence-id') : null
  })
  step(
    '8. right panel renders a support button with data-pi-evidence-id',
    typeof sideSupportEvidenceId === 'string' && sideSupportEvidenceId.length > 0,
    `sideSupportEvidenceId=${sideSupportEvidenceId}`,
  )
  {
    const ls = await readLineState(page)
    step(
      '8. exactly one <path.pi-line-path> after question click',
      ls.pathCount === 1,
      `pathCount=${ls.pathCount}`,
    )
    step(
      '8. line path data-pi-evidence-id === support evidence id (default)',
      ls.pathEvidenceIds[0] === sideSupportEvidenceId,
      `path=${ls.pathEvidenceIds[0]} side=${sideSupportEvidenceId}`,
    )
    step(
      '8. .pi-line-overlay no longer empty (data-empty=null)',
      ls.overlayDataEmpty === null || ls.overlayDataEmpty === 'false',
    )
  }

  /* ── 9. Right panel updated in place. ───────────────────────── */
  await page.waitForSelector('.pi-side [data-pi-question-id]', { timeout: 5000 })
  const sidePanelQid = await page
    .locator('.pi-side [data-pi-question-id]')
    .first()
    .getAttribute('data-pi-question-id')
  step('9. right panel renders detail block', sidePanelQid !== null)
  step('9. right panel question id matches clicked card', sidePanelQid === firstQid)
  const sideText = (await page.locator('.pi-side').innerText()) || ''
  step('9. right panel includes "选项解析" header', sideText.includes('选项解析'))
  step('9. right panel includes "正确" tag', sideText.includes('正确'))
  step('9. right panel includes "同义替换" header', sideText.includes('同义替换'))
  step('9. empty hint is gone after click', !sideText.includes('点击左侧题目查看解析'))

  // Cut D1: verify option blocks exist with English content
  const optionBlocks = page.locator('.pi-side .pi-option-block')
  const optionBlockCount = await optionBlocks.count()
  step('9. right panel has 4 option blocks', optionBlockCount === 4, `count=${optionBlockCount}`)
  const optionLabels = await page.locator('.pi-side [data-pi-option-label]').evaluateAll(
    (els) => els.map((el) => el.getAttribute('data-pi-option-label')).sort().join(',')
  )
  step('9. A/B/C/D option blocks present', optionLabels === 'A,B,C,D', `labels=${optionLabels}`)
  const correctBlock = page.locator('.pi-side .pi-option-block--correct')
  const correctCount = await correctBlock.count()
  step('9. correct option block exists', correctCount >= 1)
  if (correctCount >= 1) {
    const correctText = await correctBlock.first().innerText()
    step('9. correct block contains "正确"', correctText.includes('正确'))
    step('9. correct block contains "同义替换"', correctText.includes('同义替换'))
  }
  // Verify English option content is rendered (pi-option-block-content)
  const contentEls = page.locator('.pi-side .pi-option-block-content')
  const contentCount = await contentEls.count()
  step('9. option blocks have English content elements', contentCount >= 4, `count=${contentCount}`)

  /* ── 10. Auto-scroll target visible, window unchanged. ───────── */
  const afterScroll = await page.evaluate((activeId) => {
    const main = document.querySelector('.pi-main')
    const target = main
      ? main.querySelector(
          `[data-pi-question-id="${activeId}"][data-pi-evidence-kind="support"]`,
        )
      : null
    if (!main || !target) {
      return { ok: false, mainScrollTop: main ? main.scrollTop : -1, docScrollY: window.scrollY }
    }
    const mainRect = main.getBoundingClientRect()
    const tRect = target.getBoundingClientRect()
    const visible = tRect.top >= mainRect.top - 1 && tRect.bottom <= mainRect.bottom + 1
    return {
      ok: true,
      visible,
      mainScrollTop: main.scrollTop,
      docScrollY: window.scrollY,
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
  await shot(page, '02-active-q1-line')

  /* ── 12. Click a quoted distractor → line switches. ─────────── */
  // Find the first quoted trap option block BUTTON (not a div/text-only).
  const distractorButtons = page.locator(
    '.pi-side button.pi-option-block[data-pi-evidence-kind="trap"]:not([data-pi-quote-text-only="true"])',
  )
  const distractorButtonCount = await distractorButtons.count()
  step(
    '12. at least one quoted distractor button is rendered',
    distractorButtonCount >= 1,
    `count=${distractorButtonCount}`,
  )
  let distractorEvidenceId = null
  if (distractorButtonCount >= 1) {
    const distractor = distractorButtons.first()
    distractorEvidenceId = await distractor.getAttribute('data-pi-evidence-id')
    await distractor.click()
    await page.waitForTimeout(400)
    const ls = await readLineState(page)
    step(
      '12. clicking a distractor keeps EXACTLY ONE <path.pi-line-path>',
      ls.pathCount === 1,
      `pathCount=${ls.pathCount}`,
    )
    step(
      '12. line path data-pi-evidence-id switched to distractor evidence id',
      ls.pathEvidenceIds[0] === distractorEvidenceId,
      `path=${ls.pathEvidenceIds[0]} expected=${distractorEvidenceId}`,
    )
    // Active question stays put — sanity check
    step(
      '12. active question id is unchanged after distractor click',
      (await firstCard.getAttribute('aria-pressed')) === 'true',
    )
    step(
      '12. distractor button shows aria-pressed=true after click',
      (await distractor.getAttribute('aria-pressed')) === 'true',
    )
  }

  /* ── 13. Text-only distractors are NOT buttons. ─────────────── */
  const textOnlyState = await page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll('[data-pi-quote-text-only="true"]'),
    )
    return {
      count: els.length,
      anyButton: els.some((el) => el.tagName === 'BUTTON'),
    }
  })
  if (textOnlyState.count === 0) {
    // The bundled fixture's first question may not have any text-only
    // distractors. We don't fail — just note the empty case.
    step('13. text-only distractor invariant (no text-only rows on this question)', true)
  } else {
    step(
      '13. text-only distractors are NOT rendered as <button>',
      textOnlyState.anyButton === false,
      `anyButton=${textOnlyState.anyButton}`,
    )
  }

  /* ── 14. Click same card again toggles off. ─────────────────── */
  await firstCard.click()
  await page.waitForTimeout(300)
  const afterToggleOff = await page.evaluate(() => ({
    pressed: document.querySelector('.pi-question-card')?.getAttribute('aria-pressed'),
    marks: document.querySelectorAll('mark.pi-ev-highlight').length,
    sideText: document.querySelector('.pi-side')?.textContent || '',
    pathCount: document.querySelectorAll('path.pi-line-path').length,
    overlayEmpty: document.querySelector('.pi-line-overlay')?.getAttribute('data-empty'),
  }))
  step(
    '14. toggle off: aria-pressed=false',
    afterToggleOff.pressed === 'false',
    `got ${afterToggleOff.pressed}`,
  )
  step('14. toggle off: zero highlight marks', afterToggleOff.marks === 0)
  step(
    '14. toggle off: empty hint returns',
    afterToggleOff.sideText.includes('点击左侧题目查看解析'),
  )
  step(
    '14. toggle off: zero <path.pi-line-path>',
    afterToggleOff.pathCount === 0,
    `pathCount=${afterToggleOff.pathCount}`,
  )
  step(
    '14. toggle off: overlay back to data-empty="true"',
    afterToggleOff.overlayEmpty === 'true',
    `overlayEmpty=${afterToggleOff.overlayEmpty}`,
  )

  /* ── 15. Switch to a different question. ────────────────────── */
  const lastCard = page.locator('.pi-question-card').last()
  const lastQid = await lastCard.getAttribute('data-pi-question-id')
  step('15. last card has a different qid from first', lastQid !== firstQid)
  await lastCard.click()
  await page.waitForTimeout(500)
  const switched = await page.evaluate((activeId) => {
    const allMarks = Array.from(document.querySelectorAll('mark.pi-ev-highlight'))
    const activeMarks = allMarks.filter(
      (el) => el.getAttribute('data-pi-question-id') === activeId,
    )
    const sideQid = document
      .querySelector('.pi-side [data-pi-question-id]')
      ?.getAttribute('data-pi-question-id')
    const supportBtn = document.querySelector(
      '.pi-side button[data-pi-evidence-kind="support"]',
    )
    const supportEvId = supportBtn ? supportBtn.getAttribute('data-pi-evidence-id') : null
    const paths = Array.from(document.querySelectorAll('path.pi-line-path'))
    return {
      foreignMarks: allMarks.length - activeMarks.length,
      activeMarks: activeMarks.length,
      sideQid,
      supportEvId,
      pathCount: paths.length,
      pathEvidenceId: paths[0]?.getAttribute('data-pi-evidence-id') ?? null,
    }
  }, lastQid)
  step(
    '15. switching card removes all marks from previous question',
    switched.foreignMarks === 0,
    `foreign=${switched.foreignMarks}`,
  )
  step(
    '15. switching card surfaces marks for the new question',
    switched.activeMarks >= 1,
    `activeMarks=${switched.activeMarks}`,
  )
  step('15. right panel switches to the new question', switched.sideQid === lastQid)
  step('15. exactly one <path.pi-line-path> after switching', switched.pathCount === 1)
  step(
    '15. line reseeds to NEW question support evidence id',
    switched.pathEvidenceId !== null && switched.pathEvidenceId === switched.supportEvId,
    `pathEv=${switched.pathEvidenceId} supportEv=${switched.supportEvId}`,
  )

  /* ── 16. Scrolling the .pi-main scroller does not crash. ───── */
  await page.evaluate(() => {
    const main = document.querySelector('.pi-main')
    if (main) main.scrollTop = 80
  })
  // Let the rAF coalescer settle.
  await page.waitForTimeout(150)
  {
    const ls = await readLineState(page)
    step(
      '16. exactly one <path.pi-line-path> remains after scroll',
      ls.pathCount === 1,
      `pathCount=${ls.pathCount}`,
    )
    step(
      '16. path still anchored to the same evidence id after scroll',
      ls.pathEvidenceIds[0] === switched.pathEvidenceId,
    )
  }
  await shot(page, '03-after-switch')

  /* ── 17. Small-screen viewport: overlay hidden. ─────────────── */
  await page.setViewportSize({ width: 700, height: 800 })
  // CSS swap is synchronous; tiny wait for layout to settle.
  await page.waitForTimeout(100)
  {
    const small = await page.evaluate(() => {
      const overlay = document.querySelector('.pi-line-overlay')
      return {
        overlayDisplay: overlay
          ? window.getComputedStyle(overlay).display
          : null,
      }
    })
    step(
      '17. small-screen: .pi-line-overlay hidden via CSS (display=none)',
      small.overlayDisplay === 'none',
      `display=${small.overlayDisplay}`,
    )
    // The page itself should still respond
    step(
      '17. small-screen: shell still present',
      await page.locator('.pi-shell').first().isVisible(),
    )
  }
  // restore viewport for any later screenshots
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(100)

  /* ── 18. Hard regressions. ──────────────────────────────────── */
  // We must NOT render the reading-analysis LinkOverlay path
  // (which uses `data-link-id`). The selector `svg [data-link-id]`
  // covers any element with that attribute inside an SVG.
  const linkOverlayCount = await page.locator('svg [data-link-id]').count()
  step('18. no LinkOverlay svg paths drawn (data-link-id absent)', linkOverlayCount === 0)
  const detailRows = await page.locator('.pi-question-detail').count()
  step('18. no V0 .pi-question-detail row exists', detailRows === 0)
  const orphanMarks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('mark.pi-ev-highlight')).filter(
      (el) => {
        const kind = el.getAttribute('data-pi-evidence-kind')
        return kind !== 'support' && kind !== 'trap'
      },
    ).length
  })
  step('18. every highlight mark carries a valid data-pi-evidence-kind', orphanMarks === 0)

  /* ── 18b. Issue #20: empty-state basket popover BEFORE any add. ──
   *
   * The basket starts empty (fresh Playwright context, no
   * localStorage). The top-bar button must therefore expose
   * data-pi-basket-count="0" and clicking it must surface the
   * empty-state popover. We also check that opening the popover does
   * NOT mutate activeQuestionId or the evidence line state — that
   * boundary is what makes the popover safe to use mid-讲题.
   */
  const basketTriggerInitial = await page.evaluate(() => {
    const btn = document.querySelector('[data-pi-basket-toggle="true"]')
    return {
      tag: btn?.tagName ?? null,
      hasPopup: btn?.getAttribute('aria-haspopup') ?? null,
      ariaExpandedClosed: btn?.getAttribute('aria-expanded') ?? null,
      basketCount: btn?.getAttribute('data-pi-basket-count') ?? null,
      text: ((btn?.textContent || '').trim()),
    }
  })
  step(
    '18b. basket trigger is a real <button> (Issue #20: replaces static <span>)',
    basketTriggerInitial.tag === 'BUTTON',
    `tag=${basketTriggerInitial.tag}`,
  )
  step(
    '18b. basket trigger declares aria-haspopup="dialog"',
    basketTriggerInitial.hasPopup === 'dialog',
    `aria-haspopup=${basketTriggerInitial.hasPopup}`,
  )
  step(
    '18b. basket trigger starts with aria-expanded="false"',
    basketTriggerInitial.ariaExpandedClosed === 'false',
    `aria-expanded=${basketTriggerInitial.ariaExpandedClosed}`,
  )
  step(
    '18b. basket count is 0 before any add',
    basketTriggerInitial.basketCount === '0',
    `data-pi-basket-count=${basketTriggerInitial.basketCount}`,
  )
  step(
    '18b. basket trigger label includes "草稿卷"',
    basketTriggerInitial.text.startsWith('草稿卷'),
    `text="${basketTriggerInitial.text}"`,
  )

  // Snapshot baseline: opening the popover must not change these.
  const beforeOpenEmpty = await page.evaluate(() => ({
    activeId: document
      .querySelector('.pi-question-card[aria-pressed="true"]')
      ?.getAttribute('data-pi-question-id') ?? null,
    pathCount: document.querySelectorAll('path.pi-line-path').length,
  }))

  await page.locator('[data-pi-basket-toggle="true"]').first().click()
  await page.waitForSelector('[data-pi-basket-popover="true"]', { timeout: 1500 })

  const emptyPopoverState = await page.evaluate(() => {
    const popover = document.querySelector('[data-pi-basket-popover="true"]')
    const btn = document.querySelector('[data-pi-basket-toggle="true"]')
    return {
      popoverPresent: Boolean(popover),
      popoverEmpty: popover?.getAttribute('data-pi-basket-popover-empty') ?? null,
      emptyHint: Boolean(popover?.querySelector('[data-pi-basket-empty-state="true"]')),
      itemCount: popover?.querySelectorAll('[data-pi-basket-item-id]').length ?? 0,
      ariaExpandedOpen: btn?.getAttribute('aria-expanded') ?? null,
    }
  })
  step(
    '18b. clicking trigger opens the basket popover (data-pi-basket-popover present)',
    emptyPopoverState.popoverPresent,
  )
  step(
    '18b. trigger aria-expanded flips to "true" while popover is open',
    emptyPopoverState.ariaExpandedOpen === 'true',
    `aria-expanded=${emptyPopoverState.ariaExpandedOpen}`,
  )
  step(
    '18b. empty popover marks itself with data-pi-basket-popover-empty="true"',
    emptyPopoverState.popoverEmpty === 'true',
    `data-pi-basket-popover-empty=${emptyPopoverState.popoverEmpty}`,
  )
  step(
    '18b. empty popover renders the empty-state hint block',
    emptyPopoverState.emptyHint,
  )
  step(
    '18b. empty popover renders zero item rows',
    emptyPopoverState.itemCount === 0,
    `itemCount=${emptyPopoverState.itemCount}`,
  )

  const afterOpenEmpty = await page.evaluate(() => ({
    activeId: document
      .querySelector('.pi-question-card[aria-pressed="true"]')
      ?.getAttribute('data-pi-question-id') ?? null,
    pathCount: document.querySelectorAll('path.pi-line-path').length,
  }))
  step(
    '18b. opening basket popover does not change activeQuestionId',
    afterOpenEmpty.activeId === beforeOpenEmpty.activeId,
    `before=${beforeOpenEmpty.activeId} after=${afterOpenEmpty.activeId}`,
  )
  step(
    '18b. opening basket popover does not multiply / drop the evidence line',
    afterOpenEmpty.pathCount === beforeOpenEmpty.pathCount,
    `before=${beforeOpenEmpty.pathCount} after=${afterOpenEmpty.pathCount}`,
  )

  // Esc closes the popover and resets aria-expanded.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  const afterEsc = await page.evaluate(() => ({
    popoverGone: !document.querySelector('[data-pi-basket-popover="true"]'),
    ariaExpanded: document
      .querySelector('[data-pi-basket-toggle="true"]')
      ?.getAttribute('aria-expanded') ?? null,
  }))
  step('18b. Escape closes the basket popover', afterEsc.popoverGone)
  step(
    '18b. trigger aria-expanded returns to "false" after Esc',
    afterEsc.ariaExpanded === 'false',
    `aria-expanded=${afterEsc.ariaExpanded}`,
  )

  /* ── 19. Cut B: passage-header basket action surface. ───────── */
  // Each of the 4 passages must surface a `.pi-passage-action` element
  // with a known `data-pi-add-state`. The default fixture+sample bank
  // resolves all 4 ids to local groups, so the initial state is
  // `addable` for every passage.
  const addStates = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll('.pi-passage-action'),
    ).map((el) => ({
      state: el.getAttribute('data-pi-add-state'),
      tag: el.tagName,
      questionGroupId: el.getAttribute('data-pi-question-group-id'),
      text: (el.textContent || '').trim(),
    }))
  })
  step(
    '19. four passage-header basket actions rendered',
    addStates.length === 4,
    `count=${addStates.length}`,
  )
  step(
    '19. all four start in addable state with the expected button text',
    addStates.every((s) => s.state === 'addable' && s.text === '加入草稿卷'),
    JSON.stringify(addStates),
  )

  // Click the first addable action and assert: toast appears with the
  // expected message; the button flips to the in-basket state; the
  // teacher's active question + line state are NOT disturbed.
  const beforeAddState = await page.evaluate(() => ({
    activeId: document
      .querySelector('.pi-question-card[aria-pressed="true"]')
      ?.getAttribute('data-pi-question-id') ?? null,
    pathCount: document.querySelectorAll('path.pi-line-path').length,
  }))
  const firstAction = page
    .locator('.pi-passage-action[data-pi-add-state="addable"]')
    .first()
  const targetSection = await firstAction.evaluate((el) => {
    const passage = el.closest('.pi-passage')
    return passage?.getAttribute('data-pi-paper-section') ?? null
  })
  await firstAction.click()
  await page.waitForSelector('.pi-toast', { timeout: 1500 })
  const toastText = ((await page.locator('.pi-toast').textContent()) || '').trim()
  step(
    '19. toast appears with "已加入草稿卷：阅读理解 {section}"',
    toastText === `已加入草稿卷：阅读理解 ${targetSection}`,
    `toast="${toastText}" expected section=${targetSection}`,
  )
  const afterAddState = await page.evaluate(() => ({
    activeId: document
      .querySelector('.pi-question-card[aria-pressed="true"]')
      ?.getAttribute('data-pi-question-id') ?? null,
    pathCount: document.querySelectorAll('path.pi-line-path').length,
    firstActionState: document
      .querySelector('.pi-passage-action')
      ?.getAttribute('data-pi-add-state') ?? null,
  }))
  step(
    '19. add-to-basket does not change activeQuestionId',
    afterAddState.activeId === beforeAddState.activeId,
    `before=${beforeAddState.activeId} after=${afterAddState.activeId}`,
  )
  step(
    '19. add-to-basket does not multiply the evidence line',
    afterAddState.pathCount === beforeAddState.pathCount,
    `before=${beforeAddState.pathCount} after=${afterAddState.pathCount}`,
  )
  step(
    '19. first passage action flips to in-basket after click',
    afterAddState.firstActionState === 'in-basket',
    `state=${afterAddState.firstActionState}`,
  )

  /* ── 20. Cut C top bar + Issue #20 basket preview entry. ───── */
  const topbarState = await page.evaluate(() => {
    const topbar = document.querySelector('.pi-topbar')
    const back = topbar?.querySelector('[data-pi-back-to-workbench="true"]')
    const tagline = topbar?.querySelector('.pi-topbar-tagline')
    const basket = topbar?.querySelector('[data-pi-basket-toggle="true"]')
    return {
      topbarPresent: Boolean(topbar),
      backIsButton: back?.tagName === 'BUTTON',
      backText: (back?.textContent || '').trim(),
      tagline: (tagline?.textContent || '').trim(),
      // Issue #20: the basket entry is now a real button (was a span).
      basketIsButton: basket?.tagName === 'BUTTON',
      basketHasPopup: basket?.getAttribute('aria-haspopup') ?? null,
      basketAriaControls: basket?.getAttribute('aria-controls') ?? null,
      basketAriaExpanded: basket?.getAttribute('aria-expanded') ?? null,
      basketText: (basket?.textContent || '').trim(),
      basketCountAttr: basket?.getAttribute('data-pi-basket-count'),
    }
  })
  step('20. .pi-topbar present above the report header', topbarState.topbarPresent)
  step(
    '20. back button is a real <button> (not a link)',
    topbarState.backIsButton,
    `tag=${topbarState.backIsButton}`,
  )
  step(
    '20. back button text contains "返回工作台"',
    topbarState.backText.includes('返回工作台'),
    `text="${topbarState.backText}"`,
  )
  step(
    '20. tagline reads "一张卷，10 分钟看懂讲哪里"',
    topbarState.tagline === '一张卷，10 分钟看懂讲哪里',
    `tagline="${topbarState.tagline}"`,
  )
  step(
    '20. Issue #20: basket entry is a real <button> (replaces former <span>)',
    topbarState.basketIsButton,
    `tag=${topbarState.basketIsButton}`,
  )
  step(
    '20. Issue #20: basket entry exposes aria-haspopup="dialog"',
    topbarState.basketHasPopup === 'dialog',
    `aria-haspopup=${topbarState.basketHasPopup}`,
  )
  step(
    '20. Issue #20: basket entry exposes aria-controls pointing at the popover id',
    topbarState.basketAriaControls === 'pi-basket-preview-popover',
    `aria-controls=${topbarState.basketAriaControls}`,
  )
  step(
    '20. Issue #20: basket entry currently reports aria-expanded="false" (popover closed)',
    topbarState.basketAriaExpanded === 'false',
    `aria-expanded=${topbarState.basketAriaExpanded}`,
  )
  step(
    '20. basket entry text starts with "草稿卷"',
    topbarState.basketText.startsWith('草稿卷'),
    `text="${topbarState.basketText}"`,
  )
  // After step 19 added one passage, basketCount must be ≥ 1.
  step(
    '20. basket entry data-pi-basket-count reflects the just-added passage (≥ 1)',
    Number(topbarState.basketCountAttr ?? '0') >= 1,
    `data-pi-basket-count=${topbarState.basketCountAttr}`,
  )

  /* ── 20a. Issue #20: opening the popover after step 19 lists the
   *    just-added passage and does NOT touch the active question or
   *    evidence line. ─────────────────────────────────────────── */
  const beforeOpenPopulated = await page.evaluate(() => ({
    activeId: document
      .querySelector('.pi-question-card[aria-pressed="true"]')
      ?.getAttribute('data-pi-question-id') ?? null,
    activeEvidenceId: document
      .querySelector('path.pi-line-path')
      ?.getAttribute('data-pi-evidence-id') ?? null,
    pathCount: document.querySelectorAll('path.pi-line-path').length,
  }))

  await page.locator('[data-pi-basket-toggle="true"]').first().click()
  await page.waitForSelector('[data-pi-basket-popover="true"]', { timeout: 1500 })

  const populatedPopover = await page.evaluate(() => {
    const popover = document.querySelector('[data-pi-basket-popover="true"]')
    const items = Array.from(
      popover?.querySelectorAll('[data-pi-basket-item-id]') || [],
    )
    return {
      popoverPresent: Boolean(popover),
      popoverEmpty: popover?.getAttribute('data-pi-basket-popover-empty') ?? null,
      itemCount: items.length,
      firstItemSection:
        items[0]
          ?.querySelector('.pi-basket-preview-item-section')
          ?.textContent?.trim() ?? null,
      firstItemPassage:
        items[0]
          ?.querySelector('.pi-basket-preview-item-passage')
          ?.textContent?.trim() ?? null,
      firstItemMeta:
        items[0]
          ?.querySelector('.pi-basket-preview-item-meta')
          ?.textContent?.trim() ?? null,
    }
  })
  step(
    '20a. Issue #20: popover is rendered after click on populated basket',
    populatedPopover.popoverPresent,
  )
  step(
    '20a. Issue #20: popover marks itself non-empty (data-pi-basket-popover-empty="false")',
    populatedPopover.popoverEmpty === 'false',
    `data-pi-basket-popover-empty=${populatedPopover.popoverEmpty}`,
  )
  step(
    '20a. Issue #20: popover lists ≥ 1 item rows for the populated basket',
    populatedPopover.itemCount >= 1,
    `itemCount=${populatedPopover.itemCount}`,
  )
  step(
    '20a. Issue #20: first popover row carries a paper section badge',
    typeof populatedPopover.firstItemSection === 'string' &&
      populatedPopover.firstItemSection.length > 0,
    `firstItemSection="${populatedPopover.firstItemSection}"`,
  )
  step(
    '20a. Issue #20: first popover row carries a passage title',
    typeof populatedPopover.firstItemPassage === 'string' &&
      populatedPopover.firstItemPassage.length > 0,
    `firstItemPassage="${populatedPopover.firstItemPassage}"`,
  )
  step(
    '20a. Issue #20: first popover row meta includes "题" (question count) and "分" (score)',
    typeof populatedPopover.firstItemMeta === 'string' &&
      populatedPopover.firstItemMeta.includes('题') &&
      populatedPopover.firstItemMeta.includes('分'),
    `firstItemMeta="${populatedPopover.firstItemMeta}"`,
  )

  // Cross-cutting boundary: opening the popover must not disturb the
  // teacher's active question / evidence line. This is the contract
  // that keeps the popover safe to use mid-lesson.
  const afterOpenPopulated = await page.evaluate(() => ({
    activeId: document
      .querySelector('.pi-question-card[aria-pressed="true"]')
      ?.getAttribute('data-pi-question-id') ?? null,
    activeEvidenceId: document
      .querySelector('path.pi-line-path')
      ?.getAttribute('data-pi-evidence-id') ?? null,
    pathCount: document.querySelectorAll('path.pi-line-path').length,
  }))
  step(
    '20a. Issue #20: opening basket popover does not change activeQuestionId',
    afterOpenPopulated.activeId === beforeOpenPopulated.activeId,
    `before=${beforeOpenPopulated.activeId} after=${afterOpenPopulated.activeId}`,
  )
  step(
    '20a. Issue #20: opening basket popover does not change activeEvidenceId',
    afterOpenPopulated.activeEvidenceId === beforeOpenPopulated.activeEvidenceId,
    `before=${beforeOpenPopulated.activeEvidenceId} after=${afterOpenPopulated.activeEvidenceId}`,
  )
  step(
    '20a. Issue #20: opening basket popover does not multiply / drop evidence line',
    afterOpenPopulated.pathCount === beforeOpenPopulated.pathCount,
    `before=${beforeOpenPopulated.pathCount} after=${afterOpenPopulated.pathCount}`,
  )

  /* ── 20b. Issue #20: clicking the trigger again toggles the
   *    popover closed; aria-expanded flips back to "false". ───── */
  await page.locator('[data-pi-basket-toggle="true"]').first().click()
  await page.waitForTimeout(150)
  const afterReClick = await page.evaluate(() => ({
    popoverGone: !document.querySelector('[data-pi-basket-popover="true"]'),
    ariaExpanded: document
      .querySelector('[data-pi-basket-toggle="true"]')
      ?.getAttribute('aria-expanded') ?? null,
  }))
  step(
    '20b. Issue #20: re-clicking the basket trigger closes the popover',
    afterReClick.popoverGone,
  )
  step(
    '20b. Issue #20: trigger aria-expanded returns to "false" after re-click',
    afterReClick.ariaExpanded === 'false',
    `aria-expanded=${afterReClick.ariaExpanded}`,
  )

  /* ── 20c. Issue #20: outside-click closes the popover. ─────── */
  await page.locator('[data-pi-basket-toggle="true"]').first().click()
  await page.waitForSelector('[data-pi-basket-popover="true"]', { timeout: 1500 })
  // Click somewhere clearly neutral. The report header is a safe target —
  // it does not own a click handler that would change PI state.
  await page.locator('.pi-header h1').first().click()
  await page.waitForTimeout(150)
  const afterOutsideClick = await page.evaluate(() => ({
    popoverGone: !document.querySelector('[data-pi-basket-popover="true"]'),
    ariaExpanded: document
      .querySelector('[data-pi-basket-toggle="true"]')
      ?.getAttribute('aria-expanded') ?? null,
  }))
  step(
    '20c. Issue #20: clicking outside closes the basket popover',
    afterOutsideClick.popoverGone,
  )
  step(
    '20c. Issue #20: trigger aria-expanded returns to "false" after outside click',
    afterOutsideClick.ariaExpanded === 'false',
    `aria-expanded=${afterOutsideClick.ariaExpanded}`,
  )

  /* ── 21. Cut C: return-to-workbench preserves URL via replaceState. ── */
  // We hook the browser's navigation surface so we can prove the click
  // never triggers a full page load. `before/after Navigate Counter`
  // increments on every `pagehide` / `unload` / `beforeunload`. None of
  // those events should fire — `history.replaceState` is silent.
  await page.evaluate(() => {
    const w = /** @type {any} */ (window)
    w.__piNavCount = 0
    w.__piHistoryReplaceCount = 0
    const handler = () => {
      w.__piNavCount += 1
    }
    window.addEventListener('beforeunload', handler)
    window.addEventListener('pagehide', handler)
    window.addEventListener('unload', handler)
    const origReplace = window.history.replaceState.bind(window.history)
    window.history.replaceState = (...args) => {
      w.__piHistoryReplaceCount += 1
      return origReplace(...args)
    }
  })

  // Read the basket BEFORE clicking back so we can assert it survives.
  const basketLocalBefore = await page.evaluate(() =>
    window.localStorage.getItem('assembly-basket-v1'),
  )
  step(
    '21a. localStorage assembly-basket-v1 holds at least one basket item before back',
    typeof basketLocalBefore === 'string' &&
      basketLocalBefore.length > 0 &&
      /"id"/.test(basketLocalBefore),
    `value=${basketLocalBefore?.slice(0, 80)}…`,
  )

  await page.locator('[data-pi-back-to-workbench="true"]').first().click()
  // Allow React to re-render and any deferred fetch effects to flush.
  await page.waitForTimeout(600)

  const afterBack = await page.evaluate(() => {
    const w = /** @type {any} */ (window)
    return {
      navCount: w.__piNavCount ?? -1,
      replaceCount: w.__piHistoryReplaceCount ?? -1,
      url: window.location.href,
      search: window.location.search,
      piViewMounted: Boolean(document.querySelector('.pi-view')),
      appShellMounted: Boolean(document.querySelector('.app-shell')),
      basketLocal: window.localStorage.getItem('assembly-basket-v1'),
    }
  })
  step(
    '21b. no full-page navigation event fired (pagehide/unload/beforeunload count = 0)',
    afterBack.navCount === 0,
    `navCount=${afterBack.navCount}`,
  )
  step(
    '21b. history.replaceState was called by the back handler',
    afterBack.replaceCount >= 1,
    `replaceCount=${afterBack.replaceCount}`,
  )
  step(
    '21c. URL no longer contains view=paper-intelligence',
    !afterBack.search.includes('view=paper-intelligence'),
    `search="${afterBack.search}"`,
  )
  step(
    '21c. URL no longer contains paperId',
    !afterBack.search.includes('paperId='),
    `search="${afterBack.search}"`,
  )
  step('21d. .pi-view is unmounted', !afterBack.piViewMounted)
  step('21d. workbench .app-shell is mounted', afterBack.appShellMounted)
  step(
    '21e. localStorage assembly-basket-v1 is preserved after return-to-workbench',
    afterBack.basketLocal === basketLocalBefore,
    `before="${basketLocalBefore?.slice(0, 40)}…" after="${afterBack.basketLocal?.slice(0, 40)}…"`,
  )

  await shot(page, '04-final')
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
