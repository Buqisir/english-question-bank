// 走查第四节第 6 条：加入草稿卷之后的反馈全站一个写法，带撤回。
// WALK_MODE=before 拍改之前；WALK_MODE=after 拍改之后（含键盘、出错、量时间）。
// 四处：首页结果行、题组详情页、相似篇章面板（首页结果行「⋯」里打开）、整卷预览卷面旁的加入键。
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

process.env.INVENTORY_PORT_OFFSET = '51'
const MODE = process.env.WALK_MODE === 'before' ? 'before' : 'after'
const AFTER = MODE === 'after'
const ROOT = '/home/user/english-question-bank'
const INV = path.join(ROOT, 'scripts/component-inventory')
const { startRig } = await import(pathToFileURL(path.join(INV, 'rig.mjs')).href)
const { login, settle, sleep } = await import(pathToFileURL(path.join(INV, 'scenarios.mjs')).href)
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')

const OUT = path.join(ROOT, 'design/ux-2026-11-14/find-compose-export/fix-added')
mkdirSync(OUT, { recursive: true })
const record = { mode: MODE, places: {}, keyboard: {}, errors: {}, timings: [] }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
let page
const shotOf = (loc, name, pad = 12) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  .then((r) => page.screenshot({ path: path.join(OUT, name), clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(r.w + pad * 2, 1440), height: r.h + pad * 2 } }))
const full = (name) => page.screenshot({ path: path.join(OUT, name) })

// 加入键在每处的选择器（改之前各处各写各的，改之后都是 [data-draft-add]）
const SEL = AFTER
  ? { row: '[data-draft-add]', detail: '.peek-actions [data-draft-add]', similar: '.similar-btn[data-draft-add]', gutter: '[data-draft-add]' }
  : { row: '.concierge-action-add', detail: '.peek-add', similar: '.similar-btn:not([disabled])', gutter: '.paper-browse-gutter-add' }

