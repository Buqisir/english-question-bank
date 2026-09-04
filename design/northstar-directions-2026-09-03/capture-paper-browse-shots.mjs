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

async function waitForRailHand() {
  await page.locator('.paper-browse-rail-hand').waitFor({ timeout: 10000 })
  await page.waitForFunction(() => {
    const svg = document.querySelector('.paper-browse-rail-hand svg')
    return svg?.getAttribute('viewBox') === '0 0 16 18'
  }, { timeout: 15000 })
  await page.waitForTimeout(500)
}

await ensureLoggedIn()
await openPaperBrowse()

const railGroups = page.locator('.paper-browse-rail-group')
const groupCount = await railGroups.count()
const midIndex = Math.max(0, Math.floor(groupCount / 2))
await railGroups.nth(midIndex).click()
await waitForRailHand()
await page.screenshot({ path: join(shots, 'pb3-pick-mid.png') })

const rail = page.locator('.paper-browse-rail')
const railBox = await rail.boundingBox()
if (railBox) {
  await page.screenshot({
    path: join(shots, 'pb3-rail-crop.png'),
    clip: {
      x: railBox.x,
      y: railBox.y,
      width: Math.min(railBox.width * 3, 1440 - railBox.x),
      height: railBox.height,
    },
  })
}

await page.locator('.paper-browse-lecture-toggle').click()
await waitForRailHand()
await page.locator('.paper-browse-rail-group', { hasText: '七' }).first().click()
await waitForRailHand()
await page.screenshot({ path: join(shots, 'pb3-lecture.png') })

await browser.close()
console.log('wrote pb3 shots to', shots)
