// 走查卡点 4（第四节第 4 条）：「PDF 版本」里用不了的版本照样列出、置灰、写一行原因。
// WALK_MODE=before 拍改之前（原生下拉框，选了才报错）；WALK_MODE=after 拍改之后（菜单 + 原因，键盘走一遍）。
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

process.env.INVENTORY_PORT_OFFSET = '50'
const MODE = process.env.WALK_MODE === 'before' ? 'before' : 'after'
const ROOT = '/home/user/english-question-bank'
const INV = path.join(ROOT, 'scripts/component-inventory')
const { startRig } = await import(pathToFileURL(path.join(INV, 'rig.mjs')).href)
const { login, settle, sleep } = await import(pathToFileURL(path.join(INV, 'scenarios.mjs')).href)
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')

const OUT = path.join(ROOT, 'design/ux-2026-11-14/find-compose-export/fix-pdf-versions')
mkdirSync(OUT, { recursive: true })
const record = { mode: MODE, steps: [] }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const shot = (name) => page.screenshot({ path: path.join(OUT, name) })

const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
let page
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
  page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })
  const net = []
  page.on('request', (r) => { if (/pdf-editions|\/pagination/.test(r.url())) r._t0 = Date.now() })
  page.on('requestfinished', async (r) => { if (r._t0) net.push({ url: r.url().replace(rig.base, '').slice(0, 100), ms: Date.now() - r._t0, status: (await r.response())?.status() }) })

  await login(page, rig.base)
  // 草稿卷放 A、C、D 三篇阅读（测试库没有听力，没有审过的参考答案）。
  await page.evaluate(async () => {
    const d = await (await fetch('/api/draft-papers/current?create=1')).json()
    for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
    for (const g of ['group-2026-i-reading-a', 'group-2026-i-reading-c', 'group-2026-i-reading-d'])
      await fetch('/api/draft-papers/current/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ groupId: g }) })
  })
  // 接口直接读一遍各版本能不能用（改之后才有这个接口）。
  record.editionsApi = await page.evaluate(async () => {
    const d = await (await fetch('/api/draft-papers/current')).json()
    const r = await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/pdf-editions`)
    return { status: r.status, body: await r.json().catch(() => null) }
  })
  log('pdf-editions', JSON.stringify(record.editionsApi))

  await page.goto(rig.base + '/?view=draft-paper')
  await page.locator('.draft-a4-sheet iframe').waitFor({ timeout: 300000 })
  await settle(page, 1500)
  await page.mouse.move(2, 898)

  if (MODE === 'before') {
    const select = page.locator('.draft-topbar-wide-toggle select[aria-label="PDF 版本"]')
    record.options = await select.evaluate((s) => [...s.options].map((o) => ({ value: o.value, text: o.text, disabled: o.disabled })))
    log('options', record.options)
    await shot('before-01-顶栏原生下拉框.png')
    // 原生下拉框展开后的列表无头浏览器画不出来；把它临时撑成列表框拍一下里面有什么（只改这一次截图的 DOM）。
    await select.evaluate((s) => { s.dataset.walkSize = '1'; s.size = s.options.length })
    await page.locator('.draft-topbar-wide-toggle').first().screenshot({ path: path.join(OUT, 'before-02-四个版本看起来都能选.png') })
    await select.evaluate((s) => { s.removeAttribute('size') })
    await select.selectOption('answerOnly')
    await page.waitForFunction(() => /纯答案版不可用/.test(document.body.innerText), null, { timeout: 120000 })
    await settle(page, 800)
    record.steps.push({ what: '选纯答案版', text: (await page.locator('.draft-a4-empty, .draft-error').allInnerTexts()).map((s) => s.trim()) })
    await shot('before-03-选了纯答案版才报错.png')
    await select.selectOption('largeComplete')
    await page.waitForFunction(() => /没成功|需要/.test(document.querySelector('.draft-a4-empty')?.innerText || ''), null, { timeout: 120000 }).catch(() => {})
    await settle(page, 800)
    record.steps.push({ what: '选大字完整版', text: (await page.locator('.draft-a4-empty, .draft-error').allInnerTexts()).map((s) => s.trim()) })
    await shot('before-04-选了大字完整版才报错.png')
  } else {
    const trigger = page.locator('.draft-topbar-wide-toggle .draft-product-trigger')
    await shot('after-01-顶栏版本键.png')
    // 鼠标打开
    await trigger.click()
    await page.locator('.draft-product-menu').waitFor()
    await sleep(300)
    record.menu = await page.locator('.draft-product-menu .eqb-menu-item').evaluateAll((items) => items.map((e) => ({
      text: e.innerText.trim().replace(/\s+/g, ' '), role: e.getAttribute('role'), checked: e.getAttribute('aria-checked'),
      disabled: e.getAttribute('aria-disabled'), describedBy: e.getAttribute('aria-describedby') && document.getElementById(e.getAttribute('aria-describedby'))?.innerText,
    })))
    log('menu', record.menu)
    await shot('after-02-打开版本菜单.png')
    // 点置灰项：不选中、菜单不关
    await page.locator('.draft-product-menu .eqb-menu-item[aria-disabled="true"]').first().click({ force: true })
    await sleep(300)
    record.steps.push({ what: '点置灰项', menuStillOpen: await page.locator('.draft-product-menu').isVisible(), trigger: (await trigger.innerText()).trim() })
    await page.keyboard.press('Escape')
    await sleep(300)
    record.steps.push({ what: 'Esc', menuOpen: await page.locator('.draft-product-menu').isVisible().catch(() => false), focus: await page.evaluate(() => document.activeElement?.className + ' ' + document.activeElement?.textContent?.trim()) })

    // 键盘：Tab 焦点在触发键上，回车打开，↓ 走（置灰项跳过），回车选中，再开，Esc 关
    await trigger.focus()
    await page.keyboard.press('Enter')
    await page.locator('.draft-product-menu').waitFor()
    await sleep(300)
    const focused = () => page.evaluate(() => (document.activeElement?.querySelector('.eqb-menu-item-label')?.textContent || document.activeElement?.textContent || '').trim())
    const walk = [await focused()]
    for (let i = 0; i < 4; i += 1) { await page.keyboard.press('ArrowDown'); walk.push(await focused()) }
    record.steps.push({ what: '回车打开后 ↓ 四次，焦点依次落在', walk })
    log('keyboard walk', walk)
    // 停在「省纸版」上拍一张
    while ((await focused()) !== '省纸版') await page.keyboard.press('ArrowDown')
    await shot('after-03-键盘走到省纸版.png')
    await page.keyboard.press('Enter')
    await sleep(500)
    record.steps.push({ what: '回车选中省纸版', trigger: (await trigger.innerText()).trim(), focusOnTrigger: await trigger.evaluate((e) => e === document.activeElement) })
    await page.keyboard.press('Enter')
    await page.locator('.draft-product-menu').waitFor()
    await sleep(300)
    await shot('after-04-再打开-勾在省纸版.png')
    await page.keyboard.press('Escape')
    await sleep(300)
    record.steps.push({ what: '再开后 Esc', menuOpen: await page.locator('.draft-product-menu').isVisible().catch(() => false), focusOnTrigger: await trigger.evaluate((e) => e === document.activeElement) })
    await shot('after-05-Esc关上-焦点回版本键.png')

    // 390 宽：版本在「⋯」面板里
    await page.setViewportSize({ width: 390, height: 844 })
    await sleep(800)
    await page.locator('.draft-more-menu-trigger').click()
    await sleep(400)
    await page.locator('.draft-more-menu-narrow-controls .draft-product-trigger').click()
    await page.locator('.draft-product-menu').waitFor()
    await sleep(300)
    await shot('after-06-390宽-面板里打开版本菜单.png')
    await page.keyboard.press('Escape')
    await sleep(300)
    record.steps.push({ what: '390 宽 Esc', menuOpen: await page.locator('.draft-product-menu').isVisible().catch(() => false), morePanelOpen: await page.locator('.draft-more-menu-trigger').getAttribute('aria-expanded') })
  }
  record.network = net
  record.errors = errors
} finally {
  writeFileSync(path.join(OUT, `walk-${MODE}.json`), JSON.stringify(record, null, 2))
  await browser.close()
  await rig.stop()
}
process.exit(0)
