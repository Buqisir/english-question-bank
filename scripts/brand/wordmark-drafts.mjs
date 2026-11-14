#!/usr/bin/env node
// 工作名「獭石」字标草稿 · 第一轮（BRAND.md §2 第 88、89 条，§3.1 字标和组合，§3.3 字标）。提案 · 单一来源。
//
// 做什么：从开源中文字体（Noto Sans SC / Noto Serif SC 可变字体，SIL OFL 1.1）取「獭」「石」两个字的轮廓，
// 按四个方向排成字标 SVG（文字已是轮廓路径），配现有图形标志做横排、竖排组合，墨色和反白两版；
// 再在本地临时网站的真实顶栏、登录页左上角（只在截图前改 DOM，不改源码）和手机图标示意里拍对比图。
//
// 用法：
//   WORDMARK_FONTSOURCE_DIR=<装了 @fontsource-variable/noto-sans-sc 和 noto-serif-sc 的 node_modules 目录> \
//   EQB_FONTTOOLS_PATH=<装了 fonttools 和 brotli 的目录> \
//   node scripts/brand/wordmark-drafts.mjs [--svg-only] [--base http://127.0.0.1:端口]
// 字体和工具不进仓库，先装到临时目录，例如：
//   npm install --prefix <临时目录> --ignore-scripts @fontsource-variable/noto-sans-sc@5.3.1 @fontsource-variable/noto-serif-sc@5.3.1
//   pip install --target <临时目录>/pylib fonttools==4.55.3 brotli==1.1.0
//   （WORDMARK_FONTSOURCE_DIR 就是 <临时目录>/node_modules）
//   --svg-only     只出 SVG 和 wordmark-run.json，不起网站、不拍图
//   --base URL     用已经在跑的本地网站，不自己起（账号见 WORDMARK_USER / WORDMARK_PASSWORD）
//   INVENTORY_PORT_OFFSET=43   自己起本地网站时的端口偏移（默认 43）
// 输出：design/brand-2026-10-13/wordmark-2026-11-14/ 下的 svg/、compare.png、lockups.png、wordmark-run.json
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'design/brand-2026-10-13/wordmark-2026-11-14')
const SVG_DIR = path.join(OUT, 'svg')
const MARK = path.join(ROOT, 'design/brand-2026-10-13/logo/mint/mark.svg')
const APP_ICON = path.join(ROOT, 'design/brand-2026-10-13/mascot/app-icon.svg')
const GLYPH_TOOL = path.join(ROOT, 'scripts/brand/wordmark-glyphs.py')

// BRAND.md §1.5 里已有的色值，只用这几个
const C = { ink: '#191D18', mistWhite: '#F2FAF6', deepMint: '#2C6E56', mint: '#72BFA4', page: '#F1F5F7', desk: '#E6EDF0', white: '#FFFFFF' }

// ---------- 参数 ----------
const argv = process.argv.slice(2)
let base = null
const svgOnly = argv.includes('--svg-only')
for (let i = 0; i < argv.length; i++) if (argv[i] === '--base') base = (argv[++i] || '').replace(/\/$/, '')
const FS_DIR = process.env.WORDMARK_FONTSOURCE_DIR
const FT_DIR = process.env.EQB_FONTTOOLS_PATH
if (!FS_DIR || !existsSync(path.join(FS_DIR, '@fontsource-variable/noto-sans-sc')) || !existsSync(path.join(FS_DIR, '@fontsource-variable/noto-serif-sc'))) {
  console.error('要先设 WORDMARK_FONTSOURCE_DIR，指向装了 @fontsource-variable/noto-sans-sc 和 noto-serif-sc 的 node_modules 目录（见文件开头的用法）。')
  process.exit(2)
}

