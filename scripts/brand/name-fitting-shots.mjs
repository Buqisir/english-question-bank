#!/usr/bin/env node
// 名字试穿（BRAND.md §2「流程」里那一步：每个名字做成字标草稿，放进顶栏、登录页、App 图标里看）。
// 给几个名字，每个名字出一张「试穿图」，另出一张所有名字并排的总图。提案 · 单一来源。
//
// 用法：node scripts/brand/name-fitting-shots.mjs "他石/Tashi" "某名" "某名/Latin"
//   斜杠前是中文名（顶栏、登录页放它），斜杠后是拉丁写法，可以没有。
//   --base http://127.0.0.1:5173   用已经在跑的本地网站，不自己起（账号见 NAME_FIT_USER / NAME_FIT_PASSWORD，
//                                   默认是清点用本地网站的 owner 账号）
//   PAPER_MONO_FONT=/path/PaperMono.woff2   本机没装 Paper Mono 时，指给它一个字体文件
//   INVENTORY_PORT_OFFSET=41       自己起本地网站时的端口偏移（默认 41，网页 5340、接口 9953），和别人同时跑的清点网站错开
// 输出：design/brand-2026-10-13/naming-fitting-2026-11-14/fit-<名字>.png、fit-all.png、fit-run.json
//
// 做法照 scripts/component-inventory/ 的拍照脚本：用 rig.mjs 起临时数据库加 Vite 的本地网站，用 owner 账号登录。
// 顶栏和登录页是真实页面，只在截图前用 page.evaluate 改 DOM 里的文字，不改源码；
// 桌面图标、字标草稿、三句话是在一张空白页上用 tokens.css 的记号排出来的示意。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'design/brand-2026-10-13/naming-fitting-2026-11-14')
const TOKENS = path.join(ROOT, 'app/src/shared-ui/tokens.css')
const APP_ICON = path.join(ROOT, 'design/brand-2026-10-13/mascot/app-icon.svg')
const SITE_NAME_SELECTOR = { topbar: 'header.topbar .topbar-brand-title', login: '.login-brand > span' }

