// 走查卡点 2 修完后的浏览器走查：下移 / 移除后多快有看得见的变化，等待期间的画面，失败时的画面。
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

process.env.INVENTORY_PORT_OFFSET = '49'
const ROOT = '/home/user/english-question-bank'
const INV = path.join(ROOT, 'scripts/component-inventory')
const { startRig } = await import(pathToFileURL(path.join(INV, 'rig.mjs')).href)
const { login, settle, sleep } = await import(pathToFileURL(path.join(INV, 'scenarios.mjs')).href)
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')

const OUT = path.join(ROOT, 'design/ux-2026-11-14/find-compose-export/fix-waiting')
mkdirSync(OUT, { recursive: true })
const record = { steps: [] }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })
  const net = []
  page.on('request', (r) => { if (/\/pagination|reorder-suggestion|\/items/.test(r.url())) r._t0 = Date.now() })
  page.on('requestfinished', (r) => { if (r._t0) net.push({ url: r.url().replace(rig.base, '').slice(0, 90), method: r.method(), ms: Date.now() - r._t0 }) })
  page.on('requestfailed', (r) => { if (r._t0) net.push({ url: r.url().replace(rig.base, '').slice(0, 90), method: r.method(), ms: Date.now() - r._t0, failed: r.failure()?.errorText }) })

  await login(page, rig.base)
  await page.evaluate(async () => {
    const d = await (await fetch('/api/draft-papers/current?create=1')).json()
    for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
    for (const g of ['group-2026-i-reading-a', 'group-2026-i-reading-c', 'group-2026-i-reading-d'])
      await fetch('/api/draft-papers/current/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ groupId: g }) })
  })

  const rail = () => page.locator('.draft-paper-rail-item').allInnerTexts().then((a) => a.map((s) => s.trim().replace(/\s+/g, ' ')))
  const waitingVisible = () => page.evaluate(() => { const e = document.querySelector('.draft-a4-wait'); return !!e && !e.hidden && e.classList.contains('is-waiting') && getComputedStyle(e).display !== 'none' })
  async function waitSettled(label, limit = 400000) {
    const t0 = Date.now()
    while (Date.now() - t0 < limit) {
      const s = await page.evaluate(() => {
        const w = document.querySelector('.draft-a4-wait')
        return { iframe: !!document.querySelector('.draft-a4-sheet iframe'), waiting: !!w && !w.hidden && w.classList.contains('is-waiting'), failed: !!w && !w.hidden && !w.classList.contains('is-waiting'), empty: document.querySelector('.draft-a4-empty')?.innerText || '' }
      })
      if (s.iframe && !s.waiting) return { ms: Date.now() - t0, ...s }
      await sleep(250)
    }
    throw new Error(label + ' 超时')
  }

  // 打开草稿卷，等第一次卷面出来
  let t0 = Date.now()
  await page.goto(rig.base + '/?view=draft-paper')
  const first = await waitSettled('打开')
  log('打开草稿卷到卷面出来', Date.now() - t0, 'ms')
  record.openMs = Date.now() - t0
  await settle(page, 1500)
  record.railBefore = await rail()
  await page.screenshot({ path: path.join(OUT, '01-打开草稿卷.png') })

  // 在页面里装一个计时器：点击那一刻起，逐帧看左栏和遮罩什么时候变。
  async function armTimer() {
    await page.evaluate(() => {
      const railText = () => [...document.querySelectorAll('.draft-paper-rail-item')].map((e) => e.innerText.trim().replace(/\s+/g, ' ')).join('|')
      const before = railText()
      const w = window.__walk = { before, clickAt: 0, railAt: 0, overlayAt: 0, iframeGoneAt: 0 }
      document.addEventListener('click', () => { if (!w.clickAt) w.clickAt = performance.now() }, { capture: true, once: true })
      const tick = () => {
        if (w.clickAt) {
          const now = performance.now()
          if (!w.railAt && railText() !== before) w.railAt = now
          const o = document.querySelector('.draft-a4-wait')
          if (!w.overlayAt && o && !o.hidden && o.classList.contains('is-waiting') && getComputedStyle(o).display !== 'none') w.overlayAt = now
          if (!w.iframeGoneAt && !document.querySelector('.draft-a4-sheet iframe')) w.iframeGoneAt = now
          if (w.railAt && w.overlayAt && now - w.clickAt > 3000) return
          if (now - w.clickAt > 10000) return
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }
  const readTimer = () => page.evaluate(() => {
    const w = window.__walk
    const d = (t) => (t ? Math.round((t - w.clickAt) * 10) / 10 : null)
    return { railMs: d(w.railAt), overlayMs: d(w.overlayAt), iframeGoneMs: d(w.iframeGoneAt) }
  })

  // ---- 下移 ----
  await page.locator('[aria-label="更多题组操作"]').first().click()
  await page.getByRole('menuitem', { name: '下移' }).waitFor()
  await armTimer()
  await page.getByRole('menuitem', { name: '下移' }).click()
  await sleep(1000)
  const move = await readTimer()
  log('下移', move)
  await page.mouse.move(2, 898)
  await page.screenshot({ path: path.join(OUT, '02-下移后1秒-旧卷面加遮罩.png') })
  // 打印时遮罩不出现
  await page.emulateMedia({ media: 'print' })
  const printDisplay = await page.evaluate(() => getComputedStyle(document.querySelector('.draft-a4-wait')).display)
  await page.emulateMedia({ media: 'screen' })
  const moveRail = await rail()
  const moveDone = await waitSettled('下移')
  await settle(page, 1500)
  await page.mouse.move(2, 898)
  await page.screenshot({ path: path.join(OUT, '03-下移后新卷面换上.png') })
  record.steps.push({ what: '下移第一个题组', ...move, railAfter: moveRail, waitTotalMs: moveDone.ms + 1000, printDisplay, after: moveDone })
  log('下移等新卷面', moveDone.ms + 1000, 'ms; print display', printDisplay)

  // ---- 移除 ----
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
  await page.locator('[aria-label="更多题组操作"]').first().click()
  await page.getByRole('menuitem', { name: '移除' }).waitFor()
  await armTimer()
  await page.getByRole('menuitem', { name: '移除' }).click()
  await sleep(1000)
  const del = await readTimer()
  log('移除', del)
  await page.mouse.move(2, 898)
  await page.screenshot({ path: path.join(OUT, '04-移除后1秒-旧卷面加遮罩.png') })
  const delRail = await rail()
  const delDone = await waitSettled('移除')
  await settle(page, 1500)
  record.steps.push({ what: '移除第一个题组', ...del, railAfter: delRail, waitTotalMs: delDone.ms + 1000, after: delDone })
  log('移除等新卷面', delDone.ms + 1000, 'ms')
  // 撤销移除（加回）
  const undoBtn = page.locator('.draft-undo-toast button')
  if (await undoBtn.isVisible().catch(() => false)) {
    await armTimer()
    await undoBtn.click()
    await sleep(1000)
    const undo = await readTimer()
    const undoDone = await waitSettled('撤销移除')
    await settle(page, 1500)
    record.steps.push({ what: '撤销移除（加回题组）', ...undo, railAfter: await rail(), waitTotalMs: undoDone.ms + 1000, after: undoDone })
    log('撤销移除', undo, undoDone.ms + 1000)
  } else {
    record.steps.push({ what: '撤销移除', note: '撤销提示已收起（等卷面超过 8 秒），没走这一步' })
  }
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)

  // ---- 失败：拦分页接口返回 500 ----
  await page.route('**/pagination?**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'walkthrough-forced' }) }))
  await page.locator('[aria-label="更多题组操作"]').first().click()
  await page.getByRole('menuitem', { name: '下移' }).waitFor()
  await armTimer()
  const patchDone = page.waitForResponse((r) => r.request().method() === 'PATCH' && /\/api\/draft-papers\//.test(r.url()), { timeout: 60000 })
  await page.getByRole('menuitem', { name: '下移' }).click()
  // 等保存回来（服务器回的题组表 orderIndex 和乐观更新的不一样，会再发一次分页请求），
  // 再等这一次也失败，才算稳定的失败画面。
  const tf = Date.now()
  await patchDone
  const savedAfterMs = Date.now() - tf
  await page.waitForFunction(() => { const w = document.querySelector('.draft-a4-wait'); return w && !w.hidden && !w.classList.contains('is-waiting') }, null, { timeout: 60000 })
  const fail = { ms: Date.now() - tf, savedAfterMs }
  await sleep(1500)
  const failInfo = await page.evaluate(() => {
    const w = document.querySelector('.draft-a4-wait')
    return { line: w?.innerText.trim().replace(/\s+/g, ' '), hidden: w?.hidden, waiting: w?.classList.contains('is-waiting'), iframe: !!document.querySelector('.draft-a4-sheet iframe') }
  })
  await page.mouse.move(2, 898)
  await page.screenshot({ path: path.join(OUT, '05-重排失败-旧卷面加一行字.png') })
  record.steps.push({ what: '下移，分页接口被拦成 500', ...(await readTimer()), failAfterMs: fail.ms, savedAfterMs: fail.savedAfterMs, failInfo })
  log('失败', failInfo)
  // 重试
  await page.unroute('**/pagination?**')
  await armTimer()
  await page.locator('.draft-a4-wait-line button').click()
  await sleep(1000)
  const retry = await readTimer()
  const retryOverlay = await waitingVisible()
  const retryDone = await waitSettled('重试')
  await settle(page, 1500)
  await page.mouse.move(2, 898)
  await page.screenshot({ path: path.join(OUT, '06-重试后新卷面.png') })
  record.steps.push({ what: '点「重试」', ...retry, overlayAt1s: retryOverlay, waitTotalMs: retryDone.ms + 1000, railAfter: await rail(), after: retryDone })
  log('重试', retry, retryDone.ms + 1000)

  record.network = net
  record.errors = errors
} finally {
  writeFileSync(path.join(OUT, 'walk.json'), JSON.stringify(record, null, 2))
  await browser.close()
  await rig.stop()
}
process.exit(0)
