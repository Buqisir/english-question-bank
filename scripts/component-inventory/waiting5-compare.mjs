#!/usr/bin/env node
// 等待第五轮（2026-11-15，未）对照：waiting5-shots.mjs 拍的换前、换后两套元素截图拼成几张前后对照图（JPEG，控制总大小）；
// 纸面阴影那几张逐像素比（同尺寸才比，记差了几个像素、最大差多少）；两边 keys.json 里量到的数并排写进 diff.json。
// 照 waiting4-compare.mjs 抄。拍不到的格子画「没拍到」，不补拍。
//
// 用法：node scripts/component-inventory/waiting5-compare.mjs <换前目录> <换后目录>
// 输出：design/components-2026-11-13/migrate-waiting-5/compare-*.jpg、diff.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：waiting5-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-waiting-5')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const readKeys = (dir) => { try { return JSON.parse(readFileSync(path.join(dir, 'keys.json'), 'utf8')) } catch { return null } }
const keysBefore = readKeys(BEFORE), keysAfter = readKeys(AFTER)

const SHEETS = [
  {
    file: 'compare-lines.jpg',
    title: '等待第五轮 · 等很久的那一行：草稿卷重排、过生词下载（1440，1 倍图）',
    col: 560,
    rows: [
      ['draft-reflow-1200ms', '草稿卷重排 1200ms'],
      ['draft-reflow-11s', '草稿卷重排 11 秒'],
      ['review-download-1200ms', '过生词「下载 → 教师答案」1200ms（键上图标自己演）'],
      ['review-download-11s', '过生词下载 11 秒'],
    ],
  },
  {
    file: 'compare-boot.jpg',
    title: '等待第五轮 · 扫码启动壳（页面代码块拦下；1 倍图，灰块停在半周期）',
    col: 460,
    rows: [
      ['dictation-boot-150ms-390', '听写 390 宽 150ms（门槛内）'],
      ['dictation-boot-1200ms-390', '听写 390 宽 1200ms（启动壳）'],
      ['dictation-boot-handover-390', '听写 390 宽 页面代码到了、数据没到（+100ms）'],
      ['dictation-boot-ready-390', '听写 390 宽 数据到了'],
      ['dictation-boot-1200ms', '听写 1440 宽 1200ms（启动壳）'],
      ['dictation-boot-ready', '听写 1440 宽 数据到了'],
      ['listen-boot', '听音词卡的启动壳（标志）'],
    ],
  },
  {
    file: 'compare-pages.jpg',
    title: '等待第五轮 · 三处整页等待和牌桌（1440，1 倍图；灰块停在半周期）',
    col: 520,
    rows: [
      ['notebook-open-1200ms', '生词本一张纸 1200ms'],
      ['notebook-open-ready', '生词本一张纸 数据到了'],
      ['detail-open-1200ms', '题组详情 1200ms'],
      ['detail-open-ready', '题组详情 数据到了'],
      ['review-open-1200ms', '过词进度 1200ms'],
      ['review-open-ready', '过词进度 读完（开始页）'],
      ['practice-open-1200ms', '单词复习 1200ms'],
      ['practice-open-ready', '单词复习 数据到了'],
      ['draft-open-1200ms', '草稿卷打开 1200ms（这次拦 /:id）'],
    ],
  },
]
const SHADOWS = ['shadow-paper-browse', 'shadow-notebook', 'shadow-detail']

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')

