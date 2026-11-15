#!/usr/bin/env node
// 等待换成所以点 / 灰块（2026-11-15）对照：waiting-shots.mjs 拍的换前、换后两套元素截图，
// 拼成一张前后对照图，再把两边量到的键宽、读屏属性、所以点是哪一种并排写进 diff.json。不做整页逐像素比较。
//
// 用法：node scripts/component-inventory/waiting-compare.mjs <换前目录> <换后目录>
// 输出：design/components-2026-11-13/migrate-waiting/compare-waiting.png、diff.json
// 拍不到的格子画「没拍到」，不补拍。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：waiting-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-waiting')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const readKeys = (dir) => { try { return JSON.parse(readFileSync(path.join(dir, 'keys.json'), 'utf8')) } catch { return null } }
const keysBefore = readKeys(BEFORE), keysAfter = readKeys(AFTER)

const ROWS = [
  ['home-status', '首页：连上题库之前的提示行'],
  ['home-search-notice', '首页：找题在等（提示行）'],
  ['home-search-feed', '首页：找题在等（结果区占位）'],
  ['row-add-idle', '首页结果行：紧凑加入键（静止）'],
  ['row-add-busy', '首页结果行：紧凑加入键在加入'],
  ['detail-add-idle', '详情页：加入草稿卷（静止）'],
  ['detail-add-busy', '详情页：加入草稿卷在加入'],
  ['detail-add-busy-reduced', '详情页：加入中，系统减少动态效果'],
  ['delete-idle', '删除确认框（静止）'],
  ['delete-busy', '删除确认框：在删'],
  ['delete-busy-reduced', '删除确认框：在删，系统减少动态效果'],
  ['translate-status', '整卷页选词：翻译在等'],
  ['analyze-head', '整卷页选词：句子分析在等'],
  ['draft-pagination', '草稿卷：正在生成分页预览'],
  ['draft-saving', '草稿卷顶栏：保存中'],
]

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')
const items = ROWS.map(([name, label]) => ({
  label,
  before: dataUrl(path.join(BEFORE, 'states', `${name}.png`)),
  after: dataUrl(path.join(AFTER, 'states', `${name}.png`)),
}))
const png = await page.evaluate(async ({ title, items }) => {
  const load = (src) => src ? new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src }) : Promise.resolve(null)
  // 截图是 2 倍图。小的（键、一行字）原样放；宽的（整条提示行、结果区）缩到一栏宽。左换前、右换后。
  const COL = 520, GAP = 28, PAD = 24, LABEL = 24
  const rows = []
  for (const it of items) {
    const a = await load(it.before), b = await load(it.after)
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
  return c.toDataURL('image/png')
}, { title: '等待换成所以点 / 灰块（1440，元素截图，2 倍；动画停在中间一帧）', items })
writeFileSync(path.join(OUT, 'compare-waiting.png'), Buffer.from(png.split(',')[1], 'base64'))

const pick = (k) => k ? { runs: k.runs, steps: k.steps, missing: k.missing, pageErrors: k.pageErrors } : null
writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify({ before: pick(keysBefore), after: pick(keysAfter) }, null, 1) + '\n')
console.log('compare-waiting.png 写好；缺：', { before: keysBefore?.missing, after: keysAfter?.missing })
await browser.close()
