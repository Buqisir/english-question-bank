#!/usr/bin/env node
// 走查「找题 → 组卷 → 导出」：用清点用的本地网站（scripts/component-inventory/rig.mjs，临时数据库 + 固定测试数据 + owner 账号），
// 像一位高三英语老师那样把这条路走一遍：首页找题、点开题组看一眼、加入草稿卷、在草稿卷里调顺序和取舍、
// 选 PDF 版本、触发导出。每一步截一张图，并记下：页面地址、老师要做的动作、点了几次、屏上出现了哪些可点的东西。
// 导出只走到「触发导出」，记录出现了什么（菜单、对话框、提示、下载），不打开、不评判 PDF 本身。
// 另外把能触发的状态各拍一张：首页加载中、没搜到、出错、空草稿卷、草稿卷打开中、导出等待中、导出出错等。
//
// 只读网站：不改 app/、server/ 的任何文件。加载中、出错两类状态靠在浏览器里拦接口（延迟或报错）触发，
// 每张图的记录里写明是怎么触发的。
//
// 用法：node scripts/ux-walkthrough/find-compose-export.mjs
//   先装好清点脚本的依赖（npm ci --prefix scripts/component-inventory），Chromium 用 Playwright 的完整版（channel: 'chromium'）。
//   端口偏移固定 43（网页 5342，接口 9955），可以和别的清点脚本同时跑。
// 输出：design/ux-2026-11-14/find-compose-export/shots/*.png 和 walkthrough.json
// 只重走一种宽度：WALK_ONLY=390（或 1440）node scripts/ux-walkthrough/find-compose-export.mjs
//   只删并重拍该宽度的路线截图（d.. 或 m..），不拍状态图，结果并进现有 walkthrough.json。
//
// 计数口径：
//   点击 = 鼠标点一下（窄屏是手指点一下）。原生下拉框选一项算 2 次（点开 + 选中）。
//   按键 = 回车、Esc 这类单个按键；打字不算点击，单独记在「输入」里。
//   滚动 = 要点的东西不在屏上、得先滚过去才点得到，记 1 次。
import { mkdirSync, rmSync, writeFileSync, statSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.INVENTORY_PORT_OFFSET = '43' // rig.mjs 在载入时读它，所以先设再载入
const HERE = path.dirname(fileURLToPath(import.meta.url))
const INV = path.join(HERE, '../component-inventory')
const { ROOT, requireFromApp } = await import(pathToFileURL(path.join(INV, 'lib.mjs')).href)
const { startRig } = await import(pathToFileURL(path.join(INV, 'rig.mjs')).href)
const { login, settle, sleep } = await import(pathToFileURL(path.join(INV, 'scenarios.mjs')).href)

const DOC = path.join(ROOT, 'design/ux-2026-11-14/find-compose-export')
const SHOTS = path.join(DOC, 'shots')
const ONLY = process.env.WALK_ONLY ? Number(process.env.WALK_ONLY) : 0
if (!ONLY) { rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS, { recursive: true }) } else {
  mkdirSync(SHOTS, { recursive: true })
  const pre = ONLY < 500 ? 'm' : 'd'
  for (const f of readdirSync(SHOTS)) if (new RegExp(`^${pre}\\d`).test(f)) rmSync(path.join(SHOTS, f))
}

const GROUPS = ['group-2026-i-reading-a', 'group-2026-i-reading-b', 'group-2026-i-reading-c', 'group-2026-i-reading-d']
const QUERY = '2026 阅读'

// ---------- 在页面里跑的小工具 ----------

