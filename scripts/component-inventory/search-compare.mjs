#!/usr/bin/env node
// 搜索框构件换上前后逐像素对照（构件厂，2026-11-15）。先跑 search-shots.mjs before（改之前的代码）和 search-shots.mjs after。
//
// 比三组：
// 1. after 对 migrate-field/before（上一轮拍的「之前」，同名的都比）；
// 2. after 对这一轮重拍的 before（所有截图，加上整份实算样式和读屏信息）；
// 3. 重拍的 before 对 migrate-field/before（看拍照本身稳不稳：同一份代码拍两次要一模一样）。
// 像素比法：两张 PNG 在浏览器里画上 canvas，逐个像素比 RGBA，数出不一样的像素；尺寸不同直接算不一致。
//
// 用法：node scripts/component-inventory/search-compare.mjs
// 输出：design/components-2026-11-13/migrate-search/ 下的 diff.json、after/（截图）、before-extra/（上一轮没拍的状态的「之前」）、
//      compare-*.png（拼版对照）。整份实算样式太大，不进仓库，只把差异（应为空）写进 diff.json。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, RAW, requireFromApp } from './lib.mjs'

const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-search')
const OLD = path.join(ROOT, 'design/components-2026-11-13/migrate-field/before')
const BEFORE = path.join(RAW, 'search/before')
const AFTER = path.join(RAW, 'search/after')
for (const d of [BEFORE, AFTER]) if (!existsSync(d)) { console.error('先跑 search-shots.mjs before / after，缺', d); process.exit(2) }

const pngs = (dir) => readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
// 这一轮关心的截图：搜索框、首页、浏览页、听写页（migrate-field/before 里草稿卷、管理页那些不比）
const RELEVANT = /^(home-|browse-|vocab-dictation-)/

const { chromium } = requireFromApp('playwright')
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
await page.setContent('<!doctype html><canvas></canvas>')

async function pixelDiff(a, b) {
  const da = 'data:image/png;base64,' + readFileSync(a).toString('base64')
  const db = 'data:image/png;base64,' + readFileSync(b).toString('base64')
  return page.evaluate(async ([da, db]) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
    const [ia, ib] = await Promise.all([load(da), load(db)])
    if (ia.width !== ib.width || ia.height !== ib.height) return { same: false, size: [`${ia.width}x${ia.height}`, `${ib.width}x${ib.height}`] }
    const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data }
    const pa = px(ia), pb = px(ib)
    let diff = 0, box = null
    for (let i = 0; i < pa.length; i += 4) {
      if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2] || pa[i + 3] !== pb[i + 3]) {
        diff += 1
        const p = i / 4, x = p % ia.width, y = Math.floor(p / ia.width)
        box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y]
      }
    }
    return { same: diff === 0, size: `${ia.width}x${ia.height}`, pixels: ia.width * ia.height, diff, box }
  }, [da, db])
}

async function compareDirs(a, b, filter = () => true) {
  const names = pngs(a).filter((n) => existsSync(path.join(b, n)) && filter(n))
  const rows = {}
  for (const n of names) rows[n] = await pixelDiff(path.join(a, n), path.join(b, n))
  return rows
}

// 实算样式：同一状态、同一元素（按顺序）、每个属性逐个比。
function diffStyles(sa, sb) {
  const out = []
  let props = 0
  for (const state of Object.keys(sa)) {
    const ea = sa[state], eb = sb[state]
    if (!eb) { out.push({ state, missing: 'after 没有这个状态' }); continue }
    if (ea === null || eb === null) { if (ea !== eb) out.push({ state, missing: 'one side null' }); continue }
    if (ea.length !== eb.length) out.push({ state, elements: [ea.length, eb.length] })
    for (let i = 0; i < Math.min(ea.length, eb.length); i += 1) {
      const x = ea[i], y = eb[i]
      if (x.tag !== y.tag) out.push({ state, i, tag: [x.tag, y.tag] })
      if (JSON.stringify(x.rect) !== JSON.stringify(y.rect)) out.push({ state, i, tag: x.tag, rect: [x.rect, y.rect] })
      for (const key of ['style', 'placeholderStyle']) {
        if (!x[key] && !y[key]) continue
        const keys = new Set([...Object.keys(x[key] || {}), ...Object.keys(y[key] || {})])
        for (const k of keys) {
          props += 1
          if ((x[key] || {})[k] !== (y[key] || {})[k]) out.push({ state, i, tag: x.tag, prop: (key === 'placeholderStyle' ? '::placeholder ' : '') + k, before: (x[key] || {})[k], after: (y[key] || {})[k] })
        }
      }
      const attrs = new Set([...Object.keys(x.attrs), ...Object.keys(y.attrs)])
      for (const k of attrs) if (x.attrs[k] !== y.attrs[k]) out.push({ state, i, tag: x.tag, attr: k, before: x.attrs[k], after: y.attrs[k] })
    }
  }
  return { propsCompared: props, differences: out }
}

function diffAx(aa, ab) {
  const out = []
  for (const k of Object.keys(aa)) if (aa[k] !== ab[k]) out.push({ state: k, before: aa[k], after: ab[k] })
  return out
}

const summarize = (rows) => {
  const v = Object.values(rows)
  return { compared: v.length, same: v.filter((r) => r.same).length, different: Object.entries(rows).filter(([, r]) => !r.same).map(([n]) => n) }
}

