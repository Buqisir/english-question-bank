#!/usr/bin/env node
// 字段构件换上前后对照图：把 field-shots.mjs before / after 拍的同名截图左右排在一页里，浏览器排版后截下来。
// 用法：node scripts/component-inventory/field-compare.mjs（先跑过 field-shots.mjs before 和 after）
// 输出：design/components-2026-11-13/migrate-field/compare-*.png
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, RAW, requireFromApp } from './lib.mjs'

const DIR = path.join(ROOT, 'design/components-2026-11-13/migrate-field')
const img = (label, name) => pathToFileURL(path.join(DIR, label, `${name}.png`)).href

// 每张对照：文件名、标题、说明、几对截图（同名，before / after）、一行放几对。
const SHEETS = [
  ['compare-draft-topbar', '草稿卷顶栏 · 1440', 'PDF 版本：桌色底 Button → 字段样子的下拉触发键（白底细边 8px、右边箭头、标签在左），菜单本身不变；A4 / A3：一排 8px 按钮 → 分段选择（radiogroup，胶囊，选中是一张纸）。', ['draft-topbar'], 1, true],
  ['compare-draft-version', '草稿卷顶栏 · 版本菜单和 A4 / A3 · 1440', '菜单（用不了的照样列出 + 一行原因）沿用共用 Menu，前后一样；变的是触发键和 A4 / A3。', ['draft-version-open', 'draft-form-hover', 'draft-form-focus'], 1],
  ['compare-draft-narrow', '草稿卷 · 390', '原来窄屏上 PDF 版本和 A4 / A3 收进「⋯」面板；现在放在顶栏下面单独一行，右对齐，不点开也看得见。', ['draft-page-390', 'draft-more-panel-390'], 2],
  ['compare-draft-forms', '「⋯」面板 · 1440', '学生、最近草稿卷换成 TextField / SelectField（大号 36，字 14，标签 12 次要灰，焦点墨环）。', ['draft-more-panel', 'draft-more-panel-focus'], 2],
  ['compare-draft-dialog', '「保存 PDF 到个人空间」对话框 · 1440', '文件名、文件夹、新建文件夹换成 TextField / SelectField（大号 36）。', ['draft-space-dialog-focus'], 1, true],
  ['compare-search', '搜索框（这一轮没动，对照证明样子不变）', '首页大搜索框和浏览页紧凑搜索框留到下一轮收进构件，这一轮前后应完全一样。', ['home-search', 'home-search-typed', 'browse-search', 'browse-search-typed'], 2],
]

const { chromium } = requireFromApp('playwright')
const browser = await chromium.launch({ channel: 'chromium' })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  for (const [file, title, note, names, perRow, stack = false] of SHEETS) {
    const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#F3F6F8;font:14px/1.5 Inter,"PingFang SC","Noto Sans CJK SC",sans-serif;color:#1B2B33;width:${perRow === 1 ? 1552 : 1552}px}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#5A6C75;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(${perRow},1fr);gap:20px}
.pair{display:grid;grid-template-columns:${stack ? '1fr' : '1fr 1fr'};gap:8px;background:#fff;border-radius:12px;padding:12px}
.pair h2{grid-column:1/-1;font-size:13px;margin:0;font-weight:600}
figure{margin:0}figcaption{font-size:12px;color:#5A6C75;margin-bottom:4px}img{max-width:100%;display:block;border:1px solid #DCE6EB}
</style><h1>${title}</h1><p>${note}</p><div class="grid">${names.map((n) => `<div class="pair"><h2>${n}</h2><figure><figcaption>之前</figcaption><img src="${img('before', n)}"></figure><figure><figcaption>之后</figcaption><img src="${img('after', n)}"></figure></div>`).join('')}</div>`
    // 对照页是给人看的拼版，颜色写死只在这个脚本里，不进产品代码。
    const htmlFile = path.join(RAW, `${file}.html`)
    writeFileSync(htmlFile, html)
    await page.goto(pathToFileURL(htmlFile).href); await page.waitForLoadState('load')
    await page.screenshot({ path: path.join(DIR, `${file}.png`), fullPage: true })
    console.log(file)
  }
} finally {
  await browser.close()
}
