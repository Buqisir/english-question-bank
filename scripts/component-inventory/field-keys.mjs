#!/usr/bin/env node
// 字段构件键盘 / 读屏测试（构件厂，2026-11-14）。两处：
// 1. 小舞台（field-harness.mjs #keys）：分段选择的方向键、带原因的下拉的键盘选择、禁用项的原因读屏读不读得到、焦点环、
//    文字输入的标签 / 说明 / 出错连没连上。读屏信息从 Chrome 的无障碍树取（CDP Accessibility.getFullAXTree）。
// 2. 真页面：草稿卷顶栏的「PDF 版本」和「A4 散页 / A3 对折」（1440），以及 390 宽时搬到顶栏下面那一行的同两样。
// 用法：INVENTORY_PORT_OFFSET=62 node scripts/component-inventory/field-keys.mjs
// 输出：design/components-2026-11-13/migrate-field/keys.json，控制台打一张表。
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, requireFromApp } from './lib.mjs'
import { buildHarness, serveHarness } from './field-harness.mjs'
import { startRig } from './rig.mjs'
import { addDraftItems, login, settle, sleep } from './scenarios.mjs'

const rows = []
const check = (where, what, ok, detail = '') => { rows.push({ where, what, ok: Boolean(ok), detail: String(detail) }) }

