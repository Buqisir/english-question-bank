// 共用 Menu：禁用项也能停焦点（Owner 2026-11-14 定的「两个小事」之一）。
// WALK_MODE=before 拍改之前（方向键跳过禁用项），WALK_MODE=after 拍改之后。
// 站上所有用到 Menu 的菜单各用键盘走一遍：回车打开 → 记第一个焦点 → ↓ 走一圈多一步 → Home → End → ↑
// → 首字母跳转 → 走到禁用项上按回车、空格、点一下（看菜单关没关、有没有发改动请求）→ Esc（焦点回不回触发键）。
// 每一步焦点项的 role / name / description / disabled 用 CDP Accessibility.getPartialAXTree 量。
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

process.env.INVENTORY_PORT_OFFSET = '54'
const MODE = process.env.WALK_MODE === 'before' ? 'before' : 'after'
const ROOT = '/home/user/english-question-bank'
const INV = path.join(ROOT, 'scripts/component-inventory')
const { startRig } = await import(pathToFileURL(path.join(INV, 'rig.mjs')).href)
const { login, settle, sleep } = await import(pathToFileURL(path.join(INV, 'scenarios.mjs')).href)
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')

const OUT = path.join(ROOT, 'design/ux-2026-11-14/find-compose-export/fix-menu-disabled')
mkdirSync(OUT, { recursive: true })
const record = { mode: MODE, menus: [] }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
let page, cdp
let shotNo = 0

// 焦点项在读屏树里的样子
async function ax() {
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.activeElement' })
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false })
  const n = nodes.find((x) => !x.ignored) || nodes[0]
  const prop = (k) => n.properties?.find((p) => p.name === k)?.value?.value
  const out = { role: n.role?.value, name: n.name?.value }
  if (n.description?.value) out.description = n.description.value
  if (prop('disabled') !== undefined) out.disabled = prop('disabled')
  if (prop('checked') !== undefined) out.checked = prop('checked')
  return out
}

const key = async (k) => { await page.keyboard.press(k); await sleep(120) }
// 首字母跳转：CDP 直接发一个 key 为这个字的按键（中文菜单项，输入法打不出单个 keydown，这里模拟）。
async function typeChar(ch) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
  await sleep(120)
}

