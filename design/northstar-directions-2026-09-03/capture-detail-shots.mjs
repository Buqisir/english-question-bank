import { chromium } from '/Users/huangxuewei/Projects/wt-ui-northstar-20260903/app/node_modules/playwright/index.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const html = pathToFileURL(join(dir, 'detail.html')).href
const shots = join(dir, 'shots')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

async function gotoDetail() {
  await page.goto('about:blank')
  await page.goto(html, { waitUntil: 'networkidle' })
  await page.locator('.hero-title').waitFor()
}

await gotoDetail()
await page.screenshot({ path: join(shots, 'detail.png') })

await page.evaluate(() => window.__detailProto.setExpanded(true))
await page.waitForTimeout(150)
await page.screenshot({ path: join(shots, 'detail-expanded.png'), fullPage: true })

await gotoDetail()
await page.evaluate(() => window.__detailProto.setExpanded(true))
await page.waitForTimeout(150)
await page.evaluate(() => {
  const paper = document.querySelector('.paper-viewport')
  const rect = paper.getBoundingClientRect()
  const target = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2
  window.scrollTo(0, Math.max(0, target))
})
await page.waitForTimeout(150)
await page.screenshot({ path: join(shots, 'detail-expanded-mid.png') })

await gotoDetail()
await page.evaluate(() => window.__detailProto.openMenu())
await page.locator('.menu[data-open="true"]').waitFor()
await page.waitForTimeout(150)
await page.screenshot({ path: join(shots, 'detail-menu.png') })

await gotoDetail()
await page.evaluate(() => window.__detailProto.setInDraft(true))
await page.locator('#btn-add[aria-pressed="true"]').waitFor()
await page.waitForTimeout(150)
await page.screenshot({ path: join(shots, 'detail-added.png') })

await browser.close()
console.log('wrote shots: detail.png, detail-expanded.png, detail-expanded-mid.png, detail-menu.png, detail-added.png')