// 屏上（视口内）看得见的可点的东西：按钮、链接、菜单项、输入框、下拉框、可聚焦的自定义控件。
function listClickables() {
  const vis = (e) => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }
  const sel = 'button,a[href],[role=button],[role=menuitem],[role=menuitemcheckbox],[role=tab],[role=switch],input:not([type=hidden]),select,textarea,summary'
  const all = [...document.querySelectorAll(sel)].filter(vis)
  const inView = (e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth }
  const name = (e) => {
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ')
    const a = e.getAttribute('aria-label') || ''
    if (e.tagName === 'INPUT' && (e.type === 'checkbox' || e.type === 'radio')) {
      const lab = e.closest('label')?.innerText?.trim() || e.labels?.[0]?.innerText?.trim() || a
      return `${lab || '（无名开关）'}${e.checked ? '［开］' : '［关］'}`
    }
    if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') return `输入框「${a || e.placeholder || e.name || ''}」${e.value ? '=' + e.value.slice(0, 20) : ''}`
    if (e.tagName === 'SELECT') return `下拉框「${a || ''}」=${e.options[e.selectedIndex]?.text || ''}`
    if (t && a && !a.startsWith(t)) return `${t}（读屏：${a}）`
    return t || a || '（无名）'
  }
  const kind = (e) => {
    const role = e.getAttribute('role')
    if (role) return role
    return e.tagName.toLowerCase()
  }
  const items = all.map((e) => {
    const r = e.getBoundingClientRect()
    return {
      name: name(e).slice(0, 60), kind: kind(e), inView: inView(e),
      disabled: !!(e.disabled || e.getAttribute('aria-disabled') === 'true') || undefined,
      shared: e.classList.contains('eqb-button') || e.classList.contains('eqb-menu-item') || undefined,
      inv: e.getAttribute('data-inv') || undefined,
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    }
  })
  return { inView: items.filter((i) => i.inView), totalOnPage: items.length }
}

// 屏上出现的提示类文字：role=status/alert、toast、提示条。
function listNotices() {
  const sel = '[role=status],[role=alert],[aria-live],[class*=toast],[class*=notice],[class*=error],[class*=status]'
  const out = []
  for (const e of document.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e)
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ')
    if (!t || out.some((o) => o.text === t)) continue
    out.push({ cls: (typeof e.className === 'string' ? e.className : '').slice(0, 60), text: t.slice(0, 200), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] })
  }
  return out
}

async function draftState(page) {
  return page.evaluate(async () => {
    const d = await (await fetch('/api/draft-papers/current')).json().catch(() => null)
    return (d?.draftPaper?.items || []).map((i) => i.groupId.replace('group-2026-i-reading-', '').toUpperCase() + '篇')
  })
}