async function resetDraft() {
  await page.evaluate(async () => {
    const d = await (await fetch('/api/draft-papers/current?create=1')).json()
    for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
  })
}
async function draftGroups() {
  return page.evaluate(async () => ((await (await fetch('/api/draft-papers/current')).json()).draftPaper?.items || []).map((i) => i.groupId))
}
async function home() {
  await page.goto(rig.base + '/'); await page.locator('.concierge-intent-input').waitFor({ timeout: 30000 }); await settle(page, 1200)
  const i = page.locator('.concierge-intent-input'); await i.fill('2026 阅读'); await i.press('Enter')
  await page.locator('.concierge-group-row').first().waitFor({ timeout: 15000 }); await settle(page, 1200)
  await page.mouse.move(2, 898)
}
// 点下去到「已加入」出现（改之后还量「加入中…」第一次出现）；在页面里用 MutationObserver 计时。
async function timedClick(target, container, doneRe, label) {
  await container.evaluate((root, src) => {
    const re = new RegExp(src)
    window.__walkT = { click: null, busy: null, done: null }
    document.addEventListener('pointerdown', () => { window.__walkT.click ??= performance.now() }, { capture: true, once: true })
    document.addEventListener('keydown', () => { window.__walkT.click ??= performance.now() }, { capture: true, once: true })
    const obs = new MutationObserver(() => {
      const t = root.innerText
      if (window.__walkT.click != null && window.__walkT.busy == null && /加入中…|撤回中…/.test(t)) window.__walkT.busy = performance.now()
      if (window.__walkT.click != null && re.test(t)) { window.__walkT.done = performance.now(); obs.disconnect() }
    })
    obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true })
  }, doneRe.source)
  await target()
  await page.waitForFunction(() => window.__walkT?.done != null, null, { timeout: 30000 }).catch(() => {})
  const t = await page.evaluate(() => window.__walkT)
  const r = { what: label, clickToVisibleChangeMs: t.busy != null ? Math.round(t.busy - t.click) : null, clickToDoneMs: t.done != null ? Math.round(t.done - t.click) : null }
  record.timings.push(r); log('timing', r)
  return r
}
const focusedText = () => page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName.toLowerCase()} ${(e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ')}` : null })

const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
  page = await context.newPage()
  const errors = []; const dialogs = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss() })
  // 测试数据的卷面文件是外面包了一层的 source-capture；整卷预览要的是里面那份。只在这次走查里拆开（不改网站）。
  await page.route('**/paper-assets/paper-2026-i/versions/*/paper-asset.json', async (route) => {
    const res = await route.fetch(); const j = await res.json()
    const doc = j.schemaVersion === 'source-capture-v1' ? j.documents.find((d) => d.encodedBytes) : null
    return doc ? route.fulfill({ response: res, body: Buffer.from(doc.encodedBytes, 'base64') }) : route.fulfill({ response: res })
  })
  await login(page, rig.base)

  // ── 1. 首页结果行 ──
  await resetDraft(); await home()
  const rowA = page.locator('.concierge-group-row').filter({ hasText: 'A篇' }).first()
  const rowLine = rowA.locator('.concierge-group-row-line')
  await shotOf(rowLine, `${MODE}-1a-首页结果行-加入前.png`)
  const rowKey = rowA.locator(AFTER ? `${SEL.row} button` : SEL.row).first()
  const p1 = { before: { text: (await rowKey.innerText().catch(() => '')).trim(), ariaLabel: await rowKey.getAttribute('aria-label') } }
  p1.timing = await timedClick(() => rowA.locator(AFTER ? `${SEL.row} button` : SEL.row).first().click(), rowA, AFTER ? /已加入/ : /已在草稿卷中/, '首页结果行')
  await sleep(400); await page.mouse.move(2, 898); await sleep(200)
  await shotOf(rowLine, `${MODE}-1b-首页结果行-加入后.png`)
  p1.after = (await rowA.locator('.concierge-group-row-trail').innerText()).trim().replace(/\s+/g, ' ')
  p1.draftAfterAdd = await draftGroups()
  if (AFTER) {
    await rowA.locator(`${SEL.row} button`, { hasText: '撤回' }).click()
    await page.waitForFunction(() => !/已加入/.test(document.querySelector('.concierge-group-row')?.closest('body')?.innerText.match(/A篇[\s\S]{0,200}/)?.[0] || ''), null, { timeout: 15000 }).catch(() => {})
    await rowA.locator(`${SEL.row} button`, { hasText: '撤回' }).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
    await sleep(400); await page.mouse.move(2, 898); await sleep(200)
    await shotOf(rowLine, `${MODE}-1c-首页结果行-撤回后.png`)
    p1.afterUndo = (await rowA.locator('.concierge-group-row-trail').innerText()).trim().replace(/\s+/g, ' ')
  } else {
    // 改之前没有撤回；再点一下已加入的那个键看会发生什么
    const url0 = page.url()
    await rowA.locator(SEL.row).first().click(); await sleep(1500)
    p1.clickAgain = { urlBefore: url0.replace(rig.base, ''), urlAfter: page.url().replace(rig.base, '') }
    await full(`${MODE}-1c-首页结果行-再点一下.png`)
  }
  p1.draftAfterUndo = await draftGroups()
  record.places['首页结果行'] = p1; log('row', p1)

  // ── 2. 题组详情页 ──
  await resetDraft(); await home()
  await page.locator('.concierge-group-row').filter({ hasText: 'C篇' }).locator('.concierge-group-row-title').click()
  await page.locator(SEL.detail).first().waitFor({ timeout: 30000 }); await settle(page, 800); await page.mouse.move(2, 898)
  const actions = page.locator('.peek-actions')
  await shotOf(actions, `${MODE}-2a-详情页-加入前.png`)
  const p2 = { before: (await actions.innerText()).trim().replace(/\s+/g, ' ') }
  p2.timing = await timedClick(() => page.locator(AFTER ? `${SEL.detail} button` : SEL.detail).first().click(), actions, AFTER ? /已加入/ : /已在草稿卷/, '详情页')
  await sleep(400); await page.mouse.move(2, 898); await sleep(200)
  await shotOf(actions, `${MODE}-2b-详情页-加入后.png`)
  p2.after = (await actions.innerText()).trim().replace(/\s+/g, ' ')
  if (AFTER) {
    await page.locator(`${SEL.detail} button`, { hasText: '撤回' }).click()
    await page.locator(`${SEL.detail} button`, { hasText: '撤回' }).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
    await sleep(400); await page.mouse.move(2, 898); await sleep(200)
    await shotOf(actions, `${MODE}-2c-详情页-撤回后.png`)
    p2.afterUndo = (await actions.innerText()).trim().replace(/\s+/g, ' ')
  } else {
    const url0 = page.url()
    await page.locator(SEL.detail).first().click(); await sleep(1500)
    p2.clickAgain = { urlBefore: url0.replace(rig.base, ''), urlAfter: page.url().replace(rig.base, '') }
  }
  p2.draft = await draftGroups()
  record.places['详情页'] = p2; log('detail', p2)

  // ── 3. 相似篇章面板（首页结果行「⋯」→ 相似篇章）──
  // 测试数据没有检索标注，面板只会说「该篇暂无检索标注数据」。这里拦接口塞两条（指向库里真有的 C篇、D篇），
  // 只为拍到面板上的加入键；加入和撤回走的是真接口。
  await page.route('**/api/similar-passages', (r) => r.fulfill({ json: {
    seedProfile: { groupType: 'reading', topicLabels: [] }, notice: null, poolStats: { totalInPool: 2, returned: 2 },
    results: [
      { groupId: 'group-2026-i-reading-c', paperId: 'paper-2026-i', title: 'Reading C', sourceLabel: '2026年新课标Ⅰ卷', score: 1, reasons: [{ kind: 'topic', label: '走查塞的数据' }] },
      { groupId: 'group-2026-i-reading-d', paperId: 'paper-2026-i', title: 'Reading D', sourceLabel: '2026年新课标Ⅰ卷', score: 1, reasons: [{ kind: 'topic', label: '走查塞的数据' }] },
    ] } }))
  await resetDraft(); await home()
  const rowB = page.locator('.concierge-group-row').filter({ hasText: 'B篇' }).first()
  await rowB.locator('.concierge-group-row-menu-trigger').click()
  await page.locator('[role=menuitem]').filter({ hasText: '相似篇章' }).click()
  await page.locator('.similar-passages-panel').waitFor({ timeout: 15000 })
  await page.waitForFunction(() => !/加载中…/.test(document.querySelector('.similar-passages-panel')?.innerText || ''), null, { timeout: 30000 }).catch(() => {})
  await settle(page, 800); await page.mouse.move(2, 898)
  const panel = page.locator('.similar-passages-panel')
  const p3 = { panelText: (await panel.innerText()).trim().replace(/\s+/g, ' ').slice(0, 300), cards: await page.locator(SEL.similar).count() }
  await shotOf(panel, `${MODE}-3a-相似篇章-加入前.png`)
  if (p3.cards > 0) {
    const card = page.locator('.similar-rcard').filter({ has: page.locator(SEL.similar) }).first()
    p3.timing = await timedClick(() => card.locator(AFTER ? `${SEL.similar} button` : SEL.similar).first().click(), panel, AFTER ? /已加入/ : /已把/, '相似篇章')
    await sleep(500); await page.mouse.move(2, 898); await sleep(200)
    await shotOf(panel, `${MODE}-3b-相似篇章-加入后.png`)
    p3.after = (await panel.innerText()).trim().replace(/\s+/g, ' ').slice(0, 300)
    if (AFTER) {
      await card.locator(`${SEL.similar} button`, { hasText: '撤回' }).click()
      await card.locator(`${SEL.similar} button`, { hasText: '撤回' }).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
      await sleep(400); await page.mouse.move(2, 898); await sleep(200)
      await shotOf(panel, `${MODE}-3c-相似篇章-撤回后.png`)
      p3.afterUndo = (await panel.innerText()).trim().replace(/\s+/g, ' ').slice(0, 300)
    }
  }
  p3.draft = await draftGroups()
  record.places['相似篇章'] = p3; log('similar', p3)

  // ── 4. 整卷预览卷面旁的加入键 ──
  await resetDraft()
  await page.goto(rig.base + '/?view=paper-browse&paperId=paper-2026-i')
  await page.locator('.paper-browse-group-actions').first().waitFor({ state: 'attached', timeout: 60000 }); await settle(page, 2500)
  const cardD = page.locator('.paper-browse-group-card').filter({ has: page.locator(SEL.gutter) }).nth(1)
  await cardD.scrollIntoViewIfNeeded(); await sleep(400)
  await cardD.hover({ position: { x: 40, y: 20 } }); await sleep(400)
  const gutterBox = async () => { const c = await cardD.boundingBox(); return { x: c.x + c.width - 200, y: Math.max(0, c.y - 12), width: Math.min(420, 1440 - (c.x + c.width - 200)), height: 120 } }
  await page.screenshot({ path: path.join(OUT, `${MODE}-4a-整卷预览-加入前.png`), clip: await gutterBox() })
  const g = cardD.locator(SEL.gutter).first()
  const p4 = { before: (await g.innerText()).trim().replace(/\s+/g, ' ') }
  p4.timing = await timedClick(() => (AFTER ? g.locator('button').first() : g).click(), cardD.locator('.paper-browse-group-actions'), AFTER ? /已加入/ : /已剪入/, '整卷预览')
  await sleep(400); await cardD.hover({ position: { x: 40, y: 20 } }); await sleep(300)
  await page.screenshot({ path: path.join(OUT, `${MODE}-4b-整卷预览-加入后.png`), clip: await gutterBox() })
  p4.after = (await cardD.locator('.paper-browse-group-actions').innerText()).trim().replace(/\s+/g, ' ')
  if (AFTER) {
    await g.locator('button', { hasText: '撤回' }).click()
    await g.locator('button', { hasText: '撤回' }).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
    await sleep(400); await cardD.hover({ position: { x: 40, y: 20 } }); await sleep(300)
    await page.screenshot({ path: path.join(OUT, `${MODE}-4c-整卷预览-撤回后.png`), clip: await gutterBox() })
    p4.afterUndo = (await cardD.locator('.paper-browse-group-actions').innerText()).trim().replace(/\s+/g, ' ')
  } else {
    const url0 = page.url()
    await g.click(); await sleep(1500)
    p4.clickAgain = { urlBefore: url0.replace(rig.base, ''), urlAfter: page.url().replace(rig.base, '') }
  }
  p4.draft = await draftGroups()
  record.places['整卷预览'] = p4; log('paper', p4)

  if (AFTER) {
    // ── 键盘：首页结果行，Tab 到加入键、回车加入、Tab 到撤回、回车撤回 ──
    await resetDraft(); await home()
    const rowD = page.locator('.concierge-group-row').filter({ hasText: 'D篇' }).first()
    // 从这一行前面最近的一个可聚焦元素出发按 Tab
    await rowD.locator('[data-draft-add] button').first().evaluate((btn) => {
      const all = [...document.querySelectorAll('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((e) => !e.disabled && e.offsetParent !== null)
      const i = all.indexOf(btn); all[i - 1].focus()
    })
    const kb = { start: await focusedText() }
    await page.keyboard.press('Tab'); kb.afterTab = await focusedText()
    await shotOf(rowD.locator('.concierge-group-row-line'), 'after-5a-键盘-Tab到加入键.png')
    kb.timing = await timedClick(() => page.keyboard.press('Enter'), rowD, /已加入/, '键盘回车加入')
    await sleep(300); kb.afterEnter = await focusedText()
    await shotOf(rowD.locator('.concierge-group-row-line'), 'after-5b-键盘-回车加入-焦点在撤回.png')
    await page.keyboard.press('Enter')
    await rowD.locator('[data-draft-add] button', { hasText: '撤回' }).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
    await sleep(300); kb.afterUndoEnter = await focusedText()
    await shotOf(rowD.locator('.concierge-group-row-line'), 'after-5c-键盘-回车撤回-焦点回加入键.png')
    kb.draft = await draftGroups()
    record.keyboard = kb; log('keyboard', kb)

    // ── 出错：加入失败、撤回失败（拦接口返回 500）──
    await resetDraft(); await home()
    const rowC = page.locator('.concierge-group-row').filter({ hasText: 'C篇' }).first()
    await page.route('**/api/draft-papers/current/items', (r) => r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : r.fallback())
    await rowC.locator('[data-draft-add] button').first().click(); await sleep(800); await page.mouse.move(2, 898)
    await shotOf(rowC.locator('.concierge-group-row-line'), 'after-6a-加入失败.png')
    record.errors.addFail = { text: (await rowC.locator('.concierge-group-row-trail').innerText()).trim().replace(/\s+/g, ' '), draft: await draftGroups() }
    await page.unroute('**/api/draft-papers/current/items')
    await rowC.locator('[data-draft-add] button').first().click()
    await rowC.locator('[data-draft-add] button', { hasText: '撤回' }).waitFor({ timeout: 15000 })
    await page.route('**/api/draft-papers/*/items/*', (r) => r.request().method() === 'DELETE' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : r.fallback())
    await rowC.locator('[data-draft-add] button', { hasText: '撤回' }).click(); await sleep(800); await page.mouse.move(2, 898)
    await shotOf(rowC.locator('.concierge-group-row-line'), 'after-6b-撤回失败.png')
    record.errors.undoFail = { text: (await rowC.locator('.concierge-group-row-trail').innerText()).trim().replace(/\s+/g, ' '), draft: await draftGroups() }
    await page.unroute('**/api/draft-papers/*/items/*')
    log('errors', record.errors)

    // ── 390 宽：首页结果行加入后 ──
    await resetDraft()
    await page.setViewportSize({ width: 390, height: 844 }); await home()
    const rowA2 = page.locator('.concierge-group-row').filter({ hasText: 'A篇' }).first()
    await rowA2.locator('[data-draft-add] button').first().click()
    await rowA2.locator('[data-draft-add] button', { hasText: '撤回' }).waitFor({ timeout: 15000 }); await sleep(300); await page.mouse.move(2, 840)
    await rowA2.screenshot({ path: path.join(OUT, 'after-7-390宽-首页结果行加入后.png') })
    record.narrow = { text: (await rowA2.innerText()).trim().replace(/\s+/g, ' '), overflowX: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) }
  }
  record.dialogs = dialogs
  record.consoleErrors = errors
} finally {
  writeFileSync(path.join(OUT, `walk-${MODE}.json`), JSON.stringify(record, null, 2))
  await browser.close()
  await rig.stop()
}
process.exit(0)
