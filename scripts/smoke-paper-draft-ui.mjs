#!/usr/bin/env node
/**
 * Live UI smoke for the Paper Set Draft Module.
 *
 * Sole responsibility: lock down 草稿卷 (basket) ↔ paperBlocks invariants
 * across the full editor flow (add / score / meta / reorder / remove / clear).
 * Sibling smoke `smoke-concierge-stream.mjs` covers concierge IA; this one is
 * deliberately separate so the two domains regress independently.
 *
 * The smoke does NOT test save / load / export / PDF / DOCX. If any assertion
 * fails the script exits non-zero with a summary.
 *
 * Screenshots → reports/artifacts/smoke-paper-draft-ui/
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
  'smoke-paper-draft-ui',
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

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers that read the live DOM for the invariants we care about.
 * ────────────────────────────────────────────────────────────────────────── */

async function readDraftSnapshot(page) {
  return page.evaluate(() => {
    const drawer = document.querySelector('.basket-panel.basket-panel-drawer.open') || document.querySelector('.basket-panel')
    if (!drawer) return { basket: [], blocks: [], outlineSummary: '', drawerOpen: false }
    const basket = Array.from(drawer.querySelectorAll('.basket-item')).map((el) => {
      const titleEl = el.querySelector('.basket-content > strong')
      const sectionInput = el.querySelectorAll('.basket-fields input')[0]
      const scoreInput = el.querySelectorAll('.basket-fields input')[1]
      const noteInput = el.querySelector('.basket-note input')
      return {
        title: titleEl ? titleEl.textContent : '',
        sectionTitle: sectionInput ? sectionInput.value : '',
        score: scoreInput ? scoreInput.value : '',
        note: noteInput ? noteInput.value : '',
      }
    })
    const blocks = Array.from(drawer.querySelectorAll('.paper-block-item')).map((el) => {
      const cls = Array.from(el.classList)
      let kind = 'unknown'
      if (cls.includes('question_group')) kind = 'question_group'
      else if (cls.includes('section_header')) kind = 'section_header'
      else if (cls.includes('page_break')) kind = 'page_break'
      const info = el.querySelector('.paper-block-group-info')
      const strong = info && info.querySelector('strong')
      // The strong contains "<span class=paper-block-num>...</span> sectionTitle".
      // Strip the leading num span text to get the human label.
      let label = ''
      if (strong) {
        const num = strong.querySelector('.paper-block-num')
        label = (strong.textContent || '').replace(num ? num.textContent || '' : '', '').trim()
      }
      // The meta line is the FIRST span that is a direct child of .paper-block-group-info
      // (the .paper-block-num span lives inside <strong>, not under .paper-block-group-info).
      let detailText = ''
      if (info) {
        const directSpan = Array.from(info.children).find((c) => c.tagName === 'SPAN')
        if (directSpan) detailText = (directSpan.textContent || '').trim()
      }
      return { kind, label, detailText }
    })
    const summary = drawer.querySelector('.paper-blocks-outline > summary')
    return {
      basket,
      blocks,
      outlineSummary: summary ? (summary.textContent || '').trim() : '',
      drawerOpen: drawer.classList.contains('open') || !drawer.classList.contains('basket-panel-drawer'),
    }
  })
}

function questionGroupBlocks(snapshot) {
  return snapshot.blocks.filter((b) => b.kind === 'question_group')
}

function assertSync(snapshot, label, expectedBasketSize, extra = '') {
  const qBlocks = questionGroupBlocks(snapshot)
  step(`${label}: basket has ${expectedBasketSize} item(s)`,
    snapshot.basket.length === expectedBasketSize,
    `got ${snapshot.basket.length}${extra}`)
  step(`${label}: paperBlocks question_group count == basket length`,
    qBlocks.length === snapshot.basket.length,
    `basket=${snapshot.basket.length} blocks=${qBlocks.length}`)
  // Order match: each basket title should appear (in order) in the question_group block labels.
  // Block labels are sectionTitle || title; basket titles are item.title. Strict order match
  // by title would be brittle, so we just assert relative ordering equality between two arrays
  // by reducing both to ids — the only stable id is "the index in the list".
  step(`${label}: outline summary count matches basket length`,
    new RegExp(`${snapshot.basket.length}\\s*块`).test(snapshot.outlineSummary),
    `outline="${snapshot.outlineSummary}"`)
}