const written = []
for (const sheet of SHEETS) {
  const items = sheet.rows.map(([name, label]) => ({
    name,
    label,
    before: dataUrl(path.join(BEFORE, 'states', `${name}.png`)),
    after: dataUrl(path.join(AFTER, 'states', `${name}.png`)),
  }))
  const jpg = await page.evaluate(async ({ title, items, COL }) => {
    const load = (src) => src ? new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src }) : Promise.resolve(null)
    const GAP = 24, PAD = 20, LABEL = 22, MAXH = 560
    const rows = []
    for (const it of items) {
      const a = await load(it.before), b = await load(it.after)
      const fit = (img) => img ? Math.min(1, COL / img.width) : 0
      const hOf = (img) => img ? Math.min(MAXH, img.height * fit(img)) : 40
      rows.push({ it, a, b, sa: fit(a), sb: fit(b), h: Math.max(hOf(a), hOf(b)) })
    }
    const W = PAD * 2 + COL * 2 + GAP, H = PAD + 40 + rows.reduce((s, r) => s + LABEL + r.h + GAP, 0)
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const x = c.getContext('2d')
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H)
    x.fillStyle = '#1b2b33'; x.font = '600 16px sans-serif'; x.fillText(title, PAD, PAD + 16)
    x.font = '12px sans-serif'; x.fillStyle = '#5a6c75'; x.fillText('换前（HEAD）', PAD, PAD + 34); x.fillText('换后', PAD + COL + GAP, PAD + 34)
    let y = PAD + 40 + 6
    const placeholder = (px, py) => { x.fillStyle = '#f1f5f7'; x.fillRect(px, py, COL, 40); x.fillStyle = '#5a6c75'; x.font = '12px sans-serif'; x.fillText('（没拍到）', px + 8, py + 24) }
    const draw = (img, s, px, py) => {
      const w = img.width * s, h = img.height * s
      x.save(); x.beginPath(); x.rect(px, py, COL, MAXH); x.clip()
      x.drawImage(img, px, py, w, h)
      x.restore()
      x.strokeStyle = '#d5dde1'; x.lineWidth = 1; x.strokeRect(px + 0.5, py + 0.5, Math.min(COL, w) - 1, Math.min(MAXH, h) - 1)
    }
    for (const r of rows) {
      x.fillStyle = '#1b2b33'; x.font = '600 12px sans-serif'; x.fillText(r.it.label, PAD, y + 15)
      y += LABEL
      if (r.a) draw(r.a, r.sa, PAD, y); else placeholder(PAD, y)
      if (r.b) draw(r.b, r.sb, PAD + COL + GAP, y); else placeholder(PAD + COL + GAP, y)
      y += r.h + GAP
    }
    return c.toDataURL('image/jpeg', 0.74)
  }, { title: sheet.title, items, COL: sheet.col })
  writeFileSync(path.join(OUT, sheet.file), Buffer.from(jpg.split(',')[1], 'base64'))
  written.push(sheet.file)
}

// 纸面阴影逐像素比：同尺寸才比
const shadow = {}
for (const name of SHADOWS) {
  const a = dataUrl(path.join(BEFORE, 'states', `${name}.png`)), b = dataUrl(path.join(AFTER, 'states', `${name}.png`))
  if (!a || !b) { shadow[name] = '没拍到'; continue }
  shadow[name] = await page.evaluate(async ({ a, b }) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src })
    const [ia, ib] = [await load(a), await load(b)]
    if (ia.width !== ib.width || ia.height !== ib.height) return { sameSize: false, before: [ia.width, ia.height], after: [ib.width, ib.height] }
    const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data }
    const da = px(ia), db = px(ib)
    let diff = 0, max = 0
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]))
      if (d) { diff += 1; max = Math.max(max, d) }
    }
    return { sameSize: true, size: [ia.width, ia.height], pixels: ia.width * ia.height, differentPixels: diff, maxChannelDiff: max }
  }, { a, b })
}

const stepsOf = (k) => k?.steps ?? {}
const names = [...new Set([...Object.keys(stepsOf(keysBefore)), ...Object.keys(stepsOf(keysAfter))])]
const sideBySide = Object.fromEntries(names.map((n) => [n, { before: stepsOf(keysBefore)[n] ?? null, after: stepsOf(keysAfter)[n] ?? null }]))
writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify({
  missing: { before: keysBefore?.missing ?? null, after: keysAfter?.missing ?? null },
  pageErrors: { before: keysBefore?.pageErrors ?? null, after: keysAfter?.pageErrors ?? null },
  shadowPixelDiff: shadow,
  steps: sideBySide,
}, null, 1) + '\n')
console.log('对照图：', written.join('、'), '阴影：', JSON.stringify(shadow), '缺：', { before: keysBefore?.missing, after: keysAfter?.missing })
await browser.close()
