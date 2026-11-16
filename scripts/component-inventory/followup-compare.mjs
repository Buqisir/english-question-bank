#!/usr/bin/env node
// 构件收尾后续四件事（2026-11-15）对照：followup-shots.mjs 拍的换前（HEAD worktree）和换后两套图，
// 首页视口整页逐像素比（思考模式开关那一行布局不许动），改了的地方拼成前后对照图。写法照 finish-compare.mjs。
//
// 用法：node scripts/component-inventory/followup-compare.mjs <换前目录> <换后目录>
// 输出：design/components-2026-11-13/migrate-followup/ 下的对照拼版 *.png 和 diff.json。
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：followup-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-followup')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const keysBefore = JSON.parse(readFileSync(path.join(BEFORE, 'keys.json'), 'utf8'))
const keysAfter = JSON.parse(readFileSync(path.join(AFTER, 'keys.json'), 'utf8'))

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')

async function pixelDiff(a, b) {
  return page.evaluate(async ([da, db]) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
    const [ia, ib] = await Promise.all([load(da), load(db)])
    if (ia.width !== ib.width || ia.height !== ib.height) return { same: false, size: [`${ia.width}x${ia.height}`, `${ib.width}x${ib.height}`] }
    const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data }
    const pa = px(ia), pb = px(ib)
    let diff = 0, box = null
    for (let i = 0; i < pa.length; i += 4) {
      if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2] || pa[i + 3] !== pb[i + 3]) {
        diff += 1
        const p = i / 4, x = p % ia.width, y = Math.floor(p / ia.width)
        box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y]
      }
    }
    return { same: diff === 0, size: `${ia.width}x${ia.height}`, diff, box }
  }, [dataUrl(a), dataUrl(b)])
}

const pages = {}
for (const n of readdirSync(path.join(AFTER, 'pages')).filter((f) => f.endsWith('.png')).sort()) {
  const a = path.join(BEFORE, 'pages', n), b = path.join(AFTER, 'pages', n)
  pages[n] = existsSync(a) ? await pixelDiff(a, b) : { missingBefore: true }
}

// 拼版：一行一个状态，左换前、右换后；states 是 2 倍图，按 1/2 缩，最宽 640。
async function sheet(file, title, rows) {
  const items = rows.map(([name, label, note]) => ({
    label, note: note || null,
    before: dataUrl(path.join(BEFORE, 'states', `${name}.png`)), after: dataUrl(path.join(AFTER, 'states', `${name}.png`)),
  }))
  const png = await page.evaluate(async ({ title, items }) => {
    const load = (src) => src ? new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src }) : Promise.resolve(null)
    const COL = 640, GAP = 24, PAD = 24, LABEL = 26
    const rows = []
    for (const it of items) {
      const a = await load(it.before), b = await load(it.after)
      const scale = (img) => img ? Math.min(0.5, COL / img.width) : 0
      const h = Math.max(a ? a.height * scale(a) : 40, b ? b.height * scale(b) : 40)
      rows.push({ it, a, b, h, sa: scale(a), sb: scale(b) })
    }
    const W = PAD * 2 + COL * 2 + GAP, H = PAD + 40 + rows.reduce((s, r) => s + LABEL + r.h + (r.it.note ? 22 : 0) + GAP, 0)
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const x = c.getContext('2d')
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H)
    x.fillStyle = '#1b2b33'; x.font = '600 18px sans-serif'; x.fillText(title, PAD, PAD + 18)
    x.font = '13px sans-serif'; x.fillStyle = '#5a6c75'; x.fillText('换前（HEAD）', PAD, PAD + 38); x.fillText('换后', PAD + COL + GAP, PAD + 38)
    let y = PAD + 40 + 8
    const placeholder = (text, px, py) => { x.fillStyle = '#f1f5f7'; x.fillRect(px, py, COL, 40); x.fillStyle = '#5a6c75'; x.font = '12px sans-serif'; x.fillText(text.slice(0, 60), px + 8, py + 16); if (text.length > 60) x.fillText(text.slice(60, 120), px + 8, py + 32) }
    for (const r of rows) {
      x.fillStyle = '#1b2b33'; x.font = '600 13px sans-serif'; x.fillText(r.it.label, PAD, y + 16)
      y += LABEL
      if (r.a) { x.drawImage(r.a, PAD, y, r.a.width * r.sa, r.a.height * r.sa); x.strokeStyle = '#dce6eb'; x.strokeRect(PAD + 0.5, y + 0.5, r.a.width * r.sa, r.a.height * r.sa) } else placeholder(r.it.note || '（换前没有这个状态）', PAD, y)
      if (r.b) { x.drawImage(r.b, PAD + COL + GAP, y, r.b.width * r.sb, r.b.height * r.sb); x.strokeStyle = '#dce6eb'; x.strokeRect(PAD + COL + GAP + 0.5, y + 0.5, r.b.width * r.sb, r.b.height * r.sb) } else placeholder('（没拍到）', PAD + COL + GAP, y)
      y += r.h
      if (r.it.note) { x.fillStyle = '#5a6c75'; x.font = '12px sans-serif'; x.fillText(r.it.note.slice(0, 110), PAD, y + 16); y += 22 }
      y += GAP
    }
    return c.toDataURL('image/png')
  }, { title, items })
  writeFileSync(path.join(OUT, file), Buffer.from(png.split(',')[1], 'base64'))
}

