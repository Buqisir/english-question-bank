#!/usr/bin/env node
// 等待第二轮（2026-11-15，卯）对照：waiting2-shots.mjs 拍的换前、换后两套元素截图拼成前后对照图，
// 两边量到的数（键宽、字和点的间距、灰块在不在、淡入的时长和间隔）并排写进 diff.json。不做整页逐像素比较。
// 图分两张（每张一半的格子），免得一张太大。
//
// 用法：node scripts/component-inventory/waiting2-compare.mjs <换前目录> <换后目录>
// 输出：design/components-2026-11-13/migrate-waiting-2/compare-1.png、compare-2.png、diff.json
// 拍不到的格子画「没拍到」，不补拍。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：waiting2-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-waiting-2')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const readKeys = (dir) => { try { return JSON.parse(readFileSync(path.join(dir, 'keys.json'), 'utf8')) } catch { return null } }
const keysBefore = readKeys(BEFORE), keysAfter = readKeys(AFTER)

const SHEETS = [
  ['compare-1.png', '等待第二轮 · 一：首页门槛和淡入、小字旁的所以点', [
    ['home-search-150ms', '首页 AI 找题：按下后 150ms（门槛内）'],
    ['home-search-1200ms', '首页 AI 找题：1200ms'],
    ['home-rows', '首页找题结果：真行依次淡入，停在第 100ms'],
    ['translate-status', '选词翻译：正在翻译（12px）'],
    ['analyze-head', '句子分析：分析中（12px）'],
    ['draft-saving', '草稿卷顶栏：保存中（12px）'],
  ]],
  ['compare-2.png', '等待第二轮 · 二：灰块、键、超过 10 秒', [
    ['analyze-card', '句子分析卡：译文位置的灰块'],
    ['dictionary-card', '词典卡：在查'],
    ['detail-paper', '详情页：卷面在等'],
    ['paper-pdf-idle', '整卷页「下载 PDF」（静止）'],
    ['paper-pdf-busy', '整卷页「下载 PDF」在生成'],
    ['admin-token-busy', '管理页「新建口令」在建'],
    ['draft-pdf-1s', '草稿卷：正在生成 PDF（1 秒）'],
    ['draft-pdf-11s', '草稿卷：正在生成 PDF（11 秒）'],
    ['row-add-busy', '首页紧凑加入键在加入（最后一步，abort）'],
  ]],
]

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')
for (const [file, title, rows] of SHEETS) {
const items = rows.map(([name, label]) => ({
  label,
  before: dataUrl(path.join(BEFORE, 'states', `${name}.png`)),
  after: dataUrl(path.join(AFTER, 'states', `${name}.png`)),
}))
const png = await page.evaluate(async ({ title, items }) => {
  const load = (src) => src ? new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src }) : Promise.resolve(null)
  // 截图是 2 倍图。小的（键、一行字）原样放；宽的（整条提示行、结果区）缩到一栏宽。左换前、右换后。
  const COL = 480, GAP = 28, PAD = 24, LABEL = 24
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
}, { title: title + '（1440，元素截图，2 倍；动画停在中间一帧）', items })
writeFileSync(path.join(OUT, file), Buffer.from(png.split(',')[1], 'base64'))
}

const pick = (k) => k ? { runs: k.runs, steps: k.steps, missing: k.missing, pageErrors: k.pageErrors } : null
writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify({ before: pick(keysBefore), after: pick(keysAfter) }, null, 1) + '\n')
console.log('对照图写好；缺：', { before: keysBefore?.missing, after: keysAfter?.missing })
await browser.close()
