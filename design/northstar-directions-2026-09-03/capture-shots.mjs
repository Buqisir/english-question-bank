import { chromium } from '/Users/huangxuewei/Projects/wt-ui-northstar-20260903/app/node_modules/playwright/index.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unlinkSync } from 'node:fs'

const dir = dirname(fileURLToPath(import.meta.url))
const html = pathToFileURL(join(dir, 'northstar.html')).href
const shots = join(dir, 'shots')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const visibleRow = 'body[data-screen="home"] .date-feed .paper-row, body[data-screen="browse"] .year-groups .paper-row'
for (const hash of ['home', 'browse']) {
  await page.goto('about:blank')
  await page.goto(`${html}#${hash}`, { waitUntil: 'networkidle' })
  await page.locator(visibleRow).first().waitFor()
  await page.screenshot({ path: join(shots, `${hash}.png`) })
}

await page.goto('about:blank')
await page.goto(`${html}#browse`, { waitUntil: 'networkidle' })
await page.locator(visibleRow).first().waitFor()
const row = page.locator('body[data-screen="browse"] .year-groups .year-group:first-child .paper-row').first()
await row.scrollIntoViewIfNeeded()
await row.hover()
await page.waitForTimeout(200)
await page.screenshot({ path: join(shots, 'browse-hover.png') })
await browser.close()

for (const stale of [
  'home-1.png', 'home-2.png', 'browse-1.png', 'browse-2.png',
  'browse-1-hover.png', 'browse-2-hover.png',
]) {
  try { unlinkSync(join(shots, stale)) } catch { /* gone */ }
}

console.log('wrote shots: home.png, browse.png, browse-hover.png')
