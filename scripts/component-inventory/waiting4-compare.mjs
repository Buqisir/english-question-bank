#!/usr/bin/env node
// 等待第四轮（2026-11-15，午）对照：waiting4-shots.mjs 拍的换前、换后两套元素截图拼成几张前后对照图（JPEG，控制总大小）；
// 两边 keys.json 里量到的数（键宽、灰块和真内容的位置、淡入第 100ms 的透明度）并排写进 diff.json。
// 照 waiting3-compare.mjs 抄。拍不到的格子画「没拍到」，不补拍。
//
// 用法：node scripts/component-inventory/waiting4-compare.mjs <换前目录> <换后目录>
// 输出：design/components-2026-11-13/migrate-waiting-4/compare-*.jpg、diff.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：waiting4-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-waiting-4')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const readKeys = (dir) => { try { return JSON.parse(readFileSync(path.join(dir, 'keys.json'), 'utf8')) } catch { return null } }
const keysBefore = readKeys(BEFORE), keysAfter = readKeys(AFTER)

const SHEETS = [
  {
    file: 'compare-keys.jpg',
    title: '等待第四轮 · 键和慢提示（2 倍图）',
    col: 360,
    rows: [
      ['paper-copy-notready', '整卷页「复制试卷信息」：线程信息没回来（disabled）'],
      ['paper-copy-idle', '「复制试卷信息」静止'],
      ['paper-copy-busy', '「复制试卷信息」正在复制（1200ms，剪贴板拦住）'],
      ['home-search-11s', '首页 AI 找题等 11 秒'],
      ['translate-11s', '划词翻译等 11 秒'],
      ['analyze-11s', '句子分析等 11 秒'],
    ],
  },
  {
    file: 'compare-pages-1.jpg',
    title: '等待第四轮 · 整页灰块：整卷页、单词复习（1440，1 倍图；灰块停在半周期）',
    col: 520,
    rows: [
      ['paper-open-150ms', '整卷页 150ms（登录页面要先起，实际约 4 秒，见 README）'],
      ['paper-open-1200ms', '整卷页 1200ms'],
      ['paper-open-ready', '整卷页 数据到了（块淡入停在第 100ms）'],
      ['practice-open-150ms', '单词复习 150ms'],
      ['practice-open-1200ms', '单词复习 1200ms'],
      ['practice-open-ready', '单词复习 数据到了'],
    ],
  },
  {
    file: 'compare-pages-2.jpg',
    title: '等待第四轮 · 整页灰块：草稿卷、听写（1 倍图）',
    col: 520,
    rows: [
      ['draft-open-150ms', '草稿卷 150ms'],
      ['draft-open-1200ms', '草稿卷 1200ms'],
      ['draft-open-ready', '草稿卷 读完（换后：目录是真的，纸上灰块等分页）'],
      ['dictation-open-150ms-390', '听写 390 宽 150ms'],
      ['dictation-open-1200ms-390', '听写 390 宽 1200ms'],
      ['dictation-open-ready-390', '听写 390 宽 数据到了'],
      ['dictation-open-1200ms', '听写 1440 宽 1200ms'],
      ['dictation-open-ready', '听写 1440 宽 数据到了'],
    ],
  },
  {
    file: 'compare-rows.jpg',
    title: '等待第四轮 · 列表一行行淡入（停在第 100ms；1 倍图，相似篇章 2 倍图）',
    col: 520,
    rows: [
      ['similar-passages-rows', '首页「相似篇章」候选'],
      ['myspace-ready', '个人空间文件行'],
      ['myspace-ready-reduced', '个人空间文件行（减少动态效果：不演）'],
      ['notebook-ready', '生词本收藏的卷'],
      ['tokens-ready', '管理页 Agent 口令'],
      ['browse-ready', '首页浏览态冷启动（题库连上后）'],
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
    // 宽的缩到一栏宽；高的最多 520（整页图下面截掉，上面才是要比的地方）。左换前、右换后。
    const GAP = 24, PAD = 20, LABEL = 22, MAXH = 520
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
    return c.toDataURL('image/jpeg', 0.78)
  }, { title: sheet.title, items, COL: sheet.col })
  const file = path.join(OUT, sheet.file)
  writeFileSync(file, Buffer.from(jpg.split(',')[1], 'base64'))
  written.push(sheet.file)
}

// 两边量到的数：每一步的 rec（去掉截图路径），并排放。
const stepsOf = (k) => k?.steps ?? {}
const names = [...new Set([...Object.keys(stepsOf(keysBefore)), ...Object.keys(stepsOf(keysAfter))])]
const sideBySide = Object.fromEntries(names.map((n) => [n, { before: stepsOf(keysBefore)[n] ?? null, after: stepsOf(keysAfter)[n] ?? null }]))
writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify({
  missing: { before: keysBefore?.missing ?? null, after: keysAfter?.missing ?? null },
  pageErrors: { before: keysBefore?.pageErrors ?? null, after: keysAfter?.pageErrors ?? null },
  steps: sideBySide,
}, null, 1) + '\n')
console.log('对照图：', written.join('、'), '缺：', { before: keysBefore?.missing, after: keysAfter?.missing })
await browser.close()