const focusedInfo = () => {
  const e = document.activeElement
  const cs = e ? getComputedStyle(e) : null
  return e && {
    role: e.getAttribute('role') || e.tagName.toLowerCase(),
    text: (e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 30),
    checked: e.getAttribute('aria-checked'), disabled: e.getAttribute('aria-disabled'), expanded: e.getAttribute('aria-expanded'),
    outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} @${cs.outlineOffset}`,
  }
}

async function axNodes(page) {
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  await cdp.detach()
  return nodes.filter((n) => !n.ignored).map((n) => ({
    role: n.role?.value, name: n.name?.value, description: n.description?.value,
    props: Object.fromEntries((n.properties || []).map((p) => [p.name, p.value?.value])),
  }))
}

const { chromium } = requireFromApp('playwright')
await buildHarness()
const browser = await chromium.launch({ channel: 'chromium' })
let rig
try {
  // ── 1. 小舞台 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' })
    const url = await serveHarness(context)
    const page = await context.newPage()
    await page.goto(url + '#keys'); await page.locator('main').waitFor()
    const W = '小舞台'
    await page.locator('#start').focus()
    await page.keyboard.press('Tab')
    let f = await page.evaluate(focusedInfo)
    check(W, '分段：Tab 进组停在选中项', f.role === 'radio' && f.text === 'A4 散页' && f.checked === 'true', JSON.stringify(f))
    check(W, '分段：焦点环可见（2px 实线，外扩 2px）', f.outline && f.outline.startsWith('2px solid') && f.outline.endsWith('@2px'), f.outline)
    await page.keyboard.press('ArrowRight'); f = await page.evaluate(focusedInfo)
    check(W, '分段：→ 跳过用不了的「A3 对折」，落到「A5 小册」并选上', f.text === 'A5 小册' && f.checked === 'true', JSON.stringify(f))
    await page.keyboard.press('ArrowRight'); f = await page.evaluate(focusedInfo)
    check(W, '分段：→ 到头绕回第一项', f.text === 'A4 散页' && f.checked === 'true', JSON.stringify(f))
    await page.keyboard.press('ArrowLeft'); f = await page.evaluate(focusedInfo)
    check(W, '分段：← 反向同样跳过用不了的项', f.text === 'A5 小册' && f.checked === 'true', JSON.stringify(f))
    await page.keyboard.press('ArrowUp'); f = await page.evaluate(focusedInfo)
    check(W, '分段：↑ 同 ←', f.text === 'A4 散页' && f.checked === 'true', JSON.stringify(f))
    const tabStops = await page.locator('[role=radio][tabindex="0"]').count()
    check(W, '分段：整组只占一个 Tab 位', tabStops === 1, `tabindex=0 的项 ${tabStops} 个`)
    await page.locator('[role=radio]', { hasText: 'A3 对折' }).click({ force: true })
    const stillA4 = await page.locator('[role=radio][aria-checked=true]').innerText()
    check(W, '分段：点用不了的项不换', stillA4 === 'A4 散页', stillA4)

    let ax = await axNodes(page)
    const group = ax.find((n) => n.role === 'radiogroup')
    check(W, '分段：读屏 radiogroup 名字 =「打印形态」，描述带原因', group?.name === '打印形态' && /A3 对折用不了：卷面超过 8 页/.test(group?.description || ''), JSON.stringify(group))
    const a3 = ax.find((n) => n.role === 'radio' && n.name === 'A3 对折')
    check(W, '分段：用不了的 radio 读得到「不可用」和原因', a3?.props.disabled === true && /卷面超过 8 页/.test(a3?.description || ''), JSON.stringify(a3))

    // 带原因的下拉
    await page.keyboard.press('Tab'); f = await page.evaluate(focusedInfo)
    check(W, '下拉：Tab 从分段出来落到触发键', f.role === 'button' && f.text === '大字无听力版', JSON.stringify(f))
    check(W, '下拉：触发键焦点环可见', f.outline && f.outline.startsWith('2px solid'), f.outline)
    ax = await axNodes(page)
    const trig = ax.find((n) => n.role === 'button' && /PDF 版本/.test(n.name || ''))
    check(W, '下拉：触发键读屏名字 =「PDF 版本 + 当前值」，说有弹出菜单', trig?.name === 'PDF 版本 大字无听力版' && trig?.props.hasPopup === 'menu', JSON.stringify(trig))
    await page.keyboard.press('Enter'); await sleep(150); f = await page.evaluate(focusedInfo)
    check(W, '下拉：Enter 打开，焦点落在勾着的那一项', f.role === 'menuitemcheckbox' && f.text.startsWith('大字无听力版') && f.checked === 'true', JSON.stringify(f))
    await page.keyboard.press('ArrowUp'); f = await page.evaluate(focusedInfo)
    check(W, '下拉：↑ 停在用不了的「大字完整版」（禁用项也停）', f.text.startsWith('大字完整版') && f.disabled === 'true', JSON.stringify(f))
    ax = await axNodes(page)
    const dis = ax.find((n) => n.role === 'menuitemcheckbox' && /^大字完整版/.test(n.name || ''))
    check(W, '下拉：用不了的项读得到「不可用」和一行原因', dis?.props.disabled === true && /要有完整的两个听力题组/.test(dis?.description || ''), JSON.stringify(dis))
    await page.keyboard.press('Enter'); await sleep(150)
    const stillOpen = await page.locator('.eqb-option-menu').count()
    check(W, '下拉：在用不了的项上按 Enter 不选、菜单不收', stillOpen === 1 && (await page.evaluate(focusedInfo)).text.startsWith('大字完整版'), `菜单 ${stillOpen}`)
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); f = await page.evaluate(focusedInfo)
    check(W, '下拉：↑↑ 到「省纸版」', f.text.startsWith('省纸版'), JSON.stringify(f))
    await page.keyboard.press('Enter'); await sleep(200); f = await page.evaluate(focusedInfo)
    check(W, '下拉：Enter 选上、菜单收起、焦点回触发键、值变「省纸版」', f.role === 'button' && f.text === '省纸版' && f.expanded === 'false' && (await page.locator('.eqb-option-menu').count()) === 0, JSON.stringify(f))
    await page.keyboard.press('Space'); await sleep(150)
    await page.keyboard.press('Escape'); await sleep(150); f = await page.evaluate(focusedInfo)
    check(W, '下拉：空格打开、Esc 收起，焦点回触发键', f.role === 'button' && f.text === '省纸版' && (await page.locator('.eqb-option-menu').count()) === 0, JSON.stringify(f))

    // 文字输入
    await page.keyboard.press('Tab'); f = await page.evaluate(focusedInfo)
    check(W, '文字输入：焦点环可见', f.role === 'input' && f.outline?.startsWith('2px solid'), f.outline)
    ax = await axNodes(page)
    const tb = ax.find((n) => n.role === 'textbox')
    check(W, '文字输入：标签连上（名字 =「文件名」）、描述 = 出错 + 说明、invalid', tb?.name === '文件名' && /文件名不能空着/.test(tb?.description || '') && /存进个人空间/.test(tb?.description || '') && tb?.props.invalid && tb.props.invalid !== 'false', JSON.stringify(tb))
    check(W, '文字输入：getByLabel 找得到', (await page.getByLabel('文件名').count()) === 1)
    await context.close()
  }

  // ── 2. 真页面：草稿卷 ──
  rig = await startRig({ quiet: true })
  for (const [width, height, W] of [[1440, 900, '草稿卷 1440'], [390, 844, '草稿卷 390']]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN', reducedMotion: 'reduce' })
    const page = await context.newPage()
    await login(page, rig.base)
    await addDraftItems(page)
    await page.goto(rig.base + '/?view=draft-paper')
    await page.locator('[aria-label="更多题组操作"]').first().waitFor({ timeout: 180000 }); await settle(page, 1500)
    const scope = width > 980 ? 'header.topbar' : '.draft-option-row'
    const radios = page.locator(`${scope} [role=radio]`)
    check(W, `「A4 / A3」在 ${scope} 里看得见`, (await radios.count()) === 2 && (await radios.first().isVisible()), await radios.count())
    await radios.filter({ hasText: 'A4 散页' }).focus()
    await page.keyboard.press('ArrowRight'); await sleep(300)
    let f = await page.evaluate(focusedInfo)
    check(W, '分段：→ 选上「A3 对折」', f.text === 'A3 对折' && f.checked === 'true', JSON.stringify(f))
    await page.keyboard.press('ArrowLeft'); await sleep(300); f = await page.evaluate(focusedInfo)
    check(W, '分段：← 回「A4 散页」', f.text === 'A4 散页' && f.checked === 'true', JSON.stringify(f))
    const trigger = page.locator(`${scope} .eqb-option-select-trigger`)
    check(W, '「PDF 版本」看得见', await trigger.isVisible())
    await trigger.focus(); await page.keyboard.press('Enter'); await sleep(300)
    f = await page.evaluate(focusedInfo)
    const before = f.text
    check(W, '下拉：Enter 打开，焦点落在勾着的那一项', f.role === 'menuitemcheckbox' && f.checked === 'true', JSON.stringify(f))
    const box = await page.locator('.eqb-option-menu').boundingBox()
    check(W, '下拉：菜单不出屏', box && box.x >= 0 && box.x + box.width <= width, JSON.stringify(box))
    const ax = await axNodes(page)
    const unavailable = ax.filter((n) => n.role === 'menuitemcheckbox' && n.props.disabled === true)
    check(W, '下拉：用不了的版本读得到「不可用」和原因', unavailable.length > 0 && unavailable.every((n) => (n.description || '').length > 0), unavailable.map((n) => `${n.name}｜${n.description}`).join('；'))
    // 找一个可用、没勾的项：↓ 走，碰到就选
    let picked = null
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('ArrowDown'); await sleep(60)
      f = await page.evaluate(focusedInfo)
      if (f.disabled !== 'true' && f.checked !== 'true') { picked = f.text; break }
    }
    await page.keyboard.press('Enter'); await sleep(400)
    f = await page.evaluate(focusedInfo)
    check(W, '下拉：键盘选另一个版本，焦点回触发键、值跟着变', picked && f.role === 'button' && picked.startsWith(f.text) && f.text !== before, `${before} → ${picked} / 触发键 ${f.text}`)
    await context.close()
  }
} finally {
  await browser.close()
  await rig?.stop?.()
}

writeFileSync(path.join(ROOT, 'design/components-2026-11-13/migrate-field/keys.json'), JSON.stringify(rows, null, 2) + '\n')
for (const r of rows) console.log(`${r.ok ? '过' : '不过'}\t${r.where}\t${r.what}${r.ok ? '' : '\t' + r.detail}`)
const bad = rows.filter((r) => !r.ok).length
console.log(`${rows.length - bad} / ${rows.length} 过`)
process.exit(bad ? 1 : 0)
