#!/usr/bin/env node
// 底部提示 / 撤销构件样张 + 键盘、读屏测试（构件厂，2026-11-15）。
// 舞台的做法和 row-sheet.mjs 一样：用 Vite 的 build 把 app/src/shared-ui/Toast.tsx 的真构件和真 CSS 打成一页
// （.scratch/component-inventory/toast-harness/），用 Playwright 的 route 当静态服务器。
//
// 提示浮在视口底部，一次只显示一条，所以样张是一格一格拍的：每种提示、每种状态叫出来拍底部那一块，最后拼成一张。
// 种类：撤销（带「撤销」键）、做完了（不带键）、做完了带「查看」键、出错带原话和「重试」、字太长截断。
// 状态：静止、撤销键悬停、撤销键键盘焦点（真 Tab 到）、退场中（淡出下沉的一半，不减少动态效果时）。1440 和 390 各一张。
//
// 键盘、读屏（结果写 toast-keys.json）：
// - 页面一打开、提示还没出现时，播报区已经在 <body> 里（role=status、aria-live=polite；出错那块 role=alert）；
// - 提示出现后，读屏树（ariaSnapshot）里播报区里有这句话和「撤销」键；
// - 从页面最后一个键按 Tab 能到「撤销」；
// - 焦点在提示里、鼠标停在提示上：过了停留时长还在；移开以后剩下的时间走完才收起；
// - 焦点在提示里按 Esc：提示收起，焦点回到进提示之前的那个键；焦点不在提示里按 Esc：提示不收（页面上的 Esc 归别人）；
// - 按「撤销」：撤销计数加一，提示收起，焦点回到进提示之前的那个键；
// - 一次只显示一条：第一条还在时叫第二条，第一条收到 onClose('replaced')、页面上只剩一条；
// - 减少动态效果：提示的 transition 是 none。
//
// 用法：node scripts/component-inventory/toast-sheet.mjs
// 输出：design/components-2026-11-13/migrate-row-toast/sheet-toast-new.png、sheet-toast-new-390.png、toast-keys.json
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP, RAW, ROOT, SRC, requireFromApp } from './lib.mjs'

const DIR = path.join(RAW, 'toast-harness')
const DIST = path.join(DIR, 'dist')
const OUT_DIR = path.join(ROOT, 'design/components-2026-11-13/migrate-row-toast')
const SHOTS = path.join(RAW, 'toast-sheet-cells')

const ENTRY = `
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '${SRC}/index.css'
import '${SRC}/App.css'
import { Toast } from '${SRC}/shared-ui/Toast.tsx'
import { RotateCcw } from '${SRC}/icons'

// 字照站上真实的几处写（草稿卷、整卷页相似题栏）。
const KINDS = {
  undo: { message: '题组已移出', kind: 'undo', duration: 8000, action: '撤销' },
  replace: { message: '已替换这篇', kind: 'undo', duration: 8000, action: '撤销' },
  success: { message: '已加入草稿卷', kind: 'success', duration: 2200 },
  saved: { message: '已保存到个人空间', kind: 'success', duration: 6000, action: '查看个人空间' },
  error: { message: '2 篇没加入草稿卷，还勾着', kind: 'error', duration: null, detail: '草稿卷已经有 40 个题组，先删掉几个再加', action: '重试' },
  long: { message: '已把 12 篇加入草稿卷，题目一并带上，另外 3 篇已经在草稿卷里没有重复加入，可以在草稿卷里调整顺序', kind: 'success', duration: 2200 },
}

function App() {
  const params = new URLSearchParams(location.search)
  const duration = params.get('duration')
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)
  const [log, setLog] = useState([])
  const add = (s) => setLog((l) => [...l, s])
  const props = (key, slot, set) => {
    const k = slot ? KINDS[slot.kind] : null
    return {
      message: k ? k.message : null,
      token: slot?.at,
      kind: k?.kind,
      detail: k?.detail ?? null,
      duration: duration ? Number(duration) : (k?.duration ?? null),
      className: 'demo-toast-' + key,
      action: k?.action ? { label: k.action, icon: k.action === '查看个人空间' ? undefined : <RotateCcw size={16} aria-hidden="true" />, onClick: () => { add('action-' + key); set(null) } } : undefined,
      onClose: (reason) => { add('close-' + key + '-' + reason); set(null) },
    }
  }
  return (
    <main>
      <p id="log" data-log={log.join(',')}>{log.join(' · ')}</p>
      <div className="bar">
        {Object.keys(KINDS).map((kind) => (
          <button key={kind} id={'show-' + kind} onClick={() => setA({ kind, at: Date.now() })}>出 {kind}</button>
        ))}
        <button id="show-second" onClick={() => setB({ kind: 'success', at: Date.now() })}>出第二条（另一个件）</button>
        <button id="last">页面上最后一个键</button>
      </div>
      <Toast {...props('a', a, setA)} />
      <Toast {...props('b', b, setB)} />
    </main>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
`

