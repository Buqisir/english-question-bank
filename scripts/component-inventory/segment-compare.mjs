#!/usr/bin/env node
// 切换组换 SegmentedField（2026-11-15）对照拼图：segment-shots.mjs 拍的换前（HEAD worktree）和换后两套元素截图，
// 每处一张拼图，一行一个状态，左换前、右换后，1440 和 390 各一组。不做逐像素比较（外形本来就要变）。
// 写法照 fields2-compare.mjs。
//
// 用法：node scripts/component-inventory/segment-compare.mjs <换前目录> <换后目录>
// 输出：design/components-2026-11-13/migrate-segment/compare-*.png 和 shots.json（每张图有没有、读屏 / Tab / 方向键两边对照）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：segment-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-segment')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const keysBefore = JSON.parse(readFileSync(path.join(BEFORE, 'keys.json'), 'utf8'))
const keysAfter = JSON.parse(readFileSync(path.join(AFTER, 'keys.json'), 'utf8'))

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')

const found = {}
// 拼版：一行一个状态，左换前、右换后；截图是 1 倍图，最宽 560，宽了按比例缩。拍不到的格子写「没拍到」。
async function sheet(file, title, rows) {
  const items = []
  for (const [name, label] of rows) {
    for (const [suffix, w] of [['', '1440'], ['-390', '390']]) {
      const a = path.join(BEFORE, 'states', `${name}${suffix}.png`), b = path.join(AFTER, 'states', `${name}${suffix}.png`)
      found[`${name}${suffix}`] = { before: existsSync(a), after: existsSync(b) }
      if (!existsSync(a) && !existsSync(b)) continue
      items.push({ label: `${label} · ${w}`, before: dataUrl(a), after: dataUrl(b) })
    }
  }
  if (!items.length) return
  const png = await page.evaluate(async ({ title, items }) => {
    const load = (src) => src ? new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src }) : Promise.resolve(null)
    const COL = 560, GAP = 24, PAD = 24, LABEL = 24
    const rows = []
    for (const it of items) {
      const a = await load(it.before), b = await load(it.after)
      const scale = (img) => img ? Math.min(1, COL / img.width) : 0
      const h = Math.max(a ? a.height * scale(a) : 32, b ? b.height * scale(b) : 32)
      rows.push({ it, a, b, h, sa: scale(a), sb: scale(b) })
    }
    const W = PAD * 2 + COL * 2 + GAP, H = PAD + 44 + rows.reduce((s, r) => s + LABEL + r.h + GAP, 0)
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const x = c.getContext('2d')
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H)
    x.fillStyle = '#1b2b33'; x.font = '600 17px sans-serif'; x.fillText(title, PAD, PAD + 16)
    x.font = '13px sans-serif'; x.fillStyle = '#5a6c75'; x.fillText('换前（HEAD）', PAD, PAD + 38); x.fillText('换后', PAD + COL + GAP, PAD + 38)
    let y = PAD + 44 + 6
    const placeholder = (px, py) => { x.fillStyle = '#f1f5f7'; x.fillRect(px, py, COL, 32); x.fillStyle = '#5a6c75'; x.font = '12px sans-serif'; x.fillText('没拍到（见 README「没拍到的」）', px + 8, py + 20) }
    for (const r of rows) {
      x.fillStyle = '#1b2b33'; x.font = '600 12px sans-serif'; x.fillText(r.it.label, PAD, y + 14)
      y += LABEL
      const draw = (img, s, px) => { if (img) { x.drawImage(img, px, y, img.width * s, img.height * s); x.strokeStyle = '#dce6eb'; x.strokeRect(px + 0.5, y + 0.5, img.width * s - 1, img.height * s - 1) } else placeholder(px, y) }
      draw(r.a, r.sa, PAD); draw(r.b, r.sb, PAD + COL + GAP)
      y += r.h + GAP
    }
    return c.toDataURL('image/png')
  }, { title, items })
  writeFileSync(path.join(OUT, file), Buffer.from(png.split(',')[1], 'base64'))
}

await sheet('compare-workbench.png', '一、听写工作区（合并设置、已选听写、认词首页、认词结果）', [
  ['combine-accent', '合并设置「口音」：静止'], ['combine-accent-focus', '合并设置「口音」：键盘焦点'],
  ['task-accent', '已选听写「口音」：静止'], ['task-accent-focus', '已选听写「口音」：键盘焦点'],
  ['meaning-order', '认词「顺序」（随机带图标）：静止'], ['meaning-order-focus', '认词「顺序」：键盘焦点'],
  ['meaning-suggest', '直接推荐一轮「[n] 词」：静止'], ['meaning-suggest-focus', '直接推荐一轮「[n] 词」：键盘焦点'],
  ['result-accent', '认词结果「听写发音」：静止'], ['result-accent-focus', '认词结果「听写发音」：键盘焦点'],
])
await sheet('compare-review.png', '二、过生词（过词读音、学生姓名出错）', [
  ['review-accent', '「过词读音」：静止'], ['review-accent-focus', '「过词读音」：键盘焦点'],
  ['create-error', '「学生姓名」出错：静止'], ['create-error-focus', '「学生姓名」出错：键盘焦点'],
])
await sheet('compare-public.png', '三、扫码听音页、扫码听写页', [
  ['listen-accent', '听音页「发音」：静止'], ['listen-accent-focus', '听音页「发音」：键盘焦点'],
  ['listen-repeat', '听音页「每词播放」：静止'], ['listen-repeat-focus', '听音页「每词播放」：键盘焦点'],
  ['dictation-repeat', '听写页「每词播放」：静止（换后一栏是试过又撤回的，现在同换前，见 README）'], ['dictation-repeat-focus', '听写页「每词播放」：键盘焦点（同上，已撤回）'],
])

// 读屏 / Tab / 方向键两边对照。
const ax = {}
for (const w of ['w1440', 'w390']) {
  const names = new Set([...Object.keys(keysBefore[w] || {}), ...Object.keys(keysAfter[w] || {})])
  for (const name of names) ax[`${w}/${name}`] = { before: keysBefore[w]?.[name] ?? null, after: keysAfter[w]?.[name] ?? null }
}
// 「学生姓名」出错的话在表单里有几份（看得见的一行 + 只给读屏的那句，读屏逐行读时每一份都念）。
// 拍图脚本里的 copies 按「已有同名学生档案」数，页面实际显示的是「词汇服务暂时不可用。」，所以那个数是 0、作废，这里按表单文字重数。
const errorCopies = {}
for (const [side, k] of [['before', keysBefore], ['after', keysAfter]]) {
  for (const w of ['w1440', 'w390']) {
    const t = k[w]?.createError?.text
    if (t) errorCopies[`${side}/${w}`] = t.split('词汇服务暂时不可用').length - 1
  }
}
writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify({ found, errorCopies, seedBefore: keysBefore.seed, seedAfter: keysAfter.seed, missingBefore: keysBefore.missing, missingAfter: keysAfter.missing, pageErrorsBefore: keysBefore.pageErrors, pageErrorsAfter: keysAfter.pageErrors, ax }, null, 1) + '\n')
console.log(JSON.stringify(found))
await browser.close()
