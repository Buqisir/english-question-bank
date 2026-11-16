#!/usr/bin/env node
// 「獭石」字标第二轮（BRAND.md 第 92 条定方向，第 121 条「现在就做」）。提案 · 单一来源。
//
// 做什么：
//   1. 按第 92 条取两档字形：大档 = Noto Sans SC wght 600、不加字距；小档 = 第一轮的 D 小档（wght 400、字距 +60、「赖」350）。
//   2. 15px 逐格画版：读手画的 design/brand-2026-10-13/wordmark-2026-11-16/pixel-15.json，出 SVG 和 1x PNG。
//   3. 组合换成现在的新脸标志 logo/mint/mark.svg（第一轮图里是旧脸）；普通屏的横排小组合用 logo/mint/mark-32 逐格版配 15px 逐格字。
//   4. 在本地临时网站的真实顶栏、登录页左上角拍对比（只在截图前改 DOM，不改源码），2x 屏和 1x 屏各一张。
//
// 用法：
//   WORDMARK_FONTSOURCE_DIR=<装了 @fontsource-variable/noto-sans-sc 的 node_modules 目录> \
//   EQB_FONTTOOLS_PATH=<装了 fonttools 和 brotli 的目录> \
//   node scripts/brand/wordmark-round2.mjs [--svg-only]
// 字体和 fontTools 的装法同 scripts/brand/wordmark-drafts.mjs 文件开头。不进仓库。
// 输出：design/brand-2026-10-13/wordmark-2026-11-16/ 下的 svg/、png/、compare.png、lockups.png、run.json
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'design/brand-2026-10-13/wordmark-2026-11-16')
const SVG_DIR = path.join(OUT, 'svg'), PNG_DIR = path.join(OUT, 'png')
const MARK = path.join(ROOT, 'design/brand-2026-10-13/logo/mint/mark.svg')
const MARK32 = path.join(ROOT, 'design/brand-2026-10-13/logo/mint/mark-32.svg')
const GLYPH_TOOL = path.join(ROOT, 'scripts/brand/wordmark-glyphs.py')
const PIXEL = JSON.parse(readFileSync(path.join(OUT, 'pixel-15.json'), 'utf8'))
const C = { ink: '#191D18', mistWhite: '#F2FAF6', deepMint: '#2C6E56', page: '#F1F5F7', desk: '#E6EDF0', white: '#FFFFFF' }
const svgOnly = process.argv.includes('--svg-only')
const FS_DIR = process.env.WORDMARK_FONTSOURCE_DIR
if (!FS_DIR || !existsSync(path.join(FS_DIR, '@fontsource-variable/noto-sans-sc'))) {
  console.error('要先设 WORDMARK_FONTSOURCE_DIR（见文件开头）。'); process.exit(2)
}

// ---------- 取轮廓 ----------
const pkgDir = path.join(FS_DIR, '@fontsource-variable/noto-sans-sc')
const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
function sliceFor(ch) {
  const css = readFileSync(path.join(pkgDir, 'index.css'), 'utf8'); const cp = ch.codePointAt(0)
  for (const block of css.split('@font-face').slice(1)) {
    const src = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1], ur = /unicode-range:\s*([^;]+);/.exec(block)?.[1]
    if (!src || !ur) continue
    for (const part of ur.split(',')) { const [a, b] = part.trim().replace(/^U\+/i, '').split('-').map((h) => parseInt(h, 16)); if (cp >= a && cp <= (b ?? a)) return path.join(pkgDir, 'files', src) }
  }
  throw new Error(`找不到「${ch}」`)
}
const LAI = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] // 「獭」右边「赖」的 13 个轮廓（第一轮 README）
const TIERS = {
  large: { wght: 600, tracking: 0, how: 'Noto Sans SC wght 600，不加字距（第 92 条：大字黑体中粗）' },
  small: { wght: 400, tracking: 60, laiWght: 350, how: 'Noto Sans SC wght 400，字距 +60，「赖」的 13 个轮廓取 350（第一轮 D 小档，第 92 条）' },
}
const jobs = []
for (const [k, t] of Object.entries(TIERS)) {
  jobs.push({ key: `${k}-t`, font: sliceFor('獭'), char: '獭', wght: t.wght, expectContours: 16, contourWeights: t.laiWght ? Object.fromEntries(LAI.map((i) => [i, t.laiWght])) : undefined })
  jobs.push({ key: `${k}-s`, font: sliceFor('石'), char: '石', wght: t.wght })
}
const py = spawnSync('python3', ['-I', GLYPH_TOOL], { input: JSON.stringify(jobs), encoding: 'utf8', maxBuffer: 1e8, env: { ...process.env, EQB_FONTTOOLS_PATH: process.env.EQB_FONTTOOLS_PATH || '' } })
if (py.status !== 0) { console.error('取轮廓失败：\n' + py.stderr); process.exit(1) }
const G = JSON.parse(py.stdout)