const PAGE_CSS = `
body{margin:0;background:var(--eqb-color-bg);color:var(--eqb-color-text);min-height:100vh}
main{padding:24px}
.bar{display:flex;flex-wrap:wrap;gap:8px}
#log{font-size:12px;color:var(--eqb-color-text-muted);min-height:18px}
`

async function buildHarness() {
  rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true })
  writeFileSync(path.join(DIR, 'entry.jsx'), ENTRY)
  writeFileSync(path.join(DIR, 'page.css'), PAGE_CSS)
  writeFileSync(path.join(DIR, 'index.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./page.css"><title>toast harness</title></head><body><div id="root"></div><script type="module" src="./entry.jsx"></script></body></html>')
  const { build } = requireFromApp('vite')
  const react = requireFromApp('@vitejs/plugin-react')
  const nm = path.join(APP, 'node_modules')
  await build({
    root: DIR, configFile: false, logLevel: 'warn', base: './',
    plugins: [(react.default ?? react)()],
    resolve: { alias: [{ find: /^(react|react-dom)(\/.*)?$/, replacement: `${nm}/$1$2` }] },
    build: { outDir: DIST, emptyOutDir: true, minify: false },
  })
}

async function serve(context) {
  const origin = 'http://toast-harness.local'
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }
  await context.route(`${origin}/**`, (route) => {
    const url = new URL(route.request().url())
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname))
    if (!file.startsWith(DIST) || !existsSync(file)) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ status: 200, contentType: types[path.extname(file)] ?? 'application/octet-stream', body: readFileSync(file) })
  })
  return `${origin}/`
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await buildHarness()
mkdirSync(OUT_DIR, { recursive: true })
rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS, { recursive: true })
const { chromium } = requireFromApp('playwright')
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const keys = {}
try {
  // ── 样张 ──
  for (const [width, height, suffix] of [[1440, 900, ''], [390, 844, '-390']]) {
    const cells = []
    const shotToast = async (page, name, cap) => {
      const t = page.locator('.eqb-toast').last()
      const b = await t.boundingBox()
      const file = path.join(SHOTS, `${name}${suffix}.png`)
      const x = Math.max(0, b.x - 24), y = Math.max(0, b.y - 24)
      await page.screenshot({ path: file, clip: { x, y, width: Math.min(width - x, b.width + 48), height: Math.min(height - y, b.height + 48) } })
      const m = await t.evaluate((e) => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return { rect: [r.x, r.y, r.width, r.height].map((n) => Math.round(n)), bottomGap: Math.round(innerHeight - r.bottom), bg: cs.backgroundColor, shadow: cs.boxShadow, radius: cs.borderRadius, opacity: cs.opacity, transform: cs.transform } })
      cells.push({ name, cap, file, m })
    }
    // 不减少动态效果的一页拍各种提示和键的状态；停留时长放长，免得拍着拍着收了。
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'no-preference' })
    const url = await serve(context)
    const page = await context.newPage()
    await page.goto(url + '?duration=600000'); await page.locator('#last').waitFor()
    await page.evaluate(() => document.fonts.ready)
    for (const [kind, cap] of [['undo', '撤销：题组已移出 · 撤销'], ['replace', '撤销：已替换这篇 · 撤销'], ['success', '做完了：已加入草稿卷（不带键）'], ['saved', '做完了带键：已保存到个人空间 · 查看个人空间'], ['error', '出错：自己的话 + 服务器原话 + 重试（读屏马上念）'], ['long', '字太长：一行截断，整句在 title 和读屏里']]) {
      await page.locator(`#show-${kind}`).click(); await page.mouse.move(2, 2); await sleep(400)
      await shotToast(page, kind, cap)
    }
    await page.locator('#show-undo').click(); await sleep(400)
    await page.locator('.eqb-toast-action').hover(); await sleep(300)
    await shotToast(page, 'undo-hover', '撤销键悬停（鼠标停在提示上，计时停住）')
    await page.mouse.move(2, 2)
    await page.locator('#last').focus(); await page.keyboard.press('Tab'); await sleep(300)
    await shotToast(page, 'undo-focus', '撤销键键盘焦点（从页面最后一个键按 Tab 到这里）')
    await page.locator('#last').focus()
    // 退场一半：收起后 60ms（退场 120ms）
    await page.locator('#show-success').click(); await sleep(400)
    await page.locator('.eqb-toast-action').count()
    await page.evaluate(() => document.querySelector('#show-second').click()) // 第二条顶掉第一条：第一条退场
    await sleep(60)
    const exiting = page.locator('.eqb-toast[data-visible="false"]')
    if (await exiting.count()) {
      const t = exiting.first(); const b = await t.boundingBox()
      const file = path.join(SHOTS, `exit${suffix}.png`)
      const x = Math.max(0, b.x - 24), y = Math.max(0, b.y - 32)
      await page.screenshot({ path: file, clip: { x, y, width: Math.min(width - x, b.width + 48), height: Math.min(height - y, b.height + 56) } })
      cells.push({ name: 'exit', cap: '被下一条顶掉：旧的一条淡出下沉 8px（--motion-fast），新的一条淡入上浮（--motion-base），叠在同一格', file, m: null })
    }
    await context.close()
    // 减少动态效果：直接出现
    const ctx2 = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
    await serve(ctx2)
    const p2 = await ctx2.newPage()
    await p2.goto(url + '?duration=600000'); await p2.locator('#last').waitFor()
    await p2.locator('#show-undo').click(); await p2.mouse.move(2, 2); await sleep(30)
    await shotToast(p2, 'undo-reduced', '减少动态效果：点完 30ms 已经完全出现（不淡入、不上浮）')
    keys[`reducedMotion${suffix}`] = await p2.locator('.eqb-toast').last().evaluate((e) => { const cs = getComputedStyle(e); return { transitionDuration: cs.transitionDuration, transitionProperty: cs.transitionProperty, transform: cs.transform, opacity: cs.opacity } })
    await ctx2.close()
    keys[`sheetMeasure${suffix}`] = cells.map((c) => ({ name: c.name, ...c.m }))

    // 拼版：拼版页颜色写死只在这个脚本里，不进产品代码。
    const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#F3F6F8;font:14px/1.5 Inter,"PingFang SC","Noto Sans CJK SC",sans-serif;color:#1B2B33;width:${width === 1440 ? 1200 : 760}px}