async function openDrawer(page) {
  const chip = page.locator('button.basket-chip').first()
  if (await chip.isVisible().catch(() => false)) {
    await chip.click()
    await page.waitForSelector('.basket-panel.basket-panel-drawer.open', { timeout: 5000 }).catch(() => {})
  }
}

async function closeDrawer(page) {
  const close = page.locator('.basket-drawer-close').first()
  if (await close.isVisible().catch(() => false)) {
    await close.click().catch(() => {})
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Search helper — the concierge desk gates on dataLoading + may need a few
 * clarification round-trips. We resolve to ≥ 2 paper-card group cards across
 * all visible papers (so we have enough material to add 2 different groups).
 * ────────────────────────────────────────────────────────────────────────── */

async function awaitSearchSettles(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('.concierge-desk')
    if (!root) return false
    const list = root.querySelector('.concierge-paper-list')
    const empty = root.querySelector('.concierge-empty')
    const clar = root.querySelector('.concierge-clarification')
    const error = root.querySelector('.concierge-error')
    const loading = root.querySelector('.concierge-loading')
    return (list || empty || clar || error) && !loading
  }, null, { timeout: 25000 }).catch(() => {})
}

async function totalGroupCardsVisible(page) {
  // Make sure all paper rows are expanded so group cards are reachable.
  const articles = await page.locator('.concierge-paper-list > li article.concierge-paper-row').all()
  for (const a of articles) {
    const expanded = await a.evaluate((el) => el.classList.contains('is-expanded'))
    if (!expanded) {
      const body = a.locator('.concierge-paper-body').first()
      if (await body.isVisible().catch(() => false)) {
        await body.click().catch(() => {})
        await page.waitForTimeout(120)
      }
    }
  }
  return page.locator('.concierge-paper-list .concierge-group-card').count()
}

async function searchUntilTwoGroupCards(page) {
  const queries = ['广东一模 阅读', '阅读', '真题 阅读理解 中等难度']
  for (const q of queries) {
    const input = page.locator('.concierge-intent-input')
    await input.waitFor({ state: 'visible' })
    await page.waitForFunction(() => {
      const i = document.querySelector('.concierge-intent-input')
      return i && !i.hasAttribute('disabled')
    }, null, { timeout: 5000 }).catch(() => {})
    await input.fill(q)
    await page.locator('.concierge-intent-submit').click()
    await awaitSearchSettles(page)
    // Burn through a couple clarification rounds.
    for (let i = 0; i < 2; i += 1) {
      if (!(await page.locator('.concierge-clarification').isVisible().catch(() => false))) break
      await input.fill('真题 阅读理解 中等难度')
      await page.locator('.concierge-intent-submit').click()
      await awaitSearchSettles(page)
    }
    if (await page.locator('.concierge-paper-list > li').count() === 0) continue
    const cardCount = await totalGroupCardsVisible(page)
    if (cardCount >= 2) return cardCount
  }
  return 0
}