async function clearDraft(page) {
  await page.evaluate(async () => {
    const d = await (await fetch('/api/draft-papers/current?create=1')).json()
    for (const it of d.draftPaper?.items || []) await fetch(`/api/draft-papers/${encodeURIComponent(d.draftPaper.id)}/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
  })
}

async function seedDraft(page, groups) {
  await page.evaluate(async (gs) => {
    for (const g of gs) await fetch('/api/draft-papers/current/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ groupId: g }) })
  }, groups)
}

// ---------- 走查 ----------

const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ channel: 'chromium' })
const JSON_PATH = path.join(DOC, 'walkthrough.json')
const result = ONLY && existsSync(JSON_PATH) ? JSON.parse(readFileSync(JSON_PATH, 'utf8')) : { widths: {}, states: [] }
Object.assign(result, { generatedAt: new Date().toISOString(), base: rig.base, query: QUERY })

async function newPage(width) {
  const height = width < 500 ? 844 : 900
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce', acceptDownloads: true, hasTouch: width < 500, isMobile: width < 500 })
  const page = await context.newPage()
  const log = { errors: [], downloads: [], popups: [], dialogs: [] }
  page.on('pageerror', (e) => log.errors.push(String(e).slice(0, 200)))
  page.on('popup', (p) => log.popups.push(p.url()))
  page.on('dialog', (d) => { log.dialogs.push(`${d.type()}: ${d.message()}`); d.dismiss().catch(() => {}) })
  page.on('download', async (d) => {
    const rec = { suggestedFilename: d.suggestedFilename(), url: d.url().slice(0, 80) }
    log.downloads.push(rec)
    try { const p = await d.path(); rec.bytes = statSync(p).size } catch {}
  })
  return { context, page, log, width, height }
}

try {
  for (const width of [1440, 390].filter((w) => !ONLY || w === ONLY)) {
    const tag = width < 500 ? 'm' : 'd'
    const { context, page, log, height } = await newPage(width)
    const steps = []
    let n = 0
    let cur = null

    const park = async () => { if (width >= 500) { await page.mouse.move(2, height - 2); await sleep(150) } }
    const offscreen = async (loc) => {
      const b = await loc.boundingBox().catch(() => null)
      return !b || b.y + b.height > height || b.y < 0
    }
    const act = {
      async click(loc, label) {
        if (await offscreen(loc)) { cur.scrolls += 1; cur.actions.push(`滚到「${label}」`) }
        if (width < 500) await loc.tap({ timeout: 15000 }); else await loc.click({ timeout: 15000 })
        cur.clicks += 1; cur.actions.push(`点「${label}」`)
      },
      async choose(loc, optionLabel, label) {
        if (await offscreen(loc)) { cur.scrolls += 1; cur.actions.push(`滚到「${label}」`) }
        await loc.selectOption({ label: optionLabel })
        cur.clicks += 2; cur.actions.push(`在「${label}」里选「${optionLabel}」`)
      },
      async type(loc, text, label) {
        await loc.fill(text); cur.typed.push(text); cur.actions.push(`在「${label}」里输入「${text}」`)
      },
      async key(k, label) { await page.keyboard.press(k); cur.keys += 1; cur.actions.push(`按${label || k}`) },
      note(s) { cur.notes.push(s) },
    }
    // 一步：老师要做的一件事。fn 里只用 act.* 做动作；做完截图、记录。
    async function step(screen, intent, fn, { shotFull = false } = {}) {
      n += 1
      const id = `${tag}${String(n).padStart(2, '0')}`
      cur = { id, screen, intent, clicks: 0, keys: 0, scrolls: 0, typed: [], actions: [], notes: [], ok: true }
      const t0 = Date.now()
      try { await fn(act) } catch (e) { cur.ok = false; cur.failure = String(e).split('\n')[0].slice(0, 240) }
      cur.ms = Date.now() - t0
      await park()
      const file = `${id}-${slug(intent)}.png`
      await page.screenshot({ path: path.join(SHOTS, file), fullPage: shotFull }).catch(() => {})
      cur.shot = `shots/${file}`
      cur.url = page.url().replace(rig.base, '')
      cur.clickables = await page.evaluate(listClickables).catch(() => null)
      cur.notices = await page.evaluate(listNotices).catch(() => [])
      cur.draft = await draftState(page).catch(() => null)
      cur.downloads = log.downloads.splice(0)
      cur.popups = log.popups.splice(0)
      cur.dialogs = log.dialogs.splice(0)
      steps.push(cur)
      console.log(`${id} ${cur.ok ? 'ok ' : 'FAIL'} ${intent}  点击${cur.clicks} 按键${cur.keys} 滚动${cur.scrolls}  ${cur.url}${cur.failure ? '  ' + cur.failure : ''}`)
      return cur
    }
    // 草稿卷每次改动后会重新生成分页预览，等它出完再做下一步；记下等了多久。
    async function waitPreview(a, what) {
      const t0 = Date.now()
      let sawBusy = false, stableSince = 0
      while (Date.now() - t0 < 240000) {
        await sleep(500)
        const busy = await page.getByText(/正在生成分页预览|正在打开草稿卷/).count().catch(() => 0)
        const ready = await page.locator('[aria-label="更多题组操作"]').first().isVisible().catch(() => false)
        if (busy) sawBusy = true
        if (!busy && ready) { if (!stableSince) stableSince = Date.now(); if (Date.now() - stableSince > 3000) break } else stableSince = 0
      }
      await settle(page, 500)
      const failed = await page.getByText('生成分页预览没成功').count().catch(() => 0)
      a.note(`${what}后${sawBusy ? '卷面换成「正在生成分页预览…」，' : ''}约 ${Math.round((Date.now() - t0 - 3000) / 1000)} 秒后${failed ? '卷面位置写「生成分页预览没成功，可以再试一次。」' : '卷面回来'}`)
    }
    // 中途截一张（加载中这类一闪而过的画面），挂在当前步骤下。
    async function midShot(name, waitMs) {
      await sleep(waitMs)
      const file = `${cur.id}-${name}.png`
      await page.screenshot({ path: path.join(SHOTS, file) }).catch(() => {})
      cur.midShots = cur.midShots || []
      cur.midShots.push({ shot: `shots/${file}`, afterMs: waitMs, notices: await page.evaluate(listNotices).catch(() => []), text: (await page.evaluate(() => document.querySelector('main, #root')?.innerText || '').catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 160) })
    }

    // 准备：登录（不计步），草稿卷清空，回到首页。
    await login(page, rig.base)
    await clearDraft(page)

    // 1. 登录后的首页
    await step('首页', '回到首页', async () => {
      await page.goto(rig.base + '/'); await page.locator('.concierge-intent-input').waitFor({ timeout: 30000 })
      await midShot('首页刚打开', 200)
      await settle(page, 2000)
    })

    // 2. 输入需求，回车
    await step('首页', '输入找题需求并回车', async (a) => {
      const input = page.locator('.concierge-intent-input')
      await a.click(input, '搜索框')
      await a.type(input, QUERY, '搜索框')
      await a.key('Enter', '回车')
      await midShot('回车后', 250)
      await page.locator('.concierge-group-row').first().waitFor({ timeout: 15000 })
      await settle(page, 1200)
      const ft = await page.evaluate(() => {
        const sw = [...document.querySelectorAll('label, span')].find((e) => e.textContent.trim() === '思考模式')
        const lead = document.querySelector('.concierge-group-row-title')
        return { thinkModeFont: sw ? getComputedStyle(sw).fontSize : null, rowTitleFont: lead ? getComputedStyle(lead).fontSize : null }
      })
      a.note(`「思考模式」字号 ${ft.thinkModeFont}，结果行标题字号 ${ft.rowTitleFont}`)
      const whole = await page.locator('.concierge-group-row, [class*=paper-row]').filter({ hasText: '整卷未上线' }).count()
      if (whole) a.note('卷行右侧写「整卷未上线」，没有「看整卷」可点')
    })

    // 3. 点开一个题组看一眼
    await step('首页 → 题组详情', '点开 A篇 看一眼', async (a) => {
      await a.click(page.locator('.concierge-group-row').filter({ hasText: 'A篇' }).locator('.concierge-group-row-title'), 'A篇')
      await page.waitForURL(/view=detail/, { timeout: 15000 })
      await settle(page, 1500)
      const body = await page.evaluate(() => document.querySelector('main')?.innerText || '')
      if (body.includes('还没上线')) a.note('详情页卷面位置写「这份卷还没上线，回到题库换一份看看。」，看不到题目原文')
    })

    // 4. 在详情页加入草稿卷
    await step('题组详情', '在详情页加入草稿卷', async (a) => {
      await a.click(page.locator('.peek-add').first(), '加入草稿卷')
      await midShot('点完', 300)
      await sleep(1200)
      const label = await page.locator('.peek-add').first().innerText().catch(() => '')
      a.note(`点完以后这颗键写「${label.trim()}」`)
    })

    // 5. 回到找题
    await step('题组详情 → 首页', '回到找题结果', async (a) => {
      const back = page.locator('.detail-back, .topbar-back').filter({ hasText: '返回找题' }).first()
      await a.click(back, '返回找题')
      await page.locator('.concierge-intent-input').waitFor({ timeout: 15000 })
      await settle(page, 1500)
      const kept = await page.locator('.concierge-intent-input').inputValue()
      const rows = await page.locator('.concierge-group-row').count()
      a.note(kept ? `搜索框里还留着「${kept}」，结果 ${rows} 行` : `搜索框是空的，结果 ${rows} 行`)
    })
    // 返回后没有结果就重搜一次（老师会这么做），计入这一步之后的单独一步
    if (!(await page.locator('.concierge-group-row').count())) {
      await step('首页', '重新搜一次', async (a) => {
        const input = page.locator('.concierge-intent-input')
        await a.click(input, '搜索框')
        if (!(await input.inputValue())) await a.type(input, QUERY, '搜索框')
        await a.key('Enter', '回车')
        await page.locator('.concierge-group-row').first().waitFor({ timeout: 15000 }); await settle(page, 1200)
      })
    }

    // 6. 在结果行直接加入 C篇、D篇
    await step('首页', '在结果行加入 C篇、D篇', async (a) => {
      for (const p of ['C篇', 'D篇']) {
        const row = page.locator('.concierge-group-row').filter({ hasText: p })
        await a.click(row.locator('.concierge-action-add'), `${p} 的 +`)
        await sleep(900)
      }
      await midShot('加完', 100)
      const pill = (await page.locator('.basket-chip').innerText().catch(() => '')).trim()
      a.note(`右下草稿丸写「${pill}」`)
    })

    // 7. 打开草稿卷
    await step('首页 → 草稿卷', '打开草稿卷', async (a) => {
      await a.click(page.locator('.basket-chip'), '草稿卷（N 组）')
      await midShot('打开中-0.5秒', 500)
      const t0 = Date.now()
      await page.locator('[aria-label="更多题组操作"]').first().waitFor({ timeout: 150000 })
      a.note(`点草稿丸到题组工具条出现用了约 ${Math.round((Date.now() - t0 + 500) / 1000)} 秒`)
      await settle(page, 1500)
      const rail = await page.locator('.draft-paper-rail-item').allInnerTexts().catch(() => [])
      if (rail.length) a.note(`左栏目录顺序：${rail.map((s) => s.trim()).join('、')}`)
    })

    // 8. 调顺序：把第一个题组下移
    await step('草稿卷', '把第一个题组往后挪一位', async (a) => {
      const more = page.locator('[aria-label="更多题组操作"]').first()
      await a.click(more, '⋯（更多题组操作）')
      await sleep(400)
      const items = await page.locator('.eqb-menu [role=menuitem], .eqb-menu [role=menuitemcheckbox]').allInnerTexts().catch(() => [])
      a.note(`菜单项：${items.map((s) => s.trim()).join('、')}`)
      await midShot('菜单', 0)
      await a.click(page.getByRole('menuitem', { name: '下移' }), '下移')
      await midShot('下移后-1秒', 1000)
      await waitPreview(a, '下移')
      const rail = await page.locator('.draft-paper-rail-item').allInnerTexts().catch(() => [])
      if (rail.length) a.note(`左栏目录顺序：${rail.map((s) => s.trim()).join('、')}`)
    })

    // 9. 分页建议：看一眼，点一下
    await step('草稿卷', '看分页建议并采用一条', async (a) => {
      const sug = page.locator('.draft-group-suggestion').first()
      await sug.scrollIntoViewIfNeeded(); cur.scrolls += 1; a.note('「建议前置分页」在第二、三个题组的工具条上，要先滚下去才看得到')
      await sleep(400)
      await midShot('采用前', 0)
      await a.click(sug, '建议前置分页')
      await waitPreview(a, '采用分页建议')
      const still = await page.locator('.draft-group-suggestion').count()
      a.note(`点完以后屏上还剩 ${still} 个「建议前置分页」`)
    })

    // 10. 取舍：移除一个题组
    await step('草稿卷', '移除一个题组', async (a) => {
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
      const more = page.locator('[aria-label="更多题组操作"]').first()
      await a.click(more, '⋯（更多题组操作）')
      await sleep(300)
      await a.click(page.getByRole('menuitem', { name: '移除' }), '移除')
      await page.locator('.draft-undo-toast[data-visible="true"]').first().waitFor({ timeout: 15000 }).catch(() => a.note('没看到撤销提示'))
      await sleep(500)
      a.note('撤销提示：' + (await page.locator('.draft-undo-toast[data-visible="true"]').first().innerText().catch(() => '（无）')).trim().replace(/\s+/g, ' '))
    })

    // 11. 撤回刚才的移除
    await step('草稿卷', '撤回刚才的移除', async (a) => {
      const undo = page.locator('.draft-undo-toast[data-visible="true"]').getByRole('button').filter({ hasText: /撤销|撤回|恢复/ }).first()
      await a.click(undo, (await undo.innerText().catch(() => '撤销')).trim())
      await waitPreview(a, '撤销')
      const rail = await page.locator('.draft-paper-rail-item').allInnerTexts().catch(() => [])
      if (rail.length) a.note(`左栏目录顺序：${rail.map((s) => s.trim()).join('、')}`)
    })

    // 11b. 看一眼顶栏「⋯」里有什么（找 PDF 版本放在哪）
    await step('草稿卷', '打开顶栏「⋯」看看', async (a) => {
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
      await a.click(page.locator('.draft-more-menu-trigger').first(), '⋯（草稿卷更多信息）')
      await sleep(500)
      const t = (await page.locator('.draft-more-menu-panel').first().innerText().catch(() => '')).trim().replace(/\s+/g, ' ')
      a.note(`面板里：${t}`)
      await midShot('面板', 0)
      await a.key('Escape', 'Esc 关掉')
      await sleep(300)
    })

    // 12. 打开导出菜单（版本用默认的）
    await step('草稿卷', '点「导出」', async (a) => {
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
      const sel = page.locator('select[aria-label="PDF 版本"]')
      a.note((await sel.isVisible().catch(() => false)) ? `顶栏「PDF 版本」现在是「${await sel.evaluate((e) => e.options[e.selectedIndex].text)}」` : '顶栏看不到「PDF 版本」下拉框')
      const exp = page.locator('header.topbar').getByRole('button', { name: '导出', exact: true })
      await a.click(exp, '导出')
      await sleep(500)
      const items = await page.locator('.eqb-menu [role=menuitem]').allInnerTexts().catch(() => [])
      a.note(`菜单项：${items.map((s) => s.trim()).join('、')}`)
    })

    // 13. 下载题卷
    await step('草稿卷', '下载题卷 PDF', async (a) => {
      const item = page.getByRole('menuitem', { name: /^下载 PDF/ })
      await a.click(item, (await item.innerText()).trim())
      await midShot('点完-0.3秒', 300)
      await sleep(6000)
    })

    // 14. 换成纯答案版（要答案和解析）
    await step('草稿卷', '换成「纯答案版」', async (a) => {
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
      // 窄屏页面里有两个同名下拉框（顶栏一个藏着，「⋯」面板里一个），只取看得见的那个
      const sel = page.locator('select[aria-label="PDF 版本"]:visible').first()
      if (!(await sel.isVisible().catch(() => false))) {
        // 窄屏：下拉框收在顶栏「⋯」面板里
        a.note('顶栏看不到「PDF 版本」下拉框，到「⋯」面板里找')
        await a.click(page.locator('.draft-more-menu-trigger').first(), '⋯（草稿卷更多信息）')
        await sleep(500)
        if (!(await sel.isVisible().catch(() => false))) { a.note('「⋯」面板里也看不到「PDF 版本」'); throw new Error('PDF 版本下拉框不在屏上') }
        await a.choose(sel, '纯答案版', 'PDF 版本')
        await sleep(300)
        if (await page.locator('.draft-more-menu-panel').first().isVisible().catch(() => false)) {
          a.note('选完以后「⋯」面板还开着')
          await a.key('Escape', 'Esc 关掉面板')
        }
      } else {
        await a.choose(sel, '纯答案版', 'PDF 版本')
      }
      await midShot('换完-1秒', 1000)
      await waitPreview(a, '换版本')
    })

    // 15. 下载答案
    await step('草稿卷', '下载答案 PDF', async (a) => {
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
      await a.click(page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }), '导出')
      await sleep(400)
      const items = await page.locator('.eqb-menu [role=menuitem]').allInnerTexts().catch(() => [])
      a.note(`菜单项：${items.map((s) => s.trim()).join('、')}`)
      await a.click(page.getByRole('menuitem', { name: /^下载 PDF/ }), (items[0] || '下载 PDF').trim())
      await midShot('点完-0.3秒', 300)
      await sleep(6000)
    })

    const sum = (k) => steps.reduce((s, x) => s + x[k], 0)
    result.widths[width] = {
      steps, totals: { steps: steps.length, actionSteps: steps.filter((s) => s.clicks + s.keys > 0).length, clicks: sum('clicks'), keys: sum('keys'), scrolls: sum('scrolls'), failed: steps.filter((s) => !s.ok).map((s) => s.id) },
      pageErrors: log.errors,
    }
    console.log(`w${width}`, JSON.stringify(result.widths[width].totals))
    await context.close()
  }

  // ---------- 状态 ----------
  for (const width of ONLY ? [] : [1440, 390]) {
    const sfx = width < 500 ? '390' : '1440'
    const { context, page, log } = await newPage(width)
    await login(page, rig.base)
    const shot = async (id, how, fn) => {
      const rec = { id, width, how }
      try { await fn(rec) } catch (e) { rec.failure = String(e).split('\n')[0].slice(0, 240) }
      const file = `state-${id}-${sfx}.png`
      await page.screenshot({ path: path.join(SHOTS, file) }).catch(() => {})
      rec.shot = `shots/${file}`
      rec.url = page.url().replace(rig.base, '')
      rec.notices = await page.evaluate(listNotices).catch(() => [])
      rec.text = (await page.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText).catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 300)
      rec.downloads = log.downloads.splice(0); rec.dialogs = log.dialogs.splice(0); rec.popups = log.popups.splice(0)
      result.states.push(rec)
      console.log(`state ${id} ${sfx} ${rec.failure ? 'FAIL ' + rec.failure : 'ok'}`)
      await page.unrouteAll({ behavior: 'ignoreErrors' })
    }

    await shot('home-loading', '把 /api/question-groups 延迟 8 秒，打开首页 2.5 秒时截图', async () => {
      await page.route('**/api/question-groups*', async (r) => { await sleep(8000); await r.fallback().catch(() => {}) })
      await page.goto(rig.base + '/'); await sleep(2500)
    })
    await sleep(6000)
    await shot('home-error', '让 /api/question-groups 返回 500，打开首页（这时草稿卷里实际有几组记在 draftActual）', async (rec) => {
      rec.draftActual = await draftState(page)
      await page.route('**/api/question-groups*', (r) => r.fulfill({ status: 500, body: 'boom' }))
      await page.goto(rig.base + '/'); await settle(page, 2500)
    })
    await shot('home-noresult', `搜「zzqqxx 不存在的题」`, async () => {
      await page.goto(rig.base + '/'); await page.locator('.concierge-intent-input').waitFor(); await settle(page, 1500)
      const i = page.locator('.concierge-intent-input'); await i.fill('zzqqxx 不存在的题'); await i.press('Enter'); await settle(page, 2500)
    })
    await shot('home-natural-query', '搜输入框占位符里那句话「找一道讲生态恢复的阅读 C，主旨概括」（测试数据只有 4 篇）', async () => {
      await page.goto(rig.base + '/'); await page.locator('.concierge-intent-input').waitFor(); await settle(page, 1500)
      const i = page.locator('.concierge-intent-input'); await i.fill('找一道讲生态恢复的阅读 C，主旨概括'); await i.press('Enter'); await settle(page, 2500)
    })
    await shot('home-add-error', '让加入草稿卷的接口返回 500，在结果行点 B篇 的 +', async () => {
      await page.goto(rig.base + '/'); await page.locator('.concierge-intent-input').waitFor(); await settle(page, 1500)
      const i = page.locator('.concierge-intent-input'); await i.fill(QUERY); await i.press('Enter'); await settle(page, 1500)
      await page.route('**/api/draft-papers/**/items*', (r) => r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : r.fallback())
      await page.locator('.concierge-group-row').filter({ hasText: 'B篇' }).locator('.concierge-action-add').click()
      await sleep(1500)
    })
    await shot('paper-preview-error', '直接打开整卷预览地址 ?view=paper-browse&paperId=paper-2026-i（测试数据里这份卷没有可预览的卷面）', async () => {
      await page.goto(rig.base + '/?view=paper-browse&paperId=paper-2026-i'); await settle(page, 4000)
    })
    await shot('draft-empty', '清空草稿卷后直接打开 ?view=draft-paper（右下草稿丸在 0 组时不能点）', async (rec) => {
      await clearDraft(page)
      await page.goto(rig.base + '/'); await settle(page, 1500)
      rec.pillDisabled = await page.locator('.basket-chip').isDisabled().catch(() => null)
      await page.goto(rig.base + '/?view=draft-paper'); await page.getByText('还没有题组').first().waitFor({ timeout: 30000 }).catch(() => {}); await settle(page, 1500)
    })
    if (width < 500) { await context.close(); continue } // 草稿卷里的状态只在宽屏拍：本地接口出分页很慢，两种宽度都拍时接口中途断过
    await seedDraft(page, [GROUPS[0], GROUPS[2], GROUPS[3]])
    await shot('draft-opening', '草稿卷里有 3 组时打开草稿卷，0.5 秒时截图', async () => {
      await page.goto(rig.base + '/?view=draft-paper'); await sleep(500)
    })
    await page.locator('[aria-label="更多题组操作"]').first().waitFor({ timeout: 150000 }).catch(() => {}); await settle(page, 1200)
    await shot('export-waiting', '把出 PDF 的接口延迟 5 秒，点「导出 → 下载 PDF」，1.5 秒时截图', async () => {
      await page.route('**/print-pdf*', async (r) => { await sleep(5000); await r.fallback() })
      await page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(400)
      await page.getByRole('menuitem', { name: /^下载 PDF/ }).click(); await sleep(1500)
    })
    await sleep(5000)
    await shot('export-error', '让出 PDF 的接口返回 500，点「导出 → 下载 PDF」', async () => {
      await page.route('**/print-pdf*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }))
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(400)
      await page.getByRole('menuitem', { name: /^下载 PDF/ }).click(); await sleep(2500)
    })
    await shot('export-saveas', '点「导出 → 另存为 PDF…」（无头浏览器，系统存文件窗口不会画出来）', async () => {
      await page.keyboard.press('Escape').catch(() => {}); await sleep(300)
      await page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(400)
      await page.getByRole('menuitem', { name: /另存为/ }).click(); await sleep(4000)
    })
    await shot('export-space-dialog', '点「导出 → 保存 PDF 到个人空间」，只打开对话框不保存', async () => {
      await page.keyboard.press('Escape').catch(() => {}); await sleep(300)
      await page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(400)
      await page.getByRole('menuitem', { name: /个人空间/ }).click(); await sleep(1500)
    })
    await shot('export-largecomplete', '版本换成「大字完整版」，等卷面出完，再点「导出 → 下载 PDF（大字完整版）」（测试数据只有阅读题组）', async (rec) => {
      await page.keyboard.press('Escape').catch(() => {}); await sleep(300)
      await page.reload(); await page.locator('[aria-label="更多题组操作"]').first().waitFor({ timeout: 180000 }); await settle(page, 1200)
      await page.locator('select[aria-label="PDF 版本"]').selectOption({ label: '大字完整版' })
      const t0 = Date.now()
      while (Date.now() - t0 < 240000) { await sleep(1000); if (!(await page.getByText('正在生成分页预览').count())) break }
      rec.previewMs = Date.now() - t0
      await settle(page, 800)
      const shotPreview = path.join(SHOTS, 'state-largecomplete-preview-1440.png'); await page.screenshot({ path: shotPreview })
      rec.previewShot = 'shots/state-largecomplete-preview-1440.png'
      rec.previewText = (await page.evaluate(() => document.querySelector('main')?.innerText || '')).trim().replace(/\s+/g, ' ').slice(0, 200)
      await page.locator('header.topbar').getByRole('button', { name: '导出', exact: true }).click(); await sleep(400)
      await page.getByRole('menuitem', { name: /^下载 PDF/ }).click(); await sleep(3000)
    })
    await context.close()
  }
} finally {
  await browser.close()
  await rig.stop()
}

function slug(s) { return s.replace(/[「」（），、。\s]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) }

writeFileSync(JSON_PATH, JSON.stringify(result, null, 1) + '\n')
console.log('写到', path.relative(ROOT, DOC))
process.exit(0)
