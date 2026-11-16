#!/usr/bin/env node
// 视觉规范手册 · 从仓库里的 JSX 源头生成 PDF 和每页 PNG 预览（BRAND.md §3.5）。
//
// 源头：design/brand-2026-10-13/manual/src/ 下的 NN-名字.jsx（每份是一个 1600×1132 画板，内联样式）。
// 文件名以两位数字开头的才进手册，按文件名排序（05b 排在 05 后面）；template.jsx 是内页模板，不进 PDF。
// 图片地址写的是相对 src/ 的路径，生成时用 <base> 指回 src/，不联网。
//
// 做法：
//   1. 用 app/ 里已装的 vite 自带的 oxc 把 JSX 转成 React.createElement，用 app/ 里的 react-dom/server 渲染成静态 HTML。
//   2. 字体：源文件里的字体栈不改（苹方在前）。生成时只在 HTML 里，在每个字体栈的 system-ui 前面插入
//      "Noto Sans SC Variable"，在 "Noto Serif SC" 后面插入 "Noto Serif SC Variable"，字体文件从临时目录里的
//      npm 公共包 @fontsource-variable/noto-sans-sc、noto-serif-sc 读（不进仓库）。机器上有苹方时苹方在前，后备不起作用。
//   3. 用 app/ 里已装的 Playwright 的 Chromium 按 1600×1132 每页出一份 PDF，再用 server/ 里已有的 pdf-lib 按页序合成一份；
//      找不到 pdf-lib 时改用 Chromium 一次打印多页。每页另出一张 1 倍 PNG。
//   4. 每页做几项自动检查：图片加载失败、文字超出画板、内容在有裁切的盒子里被截断。
//   5. 加 --compare 时，把每页 PNG 和 source-0.5/png/ 里同名的 Paper 截图（缩到 1 倍）逐像素比，算差异像素比例。
//
// 用法：
//   MANUAL_FONTSOURCE_DIR=<装了两个字体包的 node_modules 目录> node scripts/brand/build-manual.mjs [选项]
//   字体包装到临时目录，例如：
//     npm install --prefix <临时目录> --ignore-scripts @fontsource-variable/noto-sans-sc@5.3.1 @fontsource-variable/noto-serif-sc@5.3.1
//     （MANUAL_FONTSOURCE_DIR 就是 <临时目录>/node_modules；不设时不加后备字体，脚本会提示）
// 选项：
//   --src <目录>        源头目录，默认 design/brand-2026-10-13/manual/src
//   --out <文件>        PDF 输出路径，默认 design/brand-2026-10-13/manual/视觉规范手册-草案0.6-预览.pdf
//   --title <文字>      写进 PDF 元数据的标题，默认「视觉规范手册 · 草案 0.6（预览）」
//   --png-dir <目录>    每页 PNG 的输出目录，默认 design/brand-2026-10-13/manual/build/png（会先清空其中的 .png）
//   --report <文件>     检查结果 JSON，默认 design/brand-2026-10-13/manual/build/build-report.json
//   --compare           和 source-0.5/png/ 的 Paper 截图逐页比，结果写进 report
//   --diff-dir <目录>   比较时把差异图写到这里（建议临时目录；不给就不写）
//   --keep-html <目录>  把每页的 HTML 留在这个目录（建议临时目录）
//   --only <NN,...>     只渲染这几页（按文件名前缀），只出 PNG 和检查，不出 PDF
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MANUAL = path.join(ROOT, 'design/brand-2026-10-13/manual')
const W = 1600
const H = 1132

// ---------- 参数 ----------
const argv = process.argv.slice(2)
const opt = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : def
}
const SRC = path.resolve(opt('--src', path.join(MANUAL, 'src')))
const OUT = path.resolve(opt('--out', path.join(MANUAL, '视觉规范手册-草案0.6-预览.pdf')))
const TITLE = opt('--title', '视觉规范手册 · 草案 0.6（预览）')
const PNG_DIR = path.resolve(opt('--png-dir', path.join(MANUAL, 'build/png')))
const REPORT = path.resolve(opt('--report', path.join(MANUAL, 'build/build-report.json')))
const COMPARE = argv.includes('--compare')
const DIFF_DIR = opt('--diff-dir', null)
const KEEP_HTML = opt('--keep-html', null)
const ONLY = opt('--only', null)?.split(',').map((s) => s.trim()).filter(Boolean)
const PAPER_PNG = path.join(MANUAL, 'source-0.5/png')
const FS_DIR = process.env.MANUAL_FONTSOURCE_DIR

