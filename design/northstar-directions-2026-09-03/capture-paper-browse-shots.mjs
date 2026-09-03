import { chromium } from '/Users/huangxuewei/Projects/wt-ui-northstar-20260903/app/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const shots = join(dir, 'shots')
mkdirSync(shots, { recursive: true })

const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`
const baseUrl = 'http://127.0.0.1:5199'
const paperId = 'paper-mock-gd-2026-m1'

const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})

async function ensureLoggedIn() {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  if (await page.locator('.login-page').count()) {
    await page.fill('#login-username', 'qa-ui')
    await page.fill('#login-password', 'qa-ui-2026')
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('.login-submit'),
    ])
  }
}

async function openPaperBrowse() {
  await page.goto(`${baseUrl}/?view=paper-browse&paperId=${paperId}`, {
    waitUntil: 'networkidle',
  })
  await page.locator('.paper-browse-shell').waitFor({ timeout: 30000 })
  await page.waitForTimeout(500)
}

async function waitForRailBar() {
  await page.locator('.paper-browse-rail-active-bar').waitFor({ timeout: 10000 })
  await page.waitForTimeout(300)
}

await ensureLoggedIn()
await openPaperBrowse()

await page.evaluate(() => window.scrollTo(0, 0))
await waitForRailBar()
await page.screenshot({ path: join(shots, 'pb2-pick-top.png') })

const railGroups = page.locator('.paper-browse-rail-group')
const groupCount = await railGroups.count()
const midIndex = Math.max(0, Math.floor(groupCount / 2))
await railGroups.nth(midIndex).click()
await waitForRailBar()
await page.screenshot({ path: join(shots, 'pb2-pick-mid.png') })

let addError = null
try {
  const addButtons = page.locator('.paper-browse-gutter-add:not(.paper-browse-gutter-add--disabled):not(.paper-browse-gutter-add--in-draft)')
  const addCount = await addButtons.count()
  let added = 0
  for (let i = 0; i < addCount && added < 2; i += 1) {
    const button = addButtons.nth(i)
    const card = button.locator('xpath=ancestor::*[contains(@class,"paper-browse-group-card")]')
    await card.hover()
    await button.click({ timeout: 5000 })
    await page.waitForTimeout(600)
    added += 1
  }
} catch (error) {
  addError = error instanceof Error ? error.message : String(error)
}

if (addError) {
  console.error('ADD_ERROR:', addError)
}
await page.screenshot({ path: join(shots, 'pb2-pick-added.png') })

const sevenChoicesRail = page.locator('.paper-browse-rail-group', { hasText: /^七选五$/ })
await sevenChoicesRail.first().click()
await waitForRailBar()

await page.locator('.paper-browse-lecture-toggle').click()
await waitForRailBar()
// Docked lecture shrinks zoom and can reflow scroll — re-anchor 七选五 in compact rail.
await page.locator('.paper-browse-rail-group', { hasText: '七' }).first().click()
await waitForRailBar()
await page.screenshot({ path: join(shots, 'pb2-lecture.png') })

await page.locator('.paper-browse-rail-group', { hasText: '语法' }).first().click()
await page.locator('.paper-browse-rail-group--active .paper-browse-rail-group-title', { hasText: '语法' }).waitFor({ timeout: 5000 })
await page.waitForTimeout(300)
await page.screenshot({ path: join(shots, 'pb2-lecture-scrolled.png') })

const zoom = await page.locator('.paper-browse-content').evaluate((node) => {
  return getComputedStyle(node).getPropertyValue('--paper-screen-zoom').trim()
})
console.log('LECTURE_ZOOM:', zoom || 'unknown')

const rail = page.locator('.paper-browse-rail')
const railBox = await rail.boundingBox()
if (railBox) {
  await page.screenshot({
    path: join(shots, 'pb2-rail-crop.png'),
    clip: {
      x: railBox.x,
      y: railBox.y,
      width: Math.min(railBox.width * 3, 1440 - railBox.x),
      height: railBox.height,
    },
  })
}

await browser.close()
console.log('wrote pb2 shots to', shots)
