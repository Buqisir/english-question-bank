#!/usr/bin/env node
// 等待第三轮（2026-11-15，巳）对照：waiting3-shots.mjs 拍的换前、换后两套元素截图拼成一张前后对照图；
// 两边量到的数并排写进 diff.json；登录键静止、悬停两张同尺寸的图逐像素比一次（数差了多少个像素、差在哪一块）。
// 照 waiting2-compare.mjs 抄。拍不到的格子画「没拍到」，不补拍。
//
// 用法：node scripts/component-inventory/waiting3-compare.mjs <换前目录> <换后目录>
// 输出：design/components-2026-11-13/migrate-waiting-3/compare.png、diff.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：waiting3-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-waiting-3')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const readKeys = (dir) => { try { return JSON.parse(readFileSync(path.join(dir, 'keys.json'), 'utf8')) } catch { return null } }
const keysBefore = readKeys(BEFORE), keysAfter = readKeys(AFTER)

const TITLE = '等待第三轮：登录键换胶囊大号 Button、「加入生词本」跟所以点'
const ROWS = [
  ['login-idle', '登录键（静止）'],
  ['login-hover', '登录键（悬停）'],
  ['login-busy', '登录键在登录（1200ms，登录请求拦住，最后 abort）'],
  ['notebook-idle', '词典卡「加入生词本」（静止）'],
  ['notebook-checking', '「加入生词本」正在检查（1200ms）'],
  ['notebook-saving', '「加入生词本」正在加入（1200ms，加入请求拦住，最后 abort）'],
  ['browse-connecting', '首页浏览态 ?view=browse 在连题库（dataConnecting 灰块，这轮没改）'],
]
const PIXEL_DIFF = ['login-idle', 'login-hover']

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')

const items = ROWS.map(([name, label]) => ({
  name,
  label,
  before: dataUrl(path.join(BEFORE, 'states', `${name}.png`)),
  after: dataUrl(path.join(AFTER, 'states', `${name}.png`)),
}))
const { png, pixel } = await page.evaluate(async ({ title, items, pixelNames }) => {
  const load = (src) => src ? new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src }) : Promise.resolve(null)
  const pixelOf = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data }
  // 截图是 2 倍图。宽的缩到一栏宽。左换前、右换后。
  const COL = 480, GAP = 28, PAD = 24, LABEL = 24
  const rows = []
  const pixel = {}
  for (const it of items) {
    const a = await load(it.before), b = await load(it.after)
    if (pixelNames.includes(it.name) && a && b) {
      if (a.width !== b.width || a.height !== b.height) pixel[it.name] = { sameSize: false, before: [a.width, a.height], after: [b.width, b.height] }
      else {
        const da = pixelOf(a), db = pixelOf(b)
        let n = 0, maxDelta = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
        for (let i = 0; i < da.length; i += 4) {
          const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]))
          if (d > maxDelta) maxDelta = d
          if (d > 8) { n += 1; const p = i / 4, px = p % a.width, py = Math.floor(p / a.width); x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py) }
        }
        // 坐标是 2 倍图上的像素；除以 2 是 CSS 像素
        pixel[it.name] = { sameSize: true, size2x: [a.width, a.height], pixelsOver8: n, maxChannelDelta: maxDelta, box2x: n ? [x0, y0, x1, y1] : null }
      }
    }
    const fit = (img) => img ? Math.min(1, COL / img.width) : 0
    rows.push({ it, a, b, sa: fit(a), sb: fit(b), h: Math.max(a ? a.height * fit(a) : 40, b ? b.height * fit(b) : 40) })
  }
  const W = PAD * 2 + COL * 2 + GAP, H = PAD + 44 + rows.reduce((s, r) => s + LABEL + r.h + GAP, 0)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d')
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H)
  x.fillStyle = '#1b2b33'; x.font = '600 18px sans-serif'; x.fillText(title, PAD, PAD + 18)
  x.font = '13px sans-serif'; x.fillStyle = '#5a6c75'; x.fillText('换前（HEAD）', PAD, PAD + 40); x.fillText('换后', PAD + COL + GAP, PAD + 40)
  let y = PAD + 44 + 8
  const placeholder = (px, py) => { x.fillStyle = '#f1f5f7'; x.fillRect(px, py, COL, 40); x.fillStyle = '#5a6c75'; x.font = '12px sans-serif'; x.fillText('（没拍到）', px + 8, py + 24) }
  for (const r of rows) {
    x.fillStyle = '#1b2b33'; x.font = '600 13px sans-serif'; x.fillText(r.it.label, PAD, y + 16)
    y += LABEL
    if (r.a) x.drawImage(r.a, PAD, y, r.a.width * r.sa, r.a.height * r.sa); else placeholder(PAD, y)
    if (r.b) x.drawImage(r.b, PAD + COL + GAP, y, r.b.width * r.sb, r.b.height * r.sb); else placeholder(PAD + COL + GAP, y)
    y += r.h + GAP
  }
  return { png: c.toDataURL('image/png'), pixel }
}, { title: TITLE + '（1440，元素截图，2 倍；动画停在中间一帧）', items, pixelNames: PIXEL_DIFF })
writeFileSync(path.join(OUT, 'compare.png'), Buffer.from(png.split(',')[1], 'base64'))

const pick = (k) => k ? { runs: k.runs, steps: k.steps, missing: k.missing, missingFirstRun: k.missingFirstRun, pageErrors: k.pageErrors } : null
writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify({ pixelDiff: pixel, before: pick(keysBefore), after: pick(keysAfter) }, null, 1) + '\n')
console.log('对照图写好；逐像素：', JSON.stringify(pixel), '缺：', { before: keysBefore?.missing, after: keysAfter?.missing })
await browser.close()