// ---------- 找字：fontsource 把中文切成很多片，按 index.css 的 unicode-range 找到含这个字的那一片 ----------
function pkgInfo(pkg) {
  const dir = path.join(FS_DIR, '@fontsource-variable', pkg)
  const pj = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  return { dir, name: pj.name, version: pj.version, license: pj.license }
}
function sliceFor(pkg, ch) {
  const { dir } = pkgInfo(pkg)
  const css = readFileSync(path.join(dir, 'index.css'), 'utf8')
  const cp = ch.codePointAt(0)
  for (const block of css.split('@font-face').slice(1)) {
    const src = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1]
    const ur = /unicode-range:\s*([^;]+);/.exec(block)?.[1]
    if (!src || !ur) continue
    for (const part of ur.split(',')) {
      const [a, b] = part.trim().replace(/^U\+/i, '').split('-').map((h) => parseInt(h, 16))
      if (cp >= a && cp <= (b ?? a)) return path.join(dir, 'files', src)
    }
  }
  throw new Error(`${pkg} 里找不到「${ch}」`)
}
const FONTS = {
  sans: { pkg: pkgInfo('noto-sans-sc'), t: sliceFor('noto-sans-sc', '獭'), s: sliceFor('noto-sans-sc', '石') },
  serif: { pkg: pkgInfo('noto-serif-sc'), t: sliceFor('noto-serif-sc', '獭'), s: sliceFor('noto-serif-sc', '石') },
}

// ---------- 四个方向 ----------
// 每个方向一到两档：large 用在 >16px，small 用在 ≤16px。tracking 是两个字之间多加的距离（字体单位，em = 1000）。
// D 的光学修正：Noto Sans SC 2.004 里「獭」有 16 个轮廓，0–2 是左边的「犭」，3–15 是右边的「赖」
// （3–8、12 是「束」，9–11、13–15 是「负」）。D 只把「赖」的 13 个轮廓换成同一字体里轻 50 的字重，
// 「犭」和「石」不动，字形、字宽、位置都不动。
const LAI = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const lighter = (w, by) => Object.fromEntries(LAI.map((i) => [i, w - by]))
const DIRECTIONS = [
  { id: 'A', name: 'A 黑体直排', family: 'sans', tiers: { all: { wght: 600, tracking: 0 } },
    how: 'Noto Sans SC 可变字体 wght 600（和网站顶栏、登录页现在的 600 一致），不加字距，所有字号同一档。' },
  { id: 'B', name: 'B 黑体分两档', family: 'sans', tiers: { large: { wght: 600, tracking: 0 }, small: { wght: 400, tracking: 60 } },
    how: '>16px 用 wght 600、不加字距（和 A 一样）；≤16px 用 wght 400，两字之间加 60（6% 字号）。' },
  { id: 'C', name: 'C 宋体', family: 'serif', tiers: { all: { wght: 600, tracking: 0 } },
    how: 'Noto Serif SC 可变字体 wght 600（思源宋体同一套字形，§3.3 宣传标题字），不加字距，所有字号同一档。' },
  { id: 'D', name: 'D 黑体分两档 + 「赖」收细', family: 'sans',
    tiers: { large: { wght: 600, tracking: 0, contourWeights: lighter(600, 50) }, small: { wght: 400, tracking: 60, contourWeights: lighter(400, 50) } },
    how: '在 B 上只改「獭」右边的「赖」：它的 13 个轮廓取同一字体里轻 50 的字重（大档 550、小档 350），「犭」和「石」不动。' },
]
const tierFor = (d, px) => d.tiers.all ? 'all' : px <= 16 ? 'small' : 'large'

// ---------- 取轮廓 ----------
const jobs = []
for (const d of DIRECTIONS) for (const [tk, t] of Object.entries(d.tiers)) {
  const F = FONTS[d.family]
  jobs.push({ key: `${d.id}-${tk}-t`, font: F.t, char: '獭', wght: t.wght, contourWeights: t.contourWeights, expectContours: d.family === 'sans' ? 16 : 18 })
  jobs.push({ key: `${d.id}-${tk}-s`, font: F.s, char: '石', wght: t.wght })
}
const py = spawnSync('python3', ['-I', GLYPH_TOOL], { input: JSON.stringify(jobs), encoding: 'utf8', maxBuffer: 1e8, env: { ...process.env, EQB_FONTTOOLS_PATH: FT_DIR || '' } })
if (py.status !== 0) { console.error('取轮廓失败：\n' + py.stderr); process.exit(1) }
const G = JSON.parse(py.stdout)

