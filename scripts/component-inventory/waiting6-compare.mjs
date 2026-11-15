#!/usr/bin/env node
// 等待第六轮（2026-11-15，申）对照：waiting6-shots.mjs 拍的换前、换后两套元素截图拼成几张前后对照图（JPEG，控制总大小）；
// 两边 keys.json 里量到的数并排写进 diff.json，另外算几样直接要看的数（summary）：过词进度下面整块灰的 / 真的顶差多少、
// 放行以后跳了几次；各列表灰行和真行的顶、高；启动壳灰块看得见多久。照 waiting5-compare.mjs 抄，拍不到的格子画「没拍到」，不补拍。
//
// 用法：node scripts/component-inventory/waiting6-compare.mjs <换前目录> <换后目录>
// 输出：design/components-2026-11-13/migrate-waiting-6/compare-*.jpg、diff.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：waiting6-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-waiting-6')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const readKeys = (dir) => { try { return JSON.parse(readFileSync(path.join(dir, 'keys.json'), 'utf8')) } catch { return null } }
const keysBefore = readKeys(BEFORE), keysAfter = readKeys(AFTER)

const SHEETS = [
  {
    file: 'compare-review.jpg',
    title: '等待第六轮 · 过词进度：上面一栏也画灰块（1440，1 倍图；灰块停在半周期）',
    col: 560,
    rows: [
      ['review-open-150ms', '过词进度 150ms（门槛内）'],
      ['review-open-1200ms', '过词进度 1200ms'],
      ['review-open-ready', '过词进度 读完'],
    ],
  },
  {
    file: 'compare-lists.jpg',
    title: '等待第六轮 · 一行字的「加载中」换灰块行（1440，1 倍图；灰块停在半周期）',
    col: 430,
    rows: [
      ['myspace-1200ms', '个人空间 1200ms'],
      ['myspace-ready', '个人空间 数据到了'],
      ['tokens-1200ms', 'Agent 口令 1200ms'],
      ['tokens-ready', 'Agent 口令 数据到了'],
      ['lecture-similar-1200ms', '讲评栏配相似 1200ms'],
      ['lecture-similar-ready', '讲评栏配相似 数据到了'],
      ['home-similar-1200ms', '首页相似篇章 1200ms'],
      ['home-similar-ready', '首页相似篇章 数据到了'],
      ['draft-swap-1200ms', '草稿卷换篇抽屉 1200ms'],
      ['draft-swap-ready', '草稿卷换篇抽屉 数据到了'],
    ],
  },
  {
    file: 'compare-extra.jpg',
    title: '等待第六轮 · 补拍：题组详情数据到了、草稿卷打开（计时从等待区挂上算）；扫码听写启动壳交接后',
    col: 460,
    rows: [
      ['detail-open-1200ms', '题组详情 1200ms'],
      ['detail-open-ready', '题组详情 数据到了'],
      ['draft-open-150ms', '草稿卷打开 150ms'],
      ['draft-open-1200ms', '草稿卷打开 1200ms'],
      ['dictation-boot-min-ready-390', '扫码听写 390 宽 启动壳灰块出来就放行、数据马上到，读完'],
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

// 直接要看的数
const top = (box) => (Array.isArray(box) && box[0] ? box[0].y : null)
const height = (box) => (Array.isArray(box) && box[0] ? box[0].h : null)
function summarize(keys) {
  const st = keys?.steps ?? {}
  const pick = (name, waitKey, readyKey = waitKey) => {
    const s = st[name]
    if (!s) return '没拍到'
    const w = s.waitBoxes?.[waitKey], r = s.readyBoxes?.[readyKey]
    return { waitTop: top(w), readyTop: top(r), shift: top(w) != null && top(r) != null ? top(r) - top(w) : null, waitH: height(w), readyH: height(r), rowsWait: w?.length ?? 0, rowsReady: r?.length ?? 0 }
  }
  const review = st['review-open']
  const boot = st['dictation-boot-min-390']
  return {
    reviewSetup: pick('review-open', 'setup'),
    reviewActions: pick('review-open', 'actions'),
    reviewStart: pick('review-open', 'start'),
    reviewTrack: review?.track ?? null,
    myspaceRows: pick('myspace', 'rows'),
    myspaceMonth: pick('myspace', 'month'),
    tokensRows: pick('tokens', 'rows'),
    lectureSimilarRows: pick('lecture-similar', 'rows'),
    homeSimilarRows: pick('home-similar', 'rows'),
    drawerRows: pick('draft-swap', 'rows'),
    detailPaper: pick('detail-open', 'paper'),
    detailTrack: st['detail-open']?.track ?? null,
    draftOpen150: st['draft']?.at150 ? { ms: st['draft'].at150.ms, skeletonsVisible: st['draft'].at150.skeletonsVisible } : '没拍到',
    bootVisibleMs: boot ? boot.visibleMs : '没拍到',
    bootGaps: boot ? boot.gaps : null,
    bootCss: boot ? boot.css : null,
  }
}

const stepsOf = (k) => k?.steps ?? {}
const names = [...new Set([...Object.keys(stepsOf(keysBefore)), ...Object.keys(stepsOf(keysAfter))])]
const sideBySide = Object.fromEntries(names.map((n) => [n, { before: stepsOf(keysBefore)[n] ?? null, after: stepsOf(keysAfter)[n] ?? null }]))
writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify({
  missing: { before: keysBefore?.missing ?? null, after: keysAfter?.missing ?? null },
  pageErrors: { before: keysBefore?.pageErrors ?? null, after: keysAfter?.pageErrors ?? null },
  summary: { before: summarize(keysBefore), after: summarize(keysAfter) },
  steps: sideBySide,
}, null, 1) + '\n')
console.log('对照图：', written.join('、'), '缺：', { before: keysBefore?.missing, after: keysAfter?.missing })
await browser.close()