// ---------- 依赖：只用仓库里已经装好的 ----------
const appRequire = createRequire(path.join(ROOT, 'app/package.json'))
const serverRequire = createRequire(path.join(ROOT, 'server/package.json'))
const React = appRequire('react')
const { renderToStaticMarkup } = appRequire('react-dom/server')
const { chromium } = appRequire('playwright')
const vite = await import(pathToFileURL(appRequire.resolve('vite')).href)
let PDFDocument = null
try {
  ;({ PDFDocument } = serverRequire('pdf-lib'))
} catch {
  console.warn('没找到 server/ 里的 pdf-lib，改用 Chromium 一次打印多页。')
}

// ---------- 页面清单 ----------
const pages = readdirSync(SRC)
  .filter((f) => /^\d\d[^/]*\.jsx$/.test(f))
  .sort()
  .filter((f) => !ONLY || ONLY.some((p) => f.startsWith(p)))
if (!pages.length) {
  console.error(`在 ${SRC} 里没找到页面`)
  process.exit(2)
}

// ---------- 字体后备 ----------
function fontsourceCss(pkg) {
  const dir = path.join(FS_DIR, '@fontsource-variable', pkg)
  const css = readFileSync(path.join(dir, 'index.css'), 'utf8')
  return css
    .replace(/url\(\.\/files\/([^)]+)\)/g, (_, f) => `url(${pathToFileURL(path.join(dir, 'files', f)).href})`)
    .replace(/font-display:\s*swap/g, 'font-display: block')
}
let fontCss = ''
const fontInfo = { fallback: false, packages: [] }
if (FS_DIR && existsSync(path.join(FS_DIR, '@fontsource-variable/noto-sans-sc'))) {
  for (const pkg of ['noto-sans-sc', 'noto-serif-sc']) {
    const pj = path.join(FS_DIR, '@fontsource-variable', pkg, 'package.json')
    if (!existsSync(pj)) continue
    fontCss += fontsourceCss(pkg)
    const { name, version } = JSON.parse(readFileSync(pj, 'utf8'))
    fontInfo.packages.push(`${name}@${version}`)
  }
  fontInfo.fallback = true
} else {
  console.warn('没设 MANUAL_FONTSOURCE_DIR（或目录里没有 @fontsource-variable/noto-sans-sc）：不加后备字体，缺苹方时由系统字体顶上。')
}
// 只改生成的 HTML，不改源头：system-ui 前插 Noto Sans SC，"Noto Serif SC" 后插可变版
function addFallbacks(html) {
  if (!fontInfo.fallback) return html
  return html
    .replace(/&quot;Noto Serif SC&quot;,/g, '&quot;Noto Serif SC&quot;, &quot;Noto Serif SC Variable&quot;,')
    .replace(/, system-ui,/g, ', &quot;Noto Sans SC Variable&quot;, system-ui,')
}

