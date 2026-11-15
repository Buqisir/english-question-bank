#!/usr/bin/env node
// 等待第七轮（2026-11-15，壬）对照：waiting7-shots.mjs 拍的换前、换后两套元素截图拼成几张前后对照图（JPEG，控制总大小）；
// 两边 keys.json 里量到的数并排写进 diff.json，另外算几样直接要看的数（summary）：对话框正文每一行、听写工作台各块、
// 题组详情 hero 和卷面在等时 / 数据到了的顶和高，差多少。照 waiting6-compare.mjs 抄，拍不到的格子画「没拍到」，不补拍。
//
// 用法：node scripts/component-inventory/waiting7-compare.mjs <换前目录> <换后目录>
// 输出：design/components-2026-11-13/migrate-waiting-7/compare-*.jpg、diff.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：waiting7-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-waiting-7')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const readKeys = (dir) => { try { return JSON.parse(readFileSync(path.join(dir, 'keys.json'), 'utf8')) } catch { return null } }
const keysBefore = readKeys(BEFORE), keysAfter = readKeys(AFTER)

const SHEETS = [
  {
    file: 'compare-space-dialog.jpg',
    title: '等待第七轮 · 草稿卷「保存 PDF 到个人空间」读文件夹（1440，1 倍图；灰块停在半周期）',
    col: 520,
    crop: { x: 480, y: 250, w: 480, h: 400 },
    rows: [
      ['space-dialog-150ms', '对话框 150ms（门槛内）'],
      ['space-dialog-1200ms', '对话框 1200ms'],
      ['space-dialog-ready', '对话框 文件夹读完'],
    ],
  },
  {
    file: 'compare-workbench.jpg',
    title: '等待第七轮 · 听写工作台打开（1440，1 倍图；灰块停在半周期）',
    col: 560,
    crop: { x: 0, y: 0, w: 1440, h: 620 },
    rows: [
      ['workbench-150ms', '听写工作台 150ms'],
      ['workbench-1200ms', '听写工作台 1200ms'],
      ['workbench-ready', '听写工作台 学生和词组读完'],
    ],
  },
  {
    file: 'compare-detail.jpg',
    title: '等待第七轮 · 题组详情 hero 灰块：摘要一行、不画小签（1440，1 倍图）',
    col: 460,
    rows: [
      ['detail-plain-1200ms', '没摘要 1200ms'],
      ['detail-plain-ready', '没摘要 数据到了'],
      ['detail-summary-1200ms', '有摘要 1200ms'],
      ['detail-summary-ready', '有摘要 数据到了'],
    ],
  },
]

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
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
  const jpg = await page.evaluate(async ({ title, items, COL, CROP }) => {
    const loadRaw = (src) => src ? new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src }) : Promise.resolve(null)
    // crop：整屏大的元素图（对话框、整页）只取要看的那一块，两边同一块
    const load = async (src) => {
      const img = await loadRaw(src)
      if (!img || !CROP) return img
      const w = Math.min(CROP.w, img.width - CROP.x), h = Math.min(CROP.h, img.height - CROP.y)
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, CROP.x, CROP.y, w, h, 0, 0, w, h)
      return cv
    }
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
  }, { title: sheet.title, items, COL: sheet.col, CROP: sheet.crop || null })
  writeFileSync(path.join(OUT, sheet.file), Buffer.from(jpg.split(',')[1], 'base64'))
  written.push(sheet.file)
}

// 直接要看的数
const top = (box) => (Array.isArray(box) && box[0] ? box[0].y : null)
const height = (box) => (Array.isArray(box) && box[0] ? box[0].h : null)
function summarize(keys) {
  const st = keys?.steps ?? {}
  const pick = (name, waitKey, readyKey = waitKey) => {
    const s = st[name]
    if (!s) return '没拍到'
    const w = s.waitBoxes?.[waitKey], r = s.readyBoxes?.[readyKey]
    if (!r) return { waitTop: top(w), waitH: height(w), ready: '没拍到' }
    return { waitTop: top(w), readyTop: top(r), shift: top(w) != null && top(r) != null ? top(r) - top(w) : null, waitH: height(w), readyH: height(r), rowsWait: w?.length ?? 0, rowsReady: r?.length ?? 0 }
  }
  const rows = (name) => {
    const s = st[name]
    if (!s) return '没拍到'
    return { wait: (s.waitBoxes?.rows ?? []).map((b) => ({ y: b.y, h: b.h, text: b.text })), ready: s.readyBoxes ? (s.readyBoxes.rows ?? []).map((b) => ({ y: b.y, h: b.h, text: b.text })) : '没拍到' }
  }
  return {
    spaceDialogRows: rows('space-dialog'),
    spaceDialogSkeletonsAt150: st['space-dialog']?.at150?.skeletonsVisible ?? null,
    workbenchNav: pick('workbench', 'nav'),
    workbenchTab: pick('workbench', 'tabs'),
    workbenchPicker: pick('workbench', 'pickerBody'),
    workbenchTools: pick('workbench', 'tools'),
    workbenchList: pick('workbench', 'list'),
    workbenchFirstRow: pick('workbench', 'rows'),
    detailPlainHero: pick('detail-plain', 'hero'),
    detailPlainPaper: pick('detail-plain', 'paper'),
    detailSummaryHero: pick('detail-summary', 'hero'),
    detailSummaryPaper: pick('detail-summary', 'paper'),
  }
}

const stepsOf = (k) => k?.steps ?? {}
const names = [...new Set([...Object.keys(stepsOf(keysBefore)), ...Object.keys(stepsOf(keysAfter))])]
const sideBySide = Object.fromEntries(names.map((n) => [n, { before: stepsOf(keysBefore)[n] ?? null, after: stepsOf(keysAfter)[n] ?? null }]))
writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify({
  missing: { before: keysBefore?.missing ?? null, after: keysAfter?.missing ?? null },
  pageErrors: { before: keysBefore?.pageErrors ?? null, after: keysAfter?.pageErrors ?? null },
  note: { before: keysBefore?.note ?? null, after: keysAfter?.note ?? null },
  summary: { before: summarize(keysBefore), after: summarize(keysAfter) },
  steps: sideBySide,
}, null, 1) + '\n')
console.log('对照图：', written.join('、'), '缺：', { before: keysBefore?.missing, after: keysAfter?.missing })
await browser.close()
