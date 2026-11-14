#!/usr/bin/env node
// 空状态换构件的对照图和样张：读 empty-shots.mjs 拍好的 before/after，拼成
//   compare-<处>.png：每处 before / after 并排，1440 一行、390 一行；
//   compare-not-found-width.png：「没找到」獭獭 110 宽和 128 宽并排（1440、390 各一行）；
//   sheet-empty-new.png：换完以后所有变体，各在 1440 和 390 两种宽度下。
// 不起测试站，只拼图。用法：node scripts/component-inventory/empty-sheet.mjs
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { ROOT } from './lib.mjs'

const DIR = path.join(ROOT, 'design/components-2026-11-13/migrate-empty')
const SHEET = path.join(ROOT, 'design/components-2026-11-13/sheet-empty-new.png')
const { chromium } = createRequire(path.join(ROOT, 'app/package.json'))('playwright')

const SCENES = [
  ['home-noresult', '找题「没找到」', 'not-found 摊手獭獭 · 卡片 · 一个墨字键「返回浏览全部 N 套卷」'],
  ['my-space-empty', '个人空间没有文件', 'otter-sit 坐石獭獭 · 主键「去找题」'],
  ['draft-empty', '草稿卷还没有题组（纸上）', '插图 board-list · 主键「去找题」'],
  ['notebook-empty', '生词本还没有卷', '插图 vocabulary-notebook · 主键「去找题」'],
  ['dictation-sets-empty', '单词复习「还没有词组」', '插图 paper-lined · 无动作'],
  ['dictation-tasks-empty', '单词复习「还没有听写」', '插图 paper-lined · 主键「去选词组」'],
  ['home-empty-corpus', '题库一套卷都没有', '插图 question-bank · 无动作'],
  ['draft-rail-empty', '草稿卷左栏「从搜索结果添加题组。」', '没换，只作对照（窄屏左栏收起，只拍宽屏）'],
]

const img = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null)
const fig = (file, cap) => {
  const src = img(file)
  return `<figure>${src ? `<img src="${src}">` : '<div class="none">没拍到</div>'}<figcaption>${cap}</figcaption></figure>`
}
const STYLE = `<style>
  body{margin:0;padding:24px;background:#fff;font:14px/1.5 system-ui,'PingFang SC',sans-serif;color:#1B2B33}
  h1{font-size:18px;margin:0 0 2px}p.note{margin:0 0 16px;color:#5A6C75}
  h2{font-size:15px;margin:20px 0 2px}p.sub{margin:0 0 8px;color:#5A6C75;font-size:13px}
  .g{display:grid;gap:16px;align-items:start}figure{margin:0}
  img{display:block;max-width:100%;border:1px solid #E1E7EA;border-radius:4px}
  figcaption{font-size:12px;color:#5A6C75;padding-top:4px}.none{padding:24px;color:#94A4AC;border:1px dashed #C5D3DA;border-radius:4px}
</style>`

const browser = await chromium.launch({ executablePath: process.env.INVENTORY_CHROMIUM || '/opt/pw-browsers/chromium' })
async function render(html, out, width = 1600) {
  const page = await browser.newPage({ viewport: { width, height: 600 }, deviceScaleFactor: 1 })
  await page.setContent(`${STYLE}${html}`)
  await page.screenshot({ path: out, fullPage: true })
  await page.close()
}
try {
  for (const [id, title, sub] of SCENES) {
    const rows = [1440, 390].map((w) => `<div class="g" style="grid-template-columns:${w === 390 ? '300px 300px' : '1fr 1fr'}">
      ${fig(path.join(DIR, 'before', `${id}-${w}-crop.png`), `before · ${w}`)}
      ${fig(path.join(DIR, 'after', `${id}-${w}-crop.png`), `after · ${w}`)}</div>`).join('')
    await render(`<h1>${title}</h1><p class="note">${sub}。框住空态裁的图，2 倍图按 1 倍显示。</p>${rows}`, path.join(DIR, `compare-${id}.png`))
  }

  const widths = [1440, 390].map((w) => `<h2>${w} 宽</h2><div class="g" style="grid-template-columns:${w === 390 ? '300px 300px' : '1fr 1fr'}">
    ${fig(path.join(DIR, 'after', `home-noresult-${w}-otter110.png`), '獭獭 110 宽（和另外三张半身同宽，头脸小约 14%）')}
    ${fig(path.join(DIR, 'after', `home-noresult-${w}-otter128.png`), '獭獭 128 宽（110 × 1.17，头脸和另外三张半身一样大）· 现在用这个')}</div>`).join('')
  await render(`<h1>「没找到」獭獭多宽</h1><p class="note">同一屏，只改 --eqb-empty-otter-not-found-width。BRAND.md 第 119 条：摊手图 viewBox 更宽，放大约 1.17 倍头脸才和另外三张一样大。</p>${widths}`, path.join(DIR, 'compare-not-found-width.png'))

  const variants = SCENES.filter(([id]) => id !== 'draft-rail-empty')
  const sheet = variants.map(([id, title, sub]) => `<h2>${title}</h2><p class="sub">${sub}</p>
    <div class="g" style="grid-template-columns:1fr 300px">
      ${fig(path.join(DIR, 'after', `${id}-1440-crop.png`), '1440')}
      ${fig(path.join(DIR, 'after', `${id}-390-crop.png`), '390')}</div>`).join('')
  await render(`<h1>空状态：一种写法（shared-ui/EmptyState）</h1>
    <p class="note">本地测试站实拍，换完以后。图 → 一句说明 → 可选一个动作。獭獭只有两处（BRAND.md 第 118 条）：个人空间（坐石）和找题没找到（摊手，卡片边就是水面）；其余是平涂插图。左 1440 宽，右 390 宽。</p>${sheet}`, SHEET)
} finally {
  await browser.close()
}
console.log('写到', path.relative(ROOT, DIR), '和', path.relative(ROOT, SHEET))