// ---------- SVG ----------
const f1 = (v) => Math.round(v * 10) / 10
const HEAD = (vb, title, note, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}>\n<!-- ${note} -->\n<title>${title}</title>\n`
const STATUS = '提案 · 单一来源，第二轮草稿（2026-11-16，BRAND.md 第 92、121 条）。由 scripts/brand/wordmark-round2.mjs 生成。'
const fillOf = (v) => (v === 'ink' ? C.ink : C.mistWhite)
const colorNote = (v) => (v === 'ink' ? '墨 #191D18' : '雾白 #F2FAF6（反白，放在墨或深薄荷底上；透明底）')
function word(tk) {
  const t = TIERS[tk], gt = G[`${tk}-t`], gs = G[`${tk}-s`], dx = gt.advance + t.tracking
  return { width: dx + gs.advance, ink: { x0: gt.bbox[0], y0: Math.min(gt.bbox[1], gs.bbox[1]), x1: dx + gs.bbox[2], y1: Math.max(gt.bbox[3], gs.bbox[3]) },
    paths: (fill) => `<g fill="${fill}"><path d="${gt.d}"/><path transform="translate(${dx} 0)" d="${gs.d}"/></g>` }
}
const wordSvg = (tk, v) => { const w = word(tk)
  return HEAD(`0 0 ${w.width} 1000`, `獭石 · 字标${tk === 'large' ? '大档' : '小档'}`, `獭石 字标 · ${tk === 'large' ? '大档（>16px）' : '小档（≤16px，高清屏）'} · ${colorNote(v)}。${TIERS[tk].how}。来源 ${pkg.name}@${pkg.version}（${G[`${tk}-t`].font.version}），SIL OFL 1.1。viewBox 高 1000 = 一个字号。${STATUS}`) + w.paths(fillOf(v)) + '\n</svg>\n' }

// 逐格画：每个 # 一格，横向连在一起的合成一个矩形
const PX = PIXEL.size, PX_W = PX * 2 + PIXEL.gap
const pxRects = (fill) => {
  let s = ''
  for (const [grid, ox] of [[PIXEL.ta, 0], [PIXEL.shi, PX + PIXEL.gap]]) grid.forEach((row, y) => {
    for (let x = 0; x < row.length;) { if (row[x] !== '#') { x++; continue } let e = x; while (row[e] === '#') e++; s += `<rect x="${ox + x}" y="${y}" width="${e - x}" height="1" fill="${fill}"/>`; x = e }
  })
  return s
}
const pxSvg = (v) => HEAD(`0 0 ${PX_W} ${PX}`, '獭石 · 字标 15px 逐格画版', `獭石 字标 · 15px 逐格画版（普通屏 1x，只按原尺寸 ${PX_W}×${PX} 显示） · ${colorNote(v)}。手画，源在 pixel-15.json。${STATUS}`, ` width="${PX_W}" height="${PX}" shape-rendering="crispEdges"`) + pxRects(fillOf(v)) + '\n</svg>\n'

const markSrc = readFileSync(MARK, 'utf8')
const MARK_VB = /viewBox="([^"]+)"/.exec(markSrc)[1].split(/\s+/).map(Number), MARK_W = MARK_VB[2], MARK_H = MARK_VB[3]
const markBody = markSrc.replace(/^[\s\S]*?<\/title>/, '').replace(/<\/svg>\s*$/, '').replace(/id="cut"/g, 'id="mark-cut"').replace(/url\(#cut\)/g, 'url(#mark-cut)').trim()
const markGroup = `<g transform="translate(${-MARK_VB[0]} ${-MARK_VB[1]})">\n  ${markBody}\n</g>`
const H_RATIO = { em: 0.75, gap: 0.4 }, V_RATIO = { inkWidth: 0.8, gap: 0.25 } // 横排和第一轮一样；竖排 2026-11-16 从 0.9、0.22 改成 0.8、0.25（BRAND.md 第 126 条，目测比过 0.9、0.8、0.75）
function lockup(kind, v) {
  const w = word('large'), inkW = w.ink.x1 - w.ink.x0, inkH = w.ink.y1 - w.ink.y0
  let s, x, y, vbW, vbH
  if (kind === 'h') { s = (H_RATIO.em * MARK_H) / 1000; x = MARK_W + H_RATIO.gap * MARK_H - w.ink.x0 * s; y = MARK_H / 2 - (w.ink.y0 + inkH / 2) * s; vbW = x + w.ink.x1 * s; vbH = MARK_H }
  else { s = (V_RATIO.inkWidth * MARK_W) / inkW; const top = MARK_H * (1 + V_RATIO.gap); x = MARK_W / 2 - (w.ink.x0 + inkW / 2) * s; y = top - w.ink.y0 * s; vbW = MARK_W; vbH = top + inkH * s }
  const desc = kind === 'h' ? `横排：标志高 H，字号 ${H_RATIO.em}H，间距 ${H_RATIO.gap}H，上下居中` : `竖排：字墨迹宽 ${V_RATIO.inkWidth} 倍标志宽，间距 ${V_RATIO.gap}H，水平居中`
  const svg = HEAD(`0 0 ${f1(vbW)} ${f1(vbH)}`, `獭石 · ${kind === 'h' ? '横排' : '竖排'}组合`, `獭石 ${kind === 'h' ? '横排' : '竖排'}组合 · 字是${colorNote(v)}、大档；图形标志是现在的新脸 logo/mint/mark.svg 原样（墨底上也用彩色版，§3.1）。${desc}。viewBox 贴着墨迹，四周另留至少 ¼ 标志高。${STATUS}`)
    + markGroup + `\n<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s * 1e4) / 1e4})">${w.paths(fillOf(v))}</g>\n</svg>\n`
  return { svg, w: vbW, h: vbH }
}
// 普通屏横排小组合：mark-32（32×20 画在 32×32 格里，第 6–25 行）+ 8px 间距 + 15px 逐格字，字的 15 行和标志的 20 行上下居中
const m32 = readFileSync(MARK32, 'utf8')
const m32Rects = (m32.match(/<rect [^>]+\/>/g) || []).join('')
const m32Rows = (m32.match(/ y="(\d+)"/g) || []).map((m) => Number(m.slice(4, -1)))
const M32_TOP = Math.min(...m32Rows), M32_BOTTOM = Math.max(...m32Rows) + 1, M32_H = M32_BOTTOM - M32_TOP
const PX_Y = Math.floor((M32_H - PX) / 2)
const lockPxW = 32 + 8 + PX_W
const lockPxSvg = (v) => HEAD(`0 ${M32_TOP} ${lockPxW} ${M32_H}`, '獭石 · 横排组合 普通屏逐格版', `獭石 横排组合 · 普通屏 1x 逐格版，只按原尺寸 ${lockPxW}×${M32_H} 显示。左边是 logo/mint/mark-32（新脸，第 102 条），间距 8px，右边 15px 逐格字（${colorNote(v)}），字的 15 行在标志 ${M32_H} 行里上下居中（往上取整）。${STATUS}`, ` width="${lockPxW}" height="${M32_H}" shape-rendering="crispEdges"`)
  + m32Rects + `<g transform="translate(40 ${M32_TOP + PX_Y})">${pxRects(fillOf(v))}</g>\n</svg>\n`