const rowsFor = (name, label, note) => [[name, `${label} · 1440`, note], [`${name}-390`, `${label} · 390`, note]]
await sheet('1-suggest-button.png', '一、草稿卷建议键换成 Button tone="suggest"', [
  ...rowsFor('a4-suggest-context', 'A4 题组工具条上方「建议前置分页」（连工具条）'),
  ...rowsFor('a4-suggest', 'A4 静止'),
  ...rowsFor('a4-suggest-hover', 'A4 悬停'),
  ...rowsFor('a4-suggest-focus', 'A4 键盘焦点'),
  ...rowsFor('a3-suggest', 'A3 接缝「跨页断篇（第1/2页）· 建议前置分页」静止'),
  ...rowsFor('a3-suggest-hover', 'A3 悬停'),
  ...rowsFor('a3-suggest-focus', 'A3 键盘焦点'),
])
await sheet('2-remove-focus.png', '二、草稿卷移出题组以后（焦点见 README 第二节的表）', [
  ...rowsFor('remove-middle-after', '移出中间一组、卷面排好以后'),
  ...rowsFor('remove-all-after', '移到一组不剩以后'),
])
await sheet('3-vocab-notices.png', '三、生词各页的提示行换成 Notice', [
  ...rowsFor('dictation-error', '听写工作区顶上：出错'),
  ...rowsFor('dictation-success', '听写工作区顶上：做完了（生成二维码）'),
  ...rowsFor('meaning-error', '看词说义：出错'),
  ...rowsFor('practice-audio', '趣味练习：读音放不出来'),
  ...rowsFor('notebook-list-error', '生词本列表：出错'),
  ...rowsFor('notebook-loading', '生词本打开一张纸：等待'),
  ...rowsFor('notebook-detail-error', '生词本打开一张纸：出错'),
  ...rowsFor('review-loading', '过生词：正在读取'),
  ...rowsFor('review-error', '过生词：学生档案没加载出来（下面那行是服务器原话）'),
])
await sheet('4-thinking-toggle.png', '四、思考模式开关（样子不变，点击区 32 × 24）', [
  ...rowsFor('thinking-toggle', '静止'),
  ...rowsFor('thinking-toggle-focus', '键盘焦点'),
])

writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify({ pages, keysBefore, keysAfter }, null, 1) + '\n')
console.log(JSON.stringify(pages, null, 1))
await browser.close()
