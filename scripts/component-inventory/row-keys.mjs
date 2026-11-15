#!/usr/bin/env node
// 行、底部提示在真站上的键盘和读屏实测（构件厂，2026-11-15）。样张舞台上的测试见 row-sheet.mjs、toast-sheet.mjs，
// 这里在测试站上（满数据）走真页面：
// 1. 首页「接着做」：行的整行目标是链接（role、名字、href），按 Enter 去草稿卷；
// 2. 首页「最近上新」卷行：Tab 先到整行目标（按钮，aria-expanded），再到「看整卷」；Enter 展开；
//    展开后 Tab 进题组行：整行目标（链接，去详情）→「+」→「⋯」分别到达；点「⋯」不打开详情；在题组行上按 Enter 去详情；
// 3. 浏览页卷行：整行目标能 Tab 到、Enter 能展开（原来浏览页卷行键盘展不开）；
// 4. 首页搜索结果卷行：整行目标之后下一站是「看整卷」，行首小箭头不进 Tab 顺序；
// 5. 草稿卷：移出一个题组，底部提示进了 role=status 的播报区（ariaSnapshot）；一路 Tab 能到「撤销」；
//    焦点在「撤销」上过了 8 秒还在；按 Esc 收起，焦点回到进提示之前那一处。
// 每一项记 pass / fail 和实测值，写 row-keys-site.json。
//
// 用法：INVENTORY_PORT_OFFSET=66 INVENTORY_SEED=full node scripts/component-inventory/row-keys.mjs
// 输出：design/components-2026-11-13/migrate-row-toast/row-keys-site.json
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, requireFromApp } from './lib.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-row-toast/row-keys-site.json')
const { chromium } = requireFromApp('playwright')
const rig = await startRig({ quiet: true })
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const results = []
const check = (name, pass, value) => { results.push({ name, pass: Boolean(pass), value }); console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(value).slice(0, 300)) }
// 读焦点之前等 200ms：行的底色有 120ms 的过渡（--motion-fast），马上读会读到过渡中间的值。
const active = async (page) => { await sleep(200); return readActive(page) }
const readActive = (page) => page.evaluate(() => {
  const e = document.activeElement
  return {
    tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 80), name: e.getAttribute('aria-label') || e.textContent.trim().slice(0, 40),
    expanded: e.getAttribute('aria-expanded'), href: e.getAttribute('href'), focusVisible: e.matches(':focus-visible'),
    rowBg: e.closest('.eqb-row') ? getComputedStyle(e.closest('.eqb-row')).backgroundColor : null,
    inToast: Boolean(e.closest('.eqb-toast')),
  }
})
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage()
  await login(page, rig.base)
  await addDraftItems(page)

  // 5. 草稿卷的撤销提示（先做：草稿卷刚加满三组）
  await page.goto(rig.base + '/?view=draft-paper'); await page.locator('.draft-paper-col').first().waitFor({ timeout: 120000 }); await settle(page, 2500)
  const trigger = page.locator('[aria-label="更多题组操作"]').first()
  await trigger.waitFor({ timeout: 150000 }); await trigger.click(); await sleep(300)
  await page.locator('[role=menuitem]').filter({ hasText: /移除/ }).first().click()
  await page.locator('.draft-undo-toast[data-visible="true"]').first().waitFor({ timeout: 15000 }); await sleep(400)
  check('草稿卷提示：在 role=status / aria-live=polite 的播报区里', await page.evaluate(() => Boolean(document.querySelector('.draft-undo-toast')?.closest('[role="status"][aria-live="polite"]'))), await page.locator('.eqb-toast-region[data-politeness="polite"]').ariaSnapshot())
  // 从页面里一个键开始一路 Tab，数几下到「撤销」
  const start = page.locator('.draft-paper-col button, .draft-paper-col a[href]').last()
  await start.focus(); const before = await active(page)
  let n = 0, reached = null
  for (; n < 120; n += 1) { await page.keyboard.press('Tab'); const a = await active(page); if (a.inToast) { reached = a; break } }
  check('草稿卷提示：一路 Tab 能到「撤销」', reached && /撤销/.test(reached.name), { tabs: n + 1, from: before.name, reached })
  await sleep(9000)
  check('草稿卷提示：焦点在「撤销」上，过了 8 秒还在', (await page.locator('.draft-undo-toast[data-visible="true"]').count()) === 1, null)
  await page.keyboard.press('Escape'); await sleep(400)
  const afterEsc = await active(page)
  check('草稿卷提示：Esc 收起，焦点回到进提示之前那一处（不丢到 body）', (await page.locator('.draft-undo-toast[data-visible="true"]').count()) === 0 && afterEsc.tag !== 'body', afterEsc)

  // 1. 接着做
  await page.goto(rig.base + '/'); await page.locator('.home-row-list').first().waitFor({ timeout: 30000 }); await settle(page, 1500)
  const contHit = page.locator('.home-row-list').first().locator('.home-row > .eqb-row-hit').first()
  const contInfo = await contHit.evaluate((e) => ({ tag: e.tagName.toLowerCase(), name: e.getAttribute('aria-label'), href: e.getAttribute('href') }))
  check('接着做：整行目标是 <a href>，读屏名字照原来的 aria-label', contInfo.tag === 'a' && contInfo.href && contInfo.name, contInfo)
  check('接着做：读屏树', true, await page.locator('.home-row-list').first().ariaSnapshot())
  await contHit.focus(); check('接着做：键盘焦点在整行目标上，整行垫桌色', true, await active(page))
  await page.keyboard.press('Enter'); await settle(page, 1500)
  check('接着做：Enter 走站内跳转到草稿卷', page.url().includes('view=draft-paper'), page.url())

  // 2. 最近上新
  await page.goto(rig.base + '/'); await page.locator('.concierge-paper-list').first().waitFor({ timeout: 30000 }); await settle(page, 1500)
  const recent = page.locator('.concierge-paper-row[data-recent]').first()
  if (await recent.count()) {
    const hit = recent.locator('.concierge-paper-row-head > .eqb-row-hit')
    await hit.focus()
    const a = await active(page)
    check('最近上新：整行目标是按钮，名字是年份 + 卷名，aria-expanded=false', a.tag === 'button' && a.expanded === 'false', a)
    await page.keyboard.press('Tab'); const b = await active(page)
    check('最近上新：下一站是「看整卷」（次要键分开到达）', /看整卷/.test(b.name), b)
    await hit.focus(); await page.keyboard.press('Enter'); await settle(page, 1200)
    check('最近上新：Enter 展开（is-expanded、aria-expanded=true）', await recent.evaluate((e) => e.classList.contains('is-expanded')) && (await hit.getAttribute('aria-expanded')) === 'true', null)
    // 进题组行
    const stops = []
    for (let i = 0; i < 6; i += 1) { await page.keyboard.press('Tab'); stops.push(await active(page)) }
    check('展开后 Tab：看整卷 → 题组行整行目标（链接）→「+」→「⋯」', stops, stops.map((s) => `${s.tag}:${s.name}`))
    const groupHit = recent.locator('.concierge-group-row-line > .eqb-row-hit').first()
    if (await groupHit.count()) {
      const url0 = page.url()
      await recent.locator('.concierge-group-row-line').first().locator('.concierge-group-row-menu-trigger').click(); await sleep(400)
      check('点题组行的「⋯」不打开详情（只开菜单）', page.url() === url0 && (await page.locator('[role=menu]').count()) > 0, page.url())
      await page.keyboard.press('Escape'); await sleep(200)
      await groupHit.focus(); await page.keyboard.press('Enter'); await settle(page, 1500)
      check('题组行整行目标按 Enter 去详情', page.url().includes('view=detail'), page.url())
    }
  } else check('最近上新：首页没有这一块（数据不够）', false, null)

  // 3. 浏览页
  await page.goto(rig.base + '/?view=browse'); await page.locator('.concierge-paper-row-head').first().waitFor({ timeout: 30000 }); await settle(page, 1500)
  const bRow = page.locator('.concierge-paper-row').first()
  const bHit = bRow.locator('.concierge-paper-row-head > .eqb-row-hit')
  await bHit.focus(); const ba = await active(page)
  check('浏览页卷行：整行目标能拿到键盘焦点（原来键盘到不了）', ba.tag === 'button' && ba.focusVisible, ba)
  await page.keyboard.press('Enter'); await settle(page, 1200)
  check('浏览页卷行：Enter 展开', await bRow.evaluate((e) => e.classList.contains('is-expanded')), null)
  await page.keyboard.press(' '); await settle(page, 800)
  check('浏览页卷行：空格收起', !(await bRow.evaluate((e) => e.classList.contains('is-expanded'))), null)

  // 4. 首页搜索结果
  await page.goto(rig.base + '/'); await settle(page, 1500)
  const input = page.locator('.concierge-intent-input')
  await input.fill('2026 阅读'); await input.press('Enter'); await settle(page, 3000)
  const sRow = page.locator('.concierge-paper-row[data-variant="search"]').first()
  if (await sRow.count()) {
    await sRow.locator('.concierge-paper-row-head > .eqb-row-hit').focus()
    const s1 = await active(page); await page.keyboard.press('Tab'); const s2 = await active(page)
    check('搜索结果卷行：整行目标 → 下一站「看整卷」，行首小箭头不进 Tab 顺序', s1.tag === 'button' && !/concierge-row-expand/.test(s2.cls), [s1, s2])
    check('搜索结果卷行：读屏树（小箭头对读屏藏着）', true, await sRow.locator('.concierge-paper-row-head').ariaSnapshot())
  } else check('搜索结果卷行：没出结果', false, null)

  await context.close()
} finally {
  await browser.close()
  await rig.stop()
}
writeFileSync(OUT, JSON.stringify(results, null, 1) + '\n')
console.log('写到', OUT, results.filter((r) => !r.pass).length, '项没过')
process.exit(0)