// ---------- SVG ----------
const f1 = (v) => Math.round(v * 10) / 10
const markSrc = readFileSync(MARK, 'utf8')
const MARK_VB = /viewBox="([^"]+)"/.exec(markSrc)[1].split(/\s+/).map(Number) // 49.5 105.5 926 594.5
const MARK_W = MARK_VB[2], MARK_H = MARK_VB[3]
const markBody = markSrc
  .replace(/^[\s\S]*?<\/title>/, '').replace(/<\/svg>\s*$/, '')
  .replace(/id="cut"/g, 'id="mark-cut"').replace(/url\(#cut\)/g, 'url(#mark-cut)').trim()
const markGroup = (x, y, s) => `<g transform="translate(${f1(x)} ${f1(y)}) scale(${s}) translate(${-MARK_VB[0]} ${-MARK_VB[1]})">\n  ${markBody}\n</g>`

function word(d, tk) {
  const t = d.tiers[tk], gt = G[`${d.id}-${tk}-t`], gs = G[`${d.id}-${tk}-s`]
  const dx = gt.advance + t.tracking
  const width = dx + gs.advance
  const ink = { x0: gt.bbox[0], y0: Math.min(gt.bbox[1], gs.bbox[1]), x1: dx + gs.bbox[2], y1: Math.max(gt.bbox[3], gs.bbox[3]) }
  const paths = (fill) => `<g fill="${fill}"><path d="${gt.d}"/><path transform="translate(${dx} 0)" d="${gs.d}"/></g>`
  return { width, ink, paths, gt, gs, tracking: t.tracking }
}
const HEAD = (vb, title, note) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">\n<!-- ${note} -->\n<title>${title}</title>\n`
const tierLabel = (tk) => ({ all: '', large: '大档（>16px）', small: '小档（≤16px）' })[tk]
const fileTier = (tk) => (tk === 'all' ? '' : `-${tk}`)
const colorName = (v) => (v === 'ink' ? '墨 #191D18' : '雾白 #F2FAF6（反白，放在墨或深薄荷底上；透明底）')

// 字标：viewBox 高 1000 = 一个字号（em 框），按 height = 字号 放就和同字号的文字一样大
function wordmarkSvg(d, tk, v) {
  const w = word(d, tk)
  const note = `獭石 字标草稿 ${d.name}${tierLabel(tk) ? ' · ' + tierLabel(tk) : ''} · ${colorName(v)}。提案 · 单一来源，第一轮草稿（2026-11-14，BRAND.md 第 88 条）。${d.how} 来源字体 ${FONTS[d.family].pkg.name}@${FONTS[d.family].pkg.version}（${G[`${d.id}-${tk}-t`].font.version}），SIL OFL 1.1。viewBox 高 1000 = 一个字号（em 框，上沿是理想字面框上沿）。由 scripts/brand/wordmark-drafts.mjs 生成。`
  return HEAD(`0 0 ${w.width} 1000`, `獭石 · 字标草稿 ${d.id}`, note) + w.paths(v === 'ink' ? C.ink : C.mistWhite) + '\n</svg>\n'
}
// 横排：标志高 H，字号 0.75H（顶栏 20px 标志配 15px 字的比例），标志和字的墨迹之间留 0.4H（顶栏 8px / 20px），字的墨迹上下居中对齐标志
const H_RATIO = { em: 0.75, gap: 0.4 }
// 竖排：标志在上，字在下，字的墨迹宽约等于标志宽的 0.9，上下间距 0.22H，水平居中
const V_RATIO = { inkWidth: 0.9, gap: 0.22 }
function lockup(d, tk, v, kind) {
  const w = word(d, tk)
  const fill = v === 'ink' ? C.ink : C.mistWhite
  const inkW = w.ink.x1 - w.ink.x0, inkH = w.ink.y1 - w.ink.y0
  let body, vbW, vbH, desc
  if (kind === 'h') {
    const s = (H_RATIO.em * MARK_H) / 1000
    const x = MARK_W + H_RATIO.gap * MARK_H - w.ink.x0 * s
    const y = MARK_H / 2 - (w.ink.y0 + inkH / 2) * s
    vbW = x + w.ink.x1 * s; vbH = MARK_H
    body = markGroup(0, 0, 1) + `\n<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s * 1e4) / 1e4})">${w.paths(fill)}</g>`
    desc = `横排：标志高 H，字号 ${H_RATIO.em}H，标志和字墨迹间距 ${H_RATIO.gap}H，字墨迹和标志上下居中`
  } else {
    const s = (V_RATIO.inkWidth * MARK_W) / inkW
    const top = MARK_H + V_RATIO.gap * MARK_H
    const x = MARK_W / 2 - (w.ink.x0 + inkW / 2) * s
    const y = top - w.ink.y0 * s
    vbW = MARK_W; vbH = top + inkH * s
    body = markGroup(0, 0, 1) + `\n<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s * 1e4) / 1e4})">${w.paths(fill)}</g>`
    desc = `竖排：标志在上，字墨迹宽 ${V_RATIO.inkWidth} 倍标志宽，上下间距 ${V_RATIO.gap}H，水平居中`
  }
  const note = `獭石 ${kind === 'h' ? '横排' : '竖排'}组合草稿 ${d.name}${tierLabel(tk) ? ' · ' + tierLabel(tk) : ''} · 字是${colorName(v)}，图形标志用雾薄荷彩色版（logo/mint/mark.svg 原样，BRAND.md §3.1 第 62、68 条：墨底上用彩色版，不做反白标志）。${desc}。viewBox 贴着墨迹，四周安全距离另留至少 ¼ 标志高。提案 · 单一来源，第一轮草稿（2026-11-14）。由 scripts/brand/wordmark-drafts.mjs 生成。`
  return { svg: HEAD(`0 0 ${f1(vbW)} ${f1(vbH)}`, `獭石 · ${kind === 'h' ? '横排' : '竖排'}组合草稿 ${d.id}`, note) + body + '\n</svg>\n', w: vbW, h: vbH }
}

// 写 SVG：先清掉本脚本上次写的 svg/（目录只放本脚本的输出）
rmSync(SVG_DIR, { recursive: true, force: true }); mkdirSync(SVG_DIR, { recursive: true })
const files = []
const LOCK = {}
for (const d of DIRECTIONS) for (const tk of Object.keys(d.tiers)) for (const v of ['ink', 'reverse']) {
  const stem = `${d.id}${fileTier(tk)}`
  const wf = `wordmark-${stem}-${v}.svg`; writeFileSync(path.join(SVG_DIR, wf), wordmarkSvg(d, tk, v)); files.push(wf)
  for (const kind of ['h', 'v']) {
    const l = lockup(d, tk, v, kind)
    const lf = `lockup-${kind}-${stem}-${v}.svg`; writeFileSync(path.join(SVG_DIR, lf), l.svg); files.push(lf)
    LOCK[`${kind}-${stem}-${v}`] = l
  }
}
console.log(`写出 ${files.length} 个 SVG 到`, path.relative(ROOT, SVG_DIR))

const run = {
  date: new Date().toISOString(),
  fonts: Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, { package: f.pkg.name, version: f.pkg.version, license: f.pkg.license,
    fontVersion: G[k === 'sans' ? 'A-all-t' : 'C-all-t'].font.version, axes: G[k === 'sans' ? 'A-all-t' : 'C-all-t'].font.axes,
    sliceTa: path.basename(f.t), sliceShi: path.basename(f.s) }])),
  directions: DIRECTIONS.map((d) => ({ id: d.id, name: d.name, tiers: d.tiers, how: d.how })),
  lockupRatios: { horizontal: H_RATIO, vertical: V_RATIO },
  files,
}
if (svgOnly) { writeFileSync(path.join(OUT, 'wordmark-run.json'), JSON.stringify(run, null, 1) + '\n'); process.exit(0) }