// ---------- JSX → HTML ----------
const tmp = mkdtempSync(path.join(os.tmpdir(), 'eqb-manual-'))
const reactUrl = pathToFileURL(appRequire.resolve('react')).href
async function renderPage(file) {
  const raw = readFileSync(path.join(SRC, file), 'utf8')
  const body = raw.replace(/^\s*\/\/.*\n/, '') // 第一行是注释
  const code = `import React from ${JSON.stringify(reactUrl)};\nconst page = ${body.trim()};\nexport default page;\n`
  const { code: js } = await vite.transformWithOxc(code, file, { lang: 'jsx', jsx: { runtime: 'classic' } })
  const mod = path.join(tmp, file.replace(/\.jsx$/, '.mjs'))
  writeFileSync(mod, js)
  const el = (await import(pathToFileURL(mod).href)).default
  const markup = addFallbacks(renderToStaticMarkup(el))
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<base href="${pathToFileURL(SRC).href}/">
<title>${file}</title>
<style>
${fontCss}
@page { size: ${W}px ${H}px; margin: 0 }
html, body { margin: 0; padding: 0; background: #FFFFFF }
.board { width: ${W}px; height: ${H}px; overflow: hidden; position: relative; break-after: page }
.board > div { width: ${W}px; height: ${H}px }
</style></head><body><div class="board">${markup}</div></body></html>`
}

// ---------- 浏览器里的检查 ----------
async function settle(page) {
  return page.evaluate(async () => {
    const urls = new Set()
    for (const el of document.querySelectorAll('*')) {
      const bg = getComputedStyle(el).backgroundImage
      for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1])
    }
    for (const img of document.images) urls.add(img.src)
    const failed = []
    await Promise.all(
      [...urls].map(
        (u) =>
          new Promise((res) => {
            const i = new Image()
            i.onload = () => (i.decode ? i.decode().catch(() => {}).then(res) : res())
            i.onerror = () => {
              failed.push(decodeURI(u))
              res()
            }
            i.src = u
          }),
      ),
    )
    await document.fonts.ready
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return { images: urls.size, failed }
  })
}
async function checkLayout(page) {
  return page.evaluate(() => {
    const board = document.querySelector('.board > div')
    const B = board.getBoundingClientRect()
    const outOfBoard = []
    const clipped = []
    const text = (el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ')
    for (const el of board.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (!r.width && !r.height) continue
      const t = text(el)
      if (t && (r.right > B.right + 0.5 || r.bottom > B.bottom + 0.5 || r.left < B.left - 0.5 || r.top < B.top - 0.5)) {
        outOfBoard.push({ text: t.slice(0, 40), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] })
      }
      const cs = getComputedStyle(el)
      const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible'
      if (clips && el !== board && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
        clipped.push({
          text: (el.textContent || '').trim().slice(0, 40),
          box: [el.clientWidth, el.clientHeight],
          content: [el.scrollWidth, el.scrollHeight],
        })
      }
    }
    return { outOfBoard, clipped }
  })
}
async function detectPingFang(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d')
    const w = (f) => {
      c.font = `40px ${f}`
      return c.measureText('獭石题库永和 Aa Qg 0123').width
    }
    const missing = (fam) => w(`"${fam}", monospace`) === w('monospace') && w(`"${fam}", serif`) === w('serif')
    return { 'PingFang SC': !missing('PingFang SC'), 'Noto Serif SC': !missing('Noto Serif SC'), Inter: !missing('Inter') }
  })
}

// ---------- 和 Paper 截图比 ----------
async function compare(page, mine, paper, diffOut) {
  const toData = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`
  return page.evaluate(
    async ({ a, b, W, H, wantDiff }) => {
      const load = (src) => new Promise((res, rej) => Object.assign(new Image(), { onload() { res(this) }, onerror: rej, src }))
      const [ia, ib] = await Promise.all([load(a), load(b)])
      const ctx = (img) => {
        const c = document.createElement('canvas')
        c.width = W
        c.height = H
        const x = c.getContext('2d')
        x.imageSmoothingQuality = 'high'
        x.drawImage(img, 0, 0, W, H)
        return x.getImageData(0, 0, W, H).data
      }
      const da = ctx(ia)
      const db = ctx(ib)
      const out = document.createElement('canvas')
      out.width = W
      out.height = H
      const ox = out.getContext('2d')
      const od = ox.createImageData(W, H)
      let diff = 0
      const bands = { header: [0, 0], body: [0, 0], footer: [0, 0] } // 页眉 0–110，页脚 1020 以下
      for (let i = 0, p = 0; i < da.length; i += 4, p++) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]))
        const y = Math.floor(p / W)
        const band = y < 110 ? 'header' : y >= 1020 ? 'footer' : 'body'
        bands[band][1]++
        const g = 255 - Math.round(((da[i] + da[i + 1] + da[i + 2]) / 3) * 0.15)
        if (d > 40) {
          diff++
          bands[band][0]++
          od.data.set([220, 40, 40, 255], i)
        } else od.data.set([g, g, g, 255], i)
      }
      ox.putImageData(od, 0, 0)
      const pct = (a, b) => Math.round((a / b) * 10000) / 100
      return {
        diffPct: pct(diff, W * H),
        headerPct: pct(...bands.header),
        bodyPct: pct(...bands.body),
        footerPct: pct(...bands.footer),
        diffPng: wantDiff ? out.toDataURL('image/png') : null,
      }
    },
    { a: toData(mine), b: toData(paper), W, H, wantDiff: !!diffOut },
  ).then((r) => {
    if (diffOut && r.diffPng) writeFileSync(diffOut, Buffer.from(r.diffPng.split(',')[1], 'base64'))
    delete r.diffPng
    return r
  })
}

// ---------- 主流程 ----------
mkdirSync(PNG_DIR, { recursive: true })
if (!ONLY) for (const f of readdirSync(PNG_DIR)) if (f.endsWith('.png')) rmSync(path.join(PNG_DIR, f))
if (KEEP_HTML) mkdirSync(KEEP_HTML, { recursive: true })
if (DIFF_DIR) mkdirSync(DIFF_DIR, { recursive: true })

