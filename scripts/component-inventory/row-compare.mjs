#!/usr/bin/env node
// 行、底部提示换上前后逐像素对照（构件厂，2026-11-15）。先在改之前的代码上跑
//   row-shots.mjs before、before2（默认测试数据）、INVENTORY_SEED=full 的 before、before2（满数据，出 -full 目录）、
//   toast-shots.mjs before，
// 改之后再跑 row-shots.mjs after（两种数据）和 toast-shots.mjs after。
//
// 比三组（每套数据各比一遍）：
// 1. before2 对 before：同一份代码拍两遍，看拍照本身稳不稳；
// 2. after 对 before：每张截图逐像素比 RGBA，不一样的数出像素数和范围；
// 3. 实算样式（row-shots.mjs 记的每一行的位置、底、边、内衬、最小高）逐项比。
// 拼版：之前 | 之后 | 差异（不一样的像素涂红，一样的变淡），按页面分几张。
//
// 用法：node scripts/component-inventory/row-compare.mjs
// 输出：design/components-2026-11-13/migrate-row-toast/ 下的 before/、after/（截图，文件名前缀是哪套数据）、compare-*.png、diff.json
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, RAW, requireFromApp } from './lib.mjs'

const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-row-toast')
// 每套：名字前缀、before、before2（没有就不比稳不稳）、after
const SETS = [
  ['row', path.join(RAW, 'row/before'), path.join(RAW, 'row/before2'), path.join(RAW, 'row/after')],
  ['row-full', path.join(RAW, 'row/before-full'), path.join(RAW, 'row/before2-full'), path.join(RAW, 'row/after-full')],
  ['toast', path.join(RAW, 'toast/before'), null, path.join(RAW, 'toast/after')],
]
for (const [, ...dirs] of SETS) for (const d of dirs) if (d && !existsSync(d)) { console.error('先跑 row-shots.mjs / toast-shots.mjs，缺', d); process.exit(2) }

const pngs = (dir) => readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
const dataUrl = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64')

const { chromium } = requireFromApp('playwright')
const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage()
await page.setContent('<!doctype html><canvas></canvas>')

// 返回比较结果；withMask 时另给一张差异图（data URL）：不一样的像素涂红，一样的取原图变淡。
async function pixelDiff(a, b, withMask = false) {
  return page.evaluate(async ([da, db, withMask]) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
    const [ia, ib] = await Promise.all([load(da), load(db)])
    if (ia.width !== ib.width || ia.height !== ib.height) return { same: false, size: [`${ia.width}x${ia.height}`, `${ib.width}x${ib.height}`] }
    const ctx = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return [c, x] }
    const [, xa] = ctx(ia), [cb, xb] = ctx(ib)
    const pa = xa.getImageData(0, 0, ia.width, ia.height).data
    const imgB = xb.getImageData(0, 0, ib.width, ib.height), pb = imgB.data
    let diff = 0, box = null
    for (let i = 0; i < pa.length; i += 4) {
      const d = pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2] || pa[i + 3] !== pb[i + 3]
      if (d) {
        diff += 1
        const p = i / 4, x = p % ia.width, y = Math.floor(p / ia.width)
        box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y]
      }
      if (withMask) {
        if (d) { pb[i] = 230; pb[i + 1] = 0; pb[i + 2] = 0; pb[i + 3] = 255 }
        else { pb[i] = 255 - (255 - pb[i]) * 0.25; pb[i + 1] = 255 - (255 - pb[i + 1]) * 0.25; pb[i + 2] = 255 - (255 - pb[i + 2]) * 0.25 }
      }
    }
    let mask = null
    if (withMask) { xb.putImageData(imgB, 0, 0); mask = cb.toDataURL('image/png') }
    return { same: diff === 0, size: `${ia.width}x${ia.height}`, pixels: ia.width * ia.height, diff, box, mask }
  }, [dataUrl(a), dataUrl(b), withMask])
}

function diffMeasures(ma, mb) {
  const out = []
  for (const state of Object.keys(ma)) {
    for (const sel of Object.keys(ma[state] || {})) {
      const xa = ma[state][sel] || [], xb = (mb[state] || {})[sel] || []
      // 提示的 measure 一个状态只有一组值（不是一列行），直接逐项比。
      if (!Array.isArray(xa)) { if (JSON.stringify(xa) !== JSON.stringify(xb)) out.push({ state, prop: sel, before: xa, after: xb }); continue }
      if (xa.length !== xb.length) { out.push({ state, sel, count: [xa.length, xb.length] }); continue }
      xa.forEach((x, i) => {
        const y = xb[i]
        for (const k of Object.keys(x)) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) out.push({ state, sel, i, prop: k, before: x[k], after: y[k] })
      })
    }
  }
  return out
}

const summarize = (rows) => {
  const v = Object.values(rows)
  return { compared: v.length, same: v.filter((r) => r.same).length, different: Object.entries(rows).filter(([, r]) => !r.same).map(([n, r]) => `${n}（${r.diff ?? r.size} 像素）`) }
}

const read = (d, f) => (existsSync(path.join(d, f)) ? JSON.parse(readFileSync(path.join(d, f), 'utf8')) : {})