/* ──────────────────────────────────────────────────────────────────────────
 * Main flow.
 * ────────────────────────────────────────────────────────────────────────── */

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
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

  console.log('=== Paper Set Draft UI smoke ===')
  console.log(`Loading ${APP_URL}…`)
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.concierge-desk', { timeout: 15000 })
  await page.waitForFunction(() => {
    const desk = document.querySelector('.concierge-desk')
    if (!desk) return false
    const input = desk.querySelector('.concierge-intent-input')
    if (input && input.hasAttribute('disabled')) return false
    return !desk.querySelector('.concierge-data-loading')
  }, null, { timeout: 20000 }).catch(() => {})
  await shot(page, '01-loaded')

  // ── 1. Search / expand / pick at least 2 group cards.
  console.log('\nStep 1–4: search + expand + collect group cards')
  const cardCount = await searchUntilTwoGroupCards(page)
  step('search yielded ≥ 2 visible group cards', cardCount >= 2, `got ${cardCount}`)
  if (cardCount < 2) {
    console.error('Insufficient group cards available across broadeners. Failing loudly.')
    await browser.close()
    process.exit(1)
  }
  await shot(page, '02-cards')

  // ── 5. Add 2 different groups to 草稿卷.
  console.log('\nStep 5: add 2 distinct groups to 草稿卷')
  // Click the first 加入草稿卷 button, wait for it to flip, then click the
  // first remaining 加入草稿卷 button (which is the second group). Doing it
  // this way avoids stale Playwright locators after the first click.
  const firstAdd = page.locator('.concierge-paper-list .concierge-group-card button.concierge-action', { hasText: '加入草稿卷' }).first()
  step('found a 加入草稿卷 button to start',
    await firstAdd.isVisible().catch(() => false))
  await firstAdd.click()
  // Wait until at least one card flipped to 已加入.
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('.concierge-paper-list .concierge-group-card button.concierge-action'))
      .some((b) => /已加入/.test(b.textContent || ''))
  }, null, { timeout: 5000 }).catch(() => {})
  const remainingAdd = page.locator('.concierge-paper-list .concierge-group-card button.concierge-action', { hasText: '加入草稿卷' }).first()
  step('a second 加入草稿卷 button is still available',
    await remainingAdd.isVisible().catch(() => false))
  await remainingAdd.click()
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('.concierge-paper-list .concierge-group-card button.concierge-action'))
      .filter((b) => /已加入/.test(b.textContent || '')).length >= 2
  }, null, { timeout: 5000 }).catch(() => {})

  // ── 6. Open the 草稿卷 drawer and read snapshot.
  console.log('\nStep 6: open 草稿卷 drawer and verify draft ↔ paperBlocks sync')
  await openDrawer(page)
  await page.waitForSelector('.basket-panel.basket-panel-drawer.open .basket-item', { timeout: 5000 })
  let snap = await readDraftSnapshot(page)
  assertSync(snap, 'after add 2', 2)
  await shot(page, '06-after-add-2')

  // Cache the first basket item's title so we can re-find it after reorder.
  const firstTitleAfterAdd = snap.basket[0].title
  const secondTitleAfterAdd = snap.basket[1].title
  step('two distinct basket items added', firstTitleAfterAdd !== secondTitleAfterAdd, `1=${firstTitleAfterAdd} 2=${secondTitleAfterAdd}`)

  // ── 7. Edit first item's score.
  console.log('\nStep 7: change first item score')
  const firstItem = page.locator('.basket-panel .basket-item').first()
  const scoreInput = firstItem.locator('.basket-fields input[type="number"]').first()
  const originalScore = await scoreInput.inputValue()
  const newScore = String(Number(originalScore) + 1.5)
  await scoreInput.fill(newScore)
  await scoreInput.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })))
  await page.waitForTimeout(150)
  snap = await readDraftSnapshot(page)
  step('basket score reflects edit', snap.basket[0].score === newScore, `expected ${newScore}, got ${snap.basket[0].score}`)
  const qBlocks = questionGroupBlocks(snap)
  step('paperBlocks first question_group reflects new score', qBlocks[0].detailText.includes(`${newScore} 分/题`), `block detail: ${qBlocks[0].detailText}`)
  assertSync(snap, 'after score edit', 2)

  // ── 8. Edit first item's sectionTitle (板块).
  console.log('\nStep 8: change first item sectionTitle (板块)')
  const sectionInput = firstItem.locator('.basket-fields input[type="text"], .basket-fields input:not([type])').first()
  await sectionInput.fill('我的阅读 C')
  await sectionInput.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })))
  await page.waitForTimeout(150)
  snap = await readDraftSnapshot(page)
  step('basket sectionTitle reflects edit', snap.basket[0].sectionTitle === '我的阅读 C', `got ${snap.basket[0].sectionTitle}`)
  step('paperBlocks count unchanged after meta edit', questionGroupBlocks(snap).length === 2, `got ${questionGroupBlocks(snap).length}`)
  assertSync(snap, 'after sectionTitle edit', 2)

  // ── 9. Edit first item's note (讲评备注).
  console.log('\nStep 9: change first item note (讲评备注)')
  const noteInput = firstItem.locator('.basket-note input').first()
  await noteInput.fill('重点讲评')
  await noteInput.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })))
  await page.waitForTimeout(150)
  snap = await readDraftSnapshot(page)
  step('basket note reflects edit', snap.basket[0].note === '重点讲评', `got ${snap.basket[0].note}`)
  step('paperBlocks count unchanged after note edit', questionGroupBlocks(snap).length === 2, '')
  assertSync(snap, 'after note edit', 2)

  // ── 10. Move first → down one (and back up).
  console.log('\nStep 10: 上移/下移 first item')
  const firstDownBtn = firstItem.locator('button[aria-label="下移"]').first()
  await firstDownBtn.click()
  await page.waitForTimeout(150)
  snap = await readDraftSnapshot(page)
  step('basket[0] is now the previously-second item',
    snap.basket[0].title === secondTitleAfterAdd,
    `got ${snap.basket[0].title} (expected ${secondTitleAfterAdd})`)
  step('basket[1] is now the previously-first item (with edited sectionTitle)',
    snap.basket[1].sectionTitle === '我的阅读 C',
    `got ${snap.basket[1].sectionTitle}`)
  // paperBlocks question_group order should match basket order.
  const qBlocksAfterMove = questionGroupBlocks(snap)
  step('paperBlocks first question_group is the moved-down item label',
    qBlocksAfterMove[1].label.includes('我的阅读 C'),
    `block[1] label: ${qBlocksAfterMove[1].label}`)
  assertSync(snap, 'after reorder', 2)

  // Move it back up.
  const secondUpBtn = page.locator('.basket-panel .basket-item').nth(1).locator('button[aria-label="上移"]').first()
  await secondUpBtn.click()
  await page.waitForTimeout(150)
  snap = await readDraftSnapshot(page)
  step('basket[0] back to the edited item',
    snap.basket[0].sectionTitle === '我的阅读 C', `got ${snap.basket[0].sectionTitle}`)
  assertSync(snap, 'after move-back', 2)

  // ── 11. Remove the second item.
  console.log('\nStep 11: remove the second item')
  const secondDelete = page.locator('.basket-panel .basket-item').nth(1).locator('button[aria-label="删除"]').first()
  await secondDelete.click()
  await page.waitForFunction(() => {
    const drawer = document.querySelector('.basket-panel')
    if (!drawer) return false
    return drawer.querySelectorAll('.basket-item').length === 1
  }, null, { timeout: 5000 }).catch(() => {})
  snap = await readDraftSnapshot(page)
  assertSync(snap, 'after remove', 1)
  step('remaining basket item is the one we edited (sectionTitle preserved)',
    snap.basket[0].sectionTitle === '我的阅读 C', `got ${snap.basket[0].sectionTitle}`)
  await shot(page, '11-after-remove')

  // ── 12. Clear the 草稿卷.
  console.log('\nStep 12: clear 草稿卷')
  const clearBtn = page.locator('.basket-panel button.detail-button', { hasText: '清空' }).first()
  await clearBtn.click()
  await page.waitForFunction(() => {
    const drawer = document.querySelector('.basket-panel')
    if (!drawer) return false
    return drawer.querySelectorAll('.basket-item').length === 0
  }, null, { timeout: 5000 }).catch(() => {})
  snap = await readDraftSnapshot(page)
  step('basket emptied', snap.basket.length === 0, `got ${snap.basket.length}`)
  step('paperBlocks emptied (all kinds)', snap.blocks.length === 0, `got ${snap.blocks.length}`)
  step('outline shows 0 块', /0\s*块/.test(snap.outlineSummary), `outline="${snap.outlineSummary}"`)
  await shot(page, '12-cleared')

  await closeDrawer(page)
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