// 和仓库里其他截图脚本一样用 Playwright 的完整 Chromium（verify-architecture-housekeeping 管这条）
const browser = await chromium.launch({ channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const report = { generatedAt: new Date().toISOString(), src: path.relative(ROOT, SRC), out: path.relative(ROOT, OUT), font: fontInfo, pages: [], errors }
const pdfParts = []
const htmls = []
for (const file of pages) {
  const name = file.replace(/\.jsx$/, '')
  const html = await renderPage(file)
  htmls.push(html)
  const htmlPath = path.join(KEEP_HTML || tmp, `${name}.html`)
  writeFileSync(htmlPath, html)
  await page.goto(pathToFileURL(htmlPath).href)
  const loaded = await settle(page)
  if (!report.fontsInstalled) report.fontsInstalled = await detectPingFang(page)
  const layout = await checkLayout(page)
  const png = path.join(PNG_DIR, `${name}.png`)
  await page.screenshot({ path: png, clip: { x: 0, y: 0, width: W, height: H } })
  if (!ONLY && PDFDocument) pdfParts.push(await page.pdf({ width: `${W}px`, height: `${H}px`, printBackground: true, preferCSSPageSize: true }))
  const entry = { page: name, images: loaded.images, failedImages: loaded.failed, ...layout }
  const paper = path.join(PAPER_PNG, `${name}.png`)
  if (COMPARE) entry.compare = existsSync(paper) ? await compare(page, png, paper, DIFF_DIR && path.join(DIFF_DIR, `${name}.png`)) : null
  report.pages.push(entry)
  const flags = [loaded.failed.length && `图片失败 ${loaded.failed.length}`, layout.outOfBoard.length && `超出画板 ${layout.outOfBoard.length}`, layout.clipped.length && `被截 ${layout.clipped.length}`].filter(Boolean)
  console.log(`${name}  图 ${loaded.images}${entry.compare ? `  差异 ${entry.compare.diffPct}%` : ''}${flags.length ? '  ' + flags.join('，') : ''}`)
}

if (!ONLY) {
  let bytes
  if (PDFDocument) {
    const doc = await PDFDocument.create()
    for (const part of pdfParts) {
      const src = await PDFDocument.load(part)
      const copied = await doc.copyPages(src, src.getPageIndices())
      copied.forEach((p) => doc.addPage(p))
    }
    doc.setTitle(TITLE)
    doc.setCreator('scripts/brand/build-manual.mjs')
    doc.setProducer('Chromium（Playwright）+ pdf-lib')
    bytes = await doc.save()
    report.pdfPages = doc.getPageCount()
  } else {
    const all = htmls[0].replace(/<body>[\s\S]*<\/body>/, `<body>${htmls.map((h) => h.match(/<body>([\s\S]*)<\/body>/)[1]).join('')}</body>`)
    const p = path.join(tmp, 'all.html')
    writeFileSync(p, all)
    await page.goto(pathToFileURL(p).href)
    await settle(page)
    bytes = await page.pdf({ width: `${W}px`, height: `${H}px`, printBackground: true, preferCSSPageSize: true })
    report.pdfPages = pages.length
  }
  writeFileSync(OUT, bytes)
  console.log(`PDF：${path.relative(ROOT, OUT)}，${report.pdfPages} 页，${(bytes.length / 1024 / 1024).toFixed(2)} MB`)
}
await browser.close()
rmSync(tmp, { recursive: true, force: true })

const fi = report.fontsInstalled || {}
report.preview = !fi['PingFang SC']
console.log(`本机字体：苹方 ${fi['PingFang SC'] ? '有' : '没有'}，Noto Serif SC ${fi['Noto Serif SC'] ? '有' : '没有'}，Inter ${fi.Inter ? '有' : '没有'}；后备字体 ${fontInfo.fallback ? fontInfo.packages.join('、') : '未加载'}`)
if (report.preview) console.log('这台机器没有苹方，出的是预览版：字形和字宽与 Mac 上不同。')
else if (/预览/.test(path.basename(OUT))) console.log('这台机器有苹方，可以出正式版：用 --out 换一个不带「预览」的文件名。')
console.log(`页面报错 ${errors.length} 条`)
mkdirSync(path.dirname(REPORT), { recursive: true })
writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n')