try {
  const afterVsOld = await compareDirs(AFTER, OLD, (n) => RELEVANT.test(n))
  const afterVsBefore = await compareDirs(AFTER, BEFORE)
  const beforeVsOld = await compareDirs(BEFORE, OLD, (n) => RELEVANT.test(n))
  const styles = diffStyles(JSON.parse(readFileSync(path.join(BEFORE, 'styles.json'), 'utf8')), JSON.parse(readFileSync(path.join(AFTER, 'styles.json'), 'utf8')))
  const axDiff = diffAx(JSON.parse(readFileSync(path.join(BEFORE, 'ax.json'), 'utf8')), JSON.parse(readFileSync(path.join(AFTER, 'ax.json'), 'utf8')))
  const missing = { before: JSON.parse(readFileSync(path.join(BEFORE, 'missing.json'), 'utf8')), after: JSON.parse(readFileSync(path.join(AFTER, 'missing.json'), 'utf8')) }

  mkdirSync(OUT, { recursive: true })
  for (const sub of ['after', 'before-extra']) { rmSync(path.join(OUT, sub), { recursive: true, force: true }); mkdirSync(path.join(OUT, sub)) }
  for (const n of pngs(AFTER)) copyFileSync(path.join(AFTER, n), path.join(OUT, 'after', n))
  // 上一轮没拍的状态，「之前」用这一轮在改之前的代码上拍的
  for (const n of pngs(BEFORE)) if (!existsSync(path.join(OLD, n))) copyFileSync(path.join(BEFORE, n), path.join(OUT, 'before-extra', n))
  copyFileSync(path.join(AFTER, 'ax.json'), path.join(OUT, 'after', 'ax.json'))

  const result = {
    note: '像素比：same = 每个像素 RGBA 都一样。styles：搜索框里每个元素整份 getComputedStyle（含 ::placeholder）逐项比，differences 应为空。',
    summary: {
      'after 对 migrate-field/before': summarize(afterVsOld),
      'after 对 这一轮重拍的 before': summarize(afterVsBefore),
      '重拍的 before 对 migrate-field/before（拍照稳不稳）': summarize(beforeVsOld),
      '实算样式': { propsCompared: styles.propsCompared, differences: styles.differences.length },
      '读屏信息（ariaSnapshot）不同的状态': axDiff.length,
    },
    afterVsOld, afterVsBefore, beforeVsOld,
    styleDifferences: styles.differences,
    axDifferences: axDiff,
    missing,
  }
  writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify(result, null, 1) + '\n')
  console.log(JSON.stringify(result.summary, null, 1))
  if (styles.differences.length) console.log('样式差异（前 30 条）', styles.differences.slice(0, 30))
  if (axDiff.length) console.log('读屏差异', axDiff)

  // 拼版对照：之前（migrate-field/before，没有的用 before-extra）| 之后
  const beforeOf = (n) => existsSync(path.join(OLD, n)) ? path.join(OLD, n) : path.join(OUT, 'before-extra', n)
  const SHEETS = [
    ['compare-home', '首页大搜索框 · hero', ['home-search', 'home-search-focus', 'home-search-typed', 'home-search-submit-hover', 'home-search-tab1', 'home-search-tab2', 'home-search-results', 'home-search-loading']],
    ['compare-browse', '浏览页紧凑搜索框 · compact', ['browse-search', 'browse-search-focus', 'browse-search-typed', 'browse-search-submit-hover', 'browse-search-tab1', 'browse-search-tab2', 'browse-search-results']],
  ]
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  for (const [file, title, names] of SHEETS) {
    const cells = []
    for (const suffix of ['', '-390']) {
      for (const base of names) {
        const n = `${base}${suffix}.png`
        if (!existsSync(path.join(AFTER, n))) continue
        const r = afterVsOld[n] || afterVsBefore[n]
        const verdict = r?.same ? '逐像素一样' : `不一样：${r?.diff ?? '?'} 像素`
        cells.push(`<div class="pair"><h2>${n.replace('.png', '')} <span>${verdict}</span></h2><figure><figcaption>之前</figcaption><img src="${pathToFileURL(beforeOf(n)).href}"></figure><figure><figcaption>之后</figcaption><img src="${pathToFileURL(path.join(AFTER, n)).href}"></figure></div>`)
      }
    }
    // 对照页是给人看的拼版，颜色写死只在这个脚本里，不进产品代码。
    const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#F3F6F8;font:14px/1.5 Inter,"PingFang SC","Noto Sans CJK SC",sans-serif;color:#1B2B33;width:1552px}
h1{font-size:18px;margin:0 0 16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#fff;border-radius:12px;padding:12px;align-content:start}
.pair h2{grid-column:1/-1;font-size:13px;margin:0;font-weight:600}.pair h2 span{font-weight:400;color:#5A6C75}
figure{margin:0}figcaption{font-size:12px;color:#5A6C75;margin-bottom:4px}img{max-width:100%;display:block;border:1px solid #DCE6EB}
</style><h1>${title}：之前 / 之后（1440 在前，390 在后）</h1><div class="grid">${cells.join('')}</div>`
    const htmlFile = path.join(RAW, `search-${file}.html`)
    writeFileSync(htmlFile, html)
    await sheet.goto(pathToFileURL(htmlFile).href); await sheet.waitForLoadState('load')
    await sheet.screenshot({ path: path.join(OUT, `${file}.png`), fullPage: true })
  }
} finally {
  await browser.close()
}
