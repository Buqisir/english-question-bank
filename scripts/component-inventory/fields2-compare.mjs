#!/usr/bin/env node
// 字段构件第二轮（2026-11-15）对照拼图：fields2-shots.mjs 拍的换前（HEAD worktree）和换后两套元素截图，
// 每处一张拼图，一行一个状态，左换前、右换后，1440 和 390 各一组。不做逐像素比较（这一轮外形本来就要变）。
// 写法照 followup-compare.mjs。
//
// 用法：node scripts/component-inventory/fields2-compare.mjs <换前目录> <换后目录>
// 输出：design/components-2026-11-13/migrate-fields2/compare-*.png 和 shots.json（每张图有没有、读屏信息两边对照）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')
const [BEFORE, AFTER] = process.argv.slice(2).map((p) => path.resolve(p))
if (!BEFORE || !AFTER) { console.error('用法：fields2-compare.mjs <换前目录> <换后目录>'); process.exit(2) }
const OUT = path.join(ROOT, 'design/components-2026-11-13/migrate-fields2')
mkdirSync(OUT, { recursive: true })

const dataUrl = (p) => existsSync(p) ? 'data:image/png;base64,' + readFileSync(p).toString('base64') : null
const keysBefore = JSON.parse(readFileSync(path.join(BEFORE, 'keys.json'), 'utf8'))
const keysAfter = JSON.parse(readFileSync(path.join(AFTER, 'keys.json'), 'utf8'))

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
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

await sheet('compare-dictation.png', '一、听写工作区', [
  ['dict-student', '当前学生：静止'], ['dict-student-focus-select', '当前学生：键盘焦点'],
  ['dict-filter', '搜索词组 + 从 / 到：静止'], ['dict-filter-focus-search', '搜索词组：键盘焦点'], ['dict-filter-focus-date', '从（日期）：键盘焦点'],
  ['dict-settings', '合并设置（打印标题 / 听写标题）：静止'], ['dict-settings-focus-print-title', '打印标题：键盘焦点'],
  ['dict-suggest', '待复习「推荐下一轮 … 词」：静止'], ['dict-suggest-focus-count', '推荐下一轮：键盘焦点'],
  ['meaning-start', '认词「抽 … 词」：静止'], ['meaning-start-focus-count', '抽：键盘焦点'],
])
await sheet('compare-vocab-review.png', '二、过生词', [
  ['rev-student', '当前学生：静止'], ['rev-student-focus-select', '当前学生：键盘焦点'],
  ['rev-create', '新建学生「学生姓名」：静止'], ['rev-create-focus-name', '学生姓名：键盘焦点'],
  ['rev-create-error', '学生姓名：出错'], ['rev-create-error-focus', '学生姓名：出错 + 键盘焦点'],
  ['rev-target', '目标生词数：静止'], ['rev-target-focus-count', '目标生词数：键盘焦点'],
  ['rev-direct', '直接生成词表（多行）：静止'], ['rev-direct-focus-textarea', '多行：键盘焦点'],
  ['rev-title', '单词纸名称：静止'], ['rev-title-focus-name', '单词纸名称：键盘焦点'],
  ['rev-accent', '下载读音：静止'], ['rev-accent-focus-select', '下载读音：键盘焦点'],
])
await sheet('compare-paper-admin.png', '三、整卷页 PDF 版本 · 四、Agent 口令', [
  ['paper-pdf', '整卷页顶栏 PDF 版本：静止'], ['paper-pdf-focus-select', 'PDF 版本：键盘焦点'],
  ['admin-token', 'Agent 口令「名称」：静止'], ['admin-token-focus-name', '名称：键盘焦点'],
])
await sheet('compare-entry.png', '五、录题面板', [
  ['entry-source', '来源（下拉 + 4 个输入）：静止'], ['entry-source-focus-select', '来源类型：键盘焦点'], ['entry-source-focus-year', '年份：键盘焦点'],
  ['entry-required', '「地区」清空后按保存（浏览器原生必填提示，截图里看不到气泡）'],
  ['entry-passage', '篇章（含两个多行）：静止'], ['entry-passage-focus-textarea', '摘要（多行）：键盘焦点'],
  ['entry-question', '小题卡片：静止'], ['entry-question-focus-no', '题号：键盘焦点'],
])

// 读屏信息两边对照：每处每个控件的角色、名字、描述、invalid。
const ax = {}
for (const w of ['w1440', 'w390']) {
  for (const [name, r] of Object.entries(keysAfter[w] || {})) {
    if (!r?.controls) continue
    for (const [c, v] of Object.entries(r.controls)) {
      ax[`${w}/${name}/${c}`] = { before: keysBefore[w]?.[name]?.controls?.[c]?.ax ?? null, after: v.ax, styleBefore: keysBefore[w]?.[name]?.controls?.[c]?.style ?? null, styleAfter: v.style, tabBefore: keysBefore[w]?.[name]?.tabOrder ?? null, tabAfter: r.tabOrder ?? null }
    }
  }
}
writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify({ found, missingBefore: keysBefore.missing, missingAfter: keysAfter.missing, extraAfter: { revCreateError: { before: keysBefore.w1440?.revCreateError ?? null, after: keysAfter.w1440?.revCreateError ?? null }, entryRequired: { before: keysBefore.w1440?.entryRequired ?? null, after: keysAfter.w1440?.entryRequired ?? null }, paperProbe: keysAfter.w1440?.paperProbe ?? null }, ax }, null, 1) + '\n')
console.log(JSON.stringify(found))
await browser.close()