// 上线用的 20px 高盒子：和顶栏标志一样高（mark-32 画出来 20 行），字放在第 ${PX_Y} 行起，1x 逐格、2x 矢量小档同一个盒子。
// 这样字和标志在同一个弹性盒里一起居中，标志落在整像素上，字也落在整像素上，普通屏不会被插值成灰。
const BOX_NOTE = `盒子 ${PX_W}×${M32_H}，和顶栏标志 mark-32 画出来的 ${M32_H} 行一样高，字从第 ${PX_Y} 行起`
const pxBoxSvg = (v) => HEAD(`0 ${-PX_Y} ${PX_W} ${M32_H}`, '獭石 · 字标 15px 逐格画版（20px 盒）', `獭石 字标 · 15px 逐格画版放进上线用的盒子：${BOX_NOTE}。普通屏 1x 只按原尺寸显示。${colorNote(v)}。${STATUS}`, ` width="${PX_W}" height="${M32_H}" shape-rendering="crispEdges"`) + pxRects(fillOf(v)) + '\n</svg>\n'
const smallBoxSvg = (v) => { const u = 1000 / PX
  return HEAD(`0 ${f1(-PX_Y * u)} ${f1(PX_W * u)} ${f1(M32_H * u)}`, '獭石 · 字标小档（20px 盒）', `獭石 字标小档放进上线用的盒子：${BOX_NOTE}（按 15px 字号算）。高清屏 2x 用。${TIERS.small.how}。${colorNote(v)}。${STATUS}`) + word('small').paths(fillOf(v)) + '\n</svg>\n' }
