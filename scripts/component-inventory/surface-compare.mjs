#!/usr/bin/env node
// 卡片 / 板构件换上前后逐像素对照（构件厂，2026-11-15）。先跑 surface-shots.mjs before、before2（都在改之前的代码上）
// 和 surface-shots.mjs after（改之后）。
//
// 比三组：
// 1. before2 对 before：同一份代码拍两遍，看拍照本身稳不稳；
// 2. after 对 before：每张截图逐像素比 RGBA，不一样的数出像素数和范围；
// 3. 实算样式（surface-shots.mjs 记的每块卡片 / 板的底、边、圆角、影子、内边距、位置）逐项比。
// 拼版：之前 | 之后 | 差异（不一样的像素涂红，一样的变淡），按页面分几张。
//
// 用法：node scripts/component-inventory/surface-compare.mjs
// 输出：design/components-2026-11-13/migrate-surface/ 下的 before/、after/（截图）、compare-*.png、diff.json
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, RAW, requireFromApp } from './lib.mjs'

const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-surface')
const BEFORE = path.join(RAW, 'surface/before')
const BEFORE2 = path.join(RAW, 'surface/before2')
const AFTER = path.join(RAW, 'surface/after')
for (const d of [BEFORE, BEFORE2, AFTER]) if (!existsSync(d)) { console.error('先跑 surface-shots.mjs before / before2 / after，缺', d); process.exit(2) }

const pngs = (dir) => readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
const dataUrl = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64')

const { chromium } = requireFromApp('playwright')
const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
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

try {
  const stable = {}, changed = {}, masks = {}
  for (const n of pngs(BEFORE)) if (existsSync(path.join(BEFORE2, n))) { const { mask, ...r } = await pixelDiff(path.join(BEFORE, n), path.join(BEFORE2, n)); stable[n] = r }
  for (const n of pngs(AFTER)) {
    if (!existsSync(path.join(BEFORE, n))) continue
    const { mask, ...r } = await pixelDiff(path.join(BEFORE, n), path.join(AFTER, n), true)
    changed[n] = r
    if (mask) masks[n] = mask
  }
  const read = (d, f) => JSON.parse(readFileSync(path.join(d, f), 'utf8'))
  const measures = diffMeasures(read(BEFORE, 'measure.json'), read(AFTER, 'measure.json'))
  const measureStable = diffMeasures(read(BEFORE, 'measure.json'), read(BEFORE2, 'measure.json'))

  mkdirSync(OUT, { recursive: true })
  for (const sub of ['before', 'after']) { rmSync(path.join(OUT, sub), { recursive: true, force: true }); mkdirSync(path.join(OUT, sub)) }
  for (const n of pngs(BEFORE)) copyFileSync(path.join(BEFORE, n), path.join(OUT, 'before', n))
  for (const n of pngs(AFTER)) copyFileSync(path.join(AFTER, n), path.join(OUT, 'after', n))
  copyFileSync(path.join(AFTER, 'measure.json'), path.join(OUT, 'after', 'measure.json'))
  copyFileSync(path.join(BEFORE, 'measure.json'), path.join(OUT, 'before', 'measure.json'))

  const result = {
    note: '像素比：same = 每个像素 RGBA 都一样（2 倍图）。measure：每块卡片 / 板的底、边、圆角、影子、内边距、位置逐项比。',
    summary: {
      '拍照稳不稳（before2 对 before）': summarize(stable),
      'after 对 before': summarize(changed),
      '实算样式不同（after 对 before）': measures.length,
      '实算样式不同（before2 对 before）': measureStable.length,
    },
    stable, changed, measureDifferences: measures, measureStable,
    missing: { before: read(BEFORE, 'missing.json'), before2: read(BEFORE2, 'missing.json'), after: read(AFTER, 'missing.json') },
  }
  writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify(result, null, 1) + '\n')
  console.log(JSON.stringify(result.summary, null, 1))

  // 拼版：按页面分组，每格 之前 | 之后 | 差异。
  const SHEETS = [
    ['compare-home', '首页：「接着做」列表板、出结果的卷行列表板（悬停、展开）、「没找到」卡片', /^home-/],
    ['compare-browse', '浏览页：按年份分组的卷行列表板', /^browse-/],
    ['compare-draft', '草稿卷：左栏目录（空、三组、悬停一项）', /^draft-/],
    ['compare-my-space', '个人空间：文件列表板', /^my-space-/],
    ['compare-admin', '管理页：Agent 口令「只显示这一次」', /^admin-/],
  ]
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  for (const [file, title, re] of SHEETS) {
    const names = Object.keys(changed).filter((n) => re.test(n))
    // 先放 1440 再放 390；整页图放后面
    names.sort((a, b) => (a.includes('-390') - b.includes('-390')) || (a.includes('page') - b.includes('page')) || a.localeCompare(b))
    const cells = names.map((n) => {
      const r = changed[n]
      const verdict = r.same ? '逐像素一样' : r.diff !== undefined ? `不一样：${r.diff} 像素，范围 ${JSON.stringify(r.box)}` : `尺寸不同 ${r.size.join(' → ')}`
      const mask = masks[n] ? `<figure><figcaption>差异（红）</figcaption><img src="${masks[n]}"></figure>` : '<figure><figcaption>差异</figcaption><p>尺寸不同，没法逐像素叠</p></figure>'
      return `<div class="pair ${r.same ? 'same' : 'diff'}"><h2>${n.replace('.png', '')} <span>${verdict}</span></h2><figure><figcaption>之前</figcaption><img src="${pathToFileURL(path.join(BEFORE, n)).href}"></figure><figure><figcaption>之后</figcaption><img src="${pathToFileURL(path.join(AFTER, n)).href}"></figure>${mask}</div>`
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
    const htmlFile = path.join(RAW, `surface-${file}.html`)
    writeFileSync(htmlFile, html)
    await sheet.goto(pathToFileURL(htmlFile).href); await sheet.waitForLoadState('load')
    await sheet.screenshot({ path: path.join(OUT, `${file}.png`), fullPage: true })
  }
} finally {
  await browser.close()
}