// ---------- 拍图 ----------
if (!process.env.INVENTORY_PORT_OFFSET) process.env.INVENTORY_PORT_OFFSET = '43'
const { requireFromApp } = await import('../component-inventory/lib.mjs')
const { startRig, OWNER } = await import('../component-inventory/rig.mjs')
const { chromium } = requireFromApp('playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const settle = async (page, ms = 1200) => { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await sleep(ms) }
const ACCOUNT = { username: process.env.WORDMARK_USER || OWNER.username, password: process.env.WORDMARK_PASSWORD || OWNER.password }
const png = (buf) => 'data:image/png;base64,' + buf.toString('base64')
const svgUri = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64')
const inlineWord = (d, px, fill) => { const tk = tierFor(d, px); const w = word(d, tk); return `<svg viewBox="0 0 ${w.width} 1000" style="height:${px}px;width:${f1(px * w.width / 1000)}px;display:block" aria-label="獭石">${w.paths(fill)}</svg>` }
const SEL = { topbar: 'header.topbar .topbar-brand-title', login: '.login-brand > span' }

let rig = null
if (!base) { rig = await startRig({ quiet: true }); base = rig.base }
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const ctxOpts = (width, height, dpr) => ({ viewport: { width, height }, deviceScaleFactor: dpr, locale: 'zh-CN', reducedMotion: 'reduce' })
const shots = {} // shots[variant][place][dpr]
run.errors = []
const VARIANTS = [{ id: 'now', name: '现状（网站字体栈的文字）' }, ...DIRECTIONS]

// 把品牌字换成字标 SVG（只改 DOM）；现状那一行不换
async function swap(page, sel, d) {
  if (d.id === 'now') return
  await page.evaluate(([s, makeHtml]) => {
    for (const e of document.querySelectorAll(s)) {
      const fs = parseFloat(getComputedStyle(e).fontSize)
      e.innerHTML = makeHtml[fs <= 16 ? 'small' : 'large']
      const svg = e.querySelector('svg'); const r = Number(svg.dataset.ratio)
      svg.style.height = fs + 'px'; svg.style.width = (fs * r) + 'px'; svg.style.display = 'block'
      e.style.display = 'inline-flex'; e.style.alignItems = 'center'
    }
  }, [sel, Object.fromEntries(['small', 'large'].map((k) => {
    const tk = d.tiers.all ? 'all' : k; const w = word(d, tk)
    return [k, `<svg viewBox="0 0 ${w.width} 1000" data-ratio="${w.width / 1000}" aria-label="獭石">${w.paths(C.ink)}</svg>`]
  }))])
}
async function clip(page, locator, { padX = 0, padY = 0, maxW = null, fullLeft = false } = {}) {
  const b = await locator.boundingBox()
  const vp = page.viewportSize()
  const x0 = fullLeft ? 0 : Math.max(0, b.x - padX), y0 = Math.max(0, b.y - padY)
  let x1 = Math.min(vp.width, b.x + b.width + padX); if (maxW) x1 = Math.min(vp.width, x0 + maxW)
  const y1 = Math.min(vp.height, b.y + b.height + padY)
  return { buf: await page.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } }), w: Math.round(x1 - x0), h: Math.round(y1 - y0) }
}