rmSync(SVG_DIR, { recursive: true, force: true }); rmSync(PNG_DIR, { recursive: true, force: true }); mkdirSync(SVG_DIR, { recursive: true }); mkdirSync(PNG_DIR, { recursive: true })
const files = {}, LOCK = {}
for (const v of ['ink', 'reverse']) {
  files[`wordmark-large-${v}.svg`] = wordSvg('large', v)
  files[`wordmark-small-${v}.svg`] = wordSvg('small', v)
  files[`wordmark-15px-${v}.svg`] = pxSvg(v)
  files[`wordmark-15px-box20-${v}.svg`] = pxBoxSvg(v)
  files[`wordmark-small-box20-${v}.svg`] = smallBoxSvg(v)
  files[`lockup-h-15px-${v}.svg`] = lockPxSvg(v)
  for (const k of ['h', 'v']) { LOCK[`${k}-${v}`] = lockup(k, v); files[`lockup-${k}-${v}.svg`] = LOCK[`${k}-${v}`].svg }
}
for (const [f, s] of Object.entries(files)) writeFileSync(path.join(SVG_DIR, f), s)
const run = { date: new Date().toISOString(), font: { package: pkg.name, version: pkg.version, license: pkg.license, fontVersion: G['large-t'].font.version },
  tiers: TIERS, pixel: { size: PX, gap: PIXEL.gap, width: PX_W }, lockupRatios: { horizontal: H_RATIO, vertical: V_RATIO }, mark32Rows: [M32_TOP, M32_BOTTOM], files: Object.keys(files), errors: [] }
console.log(`写出 ${Object.keys(files).length} 个 SVG`)
if (svgOnly) { writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(run, null, 1) + '\n'); process.exit(0) }

// ---------- 拍图 ----------
if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '44'
const { requireFromApp } = await import('../component-inventory/lib.mjs')
const { startRig, OWNER } = await import('../component-inventory/rig.mjs')
const { chromium } = requireFromApp('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const uri = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64')
const png = (b) => 'data:image/png;base64,' + b.toString('base64')
const browser = await chromium.launch({ channel: 'chromium' })
const ctxOpts = (w, h, dpr) => ({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, locale: 'zh-CN', reducedMotion: 'reduce' })

