#!/usr/bin/env node
// 构件收尾（2026-11-15）对照：finish-shots.mjs 拍的换前（HEAD worktree）和换后两套图，
// 整页逐像素比（没换的页面应该一样；草稿丸那一块圆角从 999 改 8，算在预期里），改了的地方拼成前后对照图。
//
// 用法：node scripts/component-inventory/finish-compare.mjs <换前目录> <换后目录>
// 输出：design/components-2026-11-13/migrate-finish/ 下的对照拼版 *.png 和 diff.json。
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：finish-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-finish')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const keysBefore = JSON.parse(readFileSync(path.join(BEFORE, 'keys.json'), 'utf8'))
const keysAfter = JSON.parse(readFileSync(path.join(AFTER, 'keys.json'), 'utf8'))
const nativeText = (at) => keysBefore.nativeDialogs.filter((d) => d.at === at).map((d) => `浏览器原生 ${d.type}（截不到图）：${d.message}`)[0] || null

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')

// ── 整页逐像素 ─────────────────────────────────────────
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

// ── 拼版：一行一个状态，左换前、右换后，图按 1/2 缩（states 是 2 倍图） ──────────
async function sheet(file, title, rows) {
  const items = rows.map(([name, label, note]) => ({
    label, note: note || null,
    before: dataUrl(path.join(BEFORE, 'states', `${name}.png`)), after: dataUrl(path.join(AFTER, 'states', `${name}.png`)),
    pageBefore: name.startsWith('pages/') ? dataUrl(path.join(BEFORE, name + '.png')) : null,
    pageAfter: name.startsWith('pages/') ? dataUrl(path.join(AFTER, name + '.png')) : null,
  }))
  const png = await page.evaluate(async ({ title, items }) => {
    const load = (src) => src ? new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src }) : Promise.resolve(null)
    const COL = 640, GAP = 24, PAD = 24, LABEL = 26
    const rows = []
    for (const it of items) {
      const a = await load(it.before || it.pageBefore), b = await load(it.after || it.pageAfter)
      const scale = (img) => img ? Math.min(0.5 * (it.pageBefore ? 2 : 1), COL / img.width) : 0
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
      if (r.it.note && r.a) { x.fillStyle = '#5a6c75'; x.font = '12px sans-serif'; x.fillText(r.it.note.slice(0, 110), PAD, y + 16); y += 22 }
      y += GAP
    }
    return c.toDataURL('image/png')
  }, { title, items })
  writeFileSync(path.join(OUT, file), Buffer.from(png.split(',')[1], 'base64'))
}

const w = (name) => [[`${name}`, '1440'], [`${name}-390`, '390']]
const rowsFor = (name, label, note) => w(name).map(([n, wd]) => [n, `${label} · ${wd}`, note])
await sheet('1-confirm-dialogs.png', '一、三处 window.confirm 换成共用 Dialog', [
  ...rowsFor('group-delete', '详情页「更多操作 → 删除」题组（不可逆 → tone="alert"，标题点名）', nativeText('detail-delete')),
  ...rowsFor('dict-split', '听写「生成扫码听写」超过 60 词拆份（不是删除 → tone="dialog"）', nativeText('dictation')),
  ...rowsFor('dict-print', '听写「打印资料 → 单词卡」超过 120 个原始词（不是删除 → tone="dialog"）', keysBefore.nativeDialogs.filter((d) => d.at === 'dictation')[1]?.message ? `浏览器原生 confirm（截不到图）：${keysBefore.nativeDialogs.filter((d) => d.at === 'dictation')[1].message}` : null),
  ['group-after-delete', '删掉题组以后（1440）：回到找题页'],
])
await sheet('2-handwriting-backdrop.png', '二、练字选词框点遮罩不再关', rowsFor('handwriting-after-backdrop', '在遮罩左上角点一下以后'))
await sheet('3-space-focus-notice.png', '三 / 四、个人空间：删后焦点、提示行换 Notice', [
  ...rowsFor('space-confirm', '删除确认框（原样，Dialog 上一轮已换）'),
  ...rowsFor('space-after-delete', '删掉中间一项以后：成功提示是 Notice，焦点在下一项的「更多」'),
  ...rowsFor('space-error', '读取失败：红字 → Notice（灰字加图标）'),
])
await sheet('4-notices.png', '四、其余提示行换 Notice', [
  ...rowsFor('detail-error', '详情页读不到题组'),
  ...rowsFor('similar-error', '相似篇章出错行（字、重试排成一行）'),
])
await sheet('5-pill-to-button.png', '五、动作键不用胶囊（8px）', [
  ...rowsFor('basket-home', '草稿丸 · 首页'),
  ...rowsFor('basket-detail', '草稿丸 · 详情页'),
  ...rowsFor('basket-paper', '草稿丸 · 整卷页'),
  ...rowsFor('peek-expand', '详情页「展开卷面」'),
  ...rowsFor('peek-expand-hover', '「展开卷面」悬停'),
  ...rowsFor('peek-expand-focus', '「展开卷面」键盘焦点'),
  ...rowsFor('peek-collapse', '「收起卷面」'),
  ...rowsFor('a3-seam', 'A3「建议前置分页」'),
  ...rowsFor('a3-seam-hover', 'A3「建议前置分页」悬停'),
  ...rowsFor('public-replay', '学生扫码听写页「重播本题」'),
  ...rowsFor('public-replay-hover', '「重播本题」悬停'),
])
await sheet('6-a11y.png', '六、无障碍：字色、点击区域、已选筛选悬停', [
  ...rowsFor('save-saving', '草稿卷「保存中」'),
  ...rowsFor('save-error', '草稿卷「保存失败」'),
  ...rowsFor('topbar-title', '顶栏卷名（可改名）：静止'),
  ...rowsFor('topbar-title-focus', '顶栏卷名：键盘焦点（框高 +6px）'),
  ...rowsFor('reorder-undo', '重排建议「撤销」'),
  ...rowsFor('row-expand', '首页搜索结果行首小箭头'),
  ...rowsFor('thinking-toggle', '思考模式开关'),
  ...rowsFor('active-filter', '已选筛选：静止'),
  ...rowsFor('active-filter-hover', '已选筛选：悬停'),
])

// 整页里有差别的，拼一张前后对照（视口图，1:1 缩到 640 宽）
const changedPages = Object.entries(pages).filter(([, r]) => !r.same && !r.missingBefore).map(([n]) => n.replace(/\.png$/, ''))
if (changedPages.length) await sheet('7-pages-changed.png', '整页里和换前不一样的（逐像素）', changedPages.map((n) => [`pages/${n}`, `${n}：差 ${pages[n + '.png'].diff} 像素，范围 ${JSON.stringify(pages[n + '.png'].box)}`]))

writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify({ pages, keysBefore, keysAfter }, null, 1) + '\n')
console.log(JSON.stringify(pages, null, 1))
await browser.close()