try {
  for (const dpr of [2, 1]) {
    // 顶栏：首页（找题台），1440 宽，拍左半边
    {
      const context = await browser.newContext(ctxOpts(1440, 900, dpr)); const page = await context.newPage()
      page.on('pageerror', (e) => run.errors.push(`topbar-${dpr}x: ${String(e).slice(0, 200)}`))
      await page.goto(base + '/'); await page.locator('#login-username').waitFor({ timeout: 30000 })
      await page.locator('#login-username').fill(ACCOUNT.username); await page.locator('#login-password').fill(ACCOUNT.password)
      await page.locator('.login-submit').click(); await page.locator('.login-card').waitFor({ state: 'detached', timeout: 30000 })
      await page.goto(base + '/'); await page.locator('header.topbar').waitFor({ timeout: 30000 }); await settle(page, 1500)
      await page.mouse.move(2, 898)
      const orig = await page.evaluate((s) => { const e = document.querySelector(s); const cs = getComputedStyle(e); return { html: e.innerHTML, text: e.textContent.trim(), font: `${cs.fontSize}/${cs.fontWeight}`, family: cs.fontFamily } }, SEL.topbar)
      run.topbar = orig
      const brand = page.locator('header.topbar .topbar-brand').first()
      for (const d of VARIANTS) {
        await page.evaluate(([s, h]) => { for (const e of document.querySelectorAll(s)) { e.innerHTML = h; e.removeAttribute('style') } }, [SEL.topbar, orig.html])
        await swap(page, SEL.topbar, d); await sleep(120)
        ;((shots[d.id] ||= {}).topbar ||= {})[dpr] = await clip(page, brand, { padX: 16, padY: 12 })
      }
      await context.close()
    }
    // 登录页左上角：不登录，1440 宽
    {
      const context = await browser.newContext(ctxOpts(1440, 900, dpr)); const page = await context.newPage()
      page.on('pageerror', (e) => run.errors.push(`login-${dpr}x: ${String(e).slice(0, 200)}`))
      await page.goto(base + '/'); await page.locator('.login-card').waitFor({ timeout: 30000 }); await settle(page, 2500)
      await page.mouse.move(2, 898)
      const orig = await page.evaluate((s) => { const e = document.querySelector(s); const cs = getComputedStyle(e); return { html: e.innerHTML, text: e.textContent.trim(), font: `${cs.fontSize}/${cs.fontWeight}` } }, SEL.login)
      run.login = orig
      for (const d of VARIANTS) {
        await page.evaluate(([s, h]) => { for (const e of document.querySelectorAll(s)) { e.innerHTML = h; e.removeAttribute('style') } }, [SEL.login, orig.html])
        await swap(page, SEL.login, d); await sleep(120)
        ;((shots[d.id] ||= {}).login ||= {})[dpr] = await clip(page, page.locator('.login-brand'), { padX: 40, padY: 28, fullLeft: true, maxW: 260 })
      }
      await context.close()
    }
  }

  // ---------- 字号排、手机图标示意：先各自单独渲染，1x 和 2x 各拍一张 ----------
  const SIZES = [11, 15, 20, 32, 64]
  const bodyFamily = run.topbar.family
  const iconUri = svgUri(readFileSync(APP_ICON, 'utf8'))
  const baseCss = `* { box-sizing: border-box; } body { margin: 0; background: ${C.page}; color: ${C.ink}; font-family: ${bodyFamily}; -webkit-font-smoothing: antialiased; }`
  const sizeRow = (d) => `<div style="display:flex;align-items:center;gap:28px;padding:10px 14px;background:${C.page}">${SIZES.map((px) =>
    d.id === 'now' ? `<span style="font-size:${px}px;font-weight:600;line-height:1;white-space:nowrap">獭石</span>` : inlineWord(d, px, C.ink)).join('')}</div>`
  const sizeRowRev = (d, bg) => `<div style="display:flex;align-items:center;gap:28px;padding:10px 14px;background:${bg}">${SIZES.slice(0, 4).map((px) =>
    d.id === 'now' ? `<span style="font-size:${px}px;font-weight:600;line-height:1;color:${C.mistWhite};white-space:nowrap">獭石</span>` : inlineWord(d, px, C.mistWhite)).join('')}</div>`
  const appCell = (d, fill) => `<div style="width:76px;display:flex;flex-direction:column;align-items:center;gap:5px"><img src="${iconUri}" style="width:60px;height:60px;display:block">${
    d.id === 'now' ? `<span style="font-size:11px;line-height:13px;color:${fill}">獭石</span>` : `<div style="height:13px;display:flex;align-items:center">${inlineWord(d, 11, fill)}</div>`}</div>`
  const phone = (d) => `<div style="display:flex;gap:12px"><div style="display:flex;gap:16px;padding:14px 16px;background:${C.desk};border-radius:10px">${appCell(d, C.ink)}</div><div style="display:flex;gap:16px;padding:14px 16px;background:${C.ink};border-radius:10px">${appCell(d, C.mistWhite)}</div></div>`
  async function renderBlock(html, width, dpr) {
    const ctx = await browser.newContext(ctxOpts(width, 100, dpr)); const p = await ctx.newPage()
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${baseCss}</style></head><body><div id="b" style="display:inline-block">${html}</div></body></html>`)
    await p.evaluate(() => document.fonts.ready)
    const r = await clip(p, p.locator('#b')); await ctx.close(); return r
  }
  for (const d of VARIANTS) for (const dpr of [2, 1]) {
    ;((shots[d.id].sizes ||= {}))[dpr] = await renderBlock(sizeRow(d), 900, dpr)
    ;((shots[d.id].phone ||= {}))[dpr] = await renderBlock(phone(d), 400, dpr)
    if (dpr === 2) {
      shots[d.id].revInk = await renderBlock(sizeRowRev(d, C.ink), 900, 2)
      shots[d.id].revDeep = await renderBlock(sizeRowRev(d, C.deepMint), 900, 2)
    }
  }

  // ---------- 墨量：每个字在 1000×1000 格里的墨迹面积（像素数），量「獭」比「石」黑多少 ----------
  {
    const ctx = await browser.newContext(ctxOpts(200, 200, 1)); const p = await ctx.newPage()
    const tiers = DIRECTIONS.flatMap((d) => Object.keys(d.tiers).map((tk) => ({ id: d.id, tk, t: G[`${d.id}-${tk}-t`].d, s: G[`${d.id}-${tk}-s`].d })))
    run.inkArea = await p.evaluate((list) => {
      const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 1000; const ctx = cv.getContext('2d')
      const area = (d) => { ctx.clearRect(0, 0, 1000, 1000); ctx.fill(new Path2D(d)); const a = ctx.getImageData(0, 0, 1000, 1000).data; let n = 0; for (let i = 3; i < a.length; i += 4) n += a[i]; return n / 255 / 1e6 }
      return list.map(({ id, tk, t, s }) => { const at = area(t), as = area(s); return { id, tier: tk, ta: Math.round(at * 1000) / 10, shi: Math.round(as * 1000) / 10, ratio: Math.round((at / as) * 100) / 100 } })
    }, tiers)
    await ctx.close()
  }

  // ---------- 对比总图 ----------
  // 1x 屏的图按 zoom 倍放大、逐像素显示（不插值），看得见每个像素
  const img = (s, dpr, zoom = 1) => s ? `<img src="${png(s.buf)}" style="width:${s.w * zoom}px;height:${s.h * zoom}px;display:block;${dpr === 1 ? 'image-rendering:pixelated;' : ''}">` : '<span class="note">没拍到</span>'
  const pair = (o, zoom = 1) => `<div class="pair"><div><div class="k">2x 屏</div>${img(o[2], 2)}</div><div><div class="k">1x 屏${zoom > 1 ? `（放大 ${zoom} 倍，逐像素）` : '（原大，逐像素）'}</div>${img(o[1], 1, zoom)}</div></div>`
  const css = `${baseCss}
.sheet { padding: 28px; display: flex; flex-direction: column; gap: 22px; width: max-content; }
h1 { margin: 0; font-size: 22px; font-weight: 600; } h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
.meta, .note { color: #5b6b73; font-size: 12px; line-height: 1.5; max-width: 1500px; }
section { background: ${C.white}; border: 1px solid #d5dfe4; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.grid { display: grid; gap: 14px 22px; align-items: center; }
.lab { font-size: 13px; font-weight: 600; } .lab small { display: block; font-weight: 400; color: #5b6b73; font-size: 11px; max-width: 220px; line-height: 1.4; }
.k { font-size: 11px; color: #5b6b73; margin-bottom: 3px; }
.pair { display: flex; gap: 18px; align-items: flex-end; }
.tag { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: ${C.desk}; white-space: nowrap; }
.tag.mock { background: #fff6e0; border: 1px dashed #c9a24a; }`
  const lab = (d) => `<div class="lab">${d.name}<small>${d.id === 'now' ? `网站字体栈 600 的实时文字。本机没有苹方，显示的是文泉驿正黑` : d.how}</small></div>`
  const sizeHead = `<div></div><div class="k">${SIZES.map((s) => `${s}px`).join(' · ')}（字号 = SVG 的 em 框高；≤16px 用小档）</div>`
  const ink = (d) => (run.inkArea || []).filter((r) => r.id === d.id).map((r) => `${r.tier === 'all' ? '' : r.tier === 'small' ? '小档 ' : '大档 '}獭 ${r.ta}% · 石 ${r.shi}% · 比 ${r.ratio}`).join('<br>')
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="sheet">
<div><h1>「獭石」字标草稿 · 对比总图</h1><div class="meta">提案 · 单一来源，第一轮草稿 · ${run.date.slice(0, 10)} · scripts/brand/wordmark-drafts.mjs。字标是 Noto Sans SC / Noto Serif SC（SIL OFL 1.1）转成的轮廓路径，不依赖本机字体；「现状」一行是网站字体栈的实时文字，本机没有 PingFang SC，显示的是文泉驿正黑，和苹果设备上不同。顶栏和登录页是本地临时网站的真实页面，只在截图前改了 DOM，没改源码；手机图标是示意。墨 #191D18、反白雾白 #F2FAF6。</div></div>
<section><h2>1 各字号</h2><div class="note">墨量 = 字的墨迹面积占一个 em 方格的比例（脚本在 1000×1000 画布上量的）；「比」是 獭 ÷ 石。</div>
<div class="grid" style="grid-template-columns: 240px auto 200px">${sizeHead}<div class="k">墨量</div>
${VARIANTS.map((d) => `${lab(d)}${pair(shots[d.id].sizes)}<div class="note">${ink(d)}</div>`).join('\n')}</div></section>
<section><h2>2 顶栏 15px <span class="tag">真实页面 · 只改 DOM</span></h2><div class="note">首页（找题台）顶栏，1440 宽，左边是现有图形标志（实算字号 ${run.topbar?.font}）。字标按实算字号放：em 框高 = 字号。</div>
<div class="grid" style="grid-template-columns: 240px auto">${VARIANTS.map((d) => `${lab(d)}${pair(shots[d.id].topbar, 3)}`).join('\n')}</div></section>
<section><h2>3 手机图标下 11px <span class="tag mock">示意，不是真实页面</span></h2><div class="note">App 图标 design/brand-2026-10-13/mascot/app-icon.svg，60px；下面一行 11px。浅底是桌面色 #E6EDF0，深底是墨 #191D18（字用雾白）。</div>
<div class="grid" style="grid-template-columns: 240px auto">${VARIANTS.map((d) => `${lab(d)}${pair(shots[d.id].phone, 2)}`).join('\n')}</div></section>
<section><h2>4 登录页左上角 <span class="tag">真实页面 · 只改 DOM</span></h2><div class="note">登录页（没登录），1440 宽，左上角标志加品牌字（实算 ${run.login?.font}）。</div>
<div class="grid" style="grid-template-columns: 240px auto">${VARIANTS.map((d) => `${lab(d)}${pair(shots[d.id].login, 2)}`).join('\n')}</div></section>
<section><h2>5 反白（雾白字）</h2><div class="note">左：墨底；右：深薄荷底（BRAND.md §1.5：深薄荷底上的反白字标用雾白）。11 / 15 / 20 / 32px，2x 屏。</div>
<div class="grid" style="grid-template-columns: 240px auto auto">${VARIANTS.map((d) => `${lab(d)}${img(shots[d.id].revInk, 2)}${img(shots[d.id].revDeep, 2)}`).join('\n')}</div></section>
</div></body></html>`
  {
    const ctx = await browser.newContext(ctxOpts(1700, 400, 2)); const p = await ctx.newPage()
    await p.setContent(html, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready)
    await p.screenshot({ path: path.join(OUT, 'compare.png'), fullPage: true }); await ctx.close()
    console.log('写出 compare.png')
  }

  // ---------- 组合图：每个方向的字标、横排、竖排，墨色和反白 ----------
  const lockImg = (key, h) => { const l = LOCK[key]; return `<img src="${svgUri(l.svg)}" style="height:${h}px;width:${f1(h * l.w / l.h)}px;display:block">` }
  const wmImg = (d, tk, v, h) => { const w = word(d, tk); return `<img src="${svgUri(wordmarkSvg(d, tk, v))}" style="height:${h}px;width:${f1(h * w.width / 1000)}px;display:block">` }
  const tile = (bg, inner) => `<div style="background:${bg};padding:24px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:28px">${inner}</div>`
  const lockRows = DIRECTIONS.flatMap((d) => Object.keys(d.tiers).map((tk) => {
    const stem = `${d.id}${fileTier(tk)}`
    const small = tk === 'small'
    const hH = small ? 20 : 64, vH = small ? 40 : 96, wmH = small ? 15 : 64
    return `<div class="lab">${d.name}${tierLabel(tk) ? `<small>${tierLabel(tk)}${small ? '，按小尺寸放：横排标志 20px 高（字 15px），竖排 40px 高' : ''}</small>` : '<small>所有字号同一档</small>'}</div>
${tile(C.white, wmImg(d, tk, 'ink', wmH) + lockImg(`h-${stem}-ink`, hH) + lockImg(`v-${stem}-ink`, vH))}
${tile(C.ink, wmImg(d, tk, 'reverse', wmH) + lockImg(`h-${stem}-reverse`, hH) + lockImg(`v-${stem}-reverse`, vH))}`
  })).join('\n')
  const html2 = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="sheet">
<div><h1>「獭石」字标草稿 · 字标和组合</h1><div class="meta">提案 · 单一来源，第一轮草稿 · ${run.date.slice(0, 10)}。每行：字标、横排组合、竖排组合；左边白底墨字，右边墨底雾白字（图形标志在墨底上用彩色版，BRAND.md §3.1）。横排：字号 = 0.75 倍标志高，间距 0.4 倍标志高；竖排：字墨迹宽 = 0.9 倍标志宽，间距 0.22 倍标志高。图里是 svg/ 下的文件原样。</div></div>
<section><div class="grid" style="grid-template-columns: 240px auto auto">${lockRows}</div></section>
</div></body></html>`
  {
    const ctx = await browser.newContext(ctxOpts(1700, 400, 2)); const p = await ctx.newPage()
    await p.setContent(html2, { waitUntil: 'load' })
    await p.screenshot({ path: path.join(OUT, 'lockups.png'), fullPage: true }); await ctx.close()
    console.log('写出 lockups.png')
  }
} finally {
  await browser.close()
  if (rig) await rig.stop()
}
writeFileSync(path.join(OUT, 'wordmark-run.json'), JSON.stringify(run, null, 1) + '\n')
console.log('写到', path.relative(ROOT, OUT), run.errors.length ? `页面报错 ${run.errors.length} 条，见 wordmark-run.json` : '')
process.exit(0)