// ---------- 参数 ----------
const argv = process.argv.slice(2)
let base = null
const raw = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--base') base = (argv[++i] || '').replace(/\/$/, '')
  else raw.push(argv[i])
}
if (!raw.length) {
  console.error('用法：node scripts/brand/name-fitting-shots.mjs "他石/Tashi" ["某名" ...] [--base http://127.0.0.1:端口]')
  process.exit(2)
}
const NAMES = raw.map((s) => {
  const [zh, ...rest] = s.split(/[/／]/)
  const cn = (zh || '').trim(), latin = rest.join('/').trim()
  const primary = cn || latin
  if (!primary) { console.error(`名字是空的：「${s}」`); process.exit(2) }
  const file = primary.replace(/[\\/:*?"<>|\s]+/g, '-')
  return { cn, latin, primary, label: latin && cn ? `${cn} / ${latin}` : primary, file }
})
const dup = NAMES.map((n) => n.file).filter((f, i, a) => a.indexOf(f) !== i)
if (dup.length) { console.error('名字重复：', dup.join('、')); process.exit(2) }
mkdirSync(OUT, { recursive: true })

// ---------- 本地网站 ----------
// rig.mjs 在模块加载时读端口偏移，所以先设好再动态引入。
if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '41'
const { requireFromApp } = await import('../component-inventory/lib.mjs')
const { startRig, OWNER } = await import('../component-inventory/rig.mjs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const settle = async (page, ms = 1200) => { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await sleep(ms) }
const ACCOUNT = { username: process.env.NAME_FIT_USER || OWNER.username, password: process.env.NAME_FIT_PASSWORD || OWNER.password }
async function login(page, site) {
  await page.goto(site + '/'); await page.locator('#login-username').waitFor({ timeout: 30000 })
  await page.locator('#login-username').fill(ACCOUNT.username); await page.locator('#login-password').fill(ACCOUNT.password)
  await page.locator('.login-submit').click(); await page.locator('.login-card').waitFor({ state: 'detached', timeout: 30000 }); await settle(page, 600)
}

// 本机字体：网站只按名字写 Inter / PingFang SC，不带网页字体文件，显示什么取决于本机装了什么。
const fcMatch = (q) => { try { const r = spawnSync('fc-match', [q], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null } catch { return null } }
// fc-match 找不到某字体时会退回别的字体，所以先用 fc-list 看装没装，再用 fc-match 看中文和等宽字实际退到哪一款。
const fcHas = (family) => { try { const r = spawnSync('fc-list', [family], { encoding: 'utf8' }); return r.status === 0 && r.stdout.trim().length > 0 } catch { return null } }
const FONT_HOST = { inter: fcHas('Inter'), pingfang: fcHas('PingFang SC'), paperMono: fcHas('Paper Mono'), cjkFallback: fcMatch('sans-serif:lang=zh-cn'), mono: fcMatch('monospace') }
let paperMonoFace = ''
const pmFile = process.env.PAPER_MONO_FONT
if (pmFile) {
  if (!existsSync(pmFile)) { console.error('PAPER_MONO_FONT 指的文件不存在：', pmFile); process.exit(2) }
  const ext = path.extname(pmFile).slice(1).toLowerCase()
  const fmt = { woff2: 'woff2', woff: 'woff', otf: 'opentype', ttf: 'truetype' }[ext] || 'opentype'
  const mime = { woff2: 'font/woff2', woff: 'font/woff', otf: 'font/otf', ttf: 'font/ttf' }[ext] || 'font/otf'
  paperMonoFace = `@font-face { font-family: "Paper Mono"; src: url(data:${mime};base64,${readFileSync(pmFile).toString('base64')}) format("${fmt}"); font-weight: 100 800; }`
}

const tokensCss = readFileSync(TOKENS, 'utf8')
const iconUri = 'data:image/svg+xml;base64,' + readFileSync(APP_ICON).toString('base64')
const png = (buf) => 'data:image/png;base64,' + buf.toString('base64')
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// 在真实页面里：找到显示产品名的元素，记下原文和实算样式，看它显示不显示。
function inspectName(sel) {
  const els = [...document.querySelectorAll(sel)]
  const vis = els.filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
  const e = vis[0] || els[0]
  if (!e) return { found: false, visible: false }
  const cs = getComputedStyle(e), r = e.getBoundingClientRect()
  return {
    found: true, visible: vis.length > 0, text: e.textContent.trim(),
    font: `${cs.fontSize}/${cs.fontWeight}`, family: cs.fontFamily, color: cs.color, lineHeight: cs.lineHeight,
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
  }
}
const setName = (page, sel, text) => page.evaluate(([s, t]) => { for (const e of document.querySelectorAll(s)) e.textContent = t }, [sel, text])
async function clipShot(page, locator, { padX = 0, padY = 0, fullWidth = false, maxW = null } = {}) {
  const b = await locator.boundingBox().catch(() => null)
  if (!b) return null
  const vp = page.viewportSize()
  const x0 = fullWidth ? 0 : Math.max(0, b.x - padX), y0 = Math.max(0, b.y - padY)
  let x1 = fullWidth ? vp.width : Math.min(vp.width, b.x + b.width + padX)
  if (maxW) x1 = Math.min(x1, x0 + maxW)
  const y1 = Math.min(vp.height, b.y + b.height + padY)
  return { buf: await page.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } }), w: Math.round(x1 - x0), h: Math.round(y1 - y0) }
}

const { chromium } = requireFromApp('playwright')
let rig = null
if (!base) { rig = await startRig({ quiet: true }); base = rig.base }
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const ctxOpts = (width, height) => ({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' })
const shots = Object.fromEntries(NAMES.map((n) => [n.file, {}]))
const run = { date: new Date().toISOString(), site: base, names: NAMES.map((n) => n.label), fontsOnThisMachine: FONT_HOST, topbar: {}, login: {}, errors: [] }

try {
  // ---------- 顶栏：首页（找题台），1440 和 390 ----------
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await browser.newContext(ctxOpts(width, height))
    const page = await context.newPage()
    page.on('pageerror', (e) => run.errors.push(`topbar-${width}: ${String(e).slice(0, 200)}`))
    await login(page, base)
    await page.goto(base + '/'); await page.locator('header.topbar').waitFor({ timeout: 30000 }); await settle(page, 1500)
    await page.mouse.move(2, height - 2)
    const before = await page.evaluate(inspectName, SITE_NAME_SELECTOR.topbar)
    const markVisible = await page.evaluate(() => { const m = document.querySelector('header.topbar .topbar-brand-mark'); return !!(m && m.getClientRects().length) })
    run.topbar[`w${width}`] = { page: '首页（找题台）/', before, markVisible }
    if (width === 1440) run.bodyFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
    for (const n of NAMES) {
      if (before.visible) await setName(page, SITE_NAME_SELECTOR.topbar, n.primary)
      await sleep(150)
      const bar = page.locator('header.topbar').first()
      const after = await page.evaluate(inspectName, SITE_NAME_SELECTOR.topbar)
      shots[n.file][`top${width}`] = { ...(await clipShot(page, bar, { fullWidth: true })), real: before.visible, after }
      if (width === 1440) shots[n.file].topLeft = await clipShot(page, bar, { fullWidth: true, maxW: 560 })
    }
    if (before.visible) await setName(page, SITE_NAME_SELECTOR.topbar, before.text)
    await context.close()
  }

  // ---------- 登录页：不登录，1440 和 390 ----------
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await browser.newContext(ctxOpts(width, height))
    const page = await context.newPage()
    page.on('pageerror', (e) => run.errors.push(`login-${width}: ${String(e).slice(0, 200)}`))
    await page.goto(base + '/'); await page.locator('.login-card').waitFor({ timeout: 30000 }); await settle(page, 2500)
    await page.mouse.move(2, height - 2)
    const before = await page.evaluate(inspectName, SITE_NAME_SELECTOR.login)
    run.login[`w${width}`] = { before, title: await page.evaluate(() => document.querySelector('.login-card h1')?.textContent?.trim() || null) }
    for (const n of NAMES) {
      if (before.found) await setName(page, SITE_NAME_SELECTOR.login, n.primary)
      await sleep(150)
      shots[n.file][`login${width}`] = { buf: await page.screenshot(), w: width, h: height, real: before.found }
      if (width === 1440 && before.found) shots[n.file].loginBrand = await clipShot(page, page.locator('.login-brand'), { padX: 24, padY: 16, maxW: 320 })
    }
    await context.close()
  }

  // ---------- 拼图：每个名字一张，再一张并排 ----------
  const family = run.bodyFamily || 'Inter, "PingFang SC", "Hiragino Sans GB", ui-sans-serif, system-ui, sans-serif'
  const top1440 = run.topbar.w1440.before, loginB = run.login.w1440.before
  const css = `
${tokensCss}
${paperMonoFace}
* { box-sizing: border-box; }
body { margin: 0; background: var(--eqb-color-bg); color: var(--eqb-color-text); font-family: ${family}; font-size: var(--eqb-font-size-sm); line-height: 1.5; -webkit-font-smoothing: antialiased; }
.sheet { padding: var(--eqb-space-5); display: flex; flex-direction: column; gap: var(--eqb-space-5); }
h1 { margin: 0; font-size: var(--eqb-font-size-xl); font-weight: 600; line-height: 1.25; }
.meta { color: var(--eqb-color-text-muted); font-size: var(--eqb-font-size-xs); }
section { background: var(--eqb-color-paper); border: 1px solid var(--eqb-color-border); border-radius: 12px; padding: var(--eqb-space-4); display: flex; flex-direction: column; gap: var(--eqb-space-3); }
.head { display: flex; align-items: baseline; gap: var(--eqb-space-2); flex-wrap: wrap; }
.head b { font-size: var(--eqb-font-size-md); font-weight: 600; }
.tag { font-size: var(--eqb-font-size-xs); padding: 1px var(--eqb-space-2); border-radius: 999px; white-space: nowrap; }
.tag.real { background: var(--eqb-color-desk); color: var(--eqb-color-text); }
.tag.mock { background: var(--eqb-color-warning-soft); color: var(--eqb-color-warning-text); border: 1px dashed var(--eqb-color-warning); }
.tag.miss { background: var(--eqb-color-danger-soft); color: var(--eqb-color-danger-text); }
.note { color: var(--eqb-color-text-muted); font-size: var(--eqb-font-size-xs); }
.sub { font-size: var(--eqb-font-size-xs); color: var(--eqb-color-text-secondary); font-weight: 600; }
.frame { border: 1px solid var(--eqb-color-border-subtle); display: block; }
.row { display: flex; gap: var(--eqb-space-4); align-items: flex-start; flex-wrap: wrap; }
.col { display: flex; flex-direction: column; gap: var(--eqb-space-1); }
.wall { display: flex; gap: var(--eqb-space-5); padding: var(--eqb-space-5); border-radius: 12px; }
.wall.light { background: var(--eqb-color-desk); color: var(--eqb-color-text); }
.wall.dark { background: var(--eqb-color-text); color: var(--eqb-color-paper); }
.app { width: 76px; display: flex; flex-direction: column; align-items: center; gap: 5px; }
.app img { width: 60px; height: 60px; display: block; }
.app span { width: 76px; font-size: 11px; line-height: 13px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app.empty .ph { width: 60px; height: 60px; border-radius: 13px; background: currentColor; opacity: 0.12; }
table.wm { border-collapse: collapse; }
table.wm td, table.wm th { border-top: 1px solid var(--eqb-color-border-subtle); padding: var(--eqb-space-3) var(--eqb-space-4) var(--eqb-space-3) 0; text-align: left; vertical-align: middle; }
table.wm th { font-size: var(--eqb-font-size-xs); color: var(--eqb-color-text-muted); font-weight: 400; white-space: nowrap; }
.wm-cell { font-weight: 600; line-height: 1.2; white-space: nowrap; color: var(--eqb-color-text); }
.f-inter { font-family: ${family}; }
.f-mono { font-family: "Paper Mono", monospace; }
.say p { margin: 0; font-size: var(--eqb-font-size-sm); line-height: 1.5; }
.grid-all { display: grid; gap: var(--eqb-space-3) var(--eqb-space-4); align-items: center; }
.grid-all > .h { font-size: var(--eqb-font-size-xs); color: var(--eqb-color-text-muted); }
.grid-all > .nm { font-size: var(--eqb-font-size-md); font-weight: 600; }
`
  const fontReport = async (page) => page.evaluate(async () => {
    await document.fonts.ready
    try { await document.fonts.load('40px "Paper Mono"') } catch {}
    const ctx = document.createElement('canvas').getContext('2d')
    const w = (f) => { ctx.font = `40px ${f}`; return ctx.measureText('Tashi 0123 mmmWWWiii').width }
    const paperMono = w('"Paper Mono", serif') !== w('serif') || w('"Paper Mono", sans-serif') !== w('sans-serif')
    const inter = w('Inter, serif') !== w('serif')
    return { paperMono, inter }
  })
  // 先探一次字体，决定字标那一块怎么标。
  const probeCtx = await browser.newContext(ctxOpts(800, 400))
  const probe = await probeCtx.newPage()
  await probe.setContent(`<style>${css}</style><body>probe</body>`)
  const fonts = await fontReport(probe)
  await probeCtx.close()
  run.fontsInSheet = fonts
  const pmMiss = !fonts.paperMono
  const pmNote = pmMiss
    ? `<span class="tag miss">缺字体</span><span class="note">本机没有 Paper Mono（仓库里也没有字体文件，PAPER_MONO_FONT 没指）。这一行实际显示的是回退等宽字${FONT_HOST.mono ? `（fc-match：${esc(FONT_HOST.mono)}）` : ''}，<b>不能当 Paper Mono 看</b>；补上字体后重跑。</span>`
    : `<span class="note">Paper Mono 已加载${pmFile ? `（${esc(path.basename(pmFile))}）` : '（本机安装）'}。它没有中文，中文字回退到本机中文字体。</span>`
  const cjkName = (FONT_HOST.cjkFallback || '').match(/"([^"]+)"/)?.[1] || '本机别的中文字体'
  const cjkNote = FONT_HOST.pingfang ? '' : `本机没有 PingFang SC，中文由 ${esc(cjkName)} 显示（fc-match），和老师在苹果设备上看到的字形不同。`

  const img = (s, scale = 1, cls = 'frame') => s ? `<img class="${cls}" src="${png(s.buf)}" style="width:${Math.round(s.w * scale)}px;height:${Math.round(s.h * scale)}px">` : '<span class="tag miss">没拍到</span>'
  const realTag = (ok) => ok ? '<span class="tag real">真实页面 · 只改 DOM 文字</span>' : '<span class="tag mock">示意，不是真实页面</span>'
  const app = (text) => `<div class="app"><img src="${iconUri}" alt=""><span data-label>${esc(text)}</span></div>`
  const appPh = (text) => `<div class="app empty"><div class="ph"></div><span>${esc(text)}</span></div>`
  const walls = (n) => {
    const labels = [n.primary, ...(n.latin && n.cn ? [n.latin] : [])]
    const one = (cls) => `<div class="wall ${cls}">${appPh('日历')}${labels.map(app).join('')}${appPh('微信读书')}</div>`
    return `<div class="row">${one('light')}${one('dark')}</div>`
  }
  const wmRows = (text, label) => {
    const cells = (cls) => [16, 28, 64].map((px) => `<td><span class="wm-cell ${cls}" style="font-size:${px}px">${esc(text)}</span></td>`).join('')
    return `<tr><th>${esc(label)} · Inter（网站字体栈）</th>${cells('f-inter')}</tr><tr><th>${esc(label)} · Paper Mono${pmMiss ? '（缺，见上）' : ''}</th>${cells('f-mono')}</tr>`
  }
  const topCaption = (w) => {
    const t = run.topbar[`w${w}`].before
    if (!t.found) return `<span class="note">这一宽度的顶栏里找不到放产品名的元素（${SITE_NAME_SELECTOR.topbar}）。</span>`
    if (!t.visible) return `<span class="note">这一宽度下顶栏不显示产品名（元素在，但被样式藏起来了），图里是原样，没有名字可换。</span>`
    return `<span class="note">原文「${esc(t.text)}」→ 换成「NAME」；实算字号 ${t.font}${run.topbar[`w${w}`].markVisible ? '，左边是现有图形标志' : '，这一宽度下图形标志不显示'}。</span>`
  }

  // 三句话：中文名紧贴汉字，拉丁写法两边留一个空格（中西混排的常见写法）。
  const say = (name) => {
    const sp = /^[\x00-\x7F]+$/.test(name) ? ' ' : ''
    return [`我用${sp}${name}${sp}备的课`, `你打开${sp}${name}${sp}看看`, `${name}${sp}上有这套卷`].map((t) => `<p>${esc(t)}</p>`).join('')
  }
  for (const n of NAMES) {
    const s = shots[n.file]
    const topNote = (w) => topCaption(w).replace('NAME', esc(n.primary))
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="sheet" style="width:1520px">
<div class="col"><h1>名字试穿 · ${esc(n.label)}</h1>
<div class="meta">提案 · 单一来源 · ${run.date.slice(0, 10)} · scripts/brand/name-fitting-shots.mjs · 本地测试网站（临时数据），Chromium 2x，减弱动效。${cjkNote}</div></div>

<section><div class="head"><b>1 顶栏</b>${realTag(top1440.visible)}<span class="note">首页（找题台）的顶栏，只在截图前改了 DOM 里的文字，源码没动。</span></div>
<div class="sub">1440 宽</div>${img(s.top1440)}${topNote(1440)}
<div class="sub">390 宽</div>${img(s.top390)}${topNote(390)}</section>

<section><div class="head"><b>2 登录页</b>${realTag(loginB.found)}<span class="note">名字放在页面左上角标志旁边（现在写「${esc(loginB.text || '?')}」，实算 ${loginB.font || '?'}）；卡片里的标题「${esc(run.login.w1440.title || '')}」没动。整页按 0.6 倍缩小，右边是左上角那一块的原大。</span></div>
<div class="row"><div class="col"><div class="sub">1440 × 900（缩到 0.6）</div>${img(s.login1440, 0.6)}</div>
<div class="col"><div class="sub">390 × 844（缩到 0.64）</div>${img(s.login390, 0.64)}</div>
<div class="col"><div class="sub">左上角原大（1440）</div>${img(s.loginBrand)}</div></div></section>

<section><div class="head"><b>3 手机桌面图标</b><span class="tag mock">示意，不是真实页面</span><span class="note">App 图标是 design/brand-2026-10-13/mascot/app-icon.svg，60px；下面一行 11px，单行，宽 76px（目测，照手机桌面的样子），放不下就用省略号截断。灰块是别的 App 的占位。桌面底色借界面记号（桌面色、墨），不是手机壁纸。</span></div>
${walls(n)}<div class="note" data-trunc></div></section>

<section><div class="head"><b>4 字标草稿</b><span class="tag mock">示意 · 草稿</span><span class="note">没有改字形，只是现成字体直接排；字重 600（取顶栏标题的字重），墨色。16px 那一档看笔画多的字会不会糊（BRAND.md §2 条件 4）。</span></div>
<div class="head">${pmNote}</div>
<table class="wm"><tr><th></th><th>16px</th><th>28px</th><th>64px</th></tr>
${n.cn ? wmRows(n.cn, '中文') : ''}${n.latin ? wmRows(n.latin, '拉丁') : ''}</table>
<div class="note">Inter 没有中文：中文那两行的「Inter」实际是网站字体栈里排在后面的中文字体${cjkNote ? '（本机见页首说明）' : ''}；Paper Mono 也没有中文，中文同样回退。</div></section>

<section class="say"><div class="head"><b>5 三句话</b><span class="tag mock">示意</span><span class="note">界面正文 14px / 400 / 行高 1.5（DESIGN.md §3 UI Body），网站字体栈。</span></div>
${say(n.primary)}${n.latin && n.cn ? `<div class="sub">拉丁写法</div>${say(n.latin)}` : ''}</section>
</div></body></html>`
    const ctx = await browser.newContext(ctxOpts(1568, 200))
    const page = await ctx.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const trunc = await page.evaluate(() => {
      const cut = [...new Set([...document.querySelectorAll('[data-label]')].filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent))]
      const el = document.querySelector('[data-trunc]')
      el.textContent = cut.length ? `被截断：${cut.join('、')}（11px 放不下 76px）` : '没有被截断（11px 在 76px 宽里放得下）。'
      return cut
    })
    s.truncated = trunc
    await page.screenshot({ path: path.join(OUT, `fit-${n.file}.png`), fullPage: true })
    await ctx.close()
    console.log('写出', `fit-${n.file}.png`, trunc.length ? `（图标名被截：${trunc.join('、')}）` : '')
  }

  // ---------- 并排总图 ----------
  const cols = 'auto 560px 390px auto auto auto auto'
  const head = ['名字', '顶栏 1440（左段）', '顶栏 390', '登录页左上角', '桌面图标', '字标 28px · Inter / Paper Mono', '16px · Inter / Paper Mono']
  const rows = NAMES.map((n) => {
    const s = shots[n.file]
    const wm = (px) => [n.cn, n.latin].filter(Boolean).map((t) => `<div><span class="wm-cell f-inter" style="font-size:${px}px">${esc(t)}</span>　<span class="wm-cell f-mono" style="font-size:${px}px">${esc(t)}</span></div>`).join('')
    return `<div class="nm">${esc(n.label)}</div><div>${img(s.topLeft)}</div><div>${img(s.top390)}</div><div>${img(s.loginBrand)}</div>
<div class="wall light" style="padding:var(--eqb-space-3)">${app(n.primary)}${n.latin && n.cn ? app(n.latin) : ''}</div><div class="col">${wm(28)}</div><div class="col">${wm(16)}</div>`
  }).join('\n')
  const allHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="sheet" style="width:max-content">
<div class="col"><h1>名字试穿 · 并排</h1><div class="meta">提案 · 单一来源 · ${run.date.slice(0, 10)} · ${NAMES.length} 个名字 · 顶栏和登录页是真实页面（只改 DOM 文字），图标和字标是示意。${pmMiss ? '本机没有 Paper Mono，标着 Paper Mono 的字是回退等宽字，不能当 Paper Mono 看。' : ''}${cjkNote}</div></div>
<section><div class="grid-all" style="grid-template-columns:${cols}">${head.map((h) => `<div class="h">${h}</div>`).join('')}
${rows}</div></section></div></body></html>`
  const ctx = await browser.newContext(ctxOpts(1600, 200))
  const page = await ctx.newPage()
  await page.setContent(allHtml, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(OUT, 'fit-all.png'), fullPage: true })
  await ctx.close()
  console.log('写出 fit-all.png')
  run.truncatedIconLabels = Object.fromEntries(NAMES.map((n) => [n.label, shots[n.file].truncated || []]))
} finally {
  await browser.close()
  if (rig) await rig.stop()
}
writeFileSync(path.join(OUT, 'fit-run.json'), JSON.stringify(run, null, 1) + '\n')
console.log('写到', path.relative(ROOT, OUT), run.errors.length ? `页面报错 ${run.errors.length} 条，见 fit-run.json` : '')
process.exit(0)