try {
  mkdirSync(OUT, { recursive: true })
  for (const sub of ['before', 'after']) { rmSync(path.join(OUT, sub), { recursive: true, force: true }); mkdirSync(path.join(OUT, sub)) }
  const result = { note: '像素比：same = 每个像素 RGBA 都一样（2 倍图）。measure：每一行（和列表、提示）的位置、底、边、内衬、最小高逐项比。', summary: {}, sets: {} }
  const changed = {}, masks = {}, dirsOf = {}
  for (const [name, BEFORE, BEFORE2, AFTER] of SETS) {
    const stable = {}, ch = {}
    if (BEFORE2) for (const n of pngs(BEFORE)) if (existsSync(path.join(BEFORE2, n))) { const { mask, ...r } = await pixelDiff(path.join(BEFORE, n), path.join(BEFORE2, n)); stable[n] = r }
    for (const n of pngs(AFTER)) {
      if (!existsSync(path.join(BEFORE, n))) continue
      const { mask, ...r } = await pixelDiff(path.join(BEFORE, n), path.join(AFTER, n), true)
      ch[n] = r
      const key = `${name}--${n}`
      changed[key] = r; dirsOf[key] = [BEFORE, AFTER, n]
      if (mask) masks[key] = mask
    }
    for (const n of pngs(BEFORE)) copyFileSync(path.join(BEFORE, n), path.join(OUT, 'before', `${name}--${n}`))
    for (const n of pngs(AFTER)) copyFileSync(path.join(AFTER, n), path.join(OUT, 'after', `${name}--${n}`))
    const measures = diffMeasures(read(BEFORE, 'measure.json'), read(AFTER, 'measure.json'))
    const measureStable = BEFORE2 ? diffMeasures(read(BEFORE, 'measure.json'), read(BEFORE2, 'measure.json')) : []
    result.summary[name] = {
      '拍照稳不稳（before2 对 before）': BEFORE2 ? summarize(stable) : '没拍第二遍',
      'after 对 before': summarize(ch),
      '实算样式不同（after 对 before）': measures.length,
      '实算样式不同（before2 对 before）': measureStable.length,
    }
    result.sets[name] = {
      stable, changed: ch, measureDifferences: measures, measureStable,
      measureBefore: read(BEFORE, 'measure.json'), measureAfter: read(AFTER, 'measure.json'),
      missing: { before: read(BEFORE, 'missing.json'), before2: BEFORE2 ? read(BEFORE2, 'missing.json') : null, after: read(AFTER, 'missing.json') },
    }
  }
  writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify(result, null, 1) + '\n')
  console.log(JSON.stringify(result.summary, null, 1))

  const SHEETS = [
    ['compare-home', '首页：「接着做」「今天翻到」、最近上新卷行、出结果的卷行（悬停、展开、题组行）', /^row(-full)?--home/],
    ['compare-browse', '浏览页：按年份分组的卷行（悬停、展开、题组行）', /^row(-full)?--browse/],
    ['compare-other', '加入草稿卷、个人空间文件行、草稿卷页', /^row(-full)?--(add|my-space|draft)/],
    ['compare-toast', '草稿卷「题组已移出 · 撤销」底部提示', /^toast--/],
  ]
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  for (const [file, title, re] of SHEETS) {
    const names = Object.keys(changed).filter((n) => re.test(n))
    if (!names.length) continue
    names.sort((a, b) => (a.includes('-390') - b.includes('-390')) || (a.includes('page') - b.includes('page')) || a.localeCompare(b))
    const cells = names.map((n) => {
      const r = changed[n]
      const [BEFORE, AFTER, f] = dirsOf[n]
      const verdict = r.same ? '逐像素一样' : r.diff !== undefined ? `不一样：${r.diff} 像素，范围 ${JSON.stringify(r.box)}` : `尺寸不同 ${r.size.join(' → ')}`
      const mask = masks[n] ? `<figure><figcaption>差异（红）</figcaption><img src="${masks[n]}"></figure>` : '<figure><figcaption>差异</figcaption><p>尺寸不同，没法逐像素叠</p></figure>'
      return `<div class="pair ${r.same ? 'same' : 'diff'}"><h2>${n.replace('.png', '')} <span>${verdict}</span></h2><figure><figcaption>之前</figcaption><img src="${pathToFileURL(path.join(BEFORE, f)).href}"></figure><figure><figcaption>之后</figcaption><img src="${pathToFileURL(path.join(AFTER, f)).href}"></figure>${mask}</div>`
    })
    // 对照页是给人看的拼版，颜色写死只在这个脚本里，不进产品代码。
    const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#F3F6F8;font:14px/1.5 Inter,"PingFang SC","Noto Sans CJK SC",sans-serif;color:#1B2B33;width:1552px}
h1{font-size:18px;margin:0 0 16px}.grid{display:grid;grid-template-columns:1fr;gap:16px}
.pair{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;background:#fff;border-radius:12px;padding:12px;align-content:start}
.pair.diff{box-shadow:0 0 0 2px #E8901A}
.pair h2{grid-column:1/-1;font-size:13px;margin:0;font-weight:600}.pair h2 span{font-weight:400;color:#5A6C75}
figure{margin:0}figcaption{font-size:12px;color:#5A6C75;margin-bottom:4px}img{max-width:100%;max-height:700px;display:block;border:1px solid #DCE6EB}
</style><h1>${title}：之前 / 之后 / 差异（橙框 = 有不一样的像素）</h1><div class="grid">${cells.join('')}</div>`
    const htmlFile = path.join(RAW, `row-${file}.html`)
    writeFileSync(htmlFile, html)
    await sheet.goto(pathToFileURL(htmlFile).href); await sheet.waitForLoadState('load')
    await sheet.screenshot({ path: path.join(OUT, `${file}.png`), fullPage: true })
  }
} finally {
  await browser.close()
}