h1{font-size:18px;margin:0 0 4px}p.lead{margin:0 0 16px;color:#5A6C75;font-size:13px}
.grid{display:grid;grid-template-columns:${width === 1440 ? '1fr 1fr' : '1fr'};gap:16px}
figure{margin:0;background:#fff;border-radius:12px;padding:12px}figcaption{font-size:12px;color:#5A6C75;margin-bottom:8px}
img{display:block;max-width:100%;zoom:0.5;border:1px dashed #DCE6EB}
</style><h1>底部提示 / 撤销 · 样张（shared-ui/Toast.tsx）· ${width} 宽</h1>
<p class="lead">每一格是真构件在页面底部叫出来以后截的那一块（2 倍图按 1 倍显示，虚线框是截图边）。白底、e3、8 圆角，16px 图标 + 一行 14px 次要灰字，行尾一个墨字小号键。${width === 1440 ? '视口底部正中，离底 24。' : '窄屏左右各留 16、宽度占满，离底 16（加手机底部安全区）。'}</p>
<div class="grid">${cells.map((c) => `<figure><figcaption>${c.cap}</figcaption><img src="${pathToFileURL(c.file).href}"></figure>`).join('')}</div>`
    const htmlFile = path.join(RAW, `toast-sheet${suffix}.html`)
    writeFileSync(htmlFile, html)
    const sp = await browser.newPage({ viewport: { width: width === 1440 ? 1248 : 808, height: 900 }, deviceScaleFactor: 2 })
    await sp.goto(pathToFileURL(htmlFile).href); await sp.waitForLoadState('load')
    await sp.screenshot({ path: path.join(OUT_DIR, `sheet-toast-new${suffix}.png`), fullPage: true })
    await sp.close()
    console.log(width, 'sheet ok', cells.length)
  }

  // ── 键盘、读屏 ──
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' })
  const url = await serve(context)
  const page = await context.newPage()
  const log = () => page.locator('#log').getAttribute('data-log')
  const visible = () => page.locator('.eqb-toast[data-visible="true"]').count()
  await page.goto(url + '?duration=3000'); await page.locator('#last').waitFor()
  keys.regionsBeforeToast = await page.evaluate(() => [...document.querySelectorAll('.eqb-toast-region')].map((r) => ({ role: r.getAttribute('role'), live: r.getAttribute('aria-live'), parent: r.parentElement.tagName.toLowerCase(), children: r.childElementCount })))
  await page.locator('#show-undo').click(); await sleep(300)
  keys.ariaSnapshotUndo = await page.locator('.eqb-toast-region[data-politeness="polite"]').ariaSnapshot()
  keys.toastInsideLiveRegion = await page.evaluate(() => Boolean(document.querySelector('.eqb-toast')?.closest('[aria-live="polite"][role="status"]')))
  // Tab 能到撤销键
  await page.locator('#last').focus(); await page.keyboard.press('Tab')
  keys.tabFromLast = await page.evaluate(() => ({ text: document.activeElement.textContent, inToast: Boolean(document.activeElement.closest('.eqb-toast')), focusVisible: document.activeElement.matches(':focus-visible') }))
  await sleep(4000)
  keys.focusInsideAfter4s = await visible()
  // Esc：焦点在里面 → 收起，焦点回到 #last
  await page.keyboard.press('Escape'); await sleep(300)
  keys.escInside = { visible: await visible(), focus: await page.evaluate(() => document.activeElement.id || document.activeElement.textContent), log: await log() }
  // Esc：焦点不在里面 → 不收
  await page.locator('#show-undo').click(); await sleep(200)
  await page.locator('#last').focus(); await page.keyboard.press('Escape'); await sleep(200)
  keys.escOutside = { visible: await visible() }
  // 撤销：Tab 到撤销键按 Enter → 计数加一、收起、焦点回 #last
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await sleep(300)
  keys.undoByKeyboard = { visible: await visible(), focus: await page.evaluate(() => document.activeElement.id || document.activeElement.textContent), log: await log() }
  // 鼠标停着：过了 3 秒还在；移开以后 3 秒内收起
  await page.locator('#show-undo').click(); await sleep(200)
  await page.locator('.eqb-toast').hover(); await sleep(4000)
  keys.hoverAfter4s = await visible()
  await page.mouse.move(2, 2); await sleep(1000)
  keys.leftAfter1s = await visible()
  await sleep(2600)
  keys.leftAfter3_6s = { visible: await visible(), log: await log() }
  // 没人碰：3 秒收起
  await page.locator('#show-success').click(); await sleep(3500)
  keys.untouchedAfter3_5s = { visible: await visible(), log: await log() }
  // 一次只显示一条
  await page.locator('#show-undo').click(); await sleep(200)
  await page.locator('#show-second').click(); await sleep(400)
  keys.oneAtATime = { toastsInDom: await page.locator('.eqb-toast').count(), visible: await visible(), log: await log() }
  // 出错：放进 assertive（role=alert）那块
  await page.locator('#show-error').click(); await sleep(300)
  keys.errorRegion = await page.evaluate(() => { const t = document.querySelector('.eqb-toast[data-kind="error"]'); const r = t?.closest('.eqb-toast-region'); return r ? { role: r.getAttribute('role'), live: r.getAttribute('aria-live') } : null })
  keys.ariaSnapshotError = await page.locator('.eqb-toast-region[data-politeness="assertive"]').ariaSnapshot()
  await context.close()
} finally {
  await browser.close()
}
writeFileSync(path.join(OUT_DIR, 'toast-keys.json'), JSON.stringify(keys, null, 1) + '\n')
const { sheetMeasure, 'sheetMeasure-390': m390, ...rest } = keys
console.log(JSON.stringify(rest, null, 1))
process.exit(0)
