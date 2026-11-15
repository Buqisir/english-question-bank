#!/usr/bin/env node
// 草稿卷左栏目录换成 Row（2026-11-15）对照：rail-shots.mjs 拍的换前（HEAD worktree）和换后两套左栏元素截图，
// 拼成一张前后对照图，再把两边量到的行高、读屏属性、焦点结果并排写进 diff.json。不做整页逐像素比较。
//
// 用法：node scripts/component-inventory/rail-compare.mjs <换前目录> <换后目录> [换后补测焦点的目录]
// 第三个目录可选：删后焦点改过一次代码以后，用 RAIL_ONLY 只补跑焦点那几步的结果，并进 diff.json 的 afterFocus。
// 输出：design/components-2026-11-13/migrate-rail/compare-rail.png、diff.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER, AFTER_FOCUS] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：rail-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-rail')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const readKeys = (dir) => { try { return JSON.parse(readFileSync(path.join(dir, 'keys.json'), 'utf8')) } catch { return null } }
const keysBefore = readKeys(BEFORE), keysAfter = readKeys(AFTER)

const ROWS = [
  ['rest', '静止'],
  ['hover', '悬停第二项'],
  ['focus', '键盘焦点在第二项'],
  ['current', '当前项（点了第三项，白底板挪过去）'],
  ['rest-missing', '插进两条缺题项以后（排在最后）'],
  ['missing-hover', '缺题项：鼠标停着（换后不可点，没有悬停底）'],
  ['missing-focus', '缺题项：键盘焦点在「移除」'],
  ['after-remove-1', '删掉第一个缺题项以后（删除接口用测试替身，见 README）'],
  ['after-undo-1', '撤销以后（撤销接口用测试替身）'],
  ['after-remove-all-missing', '真删掉最后一个缺题项、卷面重新排好以后'],
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
  // 左栏截图是 2 倍图（约 328 宽），原样放，看得清 1px 的边和焦点环。两张一行，左换前、右换后。
  const COL = 360, GAP = 32, PAD = 24, LABEL = 26
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
}, { title: '草稿卷左栏目录换成共用行 Row（1440，左栏元素截图，2 倍）', items })
writeFileSync(path.join(OUT, 'compare-rail.png'), Buffer.from(png.split(',')[1], 'base64'))

const pick = (k) => k?.w1440 ? {
  railBox: k.w1440.railBox, rows: k.w1440.rows, aria: k.w1440.aria, railBoxWithGhosts: k.w1440.railBoxWithGhosts, rowsWithGhosts: k.w1440.rowsWithGhosts, ariaWithGhosts: k.w1440.ariaWithGhosts, paperError: k.w1440.paperError, tabOrder: k.w1440.tabOrder, focus: k.w1440.focus,
  enterJump: k.w1440.enterJump, hoverColor: k.w1440.hoverColor, missingFocus: k.w1440.missingFocus,
  removeGhost1: k.w1440.removeGhost1, removeGhost1Settled: k.w1440.removeGhost1Settled, rowsAfterRemove1: k.w1440.rowsAfterRemove1,
  undoTabs: k.w1440.undoTabs, undoGhost1: k.w1440.undoGhost1, undoGhost1Settled: k.w1440.undoGhost1Settled, undoGhost1Error: k.w1440.undoGhost1Error,
  rowsAfterUndo: k.w1440.rowsAfterUndo, removeLast: k.w1440.removeLast, undoLastTabs: k.w1440.undoLastTabs, undoLast: k.w1440.undoLast, undoLastSettled: k.w1440.undoLastSettled, undoLastError: k.w1440.undoLastError, undoLastRows: k.w1440.undoLastRows, removeGhost1Toast: k.w1440.removeGhost1Toast, currentRows: k.w1440.currentRows, drag: k.w1440.drag,
  w390: k.w390, missing: k.missing, pageErrors: k.pageErrors,
} : null
const keysAfterFocus = AFTER_FOCUS ? readKeys(AFTER_FOCUS) : null
writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify({ before: pick(keysBefore), after: pick(keysAfter), afterFocus: pick(keysAfterFocus) }, null, 1) + '\n')
console.log('compare-rail.png 写好；缺：', { before: keysBefore?.missing, after: keysAfter?.missing })
await browser.close()