// 1x PNG：把逐格 SVG 原尺寸截下来（透明底）
for (const v of ['ink', 'reverse']) for (const [name, svgName, w, h] of [[`wordmark-15px-${v}.png`, `wordmark-15px-${v}.svg`, PX_W, PX], [`lockup-h-15px-${v}.png`, `lockup-h-15px-${v}.svg`, lockPxW, M32_H], [`wordmark-15px-box20-${v}.png`, `wordmark-15px-box20-${v}.svg`, PX_W, M32_H]]) {
  const ctx = await browser.newContext(ctxOpts(w, h, 1)); const p = await ctx.newPage()
  await p.setContent(`<html><body style="margin:0;background:transparent"><img src="${uri(files[svgName])}" style="display:block"></body></html>`)
  await p.screenshot({ path: path.join(PNG_DIR, name), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } }); await ctx.close()
}
const pxPng = readFileSync(path.join(PNG_DIR, 'wordmark-15px-box20-ink.png'))

// 品牌字换成什么：now 不换；vector 用小档矢量；srcset 是建议的上线写法（1x 逐格 PNG，2x 小档矢量）
const VARIANTS = [
  { id: 'now', name: '现状', note: '网站字体栈 600 的实时文字。本机没有苹方，是文泉驿正黑' },
  { id: 'vector', name: '矢量小档', note: '第一轮 D 小档的 SVG，1x 和 2x 都用它' },
  { id: 'srcset', name: '逐格 + 矢量', note: '建议的写法：1x 屏用 15px 逐格画版，2x 屏用矢量小档（和顶栏标志 mark-32 / mark.svg 一样）' },
]
async function swap(page, sel, id) {
  if (id === 'now') return
  // srcset 里不能放带逗号的 data: 地址，先在页面里转成 blob: 地址（上线时是普通文件地址）
  await page.evaluate(async ([s, id, small, smallBox, px, w, h]) => {
    const blob = async (u) => URL.createObjectURL(await (await fetch(u)).blob())
    for (const e of document.querySelectorAll(s)) {
      const fs = parseFloat(getComputedStyle(e).fontSize)
      const img = document.createElement('img'); img.alt = '獭石'
      if (id === 'srcset') { const a = await blob(px), b = await blob(smallBox); img.srcset = `${a} 1x, ${b} 2x`; img.src = a; img.style.cssText = `display:block;width:${w}px !important;height:${h}px !important` }
      else { img.src = small; img.style.cssText = `display:block;height:${fs}px !important;width:${w * fs / 15}px !important` }
      e.replaceChildren(img); e.style.display = 'inline-flex'; e.style.alignItems = 'center'
    }
  }, [sel, id, uri(files['wordmark-small-ink.svg']), uri(files['wordmark-small-box20-ink.svg']), png(pxPng), PX_W, M32_H])
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  return page.evaluate((s) => { const i = document.querySelector(s + ' img'); const r = i.getBoundingClientRect(); const m = document.querySelector('.topbar-brand-mark, .login-brand > img')?.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, src: i.currentSrc.slice(0, 10), mark: m && { x: m.x, y: m.y, h: m.height } } }, sel)
}
async function clip(page, loc, { padX = 16, padY = 12, fullLeft = false, maxW = null } = {}) {
  const b = await loc.boundingBox(), vp = page.viewportSize()
  const x0 = fullLeft ? 0 : Math.max(0, b.x - padX), y0 = Math.max(0, b.y - padY)
  let x1 = Math.min(vp.width, b.x + b.width + padX); if (maxW) x1 = Math.min(vp.width, x0 + maxW)
  const y1 = Math.min(vp.height, b.y + b.height + padY)
  return { buf: await page.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } }), w: Math.round(x1 - x0), h: Math.round(y1 - y0) }
}
const shots = {}
let rig = null
try {
  rig = await startRig({ quiet: true }); const base = rig.base
  for (const dpr of [2, 1]) {
    { // 顶栏
      const ctx = await browser.newContext(ctxOpts(1440, 900, dpr)); const page = await ctx.newPage()
      page.on('pageerror', (e) => run.errors.push(`topbar-${dpr}x: ${String(e).slice(0, 200)}`))
      await page.goto(base + '/'); await page.locator('#login-username').waitFor({ timeout: 30000 })
      await page.locator('#login-username').fill(OWNER.username); await page.locator('#login-password').fill(OWNER.password)
      await page.locator('.login-submit').click(); await page.locator('.login-card').waitFor({ state: 'detached', timeout: 30000 })
      await page.locator('header.topbar').waitFor({ timeout: 30000 }); await page.waitForLoadState('networkidle').catch(() => {}); await sleep(1500)
      await page.mouse.move(2, 898)
      const sel = 'header.topbar .topbar-brand-title'
      const orig = await page.evaluate((s) => { const e = document.querySelector(s); const cs = getComputedStyle(e); return { html: e.innerHTML, font: `${cs.fontSize}/${cs.fontWeight}`, family: cs.fontFamily } }, sel)
      run.topbar = orig
      for (const v of VARIANTS) {
        await page.evaluate(([s, h]) => { for (const e of document.querySelectorAll(s)) { e.innerHTML = h; e.removeAttribute('style') } }, [sel, orig.html])
        { const r = await swap(page, sel, v.id); if (r) (run.rects ||= []).push({ place: 'topbar', dpr, id: v.id, ...r }) } await sleep(150)
        ;((shots[v.id] ||= {}).topbar ||= {})[dpr] = await clip(page, page.locator('header.topbar .topbar-brand').first())
      }
      await ctx.close()
    }
    { // 登录页左上角
      const ctx = await browser.newContext(ctxOpts(1440, 900, dpr)); const page = await ctx.newPage()
      page.on('pageerror', (e) => run.errors.push(`login-${dpr}x: ${String(e).slice(0, 200)}`))
      await page.goto(base + '/'); await page.locator('.login-card').waitFor({ timeout: 30000 }); await page.waitForLoadState('networkidle').catch(() => {}); await sleep(2500)
      await page.mouse.move(2, 898)
      const sel = '.login-brand > span'
      const orig = await page.evaluate((s) => { const e = document.querySelector(s); const cs = getComputedStyle(e); return { html: e.innerHTML, font: `${cs.fontSize}/${cs.fontWeight}` } }, sel)
      run.login = orig
      for (const v of VARIANTS) {
        await page.evaluate(([s, h]) => { for (const e of document.querySelectorAll(s)) { e.innerHTML = h; e.removeAttribute('style') } }, [sel, orig.html])
        { const r = await swap(page, sel, v.id); if (r) (run.rects ||= []).push({ place: 'login', dpr, id: v.id, ...r }) } await sleep(150)
        ;((shots[v.id] ||= {}).login ||= {})[dpr] = await clip(page, page.locator('.login-brand'), { padX: 40, padY: 28, fullLeft: true, maxW: 240 })
      }
      await ctx.close()
    }
  }

  // ---------- 对比总图 ----------
  const img = (s, dpr, zoom = 1) => s ? `<img src="${png(s.buf)}" style="width:${s.w * zoom}px;height:${s.h * zoom}px;display:block;${dpr === 1 ? 'image-rendering:pixelated;' : ''}">` : '<span class="note">没拍到</span>'
  const pair = (o, zoom) => `<div class="pair"><div><div class="k">2x 屏</div>${img(o?.[2], 2)}</div><div><div class="k">1x 屏（放大 ${zoom} 倍，逐像素）</div>${img(o?.[1], 1, zoom)}</div><div><div class="k">1x 原大</div>${img(o?.[1], 1, 1)}</div></div>`
  const css = `* { box-sizing: border-box; } body { margin: 0; background: ${C.page}; color: ${C.ink}; font-family: ${run.topbar.family}; }
.sheet { padding: 28px; display: flex; flex-direction: column; gap: 22px; width: max-content; }
h1 { margin: 0; font-size: 22px; font-weight: 600; } h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
.meta, .note { color: #5b6b73; font-size: 12px; line-height: 1.5; max-width: 1400px; }
section { background: ${C.white}; border: 1px solid #d5dfe4; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.grid { display: grid; grid-template-columns: 220px auto; gap: 14px 22px; align-items: center; }
.lab { font-size: 13px; font-weight: 600; } .lab small { display: block; font-weight: 400; color: #5b6b73; font-size: 11px; line-height: 1.4; }
.k { font-size: 11px; color: #5b6b73; margin-bottom: 3px; } .pair { display: flex; gap: 18px; align-items: flex-end; }`
  const lab = (v) => `<div class="lab">${v.name}<small>${v.note}</small></div>`
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="sheet">
<div><h1>「獭石」字标第二轮 · 顶栏和登录页</h1><div class="meta">${STATUS} 本地临时网站的真实页面，只在截图前改 DOM。本机没有 PingFang SC，「现状」和旁边的导航字是文泉驿正黑，和苹果设备上不同，要在 Mac 上再看。</div></div>
<section><h2>顶栏（实算 ${run.topbar.font}）</h2><div class="grid">${VARIANTS.map((v) => lab(v) + pair(shots[v.id].topbar, 3)).join('\n')}</div></section>
<section><h2>登录页左上角（实算 ${run.login.font}）</h2><div class="grid">${VARIANTS.map((v) => lab(v) + pair(shots[v.id].login, 2)).join('\n')}</div></section>
</div></body></html>`
  {
    const ctx = await browser.newContext(ctxOpts(1500, 400, 2)); const p = await ctx.newPage()
    await p.setContent(html, { waitUntil: 'load' }); await p.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true }); await ctx.close()
  }
  // ---------- 组合图 ----------
  const lockImg = (k, h) => { const l = LOCK[k]; return `<img src="${uri(l.svg)}" style="height:${h}px;width:${f1(h * l.w / l.h)}px;display:block">` }
  const wImg = (tk, v, h) => `<img src="${uri(files[`wordmark-${tk}-${v}.svg`])}" style="height:${h}px;width:${f1(h * word(tk).width / 1000)}px;display:block">`
  const pxImg = (name, w, h, z) => `<img src="${uri(files[name])}" style="width:${w * z}px;height:${h * z}px;display:block;image-rendering:pixelated">`
  const tile = (bg, inner) => `<div style="background:${bg};padding:24px;border-radius:10px;display:flex;align-items:center;gap:32px">${inner}</div>`
  const html2 = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="sheet">
<div><h1>「獭石」字标第二轮 · 字标和组合</h1><div class="meta">${STATUS} 图形标志是现在的新脸（logo/mint/mark.svg、mark-32）。左白底墨字，右墨底雾白字。逐格版在这里按 4 倍逐像素放大，旁边是原大。</div></div>
<section><h2>大档：字标 64px、横排 64px 高、竖排 120px 高</h2>${tile(C.white, wImg('large', 'ink', 64) + lockImg('h-ink', 64) + lockImg('v-ink', 120))}${tile(C.ink, wImg('large', 'reverse', 64) + lockImg('h-reverse', 64) + lockImg('v-reverse', 120))}</section>
<section><h2>小档矢量（高清屏 15px 用）：放大到 60px 看字形，和原大 15px</h2>${tile(C.white, wImg('small', 'ink', 60) + wImg('small', 'ink', 15))}</section>
<section><h2>15px 逐格画版（普通屏用）和普通屏横排小组合</h2>${tile(C.white, pxImg('wordmark-15px-ink.svg', PX_W, PX, 4) + pxImg('wordmark-15px-ink.svg', PX_W, PX, 1) + pxImg('lockup-h-15px-ink.svg', lockPxW, M32_H, 4) + pxImg('lockup-h-15px-ink.svg', lockPxW, M32_H, 1))}${tile(C.ink, pxImg('wordmark-15px-reverse.svg', PX_W, PX, 4) + pxImg('wordmark-15px-reverse.svg', PX_W, PX, 1) + pxImg('lockup-h-15px-reverse.svg', lockPxW, M32_H, 4) + pxImg('lockup-h-15px-reverse.svg', lockPxW, M32_H, 1))}</section>
</div></body></html>`
  {
    const ctx = await browser.newContext(ctxOpts(1500, 400, 2)); const p = await ctx.newPage()
    await p.setContent(html2, { waitUntil: 'load' }); await p.screenshot({ path: path.join(OUT, 'lockups.png'), fullPage: true }); await ctx.close()
  }
} finally {
  await browser.close(); if (rig) await rig.stop()
}
writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(run, null, 1) + '\n')
console.log('写到', path.relative(ROOT, OUT), run.errors.length ? `页面报错 ${run.errors.length} 条` : '')
process.exit(0)