async function clipShot(name, locators) {
  const boxes = []
  for (const l of locators) { const b = await l.boundingBox().catch(() => null); if (b) boxes.push(b) }
  const vp = page.viewportSize()
  const pad = 24
  let clip
  if (boxes.length) {
    const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad)
    const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
    const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad)
    const y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad)
    clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  }
  shotNo += 1
  const file = `${MODE}-${String(shotNo).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: path.join(OUT, file), clip })
  return file
}

// 改动请求计数：禁用项上按回车 / 空格 / 点击时，不该发任何非 GET 的接口请求
let mutations = 0
const menuLoc = () => page.locator('.eqb-menu')
const menuOpen = async () => (await menuLoc().count()) > 0 && (await menuLoc().isVisible().catch(() => false))

async function walkMenu(id, trigger, opts) {
  try { return await walkMenuInner(id, trigger, opts) } catch (error) {
    const file = await clipShot(`${id}-出错`, []).catch(() => null)
    log(id, 'ERROR', String(error).slice(0, 300))
    record.menus.push({ id, error: String(error).slice(0, 500), shot: file, menuOpen: await menuOpen(), active: await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200)) })
    await key('Escape')
  }
}

async function walkMenuInner(id, trigger, { typeahead } = {}) {
  const r = { id, steps: [] }
  await trigger.scrollIntoViewIfNeeded()
  await sleep(800) // 等滚动停下：Menu 开着时外面一滚就关
  await trigger.focus()
  await sleep(300)
  r.triggerText = (await trigger.innerText()).trim()
  await key('Enter')
  await menuLoc().waitFor({ timeout: 10000 })
  await sleep(300)
  r.items = await page.locator('.eqb-menu .eqb-menu-item').evaluateAll((items) => items.map((e) => ({
    label: (e.querySelector('.eqb-menu-item-label')?.textContent || '').trim(),
    tag: e.tagName.toLowerCase(),
    role: e.getAttribute('role'),
    ariaDisabled: e.getAttribute('aria-disabled'),
    disabledAttr: e.hasAttribute('disabled'),
    note: e.getAttribute('aria-describedby') ? document.getElementById(e.getAttribute('aria-describedby'))?.textContent : undefined,
  })))
  const n = r.items.length
  r.steps.push({ key: '(打开)', focus: await ax() })
  r.shotOpen = await clipShot(`${id}-打开`, [trigger, menuLoc()])
  for (let i = 0; i < n + 1; i += 1) { await key('ArrowDown'); r.steps.push({ key: 'ArrowDown', focus: await ax() }) }
  await key('Home'); r.steps.push({ key: 'Home', focus: await ax() })
  await key('End'); r.steps.push({ key: 'End', focus: await ax() })
  await key('ArrowUp'); r.steps.push({ key: 'ArrowUp', focus: await ax() })
  if (typeahead) {
    await key('Home')
    for (const ch of typeahead) { await typeChar(ch); r.steps.push({ key: `首字「${ch}」`, focus: await ax() }) }
  }
  // 走到第一个禁用项（最多走一圈）
  const disabledIdx = r.items.findIndex((it) => it.ariaDisabled === 'true')
  if (disabledIdx >= 0) {
    await key('Home')
    let reached = false
    for (let i = 0; i <= n; i += 1) {
      if (await page.evaluate(() => document.activeElement?.getAttribute('aria-disabled') === 'true')) { reached = true; break }
      await key('ArrowDown')
    }
    r.disabledReachable = reached
    if (reached) {
      const on = await ax()
      r.shotDisabledFocus = await clipShot(`${id}-焦点在禁用项`, [trigger, menuLoc()])
      const before = mutations
      await key('Enter')
      r.enterOnDisabled = { menuOpen: await menuOpen(), focus: await ax(), was: on.name }
      await key('Space')
      r.spaceOnDisabled = { menuOpen: await menuOpen(), focus: await ax() }
      await sleep(300)
      r.mutationsFromDisabledKeys = mutations - before
    }
    const before = mutations
    r.menuOpenBeforeClickTest = await menuOpen()
    // 焦点留在触发键上时（改之前全禁用的菜单），方向键会滚页面，滚动会把菜单关掉；点击测试前重新打开。
    if (!r.menuOpenBeforeClickTest) { await trigger.click(); await menuLoc().waitFor({ timeout: 10000 }); await sleep(300) }
    await page.locator('.eqb-menu .eqb-menu-item[aria-disabled="true"]').first().click({ force: true })
    await sleep(300)
    r.clickOnDisabled = { menuOpen: await menuOpen(), mutations: mutations - before, triggerText: (await trigger.innerText()).trim() }
  }
  await key('Escape')
  await sleep(250)
  r.escape = { menuOpen: await menuOpen(), focusOnTrigger: await trigger.evaluate((e) => e === document.activeElement) }
  // 再开一次，Tab 关
  await key('Enter'); await menuLoc().waitFor({ timeout: 10000 }); await sleep(200)
  await key('Tab'); await sleep(250)
  r.tab = { menuOpen: await menuOpen(), focusOnTrigger: await trigger.evaluate((e) => e === document.activeElement) }
  log(id, JSON.stringify({ first: r.steps[0].focus, disabledReachable: r.disabledReachable, enter: r.enterOnDisabled, click: r.clickOnDisabled, esc: r.escape }))
  record.menus.push(r)
  return r
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
  page = await context.newPage()
  cdp = await context.newCDPSession(page)
  await cdp.send('Accessibility.enable')
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })
  page.on('request', (r) => { if (r.url().includes('/api/') && r.method() !== 'GET') mutations += 1 })

  await login(page, rig.base)
  const setDraft = (groups) => page.evaluate(async (gs) => {
    const d = await (await fetch('/api/draft-papers/current?create=1')).json()
    for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
    for (const g of gs) await fetch('/api/draft-papers/current/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ groupId: g }) })
  }, groups)

  // 1. 草稿卷：A、C、D 三篇阅读（测试库没有听力、没有审过的答案 → PDF 版本里两个置灰）
  await setDraft(['group-2026-i-reading-a', 'group-2026-i-reading-c', 'group-2026-i-reading-d'])
  await page.goto(rig.base + '/?view=draft-paper')
  await page.locator('.draft-a4-sheet iframe').waitFor({ timeout: 300000 })
  await settle(page, 1500)
  await page.mouse.move(2, 898)
  mutations = 0

  const versionTrigger = page.locator('.draft-topbar-wide-toggle .draft-product-trigger')
  await walkMenu('PDF版本', versionTrigger, { typeahead: ['大', '大', '纯', '省'] })
  const exportTrigger = page.locator('header.topbar').getByRole('button', { name: '导出', exact: true })
  await walkMenu('导出', exportTrigger, { typeahead: ['保'] })
  const groupMenus = page.locator('.draft-group-actions').getByRole('button', { name: '更多题组操作', exact: true })
  await walkMenu('题组⋯-第一组', groupMenus.first(), { typeahead: ['移'] })
  await walkMenu('题组⋯-最后一组', groupMenus.last(), { typeahead: ['上'] })

  // 2. 空草稿卷：导出三项全禁用、PDF 版本四项全禁用
  await setDraft([])
  await page.goto(rig.base + '/?view=draft-paper')
  await page.getByText('还没有题组').first().waitFor({ timeout: 30000 })
  await settle(page, 1500)
  await page.mouse.move(2, 898)
  await walkMenu('空草稿-导出', page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }))
  await walkMenu('空草稿-PDF版本', page.locator('.draft-topbar-wide-toggle .draft-product-trigger'))

  // 3. 首页结果行「⋯」
  await page.goto(rig.base + '/')
  await settle(page, 1500)
  const intent = page.locator('.concierge-intent-input')
  await intent.fill('2026 阅读'); await intent.press('Enter')
  await page.locator('.concierge-group-row-menu-trigger').first().waitFor({ timeout: 30000 })
  await settle(page, 1500)
  await page.mouse.move(2, 898)
  await walkMenu('首页结果行⋯', page.locator('.concierge-group-row-menu-trigger').first(), { typeahead: ['详'] })

  // 4. 题组详情「更多操作」（owner 且能编辑时才有）
  await page.goto(rig.base + '/?view=detail&groupId=group-2026-i-reading-a')
  await settle(page, 2500)
  const detailTrigger = page.locator('.peek-actions-menu button')
  if (await detailTrigger.count()) await walkMenu('详情更多操作', detailTrigger.first(), { typeahead: ['删'] })
  else record.menus.push({ id: '详情更多操作', skipped: '这份测试数据的详情页没有「更多操作」（不是 owner 视图或不能编辑）' })

  // 5. 个人空间行「⋯」：测试库里没有存过的 PDF，GET /api/my-space 换成一份假数据（只读，不点删除）
  await page.route(/\/api\/my-space(\?.*)?$/, (route) => route.request().method() === 'GET'
    ? route.fulfill({ json: { folders: [], artifacts: [{ id: 'walk-artifact', folderId: null, title: '走查用的假文件', fileName: 'walk.pdf', fileUrl: '/user-space/files/walk.pdf', artifactType: 'student-paper', sourceDraftPaperId: 'x', sourceDraftTitle: '草稿', sourceDraftStudentLabel: '', sourceDraftExists: false, pageCount: 2, generatedAt: '2026-11-14T00:00:00Z', createdAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z' }] } })
    : route.continue())
  await page.goto(rig.base + '/?view=my-space')
  await settle(page, 2000)
  const spaceTrigger = page.locator('.my-space-row-menu-trigger')
  if (await spaceTrigger.count()) await walkMenu('个人空间行⋯', spaceTrigger.first(), { typeahead: ['删'] })
  else record.menus.push({ id: '个人空间行⋯', skipped: '没找到行菜单触发键' })

  record.errors = errors
} finally {
  writeFileSync(path.join(OUT, `walk-${MODE}.json`), JSON.stringify(record, null, 2))
  await browser.close()
  await rig.stop()
}
process.exit(0)
